// public/js/core/app-settings.js
// Ajustes de apariencia: tamaño de fuente + color de acento
// El tema (day/night) lo maneja theme.js (glp_theme key) para compatibilidad con topbar.

const KEY = "glpAppSettings";

// Cada acento fija también --btnText para asegurar contraste del texto del botón.
// El acento de marca SUM (ámbar) es el default.
export const ACCENT_COLORS = {
  amber:  { "--btnBg": "#f59e0b", "--btnBg2": "#ea7317", "--inputFocus": "#f59e0b", "--btnText": "#241a08", "--grad-btn": "linear-gradient(160deg,#f7b733 0%,#ea7317 100%)" },
  orange: { "--btnBg": "#f97316", "--btnBg2": "#ea580c", "--inputFocus": "#fb923c", "--btnText": "#241a08", "--grad-btn": "linear-gradient(160deg,#fb8c3b 0%,#ea580c 100%)" },
  slate:  { "--btnBg": "#334155", "--btnBg2": "#1e293b", "--inputFocus": "#64748b", "--btnText": "#ffffff", "--grad-btn": "linear-gradient(160deg,#3b4759 0%,#1e293b 100%)" },
  blue:   { "--btnBg": "#1d4ed8", "--btnBg2": "#1a42c0", "--inputFocus": "#60a5fa", "--btnText": "#ffffff", "--grad-btn": "linear-gradient(160deg,#1d4ed8 0%,#1a42c0 100%)" },
  teal:   { "--btnBg": "#0d9488", "--btnBg2": "#0f766e", "--inputFocus": "#14b8a6", "--btnText": "#ffffff", "--grad-btn": "linear-gradient(160deg,#0d9488 0%,#0f766e 100%)" },
};

const DEFAULTS = { size: "md", accent: "amber" };

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
