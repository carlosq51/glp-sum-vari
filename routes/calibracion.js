// =========================
// routes/calibracion.js
// Calibración STAG iniciada desde la vista de Calidad.
//
// Requiere `supabase/migrations/013_calibraciones.sql`.
//
// QUIÉN HABLA CON QUIÉN
// ─────────────────────
// La calibración la hace stag-auto (Python, repo carlosq51/stag-auto) en la
// laptop que está conectada al carro. El servidor está en Render y no puede
// llegar a esa laptop, así que es ella la que pregunta cada 2 s (latido):
//
//   App Calidad ──POST /api/calibracion──▶ servidor ◀──latido── laptop
//                                          (cola en memoria + fila en BD)
//   App Calidad ◀─GET /api/calibracion/:id─ servidor ◀─progreso── laptop
//
//   · GET  /api/calibracion/preparar?vin=   para el modal: ¿laptop en línea?,
//                                            mapas que tiene, mapa sugerido
//                                            para el modelo, última del carro
//   · POST /api/calibracion                  el inspector la pide (VIN + km + mapa)
//   · GET  /api/calibracion/:id              avance en vivo (el modal lo pide cada 1.5 s)
//   · POST /api/calibracion/:id/comando      responder a una pregunta, pausar, detener, cancelar
//   · POST /api/calibracion/agente/latido    laptop: "estoy viva, estos son mis mapas"
//                                            → le toca el trabajo pendiente y los comandos
//   · POST /api/calibracion/:id/progreso     laptop: estado del paso, valores, pregunta, fin
//
// POR QUÉ EN MEMORIA
// El avance cambia varias veces por segundo (presión, G1–G4). Escribirlo en
// Supabase sería un PATCH por segundo durante 10 min por carro. Vive aquí;
// a la base va solo el pedido, cada cambio de paso y el resumen final. Si el
// servidor reinicia en medio, la laptop vuelve a mandar su estado en el
// siguiente progreso y el registro se rehace (ver progreso).
// =========================

import { Router } from "express";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { requireRol_, getUsuarioByEmail_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { normalizeModelo_ } from "../lib/utils.js";
import { sendPushToEmails_ } from "../lib/push.js";

const router = Router();
const TABLA = "calibraciones";

// Sin latido en este tiempo, la laptop se da por apagada o sin internet.
const AGENTE_VIVO_MS = 15_000;
// Un pedido que la laptop no tomó en este tiempo se cancela solo: si no, la
// laptop al prender arrancaría una calibración de hace dos horas.
const PENDIENTE_MAX_MS = 10 * 60_000;
// Lo terminado se queda en memoria un rato para que el modal muestre el final.
const TERMINADA_EN_MEMORIA_MS = 60 * 60_000;
// EN_CURSO sin avance de la laptop en este tiempo = se cortó (apagada, sin red).
const EN_CURSO_MUDA_MS = 3 * 60_000;
// Si la laptop dice que corre otra cosa (o nada), lo EN_CURSO anterior se da
// por interrumpido pasado este margen (el primer avance tarda ~1 s).
const INTERRUMPIDA_MARGEN_MS = 8_000;

const ABIERTAS = new Set(["PENDIENTE", "EN_CURSO"]);
const FINALES = new Set(["TERMINADA", "DETENIDA", "CANCELADA", "ERROR"]);

const s_ = (v) => String(v ?? "").trim();
const emailDe_ = (req) => s_(req.body?.email || req.query?.email || req.get("x-user-email")).toLowerCase();

async function sb_(path, { method = "GET", body } = {}) {
  const h = supabaseServiceHeaders_();
  if (!h) throw new Error("Supabase no configurado (.env)");
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: body ? { ...h, Prefer: "return=representation" } : h,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

function mensajeUtil_(err) {
  const m = String(err?.message || err || "");
  if (/relation .*calibraciones.* does not exist|42P01/i.test(m)) {
    return "Falta correr supabase/migrations/013_calibraciones.sql en Supabase.";
  }
  return m || "Error inesperado";
}

// ── Estado en memoria ────────────────────────────────────────────────────
// agente: la laptop. Una sola: hay un solo equipo de calibración.
const agente_ = { visto: 0, equipo: "", email: "", mapas: [], ocupado: false, version: "", commit: "" };
// Último latido RECHAZADO (403 de requireRol_, error interno). Sin esto el
// celular solo decía "Laptop sin conexión" y no había forma de saber si la
// laptop no llegaba o llegaba con un correo sin permiso (glp.json).
const rechazo_ = { at: 0, email: "", error: "" };
const ARRANQUE_AT = Date.now();
// id → { fila (lo de la BD), vivo (lo último que mandó la laptop), comandos[] }
const trabajos_ = new Map();
let cargado_ = false;

const agenteEnLinea_ = () => Date.now() - agente_.visto < AGENTE_VIVO_MS;

/** Al arrancar el servidor: lo que quedó abierto en la BD vuelve a la memoria. */
async function cargar_() {
  if (cargado_) return;
  cargado_ = true;
  try {
    const filas = await sb_(`${TABLA}?select=*&estado=in.(PENDIENTE,EN_CURSO)&order=created_at.asc`);
    for (const f of filas || []) if (!trabajos_.has(f.id)) trabajos_.set(f.id, { fila: f, vivo: null, comandos: [] });
  } catch (err) {
    cargado_ = false;   // se reintenta en la próxima petición
    console.warn("[calibracion] cargar:", err.message);
  }
}

/** Limpia: cancela pendientes viejos y suelta de memoria lo terminado hace rato. */
async function limpiar_() {
  const ahora = Date.now();
  for (const [id, t] of trabajos_) {
    const est = t.fila.estado;
    if (est === "PENDIENTE" && ahora - Date.parse(t.fila.created_at) > PENDIENTE_MAX_MS) {
      await cambiarEstado_(t, "CANCELADA", { resumen: { motivo: "La laptop no la tomó en 10 min" } }).catch(() => {});
    } else if (est === "EN_CURSO" && ahora - ultimoAvance_(t) > EN_CURSO_MUDA_MS) {
      await interrumpir_(t, "La laptop dejó de mandar el avance (se apagó o perdió internet).");
    } else if (FINALES.has(est) && ahora - Date.parse(t.fila.updated_at || t.fila.created_at) > TERMINADA_EN_MEMORIA_MS) {
      trabajos_.delete(id);
    }
  }
}

/** Última vez que la laptop dijo algo de esta calibración. */
function ultimoAvance_(t) {
  return t.vivo?.at || Date.parse(t.fila.iniciada_at || t.fila.created_at) || 0;
}

/**
 * Cierra una EN_CURSO que la laptop ya no está corriendo. Sin esto, si la
 * laptop se reiniciaba a mitad, el celular seguía mostrando el último paso
 * (p. ej. el 10) aunque la laptop estuviera empezando de nuevo en el 1.
 */
async function interrumpir_(t, motivo) {
  if (t.fila.estado !== "EN_CURSO") return;
  console.warn(`[calibracion] ${t.fila.vin.slice(-8)} interrumpida: ${motivo}`);
  await cambiarEstado_(t, "ERROR", { resumen: { ...(t.fila.resumen || {}), error: motivo, interrumpida: true } }).catch(() => {});
  avisarFin_(t).catch(() => {});
}

/** Las que empezó alguien en la misma laptop no mandan avisos a ningún celular. */
const esLocal_ = (f) => f?.resumen?.origen === "laptop";

async function cambiarEstado_(t, estado, extra = {}) {
  const patch = { estado, ...extra };
  if (estado === "EN_CURSO" && !t.fila.iniciada_at) patch.iniciada_at = new Date().toISOString();
  if (FINALES.has(estado)) patch.terminada_at = new Date().toISOString();
  Object.assign(t.fila, patch, { updated_at: new Date().toISOString() });
  try {
    await sb_(`${TABLA}?id=eq.${t.fila.id}`, { method: "PATCH", body: patch });
  } catch (err) {
    console.warn("[calibracion] PATCH estado:", err.message);
  }
  emitEvent_("calibracion", { id: t.fila.id, vin: t.fila.vin, estado });
}

/** Lo que ve la app. */
function vista_(t) {
  const f = t.fila;
  return {
    id: f.id, vin: f.vin, kilometraje: f.kilometraje, mapa: f.mapa, modelo: f.modelo,
    estado: f.estado, paso_actual: f.paso_actual, solicitado_por: f.solicitado_por,
    created_at: f.created_at, iniciada_at: f.iniciada_at, terminada_at: f.terminada_at,
    resumen: f.resumen || {},
    vivo: t.vivo || null,
    agente: agenteDiag_(),
  };
}

/** El trabajo abierto (pendiente o en curso), si hay. Uno a la vez: una laptop. */
function abierto_() {
  for (const t of trabajos_.values()) if (ABIERTAS.has(t.fila.estado)) return t;
  return null;
}

async function trabajo_(id) {
  await cargar_();
  if (trabajos_.has(id)) return trabajos_.get(id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const filas = await sb_(`${TABLA}?select=*&id=eq.${id}&limit=1`);
  if (!filas?.[0]) return null;
  const t = { fila: filas[0], vivo: null, comandos: [] };
  trabajos_.set(id, t);
  return t;
}

async function modeloDe_(vin) {
  const filas = await sb_(`vins?select=modelo&vin=eq.${encodeURIComponent(vin)}&limit=1`);
  return normalizeModelo_(filas?.[0]?.modelo) || null;
}

/**
 * El mapa que conviene para ese modelo: el último que se usó con él y que la
 * laptop todavía tiene. Sin historia, el primero cuyo nombre se parece al
 * modelo (X70, V7…).
 */
async function mapaSugerido_(modelo) {
  const mapas = agente_.mapas || [];
  if (!modelo || !mapas.length) return "";
  try {
    const usados = await sb_(`${TABLA}?select=mapa&modelo=eq.${encodeURIComponent(modelo)}` +
      `&estado=eq.TERMINADA&order=created_at.desc&limit=10`);
    for (const u of usados || []) if (mapas.includes(u.mapa)) return u.mapa;
  } catch { /* sin historia: por nombre */ }
  const fichas = modelo.toUpperCase().split(/[\s/-]+/).filter(p => p.length >= 2 && !/^(JETOUR|KYC)$/.test(p));
  const norm = (x) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return mapas.find(m => fichas.some(f => norm(m).includes(norm(f)))) || "";
}

// ─────────────────────────────────────────────────────────────────────────
//  App
// ─────────────────────────────────────────────────────────────────────────

router.get("/api/calibracion/preparar", async (req, res) => {
  try {
    const u = await getUsuarioByEmail_(emailDe_(req));
    if (!u?.activo) return res.status(403).json({ ok: false, error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar." });
    await cargar_();
    await limpiar_();
    const vin = s_(req.query.vin).toUpperCase();
    const modelo = vin ? await modeloDe_(vin).catch(() => null) : null;
    let ultima = null;
    if (vin) {
      const enMem = [...trabajos_.values()].filter(t => t.fila.vin === vin)
        .sort((a, b) => Date.parse(b.fila.created_at) - Date.parse(a.fila.created_at))[0];
      if (enMem) ultima = vista_(enMem);
      else {
        const filas = await sb_(`${TABLA}?select=*&vin=eq.${encodeURIComponent(vin)}&order=created_at.desc&limit=1`);
        if (filas?.[0]) ultima = vista_({ fila: filas[0], vivo: null });
      }
    }
    const ab = abierto_();
    res.json({
      ok: true,
      agente: {
        ...agenteDiag_(), mapas: agente_.mapas,
        ocupado: agente_.ocupado || !!ab,
        ocupadoCon: ab ? { id: ab.fila.id, vin: ab.fila.vin, estado: ab.fila.estado } : null,
      },
      modelo,
      mapaSugerido: await mapaSugerido_(modelo),
      ultima,
    });
  } catch (err) {
    console.error("[calibracion] preparar:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

/**
 * Admin → Calibraciones: las calibraciones cerradas de un rango de días, con
 * solo lo que hace falta para los números (lib/calibracion-stats.js). Va
 * ANTES de /api/calibracion/:id, que si no se queda con "estadisticas".
 * ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (días de Perú, ambos incluidos).
 */
router.get("/api/calibracion/estadisticas", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const dia = (x) => /^\d{4}-\d{2}-\d{2}$/.test(s_(x)) ? s_(x) : "";
    const desde = dia(req.query.desde) || "2020-01-01";
    const hasta = dia(req.query.hasta) || new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    // Día de Perú = UTC−5 todo el año (sin horario de verano).
    const ini = new Date(`${desde}T00:00:00-05:00`).toISOString();
    const fin = new Date(Date.parse(`${hasta}T00:00:00-05:00`) + 86400_000).toISOString();
    const filas = await sb_(`${TABLA}?select=id,vin,modelo,mapa,kilometraje,estado,solicitado_por,created_at,iniciada_at,terminada_at,resumen` +
      `&estado=in.(TERMINADA,DETENIDA,ERROR,CANCELADA)` +
      `&created_at=gte.${encodeURIComponent(ini)}&created_at=lt.${encodeURIComponent(fin)}` +
      `&order=created_at.asc&limit=5000`);
    const num = (x) => Number.isFinite(+x) ? +x : null;
    const out = (filas || []).map(f => {
      const r = f.resumen || {};
      return {
        id: f.id, vin: f.vin, modelo: f.modelo, mapa: f.mapa, km: f.kilometraje, estado: f.estado,
        solicitado_por: f.solicitado_por, created_at: f.created_at, iniciada_at: f.iniciada_at, terminada_at: f.terminada_at,
        origen: r.origen || null,                     // null = pedida desde la app; "laptop"; "historial"
        total_s: num(r.total_s), desde: num(r.desde),
        esperas: r.esperas && typeof r.esperas === "object" ? r.esperas : null,
        splits: Array.isArray(r.splits) ? r.splits.map(x => ({ i: num(x?.i), paso: s_(x?.paso), seg: num(x?.seg), estado: s_(x?.estado) })) : [],
        fotos: num(r.fotos), presion: num(r.presion_final),
        alertas: Array.isArray(r.alertas) ? r.alertas.length : 0,
        error: s_(r.error || r.motivo).slice(0, 160) || null,
        interrumpida: !!r.interrumpida,
      };
    });
    res.json({ ok: true, desde, hasta, filas: out, agente: agenteDiag_(), limite: out.length >= 5000 });
  } catch (err) {
    console.error("[calibracion] estadisticas:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

router.post("/api/calibracion", async (req, res) => {
  try {
    // Cualquiera con cuenta activa, como la hoja CC: el inspector no siempre
    // tiene rol CALIDAD.
    const u = await getUsuarioByEmail_(emailDe_(req));
    if (!u?.activo) return res.status(403).json({ ok: false, error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar." });

    const vin = s_(req.body?.vin).toUpperCase();
    const km = s_(req.body?.kilometraje).replace(/[.,\s]/g, "");
    const mapa = s_(req.body?.mapa);
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return res.status(400).json({ ok: false, error: "El VIN tiene que tener 17 caracteres." });
    if (!/^\d{1,7}$/.test(km)) return res.status(400).json({ ok: false, error: "Kilometraje inválido: solo números." });

    await cargar_();
    await limpiar_();
    if (!agenteEnLinea_()) {
      return res.status(409).json({ ok: false, error: "La laptop de calibración no está conectada. Revisa que esté prendida y con stag-auto abierto." });
    }
    if (!agente_.mapas.includes(mapa)) return res.status(400).json({ ok: false, error: "Elige un mapa (.set) de los que tiene la laptop." });
    const ab = abierto_();
    if (ab || agente_.ocupado) {
      return res.status(409).json({
        ok: false,
        error: ab ? `La laptop está ocupada con ${ab.fila.vin.slice(-8)} (${ab.fila.estado === "PENDIENTE" ? "por empezar" : "calibrando"}).`
                  : "La laptop está ocupada con una calibración que se empezó allí.",
        ocupadoCon: ab ? ab.fila.id : null,
      });
    }

    const modelo = await modeloDe_(vin).catch(() => null);
    const creadas = await sb_(TABLA, {
      method: "POST",
      body: { vin, kilometraje: Number(km), mapa, modelo, solicitado_por: u.email },
    });
    const fila = Array.isArray(creadas) ? creadas[0] : creadas;
    const t = { fila, vivo: null, comandos: [] };
    trabajos_.set(fila.id, t);
    emitEvent_("calibracion", { id: fila.id, vin, estado: "PENDIENTE" });
    res.json({ ok: true, calibracion: vista_(t) });
  } catch (err) {
    console.error("[calibracion] POST:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

router.get("/api/calibracion/:id", async (req, res) => {
  try {
    const t = await trabajo_(s_(req.params.id));
    if (!t) return res.status(404).json({ ok: false, error: "No encuentro esa calibración." });
    res.json({ ok: true, calibracion: vista_(t) });
  } catch (err) {
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

router.post("/api/calibracion/:id/comando", async (req, res) => {
  try {
    const u = await getUsuarioByEmail_(emailDe_(req));
    if (!u?.activo) return res.status(403).json({ ok: false, error: "Tu sesión no envió tu identidad." });
    const t = await trabajo_(s_(req.params.id));
    if (!t) return res.status(404).json({ ok: false, error: "No encuentro esa calibración." });
    const accion = s_(req.body?.accion);
    if (!ABIERTAS.has(t.fila.estado)) return res.status(409).json({ ok: false, error: "Esa calibración ya terminó." });

    // Todavía no la tomó la laptop: se cancela aquí mismo.
    if (t.fila.estado === "PENDIENTE" && (accion === "cancelar" || accion === "detener")) {
      await cambiarEstado_(t, "CANCELADA", { resumen: { motivo: `Cancelada por ${u.email}` } });
      return res.json({ ok: true, calibracion: vista_(t) });
    }
    if (!["responder", "pausa", "detener"].includes(accion)) return res.status(400).json({ ok: false, error: "Acción no válida." });

    const cmd = { accion, por: u.email, at: Date.now() };
    if (accion === "responder") {
      const p = t.vivo?.pregunta;
      const opcion = s_(req.body?.opcion);
      if (!p || Number(req.body?.pregunta) !== p.n) return res.status(409).json({ ok: false, error: "Esa pregunta ya se respondió en la laptop." });
      if (!p.opciones.includes(opcion)) return res.status(400).json({ ok: false, error: "Opción no válida." });
      Object.assign(cmd, { pregunta: p.n, opcion });
    }
    t.comandos.push(cmd);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  Laptop (stag-auto/glp_puente.py). Con el correo de un ADMIN o
//  SUPERVISOR o CALIDAD (son los de Calidad quienes la usan).
// ─────────────────────────────────────────────────────────────────────────

/** Anota cómo terminó cada latido: si lo rechazan, el modal dice por qué. */
function anotarLatido_(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) {
      Object.assign(rechazo_, { at: Date.now(), email: emailDe_(req), error: s_(body?.error).slice(0, 200) || `HTTP ${res.statusCode}` });
      console.warn(`[calibracion] latido rechazado (${res.statusCode}) de ${rechazo_.email || "sin correo"}: ${rechazo_.error}`);
    }
    return json(body);
  };
  next();
}

/** Lo que el modal necesita para explicar el estado de la laptop. */
function agenteDiag_() {
  const ahora = Date.now();
  return {
    enLinea: agenteEnLinea_(),
    equipo: agente_.equipo,
    version: agente_.version,
    commit: agente_.commit,
    vistoHaceS: agente_.visto ? Math.round((ahora - agente_.visto) / 1000) : null,
    // Un rechazo cuenta solo si es posterior al último latido bueno.
    rechazo: rechazo_.at > agente_.visto && ahora - rechazo_.at < 10 * 60_000
      ? { haceS: Math.round((ahora - rechazo_.at) / 1000), email: rechazo_.email, error: rechazo_.error }
      : null,
    servidorDesdeS: Math.round((ahora - ARRANQUE_AT) / 1000),
  };
}

router.post("/api/calibracion/agente/latido", anotarLatido_, requireRol_("ADMIN", "SUPERVISOR", "CALIDAD"), async (req, res) => {
  try {
    await cargar_();
    const b = req.body || {};
    Object.assign(agente_, {
      visto: Date.now(),
      email: emailDe_(req),
      equipo: s_(b.equipo).slice(0, 60),
      mapas: Array.isArray(b.mapas) ? b.mapas.map(s_).filter(Boolean).slice(0, 500) : agente_.mapas,
      ocupado: !!b.ocupado,
      version: s_(b.version).slice(0, 20),
      // Commit de stag-auto que corre en la laptop: así se ve desde aquí si ya
      // le llegó la última versión (vigilante.pyw hace git pull solo).
      commit: s_(b.commit).slice(0, 12),
    });
    await limpiar_();

    // La laptop (puente v2+) dice qué calibración corre ahora. Lo EN_CURSO
    // que no sea esa se cortó allá: se reinició el programa o se empezó otra.
    if ("actual" in b) {
      const actual = s_(b.actual);
      for (const t of trabajos_.values()) {
        if (t.fila.estado === "EN_CURSO" && t.fila.id !== actual
            && Date.now() - ultimoAvance_(t) > INTERRUMPIDA_MARGEN_MS) {
          await interrumpir_(t, actual ? "Se empezó otra calibración en la laptop." : "El programa de la laptop se cerró o se reinició a mitad.");
        }
      }
    }

    // El trabajo que le toca: el pendiente más viejo, si la laptop está libre.
    let trabajo = null;
    if (!b.ocupado) {
      const pend = [...trabajos_.values()].filter(t => t.fila.estado === "PENDIENTE")
        .sort((a, c) => Date.parse(a.fila.created_at) - Date.parse(c.fila.created_at))[0];
      if (pend) {
        const f = pend.fila;
        trabajo = { id: f.id, vin: f.vin, kilometraje: f.kilometraje, mapa: f.mapa, solicitado_por: f.solicitado_por };
      }
    }

    // Comandos de la app para lo que está corriendo (responder, pausa, detener).
    const comandos = [];
    for (const t of trabajos_.values()) {
      if (t.comandos.length) {
        for (const c of t.comandos) comandos.push({ id: t.fila.id, ...c });
        t.comandos = [];
      }
    }
    res.json({ ok: true, trabajo, comandos });
  } catch (err) {
    console.error("[calibracion] latido:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

/**
 * Paso que empieza → aviso al celular de quien la pidió. "Pasar a gas…" es el
 * paso anterior a encender: avisa con tiempo para que camine al carro.
 */
const AVISO_PASO = {
  "Pasar a gas y borrar errores": { title: "🚶 Ve al carro", body: "En unos segundos hay que encenderlo.", vibrate: [200, 100, 200] },
  "Encender el carro": { title: "🔑 Enciende el carro", body: "La laptop está esperando que arranque.", vibrate: [600, 200, 600, 200, 600], fuerte: true },
  "Regular presión 1.25": { title: "🔧 Regula el reductor", body: "Lleva la presión a 1.25 bar. La ves en vivo en el celular.", vibrate: [600, 200, 600], fuerte: true },
};

/**
 * Calibración empezada en la misma laptop (no desde la app). Se registra para
 * que el celular la vea al abrir ese carro y no muestre una anterior.
 * VIN: 17 caracteres o los últimos 8 (se busca en vins).
 */
router.post("/api/calibracion/agente/local", requireRol_("ADMIN", "SUPERVISOR", "CALIDAD"), async (req, res) => {
  try {
    await cargar_();
    const b = req.body || {};
    let vin = s_(b.vin).toUpperCase().replace(/\s/g, "");
    const km = Number(s_(b.kilometraje).replace(/[.,\s]/g, ""));
    if (!Number.isFinite(km) || km < 0) return res.status(400).json({ ok: false, error: "Kilometraje inválido." });
    if (/^[A-Z0-9]{8}$/.test(vin)) {
      const filas = await sb_(`vins?select=vin&vin=like.*${encodeURIComponent(vin)}&limit=2`);
      if (filas?.length !== 1) {
        return res.json({ ok: false, error: filas?.length ? "Hay más de un carro con esos 8 caracteres." : "No encuentro ese VIN en GLP." });
      }
      vin = filas[0].vin;
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return res.status(400).json({ ok: false, error: "VIN inválido." });

    // Lo que estuviera abierto queda atrás: la laptop ya está en otra.
    for (const t of trabajos_.values()) {
      if (t.fila.estado === "PENDIENTE") await cambiarEstado_(t, "CANCELADA", { resumen: { motivo: "Se empezó otra calibración en la laptop." } });
      else if (t.fila.estado === "EN_CURSO") await interrumpir_(t, "Se empezó otra calibración en la laptop.");
    }

    const modelo = await modeloDe_(vin).catch(() => null);
    const creadas = await sb_(TABLA, {
      method: "POST",
      body: {
        vin, kilometraje: Math.round(km), mapa: s_(b.mapa).slice(0, 200), modelo,
        solicitado_por: emailDe_(req), estado: "EN_CURSO", iniciada_at: new Date().toISOString(),
        resumen: { origen: "laptop", equipo: s_(b.equipo).slice(0, 60) },
      },
    });
    const fila = Array.isArray(creadas) ? creadas[0] : creadas;
    const t = { fila, vivo: null, comandos: [] };
    trabajos_.set(fila.id, t);
    emitEvent_("calibracion", { id: fila.id, vin, estado: "EN_CURSO" });
    res.json({ ok: true, id: fila.id, vin });
  } catch (err) {
    console.error("[calibracion] local:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// Una línea de ejecuciones.jsonl y una fila de la BD son la misma calibración
// si el carro coincide y terminaron con esta diferencia como mucho.
const HISTORIAL_MISMA_MS = 3 * 60_000;

/**
 * La laptop manda las líneas de su ejecuciones.jsonl (una por calibración
 * terminada o detenida, con tiempos por paso y por bolsa). glp_puente.py las
 * manda solas: las de antes de conectar la laptop con la app la primera vez,
 * y luego cada calibración nueva al terminar, también las que se perdieron
 * porque no había internet. Lo que ya está en la BD (mandado por el puente
 * al terminar, o en un envío anterior) se reconoce y se salta: mandar dos
 * veces lo mismo no duplica nada.
 *
 * body: { ejecuciones: [{fecha, vin8, km, mapa, desde, completo, total, esperas, splits, avisos, alertas}], tz: "-0500" }
 */
router.post("/api/calibracion/agente/historial", requireRol_("ADMIN", "SUPERVISOR", "CALIDAD"), async (req, res) => {
  try {
    const b = req.body || {};
    const lista = Array.isArray(b.ejecuciones) ? b.ejecuciones.slice(0, 200) : [];
    // La laptop escribe la hora local sin zona; manda su desfase ("-0500").
    const tz = /^[+-]\d{4}$/.test(s_(b.tz)) ? `${s_(b.tz).slice(0, 3)}:${s_(b.tz).slice(3)}` : "-05:00";
    const items = [];
    let invalidas = 0;
    for (const e of lista) {
      const vin8 = s_(e?.vin8).toUpperCase();
      const fin = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s_(e?.fecha)) ? s_(e?.fecha) : `${s_(e?.fecha)}${tz}`);
      const total = Number(e?.total);
      if (!/^[A-Z0-9]{8}$/.test(vin8) || !Number.isFinite(fin) || !Number.isFinite(total) || total < 0) { invalidas++; continue; }
      items.push({ e, vin8, fin, total });
    }
    if (!items.length) return res.json({ ok: true, nuevas: 0, repetidas: 0, invalidas });

    // Lo que ya está en la BD alrededor de esas horas.
    const tMin = new Date(Math.min(...items.map(x => x.fin)) - 86400_000).toISOString();
    const tMax = new Date(Math.max(...items.map(x => x.fin)) + 86400_000).toISOString();
    const existentes = await sb_(`${TABLA}?select=id,vin,estado,created_at,iniciada_at,terminada_at,resumen` +
      `&or=(terminada_at.gte.${encodeURIComponent(tMin)},terminada_at.is.null)&created_at=lt.${encodeURIComponent(tMax)}` +
      `&estado=neq.CANCELADA&order=created_at.desc&limit=5000`);
    // El mismo carro calibrándose en horas que se cruzan es la misma calibración.
    const igual_ = (x) => (existentes || []).find(f => {
      if (!s_(f.vin).endsWith(x.vin8)) return false;
      const a = Date.parse(f.iniciada_at || f.created_at);
      const z = f.terminada_at ? Date.parse(f.terminada_at) : a + x.total * 1000;
      return a - HISTORIAL_MISMA_MS <= x.fin && z + HISTORIAL_MISMA_MS >= x.fin - x.total * 1000;
    });
    // Y dentro del mismo envío, por si la laptop repite una línea.
    const vistos = new Set();
    const nuevas = [], completar = [];
    for (const x of items) {
      const k = `${x.vin8}|${Math.round(x.fin / 60_000)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      const f = igual_(x);
      if (!f) nuevas.push(x);
      // Está, pero sin tiempos (se cortó la red al final, o se dio por
      // interrumpida): la laptop sí la midió completa.
      else if (!(Number(f.resumen?.total_s) > 0)) completar.push({ f, x });
    }

    const num = (x) => Number.isFinite(+x) ? +x : null;
    const resumenDe_ = ({ e, total }) => ({
      equipo: s_(b.equipo).slice(0, 60),
      total_s: Math.round(total), desde: num(e.desde) ?? 1,
      esperas: e.esperas && typeof e.esperas === "object" ? e.esperas : {},
      splits: Array.isArray(e.splits) ? e.splits.slice(0, 40) : [],
      avisos: Array.isArray(e.avisos) ? e.avisos.slice(0, 20) : [],
      alertas: Array.isArray(e.alertas) ? e.alertas.slice(0, 20) : [],
    });

    for (const { f, x } of completar) {
      const patch = {
        resumen: { ...(f.resumen || {}), ...resumenDe_(x), completada_desde_laptop: true },
        terminada_at: new Date(x.fin).toISOString(),
      };
      if (x.e.completo) patch.estado = "TERMINADA";
      await sb_(`${TABLA}?id=eq.${f.id}`, { method: "PATCH", body: patch }).catch(err => console.warn("[calibracion] historial completar:", err.message));
      const t = trabajos_.get(f.id);
      if (t) Object.assign(t.fila, patch);
    }
    if (!nuevas.length) {
      return res.json({ ok: true, nuevas: 0, completadas: completar.length, repetidas: items.length - completar.length, invalidas });
    }

    // VIN completo y modelo desde vins (la laptop solo guarda los últimos 8).
    const vin8s = [...new Set(nuevas.map(x => x.vin8))];
    const porVin8 = new Map();
    for (let i = 0; i < vin8s.length; i += 40) {
      const or = vin8s.slice(i, i + 40).map(v => `vin.like.*${v}`).join(",");
      const filas = await sb_(`vins?select=vin,modelo&or=(${encodeURIComponent(or)})&limit=500`).catch(() => []);
      for (const f of filas || []) {
        const k = s_(f.vin).slice(-8).toUpperCase();
        // Dos carros con los mismos 8 últimos: no se adivina cuál.
        porVin8.set(k, porVin8.has(k) ? null : f);
      }
    }

    const filasNuevas = nuevas.map((x) => {
      const { e, vin8, fin, total } = x;
      const v = porVin8.get(vin8);
      const ini = new Date(fin - total * 1000).toISOString();
      return {
        vin: v?.vin || vin8,
        kilometraje: Math.max(0, Math.round(num(s_(e.km).replace(/[.,\s]/g, "")) || 0)),
        mapa: s_(e.mapa).slice(0, 200) || "—",
        modelo: normalizeModelo_(v?.modelo) || null,
        estado: e.completo ? "TERMINADA" : "DETENIDA",
        solicitado_por: emailDe_(req),
        created_at: ini, iniciada_at: ini, terminada_at: new Date(fin).toISOString(),
        resumen: { origen: "historial", ...resumenDe_(x) },
      };
    });
    await sb_(TABLA, { method: "POST", body: filasNuevas });
    const repetidas = items.length - filasNuevas.length - completar.length;
    console.log(`[calibracion] historial: ${filasNuevas.length} nuevas, ${completar.length} completadas, ${repetidas} repetidas`);
    res.json({ ok: true, nuevas: filasNuevas.length, completadas: completar.length, repetidas, invalidas });
  } catch (err) {
    console.error("[calibracion] historial:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

/**
 * La laptop manda su estado. `estado`: EN_CURSO mientras trabaja; TERMINADA,
 * DETENIDA o ERROR al final (con `resumen`). `rechazada` = no la pudo
 * empezar (AC STAG en otra cosa, mapa que ya no está…).
 */
router.post("/api/calibracion/:id/progreso", requireRol_("ADMIN", "SUPERVISOR", "CALIDAD"), async (req, res) => {
  try {
    const t = await trabajo_(s_(req.params.id));
    if (!t) return res.status(404).json({ ok: false, error: "No encuentro esa calibración." });
    agente_.visto = Date.now();
    const b = req.body || {};
    const estado = s_(b.estado).toUpperCase();
    if (!["EN_CURSO", ...FINALES].includes(estado)) return res.status(400).json({ ok: false, error: "Estado no válido." });

    // Lo en vivo, recortado: es lo que el celular pinta.
    const pasos = Array.isArray(b.pasos) ? b.pasos.slice(0, 30).map(p => ({
      nombre: s_(p?.nombre).slice(0, 60), estado: s_(p?.estado).slice(0, 10),
      seg: Number.isFinite(+p?.seg) ? +p.seg : null, record: Number.isFinite(+p?.record) ? +p.record : null,
    })) : [];
    const pr = b.pregunta && Array.isArray(b.pregunta.opciones)
      ? { n: Number(b.pregunta.n) || 0, texto: s_(b.pregunta.texto).slice(0, 600), opciones: b.pregunta.opciones.map(s_).slice(0, 4), color: s_(b.pregunta.color).slice(0, 10) }
      : null;
    const previa = t.vivo?.pregunta?.n;
    t.vivo = {
      at: Date.now(),
      pasos,
      paso: s_(b.paso).slice(0, 60),
      banner: s_(b.banner).slice(0, 600),
      color: s_(b.color).slice(0, 10),
      valores: (b.valores && typeof b.valores === "object") ? b.valores : {},
      avisos: Array.isArray(b.avisos) ? b.avisos.slice(-5).map(x => s_(x).slice(0, 200)) : [],
      logs: Array.isArray(b.logs) ? b.logs.slice(-6).map(x => s_(x).slice(0, 200)) : [],
      pregunta: pr,
      pausado: !!b.pausado,
      total: Number(b.total) || 0,
    };

    const extra = {};
    if (t.vivo.paso && t.vivo.paso !== t.fila.paso_actual) extra.paso_actual = t.vivo.paso;
    if (FINALES.has(estado) && b.resumen && typeof b.resumen === "object") {
      extra.resumen = esLocal_(t.fila) ? { ...b.resumen, origen: "laptop" } : b.resumen;
    }

    if (estado !== t.fila.estado || FINALES.has(estado)) {
      if (!FINALES.has(t.fila.estado)) {
        await cambiarEstado_(t, estado, extra);
        if (FINALES.has(estado)) avisarFin_(t).catch(() => {});
      }
    } else if (extra.paso_actual) {
      Object.assign(t.fila, extra);
      sb_(`${TABLA}?id=eq.${t.fila.id}`, { method: "PATCH", body: extra }).catch(e => console.warn("[calibracion] paso:", e.message));
    }

    // Pasos del técnico: el aviso le llega al celular apenas empiezan, para
    // que no pierda tiempo esperando frente a la laptop.
    if (extra.paso_actual && estado === "EN_CURSO" && !esLocal_(t.fila)) {
      const aviso = AVISO_PASO[extra.paso_actual];
      if (aviso) {
        sendPushToEmails_([t.fila.solicitado_por], {
          title: `${aviso.title} · ${t.fila.vin.slice(-8)}`, body: aviso.body,
          tag: `calib-paso-${t.fila.id}`, vibrate: aviso.vibrate, requireInteraction: !!aviso.fuerte,
          data: { url: "/" },
        }).catch(() => {});
      }
    }

    // Pregunta nueva en la laptop (falta de gas, paso que falló): suena en
    // el celular de quien la pidió, que puede estar lejos de la pantalla.
    if (pr && pr.n !== previa && !esLocal_(t.fila)) {
      sendPushToEmails_([t.fila.solicitado_por], {
        title: `⚠ Calibración ${t.fila.vin.slice(-8)}`,
        body: pr.texto.split("\n").filter(Boolean).slice(0, 2).join(" · "),
        tag: `calib-${t.fila.id}`,
        vibrate: [500, 200, 500, 200, 800],
        requireInteraction: true,
        data: { url: "/" },
      }).catch(() => {});
    }

    // ¿Pidieron detener desde la app mientras tanto? Va en la respuesta
    // también, por si el latido tarda.
    res.json({ ok: true, estado: t.fila.estado });
  } catch (err) {
    console.error("[calibracion] progreso:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

async function avisarFin_(t) {
  const f = t.fila;
  if (esLocal_(f)) return;
  const r = f.resumen || {};
  const txt = {
    TERMINADA: `✔ Terminada${r.total_s ? ` en ${Math.round(r.total_s / 60)} min` : ""}${r.fotos != null ? ` · ${r.fotos}/5 fotos` : ""}`,
    DETENIDA: "■ Detenida en la laptop",
    ERROR: `✘ Error: ${s_(r.error).slice(0, 120)}`,
    CANCELADA: "Cancelada",
  }[f.estado] || f.estado;
  await sendPushToEmails_([f.solicitado_por], {
    title: `Calibración ${f.vin.slice(-8)}`,
    body: txt,
    tag: `calib-${f.id}`,
    vibrate: [300, 100, 300],
    data: { url: "/" },
  });
}

export default router;
