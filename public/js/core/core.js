// =========================
// public/js/core/core.js
// Barrel: re-exporta todos los módulos core
// =========================

// --- Estado global ---
export { CORE, MODULES, ctx_, isWorkModule_ } from "./state.js";

// --- DOM helpers ---
export { $, el_, modSuffix_ } from "./dom.js";

// --- UI shell (login/app/hub) ---
export {
  showLoginUI,
  showAppUI,
  hideAllModulesUI,
  showHubUI,
  hasMultipleModulesUI,
  syncTopbarHomeButtonUI,
  goToHubUI,
  setUserPillUI,
  applyDebugVisibilityUI,
  setOut,
  setEstadoText,
} from "./ui-shell.js";

// --- Auth / perfil ---
export {
  effectiveModulos,
  computeRolLock_,
  enforceRolLock_,
  saveEmail,
  loadEmail,
  clearEmail,
  getEmail,
  getVin,
  getRolTecnico_,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
} from "./auth.js";

// --- Theme ---
export { applyTheme_, loadTheme_, initTheme_, toggleTheme_ } from "./theme.js";

// --- API + lock ---
export { setLocked, withLock, getJSON, postJSON, getJSON_user, postJSON_user } from "./api.js";

// --- Supabase client ---
export { 
  supabaseEnabled, 
  supabaseGet, 
  supabasePost, 
  supabasePatch, 
  supabaseDelete 
} from "./supabase-client.js";

// --- Dual API (migración paralela) ---
export { 
  setMigrationConfig, 
  dualWrite, 
  dualRead, 
  syncFromAppScript 
} from "./dual-api.js";

// --- Caches localStorage ---
export { vinCacheSet_, vinCacheGet_, ramalCacheSet_, ramalCacheGet_ } from "./cache-local.js";

// --- Format helpers ---
export { escapeHtml, cssEsc_, fmtShort_, fmtFechaCreacion_, msToHMS_, keyOfItem_ } from "./format.js";

// --- Links externos ---
export { REG_FALLAS_BASE, openRegistroFallas_ } from "./links.js";