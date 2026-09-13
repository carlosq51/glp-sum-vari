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
//   · /reparto/:id/editar    el SUPERVISOR corrige un reparto que todavía no
//                            se devolvió: otra cantidad u otra persona.
//   · /ramalero/:id          el detalle de una persona: tiempos por marca
//                            e historial de repartos.
//   · /mi-produccion         lo que un ramalero devolvió en un rango de
//                            fechas — con eso justifica su producción.
//
// FECHAS: el panel, el detalle y la producción van por RANGO (desde/hasta,
// por el día del lote). Sin rango, los últimos RAMALES_RANGO_DIAS. Los días
// que siguen abiertos entran siempre, caigan donde caigan: son trabajo
// pendiente y no pueden desaparecer por mirar otra semana.
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
import { fechaPeruMenosDias_ } from "../lib/utils.js";

const router = Router();

const SB = () => process.env.SUPABASE_URL;

// Los que REPARTEN. No arman: un ADMIN puede tener el módulo RAMALERO para
// entrar a esa vista, pero no es alguien a quien se le reparte ni cuya
// producción se mide. Es la misma lista que autoriza repartir.
const ROLES_QUE_REPARTEN = ["SUPERVISOR", "ADMIN"];

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
 * El rango de fechas pedido (`?desde=&hasta=`, días del lote), validado.
 * Sin fechas válidas, los últimos RAMALES_RANGO_DIAS contando hoy. Si vienen
 * al revés se voltean: es un error de dedo, no algo que haya que rechazar.
 * @returns {Promise<{desde:string, hasta:string} | {error:string}>}
 */
async function rangoDe_(q = {}) {
  const cfg = await getCfgPanel_();
  const valida = (f) => RE_FECHA.test(String(f || ""));
  let hasta = valida(q.hasta) ? q.hasta : fechaPeruMenosDias_(0);
  let desde = valida(q.desde) ? q.desde : fechaPeruMenosDias_(Math.max(1, cfg.RAMALES_RANGO_DIAS) - 1);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1;
  if (dias > cfg.RAMALES_RANGO_MAX_DIAS) {
    return { error: `Elige un rango de hasta ${cfg.RAMALES_RANGO_MAX_DIAS} días.` };
  }
  return { desde, hasta };
}

/** Los repartos de una persona cuyos días caen en el rango, con su día. */
async function repartosDeEnRango_(userId, { desde, hasta }) {
  const reps = await sbGet_(
    `ramal_repartos?user_id=eq.${userId}&select=*,ramal_lotes!inner(codigo,fecha)` +
    `&ramal_lotes.fecha=gte.${desde}&ramal_lotes.fecha=lte.${hasta}&order=asignado_at.desc`,
  );
  return reps.map(aplanarLote_);
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

// GET /api/ramales/panel?desde=&hasta=
// Todo el estado del módulo en una sola respuesta: la vista se pinta de
// un tirón en vez de encadenar cinco fetches (patrón de /api/zonas).
const TOPICS_RAMALES = ["ramales", "ramal", "asignaciones"];

// Los días que entran al panel: los del rango y, siempre, los abiertos.
// El mismo `or` sirve para las vistas de lotes y, embebido, para repartos.
function filtroDias_(desde, hasta) {
  return `(and(fecha.gte.${desde},fecha.lte.${hasta}),estado.neq.CERRADO)`;
}

// Se sirve CACHEADO, una entrada por rango: son varias consultas por pasada
// y quien tenga el panel abierto repite las mismas. El SSE "ramales" borra
// todas las entradas en cuanto algo cambia, así que el reparto se sigue
// viendo al instante.
async function armarPanelRamales_(desde, hasta) {
  const dias = filtroDias_(desde, hasta);
  const [lotes, items, repartos, abiertos, stock, desempeno, usuarios] = await Promise.all([
    sbGet_(`v_ramal_lote_arqueo?select=*&or=${dias}&order=fecha.desc,codigo.desc`),
    sbGet_(`v_ramal_lote_items?select=*&or=${dias}`),
    // Los repartos de esos mismos días. El filtro va sobre el día embebido
    // y `!inner` hace que recorte a la fila de reparto.
    sbGet_(`ramal_repartos?select=*,ramal_lotes!inner(fecha,estado)&ramal_lotes.or=${dias}&order=asignado_at.desc`),
    // Lo que cada uno tiene en la mano AHORA, sea del día que sea: un
    // reparto viejo que nadie devolvió también está en su mesa.
    sbGet_("ramal_repartos?devuelto_at=is.null&select=user_id,tipo_ramal,cantidad_asignada,cantidad_devuelta"),
    sbGet_("v_ramal_stock?select=*&order=tipo_ramal.asc"),
    // Todo usuario con el módulo RAMALERO…
    sbGet_("v_ramal_desempeno?select=user_id,nombre&order=nombre.asc"),
    sbGet_("usuarios?select=id,nombre,rol&activo=eq.true"),
  ]);

  const porId = new Map(usuarios.map(u => [u.id, u]));
  // …menos los que reparten (ver ROLES_QUE_REPARTEN).
  const ramaleros = desempeno.filter(d =>
    !ROLES_QUE_REPARTEN.includes(String(porId.get(d.user_id)?.rol || "").toUpperCase()));

  return {
    ok: true,
    desde,
    hasta,
    lotes,
    items,
    repartos: repartos.map(({ ramal_lotes: l, ...r }) => ({
      ...r,
      fecha: l?.fecha || null,
      nombre: porId.get(r.user_id)?.nombre || "—",
    })),
    abiertos,
    stock,
    ramaleros,
  };
}

router.get("/api/ramales/panel", async (req, res) => {
  try {
    const rango = await rangoDe_(req.query);
    if (rango.error) return res.status(400).json({ ok: false, error: rango.error });
    const cfg = await getCfgPanel_();
    const payload = await cachedByTopics_(
      `ramales:panel:${rango.desde}:${rango.hasta}`, TOPICS_RAMALES, cfg.SRV_CACHE_PESADO_MS,
      () => armarPanelRamales_(rango.desde, rango.hasta),
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

// GET /api/ramales/ramalero/:id?desde=&hasta= — el detalle de una persona
// en el rango. Devuelve sus repartos con el día de cada uno; los promedios
// se sacan en el cliente con la misma cuenta que la lista del panel, para
// que el número de la lista y el del detalle sean el mismo.
router.get("/api/ramales/ramalero/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!RE_UUID.test(id)) return res.status(400).json({ ok: false, error: "Id inválido" });
    const rango = await rangoDe_(req.query);
    if (rango.error) return res.status(400).json({ ok: false, error: rango.error });

    const [us, reps] = await Promise.all([
      sbGet_(`usuarios?id=eq.${id}&select=id,nombre,email&limit=1`),
      repartosDeEnRango_(id, rango),
    ]);
    if (!us[0]) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    return res.json({ ok: true, user: us[0], ...rango, repartos: reps });
  } catch (e) {
    console.error("[GET /api/ramales/ramalero/:id]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/ramales/mi-produccion?email=&desde=&hasta=
// Lo que el ramalero recibió y devolvió en un rango: con esto justifica su
// producción. Es el mismo detalle que ve el supervisor, pedido por email
// porque su vista no conoce su id — así los dos miran el mismo número.
router.get("/api/ramales/mi-produccion", async (req, res) => {
  try {
    const u = await userPorEmail_(req.query.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    const rango = await rangoDe_(req.query);
    if (rango.error) return res.status(400).json({ ok: false, error: rango.error });

    const repartos = await repartosDeEnRango_(u.id, rango);
    return res.json({ ok: true, ...rango, repartos });
  } catch (e) {
    console.error("[GET /api/ramales/mi-produccion]", e.message);
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

    // A quien ya devolvió su parte de esa marca no se le puede sumar: su
    // fila está cerrada y lo que entró al stock ya se contó. Sumarle más
    // dejaría una devolución que al repetirse metería esos ramales dos
    // veces. Pasa sobre todo después de corregir un reparto y volver a
    // repartir lo que quedó libre.
    for (const r of limpias) {
      const prev = previoPorClave.get(`${r.user_id}|${clave(r.tipo_ramal)}`);
      if (prev?.devuelto_at) {
        const us = await sbGet_(`usuarios?id=eq.${r.user_id}&select=nombre&limit=1`);
        return res.status(409).json({
          ok: false,
          error: `${us[0]?.nombre || "Esa persona"} ya devolvió su parte de ${r.tipo_ramal || "este día"}: dáselo a otra persona.`,
        });
      }
    }

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

// POST /api/ramales/reparto/:id/editar — corregir un reparto mal hecho.
// Body: { email, cantidad, user_id? }
//
// «Le di 20 a Salomón y eran 15», «esos 10 eran de Andy, no de Gabriel».
// Solo mientras NO se haya devuelto: después ya entró al stock, y cambiarle
// el número reescribiría una devolución que el ramalero firmó.
//
// `cantidad: 0` quita el reparto. Pasarlo a alguien que ya tiene de esa
// marca ese día lo SUMA a su fila (mismo motivo que en /repartir). El
// reloj no se toca: el ramal salió de oficina cuando salió; lo que estaba
// mal era el papel, no la hora.
router.post("/api/ramales/reparto/:id/editar", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!RE_UUID.test(id)) return res.status(400).json({ ok: false, error: "Id inválido" });

    const cantidad = nEntero_(req.body?.cantidad, -1);
    if (cantidad < 0) {
      return res.status(400).json({ ok: false, error: "La cantidad no puede ser negativa." });
    }

    const rows = await sbGet_(`ramal_repartos?id=eq.${id}&select=*`);
    const rep = rows[0];
    if (!rep) return res.status(404).json({ ok: false, error: "Reparto no encontrado" });
    if (rep.devuelto_at) {
      return res.status(409).json({ ok: false, error: "Ese reparto ya se devolvió: ya no se puede cambiar." });
    }

    const destino = String(req.body?.user_id || rep.user_id);
    if (!RE_UUID.test(destino)) return res.status(400).json({ ok: false, error: "Persona inválida" });

    const [lotes, items, previos] = await Promise.all([
      sbGet_(`ramal_lotes?id=eq.${rep.lote_id}&select=*`),
      sbGet_(`ramal_lote_items?lote_id=eq.${rep.lote_id}&select=tipo_ramal,cantidad`),
      sbGet_(`ramal_repartos?lote_id=eq.${rep.lote_id}&select=*`),
    ]);
    const lote = lotes[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Día no encontrado" });
    if (lote.estado === "CERRADO") {
      return res.status(409).json({ ok: false, error: "Este día ya está cerrado." });
    }

    // El mismo tope que al repartir, marca por marca: lo que se pidió de
    // esa marca menos lo que tienen los DEMÁS.
    const marca = rep.tipo_ramal || null;
    const tope = items.length
      ? (items.find(i => i.tipo_ramal === marca)?.cantidad ?? 0)
      : lote.cantidad_equipos - (lote.merma || 0);
    const otros = previos
      .filter(p => p.id !== id && (p.tipo_ramal || null) === marca)
      .reduce((a, p) => a + (p.cantidad_asignada || 0), 0);
    if (otros + cantidad > tope) {
      return res.status(400).json({
        ok: false,
        error: `De ${marca || "ese día"} se pidieron ${tope} y los demás ya tienen ${otros}: ` +
               `como máximo puedes poner ${Math.max(0, tope - otros)}.`,
      });
    }

    const mueve = destino !== rep.user_id;
    const fila = mueve
      ? previos.find(p => p.user_id === destino && (p.tipo_ramal || null) === marca)
      : null;
    if (fila?.devuelto_at && cantidad > 0) {
      return res.status(409).json({
        ok: false,
        error: "Esa persona ya devolvió su parte de esta marca: pásaselo a otra.",
      });
    }

    const ahora = new Date().toISOString();
    if (cantidad === 0) {
      await sbDelete_("ramal_repartos", `id=eq.${id}`);
    } else if (fila) {
      await sbPatch_("ramal_repartos", `id=eq.${fila.id}`, {
        cantidad_asignada: (fila.cantidad_asignada || 0) + cantidad,
        updated_at: ahora,
      });
      await sbDelete_("ramal_repartos", `id=eq.${id}`);
    } else {
      await sbPatch_("ramal_repartos", `id=eq.${id}`, {
        user_id: destino,
        cantidad_asignada: cantidad,
        updated_at: ahora,
      });
    }

    // Si ya no le queda reparto a nadie, el día vuelve a estar sin repartir.
    const quedan = previos.filter(p => p.id !== id).length + (cantidad > 0 && !fila ? 1 : 0);
    await sbPatch_("ramal_lotes", `id=eq.${lote.id}`, {
      estado: quedan ? "REPARTIDO" : "RECIBIDO",
      updated_at: ahora,
    });

    emitEvent_("ramales", { accion: "REPARTO_EDITADO", id });

    // Al que le pasaron ramales que no esperaba se le avisa, igual que en
    // un reparto normal. Al que se los quitaron le basta con verlo: su
    // panel se refresca solo por el SSE.
    if (mueve && cantidad > 0) {
      (async () => {
        const us = await sbGet_(`usuarios?id=eq.${destino}&select=email&limit=1`);
        if (!us[0]?.email) return;
        await sendPushToEmails_([us[0].email], {
          title: "🔩 Te pasaron ramales",
          body:  `Día ${fechaCorta_(lote.fecha)}: ${cantidad} ${marca || "ramales"}.`,
          tag:   "ramal-reparto",
        });
      })().catch(() => {});
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/ramales/reparto/:id/editar]", e.message);
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
