// =========================
// public/js/core/format.js
// Helpers puros
// =========================

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function cssEsc_(s) {
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, "\\$&");
}

export function fmtShort_(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * "YYYY-MM-DD" del día en Perú de un instante. Es el día con que se filtra
 * por fechas (historial del ramalero): a las 21:00 de Lima ya es mañana en
 * UTC, y cortar por el ISO crudo corría un día cada noche.
 */
export function diaPeru_(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function fmtFechaCreacion_(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function msToHMS_(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const total = Math.floor(ms / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Elapsed compacto desde un timestamp ISO: "m:ss" si dura menos de 1h, "h:mm:ss" si dura más.
// Usado para popups/alertas de incidencias en curso (ex-duplicado en sup-incidencias.js y conversion/modals/incidencia-alert.js).
export function formatElapsed_(tiempoInicio) {
  if (!tiempoInicio) return null;
  const ms = Date.now() - new Date(tiempoInicio).getTime();
  if (ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const s  = totalSec % 60;
  const m  = Math.floor(totalSec / 60) % 60;
  const h  = Math.floor(totalSec / 3600);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Elapsed con granularidad de minutos desde un ISO: "45m" / "3h 5m" / "3h".
// Para tarjetas de zona en los mapas (ex-duplicado en tec-mapa.js y zonas-mapa.js).
// No confundir con formatElapsed_ (cronómetro con segundos, "h:mm:ss").
export function fmtElapsedMin_(isoStr) {
  if (!isoStr) return "";
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 0) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Duración en ms -> "Xh YYm ZZs". Usado en tablas/promedios del supervisor (ex sup-stats.js).
export function fmtDur_(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  const pad = (n) => String(n).padStart(2, "0");
  return `${hh}h ${pad(mm)}m ${pad(ss)}s`;
}

// Tiempo acumulado (ms) + opcional timestamp "running_since" a sumar en vivo -> "Xh YYm" / "Ym". Usado en el panel LIVE del supervisor (ex sup-live.js).
export function fmtTiempo_(ms, runningSince) {
  let total = Number(ms) || 0;
  if (runningSince) total += Date.now() - new Date(runningSince).getTime();
  total = Math.max(0, total);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

// Horas en formato decimal (float) -> "Xh Ym". Unidad distinta a las demás (horas, no ms) — usado en KPIs del supervisor (ex sup-kpis.js).
export function formatHours_(hours) {
  if (!hours || hours < 0) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m}m`;
}

export function keyOfItem_(it) {
  const cid = String(it?.conversionId || "").trim();
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  return `${cid}|${rol}`;
}
// ── Cómo se llama lo que alguien está haciendo ───────────────────────────────
//
// Un carro se llama por su VIN. Un ramal no tiene VIN, así que el backend le
// inventa un código para poder guardarlo — y durante meses ese código, que es
// una clave de base de datos, era lo que se pintaba en pantalla:
//
//     RAMAL-1790686306788-46NX     ← epoch + 4 al azar; ilegible
//     RAMAL-260929-JETOUR-07       ← el formato nuevo (routes/trabajo.js)
//
// Ninguno de los dos responde lo que se pregunta de un ramal, que es QUÉ MARCA
// es. La marca viaja aparte en `tipo_ramal` desde siempre; lo que faltaba era
// usarla. Los códigos viejos no la llevan dentro, así que sale de ese campo;
// los nuevos dan además el correlativo del día.
//
// El código crudo no se pierde: quien llama a esto lo pone en el `title`, que
// es donde sirve — para copiarlo y buscarlo en la base.

const RE_RAMAL_      = /^RAMAL-/;
const RE_RAMAL_NUEVO = /^RAMAL-\d{6}-([A-Z0-9]+)-([A-Z0-9]+)$/;

/** → { texto, titulo, esRamal }. `texto` es lo que se pinta. */
export function etiquetaTrabajo_(vin, tipoRamal) {
  const v = String(vin || "").trim();
  if (!v) return { texto: "", titulo: "", esRamal: false };
  if (!RE_RAMAL_.test(v)) return { texto: v, titulo: v, esRamal: false };

  const m     = RE_RAMAL_NUEVO.exec(v);
  const marca = String(tipoRamal || "").trim().toUpperCase() || (m ? m[1] : "");
  // El correlativo lleva cero delante en el código ("07") para que ordene bien
  // en la base; en pantalla estorba.
  const seq   = m ? (/^\d+$/.test(m[2]) ? String(Number(m[2])) : m[2]) : "";

  const texto = marca
    ? (seq ? `${marca} · #${seq}` : marca)
    : (seq ? `RAMAL · #${seq}` : "RAMAL");
  return { texto, titulo: v, esRamal: true };
}

// ── Los cortes de la jornada ─────────────────────────────────────────────────
//
// El taller no mide el día por horas de reloj sino por CORTES: 05:00–10:00,
// 10:00–13:00, 13:00–16:20… Dos cosas hacen que no valga con agrupar por hora:
// los cortes caen en :20, y la jornada cruza la medianoche (el último va de
// 23:00 a 01:00). Por eso los límites se "linealizan" — cada uno que no sea
// mayor que el anterior se pasa al día siguiente — y a partir de ahí todo es
// aritmética de minutos.
//
// Los límites viven en app_config (LIVE_CORTES), porque son una decisión del
// taller y cambian con los turnos, no con el código.

const TZ_PE_FMT_ = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "05:30" → 330. null si el texto no es una hora. */
export function hhmmAMin_(txt) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(txt || "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null;
}

/** 330 → "05:30". */
export function minAHhmm_(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutos desde la medianoche, en hora Perú (no la del navegador). */
export function minutosPE_(fecha = new Date()) {
  const [hh, mm] = TZ_PE_FMT_.format(fecha).split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * "05:00,10:00,…,01:00" → [{ ini, fin, label }] en minutos linealizados.
 *
 * `ini` del primer bloque es el origen del eje; los siguientes pueden pasar de
 * 1440 si el corte cruzó la medianoche. Con menos de dos límites no hay
 * bloques que devolver.
 */
export function bloquesJornada_(txt) {
  const crudos = String(txt || "").split(",").map(hhmmAMin_).filter(n => n != null);
  if (crudos.length < 2) return [];

  const lin = [crudos[0]];
  for (let i = 1; i < crudos.length; i++) {
    let v = crudos[i];
    while (v <= lin[i - 1]) v += 1440;   // este corte ya es del día siguiente
    lin.push(v);
  }

  const out = [];
  for (let i = 0; i < lin.length - 1; i++) {
    out.push({
      ini: lin[i],
      fin: lin[i + 1],
      label: `${minAHhmm_(crudos[i])}–${minAHhmm_(crudos[i + 1])}`,
    });
  }
  return out;
}

/**
 * En qué bloque cae un instante. −1 si queda fuera de la jornada.
 *
 * `minutos` es hora de reloj (0…1439); aquí se sube al eje linealizado, que es
 * lo que permite que las 00:30 caigan en el bloque 23:00–01:00 y no antes del
 * primer corte del día.
 */
export function indiceBloque_(minutos, bloques) {
  if (!bloques.length) return -1;
  let m = Number(minutos);
  if (!Number.isFinite(m)) return -1;
  if (m < bloques[0].ini) m += 1440;
  for (let i = 0; i < bloques.length; i++) {
    if (m >= bloques[i].ini && m < bloques[i].fin) return i;
  }
  return -1;
}
