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

export function keyOfItem_(it) {
  const cid = String(it?.conversionId || "").trim();
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  return `${cid}|${rol}`;
}