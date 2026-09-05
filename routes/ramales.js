// =========================
// routes/ramales.js
// Módulo RAMALES — turno rotativo, desembalaje cronometrado por el
// supervisor, reparto, devolución a oficina y stock de ramales armados.
//
// Requiere `supabase/ramales.sql`.
//
// LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO
// ───────────────────────────────────────
// Ningún número que mide a alguien lo escribe esa misma persona.
//
//   · /lote           lo crea el SUPERVISOR y ahí arranca el cronómetro
//   · /fin-desembalaje lo marca el RAMALERO, pero es un aviso, no el reloj
//   · /cables          lo confirma el SUPERVISOR y ESO cierra el reloj
//   · /repartir        lo firma el SUPERVISOR (cuántos a cada uno)
//   · /devolver        lo cierra el RAMALERO contra lo que le asignaron
//
// Por eso los endpoints están partidos así y no en uno solo «guardar
// lote»: la separación de quién puede escribir qué ES el control.
//
// La auditoría es POR LOTE, no por unidad: no hay QR ni etiqueta en el
// ramal. Lo que entró en la caja tiene que aparecer repartido, devuelto
// o como merma con motivo. Ver `v_ramal_lote_arqueo` en el SQL.
// =========================

import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { requireRol_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { jornadaFecha_ } from "../lib/despacho.js";
import { sendPushToEmails_ } from "../lib/push.js";

const router = Router();

const SB = () => process.env.SUPABASE_URL;

// Cuántos lotes ve el panel hacia atrás. El trabajo del día son 1-3 cajas;
// 40 cubre casi un mes sin que la vista tenga que paginar.
const LIM_LOTES = 40;

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

/**
 * Código legible del lote: L-AAMMDD-NN. Se usa para hablar de la caja en
 * voz alta ("el L-260904-02"), no como llave — la llave es el UUID.
 * El correlativo se calcula contando los lotes del día; si dos cajas se
 * registran en el mismo segundo el índice único del SQL rechaza la
 * segunda y el reintento le da el número siguiente.
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
 * A quién le toca. La rotación NO es un puntero circular: es «el que
 * menos veces le tocó, y a igualdad el que hace más tiempo que no le
 * toca» (ese orden ya lo hace la vista v_ramal_rotacion).
 *
 * Encima de eso se filtra por quién marcó asistencia hoy. Saltarse al
 * que faltó no le «debe» un turno: su contador se queda atrás y mañana
 * entra primero solo. Es la diferencia entre rotar y repartir parejo.
 *
 * Si nadie marcó asistencia (taller sin módulo de despacho, o aún es
 * temprano) devuelve la lista completa en vez de nada: sugerir a alguien
 * que quizá no vino es mejor que no sugerir y obligar a elegir a ciegas.
 *
 * @param {"desembalaje"|"revision"} tarea
 */
async function candidatosTurno_(tarea = "desembalaje") {
  const rot = await sbGet_("v_ramal_rotacion?select=*");
  if (!rot.length) return { candidatos: [], sugerido: null, filtradoPorAsistencia: false };

  // La vista ordena por desembalaje. Para revisión se reordena aquí con
  // el mismo criterio pero sobre los contadores de revisión.
  const orden = tarea === "revision"
    ? [...rot].sort((a, b) =>
        (a.veces_revision - b.veces_revision) ||
        (new Date(a.ultima_revision || 0) - new Date(b.ultima_revision || 0)) ||
        (a.orden - b.orden))
    : rot;

  let presentes = null;
  try {
    const fecha = jornadaFecha_();
    const asis = await sbGet_(
      `asistencia_jornada?jornada_fecha=eq.${fecha}&estado=neq.FUERA&select=user_id`,
    );
    if (asis.length) presentes = new Set(asis.map(a => a.user_id));
  } catch {
    // Sin módulo de despacho no hay asistencia que consultar: la rotación
    // sigue funcionando, solo que sin saltarse a quien no vino.
  }

  const conPresencia = orden.map(r => ({
    ...r,
    presente: presentes ? presentes.has(r.user_id) : null,
  }));
  const elegibles = presentes
    ? conPresencia.filter(r => r.presente)
    : conPresencia;

  return {
    candidatos: conPresencia,
    sugerido: (elegibles[0] || conPresencia[0] || null),
    filtradoPorAsistencia: !!presentes,
  };
}

/** Suma un turno cumplido al historial de rotación. */
async function anotarTurno_(userId, tarea) {
  if (!userId) return;
  const rows = await sbGet_(
    `ramal_rotacion?user_id=eq.${userId}&select=veces_desembalaje,veces_revision`,
  );
  const actual = rows[0];
  const ahora = new Date().toISOString();
  const patch = tarea === "revision"
    ? { veces_revision: (actual?.veces_revision || 0) + 1, ultima_revision: ahora, updated_at: ahora }
    : { veces_desembalaje: (actual?.veces_desembalaje || 0) + 1, ultimo_desembalaje: ahora, updated_at: ahora };

  if (actual) {
    await sbPatch_("ramal_rotacion", `user_id=eq.${userId}`, patch);
  } else {
    // Un ramalero que nunca entró a la tabla (se le dio el módulo hoy) no
    // puede quedar fuera del historial solo por eso: se crea al vuelo.
    await sbPost_("ramal_rotacion", { user_id: userId, ...patch });
  }
}

/**
 * Anota un movimiento en el libro mayor del stock. `cantidad` va con signo.
 *
 * `cantidad: 0` es válido y a propósito: un rechazo en revisión o la merma
 * de una caja nunca llegaron a entrar al stock, así que no hay saldo que
 * mover — pero el rastro de que existieron sí tiene que quedar. Un faltante
 * sin fila es un faltante que nadie puede investigar después.
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
// un tirón en vez de encadenar seis fetches (patrón de /api/zonas).
router.get("/api/ramales/panel", async (req, res) => {
  try {
    const [lotes, repartos, rot, stock, desempeno, ramaleros] = await Promise.all([
      sbGet_(`v_ramal_lote_arqueo?select=*&order=fecha.desc,codigo.desc&limit=${LIM_LOTES}`),
      // Los repartos de los lotes recientes. Se filtra en memoria contra
      // los lotes traídos: pedir "in.(40 uuids)" por URL es más frágil que
      // traer los últimos y cruzarlos aquí.
      sbGet_("ramal_repartos?select=*&order=asignado_at.desc&limit=400"),
      candidatosTurno_("desembalaje"),
      sbGet_("v_ramal_stock?select=*&order=tipo_ramal.asc"),
      sbGet_("v_ramal_desempeno?select=*"),
      sbGet_("usuarios?select=id,nombre,email&activo=eq.true&order=nombre.asc"),
    ]);

    const rotRev = await candidatosTurno_("revision");

    const lotesIds = new Set(lotes.map(l => l.lote_id));
    const nombrePorId = new Map(ramaleros.map(u => [u.id, u.nombre]));
    const repartosVis = repartos
      .filter(r => lotesIds.has(r.lote_id))
      .map(r => ({ ...r, nombre: nombrePorId.get(r.user_id) || "—" }));

    return res.json({
      ok: true,
      lotes,
      repartos: repartosVis,
      rotacion: rot.candidatos,
      sugerido_desembalaje: rot.sugerido,
      sugerido_revision: rotRev.sugerido,
      filtrado_por_asistencia: rot.filtradoPorAsistencia,
      stock,
      desempeno,
      usuarios: ramaleros,
    });
  } catch (e) {
    console.error("[GET /api/ramales/panel]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/ramales/mi-panel?email=
// Lo que el ramalero necesita ver en su vista: si le toca turno, qué
// lote tiene abierto y qué ramales le deben devolución.
router.get("/api/ramales/mi-panel", async (req, res) => {
  try {
    const u = await userPorEmail_(req.query.email);
    if (!u) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const [lotes, misRepartos, rot] = await Promise.all([
      sbGet_(
        `ramal_lotes?select=*&estado=in.(RECIBIDO,DESEMBALANDO,DESEMBALADO,REPARTIDO)` +
        `&order=created_at.desc&limit=10`,
      ),
      sbGet_(`ramal_repartos?user_id=eq.${u.id}&devuelto_at=is.null&select=*&order=asignado_at.desc`),
      candidatosTurno_("desembalaje"),
    ]);

    const codigoPorLote = new Map(lotes.map(l => [l.id, l.codigo]));
    return res.json({
      ok: true,
      user: { id: u.id, nombre: u.nombre },
      // El lote donde ESTE ramalero es el encargado y el reloj corre.
      mi_desembalaje: lotes.find(
        l => l.encargado_user_id === u.id && l.estado === "DESEMBALANDO",
      ) || null,
      mi_revision: lotes.find(
        l => l.revisor_user_id === u.id && !l.revision_fin_at,
      ) || null,
      pendientes: misRepartos.map(r => ({ ...r, codigo: codigoPorLote.get(r.lote_id) || "" })),
      me_toca: rot.sugerido?.user_id === u.id,
      siguiente_turno: rot.sugerido?.nombre || "",
    });
  } catch (e) {
    console.error("[GET /api/ramales/mi-panel]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── LOTES · el supervisor manda ──────────────────────────────────────────────

// POST /api/ramales/lote — llegó una caja.
// Body: { email, cantidad_equipos, tipo_ramal?, encargado_user_id?,
//         revisor_user_id?, nota?, iniciar? }
//
// `iniciar` (default true) arranca el cronómetro en el mismo acto de
// registrar la caja: es lo que hace que el reloj lo abra el supervisor y
// no el ramalero. Se puede registrar sin iniciar para dejar la caja
// anotada y arrancarla cuando el encargado esté frente a ella.
router.post("/api/ramales/lote", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const b = req.body || {};
    const sup = await userPorEmail_(b.email);
    const cantidad = nEntero_(b.cantidad_equipos, 0);
    if (cantidad <= 0) {
      return res.status(400).json({ ok: false, error: "¿Cuántos equipos trajo la caja?" });
    }

    const { sugerido } = await candidatosTurno_("desembalaje");
    // Si el supervisor no elige a nadie, manda el turno. Si elige, manda
    // él — pero queda escrito a quién le tocaba, para que «se respeta la
    // rotación» sea una afirmación verificable y no una promesa.
    const encargado = b.encargado_user_id || sugerido?.user_id || null;
    const iniciar = b.iniciar !== false;
    const ahora = new Date().toISOString();
    const fecha = jornadaFecha_();

    const lote = await sbPost_("ramal_lotes", {
      codigo:                await siguienteCodigo_(fecha),
      fecha,
      cantidad_equipos:      cantidad,
      tipo_ramal:            b.tipo_ramal || null,
      estado:                iniciar && encargado ? "DESEMBALANDO" : "RECIBIDO",
      encargado_user_id:     encargado,
      encargado_sugerido_id: sugerido?.user_id || null,
      desembalaje_inicio_at:  iniciar && encargado ? ahora : null,
      desembalaje_inicio_por: iniciar && encargado ? (sup?.nombre || "") : "",
      revisor_user_id:       b.revisor_user_id || null,
      nota:                  String(b.nota || ""),
      creado_por:            sup?.nombre || "",
    });

    emitEvent_("ramales", { accion: "LOTE_NUEVO", id: lote.id });

    // Al encargado le avisamos al celular: el turno no sirve de nada si se
    // entera media hora después porque nadie le fue a decir.
    if (encargado && iniciar) {
      (async () => {
        const rows = await sbGet_(`usuarios?id=eq.${encargado}&select=email`);
        const mail = rows[0]?.email;
        if (!mail) return;
        await sendPushToEmails_([mail], {
          title: "📦 Te toca desembalar",
          body:  `Caja ${lote.codigo} — ${cantidad} equipos. Tu tiempo ya está corriendo.`,
          tag:   "ramal-turno",
        });
      })().catch(() => { /* el push nunca rompe el registro de la caja */ });
    }

    return res.json({ ok: true, lote, sugerido: sugerido || null });
  } catch (e) {
    console.error("[POST /api/ramales/lote]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/lote/:id/iniciar — el supervisor arranca el reloj.
// Solo el supervisor: es la mitad de la medición que no puede estar en
// manos del medido.
router.post("/api/ramales/lote/:id/iniciar", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const sup = await userPorEmail_(req.body?.email);
    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Lote no encontrado" });
    if (lote.desembalaje_inicio_at) {
      return res.status(409).json({ ok: false, error: "Este lote ya tiene el tiempo corriendo." });
    }

    const encargado = req.body?.encargado_user_id || lote.encargado_user_id;
    if (!encargado) {
      return res.status(400).json({ ok: false, error: "Falta decir quién desembala." });
    }

    const out = await sbPatch_("ramal_lotes", `id=eq.${id}`, {
      estado: "DESEMBALANDO",
      encargado_user_id: encargado,
      desembalaje_inicio_at: new Date().toISOString(),
      desembalaje_inicio_por: sup?.nombre || "",
      updated_at: new Date().toISOString(),
    });
    emitEvent_("ramales", { accion: "DESEMBALAJE_INICIO", id });
    return res.json({ ok: true, lote: out });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/iniciar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/lote/:id/fin-desembalaje — el ramalero AVISA que acabó.
//
// Ojo con lo que este endpoint NO hace: no cierra el reloj ni cambia el
// estado a DESEMBALADO. Es un aviso para que el supervisor sepa que
// puede ir a recoger los cables. El tiempo oficial lo cierra /cables.
// Si esto cerrara la medición, volveríamos al cronómetro autogestionado.
router.post("/api/ramales/lote/:id/fin-desembalaje", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const u = await userPorEmail_(req.body?.email);
    if (!u) return res.status(403).json({ ok: false, error: "Sesión sin identidad." });

    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Lote no encontrado" });
    if (lote.encargado_user_id !== u.id) {
      return res.status(403).json({ ok: false, error: "Este lote no es tu turno." });
    }
    if (!lote.desembalaje_inicio_at) {
      return res.status(409).json({ ok: false, error: "El supervisor todavía no abrió este lote." });
    }

    const out = await sbPatch_("ramal_lotes", `id=eq.${id}`, {
      desembalaje_fin_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    emitEvent_("ramales", { accion: "DESEMBALAJE_AVISO", id });

    (async () => {
      const sups = await sbGet_("usuarios?rol=eq.SUPERVISOR&activo=eq.true&select=email");
      const mails = sups.map(s => s.email).filter(Boolean);
      if (!mails.length) return;
      await sendPushToEmails_(mails, {
        title: "🔌 Cables principales listos",
        body:  `${u.nombre} terminó de desembalar la caja ${lote.codigo}.`,
        tag:   "ramal-cables",
      });
    })().catch(() => {});

    return res.json({ ok: true, lote: out });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/fin-desembalaje]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/ramales/lote/:id/cables — el supervisor confirma que RECIBIÓ
// los cables principales. Esto sí cierra el reloj y suma el turno.
router.post("/api/ramales/lote/:id/cables", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const sup = await userPorEmail_(req.body?.email);
    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Lote no encontrado" });
    if (!lote.desembalaje_inicio_at) {
      return res.status(409).json({ ok: false, error: "Este lote nunca arrancó." });
    }
    if (lote.cables_recibidos_at) {
      return res.status(409).json({ ok: false, error: "Los cables de este lote ya se recibieron." });
    }

    const ahora = new Date().toISOString();
    const out = await sbPatch_("ramal_lotes", `id=eq.${id}`, {
      estado: "DESEMBALADO",
      cables_recibidos_at: ahora,
      cables_recibidos_por: sup?.nombre || "",
      // Si el ramalero nunca avisó, el aviso se da por dado aquí: sin esto
      // el "declarado" quedaría vacío y parecería que no trabajó.
      desembalaje_fin_at: lote.desembalaje_fin_at || ahora,
      updated_at: ahora,
    });

    // El turno se cuenta cuando el trabajo se cerró de verdad, no cuando
    // se asignó: si la caja se reasignó a medias, cuenta quien la acabó.
    await anotarTurno_(lote.encargado_user_id, "desembalaje");

    emitEvent_("ramales", { accion: "CABLES_RECIBIDOS", id });
    return res.json({ ok: true, lote: out });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/cables]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── REPARTO ──────────────────────────────────────────────────────────────────

// POST /api/ramales/lote/:id/repartir — «a A le tocan 8, a B 6, a C 6».
// Body: { email, repartos: [{ user_id, cantidad }] }
//
// Si a alguien ya se le había repartido de esta caja, se le SUMA a su
// fila en lugar de abrir otra: dos filas del mismo par contarían doble
// en el arqueo y partirían su tiempo promedio a la mitad.
router.post("/api/ramales/lote/:id/repartir", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const sup = await userPorEmail_(req.body?.email);
    const entradas = Array.isArray(req.body?.repartos) ? req.body.repartos : [];

    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Lote no encontrado" });

    const limpias = entradas
      .map(r => ({ user_id: r.user_id, cantidad: nEntero_(r.cantidad, 0) }))
      .filter(r => r.user_id && r.cantidad > 0);
    if (!limpias.length) {
      return res.status(400).json({ ok: false, error: "No hay nada que repartir." });
    }

    // No se puede repartir más de lo que trajo la caja. Se valida aquí y
    // no solo en la UI: el descuadre que se evita es más barato que el
    // que hay que explicar después.
    const previos = await sbGet_(`ramal_repartos?lote_id=eq.${id}&select=*`);
    const yaAsignados = previos.reduce((a, r) => a + (r.cantidad_asignada || 0), 0);
    const nuevos = limpias.reduce((a, r) => a + r.cantidad, 0);
    const disponibles = lote.cantidad_equipos - lote.merma - yaAsignados;
    if (nuevos > disponibles) {
      return res.status(400).json({
        ok: false,
        error: `La caja ${lote.codigo} solo tiene ${disponibles} ramales sin repartir y estás repartiendo ${nuevos}.`,
      });
    }

    const ahora = new Date().toISOString();
    const previoPorUser = new Map(previos.map(p => [p.user_id, p]));

    for (const r of limpias) {
      const prev = previoPorUser.get(r.user_id);
      if (prev) {
        await sbPatch_("ramal_repartos", `id=eq.${prev.id}`, {
          cantidad_asignada: (prev.cantidad_asignada || 0) + r.cantidad,
          updated_at: ahora,
        });
      } else {
        await sbPost_("ramal_repartos", {
          lote_id: id,
          user_id: r.user_id,
          cantidad_asignada: r.cantidad,
          asignado_at: ahora,
          asignado_por: sup?.nombre || "",
        });
      }
    }

    await sbPatch_("ramal_lotes", `id=eq.${id}`, { estado: "REPARTIDO", updated_at: ahora });
    emitEvent_("ramales", { accion: "REPARTIDO", id });

    (async () => {
      const ids = limpias.map(r => r.user_id).join(",");
      const us = await sbGet_(`usuarios?id=in.(${ids})&select=id,email`);
      const porId = new Map(us.map(u => [u.id, u.email]));
      for (const r of limpias) {
        const mail = porId.get(r.user_id);
        if (!mail) continue;
        await sendPushToEmails_([mail], {
          title: "🔩 Te asignaron ramales",
          body:  `Caja ${lote.codigo}: ${r.cantidad} ramales para trabajar.`,
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
// Lo devuelto SANO entra al stock como movimiento ARMADO. Ese es el
// enganche con el resto: a partir de aquí el ramal existe para el
// sistema y solo puede salir entregándoselo a un técnico.
router.post("/api/ramales/reparto/:id/devolver", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const u = await userPorEmail_(req.body?.email);
    if (!u) return res.status(403).json({ ok: false, error: "Sesión sin identidad." });

    const rows = await sbGet_(`ramal_repartos?id=eq.${id}&select=*`);
    const rep = rows[0];
    if (!rep) return res.status(404).json({ ok: false, error: "Reparto no encontrado" });

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
    // de 6 pasaría sin ruido, que es exactamente el agujero que este
    // módulo existe para tapar.
    if (devuelta > rep.cantidad_asignada) {
      return res.status(400).json({
        ok: false,
        error: `Te asignaron ${rep.cantidad_asignada} ramales y estás devolviendo ${devuelta}.`,
      });
    }

    const ahora = new Date().toISOString();
    const lotes = await sbGet_(`ramal_lotes?id=eq.${rep.lote_id}&select=id,codigo,tipo_ramal`);
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
        tipo_ramal: lote?.tipo_ramal || null,
        cantidad: buenos,
        lote_id: rep.lote_id,
        reparto_id: id,
        user_id: rep.user_id,
        user_nombre: u.id === rep.user_id ? u.nombre : "",
        nota: `Devolución a oficina · caja ${lote?.codigo || ""}`,
        created_by: u.nombre,
      });
    }
    if (rechazada > 0) {
      await moverStock_({
        tipo: "MERMA",
        tipo_ramal: lote?.tipo_ramal || null,
        cantidad: 0, // ya no entró al stock: se anota como rastro, no resta
        lote_id: rep.lote_id,
        reparto_id: id,
        user_id: rep.user_id,
        nota: `${rechazada} rechazados en revisión`,
        created_by: u.nombre,
      });
    }

    emitEvent_("ramales", { accion: "DEVUELTO", id });
    return res.json({ ok: true, al_stock: buenos });
  } catch (e) {
    console.error("[POST /api/ramales/reparto/:id/devolver]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── REVISIÓN DE EQUIPOS DE CONVERSIÓN ────────────────────────────────────────

// POST /api/ramales/lote/:id/revision
// Body: { email, revisor_user_id?, accion: "asignar"|"iniciar"|"cerrar",
//         conformes?, observados?, nota? }
//
// La misma caja trae insumos de ramal e insumos de conversión. Quien saca
// los ramales no tiene por qué revisar los equipos, así que la revisión
// tiene su propio encargado y su propia rotación.
router.post("/api/ramales/lote/:id/revision", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const accion = String(req.body?.accion || "asignar").toLowerCase();
    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Lote no encontrado" });

    const ahora = new Date().toISOString();
    let patch = { updated_at: ahora };

    if (accion === "asignar") {
      const rev = req.body?.revisor_user_id
        || (await candidatosTurno_("revision")).sugerido?.user_id;
      if (!rev) return res.status(400).json({ ok: false, error: "No hay a quién asignarle la revisión." });
      patch.revisor_user_id = rev;
    } else if (accion === "iniciar") {
      if (!lote.revisor_user_id) {
        return res.status(400).json({ ok: false, error: "Primero asigna un revisor." });
      }
      patch.revision_inicio_at = ahora;
    } else if (accion === "cerrar") {
      patch.revision_fin_at     = ahora;
      patch.revision_conformes  = nEntero_(req.body?.conformes, 0);
      patch.revision_observados = nEntero_(req.body?.observados, 0);
      patch.revision_nota       = String(req.body?.nota || "");
      // El turno de revisión se cuenta al cerrarla, igual que el de
      // desembalaje: lo que rota es el trabajo hecho, no el nombramiento.
      await anotarTurno_(lote.revisor_user_id, "revision");
    } else {
      return res.status(400).json({ ok: false, error: "Acción desconocida." });
    }

    const out = await sbPatch_("ramal_lotes", `id=eq.${id}`, patch);
    emitEvent_("ramales", { accion: "REVISION", id });
    return res.json({ ok: true, lote: out });
  } catch (e) {
    console.error("[POST /api/ramales/lote/:id/revision]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ─── CIERRE Y AUDITORÍA ───────────────────────────────────────────────────────

// POST /api/ramales/lote/:id/cerrar — el supervisor cierra la caja.
// Body: { email, merma?, merma_motivo?, forzar? }
//
// Una caja que no cuadra NO se cierra en silencio: o se explica la
// diferencia como merma con motivo, o el supervisor tiene que decir
// explícitamente `forzar` y queda escrito. Un descuadre explicado es
// información; uno borrado es un agujero en el inventario.
router.post("/api/ramales/lote/:id/cerrar", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const sup = await userPorEmail_(req.body?.email);
    const merma = nEntero_(req.body?.merma, 0);
    const motivo = String(req.body?.merma_motivo || "");

    const rows = await sbGet_(`ramal_lotes?id=eq.${id}&select=*`);
    const lote = rows[0];
    if (!lote) return res.status(404).json({ ok: false, error: "Lote no encontrado" });
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
        error: `La caja no cierra: ${enProceso} sin devolver y ${sinRepartir} sin repartir.`,
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
      await moverStock_({
        tipo: "MERMA",
        tipo_ramal: lote.tipo_ramal,
        cantidad: 0, // nunca llegó al stock; queda como rastro del faltante
        lote_id: id,
        nota: `Merma al cerrar ${lote.codigo}: ${motivo}`,
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

// ─── ROTACIÓN ─────────────────────────────────────────────────────────────────

// POST /api/ramales/rotacion — entrar/salir del turno, cambiar el orden.
// Body: { email, user_id, activo?, orden?, nota? }
router.post("/api/ramales/rotacion", requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.user_id) return res.status(400).json({ ok: false, error: "Falta user_id" });

    const patch = { updated_at: new Date().toISOString() };
    if (b.activo !== undefined) patch.activo = !!b.activo;
    if (b.orden  !== undefined) patch.orden  = nEntero_(b.orden, 0);
    if (b.nota   !== undefined) patch.nota   = String(b.nota);

    const existe = await sbGet_(`ramal_rotacion?user_id=eq.${b.user_id}&select=user_id`);
    const out = existe.length
      ? await sbPatch_("ramal_rotacion", `user_id=eq.${b.user_id}`, patch)
      : await sbPost_("ramal_rotacion", { user_id: b.user_id, ...patch });

    emitEvent_("ramales", { accion: "ROTACION" });
    return res.json({ ok: true, rotacion: out });
  } catch (e) {
    console.error("[POST /api/ramales/rotacion]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
