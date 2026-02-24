// =========================
// public/js/core/core.js  (CORE ÚNICO)
// - estado global
// - dom helpers ($, el_)
// - storage (theme/email/caches)
// - api fetch + lock ui
// - helpers (escape/fechas/tiempos/keys)
// - UI base (login/app/hub)
// =========================

export const $ = (id) => document.getElementById(id);

// --------------------------
// CONFIG
// --------------------------
export const REG_FALLAS_BASE = "https://glp-registro-fallas.pages.dev/";
const EMAIL_KEY = "glp_email";
const THEME_KEY = "glp_theme_v1";
const VIN_CACHE_KEY = "glp_vin_cache_v1";
const RAMAL_CACHE_KEY = "glp_ramal_cache_v1";

export const MODULES = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];

// --------------------------
// STATE
// --------------------------
export const CORE = {
  state: {
    rolLock: null,          // "MOTOR" | "TANQUE" | null
    currentProfile: null,
    currentModule: null,
    uiLocked: false,

    storeByModule: {
      TECNICO: { itemsByKey: new Map(), activeKeys: [], finalKeys: [], lastSyncSince: null, lastSyncRev: null, lastSyncAtMs: 0, showFinalizados: false },
      CALIDAD: { itemsByKey: new Map(), activeKeys: [], finalKeys: [], lastSyncSince: null, lastSyncRev: null, lastSyncAtMs: 0, showFinalizados: false },
      RAMALERO:{ itemsByKey: new Map(), activeKeys: [], finalKeys: [], lastSyncSince: null, lastSyncRev: null, lastSyncAtMs: 0, showFinalizados: false },
    },
  },
};

// --------------------------
// DOM HELPERS POR MÓDULO
// (vin/vinQ, activasBox/activasBoxQ/R, etc.)
// --------------------------
export function modSuffix_() {
  const m = CORE.state.currentModule;
  if (m === "CALIDAD") return "Q";
  if (m === "RAMALERO") return "R";
  return "";
}
export function el_(id) {
  const sfx = modSuffix_();
  const a = $(id + sfx);
  return a || $(id);
}

export function ctx_() {
  const m = CORE.state.currentModule;
  if (m === "CALIDAD") return CORE.state.storeByModule.CALIDAD;
  if (m === "RAMALERO") return CORE.state.storeByModule.RAMALERO;
  return CORE.state.storeByModule.TECNICO;
}

export function isWorkModule_() {
  const m = CORE.state.currentModule;
  return m === "TECNICO" || m === "CALIDAD" || m === "RAMALERO";
}

// --------------------------
// UI BASE (Login/App/Hub)
// --------------------------
export function showLoginUI(msg = "") {
  $("viewLogin").style.display = "block";
  $("viewApp").style.display = "none";
  $("loginMsg").textContent = msg;
}

export function showAppUI() {
  $("viewLogin").style.display = "none";
  $("viewApp").style.display = "block";
  $("loginMsg").textContent = "";
}

export function hideAllModulesUI() {
  MODULES.forEach((m) => {
    const el = document.getElementById(`view${m}`);
    if (el) el.style.display = "none";
  });
}

export function showHubUI(mods, onPick) {
  $("viewHub").style.display = "block";
  const box = $("hubButtons");
  box.innerHTML = "";
  mods.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m;
    btn.addEventListener("click", () => onPick?.(m));
    box.appendChild(btn);
  });
}

export function setUserPillUI() {
  const p = CORE.state.currentProfile || {};
  const rol = String(p.rol || "").toUpperCase();
  const esp = String(p.especialidad || "").toUpperCase();
  const mods = Array.isArray(p.modulos) ? p.modulos.join(",") : "(default)";
  const extraTec = rol === "TECNICO" ? ` | ESP: ${esp || "-"}` : "";
  $("userPill").textContent = `${p.email || ""} | ROL: ${rol}${extraTec} | MOD: ${mods}`;
}

export function applyDebugVisibilityUI() {
  const wrap = document.getElementById("debugWrap");
  if (!wrap) return;
  const rol = String(CORE.state.currentProfile?.rol || "").toUpperCase();
  if (rol === "ADMIN") wrap.classList.remove("debug-hidden");
  else wrap.classList.add("debug-hidden");
}

// --------------------------
// ROL LOCK / MODS EFECTIVOS
// --------------------------
export function effectiveModulos(profile) {
  const rol = String(profile?.rol || "").toUpperCase();
  if (Array.isArray(profile?.modulos) && profile.modulos.length) {
    const up = profile.modulos.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean);
    if (up.includes("ALL")) return [...MODULES];
    return [...new Set(up)];
  }
  if (rol === "TECNICO") return ["TECNICO"];
  if (rol === "RAMALERO") return ["RAMALERO"];
  if (rol === "CALIDAD") return ["CALIDAD"];
  if (rol === "MOVILIZADOR") return ["MOVILIZADOR"];
  if (rol === "SUPERVISOR") return ["SUPERVISOR"];
  if (rol === "ADMIN") return ["ADMIN"];
  return ["TECNICO"];
}

export function computeRolLock_(profile) {
  const rolUser = String(profile?.rol || "").toUpperCase();
  if (rolUser !== "TECNICO") return null;
  const esp = String(profile?.especialidad || "").toUpperCase();
  if (esp === "MOTOR") return "MOTOR";
  if (esp === "TANQUE" || esp === "TANQUERO") return "TANQUE";
  return null;
}

export function enforceRolLock_() {
  if (CORE.state.currentModule !== "TECNICO") return;
  const sel = $("rol");
  if (!sel) return;

  if (CORE.state.rolLock) {
    sel.value = CORE.state.rolLock;
    sel.disabled = true;
  } else {
    sel.disabled = false;
  }
}

// --------------------------
// THEME + EMAIL STORAGE
// --------------------------
export function applyTheme_(t) {
  const theme = t === "day" ? "day" : "night";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}
export function loadTheme_() {
  try { return localStorage.getItem(THEME_KEY) || ""; } catch { return ""; }
}
export function initTheme_() {
  const saved = loadTheme_();
  if (saved) return applyTheme_(saved);
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme_(prefersLight ? "day" : "night");
}
export function toggleTheme_() {
  const cur = document.documentElement.dataset.theme || "night";
  applyTheme_(cur === "day" ? "night" : "day");
}
CORE.toggleTheme_ = toggleTheme_;

export function saveEmail(email) { localStorage.setItem(EMAIL_KEY, email); }
export function loadEmail() { return localStorage.getItem(EMAIL_KEY) || ""; }
export function clearEmail() { localStorage.removeItem(EMAIL_KEY); }

// --------------------------
// INPUT GETTERS
// --------------------------
export function getEmail() {
  return String($("email")?.value || "").trim().toLowerCase();
}
export function getVin() {
  return String(el_("vin")?.value || "").trim().toUpperCase();
}
export function getRolTecnico_() {
  if (CORE.state.rolLock) return CORE.state.rolLock;
  const sel = $("rol");
  return sel ? String(sel.value || "MOTOR").toUpperCase() : "MOTOR";
}
export function getRolTrabajoCurrent_() {
  if (CORE.state.currentModule === "CALIDAD") return "CALIDAD";
  if (CORE.state.currentModule === "RAMALERO") return "RAMALERO";
  return String(getRolTecnico_() || "").toUpperCase();
}
export function requireEmailOrStop() {
  const email = getEmail();
  if (!email) throw new Error("NO_EMAIL");
  return email;
}
CORE.getEmail = getEmail;

// --------------------------
// UI LOCK + API
// --------------------------
export function setOut(obj) {
  const out = $("out");
  if (out) out.textContent = JSON.stringify(obj, null, 2);
}
export function setEstadoText(text) {
  const box = el_("estadoBox");
  if (box) box.textContent = text || "";
}

export function setLocked(on, msg = "Procesando...") {
  CORE.state.uiLocked = !!on;

  const overlay = $("loadingOverlay");
  if (overlay) {
    overlay.classList.toggle("hidden", !CORE.state.uiLocked);
    const msgEl = document.getElementById("overlayMsg");
    if (msgEl) msgEl.textContent = String(msg || "Procesando").replace(/\.*\s*$/, "");
  }

  if (CORE.state.uiLocked) setEstadoText(msg);
  else setEstadoText("");

  const emailEl = $("email");
  if (emailEl) emailEl.disabled = CORE.state.uiLocked;

  if (CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD") {
    const vinEl = el_("vin");
    if (vinEl) vinEl.disabled = CORE.state.uiLocked;
  }

  const rolEl = $("rol");
  if (rolEl) rolEl.disabled = CORE.state.uiLocked || !!CORE.state.rolLock || (CORE.state.currentModule !== "TECNICO");

  const bMe = $("btnMe");
  if (bMe) bMe.disabled = CORE.state.uiLocked;
  const bLo = $("btnLogout");
  if (bLo) bLo.disabled = CORE.state.uiLocked;

  const ids = ["btnEstado", "btnActivas", "btnFinalizados", "btnQR", "btnSupQR"];
  for (const id of ids) {
    const b = el_(id);
    if (b) b.disabled = CORE.state.uiLocked;
  }

  const actBox = el_("activasBox");
  const finBox = el_("finalizadosBox");
  actBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = CORE.state.uiLocked));
  finBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = CORE.state.uiLocked));
}

export async function withLock(fn, msg) {
  if (CORE.state.uiLocked) return;
  setLocked(true, msg);
  try { return await fn(); }
  finally { setLocked(false); }
}

export async function getJSON(url) {
  const r = await fetch(url);
  return await r.json();
}
export async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json();
}
export async function getJSON_user(url, msg = "Cargando...") {
  return await withLock(async () => await getJSON(url), msg);
}
export async function postJSON_user(url, body, msg = "Procesando...") {
  return await withLock(async () => await postJSON(url, body), msg);
}
CORE.getJSON_user = getJSON_user;

// --------------------------
// CACHE VIN/RAMAL
// --------------------------
function vinCacheLoad_() { try { return JSON.parse(localStorage.getItem(VIN_CACHE_KEY) || "{}"); } catch { return {}; } }
function vinCacheSave_(obj) { try { localStorage.setItem(VIN_CACHE_KEY, JSON.stringify(obj)); } catch {} }
function vinCacheKey_(conversionId, rolTrabajo) {
  const cid = String(conversionId || "").trim();
  const rol = String(rolTrabajo || "").toUpperCase().trim();
  return cid && rol ? `${cid}|${rol}` : "";
}
export function vinCacheSet_(conversionId, rolTrabajo, vin) {
  const cid = String(conversionId || "").trim();
  const v = String(vin || "").trim().toUpperCase();
  if (!cid || !v) return;
  const rol = String(rolTrabajo || "").toUpperCase().trim();
  const k = vinCacheKey_(cid, rol);
  if (!k) return;

  const cache = vinCacheLoad_();
  cache[k] = { vin: v, ts: Date.now() };

  const maxAge = 14 * 24 * 3600 * 1000;
  for (const kk of Object.keys(cache)) {
    if (!cache[kk]?.ts || Date.now() - cache[kk].ts > maxAge) delete cache[kk];
  }
  vinCacheSave_(cache);
}
export function vinCacheGet_(conversionId, rolTrabajo) {
  const k = vinCacheKey_(conversionId, rolTrabajo);
  if (!k) return "";
  const cache = vinCacheLoad_();
  return String(cache[k]?.vin || "").toUpperCase();
}

function ramalCacheLoad_() { try { return JSON.parse(localStorage.getItem(RAMAL_CACHE_KEY) || "{}"); } catch { return {}; } }
function ramalCacheSave_(obj) { try { localStorage.setItem(RAMAL_CACHE_KEY, JSON.stringify(obj)); } catch {} }
function ramalCacheKey_(conversionId) {
  const cid = String(conversionId || "").trim();
  return cid ? `RAMAL|${cid}` : "";
}
export function ramalCacheSet_(conversionId, tipoRamal) {
  const cid = String(conversionId || "").trim();
  const tipo = String(tipoRamal || "").trim();
  if (!cid || !tipo) return;

  const cache = ramalCacheLoad_();
  cache[ramalCacheKey_(cid)] = { tipoRamal: tipo, ts: Date.now() };

  const maxAge = 14 * 24 * 3600 * 1000;
  for (const k of Object.keys(cache)) {
    if (!cache[k]?.ts || Date.now() - cache[k].ts > maxAge) delete cache[k];
  }
  ramalCacheSave_(cache);
}
export function ramalCacheGet_(conversionId) {
  const cid = String(conversionId || "").trim();
  if (!cid) return "";
  const cache = ramalCacheLoad_();
  return String(cache[ramalCacheKey_(cid)]?.tipoRamal || "");
}

// --------------------------
// HELPERS (escape/fechas/tiempos/keys)
// --------------------------
export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
export function cssEsc_(s) {
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, "\\$&");
}
export function fmtShort_(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}
export function fmtFechaCreacion_(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}
export function msToHMS_(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const total = Math.floor(ms / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
export function keyOfItem_(it) {
  const cid = String(it?.conversionId || "").trim();
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  return `${cid}|${rol}`;
}

export function openRegistroFallas_(vin) {
  const v = String(vin || "").trim().toUpperCase();
  const url = v ? `${REG_FALLAS_BASE}?vin=${encodeURIComponent(v)}` : REG_FALLAS_BASE;
  window.open(url, "_blank", "noopener");
}

// Expose some for views
CORE.setOut = setOut;
CORE.setEstadoText = setEstadoText;
CORE.withLock = withLock;
CORE.getJSON = getJSON;
CORE.postJSON = postJSON;
CORE.postJSON_user = postJSON_user;
CORE.escapeHtml = escapeHtml;
CORE.msToHMS_ = msToHMS_;
CORE.cssEsc_ = cssEsc_;
CORE.fmtFechaCreacion_ = fmtFechaCreacion_;
CORE.fmtShort_ = fmtShort_;