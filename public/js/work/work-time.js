// =========================
// public/js/work/work-time.js
// Cálculo de tiempo live de cada trabajo
// =========================

export function computeLiveMs_(item, nowMs = Date.now()) {
  // Busca tiempo en múltiples campos (compatibilidad Sheets + Supabase)
  const base = Number(item.tiempo_ms || item.tiempo_trab_ms || 0);
  const rs = item.running_since ? Date.parse(item.running_since) : NaN;

  if (!isNaN(rs) && String(item.estado || item.estado_actual).toUpperCase() === "TRABAJANDO") {
    return base + Math.max(0, nowMs - rs);
  }

  return base;
}