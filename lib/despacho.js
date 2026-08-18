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

/**
 * Slot del QR FIJO — el que se imprime y se pega en la puerta mientras no hay
 * TV en el taller.
 *
 * Es el slot 0: un número que la rotación real nunca produce (slotActual_
 * devuelve segundos/ventana, del orden de 5.9 millones hoy y creciendo), así
 * que un token fijo jamás puede confundirse con uno rotativo ni al revés. Y
 * como igual va firmado con el mismo HMAC, sigue sin poder fabricarse desde
 * fuera: lo que se pierde con el QR fijo es la prueba de presencia (una foto
 * del papel sirve desde la casa), no la autenticidad del código.
 *
 * Solo se acepta cuando DESPACHO_QR_ESTATICO está encendido — ver
 * verificarToken_. Apagar el flag invalida de golpe todo papel impreso.
 */
export const SLOT_ESTATICO = 0;

/** Token del QR fijo. Mismo formato que el rotativo, pero no vence. */
export function tokenEstatico_() {
  return firmarSlot_(SLOT_ESTATICO);
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
 *
 * Con `estatico`, acepta además el token del QR fijo (slot 0). Ese caso
 * devuelve `slot: null` a propósito: el anti-replay de la BD es un índice
 * único sobre (token_slot, user_id), así que guardar el slot fijo dejaría
 * marcar UNA sola vez en la vida a cada técnico — entraría por la mañana y su
 * salida chocaría contra el índice. Sin slot no hay anti-replay, que es
 * exactamente lo que se está aceptando al colgar un papel en la puerta.
 *
 * → { ok, slot, estatico, error }
 */
export function verificarToken_(token, ventanaSeg = 30, date = new Date(), { estatico = false } = {}) {
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

  if (slot === SLOT_ESTATICO) {
    return estatico
      ? { ok: true, slot: null, estatico: true }
      : { ok: false, error: "Ese código ya no vale — escanea el de la pantalla" };
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
 * ¿La invitación a dupla ya caducó y deja de bloquear a sus miembros?
 *
 * Una PENDIENTE saca del reparto a los DOS técnicos mientras se decide. Ese
 * bloqueo es correcto durante unos minutos y desastroso durante una jornada:
 * si el invitado nunca contesta, ambos se quedan sin carro sin que nada lo
 * explique. Pasado el TTL, la propuesta deja de valer y vuelven a la cola.
 */
export function duplaPendienteVencida_(dupla, ahoraMs = Date.now(), ttlMin = 10) {
  const desde = new Date(dupla?.propuesta_at || 0).getTime();
  if (!Number.isFinite(desde) || desde <= 0) return true;   // sin fecha → no bloquea
  return (ahoraMs - desde) / 60000 >= Math.max(0, ttlMin);
}

/**
 * Arma las unidades asignables a partir de los técnicos y las duplas del día.
 *
 * Acepta ACTIVAS y PENDIENTES, y NO son lo mismo: la activa es una unidad que
 * trabaja, la pendiente es una unidad que todavía no existe pero que ya tiene
 * que reservar a sus dos miembros. Darle un carro a quien está esperando
 * respuesta rompe la dupla antes de nacer — el invitado acepta y se encuentra
 * al compañero ya metido en otro carro.
 *
 * @param {Array} tecnicos  [{ user_id, nombre, especialidad, estadoEfectivo }]
 * @param {Array} duplas    [{ id, rol_trabajo, estado, propuesta_at, miembros:[user_id], ... }]
 */
export function unidadesDeTrabajo_(tecnicos = [], duplas = [], opts = {}) {
  const { ahoraMs = Date.now(), ttlPendienteMin = 10 } = opts;
  const porId = new Map(tecnicos.map(t => [t.user_id, t]));
  const enDupla = new Set();
  const unidades = [];

  for (const d of duplas) {
    const miembros = (d.miembros || []).map(id => porId.get(id)).filter(Boolean);
    // Una dupla con un solo miembro presente (el otro no marcó o ya se fue)
    // degrada a técnico solo en vez de quedar inasignable.
    if (!miembros.length) continue;

    if (String(d.estado || "").toUpperCase() === "PENDIENTE") {
      // Caducada: se ignora por completo y sus miembros salen abajo como solos.
      if (duplaPendienteVencida_(d, ahoraMs, ttlPendienteMin)) continue;

      for (const m of miembros) enDupla.add(m.user_id);
      // Nace inasignable y sin duplaId: no es una unidad de trabajo, es una
      // reserva. Sin `duplaId` ninguna propuesta puede colgarse de una dupla
      // que quizá se rechace dentro de un minuto.
      unidades.push({
        tipo: "PENDIENTE",
        duplaId: null,
        rol: d.rol_trabajo,
        miembros,
        asignable: false,
        bloqueo: "DUPLA_PENDIENTE",
        ultimoResponsable: null,
      });
      continue;
    }

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

// ─── VIDA DE UNA PROPUESTA ────────────────────────────────────────────────────

/**
 * Por qué muere una propuesta viva, o null si sigue en pie.
 *
 * Una propuesta reserva un puesto de carro: mientras viva, ni ese puesto ni ese
 * técnico entran al reparto. Por eso equivocarse aquí es caro en una sola
 * dirección — una propuesta que muere de más solo hace que el motor la vuelva a
 * generar en la corrida siguiente; una que no muere nunca deja al técnico sin
 * trabajo el resto de la jornada, y en silencio.
 *
 * @param {object} p  la propuesta { vin, rol_trabajo, user_id, asignacion_id }
 * @param {Set}    vinesEnZona   VINs que siguen estacionados en el taller
 * @param {Set}    finalizados   "<vin>|<rol>" de los puestos ya cerrados
 * @param {Map}    asgPorId      id → { user_id, activo } de las asignaciones
 */
export function porQueMuereLaPropuesta_(p, { vinesEnZona, finalizados, asgPorId } = {}) {
  if (vinesEnZona && !vinesEnZona.has(p.vin)) return "El carro salió de zona";
  if (finalizados?.has(`${p.vin}|${p.rol_trabajo}`)) return "El puesto ya se cerró";

  // Sin OT real detrás no hay nada que reservar. Antes era al revés — "aún sin
  // OT real: sigue viva" — de cuando la propuesta precedía a la asignación; hoy
  // toda propuesta viva nace con la suya, así que un null es un accidente. Y era
  // el accidente MÁS caro: ninguna de las otras dos condiciones puede matarla
  // (el VIN sigue en zona, y el puesto no se finaliza nunca porque nadie lo está
  // trabajando), así que el técnico quedaba reservado para un carro inexistente
  // hasta el cierre de la jornada. (Caso real: LUIS URIBE, 2026-08-14, zona 15.)
  if (!p.asignacion_id) return "Se publicó sin asignación real";

  // La propuesta es un espejo de la asignación, y el espejo se despega: basta un
  // PATCH de user_id desde la consola, o un activo=false, para que siga
  // reservando a alguien que ya no tiene el carro.
  const a = asgPorId?.get(p.asignacion_id);
  if (!a) return "La asignación que la respaldaba ya no existe";
  if (!a.activo) return "La asignación que la respaldaba se dio de baja";
  if (a.user_id !== p.user_id) return "El puesto se reasignó a otro técnico";
  return null;
}

/**
 * Quiénes pueden avanzar un carro SIN estar en dupla, leído de
 * DESPACHO_AVANCE_SOLO ("*" = todos · o user_id separados por coma).
 *
 * Es una excepción nominal: quien trabaja con ayudantes que no marcan
 * asistencia no puede formar dupla en el sistema, aunque en el taller la
 * tenga de hecho. Sin la excepción tendría que elegir entre mentirle al
 * sistema (emparejarse con alguien que no está) o perder la ventaja de tener
 * ayuda. El comodín "*" abre el permiso a todo el taller — se usó durante el
 * desorden de agosto 2026 y se cerró al pasar; ver avanceSoloTodos_.
 */
export function avanceSolo_(cfg) {
  return new Set(String(cfg?.DESPACHO_AVANCE_SOLO || "")
    .split(",").map(s => s.trim()).filter(Boolean));
}

/** ¿El permiso de avanzar sin dupla está abierto a todo el taller? */
export function avanceSoloTodos_(cfg) {
  return String(cfg?.DESPACHO_AVANCE_SOLO || "").trim() === "*";
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

// ─── DUPLA AUTOMÁTICA DEL CARRO EXTRA ─────────────────────────────────────────
// Pasada la meta del día, el taller deja de rendir por persona y empieza a
// rendir por carro: el que va en su carro nº meta+1 lo está haciendo solo, y el
// siguiente que cierra su meta no necesita otro carro — necesita acabar ESE.
//
// Por eso el sistema los junta sin preguntar: cuando alguien queda libre con la
// meta cumplida y hay un compañero de su mismo rol solo en su carro extra, en
// vez de recibir carro propio entra al de él. La OT y el crédito NO se tocan:
// el carro es del que lo abrió. Al cerrarlo la dupla se deshace sola y cada uno
// sigue por su cuenta.
//
// Es DE UNA VEZ por técnico y por jornada, por decisión de operaciones: la
// regla existe para el tercer carro, no para convertir la tarde entera en
// parejas. Quien ya pasó por una de estas duplas no vuelve a entrar a otra.

/** Marca que distingue estas duplas de las que arman los técnicos a mano. */
export const MOTIVO_DUPLA_AUTO = "AUTO_CARRO_EXTRA";

/** Ayudante puesto por el supervisor desde la consola, fuera de la regla. */
export const MOTIVO_AYUDA_MANUAL = "AYUDA_MANUAL";

/** ¿La dupla la armó el sistema por la regla del carro extra? */
export function esDuplaAuto_(dupla) {
  return String(dupla?.motivo || "").startsWith(MOTIVO_DUPLA_AUTO);
}

/** ¿La puso el supervisor a mano sobre un carro concreto? */
export function esAyudaManual_(dupla) {
  return String(dupla?.motivo || "").startsWith(MOTIVO_AYUDA_MANUAL);
}

/**
 * ¿Es una dupla DE APOYO, o sea atada a un carro? Automática o puesta a mano,
 * las dos viven y mueren con ese carro.
 *
 * Esta distinción es la que sostiene la disolución. Si solo se deshicieran las
 * automáticas, un ayudante puesto por el supervisor quedaría emparejado a un
 * carro ya cerrado hasta el fin de la jornada — y una dupla ACTIVA saca a sus
 * dos miembros del reparto. Es la misma familia de bugs que la propuesta
 * inmortal: nadie lo nota hasta que alguien lleva tres horas sin carro.
 */
export function esDuplaApoyo_(dupla) {
  return esDuplaAuto_(dupla) || esAyudaManual_(dupla);
}

/**
 * El VIN va DENTRO de `motivo` (`AUTO_CARRO_EXTRA:<vin>`) y no en una columna
 * nueva: es el único dato extra que la regla necesita y así no hay migración
 * que correr en producción para estrenarla. Lo que compra es la disolución
 * exacta — sin él, "el ancla ya no tiene carro abierto" también sería cierto
 * durante el instante en que cierra uno y abre el siguiente.
 */
export function motivoDuplaAuto_(vin) {
  return `${MOTIVO_DUPLA_AUTO}:${vin}`;
}

export function motivoAyudaManual_(vin) {
  return `${MOTIVO_AYUDA_MANUAL}:${vin}`;
}

/** El VIN al que está atada una dupla de apoyo, sea automática o manual. */
export function vinDeDuplaApoyo_(dupla) {
  const m = /^(?:AUTO_CARRO_EXTRA|AYUDA_MANUAL):([^\s]+)/.exec(String(dupla?.motivo || ""));
  return m ? m[1] : null;
}

const ROLES_CONVERSION = ["MOTOR", "TANQUE"];

/** ¿Este técnico puede cubrir ese puesto? AMBOS cubre los dos. */
function cubreRol_(especialidad, rol) {
  const e = String(especialidad || "").toUpperCase();
  return e === rol || e === "AMBOS";
}

/**
 * Qué duplas automáticas hay que formar y cuáles deshacer, ahora mismo.
 *
 * Puro: no escribe nada, solo dice qué hacer. Quien lo llama traduce el plan a
 * filas de `despacho_duplas`.
 *
 * ANCLA — el que ya está en el carro extra: cerró exactamente `meta` carros y
 * tiene uno abierto (o sea, va en el nº meta+1).
 * AYUDANTE — el que acaba de quedar libre con la misma cuenta: cerró `meta` y
 * no tiene carro.
 *
 * Ambos exigen la cuenta EXACTA. Con `>= meta` la regla se comería también al
 * que ya va por su cuarto o quinto carro, y lo que se pidió es el tercero.
 *
 * @param {Array} tecnicos     [{ user_id, especialidad, estadoEfectivo, libreDesde }]
 * @param {Array} duplasVivas  duplas ACTIVA/PENDIENTE de la jornada (con miembros y motivo)
 * @param {Set}   yaParearon   user_ids que ya pasaron por una dupla auto hoy
 * @param {Map}   abiertas     user_id → { vin, rol_trabajo, zona_id, desde }
 * @param {Map}   creditos     user_id → carros cerrados hoy
 * @param {number} meta        META_CARROS_TEC
 * @returns {{ formar: Array, disolver: Array }}
 */
export function pareoCarroExtra_({
  tecnicos = [], duplasVivas = [], yaParearon = new Set(),
  abiertas = new Map(), creditos = new Map(), meta = 2,
  ahoraMs = Date.now(), ttlPendienteMin = 10,
} = {}) {
  const disolver = [];
  for (const d of duplasVivas) {
    // Las duplas DE TRABAJO (las que arman los técnicos) no se tocan: no cuelgan
    // de ningún carro. Las de apoyo sí, las haya puesto el motor o el supervisor.
    if (!esDuplaApoyo_(d)) continue;
    const vin = vinDeDuplaApoyo_(d);
    const enCurso = abiertas.get(d.lider_user_id);
    // El carro que la justificaba ya no está en manos del ancla: se cerró, se
    // reasignó, o el ancla pasó a otro. En los tres casos la dupla sobra, y
    // dejarla viva encadenaría al ayudante a un carro que ya no existe.
    if (!enCurso || (vin && enCurso.vin !== vin)) {
      disolver.push({ id: d.id, miembros: d.miembros || [], vin });
    }
  }

  const formar = [];
  if (!(meta > 0)) return { formar, disolver };

  // Quien ya trabaja en dupla —de las que arman los técnicos a mano— queda
  // FUERA de esta regla, ni de ancla ni de ayudante. Una dupla manual ya es una
  // unidad de dos que recibe un carro a la vez: meterle un tercero sería
  // deshacer justo lo que esa dupla vino a ordenar, y el crédito alternado
  // (A, B, A…) dejaría de cuadrar con quién trabajó de verdad.
  //
  // Pero una invitación CADUCADA no es una dupla. Sus dos técnicos ya volvieron
  // a la cola del reparto (unidadesDeTrabajo_ la ignora pasado el TTL), así que
  // seguir bloqueándolos aquí los dejaría en tierra de nadie: sin dupla real y
  // sin derecho a la del carro extra, por un mensaje que nadie contestó.
  const vigentes = duplasVivas.filter(d =>
    String(d.estado || "").toUpperCase() !== "PENDIENTE" ||
    !duplaPendienteVencida_(d, ahoraMs, ttlPendienteMin));

  const enDuplaViva = new Set(
    vigentes
      .filter(d => !disolver.some(x => x.id === d.id))
      .flatMap(d => d.miembros || []));

  const libre = t =>
    !enDuplaViva.has(t.user_id) &&
    !yaParearon.has(t.user_id) &&
    Number(creditos.get(t.user_id) || 0) === meta;

  // Más rato en el carro primero: es el que antes va a cerrarlo, y el criterio
  // que operaciones eligió para decidir a quién se manda la ayuda.
  const ts = v => { const n = new Date(v || 0).getTime(); return Number.isFinite(n) ? n : 0; };
  const anclas = tecnicos
    .filter(t => libre(t) && abiertas.has(t.user_id))
    .map(t => ({ t, carro: abiertas.get(t.user_id) }))
    .filter(({ carro }) => ROLES_CONVERSION.includes(String(carro.rol_trabajo || "").toUpperCase()))
    .sort((a, b) => ts(a.carro.desde) - ts(b.carro.desde)
      || String(a.t.user_id).localeCompare(String(b.t.user_id)));

  // El que lleva más esperando entra primero, igual que en el reparto normal.
  const ayudantes = tecnicos
    .filter(t => libre(t) && !abiertas.has(t.user_id) && esAsignable_(t.estadoEfectivo))
    .sort((a, b) => ts(a.libreDesde) - ts(b.libreDesde)
      || String(a.user_id).localeCompare(String(b.user_id)));

  const usados = new Set();
  for (const { t: ancla, carro } of anclas) {
    const rol = String(carro.rol_trabajo).toUpperCase();
    const ayudante = ayudantes.find(a =>
      !usados.has(a.user_id) && cubreRol_(a.especialidad, rol));
    if (!ayudante) continue;
    usados.add(ayudante.user_id);
    formar.push({
      rol,
      anclaId: ancla.user_id,
      ayudanteId: ayudante.user_id,
      vin: carro.vin,
      zonaId: carro.zona_id ?? null,
      desde: carro.desde || null,
    });
  }

  return { formar, disolver };
}

/**
 * ¿Se puede poner a este técnico de ayudante en este puesto?
 *
 * La consola del supervisor manda sobre la regla automática: aquí no se exige
 * meta cumplida, ni rol, ni que sea "su turno". El taller siempre tiene un día
 * en que hace falta meter a alguien donde el criterio no lo pondría, y una
 * consola que lo impide se termina resolviendo por WhatsApp.
 *
 * Lo que sí se verifica es lo que rompería el modelo o la BD:
 *   · que haya un carro abierto al que ayudar
 *   · que no se ayude a sí mismo
 *   · que no esté en una dupla DE TRABAJO — esa reparte crédito alternado entre
 *     dos, y meterle un carro ajeno descuadra a quién le toca el siguiente. El
 *     índice único de miembros lo rechazaría igual, pero con un 23505 en vez de
 *     una frase que se entienda.
 *
 * Estar apoyando otro carro NO es impedimento: es exactamente lo que hay que
 * poder hacer para reasignar a alguien de un carro a otro. El llamador deshace
 * la anterior antes de crear la nueva.
 *
 * → { ok, error, moverDe }  · moverDe = id de la dupla de apoyo a deshacer
 */
export function validarAyudante_({ ancla, ayudante, duplaDelAyudante = null } = {}) {
  if (!ancla?.user_id)    return { ok: false, error: "Ese puesto no tiene a nadie trabajando todavía" };
  if (!ayudante?.user_id) return { ok: false, error: "Falta elegir al ayudante" };
  if (ancla.user_id === ayudante.user_id) {
    return { ok: false, error: "Ya está en ese puesto — no puede ayudarse a sí mismo" };
  }
  if (duplaDelAyudante && !esDuplaApoyo_(duplaDelAyudante)) {
    return {
      ok: false,
      error: `${ayudante.nombre || "Ese técnico"} está en una dupla de trabajo — deshazla primero`,
    };
  }
  return { ok: true, moverDe: duplaDelAyudante?.id || null };
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
