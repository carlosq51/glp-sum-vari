// =========================
// lib/proyeccion.js
// Cuántos carros debería sacar HOY el taller con la gente que vino.
//
// POR QUÉ EXISTE
// ──────────────
// META_DIARIA es un número fijo (33) y vale lo mismo si vienen 23 técnicos o
// 15. Medido contra los días reales (agosto–octubre 2026) se queda lejos: el
// turno normal, hasta las 16:30, sacó 23 carros de media, y 33 solo se pasaba
// con horas extra. Comparado con 33, un día cualquiera erraba por 10 carros.
//
// La meta sigue como GUÍA. Esto no la sustituye: pone al lado lo que cabe
// esperar con la gente de hoy, y deja ver cuánta hora extra hace falta para
// acercarse a la meta.
//
// EL MODELO, Y POR QUÉ ES TAN SIMPLE
// ──────────────────────────────────
//   turno normal  = carros por técnico presente × técnicos presentes
//   horas extra   = mitades por hora × horas que se queda cada uno
//
// Se probaron dos más finos sobre 31 días, prediciendo cada uno solo con lo
// anterior a él:
//   · tasa × presentes ................. error medio ±2,9 carros
//   · tasa propia de cada técnico ...... ±3,2  (encogida hacia la de su rol)
//   · el cuello de botella min(M, T) ... ±3,3
//   · número fijo (la media) ........... ±4,1
// El de cada técnico pierde porque su historial va atrasado: el taller mejoró
// a fines de septiembre y la tasa individual tardaba semanas en enterarse.
//
// El error que queda (±3) NO es ruido del cálculo: hay días que la asistencia
// no explica (del 10 al 16-09 vinieron 17–21 y salieron 12–20, casi seguro por
// falta de carros en el patio). Por eso se entrega un RANGO y no un número.
//
// LA HORA EXTRA SE MIDE APARTE porque rinde distinto: quien se queda cierra
// ~0,4 mitades por hora frente a ~0,25 del turno — remata los carros que
// quedaron a medias a las 16:30. Y un carro necesita sus DOS mitades: si solo
// se quedan delanteros, no sale ningún carro entero, y eso se dice.
//
// Puro y sin red: la lectura de datos vive en routes/produccion.js.
// =========================

// Se toma el parser de cortes del cliente para que servidor y LIVE partan las
// franjas exactamente igual: son funciones puras, sin DOM.
import { bloquesJornada_, hhmmAMin_ } from "../public/js/core/format.js";

export { bloquesJornada_ };

/** Los dos puestos de un carro. */
export const ROLES_PROY = ["MOTOR", "TANQUE"];

/** Si la historia no alcanza para medir la hora extra, este es el valor medido a mano (oct-2026). */
const MITADES_EXTRA_HORA_DEFECTO = 0.4;
/**
 * Menos días que esto y no se proyecta: la tasa saldría de la suerte de una
 * semana. El sábado pide menos porque en 30 días solo hay cuatro o cinco.
 */
const DIAS_MINIMOS = { habil: 5, sabado: 3 };

/** "hábil" de lunes a viernes, "sabado" el medio día; el domingo no se proyecta. */
export function tipoDia_(dow) {
  if (dow >= 1 && dow <= 5) return "habil";
  if (dow === 6) return "sabado";
  return null;
}

/** Día de la semana de una fecha YYYY-MM-DD (0 domingo … 6 sábado). */
export function dowDe_(ymd) {
  const [a, m, d] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * Minuto de una hora "HH:MM" dentro de la jornada linealizada: lo que cae antes
 * del inicio de la jornada es madrugada del día siguiente (01:00 → 1500).
 */
export function minutoJornada_(hhmm, inicioMin = 300) {
  const m = hhmmAMin_(hhmm);
  if (m == null) return null;
  return m < inicioMin ? m + 1440 : m;
}

/** ¿El corte pertenece al turno normal? Lo es si EMPIEZA antes del fin de turno. */
export function esCorteTurno_(bloque, finTurnoMin) {
  return bloque.ini < finTurnoMin;
}

/**
 * Calibra el modelo con los días anteriores.
 *
 * @param {object}   p
 * @param {Array}    p.dias         [{ dow, presentes, carrosPorBloque:[nb], extra:{MOTOR:{mitades,horas},TANQUE:{…}} }]
 * @param {Array}    p.bloques      cortes ({ ini, fin } en minutos linealizados)
 * @param {number}   p.finTurnoMin  fin del turno normal (16:30 → 990)
 * @returns {{ habil, sabado, extraHora:{MOTOR,TANQUE} }}  habil/sabado null si no hay días suficientes
 */
export function calibrarProyeccion_({ dias, bloques, finTurnoMin }) {
  const enTurno = bloques.map(b => esCorteTurno_(b, finTurnoMin));
  const turnoDe_ = (d) => d.carrosPorBloque.reduce((s, n, i) => s + (enTurno[i] ? n : 0), 0);

  const porTipo = {};
  for (const tipo of ["habil", "sabado"]) {
    const ds = dias.filter(d => tipoDia_(d.dow) === tipo && d.presentes > 0);
    if (ds.length < DIAS_MINIMOS[tipo]) { porTipo[tipo] = null; continue; }

    const sumaTurno = ds.reduce((s, d) => s + turnoDe_(d), 0);
    const sumaPres  = ds.reduce((s, d) => s + d.presentes, 0);
    const tasa = sumaTurno / sumaPres;

    // Cuánto del turno cae en cada corte. Los cortes de horas extra pesan 0:
    // lo de después de las 16:30 lo explica la hora extra, no la asistencia.
    const pesos = bloques.map((_, i) => {
      if (!enTurno[i] || !sumaTurno) return 0;
      return ds.reduce((s, d) => s + (d.carrosPorBloque[i] || 0), 0) / sumaTurno;
    });

    // El error se mide como se usará: cada día predicho SIN él (dejar uno
    // fuera). Medirlo sobre los mismos días que fijaron la tasa lo achica.
    let errAbs = 0;
    for (let k = 0; k < ds.length; k++) {
      let st = 0, sp = 0;
      for (let j = 0; j < ds.length; j++) {
        if (j === k) continue;
        st += turnoDe_(ds[j]); sp += ds[j].presentes;
      }
      errAbs += Math.abs(turnoDe_(ds[k]) - (sp ? st / sp : 0) * ds[k].presentes);
    }

    porTipo[tipo] = {
      tasa, pesos, dias: ds.length,
      // Un error de 0 diría "esto es exacto", y nunca lo es.
      error: Math.max(1, errAbs / ds.length),
      mediaTurno: sumaTurno / ds.length,
    };
  }

  // Mitades por hora de quien se queda, por puesto. La hora de salida no se
  // registra (casi nadie marca la salida real), así que se toma la del último
  // cierre — y al menos una hora, para que quien cerró a las 16:35 no cuente
  // como un ritmo infinito.
  const extraHora = {};
  for (const rol of ROLES_PROY) {
    let mitades = 0, horas = 0;
    for (const d of dias) { mitades += d.extra?.[rol]?.mitades || 0; horas += d.extra?.[rol]?.horas || 0; }
    extraHora[rol] = horas >= 10 ? mitades / horas : MITADES_EXTRA_HORA_DEFECTO;
  }

  return { ...porTipo, extraHora };
}

/**
 * La proyección de una jornada.
 *
 * @param {object} p
 * @param {object} p.calib         salida de calibrarProyeccion_
 * @param {number} p.dow           día de la semana de la jornada
 * @param {object} p.presentes     { MOTOR: n, TANQUE: n } que marcaron asistencia
 * @param {Array}  p.extras        [{ rol: "MOTOR"|"TANQUE", hastaMin }] quienes se quedan
 * @param {Array}  p.bloques       cortes
 * @param {number} p.finTurnoMin   fin del turno normal
 * @returns {object|null}  null si ese día no se proyecta (domingo o sin historia)
 */
export function proyectarJornada_({ calib, dow, presentes, extras = [], bloques, finTurnoMin }) {
  const tipo = tipoDia_(dow);
  const c = tipo ? calib?.[tipo] : null;
  if (!c) return null;

  const nPres = (presentes?.MOTOR || 0) + (presentes?.TANQUE || 0);
  const turno = c.tasa * nPres;

  // ── Horas extra ────────────────────────────────────────────────────────
  const mitades = { MOTOR: 0, TANQUE: 0 };
  const minutosPorBloque = bloques.map(() => 0);
  for (const e of extras) {
    if (!ROLES_PROY.includes(e.rol)) continue;
    const horas = Math.max(0, (e.hastaMin - finTurnoMin) / 60);
    mitades[e.rol] += horas * (calib.extraHora?.[e.rol] ?? MITADES_EXTRA_HORA_DEFECTO);
    // Dónde caen esas horas, para repartir los carros extra entre los cortes.
    bloques.forEach((b, i) => {
      const ini = Math.max(b.ini, finTurnoMin), fin = Math.min(b.fin, e.hastaMin);
      if (fin > ini) minutosPorBloque[i] += fin - ini;
    });
  }
  // Un carro entero necesita las dos mitades: manda el puesto que menos aporta.
  const extra = Math.min(mitades.MOTOR, mitades.TANQUE);
  const totMin = minutosPorBloque.reduce((s, n) => s + n, 0);
  const falta = extras.length && extra === 0
    ? (mitades.MOTOR > 0 ? "TANQUE" : mitades.TANQUE > 0 ? "MOTOR" : null)
    : null;

  const porBloque = bloques.map((b, i) => {
    const deTurno = turno * (c.pesos[i] || 0);
    const deExtra = totMin ? extra * minutosPorBloque[i] / totMin : 0;
    const esperado = deTurno + deExtra;
    if (!esperado) return null;
    // El error del día se reparte con el mismo peso que los carros. Es una
    // aproximación (los cortes no fallan en proporción exacta), y por eso la
    // vista lo enseña como "entre", nunca como dato.
    const e = c.error * (c.pesos[i] || 0);
    return { esperado, min: Math.max(0, esperado - e), max: esperado + e, extra: deExtra };
  });

  const total = turno + extra;
  return {
    tipo,
    presentes: { MOTOR: presentes?.MOTOR || 0, TANQUE: presentes?.TANQUE || 0, total: nPres },
    tasa: c.tasa,
    diasCalibracion: c.dias,
    extraHora: calib.extraHora,
    turno: { esperado: turno, min: Math.max(0, turno - c.error), max: turno + c.error },
    extra: { esperado: extra, mitades, personas: extras.length, falta },
    total: { esperado: total, min: Math.max(0, total - c.error), max: total + c.error },
    porBloque,
  };
}

/**
 * Ritmo de cada técnico: mitades del turno normal por día que vino, encogido
 * hacia la media de su puesto según cuántos días lo sostienen (K días de
 * peso). Con tres días, "el más rápido" es casi siempre suerte.
 *
 * NO decide el total del día — eso lo hace tasa × presentes, que acertó más
 * (ver la cabecera) —, solo cómo se reparte ese total entre quienes vinieron.
 *
 * @param {Array} registros  [{ userId, rol, mitades }] un registro por técnico y día presente
 * @returns {{ porTecnico: {[userId]: { media, dias }}, mediaRol: {MOTOR, TANQUE} }}
 */
export function ritmosPorTecnico_(registros, K = 5) {
  const mediaRol = {};
  for (const rol of ROLES_PROY) {
    const rs = registros.filter(r => r.rol === rol);
    mediaRol[rol] = rs.length ? rs.reduce((s, r) => s + r.mitades, 0) / rs.length : 0;
  }
  const acc = new Map();
  for (const r of registros) {
    const a = acc.get(r.userId) || { rol: r.rol, suma: 0, dias: 0 };
    a.suma += r.mitades; a.dias++;
    acc.set(r.userId, a);
  }
  const porTecnico = {};
  for (const [id, a] of acc) {
    porTecnico[id] = { media: (a.suma + K * (mediaRol[a.rol] || 0)) / (a.dias + K), dias: a.dias };
  }
  return { porTecnico, mediaRol };
}

/**
 * La proyección persona por persona, en MITADES (la unidad en que el LIVE
 * cuenta a cada técnico).
 *
 * Turno normal: los carros del turno se reparten entre los presentes de cada
 * puesto según su ritmo. Cada carro es una mitad de motor y una de tanque, así
 * que lo de los delanteros suma exactamente los carros del turno, y lo de los
 * tanqueros también: la suma por técnico cuadra con la proyección del día.
 * Hora extra: mitades por hora de su puesto × horas que se queda.
 *
 * @param {Array}  p.tecnicos  [{ userId, rol, presente, hastaMin }]
 * @param {object} p.proyeccion salida de proyectarJornada_
 * @param {object} p.ritmos    salida de ritmosPorTecnico_
 * @returns {Array} [{ userId, ritmo, diasHist, turno, extra, total }]
 */
export function proyeccionPorTecnico_({ tecnicos, proyeccion, ritmos, finTurnoMin }) {
  if (!proyeccion) return [];
  const ritmo_ = (t) => ritmos?.porTecnico?.[t.userId]?.media ?? ritmos?.mediaRol?.[t.rol] ?? 1;
  const pesoRol = {};
  for (const t of tecnicos) if (t.presente) pesoRol[t.rol] = (pesoRol[t.rol] || 0) + ritmo_(t);

  return tecnicos.map(t => {
    const turno = t.presente && pesoRol[t.rol] > 0
      ? proyeccion.turno.esperado * ritmo_(t) / pesoRol[t.rol]
      : 0;
    const horas = t.hastaMin != null ? Math.max(0, (t.hastaMin - finTurnoMin) / 60) : 0;
    const extra = horas * (proyeccion.extraHora?.[t.rol] ?? MITADES_EXTRA_HORA_DEFECTO);
    return {
      userId: t.userId,
      ritmo: ritmo_(t),
      diasHist: ritmos?.porTecnico?.[t.userId]?.dias || 0,
      turno, extra, total: turno + extra,
    };
  });
}

/**
 * La meta del día y la ventana en la que se reparte, para el "lo esperado a
 * esta hora" del LIVE.
 *
 * Por defecto la meta guía (33) se cumple al fin del turno normal (16:30). Si
 * el admin anota que alguien se queda, la ventana se alarga hasta la salida
 * más tardía y la meta crece por regla de 3: 33 en 07:00–16:30 (9,5 h) son
 * ≈43 hasta las 19:30 (12,5 h). Antes se repartía entre las 05:00 y las 02:00
 * aunque nadie se quedara, y a media tarde el panel decía "vamos por encima".
 *
 * Es una regla de 3 a propósito (decisión del usuario, 2026-10-05): supone que
 * el ritmo del turno sigue igual en la hora extra, aunque se quede menos gente.
 *
 * @returns {{ meta, base, desdeMin, hastaMin, extendida }}
 */
export function metaVentana_({ meta, inicioTurnoMin, finTurnoMin, extras = [] }) {
  const hastaMin = Math.max(finTurnoMin, ...extras.map(e => e.hastaMin).filter(Number.isFinite));
  const base = Number(meta) || 0;
  const span = finTurnoMin - inicioTurnoMin;
  const metaV = span > 0 ? Math.round(base * (hastaMin - inicioTurnoMin) / span) : base;
  return { meta: metaV, base, desdeMin: inicioTurnoMin, hastaMin, extendida: hastaMin > finTurnoMin };
}

/**
 * Cuánta hora extra haría falta para alcanzar la meta guía, dicho en la unidad
 * que el admin puede decidir: parejas (delantero + tanquero) que se quedan
 * hasta el fin de un corte de la tarde.
 *
 * Se prueba primero el corte más temprano y se alarga mientras las parejas
 * necesarias no quepan en la gente que vino: "11 parejas hasta las 19:30" con
 * 9 delanteros en el taller no es un consejo, es un imposible.
 *
 * @returns {{ faltan, parejas, hastaMin, alcanza }|null}  null si ya se llega o no se puede decir
 */
export function horasExtraParaMeta_({ proyeccion, meta, bloques, finTurnoMin }) {
  if (!proyeccion || !(meta > 0)) return null;
  const faltan = meta - proyeccion.total.esperado;
  if (faltan <= 0.5) return null;
  const tasa = Math.min(...ROLES_PROY.map(r => proyeccion.extraHora?.[r] ?? MITADES_EXTRA_HORA_DEFECTO));
  if (!(tasa > 0)) return null;
  const maxParejas = Math.min(proyeccion.presentes?.MOTOR || 0, proyeccion.presentes?.TANQUE || 0);

  let ultimo = null;
  for (const corte of bloques.filter(b => b.ini >= finTurnoMin)) {
    const parejas = Math.ceil(faltan / (tasa * (corte.fin - finTurnoMin) / 60));
    ultimo = { faltan, parejas, hastaMin: corte.fin, alcanza: parejas <= maxParejas };
    if (ultimo.alcanza) return ultimo;
  }
  return ultimo;
}
