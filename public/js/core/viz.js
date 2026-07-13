// =========================
// public/js/core/viz.js
// Helpers de data-viz: colores desde tokens + gauges SVG + tema de Chart.js.
// Los gauges usan var() en el stroke → cambian de color solos al alternar tema.
// Los gráficos de Chart.js necesitan re-render: escuchan "glp:themechange".
// =========================

const GAUGE_R = 52;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R; // ≈ 326.73

export function clamp01(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Lee los tokens de data-viz del tema activo (getComputedStyle sobre :root).
 * Se vuelve a llamar tras cambiar de tema para refrescar Chart.js.
 */
export function readVizColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  return {
    ink:     g("--dv-ink")     || "#e8ebf7",
    ink2:    g("--dv-ink2")    || "rgba(220,228,255,.62)",
    grid:    g("--dv-grid")    || "rgba(255,255,255,.10)",
    axis:    g("--dv-axis")    || "rgba(255,255,255,.24)",
    surface: g("--dv-surface") || "#101d38",
    accent:  g("--accent")     || "#8b5cf6",
    accent2: g("--accent2")    || "#3b82f6",
    good:    g("--dv-good")    || "#0ca30c",
    warn:    g("--dv-warn")    || "#fab219",
    bad:     g("--dv-bad")     || "#d03b3b",
    series: [
      g("--dv-1"), g("--dv-2"), g("--dv-3"), g("--dv-4"),
      g("--dv-5"), g("--dv-6"), g("--dv-7"), g("--dv-8"),
    ].map((c, i) => c || ["#3987e5","#199e70","#c98500","#008300","#9085e9","#e66767","#d55181","#d95926"][i]),
  };
}

/**
 * Devuelve el HTML de un gauge circular (.gauge). El stroke usa var(tone)
 * para que el color siga el tema sin re-render.
 * @param {Object} o
 * @param {number} o.fraction   0..1 (proporción del anillo lleno)
 * @param {string} o.display    número/valor central (ya formateado)
 * @param {string} [o.sub]      sublabel bajo el valor
 * @param {string} [o.label]    título bajo el anillo
 * @param {string} [o.foot]     nota al pie
 * @param {string} [o.tone]     nombre de var CSS del color del arco (def: --accent)
 */
export function gaugeHTML({ fraction, display, sub = "", label = "", foot = "", tone = "--accent" }) {
  const off = GAUGE_CIRC * (1 - clamp01(fraction));
  return `
    <div class="gauge">
      <div class="gauge__ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="${GAUGE_R}" fill="none" stroke-width="12"
                  style="stroke:var(--ring-track)"></circle>
          <circle cx="60" cy="60" r="${GAUGE_R}" fill="none" stroke-width="12" stroke-linecap="round"
                  style="stroke:var(${tone}); transition:stroke-dashoffset .6s ease;"
                  stroke-dasharray="${GAUGE_CIRC.toFixed(2)}"
                  stroke-dashoffset="${off.toFixed(2)}"
                  transform="rotate(-90 60 60)"></circle>
        </svg>
        <div class="gauge__center">
          <div class="gauge__value">${display}</div>
          ${sub ? `<div class="gauge__sub">${sub}</div>` : ""}
        </div>
      </div>
      ${label ? `<div class="gauge__label">${label}</div>` : ""}
      ${foot ? `<div class="gauge__foot">${foot}</div>` : ""}
    </div>`;
}

/**
 * Opciones base de Chart.js coherentes con los tokens del tema activo.
 * @param {ReturnType<typeof readVizColors>} c
 */
export function chartBaseOptions(c) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: c.ink2, font: { family: "inherit", weight: "700" } } },
      tooltip: {
        backgroundColor: c.surface,
        titleColor: c.ink,
        bodyColor: c.ink2,
        borderColor: c.axis,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: c.ink2, font: { family: "inherit" } },
        grid:  { color: c.grid, drawTicks: false },
        border: { color: c.axis },
      },
      y: {
        ticks: { color: c.ink2, font: { family: "inherit" } },
        grid:  { color: c.grid, drawTicks: false },
        border: { color: c.axis },
      },
    },
  };
}

/**
 * Crea un gradiente vertical para el relleno de líneas/áreas.
 */
export function verticalFill(ctx, area, hex, topAlpha = 0.28, botAlpha = 0.0) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, hexA(hex, topAlpha));
  g.addColorStop(1, hexA(hex, botAlpha));
  return g;
}

/** hex (#rrggbb) → rgba con alpha */
export function hexA(hex, a) {
  const h = String(hex).replace("#", "").trim();
  if (h.length < 6) return `rgba(59,130,246,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const gg = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${gg},${b},${a})`;
}

/** Registra un callback que se dispara al cambiar de tema (para re-render de charts). */
export function onThemeChange(cb) {
  window.addEventListener("glp:themechange", cb);
  return () => window.removeEventListener("glp:themechange", cb);
}
