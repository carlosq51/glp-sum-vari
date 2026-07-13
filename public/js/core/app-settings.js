// public/js/core/app-settings.js
// Ajustes de apariencia: tamaño de fuente + color de acento
// El tema (day/night) lo maneja theme.js (glp_theme key) para compatibilidad con topbar.

const KEY = "glpAppSettings";

// El color del picker controla el BOTÓN primario. El acento de marca (ámbar)
// vive en tokens (--accent/--grad-accent) y no lo toca el picker.
// Default = grafito neutro (SUM): botones grafito, acentos ámbar. --inputFocus
// se mantiene ámbar en todas las opciones para que el foco sea siempre de marca.
export const ACCENT_COLORS = {
  graphite: { "--btnBg": "#3a3f47", "--btnBg2": "#282c33", "--inputFocus": "#f59e0b", "--btnText": "#ffffff", "--grad-btn": "linear-gradient(160deg,#40454e 0%,#282c33 100%)" },
  amber:    { "--btnBg": "#f59e0b", "--btnBg2": "#ea7317", "--inputFocus": "#f59e0b", "--btnText": "#241a08", "--grad-btn": "linear-gradient(160deg,#f7b733 0%,#ea7317 100%)" },
  orange:   { "--btnBg": "#f97316", "--btnBg2": "#ea580c", "--inputFocus": "#f59e0b", "--btnText": "#241a08", "--grad-btn": "linear-gradient(160deg,#fb8c3b 0%,#ea580c 100%)" },
  blue:     { "--btnBg": "#1d4ed8", "--btnBg2": "#1a42c0", "--inputFocus": "#f59e0b", "--btnText": "#ffffff", "--grad-btn": "linear-gradient(160deg,#1d4ed8 0%,#1a42c0 100%)" },
  teal:     { "--btnBg": "#0d9488", "--btnBg2": "#0f766e", "--inputFocus": "#f59e0b", "--btnText": "#ffffff", "--grad-btn": "linear-gradient(160deg,#0d9488 0%,#0f766e 100%)" },
};

const DEFAULTS = { size: "md", accent: "graphite" };

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
