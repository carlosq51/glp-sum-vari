// =========================
// public/js/core/ui-dynamics.js
// Utilidades de presentación viva — compartidas por todas las vistas.
//
//   • relTimeText(iso)      → "hace 2 min" (es-PE, auto-unidad)
//   • startRelTimeTicker()  → mantiene frescos todos los [data-reltime]
//   • countUp(el, to)       → anima un número hasta su nuevo valor
//   • skeletonHTML(n)       → placeholder shimmer mientras cargan datos
//
// Todo respeta prefers-reduced-motion (las animaciones CSS lo manejan en
// 01-base; countUp salta directo al valor final).
// =========================

const REL_UNITS = [
  { max: 45,      text: () => "ahora" },                                        // <45 s
  { max: 3600,    text: (s) => `hace ${Math.max(1, Math.round(s / 60))} min` }, // <1 h
  { max: 86400,   text: (s) => `hace ${Math.round(s / 3600)} h` },              // <1 día
  { max: Infinity, text: (s) => `hace ${Math.round(s / 86400)} d` },
];

/** "hace 2 min" a partir de un ISO/Date/ms. Devuelve "" si es inválido. */
export function relTimeText(when) {
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (!Number.isFinite(t)) return "";
  const secs = Math.max(0, (Date.now() - t) / 1000);
  return REL_UNITS.find(u => secs < u.max).text(secs);
}

let _relTicker = null;

/**
 * Un solo ticker global refresca todos los <span data-reltime="ISO"> del DOM.
 * Las vistas solo escriben el atributo; nunca gestionan su propio timer.
 */
export function startRelTimeTicker(intervalMs = 30_000) {
  if (_relTicker) return;
  const tick = () => {
    if (document.hidden) return; // no trabajar en background
    document.querySelectorAll("[data-reltime]").forEach(el => {
      const txt = relTimeText(el.dataset.reltime);
      if (txt && el.textContent !== txt) el.textContent = txt;
    });
  };
  _relTicker = setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
}

/**
 * countUp — anima el contenido numérico de un elemento hasta `to`.
 * Parte del valor mostrado actualmente (o de `from`), ~450ms ease-out.
 * Con prefers-reduced-motion salta directo al final.
 */
export function countUp(el, to, { from = null, durMs = 450, fmt = (v) => String(Math.round(v)) } = {}) {
  if (!el) return;
  const target = Number(to) || 0;
  const start = from !== null ? Number(from) : (parseFloat(el.textContent) || 0);
  if (start === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = fmt(target);
    return;
  }
  const t0 = performance.now();
  const ease = (x) => 1 - Math.pow(1 - x, 3); // ease-out cúbico
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / durMs);
    el.textContent = fmt(start + (target - start) * ease(p));
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * skeletonHTML — n filas shimmer para estados de carga.
 * Reemplaza los "Cargando…" de texto plano: la vista ya "existe"
 * antes de que lleguen los datos.
 */
export function skeletonHTML(rows = 3, { height = 56 } = {}) {
  return Array.from({ length: rows }, () =>
    `<div class="skel" style="height:${height}px"></div>`
  ).join("");
}
