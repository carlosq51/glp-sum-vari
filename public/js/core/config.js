// =========================
// public/js/core/config.js
// Config operativa del frontend — espejo de GET /api/config.
//
// Regla: NINGÚN número operativo (intervalo de polling, meta, límite)
// se escribe en una vista. Las vistas llaman cfg("CLAVE").
// El Admin puede cambiar cualquier clave en app_config sin redeploy.
//
// Arranque en 3 capas (nunca bloquea el boot):
//   1. DEFAULTS locales (siempre disponibles, espejo de lib/config.js)
//   2. localStorage (último /api/config conocido — warm start)
//   3. fetch /api/config en background → actualiza y persiste
// =========================

const LS_KEY = "glp_runtime_config";

// Espejo de CONFIG_DEFAULTS del backend (lib/config.js).
// Solo se usan si el servidor nunca respondió (primera carga offline).
const DEFAULTS = {
  META_DIARIA:   25,
  META_CALIDAD:  22,
  META_MENSUAL:  60,
  META_CARROS_TEC: 2,

  TARGET_CONVERSION_MIN: 180,
  TARGET_CALIDAD_MIN:     50,
  TARGET_RAMAL_MIN:       40,

  POLL_RAMAL_LISTO_MS:      15_000,
  POLL_COLA_POSICION_MS:    15_000,
  POLL_PAIR_SUGGEST_MS:     90_000,
  POLL_COLA_BADGE_MS:      180_000,
  POLL_VIN_READY_MS:       120_000,
  POLL_MOVILIZADOR_MS:      30_000,
  POLL_OT_RECHECK_MS:      480_000,
  POLL_SUP_LIVE_MS:        300_000,
  POLL_SUP_UBICACIONES_MS: 300_000,
  POLL_ZONAS_MAPA_MS:       60_000,
  POLL_RAMALERO_SOL_MS:     60_000,
};

let _config = { ...DEFAULTS };

// Warm start: último config conocido (síncrono, antes de cualquier vista)
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
  if (saved && typeof saved === "object") _config = { ...DEFAULTS, ...saved };
} catch { /* localStorage corrupto → defaults */ }

/**
 * cfg — lectura síncrona de una clave de config.
 * Siempre devuelve un valor (default → localStorage → servidor).
 */
export function cfg(key) {
  return _config[key] ?? DEFAULTS[key];
}

/** Config completa (para vistas que muestran varias claves, ej. Admin) */
export function cfgAll() {
  return { ..._config };
}

/**
 * loadConfig — refresca desde el servidor y persiste. No lanza.
 * Llamar una vez en el boot; opcionalmente al volver de background.
 */
export async function loadConfig() {
  try {
    const r = await fetch("/api/config");
    if (!r.ok) return _config;
    const j = await r.json();
    if (j?.ok && j.config) {
      _config = { ...DEFAULTS, ...j.config };
      try { localStorage.setItem(LS_KEY, JSON.stringify(j.config)); } catch { /* llena/privado */ }
      window.dispatchEvent(new CustomEvent("glp:configloaded", { detail: _config }));
    }
  } catch { /* offline → seguimos con lo conocido */ }
  return _config;
}
