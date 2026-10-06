// =========================
// lib/eta-carro.js
// Cuánto le falta a un carro que está en su plaza, y si alcanza el turno.
//
// POR QUÉ NO DICE UNA HORA DE RELOJ
// ─────────────────────────────────
// Medido sobre el taller (oct-2026), el reloj TRABAJADO de una mitad es
// estrecho: mediana 2,72 h en MOTOR y 2,88 h en TANQUE, con el 50% central
// entre 2,1 y 3,6 h. Sobre eso se puede decir algo.
//
// El reloj de PARED no: desde el INICIO hasta el FIN de la misma mitad son
// 4,2 h en la mediana, 11 h en el percentil 75 y 20 h en el 90. Toda esa
// diferencia es tiempo muerto —se acaba el turno y la mitad se cierra al día
// siguiente— y encima no está registrado: solo el 4% de las mitades tienen una
// PAUSA, pero hay 167 REANUDAR contra 24 PAUSA. El reloj se para por caminos
// que la OT no anota (marcar salida, pausa masiva del admin).
//
// Así que un "15:40" en la tarjeta sería falso la mayoría de las veces, y falso
// en la dirección que peor cae: el movilizador va por un carro que no está.
// Lo que se entrega son las dos cosas que los datos sí sostienen:
//
//     cuánto TRABAJO falta  ·  si eso cabe en lo que queda de turno
//
// Y SOLO CUANDO LAS DOS MITADES ESTÁN TRABAJANDO
// Con una sola mitad en el carro, lo que falta no depende del ritmo sino de que
// el despacho mande al otro: no es un pronóstico, es una apuesta sobre una
// decisión que nadie ha tomado. Ahí se dice el motivo y no un número.
//
// El carro acaba con la mitad que va MÁS ATRÁS, no con el promedio: medida la
// diferencia de trabajo entre las dos mitades del mismo carro, la mediana es
// 0,83 h y el percentil 90 son 2,5 h. Promediarlas prometería carros que no
// están.
//
// Puro y sin red: la lectura de datos vive en routes/zonas.js.
// =========================

import { mediana_ } from "./regresion.js";

/** Las dos mitades de un carro, en el orden en que se leen en la tarjeta. */
export const PUESTOS_CARRO = ["MOTOR", "TANQUE"];

/** Por qué un carro NO lleva número. Cada uno se explica distinto en pantalla. */
export const MOTIVO_ETA = {
  LISTO:      "LISTO",        // las dos mitades cerradas
  SIN_CARRO:  "SIN_CARRO",    // plaza vacía
  FALTA_UNO:  "FALTA_UNO",    // una mitad sin nadie: depende del despacho
  EN_PAUSA:   "EN_PAUSA",     // hay gente pero el reloj está parado
  SIN_BASE:   "SIN_BASE",     // no hay historia para medir este trabajo
};

/**
 * Mínimo de mitades cerradas para fiarse de la mediana de un modelo concreto.
 * Por debajo se usa la del puesto: un modelo con tres carros medidos dice más
 * de esos tres carros que del modelo.
 */
const MIN_N_MODELO = 8;

/**
 * Una mitad que duró más de esto por encima de la mediana de su puesto no es
 * trabajo, es una OT que nadie cerró (hay mitades de 49 h en la historia).
 * Entra en el cálculo de la mediana del puesto —ahí da igual, la mediana no se
 * mueve por los extremos— y se cae del de su modelo, donde con pocas filas sí
 * la movería.
 */
const FACTOR_ATIPICO = 3;

/**
 * medianasPorCelda_ — cuánto tarda cada trabajo, medido de la historia.
 *
 * "Celda" es modelo × puesto, la misma idea que usa lib/desempeno.js para
 * comparar técnicos: un Jetour y un VW Polo no son el mismo trabajo, y
 * mezclarlos devuelve un número que no describe a ninguno de los dos.
 *
 * @param {Array<{modelo:string, rol:string, ms:number}>} registros mitades YA cerradas
 * @returns {{ porCelda:Map<string,number>, porRol:Object, nPorCelda:Map<string,number> }}
 */
export function medianasPorCelda_(registros = []) {
  const limpios = (registros || [])
    .filter(r => Number(r?.ms) > 0 && PUESTOS_CARRO.includes(String(r?.rol || "").toUpperCase()))
    .map(r => ({
      modelo: String(r.modelo || "").trim(),
      rol: String(r.rol).toUpperCase(),
      ms: Number(r.ms),
    }));

  // Primero el listón por puesto: es el que sirve para descartar los atípicos
  // y el que se usa cuando un modelo no tiene historia suficiente.
  const porRol = {};
  for (const rol of PUESTOS_CARRO) {
    const m = mediana_(limpios.filter(r => r.rol === rol).map(r => r.ms));
    if (Number.isFinite(m) && m > 0) porRol[rol] = m;
  }

  const porCelda = new Map();
  const nPorCelda = new Map();
  const grupos = new Map();
  for (const r of limpios) {
    if (!r.modelo) continue;
    const techo = (porRol[r.rol] || 0) * FACTOR_ATIPICO;
    if (techo && r.ms > techo) continue;
    const k = `${r.modelo}|${r.rol}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r.ms);
  }
  for (const [k, ms] of grupos) {
    nPorCelda.set(k, ms.length);
    if (ms.length < MIN_N_MODELO) continue;
    const m = mediana_(ms);
    if (Number.isFinite(m) && m > 0) porCelda.set(k, m);
  }

  return { porCelda, porRol, nPorCelda };
}

/**
 * El listón de este trabajo: el de su modelo si hay historia, el del puesto si no.
 *
 * `porCelda` se acepta como Map o como objeto plano: el servidor lo calcula
 * como Map y viaja al navegador como JSON, y no merece dos funciones.
 */
export function medianaDe_(medianas, modelo, rol) {
  const r = String(rol || "").toUpperCase();
  const k = `${String(modelo || "").trim()}|${r}`;
  const celdas = medianas?.porCelda;
  const deCelda = celdas instanceof Map ? celdas.get(k) : celdas?.[k];
  return deCelda ?? medianas?.porRol?.[r] ?? null;
}

/** Las medianas en algo que sobreviva a JSON.stringify (los Map no). */
export function medianasParaRed_(medianas) {
  const porCelda = {};
  const celdas = medianas?.porCelda;
  if (celdas instanceof Map) for (const [k, v] of celdas) porCelda[k] = v;
  else Object.assign(porCelda, celdas || {});
  return { porCelda, porRol: { ...(medianas?.porRol || {}) } };
}

/**
 * minutosUtiles_ — minutos de trabajo que quedan hoy.
 *
 * Descuenta la comida si cae por delante: una hora de almuerzo entre ahora y el
 * fin del turno no es tiempo en el que el carro avance, y contarla haría
 * prometer carros que no salen.
 *
 * Todo en minutos desde la medianoche de Perú. Pasado el fin del turno devuelve
 * 0: lo que venga después es hora extra, que la decide el admin por persona y
 * no se puede dar por hecha (ver lib/proyeccion.js).
 *
 * @param {object} o
 * @param {number} o.ahoraMin
 * @param {number} o.finTurnoMin
 * @param {number} [o.comidaIniMin]
 * @param {number} [o.comidaFinMin]
 */
export function minutosUtiles_({ ahoraMin, finTurnoMin, comidaIniMin = null, comidaFinMin = null } = {}) {
  const ahora = Number(ahoraMin), fin = Number(finTurnoMin);
  if (!Number.isFinite(ahora) || !Number.isFinite(fin) || fin <= ahora) return 0;

  let utiles = fin - ahora;
  if (Number.isFinite(comidaIniMin) && Number.isFinite(comidaFinMin) && comidaFinMin > comidaIniMin) {
    const solape = Math.min(fin, comidaFinMin) - Math.max(ahora, comidaIniMin);
    if (solape > 0) utiles -= solape;
  }
  return Math.max(0, utiles);
}

/** Trabajo acumulado de una mitad AHORA: lo guardado más lo que lleva corriendo. */
function trabajadoMs_(puesto, ahoraMs) {
  const base = Number(puesto?.tiempoMs || 0);
  const estado = String(puesto?.estado || "").toUpperCase();
  if (estado !== "TRABAJANDO" || !puesto?.runningSince) return base;
  const desde = new Date(puesto.runningSince).getTime();
  if (!Number.isFinite(desde) || desde <= 0) return base;
  return base + Math.max(0, ahoraMs - desde);
}

/**
 * etaCarro_ — lo que le falta a este carro, o por qué no se puede decir.
 *
 * @param {object} o
 * @param {object} o.puestos        { MOTOR:{estado,tiempoMs,runningSince}|null, TANQUE:{…}|null }
 * @param {object} o.medianas       salida de medianasPorCelda_
 * @param {string} o.modelo         modelo_normalizado del carro
 * @param {number} o.ahoraMs
 * @param {number} o.minutosUtiles  salida de minutosUtiles_
 * @returns {{estimable:boolean, motivo?:string, faltaMs?:number, pasado?:boolean,
 *            alcanzaHoy?:boolean, puestoLento?:string}}
 */
export function etaCarro_({ puestos, medianas, modelo, ahoraMs = Date.now(), minutosUtiles = 0 } = {}) {
  const p = puestos || {};
  const estados = {};
  for (const rol of PUESTOS_CARRO) estados[rol] = String(p[rol]?.estado || "").toUpperCase();

  if (PUESTOS_CARRO.every(rol => estados[rol] === "FINALIZADO")) {
    return { estimable: false, motivo: MOTIVO_ETA.LISTO };
  }

  // Una mitad sin asignación es el caso más común de carro parado, y el único
  // que NO se arregla trabajando: lo arregla el despacho mandando a alguien.
  if (PUESTOS_CARRO.some(rol => !p[rol])) {
    const falta = PUESTOS_CARRO.filter(rol => !p[rol]);
    return { estimable: false, motivo: MOTIVO_ETA.FALTA_UNO, faltanPuestos: falta };
  }

  // Hay dupla, pero el reloj de alguna mitad no corre: la pausa la levanta una
  // persona y no se sabe cuándo. Estimar desde aquí sería inventarse esa hora.
  const enMarcha = (rol) => estados[rol] === "TRABAJANDO" || estados[rol] === "FINALIZADO";
  if (!PUESTOS_CARRO.every(enMarcha)) {
    return { estimable: false, motivo: MOTIVO_ETA.EN_PAUSA };
  }

  let faltaMs = 0;
  let puestoLento = null;
  let pasado = false;

  for (const rol of PUESTOS_CARRO) {
    if (estados[rol] === "FINALIZADO") continue;

    const base = medianaDe_(medianas, modelo, rol);
    if (!base) return { estimable: false, motivo: MOTIVO_ETA.SIN_BASE };

    const hecho = trabajadoMs_(p[rol], ahoraMs);
    const resta = base - hecho;

    // Ya pasó lo que tarda este trabajo de normal. No se estira la cuenta: el
    // carro puede salir en cualquier momento, y eso es lo que hay que decir.
    if (resta <= 0) { pasado = true; continue; }

    if (resta > faltaMs) { faltaMs = resta; puestoLento = rol; }
  }

  // El carro acaba con la mitad que va más atrás. Si una pasó de lo normal y la
  // otra no, manda la que todavía tiene cuenta por delante.
  if (faltaMs === 0) {
    return { estimable: true, faltaMs: 0, pasado: true, alcanzaHoy: minutosUtiles > 0, puestoLento: null };
  }

  return {
    estimable: true,
    faltaMs,
    pasado,
    alcanzaHoy: faltaMs <= minutosUtiles * 60_000,
    puestoLento,
  };
}
