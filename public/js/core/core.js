// =========================
// public/js/core/core.js
// Barrel file + compat legacy
// =========================

export { CORE, MODULES, ctx_, isWorkModule_ } from "./state.js";
export { $, el_, modSuffix_ } from "./dom.js";
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
export { applyTheme_, loadTheme_, initTheme_, toggleTheme_ } from "./theme.js";
export { setLocked, withLock, getJSON, postJSON, getJSON_user, postJSON_user } from "./api.js";
export { vinCacheSet_, vinCacheGet_, ramalCacheSet_, ramalCacheGet_ } from "./cache-local.js";
export { escapeHtml, cssEsc_, fmtShort_, fmtFechaCreacion_, msToHMS_, keyOfItem_ } from "./format.js";
export { REG_FALLAS_BASE, openRegistroFallas_ } from "./links.js";

// Compatibilidad con código viejo que usa CORE.xxx
import { CORE } from "./state.js";
import { toggleTheme_ } from "./theme.js";
import { getEmail } from "./auth.js";
import { setOut, setEstadoText } from "./ui-shell.js";
import { withLock, getJSON, postJSON, getJSON_user, postJSON_user } from "./api.js";
import { escapeHtml, cssEsc_, fmtShort_, fmtFechaCreacion_, msToHMS_ } from "./format.js";

CORE.toggleTheme_ = toggleTheme_;
CORE.getEmail = getEmail;

CORE.setOut = setOut;
CORE.setEstadoText = setEstadoText;

CORE.withLock = withLock;
CORE.getJSON = getJSON;
CORE.postJSON = postJSON;
CORE.getJSON_user = getJSON_user;
CORE.postJSON_user = postJSON_user;

CORE.escapeHtml = escapeHtml;
CORE.msToHMS_ = msToHMS_;
CORE.cssEsc_ = cssEsc_;
CORE.fmtFechaCreacion_ = fmtFechaCreacion_;
CORE.fmtShort_ = fmtShort_;