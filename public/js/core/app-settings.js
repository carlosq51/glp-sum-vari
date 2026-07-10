// public/js/core/app-settings.js
// Ajustes de apariencia: tamaño de fuente + color de acento
// El tema (day/night) lo maneja theme.js (glp_theme key) para compatibilidad con topbar.

const KEY = "glpAppSettings";

export const ACCENT_COLORS = {
  blue:   { "--btnBg": "#1d4ed8", "--btnBg2": "#1a42c0", "--inputFocus": "#60a5fa", "--grad-btn": "linear-gradient(160deg,#1d4ed8 0%,#1a42c0 100%)" },
  indigo: { "--btnBg": "#4f46e5", "--btnBg2": "#4338ca", "--inputFocus": "#6366f1", "--grad-btn": "linear-gradient(160deg,#4f46e5 0%,#4338ca 100%)" },
  violet: { "--btnBg": "#dc2626", "--btnBg2": "#b91c1c", "--inputFocus": "#ef4444", "--grad-btn": "linear-gradient(160deg,#dc2626 0%,#b91c1c 100%)" },
  teal:   { "--btnBg": "#0d9488", "--btnBg2": "#0f766e", "--inputFocus": "#14b8a6", "--grad-btn": "linear-gradient(160deg,#0d9488 0%,#0f766e 100%)" },
  rose:   { "--btnBg": "#e11d48", "--btnBg2": "#be123c", "--inputFocus": "#f43f5e", "--grad-btn": "linear-gradient(160deg,#e11d48 0%,#be123c 100%)" },
};

const DEFAULTS = { size: "md", accent: "blue" };

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function applySettings(s = loadSettings()) {
  const html = document.documentElement;

  // Font size
  if (s.size && s.size !== "md") html.setAttribute("data-size", s.size);
  else html.removeAttribute("data-size");

  // Accent color (inline CSS vars on <html> — override both themes)
  const vars = ACCENT_COLORS[s.accent] || ACCENT_COLORS.blue;
  Object.values(ACCENT_COLORS).forEach(v => Object.keys(v).forEach(k => html.style.removeProperty(k)));
  Object.entries(vars).forEach(([k, v]) => html.style.setProperty(k, v));
}

export function initAppSettings() {
  applySettings();
}
