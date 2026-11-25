// =========================
// lib/salida-estimada.js
// "¿A qué hora se fue?" para quien no marcó la salida, leído de la base.
//
// La regla es pura y vive en lib/tiempo-real.js (salidaEstimada_): fin del
// corte donde cae su última actividad en la app, con piso en el fin de su
// turno (16:30; 11:30 el sábado) o en la hora extra que el admin le anotó.
// Aquí solo se juntan los datos: sus eventos de la jornada y su hora extra.
//
// La usan el cierre automático de las 05:00 (routes/despacho.js), la pausa de
// la cena y el fin del sábado (lib/pausa-masiva.js): los tres tienen que decir
// lo mismo de la misma persona.
// =========================

import { supabaseHeaders_ } from "./supabase.js";
import { salidaEstimada_, enDia_, hhmm_, esSabado_, finesDeCortes_ } from "./tiempo-real.js";

const SB = () => process.env.SUPABASE_URL;

/** Instante de una "HH:MM" de la jornada; lo de antes de las 06:00 es de madrugada. */
function enJornada_(fecha, min) {
  return enDia_(fecha, min < 6 * 60 ? min + 24 * 60 : min);
}

/** Lo que pesa de la config, resuelto una vez. */
export function relojSalida_(cfg = {}) {
  return {
    finTurnoMin: hhmm_(cfg.PROYECCION_FIN_TURNO) ?? 990,
    finTurnoSabadoMin: hhmm_(cfg.SABADO_FIN_TURNO) ?? 690,
    finesCorteMin: finesDeCortes_(cfg.LIVE_CORTES),
  };
}

/**
 * Las horas extra anotadas de una jornada: user_id → instante en ms.
 * Una sola lectura para todo el taller (la cena y el sábado miran a todos).
 */
export async function horasExtraDe_(fecha) {
  const out = new Map();
  try {
    const r = await fetch(
      `${SB()}/rest/v1/produccion_horas_extra?jornada_fecha=eq.${fecha}&select=user_id,hasta`,
      { headers: supabaseHeaders_() },
    );
    for (const f of r.ok ? await r.json() : []) {
      const m = hhmm_(f.hasta);
      if (m != null) out.set(f.user_id, enJornada_(fecha, m));
    }
  } catch { /* sin tabla o sin red: nadie tiene hora extra anotada */ }
  return out;
}

/**
 * salidaEstimadaDe_ — la hora estimada de salida de una persona en `fecha`.
 *
 * @param {string} userId
 * @param {string} fecha       jornada YYYY-MM-DD
 * @param {object} cfg
 * @param {number} desdeMs     desde cuándo mirar su actividad (su ingreso, o el inicio de jornada)
 * @param {object} [o]
 * @param {number} [o.hastaMs=Date.now()]
 * @param {Map}    [o.extras]  salida de horasExtraDe_, para no releerla por persona
 */
export async function salidaEstimadaDe_(userId, fecha, cfg, desdeMs, { hastaMs = Date.now(), extras = null } = {}) {
  const reloj = relojSalida_(cfg);
  let actividad = [];
  try {
    const ev = await fetch(
      `${SB()}/rest/v1/eventos?user_id=eq.${userId}&timestamp=gte.${encodeURIComponent(new Date(desdeMs).toISOString())}` +
      `&select=timestamp&order=timestamp.desc&limit=20`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []);
    actividad = ev.map(e => new Date(e.timestamp).getTime());
  } catch { /* sin datos: vale el fin de turno */ }

  const ex = extras ? extras.get(userId) : (await horasExtraDe_(fecha)).get(userId);
  const finTurno = esSabado_(fecha) ? reloj.finTurnoSabadoMin : reloj.finTurnoMin;
  const piso = Math.max(enDia_(fecha, finTurno), ex ?? 0);
  return salidaEstimada_({
    desdeMs, hastaMs, actividadMs: actividad, pisoMs: piso,
    finesCorteMs: reloj.finesCorteMin.map(m => enDia_(fecha, m)),
  });
}
