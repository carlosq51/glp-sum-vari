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
