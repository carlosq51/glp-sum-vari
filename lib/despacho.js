// =========================
// lib/despacho.js
// Lógica pura del módulo de despacho: jornada, QR rotativo y máquina de
// estados del técnico. Sin acceso a red — todo aquí es testeable en frío.
//
// AISLAMIENTO: este módulo no lo importa ningún flujo existente. Mientras
// DESPACHO_MODO = 'OFF' nada de esto se ejecuta en producción.
// =========================

import { createHmac, timingSafeEqual } from "crypto";

// Perú es UTC-5 fijo, sin horario de verano. Se usa Intl (no un offset
// hardcodeado) para que el día siga siendo correcto si eso alguna vez cambia.
const TZ = "America/Lima";

// La jornada operativa corre 06:00 → 05:00 del día siguiente. Debe coincidir
// con glp_jornada_fecha() en supabase/despacho.sql — si uno cambia, cambia el
// otro. (El bug del commit 0686079 nació de tener dos cortes distintos.)
export const JORNADA_INICIO_H = 6;

/** Partes de fecha/hora en hora Perú, como números. */
export function partesPeru_(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return {
    anio: +p.year, mes: +p.month, dia: +p.day,
    hora: +p.hour % 24, min: +p.minute, seg: +p.second,
  };
}

/**
 * Fecha de la jornada a la que pertenece un instante (YYYY-MM-DD).
 * Un evento a las 02:00 del martes pertenece a la jornada del lunes.
 */
export function jornadaFecha_(date = new Date()) {
  const { anio, mes, dia, hora } = partesPeru_(date);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (hora < JORNADA_INICIO_H) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Rango [desde, hasta) de una jornada, en instantes UTC reales. */
export function jornadaRango_(fecha) {
  const [a, m, d] = String(fecha).split("-").map(Number);
  // 06:00 hora Perú = 11:00 UTC (UTC-5).
  const desde = new Date(Date.UTC(a, m - 1, d, JORNADA_INICIO_H + 5, 0, 0));
  const hasta = new Date(desde.getTime() + 23 * 3600_000);
  return { desde, hasta };
}

/** "HH:MM" en hora Perú. */
export function horaPeru_(date = new Date()) {
  const { hora, min } = partesPeru_(date);
  return `${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Minutos transcurridos desde medianoche Perú (para comparar con "07:00"). */
export function minutosDelDia_(date = new Date()) {
  const { hora, min } = partesPeru_(date);
  return hora * 60 + min;
}

/** "07:00" → 420. Devuelve null si el formato no es válido. */
export function hhmmAMinutos_(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// ─── VENTANA DE TURNO ─────────────────────────────────────────────────────────
// El turno productivo puede CRUZAR MEDIANOCHE (07:00 → 01:00). Comparar
// `ini <= ahora <= fin` a secas da falso todo el día cuando fin < ini, así que
// toda pregunta sobre el turno pasa por estos dos helpers.

/** Duración del turno en minutos, contando el cruce de medianoche. */
export function duracionTurno_(iniMin, finMin) {
  if (iniMin === finMin) return 1440;              // turno de 24 h
  return iniMin < finMin ? finMin - iniMin : 1440 - iniMin + finMin;
}

/**
 * ¿`ahoraMin` cae dentro del turno? Con fin < ini la ventana son dos tramos:
 * de `ini` a medianoche y de medianoche a `fin`.
 */
export function enTurno_(ahoraMin, iniMin, finMin) {
  if (iniMin == null || finMin == null) return true;
  if (iniMin === finMin) return true;
  return iniMin < finMin
    ? ahoraMin >= iniMin && ahoraMin <= finMin
    : ahoraMin >= iniMin || ahoraMin <= finMin;
}

// ─── QR ROTATIVO ──────────────────────────────────────────────────────────────
// La TV muestra el QR y el técnico lo escanea, no al revés: así la marca prueba
// presencia física en el taller. Un QR estático en el celular se comparte por
// WhatsApp; uno que cambia cada 30s en una pantalla del taller, no.
//
// El token es autocontenido (slot + HMAC), sin estado en servidor. El anti-
// replay vive en la BD: índice único sobre asistencia_marcas.token_slot, así
// que dos técnicos no pueden consumir la misma captura del mismo slot.

function secretoQr_() {
  // Cae a una constante de desarrollo si no hay secreto configurado: permite
  // probar la pantalla sin .env, pero nunca debe llegar así a producción.
  return process.env.DESPACHO_QR_SECRET || "glp-despacho-dev-secret";
}

/** Número de ventana temporal actual. */
export function slotActual_(ventanaSeg = 30, date = new Date()) {
  return Math.floor(date.getTime() / 1000 / Math.max(5, ventanaSeg));
}

/** Token firmado para un slot: "<slot>.<firma>". */
export function firmarSlot_(slot) {
  const firma = createHmac("sha256", secretoQr_())
    .update(String(slot))
    .digest("base64url")
    .slice(0, 22);
  return `${slot}.${firma}`;
}

// Gracia tras el cambio de código, en segundos. Cubre a quien apuntó la
// cámara justo antes del cambio. Es un valor FIJO y no una ventana entera:
// con ventanas largas, aceptar el slot anterior completo duplicaría la vida
// real del QR (una ventana de 5 min valdría 10).
export const GRACIA_SEG = 15;

/**
 * Verifica un token de QR. Acepta el código vigente y, durante unos segundos
 * después del cambio, también el inmediatamente anterior.
 * → { ok, slot, error }
 */
export function verificarToken_(token, ventanaSeg = 30, date = new Date()) {
  const partes = String(token || "").split(".");
  if (partes.length !== 2) return { ok: false, error: "Token mal formado" };

  const slot = Number(partes[0]);
  if (!Number.isFinite(slot)) return { ok: false, error: "Token mal formado" };

  const esperado = firmarSlot_(slot);
  const a = Buffer.from(esperado);
  const b = Buffer.from(`${partes[0]}.${partes[1]}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "Token inválido" };
  }

  const ventana = Math.max(5, ventanaSeg);
  const ahora = slotActual_(ventana, date);
  if (slot === ahora) return { ok: true, slot };

  const segDentroDelSlot = Math.floor(date.getTime() / 1000) % ventana;
  if (slot === ahora - 1 && segDentroDelSlot <= GRACIA_SEG) return { ok: true, slot };

  return { ok: false, error: "El código ya venció — escanea el nuevo" };
}

// ─── MÁQUINA DE ESTADOS DEL TÉCNICO ───────────────────────────────────────────
// FUERA → PRESENTE → DISPONIBLE → OCUPADO → PAUSA → FUERA
//
// La distinción que importa: PRESENTE (marcó ingreso) no es DISPONIBLE
// (elegible para recibir carro). Sin PAUSA, el despachador le asigna trabajo
// a alguien que está almorzando y la pantalla pierde credibilidad el día uno.

export const TRANSICIONES = {
  FUERA:      { INGRESO: "PRESENTE" },
  PRESENTE:   { SALIDA: "FUERA", PAUSA_INI: "PAUSA", CIERRE_AUTO: "FUERA" },
  DISPONIBLE: { SALIDA: "FUERA", PAUSA_INI: "PAUSA", CIERRE_AUTO: "FUERA" },
  OCUPADO:    { SALIDA: "FUERA", PAUSA_INI: "PAUSA", CIERRE_AUTO: "FUERA" },
  PAUSA:      { PAUSA_FIN: "PRESENTE", SALIDA: "FUERA", CIERRE_AUTO: "FUERA" },
};

/** ¿La marca es válida desde el estado actual? → { ok, siguiente, error } */
export function aplicarMarca_(estadoActual, tipoMarca) {
  const estado = TRANSICIONES[estadoActual] ? estadoActual : "FUERA";
  const siguiente = TRANSICIONES[estado]?.[tipoMarca];
  if (!siguiente) {
    const legible = {
      INGRESO:   "ya marcaste tu ingreso",
      SALIDA:    "no tienes un ingreso abierto",
      PAUSA_INI: "no puedes pausar ahora",
      PAUSA_FIN: "no estás en pausa",
    }[tipoMarca] || "transición no permitida";
    return { ok: false, error: legible };
  }
  return { ok: true, siguiente };
}

/**
 * Estado efectivo para el despacho. PRESENTE se vuelve DISPONIBLE solo DENTRO
 * del turno: el técnico llega 06:00 pero el trabajo se reparte desde las 07:00.
 *
 * `turnoFinMin` cierra la ventana por el otro lado. Importa con turnos que
 * cruzan medianoche: sin él, a las 02:00 un técnico que sigue marcado seguiría
 * saliendo DISPONIBLE y el motor le mandaría carros con el turno ya cerrado.
 * Omitirlo mantiene el comportamiento viejo (solo compara contra el inicio).
 */
export function estadoEfectivo_(estado, { turnoInicioMin, turnoFinMin = null, ahoraMin, tieneTrabajo }) {
  if (estado === "FUERA" || estado === "PAUSA") return estado;
  if (tieneTrabajo) return "OCUPADO";
  const dentro = turnoFinMin == null
    ? ahoraMin >= turnoInicioMin
    : enTurno_(ahoraMin, turnoInicioMin, turnoFinMin);
  return dentro ? "DISPONIBLE" : "PRESENTE";
}

/** ¿Es elegible para recibir un vehículo? */
export function esAsignable_(estadoEfectivo) {
  return estadoEfectivo === "DISPONIBLE";
}

/**
 * Reconstruye el estado de un técnico desde su bitácora de marcas.
 * asistencia_marcas es la fuente de verdad; asistencia_jornada es solo una
 * proyección que se puede recalcular con esto si se corrompe.
 */
export function reconstruirJornada_(marcas = []) {
  const orden = [...marcas].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let estado = "FUERA";
  let ingresoAt = null, salidaAt = null, salidaAuto = false;
  let pausaDesde = null, minutosPausa = 0;

  for (const m of orden) {
    const r = aplicarMarca_(estado, m.tipo);
    if (!r.ok) continue; // marca incoherente en la bitácora → se ignora
    const ts = new Date(m.ts);

    if (m.tipo === "INGRESO" && !ingresoAt) ingresoAt = ts;
    if (m.tipo === "PAUSA_INI") pausaDesde = ts;
    if (m.tipo === "PAUSA_FIN" && pausaDesde) {
      minutosPausa += Math.round((ts - pausaDesde) / 60000);
      pausaDesde = null;
    }
    if (m.tipo === "SALIDA" || m.tipo === "CIERRE_AUTO") {
      salidaAt = ts;
      salidaAuto = m.tipo === "CIERRE_AUTO";
      if (pausaDesde) {
        minutosPausa += Math.round((ts - pausaDesde) / 60000);
        pausaDesde = null;
      }
    }
    estado = r.siguiente;
  }

  return { estado, ingresoAt, salidaAt, salidaAuto, pausaDesde, minutosPausa };
}

// ─── UNIDADES DE TRABAJO ──────────────────────────────────────────────────────
// El motor NO asigna por técnico: asigna por unidad. Una unidad es un técnico
// solo o una dupla del mismo rol, y ocupa UN puesto de carro a la vez.
//
// Ese es todo el mecanismo anti-acaparamiento: dos tanqueros que se juntan
// dejan de ser dos receptores de carro y pasan a ser uno. No hay regla extra
// que mantener ni caso especial en el ranking — un técnico solo es,
// simplemente, una dupla de uno.

/**
 * Arma las unidades asignables a partir de los técnicos y las duplas activas.
 * @param {Array} tecnicos  [{ user_id, nombre, especialidad, estadoEfectivo }]
 * @param {Array} duplas    [{ id, rol_trabajo, miembros:[user_id], ... }] solo ACTIVAS
 */
export function unidadesDeTrabajo_(tecnicos = [], duplas = []) {
  const porId = new Map(tecnicos.map(t => [t.user_id, t]));
  const enDupla = new Set();
  const unidades = [];

  for (const d of duplas) {
    const miembros = (d.miembros || []).map(id => porId.get(id)).filter(Boolean);
    // Una dupla con un solo miembro presente (el otro no marcó o ya se fue)
    // degrada a técnico solo en vez de quedar inasignable.
    if (!miembros.length) continue;
    for (const m of miembros) enDupla.add(m.user_id);

    unidades.push({
      tipo: miembros.length > 1 ? "DUPLA" : "SOLO",
      duplaId: miembros.length > 1 ? d.id : null,
      rol: d.rol_trabajo,
      miembros,
      // Una unidad es asignable si TODOS sus miembros lo son: si uno está en
      // pausa, la dupla no puede arrancar un carro.
      asignable: miembros.every(m => esAsignable_(m.estadoEfectivo)),
      ultimoResponsable: d.ultimo_responsable_user_id || null,
    });
  }

  for (const t of tecnicos) {
    if (enDupla.has(t.user_id)) continue;
    unidades.push({
      tipo: "SOLO",
      duplaId: null,
      rol: t.especialidad,
      miembros: [t],
      asignable: esAsignable_(t.estadoEfectivo),
      ultimoResponsable: null,
    });
  }

  return unidades;
}

/**
 * A quién le toca el crédito del próximo carro de una unidad. Alternancia
 * pura: si el último fue A, ahora va B.
 *
 * IMPORTANTE — el conteo es SOLO de los carros de esta dupla, no de la
 * jornada. Si A trabajó 3 carros solo antes de emparejarse, esos 3 son suyos
 * y la dupla no se los "cobra": la dupla reparte únicamente lo que produce
 * junta. Pasarle aquí los carros del día entero le regalaría a quien llegó
 * tarde los primeros carros de la dupla, castigando al que ya venía
 * trabajando.
 *
 * El desempate por conteo solo actúa si la alternancia se desfasó — por
 * ejemplo un carro de la dupla anulado o reasignado. En operación normal
 * nunca se activa.
 *
 * @param {object} unidad          de unidadesDeTrabajo_
 * @param {Map}    creditosDupla   user_id → carros acreditados DENTRO de esta dupla
 */
export function proximoResponsable_(unidad, creditosDupla = new Map()) {
  const ms = unidad?.miembros || [];
  if (!ms.length) return null;
  if (ms.length === 1) return ms[0].user_id;

  const cred = m => Number(creditosDupla.get(m.user_id) || 0);
  const [a, b] = ms;

  if (cred(a) !== cred(b)) return cred(a) < cred(b) ? a.user_id : b.user_id;

  // Empatados → alterna respecto del último carro de la dupla.
  if (unidad.ultimoResponsable === a.user_id) return b.user_id;
  if (unidad.ultimoResponsable === b.user_id) return a.user_id;
  return a.user_id;   // primer carro de la dupla
}

/** ¿Estos dos técnicos pueden formar dupla? → { ok, rol, error } */
export function validarDupla_(a, b, { yaEnDupla = new Set() } = {}) {
  if (!a || !b) return { ok: false, error: "Falta un técnico" };
  if (a.id === b.id) return { ok: false, error: "No puedes emparejarte contigo mismo" };
  if (!a.activo || !b.activo) return { ok: false, error: "Hay un técnico inactivo" };

  if (yaEnDupla.has(a.id)) return { ok: false, error: `${a.nombre} ya está en una dupla hoy` };
  if (yaEnDupla.has(b.id)) return { ok: false, error: `${b.nombre} ya está en una dupla hoy` };

  // Mismo rol: la dupla cubre UN puesto del carro. Un motorista y un tanquero
  // trabajando el mismo carro no son una dupla — son el flujo normal.
  const ea = String(a.especialidad || "").toUpperCase();
  const eb = String(b.especialidad || "").toUpperCase();
  const roles = ["MOTOR", "TANQUE"];

  const posibles = roles.filter(r =>
    (ea === r || ea === "AMBOS") && (eb === r || eb === "AMBOS"));

  if (!posibles.length) {
    return { ok: false, error: "Una dupla es de dos técnicos del mismo rol" };
  }
  // Si ambos son AMBOS, no se puede inferir: que lo diga quien la propone.
  return { ok: true, rol: posibles.length === 1 ? posibles[0] : null, opciones: posibles };
}

// ─── DATOS DE DEMO ────────────────────────────────────────────────────────────
// Payload sintético para ver la pantalla sin base de datos ni taller abierto.
// Se sirve solo bajo ?demo=1 — nunca se mezcla con datos reales.

const DEMO_TECNICOS = [
  { nombre: "MICHAEL CAHUANA",  especialidad: "MOTOR"  },
  { nombre: "IVAN ABAD",        especialidad: "TANQUE" },
  { nombre: "ANA LUCIA",        especialidad: "MOTOR"  },
  { nombre: "HEINER TORRES",    especialidad: "TANQUE" },
  { nombre: "LUIS URIBE",       especialidad: "MOTOR"  },
  { nombre: "VICTOR BAILON",    especialidad: "TANQUE" },
  { nombre: "MEJIA MIGUEL",     especialidad: "MOTOR"  },
  { nombre: "ALFREDO AYARZA",   especialidad: "TANQUE" },
  { nombre: "GROBERT JOEL",     especialidad: "MOTOR"  },
  { nombre: "NOLASCO JORGE",    especialidad: "TANQUE" },
  { nombre: "FRANZ COSTILLA",   especialidad: "MOTOR"  },
  { nombre: "JONATAN RAMOS",    especialidad: "TANQUE" },
];

export function payloadDemo_(date = new Date()) {
  const hhmm = horaPeru_(date);
  const t = DEMO_TECNICOS;

  return {
    demo: true,
    modo: "REAL",
    jornada: jornadaFecha_(date),
    hora: hhmm,
    asistencia: { presentes: 10, esperados: 12, ausentes: ["JONATAN RAMOS", "FRANZ COSTILLA"] },
    // Va 2 abajo del ritmo a propósito: el caso interesante de ver en pantalla
    // no es el día perfecto, es el día que se está atrasando.
    meta: { completos: 11, objetivo: 25, esperado: 13, diferencia: -2, proyeccion: 21 },
    incidencias: [
      { hora: "10:14", vin: "LSJA24U97PZ041882", tecnico: "IVAN ABAD",       tipo: "MODERADA", nota: "Fuga en conexión de tanque, falta abrazadera" },
      { hora: "09:38", vin: "LVVDB21B8PD502944", tecnico: "LUIS URIBE",      tipo: "LEVE",     nota: "Tornillo de soporte cruzado" },
      { hora: "08:52", vin: "LSJA24U91PZ040055", tecnico: "ALFREDO AYARZA",  tipo: "CRITICA",  nota: "Reductor con daño de fábrica, se pide cambio" },
    ],
    varados: [
      { zona: 1, vin: "LSJA24U92PZ043558", minutos: 255 },
    ],
    asignaciones: [
      {
        zona: 4, vin: "LSJA24U97PZ041882", modelo: "Jetour X70",
        motor: t[0].nombre, tanque: t[1].nombre,
        estado: "TRABAJANDO", desde: "09:12",
        razon: "Zona 4 · X70 es su modelo más rápido",
      },
      {
        zona: 7, vin: "LSJA24U9XPZ043117", modelo: "Jetour X70",
        motor: t[2].nombre, tanque: t[3].nombre,
        estado: "TRABAJANDO", desde: "09:40",
        razon: "Dupla con mejor ritmo compartido",
      },
      {
        zona: 2, vin: "LVVDB21B8PD502944", modelo: "KYC V5",
        motor: t[4].nombre, tanque: t[5].nombre,
        estado: "NUEVA", desde: hhmm,
        razon: "Ambos libres · zona más cercana",
      },
      {
        zona: 6, vin: "LSJA24U96PZ042910", modelo: "Jetour X70",
        motor: t[10].nombre, tanque: t[11].nombre,
        estado: "TRABAJANDO", desde: "09:04",
        razon: "Zona contigua · sin cruzar el taller",
      },
      {
        zona: 11, vin: "LSJA24U91PZ040055", modelo: "Jetour X70",
        motor: t[6].nombre, tanque: t[7].nombre,
        estado: "TRABAJANDO", desde: "08:55",
        razon: "Van 1 de 2 carros · prioridad por meta",
      },
    ],
    cola: [
      { zona: 9,  vin: "LSJA24U93PZ041290", modelo: "Jetour X70", espera: "18 min" },
      { zona: 13, vin: "LVVDB21B4PD503801", modelo: "KYC V7",     espera: "6 min"  },
      { zona: 5,  vin: "LSJA24U95PZ042044", modelo: "Jetour X70", espera: "2 min"  },
    ],
    libres: [
      { nombre: t[8].nombre,  especialidad: "MOTOR",  desde: "10:05" },
      { nombre: t[9].nombre,  especialidad: "TANQUE", desde: "10:11" },
    ],
  };
}
