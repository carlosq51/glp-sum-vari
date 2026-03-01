// =========================
// public/js/core/links.js
// Links externos
// =========================

export const REG_FALLAS_BASE = "https://glp-registro-fallas.pages.dev/";

export function openRegistroFallas_(vin) {
  const v = String(vin || "").trim().toUpperCase();
  const url = v ? `${REG_FALLAS_BASE}?vin=${encodeURIComponent(v)}` : REG_FALLAS_BASE;
  window.open(url, "_blank", "noopener");
}