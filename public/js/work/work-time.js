// =========================
// public/js/work/work-time.js
// Cálculo de tiempo live de cada trabajo
// =========================

export function computeLiveMs_(item, nowMs = Date.now()) {
  const base = Number(item.tiempo_ms || 0);
  const rs = item.running_since ? Date.parse(item.running_since) : NaN;

  if (!isNaN(rs) && String(item.estado).toUpperCase() === "TRABAJANDO") {
    return base + Math.max(0, nowMs - rs);
  }

  return base;
}