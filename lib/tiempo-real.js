// =========================
// lib/tiempo-real.js
// Cuánto se trabajó DE VERDAD en una mitad, y cuánto tarda de normal cada uno.
//
// EL PROBLEMA
// ───────────
// tiempo_trab_ms es lo que corrió el cronómetro, y el cronómetro solo se para
// si alguien lo para: una pausa, la salida marcada con el QR o el cierre
// automático de las 05:00. El técnico que se va a las 16:30 sin marcar salida
// deja su carro corriendo hasta las 05:00 del día siguiente —12,5 h que nadie
// trabajó— y si tampoco usa el QR, hasta que vuelve y cierra el carro.
// Medido en ago–nov 2026: de 4 137 mitades cerradas, 176 pasan de 8 h y 97 de
// 12 h; sumadas, unas 2 000 h que el taller no trabajó.
//
// LO QUE SÍ SABEMOS
// El cronómetro no puede haber contado trabajo mientras la persona no estaba.
// Y dónde estaba se sabe: las marcas de ingreso y salida, y —cuando se olvida
// la salida o no marca nada— la última cosa que hizo en la app ese día (un
// inicio, un fin, una pausa). Así que:
//
//     tiempo real = el menor entre  lo que contó el reloj
//                                y  el tiempo que estuvo en el taller
//                                   entre el INICIO y el FIN de esa mitad
//                                   (sin la hora de comida)
//
// Si el reloj cuenta menos que la presencia (lo normal: pausó, almorzó, hizo
// otro carro) se respeta el reloj. Solo se recorta lo que es imposible.
//
// LA SALIDA OLVIDADA
// Cuando no hay salida real (CIERRE_AUTO, o ninguna marca), se toma como hora
// de salida la última actividad suya en la app ese día, pero nunca antes del
// fin del turno normal (16:30) ni de la hora extra que el admin le anotó: quien
// estuvo hasta las 16:30 armando sin tocar el celular trabajó hasta las 16:30.
//
// Puro y sin red: la lectura vive en lib/tiempos-estandar.js.
// =========================

import { medianasPorCelda_, medianaDe_, PUESTOS_CARRO } from "./eta-carro.js";
import { mediana_ } from "./regresion.js";

const MIN = 60_000;
const HORA = 60 * MIN;
const PE_OFFSET_MS = 5 * HORA;        // Perú es UTC−5 todo el año
const DURACION_JORNADA_MS = 23 * HORA; // 06:00 → 05:00 del día siguiente
const INICIO_JORNADA_MIN = 6 * 60;

/** Medianoche de Perú del día `ymd`, en ms UTC. */
function medianoche_(ymd) {
  const [a, m, d] = String(ymd).split("-").map(Number);
  return Date.UTC(a, m - 1, d) + PE_OFFSET_MS;
}

/** El instante `min` minutos después de la medianoche de Perú de `ymd`. */
export function enDia_(ymd, min) {
  return medianoche_(ymd) + Number(min) * MIN;
}

/** "HH:MM" → minutos, o null. */
export function hhmm_(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** A qué jornada pertenece un instante (la de las 06:00 → 05:00). */
export function jornadaDeMs_(ms) {
  // Misma regla que jornadaFecha_ de lib/despacho.js, sin traerse su crypto:
  // antes de las 06:00 de Perú todavía es la jornada de ayer.
  return new Date(ms - PE_OFFSET_MS - INICIO_JORNADA_MIN * MIN).toISOString().slice(0, 10);
}

function finJornada_(ymd) {
  return enDia_(ymd, INICIO_JORNADA_MIN) + DURACION_JORNADA_MS;
}

/**
 * salidaEstimada_ — a qué hora se fue alguien que no marcó la salida.
 *
 * La última actividad suya dentro de [desde, hasta], con un piso: el fin de su
 * turno (16:30, o la hora extra que tenía anotada). Nunca pasa de `hasta`, que
 * es la hora en que el sistema cerró la jornada.
 */
export function salidaEstimada_({ desdeMs, hastaMs, actividadMs = [], pisoMs = null } = {}) {
  let fin = desdeMs;
  for (const t of actividadMs) if (t >= desdeMs && t <= hastaMs && t > fin) fin = t;
  if (Number.isFinite(pisoMs) && pisoMs > fin) fin = pisoMs;
  return Math.max(desdeMs, Math.min(hastaMs, fin));
}

/**
 * presenciaDelUsuario_ — los tramos en que una persona estuvo en el taller.
 *
 * @param {object} o
 * @param {Array<{tipo,ts,jornada_fecha?}>} o.marcas  sus marcas de asistencia
 * @param {number[]} o.actividadMs   instantes en que hizo algo en la app
 * @param {number}   o.ahoraMs
 * @param {number}   [o.inicioTurnoMin=420]  07:00
 * @param {number}   [o.finTurnoMin=990]     16:30
 * @param {Object<string,string>} [o.extraHasta]  jornada → "19:30" (hora extra anotada)
 * @returns {Array<{a:number,b:number,jornada:string,estimada:boolean,sinMarcas?:boolean}>}
 */
export function presenciaDelUsuario_({
  marcas = [], actividadMs = [], ahoraMs = Date.now(),
  inicioTurnoMin = 420, finTurnoMin = 990, extraHasta = {},
} = {}) {
  const porJornadaMarcas = new Map();
  for (const m of marcas) {
    const ts = new Date(m.ts).getTime();
    if (!Number.isFinite(ts)) continue;
    const j = m.jornada_fecha || jornadaDeMs_(ts);
    if (!porJornadaMarcas.has(j)) porJornadaMarcas.set(j, []);
    porJornadaMarcas.get(j).push({ tipo: m.tipo, ts });
  }
  const porJornadaAct = new Map();
  for (const t of actividadMs) {
    if (!Number.isFinite(t)) continue;
    const j = jornadaDeMs_(t);
    if (!porJornadaAct.has(j)) porJornadaAct.set(j, []);
    porJornadaAct.get(j).push(t);
  }

  const piso_ = (j) => {
    // La hora extra en minutos del día: "00:30" es de madrugada, del día siguiente.
    let extra = hhmm_(extraHasta?.[j]);
    if (extra != null && extra < INICIO_JORNADA_MIN) extra += 24 * 60;
    return enDia_(j, Math.max(finTurnoMin, extra ?? 0));
  };

  const out = [];
  const jornadas = new Set([...porJornadaMarcas.keys(), ...porJornadaAct.keys()]);
  for (const j of jornadas) {
    const act = (porJornadaAct.get(j) || []).sort((x, y) => x - y);
    const finJ = Math.min(finJornada_(j), ahoraMs);
    const cerrada = finJornada_(j) <= ahoraMs;
    const ms = (porJornadaMarcas.get(j) || []).sort((x, y) => x.ts - y.ts);

    if (!ms.length) {
      // No marcó nada: se le cuenta desde el inicio del turno (o antes, si
      // hizo algo antes) hasta su salida estimada.
      if (!act.length) continue;
      const a = Math.min(act[0], enDia_(j, inicioTurnoMin));
      const b = cerrada
        ? salidaEstimada_({ desdeMs: a, hastaMs: finJ, actividadMs: act, pisoMs: piso_(j) })
        : ahoraMs;
      if (b > a) out.push({ a, b, jornada: j, estimada: true, sinMarcas: true });
      continue;
    }

    const tramos = [];
    let abierto = null;
    for (const m of ms) {
      if (m.tipo === "INGRESO") {
        if (abierto == null) abierto = m.ts;
      } else if (m.tipo === "SALIDA" && abierto != null) {
        tramos.push({ a: abierto, b: m.ts, estimada: false });
        abierto = null;
      } else if (m.tipo === "CIERRE_AUTO" && abierto != null) {
        tramos.push({
          a: abierto,
          b: salidaEstimada_({ desdeMs: abierto, hastaMs: m.ts, actividadMs: act, pisoMs: piso_(j) }),
          estimada: true,
        });
        abierto = null;
      }
    }
    if (abierto != null) {
      tramos.push(cerrada
        ? { a: abierto, b: salidaEstimada_({ desdeMs: abierto, hastaMs: finJ, actividadMs: act, pisoMs: piso_(j) }), estimada: true }
        : { a: abierto, b: ahoraMs, estimada: false });
    }
    if (!tramos.length) continue;

    // Lo que hizo en la app antes de marcar el ingreso o después de la última
    // salida también es estar en el taller: el QR se marca tarde a veces, y
    // quien vuelve sin marcar y reanuda su carro está trabajando.
    if (act.length) {
      if (act[0] < tramos[0].a) tramos[0].a = act[0];
      const ult = tramos[tramos.length - 1];
      const ultAct = act[act.length - 1];
      if (ultAct > ult.b) ult.b = ultAct;
    }
    for (const t of tramos) if (t.b > t.a) out.push({ ...t, jornada: j });
  }
  return out.sort((x, y) => x.a - y.a);
}

/** Une tramos que se pisan. */
function unir_(tramos) {
  const s = tramos.filter(t => t.b > t.a).map(t => ({ a: t.a, b: t.b })).sort((x, y) => x.a - y.a);
  const out = [];
  for (const t of s) {
    const u = out[out.length - 1];
    if (u && t.a <= u.b) u.b = Math.max(u.b, t.b);
    else out.push({ ...t });
  }
  return out;
}

/** ms de [a, b] que caen en la hora de comida de cualquier día. */
function comidaEn_(a, b, comida) {
  if (!comida || !(comida.finMin > comida.iniMin)) return 0;
  let s = 0;
  for (let d = jornadaDeMs_(a); ; ) {
    const ca = enDia_(d, comida.iniMin), cb = enDia_(d, comida.finMin);
    if (ca >= b) break;
    s += Math.max(0, Math.min(b, cb) - Math.max(a, ca));
    const [y, m, dd] = d.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  }
  return s;
}

/**
 * tiempoCorregido_ — lo que contó el reloj, sin lo que es imposible.
 *
 * @param {object} o
 * @param {number} o.rawMs        tiempo_trab_ms
 * @param {number} o.desdeMs      INICIO de la mitad
 * @param {number} o.hastaMs      FIN de la mitad (o ahora, si sigue abierta)
 * @param {Array<{a,b}>} o.presencia  tramos en el taller de quien(es) la trabajaron
 * @param {{iniMin,finMin}} [o.comida]
 * @returns {{ms:number, descontadoMs:number, topeMs:number|null, conEvidencia:boolean}}
 */
export function tiempoCorregido_({ rawMs, desdeMs, hastaMs, presencia = [], comida = null } = {}) {
  const raw = Math.max(0, Number(rawMs) || 0);
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs) || hastaMs <= desdeMs) {
    return { ms: raw, descontadoMs: 0, topeMs: null, conEvidencia: false };
  }
  let tope = 0, toca = false;
  for (const t of unir_(presencia)) {
    const a = Math.max(t.a, desdeMs), b = Math.min(t.b, hastaMs);
    if (b <= a) continue;
    toca = true;
    tope += (b - a) - comidaEn_(a, b, comida);
  }
  // Sin un solo tramo de presencia en la ventana no hay con qué medir —falta
  // el dato, no el trabajo— y se respeta el reloj.
  if (!toca) return { ms: raw, descontadoMs: 0, topeMs: null, conEvidencia: false };
  tope = Math.max(0, tope);
  if (raw <= tope) return { ms: raw, descontadoMs: 0, topeMs: tope, conEvidencia: true };
  return { ms: tope, descontadoMs: raw - tope, topeMs: tope, conEvidencia: true };
}

// ─── Tiempo normal: del taller, del modelo y de cada técnico ─────────────────

/**
 * Carros para que el índice propio de un técnico pese tanto como el del taller.
 * Con 3 carros, "el más rápido" es casi siempre suerte (lib/desempeno.js usa la
 * misma idea): el índice se encoge hacia 1 hasta que hay carros que lo sostengan.
 */
export const K_ENCOGER = 8;
/** Por debajo de esto no se dice "tu tiempo normal": se dice el del taller. */
export const MIN_N_TECNICO = 5;
/** Una razón fuera de esto contra su listón no es ritmo, es un dato roto. */
const RAZON_MIN = 0.2, RAZON_MAX = 3;

/**
 * estandaresDe_ — el tiempo normal de cada trabajo y el ritmo de cada técnico.
 *
 * El taller: mediana por modelo × puesto (y por puesto si el modelo tiene poca
 * historia), la misma regla del estimado del mapa (lib/eta-carro.js).
 *
 * El técnico: NO su mediana de horas, que mediría qué carros le tocaron. Cada
 * carro suyo se divide por el normal del taller para ese trabajo, y su índice
 * es la mediana de esas razones encogida hacia 1. Su tiempo normal para un
 * carro concreto es el del taller para ese carro × su índice.
 *
 * @param {Array<{userId,rol,modelo,ms}>} filas  mitades cerradas, ya corregidas
 */
export function estandaresDe_(filas = []) {
  const limpias = (filas || []).filter(f => Number(f?.ms) > 0);
  const med = medianasPorCelda_(limpias);

  const nPorRol = {};
  for (const rol of PUESTOS_CARRO) nPorRol[rol] = limpias.filter(f => String(f.rol).toUpperCase() === rol).length;

  const razones = new Map();
  for (const f of limpias) {
    const rol = String(f.rol || "").toUpperCase();
    if (!f.userId || !PUESTOS_CARRO.includes(rol)) continue;
    const base = medianaDe_(med, f.modelo, rol);
    if (!base) continue;
    const r = f.ms / base;
    if (r < RAZON_MIN || r > RAZON_MAX) continue;
    const k = `${f.userId}|${rol}`;
    if (!razones.has(k)) razones.set(k, { r: [], ms: [] });
    razones.get(k).r.push(r);
    razones.get(k).ms.push(f.ms);
  }

  const porTecnico = {};
  for (const [k, v] of razones) {
    const [userId, rol] = k.split("|");
    const n = v.r.length;
    const crudo = mediana_(v.r);
    const indice = (n * crudo + K_ENCOGER) / (n + K_ENCOGER);
    (porTecnico[userId] ||= {})[rol] = {
      n,
      indice: Math.round(indice * 1000) / 1000,
      medianaMs: Math.round(mediana_(v.ms)),
    };
  }

  return { porCelda: med.porCelda, porRol: med.porRol, nPorRol, porTecnico };
}

/** Lo mismo, apto para JSON (los Map no sobreviven a stringify). */
export function estandaresParaRed_(est) {
  const porCelda = {};
  const c = est?.porCelda;
  if (c instanceof Map) for (const [k, v] of c) porCelda[k] = Math.round(v);
  else Object.assign(porCelda, c || {});
  const porRol = {};
  for (const [k, v] of Object.entries(est?.porRol || {})) porRol[k] = Math.round(v);
  return { porCelda, porRol, nPorRol: { ...(est?.nPorRol || {}) }, porTecnico: est?.porTecnico || {} };
}

/**
 * normalDe_ — cuánto tarda de normal ESTE técnico en ESTE trabajo.
 *
 * @returns {{ms:number|null, tallerMs:number|null, indice:number|null, n:number, propio:boolean}}
 *   `propio` es false cuando no tiene carros suficientes y lo que se devuelve
 *   es el normal del taller.
 */
export function normalDe_(est, { userId, modelo, rol } = {}) {
  const r = String(rol || "").toUpperCase();
  const taller = medianaDe_(est, modelo, r);
  const t = userId ? est?.porTecnico?.[userId]?.[r] : null;
  if (!taller) return { ms: null, tallerMs: null, indice: null, n: t?.n || 0, propio: false };
  if (!t || t.n < MIN_N_TECNICO) {
    return { ms: Math.round(taller), tallerMs: Math.round(taller), indice: null, n: t?.n || 0, propio: false };
  }
  return { ms: Math.round(taller * t.indice), tallerMs: Math.round(taller), indice: t.indice, n: t.n, propio: true };
}
