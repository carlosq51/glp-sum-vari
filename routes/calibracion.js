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
const agente_ = { visto: 0, equipo: "", email: "", mapas: [], ocupado: false, version: "" };
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
    } else if (FINALES.has(est) && ahora - Date.parse(t.fila.updated_at || t.fila.created_at) > TERMINADA_EN_MEMORIA_MS) {
      trabajos_.delete(id);
    }
  }
}

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
    agente: { enLinea: agenteEnLinea_(), equipo: agente_.equipo },
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
        enLinea: agenteEnLinea_(), equipo: agente_.equipo, mapas: agente_.mapas,
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
//  SUPERVISOR, como el agente de la impresora.
// ─────────────────────────────────────────────────────────────────────────

router.post("/api/calibracion/agente/latido", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
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
    });
    await limpiar_();

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
 * La laptop manda su estado. `estado`: EN_CURSO mientras trabaja; TERMINADA,
 * DETENIDA o ERROR al final (con `resumen`). `rechazada` = no la pudo
 * empezar (AC STAG en otra cosa, mapa que ya no está…).
 */
router.post("/api/calibracion/:id/progreso", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
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
    if (FINALES.has(estado) && b.resumen && typeof b.resumen === "object") extra.resumen = b.resumen;

    if (estado !== t.fila.estado || FINALES.has(estado)) {
      if (!FINALES.has(t.fila.estado)) {
        await cambiarEstado_(t, estado, extra);
        if (FINALES.has(estado)) avisarFin_(t).catch(() => {});
      }
    } else if (extra.paso_actual) {
      Object.assign(t.fila, extra);
      sb_(`${TABLA}?id=eq.${t.fila.id}`, { method: "PATCH", body: extra }).catch(e => console.warn("[calibracion] paso:", e.message));
    }

    // Pregunta nueva en la laptop (falta de gas, paso que falló): suena en
    // el celular de quien la pidió, que puede estar lejos de la pantalla.
    if (pr && pr.n !== previa) {
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
