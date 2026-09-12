// =========================
// routes/ramales.js
// Módulo RAMALES — equipos del día por marca, reparto a cada ramalero,
// devolución a oficina, stock y métricas de tiempo.
//
// Requiere `supabase/ramales.sql`.
//
// EL FLUJO (simplificado el 2026-09-12)
// ─────────────────────────────────────
//   · /lote                  el SUPERVISOR anota los equipos del día:
//                            «día 13 · 30 Jetour · 2 VW»
//   · /lote/:id/repartir     el SUPERVISOR reparte: «Salomón 20 Jetour,
//                            Andy 10 Jetour, Gabriel 2 VW». Aquí arranca
//                            el tiempo de cada uno.
//   · /reparto/:id/devolver  el ramalero (o el supervisor por él) trae lo
//                            armado. Aquí para su tiempo.
//   · /ramalero/:id          el detalle de una persona: tiempos por marca
//                            e historial de repartos.
//
// Antes había un turno rotativo y una revisión cronometrada de la caja
// antes de poder repartir. Se quitó: el taller no lo usaba y el número
// que se quiere mirar es cuánto tarda cada uno en armar. Las columnas de
// revisión y la tabla de rotación siguen en la base (con su histórico),
// pero ya nadie las escribe.
//
// Lo que sí se conserva: el tiempo lo abre quien reparte y lo cierra la
// devolución, así que el ramalero no escribe los dos extremos de su
// propia métrica.
//
// Un día puede traer varias marcas (`ramal_lote_items`) y el reparto
// lleva la marca encima, porque al devolver hay que saber a qué saldo
// sumarle lo armado.
// =========================

import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { requireRol_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { jornadaFecha_ } from "../lib/despacho.js";
import { sendPushToEmails_ } from "../lib/push.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { getConfig_ as getCfgPanel_ } from "../lib/config.js";

const router = Router();

const SB = () => process.env.SUPABASE_URL;

// Cuántos días ve el panel hacia atrás. Es uno o dos por día; 40 cubre
// casi un mes sin que la vista tenga que paginar.
const LIM_LOTES = 40;

// Cuántos repartos trae el detalle de un ramalero. Son uno o dos por día:
// 300 son meses de historia, de sobra para un promedio que diga algo.
const LIM_DETALLE = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sbGet_(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: supabaseHeaders_() });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase GET ${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function sbPost_(table, data) {
  const r = await fetch(`${SB()}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase POST ${table}: ${r.status} ${t.slice(0, 200)}`);
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbPatch_(table, filtro, data) {
  const r = await fetch(`${SB()}/rest/v1/${table}?${filtro}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase PATCH ${table}: ${r.status} ${t.slice(0, 200)}`);
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbDelete_(table, filtro) {
  const r = await fetch(`${SB()}/rest/v1/${table}?${filtro}`, {
    method: "DELETE",
    headers: supabaseHeaders_(),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase DELETE ${table}: ${r.status} ${t.slice(0, 200)}`);
  }
}

async function userPorEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const rows = await sbGet_(
    `usuarios?email=eq.${encodeURIComponent(e)}&select=id,nombre,email,rol,activo&limit=1`,
  );
  return rows[0] || null;
}

function nEntero_(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** «13/09» — el día como se dice en un push. */
function fechaCorta_(fecha) {
  const m = RE_FECHA.exec(String(fecha || ""));
  return m ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : String(fecha || "");
}

/**
 * Un reparto con su día embebido (`select=*,ramal_lotes(codigo,fecha)`)
 * aplanado: la vista necesita «día 13 · 20 JETOUR», no un objeto anidado.
 */
function aplanarLote_(r) {
  const { ramal_lotes: l, ...resto } = r;
  return { ...resto, codigo: l?.codigo || "", fecha: l?.fecha || null };
}

/**
 * Normaliza las líneas de un día: `[{ tipo_ramal, cantidad }]`.
 * Suma las repetidas en vez de dejarlas pasar — la marca aparece una vez
 * por día (índice único del SQL) y dos líneas de lo mismo harían que el
 * arqueo contara doble sin que nada se vea raro.
 */
function normalizarItems_(entrada) {
  const acc = new Map();
  for (const it of Array.isArray(entrada) ? entrada : []) {
    const tipo = String(it?.tipo_ramal || "").trim();
    const cant = nEntero_(it?.cantidad, 0);
    if (!tipo || cant <= 0) continue;
    acc.set(tipo, (acc.get(tipo) || 0) + cant);
  }
  return [...acc].map(([tipo_ramal, cantidad]) => ({ tipo_ramal, cantidad }));
}

/**
 * Reescribe las líneas de un día y deja `cantidad_equipos` igual a su
 * suma. Se hace en un solo sitio porque el total desnormalizado y las
 * líneas tienen que moverse juntos o el arqueo empieza a mentir.
 */
async function guardarItems_(loteId, items) {
  const limpias = normalizarItems_(items);
  await sbDelete_("ramal_lote_items", `lote_id=eq.${loteId}`);
  if (limpias.length) {
    await sbPost_("ramal_lote_items",
      limpias.map(i => ({ lote_id: loteId, tipo_ramal: i.tipo_ramal, cantidad: i.cantidad })));
  }
  return limpias;
}

/**
 * Código legible del día: L-AAMMDD-NN. Sirve para distinguir dos pedidos
 * del mismo día, no como llave — la llave es el UUID. Si dos se registran
 * en el mismo segundo, el índice único del SQL rechaza el segundo.
 */
async function siguienteCodigo_(fecha) {
  const rows = await sbGet_(
    `ramal_lotes?fecha=eq.${fecha}&select=codigo&order=codigo.desc`,
  );
  const yymmdd = String(fecha).slice(2).replace(/-/g, "");
  const usados = new Set(rows.map(r => r.codigo));
  for (let i = 1; i <= 99; i++) {
    const c = `L-${yymmdd}-${String(i).padStart(2, "0")}`;
    if (!usados.has(c)) return c;
  }
  return `L-${yymmdd}-${Date.now() % 1000}`;
}

/**
 * Anota un movimiento en el libro mayor del stock. `cantidad` va con signo.
 *
 * `cantidad: 0` es válido y a propósito: un rechazo o una merma nunca
 * llegaron a entrar al stock, así que no hay saldo que mover — pero el
 * rastro de que existieron sí tiene que quedar.
 */
async function moverStock_(mov) {
  if (mov.cantidad == null) return null;
  return sbPost_("ramal_movimientos", {
    tipo:         mov.tipo,
    tipo_ramal:   mov.tipo_ramal || null,
    cantidad:     mov.cantidad,
    lote_id:      mov.lote_id || null,
    reparto_id:   mov.reparto_id || null,
    solicitud_id: mov.solicitud_id || null,
    user_id:      mov.user_id || null,
    user_nombre:  mov.user_nombre || "",
    destino:      mov.destino || "",
    vin:          mov.vin || null,
    nota:         mov.nota || "",
    created_by:   mov.created_by || "",
  });
}

// ─── PANEL ────────────────────────────────────────────────────────────────────

// GET /api/ramales/panel
// Todo el estado del módulo en una sola respuesta: la vista se pinta de
// un tirón en vez de encadenar cinco fetches (patrón de /api/zonas).
const TOPICS_RAMALES = ["ramales", "ramal", "asignaciones"];

// Se sirve CACHEADO: son varias consultas por pasada y quien tenga el panel
// abierto repite las mismas. El SSE "ramales" borra la entrada en cuanto
// algo cambia de verdad, así que el reparto se sigue viendo al instante.
async function armarPanelRamales_() {
  const [lotes, repartos, items, stock, desempeno, usuarios] = await Promise.all([
    sbGet_(`v_ramal_lote_arqueo?select=*&order=fecha.desc,codigo.desc&limit=${LIM_LOTES}`),
    // Los repartos y las líneas de los días recientes. Se filtran en
    // memoria contra los días traídos: pedir "in.(40 uuids)" por URL es
    // más frágil que traer los últimos y cruzarlos aquí.
    sbGet_("ramal_repartos?select=*&order=asignado_at.desc&limit=600"),
    sbGet_("v_ramal_lote_items?select=*&order=fecha.desc&limit=400"),
    sbGet_("v_ramal_stock?select=*&order=tipo_ramal.asc"),
    // Una fila por usuario con el módulo RAMALERO: es a la vez la lista de
    // gente a quien se reparte y la tabla de métricas.
    sbGet_("v_ramal_desempeno?select=*&order=nombre.asc"),
    sbGet_("usuarios?select=id,nombre,email&activo=eq.true&order=nombre.asc"),
  ]);

  const lotesIds = new Set(lotes.map(l => l.lote_id));
  const nombrePorId = new Map(usuarios.map(u => [u.id, u.nombre]));
  const repartosVis = repartos
    .filter(r => lotesIds.has(r.lote_id))
    .map(r => ({ ...r, nombre: nombrePorId.get(r.user_id) || "—" }));

  return {
    ok: true,
    lotes,
    items: items.filter(i => lotesIds.has(i.lote_id)),
    repartos: repartosVis,
    stock,
    desempeno,
  };
}

router.get("/api/ramales/panel", async (req, res) => {
  try {
    const cfg = await getCfgPanel_();
    const payload = await cachedByTopics_(
      "ramales:panel", TOPICS_RAMALES, cfg.SRV_CACHE_PESADO_MS,
      armarPanelRamales_,
      { bypass: req.query.fresh === "1" },
    );
    return res.json(payload);
  } catch (e) {
    console.error("[GET /api/ramales/panel]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/ramales/mi-panel?email=
// Lo que el ramalero necesita ver en su vista: lo que le repartieron y
// todavía no devuelve.
router.get("/api/ramales/mi-panel", async (req, res) => {
  try {
    const u = await userPorEmail_(req.query.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const pendientes = await sbGet_(
      `ramal_repartos?user_id=eq.${u.id}&devuelto_at=is.null` +
      `&select=*,ramal_lotes(codigo,fecha)&order=asignado_at.desc`,
    );

    return res.json({
      ok: true,
      user: { id: u.id, nombre: u.nombre },
      pendientes: pendientes.map(aplanarLote_),
    });
  } catch (e) {
    console.error("[GET /api/ramales/mi-panel]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/ramales/ramalero/:id — el detalle de una persona.
// Devuelve sus repartos con el día de cada uno; los promedios se sacan en
// el cliente con la misma cuenta que usa `v_ramal_desempeno`, para que el
// número de la lista y el del detalle sean el mismo.
router.get("/api/ramales/ramalero/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!RE_UUID.test(id)) return res.status(400).json({ ok: false, error: "Id inválido" });

    const [us, reps] = await Promise.all([
      sbGet_(`usuarios?id=eq.${id}&select=id,nombre,email&limit=1`),
      sbGet_(
        `ramal_repartos?user_id=eq.${id}&select=*,ramal_lotes(codigo,fecha)` +
        `&order=asignado_at.desc&limit=${LIM_DETALLE}`,
      ),
    ]);
    if (!us[0]) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    return res.json({ ok: true, user: us[0], repartos: reps.map(aplanarLote_) });
  } catch (e) {
    console.error("[GET /api/ramales/ramalero/:id]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── EQUIPOS DEL DÍA · el supervisor manda ────────────────────────────────────

// POST /api/ramales/lote — «día 13: 30 Jetour, 2 VW».
// Body: { email, fecha?, items: [{ tipo_ramal, cantidad }], nota? }
//
// Queda listo para repartir en el acto: no hay turno ni revisión previa.
router.post("/api/ramales/lote", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const b = req.body || {};
    const sup = await userPorEmail_(b.email);

    const items = normalizarItems_(b.items);
    const cantidad = items.reduce((a, i) => a + i.cantidad, 0);
    if (cantidad <= 0) {
      return res.status(400).json({ ok: false, error: "¿Cuántos equipos de qué marca?" });
    }

    // El día lo elige el supervisor: se anota el pedido del 13 aunque se
    // escriba el 12 en la noche. Sin fecha válida, la jornada de hoy.
    const fecha = RE_FECHA.test(String(b.fecha || "")) ? b.fecha : jornadaFecha_();

    const lote = await sbPost_("ramal_lotes", {
      codigo:           await siguienteCodigo_(fecha),
      fecha,
      cantidad_equipos: cantidad,
      estado:           "RECIBIDO",
      nota:             String(b.nota || ""),
      creado_por:       sup?.nombre || "",
    });
    await guardarItems_(lote.id, items);

    emitEvent_("ramales", { accion: "LOTE_NUEVO", id: lote.id });
    return res.json({ ok: true, lote, items });
  } catch (e) {
    console.error("[POST /api/ramales/lote]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/lote/:id/items — corregir los equipos de un día.
// Body: { email, items: [{ tipo_ramal, cantidad }] }
//
// Lo único que no se deja es bajar una marca por debajo de lo que ya se
// repartió de ella — ahí el error está en el reparto o en el conteo, y
// taparlo cambiando el origen borra la pista de cuál de los dos fue.
router.post("/api/ramales/lote/:id/items", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Día no encontrado" });
    if (lote.estado === "CERRADO") {
      return res.status(409).json({ ok: false, error: "Este día ya está cerrado." });
    }

    const items = normalizarItems_(req.body?.items);
    if (!items.length) {
      return res.status(400).json({ ok: false, error: "Tiene que haber al menos una marca." });
    }

    const reps = await sbGet_(`ramal_repartos?lote_id=eq.${id}&select=tipo_ramal,cantidad_asignada`);
    const yaPorTipo = new Map();
    for (const r of reps) {
      const k = r.tipo_ramal || "";
      yaPorTipo.set(k, (yaPorTipo.get(k) || 0) + (r.cantidad_asignada || 0));
    }
    const nuevoPorTipo = new Map(items.map(i => [i.tipo_ramal, i.cantidad]));
    for (const [tipo, ya] of yaPorTipo) {
      if (!tipo) continue;
      const ahora = nuevoPorTipo.get(tipo) || 0;
      if (ahora < ya) {
        return res.status(400).json({
          ok: false,
          error: `De ${tipo} ya se repartieron ${ya}: no puedes dejarlo en ${ahora}.`,
        });
      }
    }

    const limpias = await guardarItems_(id, items);
    const total = limpias.reduce((a, i) => a + i.cantidad, 0);
    await sbPatch_("ramal_lotes", `id=eq.${id}`, {
      cantidad_equipos: total,
      updated_at: new Date().toISOString(),
    });

    emitEvent_("ramales", { accion: "LOTE_ITEMS", id });
    return res.json({ ok: true, items: limpias, cantidad_equipos: total });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/items]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── REPARTO ──────────────────────────────────────────────────────────────────

// POST /api/ramales/lote/:id/repartir — «Salomón 20 Jetour, Gabriel 2 VW».
// Body: { email, repartos: [{ user_id, tipo_ramal, cantidad }] }
//
// Si a alguien ya se le había repartido de este día y esta marca, se le
// SUMA a su fila en lugar de abrir otra: dos filas del mismo trío
// contarían doble en el arqueo y partirían su tiempo promedio a la mitad.
router.post("/api/ramales/lote/:id/repartir", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const sup = await userPorEmail_(req.body?.email);
    const entradas = Array.isArray(req.body?.repartos) ? req.body.repartos : [];

    const [rows, items, previos] = await Promise.all([
      sbGet_(`ramal_lotes?id=eq.${id}&select=*`),
      sbGet_(`ramal_lote_items?lote_id=eq.${id}&select=tipo_ramal,cantidad`),
      sbGet_(`ramal_repartos?lote_id=eq.${id}&select=*`),
    ]);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Día no encontrado" });
    if (lote.estado === "CERRADO") {
      return res.status(409).json({ ok: false, error: "Este día ya está cerrado." });
    }

    const limpias = entradas
      .map(r => ({
        user_id: r.user_id,
        tipo_ramal: r.tipo_ramal || null,
        cantidad: nEntero_(r.cantidad, 0),
      }))
      .filter(r => r.user_id && r.cantidad > 0);
    if (!limpias.length) {
      return res.status(400).json({ ok: false, error: "No hay nada que repartir." });
    }

    // No se puede repartir más de lo que se pidió, Y NO SOLO EN TOTAL: un
    // día con varias marcas cuadra marca por marca. Si llegaron 30 Jetour
    // y se reparten 31, da igual que el total cierre — hay una marca
    // inventada y otra perdida.
    const clave = (t) => t || "";
    const capacidad = new Map(items.map(i => [clave(i.tipo_ramal), i.cantidad]));
    if (!items.length) capacidad.set("", lote.cantidad_equipos - lote.merma);

    const yaPorTipo = new Map();
    for (const p of previos) {
      const k = clave(p.tipo_ramal);
      yaPorTipo.set(k, (yaPorTipo.get(k) || 0) + (p.cantidad_asignada || 0));
    }

    const pidePorTipo = new Map();
    for (const r of limpias) {
      const k = clave(r.tipo_ramal);
      pidePorTipo.set(k, (pidePorTipo.get(k) || 0) + r.cantidad);
    }

    for (const [k, pide] of pidePorTipo) {
      const tope = capacidad.get(k);
      if (tope === undefined) {
        return res.status(400).json({
          ok: false,
          error: `Ese día no se pidió ${k || "esa marca"}.`,
        });
      }
      const libre = tope - (yaPorTipo.get(k) || 0);
      if (pide > libre) {
        return res.status(400).json({
          ok: false,
          error: `De ${k || "ese día"} solo quedan ${libre} sin repartir y estás repartiendo ${pide}.`,
        });
      }
    }

    const ahora = new Date().toISOString();
    const previoPorClave = new Map(previos.map(p => [`${p.user_id}|${clave(p.tipo_ramal)}`, p]));

    for (const r of limpias) {
      const prev = previoPorClave.get(`${r.user_id}|${clave(r.tipo_ramal)}`);
      if (prev) {
        await sbPatch_("ramal_repartos", `id=eq.${prev.id}`, {
          cantidad_asignada: (prev.cantidad_asignada || 0) + r.cantidad,
          updated_at: ahora,
        });
      } else {
        await sbPost_("ramal_repartos", {
          lote_id: id,
          user_id: r.user_id,
          tipo_ramal: r.tipo_ramal,
          cantidad_asignada: r.cantidad,
          asignado_at: ahora,
          asignado_por: sup?.nombre || "",
        });
      }
    }

    await sbPatch_("ramal_lotes", `id=eq.${id}`, { estado: "REPARTIDO", updated_at: ahora });
    emitEvent_("ramales", { accion: "REPARTIDO", id });

    // Un push por persona, no uno por línea: a quien le tocan dos marcas
    // le llega un mensaje con las dos, no dos notificaciones seguidas.
    (async () => {
      const porUser = new Map();
      for (const r of limpias) {
        const arr = porUser.get(r.user_id) || [];
        arr.push(`${r.cantidad} ${r.tipo_ramal || "ramales"}`);
        porUser.set(r.user_id, arr);
      }
      const ids = [...porUser.keys()].join(",");
      const us = await sbGet_(`usuarios?id=in.(${ids})&select=id,email`);
      const porId = new Map(us.map(u => [u.id, u.email]));
      for (const [uid, partes] of porUser) {
        const mail = porId.get(uid);
        if (!mail) continue;
        await sendPushToEmails_([mail], {
          title: "🔩 Te repartieron ramales",
          body:  `Día ${fechaCorta_(lote.fecha)}: ${partes.join(" · ")}.`,
          tag:   "ramal-reparto",
        });
      }
    })().catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/repartir]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/reparto/:id/devolver — el ramalero trae el trabajo.
// Body: { email, cantidad_devuelta, cantidad_rechazada?, nota? }
//
// Lo devuelto SANO entra al stock como movimiento ARMADO, con la marca
// del reparto. `devuelto_at` es el otro extremo del tiempo del ramalero.
router.post("/api/ramales/reparto/:id/devolver", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const u = await userPorEmail_(req.body?.email);
    if (!u) return res.status(403).json({ ok: false, error: "Sesión sin identidad." });

    const rows = await sbGet_(`ramal_repartos?id=eq.${id}&select=*`);
    const rep = rows[0];
    if (!rep) return res.status(404).json({ ok: false, error: "Reparto no encontrado" });
    if (rep.devuelto_at) {
      return res.status(409).json({ ok: false, error: "Esto ya se devolvió." });
    }

    // El supervisor puede cerrar por el ramalero (se fue, se olvidó); un
    // ramalero solo puede cerrar lo suyo.
    const esSupervisor = ["SUPERVISOR", "ADMIN"].includes(String(u.rol || "").toUpperCase());
    if (rep.user_id !== u.id && !esSupervisor) {
      return res.status(403).json({ ok: false, error: "Ese reparto no es tuyo." });
    }

    const devuelta  = nEntero_(req.body?.cantidad_devuelta, 0);
    const rechazada = nEntero_(req.body?.cantidad_rechazada, 0);
    if (devuelta < 0 || rechazada < 0) {
      return res.status(400).json({ ok: false, error: "Las cantidades no pueden ser negativas." });
    }
    if (rechazada > devuelta) {
      return res.status(400).json({ ok: false, error: "No puedes rechazar más de lo que devolviste." });
    }
    // El tope es lo que se le asignó. Sin esto «devolví 8» de un reparto
    // de 6 pasaría sin ruido.
    if (devuelta > rep.cantidad_asignada) {
      return res.status(400).json({
        ok: false,
        error: `Te asignaron ${rep.cantidad_asignada} ramales y estás devolviendo ${devuelta}.`,
      });
    }

    const ahora = new Date().toISOString();
    const lotes = await sbGet_(
      `ramal_lotes?id=eq.${rep.lote_id}&select=id,codigo,fecha,cantidad_equipos,merma,estado`,
    );
    const lote = lotes[0];

    await sbPatch_("ramal_repartos", `id=eq.${id}`, {
      cantidad_devuelta:  devuelta,
      cantidad_rechazada: rechazada,
      devuelto_at:        ahora,
      nota:               String(req.body?.nota || rep.nota || ""),
      updated_at:         ahora,
    });

    // Al stock entra solo lo bueno. Lo rechazado se anota aparte como
    // merma para que no desaparezca del arqueo sin dejar rastro.
    const buenos = devuelta - rechazada;
    if (buenos > 0) {
      await moverStock_({
        tipo: "ARMADO",
        tipo_ramal: rep.tipo_ramal || null,
        cantidad: buenos,
        lote_id: rep.lote_id,
        reparto_id: id,
        user_id: rep.user_id,
        user_nombre: u.id === rep.user_id ? u.nombre : "",
        nota: `Devolución a oficina · día ${fechaCorta_(lote?.fecha)}`,
        created_by: u.nombre,
      });
    }
    if (rechazada > 0) {
      await moverStock_({
        tipo: "MERMA",
        tipo_ramal: rep.tipo_ramal || null,
        cantidad: 0, // ya no entró al stock: se anota como rastro, no resta
        lote_id: rep.lote_id,
        reparto_id: id,
        user_id: rep.user_id,
        nota: `${rechazada} rechazados`,
        created_by: u.nombre,
      });
    }

    // Si con esta devolución el día quedó redondo —todo repartido, todo
    // devuelto, nadie con ramales en la mano— se cierra solo. Cerrar a
    // mano un día que ya cuadra era un clic que no decidía nada. El que no
    // cuadra sigue abierto: ese sí necesita que alguien diga qué pasó.
    let cerrado = false;
    if (lote && lote.estado !== "CERRADO") {
      const reps = await sbGet_(
        `ramal_repartos?lote_id=eq.${lote.id}&select=cantidad_asignada,cantidad_devuelta,devuelto_at`,
      );
      const asig = reps.reduce((a, r) => a + (r.cantidad_asignada || 0), 0);
      const dev  = reps.reduce((a, r) => a + (r.cantidad_devuelta  || 0), 0);
      if (asig > 0 && asig === dev && reps.every(r => r.devuelto_at) &&
          asig === lote.cantidad_equipos - (lote.merma || 0)) {
        await sbPatch_("ramal_lotes", `id=eq.${lote.id}`, {
          estado: "CERRADO",
          cerrado_at: ahora,
          cerrado_por: "automático",
          updated_at: ahora,
        });
        cerrado = true;
      }
    }

    emitEvent_("ramales", { accion: "DEVUELTO", id });
    return res.json({ ok: true, al_stock: buenos, lote_cerrado: cerrado });
  } catch (e) {
    console.error("[POST /api/ramales/reparto/:id/devolver]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── CIERRE ───────────────────────────────────────────────────────────────────

// POST /api/ramales/lote/:id/cerrar — el supervisor cierra un día que no
// se cerró solo. Body: { email, merma?, merma_motivo?, forzar? }
//
// Un día que no cuadra NO se cierra en silencio: o se explica la
// diferencia como merma con motivo, o el supervisor dice `forzar` y queda
// escrito. Un descuadre explicado es información; uno borrado es un agujero.
router.post("/api/ramales/lote/:id/cerrar", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const sup = await userPorEmail_(req.body?.email);
    const merma = nEntero_(req.body?.merma, 0);
    const motivo = String(req.body?.merma_motivo || "");

    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Día no encontrado" });
    if (merma > 0 && !motivo.trim()) {
      return res.status(400).json({ ok: false, error: "Una merma sin motivo escrito no se puede cerrar." });
    }

    const reps = await sbGet_(`ramal_repartos?lote_id=eq.${id}&select=*`);
    const asignados = reps.reduce((a, r) => a + (r.cantidad_asignada || 0), 0);
    const devueltos = reps.reduce((a, r) => a + (r.cantidad_devuelta  || 0), 0);
    const enProceso = asignados - devueltos;
    const sinRepartir = lote.cantidad_equipos - asignados - merma;

    if ((enProceso !== 0 || sinRepartir !== 0) && !req.body?.forzar) {
      return res.status(409).json({
        ok: false,
        motivo: "NO_CUADRA",
        error: `El día no cierra: ${enProceso} sin devolver y ${sinRepartir} sin repartir.`,
        arqueo: { equipos: lote.cantidad_equipos, asignados, devueltos, enProceso, sinRepartir, merma },
      });
    }

    const ahora = new Date().toISOString();
    const out = await sbPatch_("ramal_lotes", `id=eq.${id}`, {
      estado: "CERRADO",
      merma,
      merma_motivo: motivo,
      cerrado_at: ahora,
      cerrado_por: sup?.nombre || "",
      updated_at: ahora,
    });

    if (merma > 0) {
      // La merma es del día, no de una marca: si hay varias no se sabe
      // cuál se rompió salvo que alguien lo escriba. Va sin `tipo_ramal` y
      // con cantidad 0 — es un rastro del faltante, no un saldo.
      await moverStock_({
        tipo: "MERMA",
        cantidad: 0,
        lote_id: id,
        nota: `Merma al cerrar el día ${fechaCorta_(lote.fecha)}: ${motivo}`,
        created_by: sup?.nombre || "",
      });
    }

    emitEvent_("ramales", { accion: "CERRADO", id });
    return res.json({ ok: true, lote: out });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/cerrar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── STOCK ────────────────────────────────────────────────────────────────────

// GET /api/ramales/movimientos?limit=&tipo_ramal=
router.get("/api/ramales/movimientos", async (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, nEntero_(req.query.limit, 60)));
    const filtro = req.query.tipo_ramal
      ? `&tipo_ramal=eq.${encodeURIComponent(req.query.tipo_ramal)}`
      : "";
    const rows = await sbGet_(
      `ramal_movimientos?select=*${filtro}&order=created_at.desc&limit=${limit}`,
    );
    return res.json({ ok: true, movimientos: rows });
  } catch (e) {
    console.error("[GET /api/ramales/movimientos]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/stock/ajuste — conteo físico o merma del almacén.
// Body: { email, tipo_ramal, cantidad (con signo), tipo?, nota }
//
// El ajuste EXIGE motivo. Un saldo que alguien corrigió y nadie sabe por
// qué es peor que el saldo equivocado: al menos ese se podía investigar.
router.post("/api/ramales/stock/ajuste", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const b = req.body || {};
    const sup = await userPorEmail_(b.email);
    const cantidad = nEntero_(b.cantidad, 0);
    const nota = String(b.nota || "").trim();
    if (!b.tipo_ramal) return res.status(400).json({ ok: false, error: "Falta el tipo de ramal." });
    if (!cantidad)     return res.status(400).json({ ok: false, error: "El ajuste no puede ser 0." });
    if (!nota)         return res.status(400).json({ ok: false, error: "Escribe el motivo del ajuste." });

    const mov = await moverStock_({
      tipo:       b.tipo === "MERMA" ? "MERMA" : "AJUSTE",
      tipo_ramal: b.tipo_ramal,
      cantidad,
      nota,
      created_by: sup?.nombre || "",
    });
    emitEvent_("ramales", { accion: "AJUSTE" });
    return res.json({ ok: true, movimiento: mov });
  } catch (e) {
    console.error("[POST /api/ramales/stock/ajuste]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/stock/minimo — punto de pedido por tipo.
router.post("/api/ramales/stock/minimo", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.tipo_ramal) return res.status(400).json({ ok: false, error: "Falta el tipo de ramal." });
    const out = await sbPatch_("ramal_stock_config", `tipo_ramal=eq.${encodeURIComponent(b.tipo_ramal)}`, {
      stock_minimo: Math.max(0, nEntero_(b.stock_minimo, 0)),
      ubicacion:    String(b.ubicacion ?? ""),
      updated_at:   new Date().toISOString(),
    });
    emitEvent_("ramales", { accion: "STOCK_CONFIG" });
    return res.json({ ok: true, config: out });
  } catch (e) {
    console.error("[POST /api/ramales/stock/minimo]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
