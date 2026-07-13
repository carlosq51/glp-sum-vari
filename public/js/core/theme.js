// =========================
// public/js/core/theme.js
// Tema visual
// =========================

const THEME_KEY = "glp_theme";

export function initTheme_() {
  const saved = loadTheme_();
  if (saved) return applyTheme_(saved);

  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  applyTheme_(prefersLight ? "day" : "night");
}

export function loadTheme_() {
  try {
    return localStorage.getItem(THEME_KEY) || "";
  } catch {
    return "";
  }
}

export function toggleTheme_() {
  const cur = document.documentElement.dataset.theme || "night";
  applyTheme_(cur === "day" ? "night" : "day");
}

export function applyTheme_(t) {
  const theme = t === "day" ? "day" : "night";
  document.documentElement.dataset.theme = theme;

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}

  // Avisar a gráficos/gauges que necesiten re-render con los nuevos tokens.
  try {
    window.dispatchEvent(new CustomEvent("glp:themechange", { detail: { theme } }));
  } catch {}
}