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