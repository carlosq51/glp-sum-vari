// =========================
// routes/produccion.js
// Proyección de producción del día + horas extra (solo ADMIN las escribe).
//
// El cálculo es puro y vive en lib/proyeccion.js; aquí se leen los datos que
// lo alimentan. La proyección no tiene endpoint propio: viaja dentro del LIVE
// del supervisor (proyeccionDeJornada_), que ya trae la asistencia y la
// plantilla, y así la tabla de cifras y la proyección salen del mismo fetch y
// del mismo cache.
// =========================

import { Router } from "express";
import { supabaseServiceHeaders_, supabaseFetchAll_ } from "../lib/supabase.js";
import { requireRol_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { getConfig_ } from "../lib/config.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { jornadaPeru_ } from "../lib/utils.js";
import { minutosPE_, indiceBloque_, minAHhmm_ } from "../public/js/core/format.js";
import {
  bloquesJornada_, calibrarProyeccion_, proyectarJornada_, horasExtraParaMeta_, metaVentana_,
  ritmosPorTecnico_, proyeccionPorTecnico_,
  minutoJornada_, dowDe_, ROLES_PROY,
} from "../lib/proyeccion.js";

const router = Router();

const PE_OFFSET = "-05:00";
const TABLA_EXTRA = "produccion_horas_extra";

/** "2026-09-28" + n días, en el calendario. */
function masDias_(ymd, n) {
  const [a, m, d] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** El puesto de conversión de un técnico, o null si no hace conversión. */
function rolDe_(u) {
  if (!u || u.rol !== "TECNICO") return null;
  return ROLES_PROY.includes(u.especialidad) ? u.especialidad : null;
}

/** Inicio de jornada y fin de turno, en minutos linealizados. */
function relojTaller_(cfg) {
  const inicioTxt = String(cfg.LIVE_JORNADA_INICIO || "05:00").trim().padStart(5, "0");
  const inicioMin = minutoJornada_(inicioTxt, 0) ?? 300;
  const finTurnoMin = minutoJornada_(cfg.PROYECCION_FIN_TURNO, inicioMin) ?? 990;
  return { inicioTxt, inicioMin, finTurnoMin };
}

/**
 * Los días anteriores a `jornadaStr`, resumidos para calibrar el modelo:
 * presentes, carros por corte y lo que rindió la hora extra.
 *
 * Un carro es su work_order con las dos mitades cerradas, y cuenta en la
 * jornada de su ÚLTIMA mitad — la misma regla que el LIVE.
 */
async function leerCalibracion_(cfg, jornadaStr) {
  const URL_ = process.env.SUPABASE_URL;
  const headers = supabaseServiceHeaders_();
  const { inicioTxt, inicioMin, finTurnoMin } = relojTaller_(cfg);
  const bloques = bloquesJornada_(cfg.LIVE_CORTES);

  const dias = Number(cfg.PROYECCION_DIAS_CALIBRACION) || 30;
  const desde = masDias_(jornadaStr, -dias);
  const ts_ = (ymd) => encodeURIComponent(`${ymd}T${inicioTxt}:00${PE_OFFSET}`);
  // Unos días de margen por detrás: la primera mitad de un carro que cerró el
  // primer día de la ventana pudo cerrarse antes.
  const desdeAsg = ts_(masDias_(desde, -3));

  const lim = { pageSize: 1000, maxRows: 20000 };
  const [asg, asis, users] = await Promise.all([
    supabaseFetchAll_(
      `${URL_}/rest/v1/asignaciones?select=work_order_id,user_id,rol_trabajo,updated_at` +
      `&tipo_ot=eq.CONVERSION&activo=eq.true&estado_actual=eq.FINALIZADO&rol_trabajo=in.(MOTOR,TANQUE)` +
      `&updated_at=gte.${desdeAsg}&updated_at=lt.${ts_(jornadaStr)}&order=id.asc`, headers, lim),
    supabaseFetchAll_(
      `${URL_}/rest/v1/asistencia_jornada?select=jornada_fecha,user_id` +
      `&ingreso_at=not.is.null&jornada_fecha=gte.${desde}&jornada_fecha=lt.${jornadaStr}`, headers, lim),
    supabaseFetchAll_(`${URL_}/rest/v1/usuarios?select=id,rol,especialidad&rol=eq.TECNICO`, headers, lim),
  ]);
  if (!asg.ok || !asis.ok || !users.ok) throw new Error("calibración: lectura incompleta");

  const rolPorId = new Map(users.rows.map(u => [u.id, rolDe_(u)]));
  const jornadaDe_ = (ms) => jornadaPeru_(inicioTxt, new Date(ms));
  const minDe_ = (ms) => { const m = minutosPE_(new Date(ms)); return m < inicioMin ? m + 1440 : m; };

  const D = new Map();
  const dia_ = (f) => {
    if (!D.has(f)) {
      D.set(f, {
        dow: dowDe_(f), presentes: 0,
        carrosPorBloque: bloques.map(() => 0),
        extra: { MOTOR: { mitades: 0, horas: 0 }, TANQUE: { mitades: 0, horas: 0 } },
        _ext: new Map(),
      });
    }
    return D.get(f);
  };

  for (const a of asis.rows) if (rolPorId.get(a.user_id)) dia_(a.jornada_fecha).presentes++;

  // Carros: la última mitad decide el día y el corte.
  const porOt = new Map();
  const mitadesTurno = new Map();   // "fecha|userId" → mitades cerradas en el turno normal
  for (const a of asg.rows) {
    const ms = Date.parse(a.updated_at);
    if (!ms) continue;
    const o = porOt.get(a.work_order_id) || {};
    o[a.rol_trabajo] = Math.max(o[a.rol_trabajo] || 0, ms);
    porOt.set(a.work_order_id, o);

    // Hora extra: mitades cerradas después del turno, por persona y día.
    const f = jornadaDe_(ms);
    if (f < desde || !D.has(f)) continue;
    const m = minDe_(ms);
    if (m < finTurnoMin) {
      // Las del turno, para el ritmo de cada técnico.
      const kt = `${f}|${a.user_id}`;
      mitadesTurno.set(kt, (mitadesTurno.get(kt) || 0) + 1);
      continue;
    }
    const k = `${a.user_id}|${a.rol_trabajo}`;
    const e = D.get(f)._ext.get(k) || { rol: a.rol_trabajo, n: 0, ult: 0 };
    e.n++; e.ult = Math.max(e.ult, m);
    D.get(f)._ext.set(k, e);
  }
  for (const o of porOt.values()) {
    if (!o.MOTOR || !o.TANQUE) continue;
    const ms = Math.max(o.MOTOR, o.TANQUE);
    const f = jornadaDe_(ms);
    if (f < desde || !D.has(f)) continue;
    const i = indiceBloque_(minutosPE_(new Date(ms)), bloques);
    if (i >= 0) D.get(f).carrosPorBloque[i]++;
  }

  // Un día con menos marcas que esto es de antes del QR o de un QR caído:
  // la "asistencia" de ese día no es la gente que vino.
  const minPres = Number(cfg.PROYECCION_MIN_PRESENTES) || 5;
  const lista = [];
  for (const d of D.values()) {
    for (const e of d._ext.values()) {
      d.extra[e.rol].mitades += e.n;
      d.extra[e.rol].horas   += Math.max(1, (e.ult - finTurnoMin) / 60);
    }
    delete d._ext;
    if (d.presentes >= minPres) lista.push(d);
  }

  // El ritmo de cada uno, solo de los días que vino (y que cuentan): un día
  // sin marca no es un día de cero mitades, es un día que no se sabe.
  const registros = [];
  for (const a of asis.rows) {
    const rol = rolPorId.get(a.user_id);
    if (!rol || (D.get(a.jornada_fecha)?.presentes || 0) < minPres) continue;
    registros.push({ userId: a.user_id, rol, mitades: mitadesTurno.get(`${a.jornada_fecha}|${a.user_id}`) || 0 });
  }

  return {
    ...calibrarProyeccion_({ dias: lista, bloques, finTurnoMin }),
    ritmos: ritmosPorTecnico_(registros),
  };
}

/** Las horas extra anotadas para una jornada. `sinTabla` si falta correr el SQL. */
async function leerExtras_(jornadaStr) {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/${TABLA_EXTRA}?jornada_fecha=eq.${jornadaStr}` +
      `&select=user_id,hasta,actualizado_por,actualizado_at`,
      { headers: supabaseServiceHeaders_() },
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { filas: [], sinTabla: r.status === 404 || /PGRST205|does not exist/i.test(t) };
    }
    return { filas: await r.json(), sinTabla: false };
  } catch {
    return { filas: [], sinTabla: false };
  }
}

/**
 * La proyección de una jornada, lista para el LIVE.
 *
 * @param {object} p
 * @param {object} p.cfg
 * @param {string} p.jornadaStr   YYYY-MM-DD
 * @param {Map}    p.asistencia   user_id → { ingreso_at } (la que ya leyó el LIVE)
 * @param {Array}  p.allUsers     usuarios (id, nombre, rol, especialidad, activo)
 * @param {number} p.metaDia      la meta guía del día (ya ponderada por sábado)
 */
export async function proyeccionDeJornada_({ cfg, jornadaStr, asistencia, allUsers, metaDia }) {
  const { finTurnoMin, inicioMin } = relojTaller_(cfg);
  const bloques = bloquesJornada_(cfg.LIVE_CORTES);
  if (!bloques.length) return null;

  // Los días cerrados no cambian: la calibración se lee una vez por jornada.
  const [calib, extrasDb] = await Promise.all([
    cachedByTopics_(`produccion:calib:${jornadaStr}`, [], cfg.LIVE_CACHE_MES_MS,
      () => leerCalibracion_(cfg, jornadaStr)),
    leerExtras_(jornadaStr),
  ]);

  const hastaPorId = new Map(extrasDb.filas.map(f => [f.user_id, f.hasta]));
  const tecnicos = (allUsers || [])
    .filter(u => rolDe_(u) && (u.activo !== false || hastaPorId.has(u.id)))
    .map(u => ({
      userId: u.id,
      nombre: u.nombre || u.email || "",
      rol: rolDe_(u),
      presente: !!asistencia?.get(u.id)?.ingreso_at,
      hasta: hastaPorId.get(u.id) || null,
    }))
    .sort((a, b) => (b.presente - a.presente) || a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre));

  const presentes = { MOTOR: 0, TANQUE: 0 };
  for (const t of tecnicos) if (t.presente) presentes[t.rol]++;

  const extras = tecnicos
    .filter(t => t.hasta)
    .map(t => ({ rol: t.rol, hastaMin: minutoJornada_(t.hasta, inicioMin) }))
    .filter(e => e.hastaMin != null);

  const p = proyectarJornada_({ calib, dow: dowDe_(jornadaStr), presentes, extras, bloques, finTurnoMin });
  // "Cuántas parejas faltan" se mide contra la meta guía (33), no contra la
  // ventana alargada: si no, cada pareja anotada movería la meta que persigue.
  const paraMeta = horasExtraParaMeta_({ proyeccion: p, meta: metaDia, bloques, finTurnoMin });
  const inicioTurnoMin = minutoJornada_(cfg.PROYECCION_INICIO_TURNO, inicioMin) ?? 420;
  const mv = metaVentana_({ meta: metaDia, inicioTurnoMin, finTurnoMin, extras });

  // Lo proyectado persona por persona (detalle de la fila "Proyectado").
  const porTec = new Map(proyeccionPorTecnico_({
    tecnicos: tecnicos.map(t => ({ ...t, hastaMin: t.hasta ? minutoJornada_(t.hasta, inicioMin) : null })),
    proyeccion: p, ritmos: calib?.ritmos, finTurnoMin,
  }).map(x => [x.userId, x]));

  return {
    ...(p || { sinHistoria: true }),
    paraMeta: paraMeta && { ...paraMeta, hasta: minAHhmm_(paraMeta.hastaMin) },
    metaGuia: metaDia,
    metaVentana: { ...mv, desde: minAHhmm_(mv.desdeMin), hasta: minAHhmm_(mv.hastaMin) },
    finTurno: cfg.PROYECCION_FIN_TURNO,
    tecnicos: tecnicos.map(t => ({ ...t, proy: porTec.get(t.userId) || null })),
    sinTabla: extrasDb.sinTabla,
  };
}

// POST /api/produccion/horas-extra  body: { email, userId, hasta, fecha? }
// `hasta` vacío = ya no se queda (borra la fila). Solo ADMIN.
router.post("/api/produccion/horas-extra", requireRol_("ADMIN"), async (req, res) => {
  try {
    const cfg = await getConfig_();
    const { finTurnoMin, inicioMin, inicioTxt } = relojTaller_(cfg);
    const hoy = jornadaPeru_(inicioTxt);

    const userId = String(req.body?.userId || "").trim();
    const hasta  = String(req.body?.hasta || "").trim();
    const fecha  = String(req.body?.fecha || hoy).trim();
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return res.status(400).json({ ok: false, error: "Falta el técnico." });
    // Hoy o la semana pasada (para corregir lo que se olvidó anotar), nunca el futuro.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy || fecha < masDias_(hoy, -7)) {
      return res.status(400).json({ ok: false, error: "Solo se anotan horas extra de hoy o de los últimos 7 días." });
    }
    if (hasta) {
      const m = minutoJornada_(hasta, inicioMin);
      if (m == null || m <= finTurnoMin) {
        return res.status(400).json({ ok: false, error: `La hora tiene que ser después de las ${cfg.PROYECCION_FIN_TURNO}.` });
      }
    }

    const base = `${process.env.SUPABASE_URL}/rest/v1/${TABLA_EXTRA}`;
    const headers = supabaseServiceHeaders_();
    const resp = hasta
      ? await fetch(`${base}?on_conflict=jornada_fecha,user_id`, {
          method: "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            jornada_fecha: fecha, user_id: userId, hasta: hasta.padStart(5, "0"),
            actualizado_por: String(req.body?.email || ""), actualizado_at: new Date().toISOString(),
          }),
        })
      : await fetch(`${base}?jornada_fecha=eq.${fecha}&user_id=eq.${userId}`, { method: "DELETE", headers });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("[HORAS_EXTRA]", resp.status, detail);
      const sinTabla = resp.status === 404 || /PGRST205|does not exist/i.test(detail);
      return res.status(502).json({
        ok: false,
        error: sinTabla
          ? "Falta crear la tabla de horas extra en Supabase (supabase/produccion-horas-extra.sql)."
          : `No se pudo guardar (${resp.status}).`,
      });
    }
    // Invalida el LIVE: la proyección cambia con cada persona que se queda.
    emitEvent_("produccion", { accion: "HORAS_EXTRA", userId });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[HORAS_EXTRA]", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;
