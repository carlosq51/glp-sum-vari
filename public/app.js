// =========================
// public/app.js  (REEMPLAZO TOTAL - ORDENADO)
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

(() => {
  // ==========================================================
  // 0) SHORTCUTS / CONSTANTES
  // ==========================================================
  const $ = (id) => document.getElementById(id);

  const EMAIL_KEY = "glp_email";

  // =========================
  // LINK: Registro / Fallas (otra app)
  // =========================
  const REG_FALLAS_BASE = "https://glp-registro-fallas.pages.dev/";

  function buildRegistroFallasUrl_(vin) {
    const v = String(vin || "").trim().toUpperCase();
    if (!v) return REG_FALLAS_BASE;
    return `${REG_FALLAS_BASE}?vin=${encodeURIComponent(v)}`;
  }

  function openRegistroFallas_(vin) {
    const url = buildRegistroFallasUrl_(vin);
    window.open(url, "_blank", "noopener");
  }

  // ==========================================================
  // 1) ESTADO GLOBAL (ROL/MÓDULO/LOCKS)
  // ==========================================================
  let rolLock = null; // "MOTOR" | "TANQUE" | null
  let currentProfile = null;
  let currentModule = null;

  const MODULES = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];

  let uiLocked = false;

  // ==========================================================
  // 2) STORE POR MÓDULO + TIMERS POR MÓDULO
  // ==========================================================
  function modSuffix_() {
    if (currentModule === "CALIDAD") return "Q";
    if (currentModule === "RAMALERO") return "R";
    return "";
  }

  // Elemento del módulo actual: id o id+Q/R (fallback al id base)
  function el_(id) {
    const sfx = modSuffix_();
    const a = $(id + sfx);
    return a || $(id);
  }

  const storeByModule = {
    TECNICO: {
      itemsByKey: new Map(),
      activeKeys: [],
      finalKeys: [],
      lastSyncSince: null,
      lastSyncRev: null,
      lastSyncAtMs: 0,
      showFinalizados: false,
      openCardKey: null,
    },
    CALIDAD: {
      itemsByKey: new Map(),
      activeKeys: [],
      finalKeys: [],
      lastSyncSince: null,
      lastSyncRev: null,
      lastSyncAtMs: 0,
      showFinalizados: false,
      openCardKey: null,
    },
    RAMALERO: {
      itemsByKey: new Map(),
      activeKeys: [],
      finalKeys: [],
      lastSyncSince: null,
      lastSyncRev: null,
      lastSyncAtMs: 0,
      showFinalizados: false,
      openCardKey: null,
    },
  };

  function ctx_() {
    if (currentModule === "CALIDAD") return storeByModule.CALIDAD;
    if (currentModule === "RAMALERO") return storeByModule.RAMALERO;
    return storeByModule.TECNICO;
  }

  function isWorkModule_() {
    return currentModule === "TECNICO" || currentModule === "CALIDAD" || currentModule === "RAMALERO";
  }

  const timersByModule = {
    TECNICO: { syncTimer: null, clockTimer: null, estadoTimer: null },
    CALIDAD: { syncTimer: null, clockTimer: null, estadoTimer: null },
    RAMALERO: { syncTimer: null, clockTimer: null, estadoTimer: null },
  };

  function tctx_() {
    if (currentModule === "CALIDAD") return timersByModule.CALIDAD;
    if (currentModule === "RAMALERO") return timersByModule.RAMALERO;
    return timersByModule.TECNICO;
  }

  // ==========================================================
  // 3) UI LOCK / HELPERS FETCH
  // ==========================================================
  function setOut(obj) {
    const out = $("out"); // debug global, solo visible para ADMIN
    if (out) out.textContent = JSON.stringify(obj, null, 2);
  }

  function setEstadoText(text) {
    const box = el_("estadoBox");
    if (box) box.textContent = text || "";
  }

  function setLocked(on, msg = "Procesando...") {
    uiLocked = !!on;

    const overlay = $("loadingOverlay");
    if (overlay) {
      overlay.classList.toggle("hidden", !uiLocked);
      const msgEl = document.getElementById("overlayMsg");
      if (msgEl) msgEl.textContent = String(msg || "Procesando").replace(/\.*\s*$/, "");
    }

    if (uiLocked) setEstadoText(msg);
    else setEstadoText("");

    // inputs base
    const emailEl = $("email");
    if (emailEl) emailEl.disabled = uiLocked;

    // VIN solo en TECNICO/CALIDAD
    if (currentModule === "TECNICO" || currentModule === "CALIDAD") {
      const vinEl = el_("vin");
      if (vinEl) vinEl.disabled = uiLocked;
    }

    // rol solo TECNICO
    const rolEl = $("rol");
    if (rolEl) rolEl.disabled = uiLocked || !!rolLock || (currentModule !== "TECNICO");

    // botones globales
    const bMe = $("btnMe");
    if (bMe) bMe.disabled = uiLocked;
    const bLo = $("btnLogout");
    if (bLo) bLo.disabled = uiLocked;

    // botones del módulo actual
    const ids = ["btnEstado", "btnActivas", "btnFinalizados", "btnQR", "btnSupQR"];
    for (const id of ids) {
      const b = el_(id);
      if (b) b.disabled = uiLocked;
    }

    // botones dinámicos dentro de cards (solo del módulo actual)
    const actBox = el_("activasBox");
    const finBox = el_("finalizadosBox");
    actBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = uiLocked));
    finBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = uiLocked));
  }

  async function withLock(fn, msg) {
    if (uiLocked) return;
    setLocked(true, msg);
    try {
      return await fn();
    } finally {
      setLocked(false);
    }
  }

  async function getJSON(url) {
    const r = await fetch(url);
    return await r.json();
  }

  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  }

  async function getJSON_user(url, msg = "Cargando...") {
    return await withLock(async () => await getJSON(url), msg);
  }

  async function postJSON_user(url, body, msg = "Procesando...") {
    return await withLock(async () => await postJSON(url, body), msg);
  }

  // ==========================================================
  // 4) STORAGE: THEME + EMAIL + INPUT GETTERS
  // ==========================================================
  const THEME_KEY = "glp_theme_v1"; // "night" | "day"

  function applyTheme_(t) {
    const theme = t === "day" ? "day" : "night";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }

  function loadTheme_() {
    try {
      return localStorage.getItem(THEME_KEY) || "";
    } catch {
      return "";
    }
  }

  function initTheme_() {
    const saved = loadTheme_();
    if (saved) return applyTheme_(saved);
    const prefersLight =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme_(prefersLight ? "day" : "night");
  }

  function toggleTheme_() {
    const cur = document.documentElement.dataset.theme || "night";
    applyTheme_(cur === "day" ? "night" : "day");
  }

  function saveEmail(email) {
    localStorage.setItem(EMAIL_KEY, email);
  }
  function loadEmail() {
    return localStorage.getItem(EMAIL_KEY) || "";
  }
  function clearEmail() {
    localStorage.removeItem(EMAIL_KEY);
  }

  function getEmail() {
    return String($("email")?.value || "").trim().toLowerCase();
  }
  function getVin() {
    return String(el_("vin")?.value || "").trim().toUpperCase();
  }

  function getRolTecnico_() {
    if (rolLock) return rolLock; // lock por especialidad
    const sel = $("rol");
    return sel ? String(sel.value || "MOTOR").toUpperCase() : "MOTOR";
  }

  function getRolTrabajoCurrent_() {
    if (currentModule === "CALIDAD") return "CALIDAD";
    if (currentModule === "RAMALERO") return "RAMALERO";
    return String(getRolTecnico_() || "").toUpperCase();
  }

  function requireEmailOrStop() {
    const email = getEmail();
    if (!email) {
      setOut({ ok: false, error: "Primero inicia sesión con tu email." });
      throw new Error("NO_EMAIL");
    }
    return email;
  }

  // ==========================================================
  // 5) VIN CACHE + RAMAL CACHE
  // ==========================================================
  const VIN_CACHE_KEY = "glp_vin_cache_v1"; // no lo cambies

  function vinCacheLoad_() {
    try {
      return JSON.parse(localStorage.getItem(VIN_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function vinCacheSave_(obj) {
    try {
      localStorage.setItem(VIN_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }

  function vinCacheKey_(conversionId, rolTrabajo) {
    const cid = String(conversionId || "").trim();
    const rol = String(rolTrabajo || "").toUpperCase().trim();
    return cid && rol ? `${cid}|${rol}` : "";
  }

  function vinCacheSet_(conversionId, rolTrabajo, vin) {
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

  function vinCacheGet_(conversionId, rolTrabajo) {
    const cid = String(conversionId || "").trim();
    const rol = String(rolTrabajo || "").toUpperCase().trim();
    const k = vinCacheKey_(cid, rol);
    if (!k) return "";
    const cache = vinCacheLoad_();
    return String(cache[k]?.vin || "").toUpperCase();
  }

  // RAMAL CACHE (tipoRamal)
  const RAMAL_CACHE_KEY = "glp_ramal_cache_v1";

  function ramalCacheLoad_() {
    try {
      return JSON.parse(localStorage.getItem(RAMAL_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function ramalCacheSave_(obj) {
    try {
      localStorage.setItem(RAMAL_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }

  function ramalCacheKey_(conversionId) {
    const cid = String(conversionId || "").trim();
    return cid ? `RAMAL|${cid}` : "";
  }

  function ramalCacheSet_(conversionId, tipoRamal) {
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

  function ramalCacheGet_(conversionId) {
    const cid = String(conversionId || "").trim();
    if (!cid) return "";
    const cache = ramalCacheLoad_();
    return String(cache[ramalCacheKey_(cid)]?.tipoRamal || "");
  }

  // ==========================================================
  // 6) HELPERS: FORMATO, ESCAPE, TIEMPOS, KEYS
  // ==========================================================

  // ==========================================================
// PROMEDIO REALISTA (MEDIANA + MAD)
// ==========================================================

function median_(arr) {
  const v = [...arr].sort((a,b)=>a-b);
  const n = v.length;
  if (!n) return 0;
  const m = Math.floor(n / 2);
  return n % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function mad_(arr, med) {
  const devs = arr.map(x => Math.abs(x - med));
  return median_(devs);
}

/**
 * Promedio robusto usando Mediana + MAD
 * @param {number[]} arrMs - tiempos en ms
 * @param {number} k - factor MAD (3.0 – 4.0 recomendado)
 */
function avgByMedianMad_(arrMs, k = 3.5) {
  const vals = arrMs.filter(x => Number.isFinite(x) && x > 0);
  if (vals.length < 3) {
    return {
      avgMs: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0,
      used: vals.length,
      total: vals.length,
      low: 0,
      high: 0
    };
  }

  const med = median_(vals);
  const mad = mad_(vals, med) || 1; // evita división por 0

  const min = med - k * mad;
  const max = med + k * mad;

  const ok = [];
  let low = 0, high = 0;

  for (const x of vals) {
    if (x < min) low++;
    else if (x > max) high++;
    else ok.push(x);
  }

  const avgMs = ok.length
    ? ok.reduce((a,b)=>a+b,0) / ok.length
    : med; // fallback ultra seguro

  return {
    avgMs,
    medianMs: med,
    madMs: mad,
    used: ok.length,
    total: vals.length,
    low,
    high,
  };
}

  function fmtShort_(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEsc_(s) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
    return String(s).replace(/["\\]/g, "\\$&");
  }

  function msToHMS_(ms) {
    ms = Math.max(0, Number(ms) || 0);
    const total = Math.floor(ms / 1000);
    const hh = String(Math.floor(total / 3600)).padStart(2, "0");
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function fmtFechaCreacion_(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function keyOfItem_(it) {
    const cid = String(it?.conversionId || "").trim();
    const rol = String(it?.rolTrabajo || "").toUpperCase();
    return `${cid}|${rol}`;
  }

  function findItemByVinRol_(vin, rol) {
    const c = ctx_();
    const v = String(vin || "").toUpperCase();
    const r = String(rol || "").toUpperCase();
    for (const it of c.itemsByKey.values()) {
      if (
        String(it.vin || "").toUpperCase() === v &&
        String(it.rolTrabajo || "").toUpperCase() === r
      ) {
        return it;
      }
    }
    return null;
  }

  function isFinalizado_(it) {
    return String(it?.estado || "").toUpperCase() === "FINALIZADO";
  }

  function allowedActionsByEstado(estado) {
    const e = String(estado || "").toUpperCase();
    if (e === "SIN_INICIAR") return ["INICIO", "NOTA"];
    if (e === "TRABAJANDO") return ["PAUSA", "FIN", "NOTA"];
    if (e === "PAUSADO") return ["REANUDAR", "FIN", "NOTA"];
    if (e === "FINALIZADO") return ["NOTA"];
    return ["INICIO", "NOTA"];
  }

  function buildBotonesByEstado_(estado) {
    const e = String(estado || "").toUpperCase();

    if (e === "SIN_INICIAR") {
      return `
        <div class="jobActionsGrid">
          <button class="btnInicio" data-act="INICIO">INICIO</button>
        </div>
      `;
    }

    if (e === "TRABAJANDO") {
      return `
        <div class="jobActionsGrid">
          <button class="btnPausa" data-act="PAUSA">PAUSA</button>
          <button class="btnFin" data-act="FIN">FIN</button>
        </div>
      `;
    }

    if (e === "PAUSADO") {
      return `
        <div class="jobActionsGrid">
          <button class="btnReanudar" data-act="REANUDAR">REANUDAR</button>
          <button class="btnFin" data-act="FIN">FIN</button>
        </div>
      `;
    }

    return `
      <div class="jobActionsGrid">
        <button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button>
      </div>
    `;
  }
  
  // =========================
  // ASIGNADO (TANQUE/REDUCTOR)
  // =========================
  function buildAsignadoHTML_(it) {
    const rol = String(it?.rolTrabajo || "").toUpperCase();
    if (rol !== "MOTOR" && rol !== "TANQUE") return "";

    const tanqueAsign = String(it?.tanque_asignado || "").trim();
    const reductAsign = String(it?.reductor_asignado || "").trim();

    // ✅ nuevos campos (vendrán del backend/sync)
    const tanqueReg = String(it?.tanque_registrado || "").trim();
    const reductReg = String(it?.reductor_registrado || "").trim();

    const isTanque = rol === "TANQUE";

    const labelAsign = isTanque ? "TANQUE ASIGNADO:" : "REDUCTOR ASIGNADO:";
    const valAsign   = isTanque ? tanqueAsign : reductAsign;

    const labelReg = isTanque ? "TANQUE REGISTRADO:" : "REDUCTOR REGISTRADO:";
    const valReg   = isTanque ? tanqueReg : reductReg;

    const safeAsignVal = escapeHtml(valAsign || "NO ASIGNADO");
    const safeRegVal   = escapeHtml(valReg || "—");

    const naAsign = valAsign ? "" : " na";
    const naReg   = valReg ? "" : " na";

    return `
      <div class="asignadoRow js-asignado" data-rol="${escapeHtml(rol)}">
        <span class="asignadoLabel">${escapeHtml(labelAsign)}</span>
        <span class="asignadoValue${naAsign}">${safeAsignVal}</span>
      </div>

      <div class="asignadoRow js-registrado" data-rol="${escapeHtml(rol)}" style="margin-top:6px;">
        <span class="asignadoLabel">${escapeHtml(labelReg)}</span>
        <span class="asignadoValue${naReg}">${safeRegVal}</span>
      </div>
    `;
  }



  // ==========================================================
  // 7) CRONÓMETRO (LIVE)
  // ==========================================================
  function computeLiveMs_(item, nowMs = Date.now()) {
    const base = Number(item.tiempo_ms || 0);
    const rs = item.running_since ? Date.parse(item.running_since) : NaN;
    if (!isNaN(rs) && String(item.estado).toUpperCase() === "TRABAJANDO") {
      return base + Math.max(0, nowMs - rs);
    }
    return base;
  }

  function tickClocksUI_() {
    if (!isWorkModule_()) return;

    const c = ctx_();
    const nowMs = Date.now();

    // cards activas
    el_("activasBox")
      ?.querySelectorAll(".jobCard[data-key] .js-tiempo")
      ?.forEach((el) => {
        const card = el.closest(".jobCard");
        if (!card) return;
        const k = card.dataset.key || "";
        const it = c.itemsByKey.get(k);
        if (!it) return;
        el.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;
      });

    // RAMALERO no usa estadoBox (no VIN)
    if (currentModule === "RAMALERO") return;

    const vin = getVin();
    const rol = getRolTrabajoCurrent_();
    if (vin && rol) {
      const it = findItemByVinRol_(vin, rol);
      if (it) {
        setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it, nowMs))}`);
      }
    }
  }

  // ==========================================================
  // 8) PROFILE / MODULOS / LOGIN UI
  // ==========================================================
  function showLogin(msg = "") {
    $("viewLogin").style.display = "block";
    $("viewApp").style.display = "none";
    $("loginMsg").textContent = msg;

    stopLoopsFor_("TECNICO");
    stopLoopsFor_("CALIDAD");
    stopLoopsFor_("RAMALERO");

    clearModuleUI_("TECNICO");
    clearModuleUI_("CALIDAD");
    clearModuleUI_("RAMALERO");
  }

  function showApp() {
    $("viewLogin").style.display = "none";
    $("viewApp").style.display = "block";
    $("loginMsg").textContent = "";
  }

  function hideAllModules() {
    MODULES.forEach((m) => {
      const el = document.getElementById(`view${m}`);
      if (el) el.style.display = "none";
    });
  }

  function showHub(mods) {
    $("viewHub").style.display = "block";
    const box = $("hubButtons");
    box.innerHTML = "";
    mods.forEach((m) => {
      const btn = document.createElement("button");
      btn.textContent = m;
      btn.addEventListener("click", () => openModule(m));
      box.appendChild(btn);
    });
  }

  function setUserPill() {
    const p = currentProfile || {};
    const rol = String(p.rol || "").toUpperCase();
    const esp = String(p.especialidad || "").toUpperCase();
    const mods = Array.isArray(p.modulos) ? p.modulos.join(",") : "(default)";
    const extraTec = rol === "TECNICO" ? ` | ESP: ${esp || "-"}` : "";
    $("userPill").textContent = `${p.email || ""} | ROL: ${rol}${extraTec} | MOD: ${mods}`;
  }

  function effectiveModulos(profile) {
    const rol = String(profile?.rol || "").toUpperCase();
    if (Array.isArray(profile?.modulos) && profile.modulos.length) {
      const up = profile.modulos
        .map((x) => String(x || "").trim().toUpperCase())
        .filter(Boolean);
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

  function computeRolLock_(profile) {
    const rolUser = String(profile?.rol || "").toUpperCase();
    if (rolUser !== "TECNICO") return null;

    const esp = String(profile?.especialidad || "").toUpperCase();
    if (esp === "MOTOR") return "MOTOR";
    if (esp === "TANQUE" || esp === "TANQUERO") return "TANQUE";
    return null;
  }

  function enforceRolLock_() {
    if (currentModule !== "TECNICO") return;

    const sel = $("rol");
    if (!sel) return;

    if (rolLock) {
      sel.value = rolLock;
      sel.disabled = true;
    } else {
      sel.disabled = false;
    }
  }

  function applyEspecialidad(profile) {
    rolLock = computeRolLock_(profile);
    enforceRolLock_();
  }

  function openModule(m) {
    currentModule = m;
    
    // cerrar autocomplete de Supervisor al cambiar de módulo
    if (m !== "SUPERVISOR") {
      try { supNameAcHide_(); } catch {}
    }

    $("viewHub").style.display = "none";
    hideAllModules();

    const el = document.getElementById(`view${m}`);
    if (el) el.style.display = "block";

        // ✅ PARTE A: warm-up name-suggest (solo 1 vez por sesión)
    if (m === "SUPERVISOR" && !window.__nameSuggestWarmed) {
      window.__nameSuggestWarmed = true;
      fetch("/api/name-suggest?q=.&limit=200").catch(() => {});
    }


    // Delegaciones
    if (m === "TECNICO") attachActivasDelegationOnce_("TECNICO");
    if (m === "CALIDAD") attachActivasDelegationOnce_("CALIDAD");
    if (m === "RAMALERO") attachActivasDelegationOnce_("RAMALERO");

    if (m === "TECNICO") attachFinalizadosDelegationOnce_("TECNICO");
    if (m === "CALIDAD") attachFinalizadosDelegationOnce_("CALIDAD");

    // loops
    if (m === "TECNICO") startLoopsFor_("TECNICO");
    else if (m === "CALIDAD") startLoopsFor_("CALIDAD");
    else if (m === "RAMALERO") startLoopsFor_("RAMALERO");

    enforceRolLock_();
  }

  // ==========================================================
  // 9) NORMALIZACIÓN / MERGE DE ITEMS (SYNC)
  // ==========================================================
  function mergePrevAndCache_(it, prev) {
    // VIN
    if ((!it.vin || it.vin === "") && prev?.vin) it.vin = prev.vin;
    if (!it.vin && it.conversionId && it.rolTrabajo) {
      const cached = vinCacheGet_(it.conversionId, it.rolTrabajo);
      if (cached) it.vin = cached;
    }

    // RAMAL
    if (it.rolTrabajo === "RAMALERO") {
      if ((!it.tipoRamal || it.tipoRamal === "") && prev?.tipoRamal) it.tipoRamal = prev.tipoRamal;
      if (!it.tipoRamal && it.conversionId) {
        const cachedTipo = ramalCacheGet_(it.conversionId);
        if (cachedTipo) it.tipoRamal = cachedTipo;
      }
    }

    // campos que el backend a veces no manda
    if (prev) {
      if (!it.updated_at) it.updated_at = prev.updated_at || null;
      if (!it.last_nota_ts) it.last_nota_ts = prev.last_nota_ts || null;
      if (!it.created_at) it.created_at = prev.created_at || null;
    }

    return it;
  }

  function normalizeItem_(raw) {
    // --- helpers ---
    const pickFirst_ = (...xs) => {
      for (const x of xs) {
        if (x !== undefined && x !== null && String(x).trim() !== "") return x;
      }
      return "";
    };

    const it = {
      // ✅ soporta conversion_id / CONVERSION_ID
      conversionId: String(
        pickFirst_(raw?.conversionId, raw?.conversion_id, raw?.CONVERSION_ID, raw?.ID, raw?.id)
      ).trim(),

      vin: String(pickFirst_(raw?.vin, raw?.VIN)).trim().toUpperCase(),

      tipoRamal: String(
        pickFirst_(
          raw?.tipoRamal,
          raw?.tipo_ramal,
          raw?.tipo,
          raw?.TIPO_RAMAL,
          raw?.TIPO
        )
      ).trim(),

      created_at:
        raw?.fecha_asignacion ??
        raw?.FECHA_ASIGNACION ??
        raw?.fecha_inicio ??
        raw?.inicio_at ??
        raw?.FECHA_INICIO ??
        raw?.created_at ??
        raw?.fecha_creacion ??
        raw?.FECHA_CREACION ??
        null,

      // ✅ soporta rol_trabajo / ROL / rolTrabajo
      rolTrabajo: String(
        pickFirst_(
          raw?.rolTrabajo,
          raw?.rol_trabajo,
          raw?.rol,
          raw?.ROL_TRABAJO,
          raw?.ROL
        )
      )
        .trim()
        .toUpperCase(),

      // ✅ soporta estado_actual / ESTADO_ACTUAL / estado
      estado: String(
        pickFirst_(
          raw?.estado,
          raw?.estado_actual,
          raw?.estadoActual,
          raw?.ESTADO_ACTUAL,
          raw?.ESTADO
        )
      )
        .trim()
        .toUpperCase(),

      // ✅ soporta TIEMPO_TRAB_MS / tiempo_ms / tiempoMs
      tiempo_ms: Number(
        pickFirst_(raw?.tiempo_ms, raw?.tiempoMs, raw?.TIEMPO_TRAB_MS, raw?.TIEMPO_MS, 0)
      ) || 0,

      running_since: raw?.running_since ?? raw?.RUNNING_SINCE ?? null,

      last_nota: String(pickFirst_(raw?.last_nota, raw?.LAST_NOTA, "")),
      last_nota_ts: raw?.last_nota_ts ?? raw?.LAST_NOTA_TS ?? null,

      updated_at: raw?.updated_at ?? raw?.UPDATED_AT ?? null,

      // ✅ ASIGNADOS desde backend (Apps Script)
      tanque_asignado: String(
        pickFirst_(raw?.tanque_asignado, raw?.tanqueAsignado, raw?.TANQUE_ASIGNADO, "")
      ).trim(),

      reductor_asignado: String(
        pickFirst_(raw?.reductor_asignado, raw?.reductorAsignado, raw?.REDUCTOR_ASIGNADO, "")
      ).trim(),

      // ✅ REGISTRADOS (vienen del backend/sync)
      tanque_registrado: String(
        pickFirst_(raw?.tanque_registrado, raw?.tanqueRegistrado, raw?.TANQUE_REGISTRADO, "")
      ).trim(),

      reductor_registrado: String(
        pickFirst_(raw?.reductor_registrado, raw?.reductorRegistrado, raw?.REDUCTOR_REGISTRADO, "")
      ).trim(),


    };

    // ✅ FALLBACKS CLAVE (si backend no manda rol)
    if (!it.rolTrabajo) {
      if (it.tipoRamal) it.rolTrabajo = "RAMALERO";
      else if (currentModule === "CALIDAD") it.rolTrabajo = "CALIDAD";
      else if (currentModule === "RAMALERO") it.rolTrabajo = "RAMALERO";
      else it.rolTrabajo = String(getRolTecnico_() || "MOTOR").toUpperCase();
    }

    if (!it.estado) it.estado = "SIN_INICIAR";

    // caches
    if (it.conversionId && it.rolTrabajo && it.vin) vinCacheSet_(it.conversionId, it.rolTrabajo, it.vin);
    if (it.conversionId && it.rolTrabajo === "RAMALERO" && it.tipoRamal) ramalCacheSet_(it.conversionId, it.tipoRamal);

    return it;
  }


  // ==========================================================
  // 10) RENDER: ACTIVAS / FINALIZADOS + PATCH
  // ==========================================================
  function snapshotNotasActivas_() {
    const map = new Map();
    el_("activasBox")?.querySelectorAll(".jobCard[data-key]")?.forEach((card) => {
      const k = card.dataset.key || "";
      const ta = card.querySelector("textarea.notaCard");
      if (!ta) return;
      map.set(k, String(ta.value || ""));
    });
    return map;
  }

  function restoreNotasActivas_(snapMap) {
    if (!snapMap) return;
    el_("activasBox")?.querySelectorAll(".jobCard[data-key]")?.forEach((card) => {
      const k = card.dataset.key || "";
      const ta = card.querySelector("textarea.notaCard");
      if (!ta) return;
      if (snapMap.has(k)) ta.value = snapMap.get(k);
    });
  }

  function renderActivas_() {
    const c = ctx_();
    const box = el_("activasBox");
    if (!box) return;

    if (!c.activeKeys.length) {
      box.innerHTML = `<div class="small">No tienes trabajos activos.</div>`;
      return;
    }

    const nowMs = Date.now();
    let out = "";

    for (const k of c.activeKeys) {
      const it = c.itemsByKey.get(k);
      if (!it) continue;

      const estado = String(it.estado || "").toUpperCase();
      const rol = escapeHtml(it.rolTrabajo || "");
      const vin = escapeHtml(it.vin || "");
      const tipo = escapeHtml(it.tipoRamal || "");
      const live = msToHMS_(computeLiveMs_(it, nowMs));
      const cre = escapeHtml(fmtFechaCreacion_(it.created_at));

      const title =
        currentModule === "RAMALERO"
          ? `RAMAL: ${tipo || "-"}`
          : vin || "<span class='small'>(sin VIN)</span>";

      out += `
        <div class="jobCard card state-${estado}" data-key="${escapeHtml(k)}">
          <div class="jobTop">
            <div class="jobMeta">
              <div class="jobTitle">${title} <span>(${rol})</span></div>
              <div class="jobSub">
                <span><b>Estado:</b> <span class="js-estado">${estado}</span></span>
                <span class="small">Inicio: ${cre}</span>
              </div>
            </div>
            <div class="jobRight">
              <div class="jobTimePill js-tiempo">⏱ ${live}</div>
              <div class="jobChevron"></div>
            </div>
          </div>

          <div class="jobExpand">

            ${buildAsignadoHTML_(it)}

            ${(String(it?.rolTrabajo||"").toUpperCase()==="MOTOR" || String(it?.rolTrabajo||"").toUpperCase()==="TANQUE")
              ? `<button class="btnRF" type="button" data-go="CONF" style="margin-bottom:10px;">
                  ✅ Registro de conformidad de equipo
                </button>`
              : ""
            }


            <div class="jobActionsSlot">
              ${buildBotonesByEstado_(estado)}
            </div>



            ${
              currentModule === "TECNICO" || currentModule === "CALIDAD"
                ? `<button class="btnRF" type="button" data-go="RF">
                    📸 Registrar fotos / fallas
                  </button>`
                : ""
            }

            <div class="jobNoteBlock">
              <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>
              <button class="btnNota" data-act="NOTA" style="margin-top:10px; width:100%; height:66px; font-weight:900; display:none;">
                Guardar nota
              </button>
            </div>
          </div>
        </div>
      `;
    }

    box.innerHTML = out;
  }

  function renderFinalizados_() {
    const c = ctx_();
    const wrap = el_("finalizadosWrap");
    const box = el_("finalizadosBox");
    if (!wrap || !box) return;

    if (!c.showFinalizados) {
      wrap.style.display = "none";
      box.innerHTML = "";
      return;
    }

    wrap.style.display = "block";

    // ✅ RAMALERO: tarjeta promedio arriba
    let avgTop = "";
    if (currentModule === "RAMALERO") {
      avgTop = computeRamaleroAvgCardHTML_();
    }

    if (!c.finalKeys.length) {
      box.innerHTML = avgTop + `<div class="small">No tienes finalizados.</div>`;
      return;
    }


    const nowMs = Date.now();
    let out = "";

    for (const k of c.finalKeys) {
      const it = c.itemsByKey.get(k);
      if (!it) continue;

      const vin = escapeHtml(String(it.vin || "").toUpperCase());
      const rol = escapeHtml(String(it.rolTrabajo || ""));
      const estado = escapeHtml(String(it.estado || "FINALIZADO").toUpperCase());
      const live = msToHMS_(computeLiveMs_(it, nowMs));
      const cre = escapeHtml(fmtFechaCreacion_(it.created_at));

      out += `
        <div class="card" style="margin-top:10px;">
          <div><b>${vin}</b> <span class="small">(${rol})</span></div>
          <div class="row space-between" style="margin-top:6px;">
            <div class="small"><b>Estado:</b> ${estado}</div>
            <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${live}</div>
          </div>
          <div class="small">Inicio: ${cre}</div>

          ${
            currentModule === "TECNICO" || currentModule === "CALIDAD"
              ? `<button class="btnRF" type="button" data-go="RF" data-vin="${vin}">
                  📸 Registrar fotos / fallas
                </button>`
              : ""
          }
        </div>
      `;
    }

    box.innerHTML = avgTop + out;
  }

  function shouldShowItemInCurrentModule_(it) {
    const rol = String(it?.rolTrabajo || "").toUpperCase();

    if (currentModule === "CALIDAD") return rol === "CALIDAD";
    if (currentModule === "RAMALERO") return rol === "RAMALERO";

    // TECNICO
    return rol === "MOTOR" || rol === "TANQUE";
  }

  function rebuildListsFromStore_() {
    const c = ctx_();
    const all = [...c.itemsByKey.values()].filter(shouldShowItemInCurrentModule_);

    const activos = [];
    const fins = [];

    all.sort((a, b) => {
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
      return tb - ta;
    });

    for (const it of all) {
      const k = keyOfItem_(it);
      if (isFinalizado_(it)) fins.push(k);
      else activos.push(k);
    }

    c.activeKeys = activos;
    c.finalKeys = fins;
  }

  function patchVisibleCards_() {
    const c = ctx_();
    const box = el_("activasBox");
    if (!box) return;

    const nowMs = Date.now();

    for (const k of c.activeKeys) {
      const it = c.itemsByKey.get(k);
      if (!it) continue;

      const card = box.querySelector(`.jobCard[data-key="${cssEsc_(k)}"]`);
      if (!card) continue;

      const wasOpen = card.classList.contains("open");
      const estado = String(it.estado || "").toUpperCase();

      card.className = `jobCard card state-${estado}` + (wasOpen ? " open" : "");

      const estadoEl = card.querySelector(".js-estado");
      if (estadoEl) estadoEl.textContent = estado;

      const timeEl = card.querySelector(".js-tiempo");
      if (timeEl) timeEl.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;

      if (wasOpen) {
        const slot = card.querySelector(".jobActionsSlot");
        if (slot) slot.innerHTML = buildBotonesByEstado_(estado);
      }
    }
  }

  // ==========================================================
  // 11) SYNC (apiSync / apply / full replace / syncNow)
  // ==========================================================
  async function apiSync_(email, since) {
    try {
      const body = { email, since };
      const j = await postJSON("/api/sync", body);
      if (j && j.ok) return { mode: "sync", data: j };
    } catch {}

    const j2 = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}`);
    return { mode: "legacy", data: j2 };
  }

  function applySyncResultToStore_(syncData) {
    const c = ctx_();
    const items = Array.isArray(syncData?.items) ? syncData.items : [];

    for (const raw of items) {
      const it = normalizeItem_(raw);
      const k = keyOfItem_(it);
      const prev = c.itemsByKey.get(k);

      mergePrevAndCache_(it, prev);
      c.itemsByKey.set(k, it);
    }
  }

  function storeFullReplace_(allItems) {
    const c = ctx_();
    c.itemsByKey.clear();

    const arr = Array.isArray(allItems) ? allItems : [];
    for (const raw of arr) {
      const it = normalizeItem_(raw);
      const k = keyOfItem_(it);
      mergePrevAndCache_(it, null);
      c.itemsByKey.set(k, it);
    }
  }

  function detectIfNeedsFullRerender_(prevActiveKeys, prevFinalKeys) {
    const c = ctx_();
    return (
      prevActiveKeys.join(",") !== c.activeKeys.join(",") ||
      prevFinalKeys.join(",") !== c.finalKeys.join(",")
    );
  }

  async function syncNow({ forceFull = false, showOut = false } = {}) {
    if (uiLocked) return;
    if (!isWorkModule_()) return;

    let email;
    try {
      email = requireEmailOrStop();
    } catch {
      return;
    }

    const c = ctx_();
    const prevA = c.activeKeys.slice();
    const prevF = c.finalKeys.slice();
    const snapNotas = snapshotNotasActivas_();

    const since = forceFull ? null : c.lastSyncSince;
    const res = await apiSync_(email, since);
    const j = res.data;

    if (showOut) setOut(j);
    if (!j || !j.ok) return;

    if (res.mode === "legacy") {
      storeFullReplace_(j.items || []);
      c.lastSyncSince = new Date().toISOString();
      c.lastSyncRev = null;
    } else {
      if (j.full) storeFullReplace_(j.items || []);
      else applySyncResultToStore_(j);

      c.lastSyncSince = j.server_time || new Date().toISOString();
      c.lastSyncRev = j.rev || c.lastSyncRev;
    }

    rebuildListsFromStore_();

    const needsFull = detectIfNeedsFullRerender_(prevA, prevF);
    if (needsFull) {
      renderActivas_();
      renderFinalizados_();
      restoreNotasActivas_(snapNotas);
    } else {
      patchVisibleCards_();
    }

    c.lastSyncAtMs = Date.now();
    enforceRolLock_();

    // Auto-start CALIDAD
    if (currentModule === "CALIDAD") {
      const first = c.activeKeys
        .map((k) => c.itemsByKey.get(k))
        .find(
          (it) =>
            it &&
            String(it.rolTrabajo).toUpperCase() === "CALIDAD" &&
            String(it.estado).toUpperCase() === "SIN_INICIAR"
        );
      if (first?.vin) autoStartCalidadIfNeeded_(first.vin).catch(() => {});
    }

    // Auto-start TECNICO
    if (currentModule === "TECNICO") {
      const vinInput = getVin();
      let vinCandidato = vinInput;

      if (!vinCandidato) {
        const first = c.activeKeys
          .map((k) => c.itemsByKey.get(k))
          .find(
            (it) =>
              it &&
              (String(it.rolTrabajo).toUpperCase() === "MOTOR" ||
                String(it.rolTrabajo).toUpperCase() === "TANQUE") &&
              String(it.estado).toUpperCase() === "SIN_INICIAR" &&
              String(it.vin || "").trim()
          );
        vinCandidato = String(first?.vin || "").trim().toUpperCase();
      }

      if (vinCandidato) autoStartTecnicoIfNeeded_(vinCandidato).catch(() => {});
    }
  }

  // ==========================================================
  // 12) ESTADO 1 VIN/ROL (refresh)
  // ==========================================================
  async function refreshEstadoForVinRole({ showOut = false } = {}) {
    if (uiLocked) return;
    if (!isWorkModule_()) return;

    let email;
    try {
      email = requireEmailOrStop();
    } catch {
      return;
    }

    const vin = getVin();
    const rolTrabajo = getRolTrabajoCurrent_();
    if (!vin) {
      setEstadoText("");
      return;
    }

    const it = findItemByVinRol_(vin, rolTrabajo);
    if (it) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it))}`);

      if (currentModule === "CALIDAD") await autoStartCalidadIfNeeded_(vin);
      else if (currentModule === "TECNICO") await autoStartTecnicoIfNeeded_(vin);

      return;
    }

    const j = await getJSON(
      `/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(
        vin
      )}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`
    );
    if (showOut) setOut(j);
    if (!j.ok) {
      setEstadoText(j.error || "Error");
      return;
    }

    const c = ctx_();
    const it2 = normalizeItem_(j);
    const k2 = keyOfItem_(it2);
    c.itemsByKey.set(k2, it2);

    rebuildListsFromStore_();
    renderActivas_();
    renderFinalizados_();

    setEstadoText(`Estado: ${it2.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it2))}`);

    if (currentModule === "CALIDAD") await autoStartCalidadIfNeeded_(vin);
    else if (currentModule === "TECNICO") await autoStartTecnicoIfNeeded_(vin);
  }

  // ==========================================================
  // 12B) ESTADO (DEBOUNCE EVENT-DRIVEN)
  // ==========================================================
  let estadoDebounceTimer_ = null;

  function scheduleEstadoRefresh_(ms = 500) {
    if (!(currentModule === "TECNICO" || currentModule === "CALIDAD")) return;

    clearTimeout(estadoDebounceTimer_);
    estadoDebounceTimer_ = setTimeout(() => {
      refreshEstadoForVinRole({ showOut: false }).catch(() => {});
    }, ms);
  }


  // ==========================================================
  // 13) EVENTOS (enviarEvento) + RAMALERO sin VIN
  // ==========================================================
  async function enviarEvento(accionOverride, opts = {}) {
    if (!(currentModule === "TECNICO" || currentModule === "CALIDAD" || currentModule === "RAMALERO")) {
      return setOut({ ok: false, error: "Solo disponible en módulos TECNICO/CALIDAD/RAMALERO." });
    }

    let email;
    try {
      email = requireEmailOrStop();
    } catch {
      return;
    }

    let rolTrabajo = getRolTrabajoCurrent_();
    if (currentModule === "RAMALERO") rolTrabajo = "RAMALERO";

    const accion = String(accionOverride || $("accion")?.value || "").toUpperCase();

    let nota = "";
    if (accion === "NOTA") {
      nota = String($("nota")?.value || "").trim();
      if (!nota && opts?.nota) nota = String(opts.nota || "").trim();
      if (!nota) return setOut({ ok: false, error: "Escribe una nota antes de guardar." });
    }

    // -------------------------
    // RAMALERO (sin VIN)
    // -------------------------
    if (rolTrabajo === "RAMALERO") {
      let conversionId =
        String(opts?.conversionId || "").trim() ||
        String(document.getElementById("ramalId")?.value || "").trim();

      let tipoRamal =
        String(opts?.tipoRamal || "").trim() ||
        String(document.getElementById("tipoRamal")?.value || "").trim();

      if (!conversionId) {
        if (accion !== "INICIO") {
          return setOut({ ok: false, error: "RAMALERO: sin ID solo puedes INICIO (para crear RAMAL_ID)." });
        }
        if (!tipoRamal) {
          return setOut({
            ok: false,
            error: "RAMALERO: selecciona tipoRamal (JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5).",
          });
        }
      }

      const payload = {
        email,
        rolTrabajo: "RAMALERO",
        accion,
        nota,
        conversionId: conversionId || undefined,
        tipoRamal: !conversionId && accion === "INICIO" ? tipoRamal : undefined,
      };

      const j = await postJSON_user(
        "/api/evento",
        payload,
        accion === "NOTA" ? "Guardando nota..." : accion === "INICIO" ? "Iniciando..." : "Registrando..."
      );

      setOut(j);
      if (!j || !j.ok) return;

      // actualizar store inmediato
      try {
        const c = ctx_();
        const it2 = normalizeItem_(j);

        if (!it2.tipoRamal) it2.tipoRamal = tipoRamal || String(opts?.tipoRamal || "");
        if (it2.conversionId && it2.tipoRamal) ramalCacheSet_(it2.conversionId, it2.tipoRamal);

        const k2 = keyOfItem_(it2);
        const prev = c.itemsByKey.get(k2);
        if (prev && !it2.tipoRamal) it2.tipoRamal = prev.tipoRamal || "";

        c.itemsByKey.set(k2, it2);
        rebuildListsFromStore_();

        const snapNotas = snapshotNotasActivas_();
        if (accion === "NOTA" && opts?.clearKey) snapNotas.set(String(opts.clearKey), "");

        renderActivas_();
        renderFinalizados_();
        restoreNotasActivas_(snapNotas);
      } catch {}

      const createdId = String(j.conversionId || "").trim();
      if (createdId) {
        const ramalIdEl = document.getElementById("ramalId");
        if (ramalIdEl) ramalIdEl.value = createdId;
      }

      setTimeout(() => {
        if (!uiLocked) {
          try {
            syncNow({ forceFull: true, showOut: false });
          } catch {}
        }
      }, 350);

      if (accion === "NOTA" && $("nota")) $("nota").value = "";
      return;
    }

    // -------------------------
    // TECNICO / CALIDAD (requiere VIN)
    // -------------------------
    const vin = getVin();
    if (!vin) return setOut({ ok: false, error: "Pon el VIN" });

    const itLocal = findItemByVinRol_(vin, rolTrabajo);
    if (itLocal) {
      const allowed = allowedActionsByEstado(itLocal.estado);
      if (!allowed.includes(accion)) {
        return setOut({ ok: false, error: `Acción ${accion} no permitida desde estado ${itLocal.estado}.` });
      }
    }

    const j = await postJSON_user(
      "/api/evento",
      { email, vin, rolTrabajo, accion, nota },
      accion === "NOTA" ? "Guardando nota..." : "Registrando..."
    );

    setOut(j);
    if (!j || !j.ok) return;

    const c = ctx_();
    const it2 = normalizeItem_(j);
    const k2 = keyOfItem_(it2);

    const prev = c.itemsByKey.get(k2);
    if (prev) {
      if (!it2.vin) it2.vin = prev.vin || "";
      if (!it2.updated_at) it2.updated_at = prev.updated_at || null;
      if (!it2.last_nota_ts) it2.last_nota_ts = prev.last_nota_ts || null;
    }

    c.itemsByKey.set(k2, it2);
    rebuildListsFromStore_();

    const snapNotas = snapshotNotasActivas_();
    if (accion === "NOTA" && opts?.clearKey) snapNotas.set(String(opts.clearKey), "");

    renderActivas_();
    renderFinalizados_();
    restoreNotasActivas_(snapNotas);

    if (accion === "NOTA" && $("nota")) $("nota").value = "";

    setTimeout(() => {
      if (!uiLocked) syncNow({ forceFull: false, showOut: false });
    }, 400);
  }

  // ==========================================================
  // 14) LOOPS POR MÓDULO + LIMPIEZA UI POR MÓDULO
  // ==========================================================
  function withModule_(mod, fn) {
    const prev = currentModule;
    currentModule = mod;
    try {
      return fn();
    } finally {
      currentModule = prev;
    }
  }

  function startLoopsFor_(mod) {
    stopLoopsFor_(mod);

    withModule_(mod, () => {
      // 1) sync inicial (full)
      syncNow({ forceFull: true, showOut: false }).catch(() => {});

      const t = tctx_();

      // 2) sync periódico (bájalo si quieres: 10s-15s)
      t.syncTimer = setInterval(() => syncNow({ forceFull: false, showOut: false }), 10000);

      // 3) reloj UI (antes 250ms)
      t.clockTimer = setInterval(() => tickClocksUI_(), 1000);

      // 4) estado VIN (antes 2s): ahora 8s (y lo demás será event-driven)
      if (mod === "TECNICO" || mod === "CALIDAD") {
        t.estadoTimer = setInterval(() => refreshEstadoForVinRole({ showOut: false }), 8000);

        // primer refresh suave (no bloquea la UI)
        setTimeout(() => refreshEstadoForVinRole({ showOut: false }).catch(() => {}), 700);
      }
    });
  }


  function stopLoopsFor_(mod) {
    const t = timersByModule[mod] || timersByModule.TECNICO;
    if (t.syncTimer) clearInterval(t.syncTimer);
    if (t.clockTimer) clearInterval(t.clockTimer);
    if (t.estadoTimer) clearInterval(t.estadoTimer);
    t.syncTimer = t.clockTimer = t.estadoTimer = null;
  }

  function clearModuleUI_(mod) {
    withModule_(mod, () => {
      if (mod === "RAMALERO") {
        const ramalIdEl = document.getElementById("ramalId");
        if (ramalIdEl) ramalIdEl.value = "";
        const tipoEl = document.getElementById("tipoRamal");
        if (tipoEl) tipoEl.value = "";
      } else {
        const vinEl = el_("vin");
        if (vinEl) vinEl.value = "";
      }


      if ($("nota")) $("nota").value = "";

      const act = el_("activasBox");
      if (act) act.innerHTML = "";

      const fin = el_("finalizadosBox");
      if (fin) fin.innerHTML = "";

      setEstadoText("");

      const c = ctx_();
      c.showFinalizados = false;
      c.openCardKey = null;

      c.itemsByKey.clear();
      c.activeKeys = [];
      c.finalKeys = [];
      c.lastSyncSince = null;
      c.lastSyncRev = null;
    });
  }

  // ==========================================================
  // 15) DEBUG VISIBILITY + LOGIN FLOW
  // ==========================================================
  function applyDebugVisibility_() {
    const wrap = document.getElementById("debugWrap");
    if (!wrap) return;

    const rol = String(currentProfile?.rol || "").toUpperCase();
    if (rol === "ADMIN") wrap.classList.remove("debug-hidden");
    else wrap.classList.add("debug-hidden");
  }

  async function doLogin(email) {
    if (!email) return showLogin("Pon tu email.");

    const j = await getJSON_user(`/api/me?email=${encodeURIComponent(email)}`, "Iniciando sesión...");
    if (!j.ok) return showLogin(j.error || "No se pudo iniciar sesión.");

    currentProfile = j.profile;
    saveEmail(email);

    applyDebugVisibility_();
    setUserPill();
    applyEspecialidad(currentProfile);

    const mods = effectiveModulos(currentProfile);

    showApp();
    setOut({ ok: true, profile: currentProfile });

    if (mods.length > 1) {
      hideAllModules();
      $("viewHub").style.display = "block";
      showHub(mods);
      currentModule = null;

      stopLoopsFor_("TECNICO");
      stopLoopsFor_("CALIDAD");
      clearModuleUI_("TECNICO");
      clearModuleUI_("CALIDAD");
    } else {
      openModule(mods[0]);
    }
  }

  // ==========================================================
  // 16) SUPERVISOR (track + render)
  // ==========================================================
  let supTrack = "CONVERSION"; // "CONVERSION" | "CALIDAD" | "RAMAL"
  let supTimer = null;

  function setSupTrack_(t) {
    supTrack = t === "CALIDAD" || t === "RAMAL" ? t : "CONVERSION";

    document.querySelectorAll("[data-suptrack]").forEach((b) => {
      const on = b.dataset.suptrack === supTrack;
      b.classList.toggle("active", on);
    });

    const pill = document.getElementById("supTrackPill");
    if (pill)
      pill.textContent =
        supTrack === "CONVERSION"
          ? "CONVERSIÓN (MOTOR + TANQUE)"
          : supTrack === "CALIDAD"
          ? "CALIDAD"
          : "RAMAL";

    if (currentModule === "SUPERVISOR") fetchSupervisorReport_().catch(() => {});
  }

  function supervisorDebounceFetch_() {
    clearTimeout(supTimer);
    supTimer = setTimeout(() => {
      if (currentModule === "SUPERVISOR") fetchSupervisorReport_().catch(() => {});
    }, 250);
  }

  async function fetchSupervisorReport_() {
    const name = String(document.getElementById("supName")?.value || "").trim();
    const vin = String(document.getElementById("supVin")?.value || "").trim().toUpperCase();

    const from = String(document.getElementById("supFrom")?.value || "").trim();
    const to = String(document.getElementById("supTo")?.value || "").trim();
    const month = String(document.getElementById("supMonth")?.value || "").trim();

    const q = [name, vin].filter(Boolean).join(" ").trim();

    const url =
      `/api/supervisor/report` +
      `?name=${encodeURIComponent(name)}` +
      `&vin=${encodeURIComponent(vin)}` +
      `&q=${encodeURIComponent(q)}` +
      `&from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}` +
      `&month=${encodeURIComponent(month)}` +
      `&track=${encodeURIComponent(supTrack)}`;

    const j = await getJSON_user(url, "Cargando reporte...");
    if (!j || !j.ok) {
      const s = document.getElementById("supSummary");
      if (s) s.textContent = j?.error || "Error cargando reporte.";
      return;
    }
    renderSupervisor_(j);
  }

  function hmsToMs_(v) {
    if (v == null) return 0;
    if (typeof v === "number" && isFinite(v)) return Math.max(0, v);

    const s = String(v);
    const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return 0;

    const hh = Number(m[1] || 0);
    const mm = Number(m[2] || 0);
    const ss = Number(m[3] || 0);
    return ((hh * 3600) + mm * 60 + ss) * 1000;
  }

  function msToHMSh_(ms) {
    ms = Math.max(0, Number(ms) || 0);
    const total = Math.floor(ms / 1000);
    const hh = Math.floor(total / 3600);
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${hh}h ${mm}m ${ss}s`;
  }

  function hmsOnly_(v) {
    if (v == null) return "00:00:00";
    if (typeof v === "number" && isFinite(v)) return msToHMS_(v);

    const s = String(v);
    const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (m) {
      const hh = String(m[1]).padStart(2, "0");
      return `${hh}:${m[2]}:${m[3]}`;
    }
    return "00:00:00";
  }

  function buildRamaleroAvgCardHTML_({ title, countTotal, avgTotalMs, used, total, low, high }) {
    const safeTitle = escapeHtml(title || "PROMEDIO RAMALERO");
    return `
      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.16);">
        <div style="font-weight:1000; font-size:16px; opacity:.9;">
          ${safeTitle}
        </div>

        <div style="margin-top:10px; font-weight:1000; font-size:34px; letter-spacing:.5px;">
          ⏱ ${msToHMSh_(avgTotalMs)}
        </div>

        <div class="small" style="margin-top:10px; opacity:.9;">
          <div><b>FINALIZADOS contados:</b> ${countTotal}</div>
          <div style="margin-top:6px; opacity:.75;">
            (robusto) usados: ${used}/${total} | outliers: ↓${low} ↑${high}
          </div>
        </div>

        <div class="small" style="margin-top:10px; opacity:.7;">
          (Solo se consideran trabajos en estado <b>FINALIZADO</b>)
        </div>
      </div>
    `;
  }

  function computeRamaleroAvgCardHTML_() {
    // promedio del RAMALERO logueado (solo sus finalizados)
    const c = ctx_();
    const tiempos = [];

    for (const it of c.itemsByKey.values()) {
      const rol = String(it?.rolTrabajo || "").toUpperCase();
      const est = String(it?.estado || "").toUpperCase();
      if (rol !== "RAMALERO") continue;
      if (est !== "FINALIZADO") continue;

      const ms = hmsToMs_(it.tiempo_hms ?? it.tiempo_ms ?? it.tiempo);
      if (ms > 0) tiempos.push(ms);
    }

    const R = avgByMedianMad_(tiempos, 3.5);
    if (R.used <= 0) return "";

    return buildRamaleroAvgCardHTML_({
      title: "PROMEDIO RAMALERO (TU USUARIO)",
      countTotal: R.used,
      avgTotalMs: R.avgMs,
      used: R.used,
      total: R.total,
      low: R.low,
      high: R.high,
    });
  }


  function buildSupervisorAvgCardHTML_({ q, countTotal, avgTotalMs, countMotor, countTanque }) {
    const safeQ = escapeHtml(q || "-");

    return `
      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.16);">
        <div style="font-weight:1000; font-size:22px; line-height:1.1;">
          ${safeQ}
        </div>

        <div style="margin-top:10px; font-weight:1000; font-size:34px; letter-spacing:.5px;">
          ⏱ ${msToHMSh_(avgTotalMs)}
        </div>

        <div class="small" style="margin-top:10px; opacity:.9;">
          <div><b>FINALIZADOS contados:</b> ${countTotal}</div>
          <div style="margin-top:6px; opacity:.85;">
            MOTOR: ${countMotor} &nbsp;|&nbsp; TANQUE: ${countTanque}
          </div>
        </div>

        <div class="small" style="margin-top:10px; opacity:.7;">
          (Solo se consideran trabajos en estado <b>FINALIZADO</b>)
        </div>
      </div>
    `;
  }

  function buildSupervisorAvgSimpleCardHTML_({ title, q, countTotal, avgTotalMs }) {
  const safeTitle = escapeHtml(title || "-");
  const safeQ = escapeHtml(q || "-");

  return `
    <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.16);">
      <div style="font-weight:1000; font-size:16px; opacity:.9;">
        ${safeTitle}
      </div>

      <div style="margin-top:6px; font-weight:1000; font-size:22px; line-height:1.1;">
        ${safeQ}
      </div>

      <div style="margin-top:10px; font-weight:1000; font-size:34px; letter-spacing:.5px;">
        ⏱ ${msToHMSh_(avgTotalMs)}
      </div>

      <div class="small" style="margin-top:10px; opacity:.9;">
        <div><b>FINALIZADOS contados:</b> ${countTotal}</div>
      </div>

      <div class="small" style="margin-top:10px; opacity:.7;">
        (Solo se consideran trabajos en estado <b>FINALIZADO</b>)
      </div>
    </div>
  `;
}


  function renderSupItemCard_(it) {
    const who = it.userName || it.userEmail || it.userId || "-";
    const rolLabel = String(it.rol || it.rolTrabajo || "").toUpperCase() || "-";

    const isRamal = rolLabel === "RAMALERO" || rolLabel === "RAMAL";
    const vinOrTipo = isRamal ? `RAMAL: ${it.tipoRamal || "-"}` : it.vin || "-";

    return `
      <div class="card" style="margin-top:10px;">
        <div style="font-weight:900;">
          ${escapeHtml(who)} <span class="small">(${escapeHtml(rolLabel)})</span>
        </div>

        <div class="row space-between" style="margin-top:8px;">
          <div class="small"><b>Trabajo:</b> ${escapeHtml(vinOrTipo)}</div>
          <div class="pill small"><b>${escapeHtml(it.estado || "")}</b></div>
        </div>

        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${escapeHtml(fmtShort_(it.fecha_inicio || it.inicio_at || it.created_at || it.fecha_creacion))}
          &nbsp;|&nbsp;
          <b>Fecha de fin:</b> ${escapeHtml(fmtShort_(it.updated_at))}
        </div>

        <div class="row space-between" style="margin-top:8px;">
          <div class="small"><b>ID:</b> ${escapeHtml(it.workId || it.conversionId || "-")}</div>
          <div class="pill" style="font-size:16px; font-weight:900;">⏱ ${escapeHtml(
            hmsOnly_(it.tiempo_hms ?? it.tiempo_ms ?? it.tiempo)
          )}</div>
        </div>
      </div>
    `;
  }

  function groupByVinMotorTanque_(items) {
    const map = new Map();

    for (const it of items) {
      const rol = String(it.rolTrabajo || it.rol || "").toUpperCase();
      const vin = String(it.vin || "").toUpperCase().trim();
      if (!vin) continue;

      if (!map.has(vin)) map.set(vin, { vin, motor: null, tanque: null, updated_at: null });

      const g = map.get(vin);
      if (rol === "MOTOR") g.motor = it;
      if (rol === "TANQUE") g.tanque = it;

      const t = it.updated_at ? Date.parse(it.updated_at) : 0;
      const prev = g.updated_at ? Date.parse(g.updated_at) : 0;
      if (t > prev) g.updated_at = it.updated_at;
    }

    const arr = [...map.values()];
    arr.sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
    return arr;
  }

  function renderSupConversionCard_(g) {
    const vin = g.vin;
    const m = g.motor;
    const t = g.tanque;

    const mWho = m ? m.userName || m.userEmail || m.userId || "-" : "-";
    const tWho = t ? t.userName || t.userEmail || t.userId || "-" : "-";

    const mEstado = m ? m.estado || "-" : "-";
    const tEstado = t ? t.estado || "-" : "-";

    const mTime = m ? hmsOnly_(m.tiempo_hms ?? m.tiempo_ms ?? m.tiempo) : "00:00:00";
    const tTime = t ? hmsOnly_(t.tiempo_hms ?? t.tiempo_ms ?? t.tiempo) : "00:00:00";

    return `
      <div class="card supConvCard" data-vin="${escapeHtml(vin)}" style="margin-top:10px;">
        <div style="font-weight:1000; font-size:18px;">
          VIN: ${escapeHtml(vin)}
          <span class="small" style="opacity:.85;">(MOTOR + TANQUE)</span>
        </div>

        <div style="margin-top:10px;" class="small">
          <div class="row space-between">
            <div><b>MOTOR:</b> ${escapeHtml(mWho)}</div>
            <div class="pill small"><b>${escapeHtml(mEstado)}</b></div>
          </div>
          <div class="row space-between" style="margin-top:6px;">
            <div class="small">
              <b>Inicio:</b> ${escapeHtml(fmtShort_(m?.fecha_inicio || m?.inicio_at || m?.created_at || m?.fecha_creacion))}
              &nbsp;|&nbsp;
              <b>Fecha de fin:</b> ${escapeHtml(fmtShort_(m?.updated_at))}
            </div>
            <div class="pill" style="font-weight:900;">⏱ ${escapeHtml(mTime)}</div>
          </div>
        </div>

        <div style="margin-top:12px;" class="small">
          <div class="row space-between">
            <div><b>TANQUE:</b> ${escapeHtml(tWho)}</div>
            <div class="pill small"><b>${escapeHtml(tEstado)}</b></div>
          </div>
          <div class="row space-between" style="margin-top:6px;">
            <div class="small">
              <b>Inicio:</b> ${escapeHtml(fmtShort_(t?.fecha_inicio || t?.inicio_at || t?.created_at || t?.fecha_creacion))}
              &nbsp;|&nbsp;
              <b>Fecha de fin:</b> ${escapeHtml(fmtShort_(t?.updated_at))}
            </div>
            <div class="pill" style="font-weight:900;">⏱ ${escapeHtml(tTime)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderSupervisor_(j) {
    const sum = document.getElementById("supSummary");
    const box = document.getElementById("supTable");

    const items = Array.isArray(j.items) ? j.items : [];
    if (!box) return;

    if (!items.length) {
      if (sum) sum.textContent = "Resultados: 0";
      box.innerHTML = `<div class="small">No hay resultados con esos filtros.</div>`;
      return;
    }

    // CALIDAD/RAMAL: 1 registro = 1 trabajo
    if (supTrack === "CALIDAD" || supTrack === "RAMAL") {
      if (sum) sum.textContent = `Resultados: ${items.length}`;

      // ✅ Promedio robusto por encargado (si hay filtro por nombre)
      const q = String(document.getElementById("supName")?.value || "").trim().toLowerCase();
      let avgCard = "";

      if (q) {
        const tiempos = [];

        for (const it of items) {
          const who = String(it.userName || it.userEmail || it.userId || "").toLowerCase();
          const est = String(it.estado || "").toUpperCase();

          // Solo finalizados del encargado filtrado
          if (!who.includes(q) || est !== "FINALIZADO") continue;

          const ms = hmsToMs_(it.tiempo_hms ?? it.tiempo_ms ?? it.tiempo);
          if (ms > 0) tiempos.push(ms);
        }

        // Promedio robusto (Mediana + MAD)
        const R = avgByMedianMad_(tiempos, 3.5);

        if (R.used > 0) {
          avgCard = buildSupervisorAvgSimpleCardHTML_({
            title: supTrack === "CALIDAD" ? "PROMEDIO CALIDAD (ENCARGADO)" : "PROMEDIO RAMAL (ENCARGADO)",
            q,
            countTotal: R.used,
            avgTotalMs: R.avgMs,
          });
        }
      }

      box.innerHTML = avgCard + items.map((it) => renderSupItemCard_(it)).join("");
      return;
    }

    // CONVERSION: VIN únicos
    const groups = groupByVinMotorTanque_(items);
    const vinCount = groups.length;
    if (sum) sum.textContent = `Resultados: ${vinCount}`;

    const q = String(document.getElementById("supName")?.value || "").trim().toLowerCase();
    let avgCard = "";

    if (q) {
      // En vez de sumatorias simples, juntamos tiempos y sacamos promedio robusto
      const tiemposMotor = [];
      const tiemposTanque = [];
      const tiemposTotal = []; // motor + tanque (para el promedio final)

      for (const g of groups) {
        const m = g.motor;
        const t = g.tanque;

        if (m) {
          const who = String(m.userName || m.userEmail || m.userId || "").toLowerCase();
          const est = String(m.estado || "").toUpperCase();
          if (who.includes(q) && est === "FINALIZADO") {
            const ms = hmsToMs_(m.tiempo_hms ?? m.tiempo_ms ?? m.tiempo);
            if (ms > 0) {
              tiemposMotor.push(ms);
              tiemposTotal.push(ms);
            }
          }
        }

        if (t) {
          const who = String(t.userName || t.userEmail || t.userId || "").toLowerCase();
          const est = String(t.estado || "").toUpperCase();
          if (who.includes(q) && est === "FINALIZADO") {
            const ms = hmsToMs_(t.tiempo_hms ?? t.tiempo_ms ?? t.tiempo);
            if (ms > 0) {
              tiemposTanque.push(ms);
              tiemposTotal.push(ms);
            }
          }
        }
      }

      // Promedios robustos (Mediana + MAD)
      const Rtot = avgByMedianMad_(tiemposTotal, 3.5);
      const Rm   = avgByMedianMad_(tiemposMotor, 3.5);
      const Rt   = avgByMedianMad_(tiemposTanque, 3.5);

      const nMotor = Rm.used;
      const nTanque = Rt.used;
      const nTotal = Rtot.used;
      const avgTotal = Rtot.avgMs;

      if (nTotal > 0) {
        avgCard = buildSupervisorAvgCardHTML_({
          q,
          countTotal: nTotal,
          avgTotalMs: avgTotal,
          countMotor: nMotor,
          countTanque: nTanque,
        });
      }
    }

    box.innerHTML = avgCard + groups.map((g) => renderSupConversionCard_(g)).join("");
  }

  // ==========================================================
  // 17) QR SCANNER (QR/BAR)
  // ==========================================================
  let qr = null;
  let scanMode = "QR"; // "QR" | "BAR"

  let qrTarget = "WORK_VIN"; // "WORK_VIN" | "SUP_VIN"
  function setQrTarget_(t){
    qrTarget = (t === "SUP_VIN") ? "SUP_VIN" : "WORK_VIN";
  }


  function setScanMode_(mode) {
    scanMode = mode === "BAR" ? "BAR" : "QR";

    const bQR = document.getElementById("btnScanQR");
    const bBar = document.getElementById("btnScanBar");
    if (bQR && bBar) {
      bQR.classList.toggle("btnInicio", scanMode === "QR");
      bQR.classList.toggle("btnPausa", scanMode !== "QR");

      bBar.classList.toggle("btnInicio", scanMode === "BAR");
      bBar.classList.toggle("btnPausa", scanMode !== "BAR");
    }

    const msg = $("qrMsg");
    if (msg) {
      msg.textContent =
        scanMode === "QR"
          ? "Modo: QR. Apunta al QR del VIN."
          : "Modo: CÓDIGO DE BARRAS (CODE_128). Apunta al código y mantén estable.";
    }
  }

  async function restartQR_() {
    const modal = $("qrModal");
    const isOpen = modal?.classList?.contains("show");
    if (!isOpen) return;

    await stopQR();
    await startQR();
  }

  function openQRModal(target = "WORK_VIN") {
    setQrTarget_(target);

    const modal = $("qrModal");
    const msg = $("qrMsg");

    modal.classList.add("show");
    setScanMode_(scanMode);

    const bQR = document.getElementById("btnScanQR");
    const bBar = document.getElementById("btnScanBar");

    if (bQR && bQR.dataset.bound !== "1") {
      bQR.dataset.bound = "1";
      bQR.addEventListener("click", async () => {
        if (scanMode === "QR") return;
        setScanMode_("QR");
        await restartQR_();
      });
    }

    if (bBar && bBar.dataset.bound !== "1") {
      bBar.dataset.bound = "1";
      bBar.addEventListener("click", async () => {
        if (scanMode === "BAR") return;
        setScanMode_("BAR");
        await restartQR_();
      });
    }

    if (msg) {
      msg.textContent =
        scanMode === "QR"
          ? "Modo: QR. Apunta la cámara al QR del VIN."
          : "Modo: CÓDIGO DE BARRAS (CODE_128). Apunta al código.";
    }

    startQR();
  }


  async function closeQRModal() {
    const modal = $("qrModal");
    modal.classList.remove("show");
    await stopQR();
  }

  async function startQR() {
    const msg = $("qrMsg");
    try {
      if (!window.Html5Qrcode) {
        if (msg) msg.textContent = "No se pudo cargar la librería QR.";
        return;
      }

      if (!qr) qr = new Html5Qrcode("qrReader");

      const isBar = scanMode === "BAR";
      const config = {
        fps: isBar ? 8 : 10,
        qrbox: isBar ? { width: 160, height: 320 } : { width: 250, height: 250 },
        formatsToSupport: isBar
          ? [Html5QrcodeSupportedFormats.CODE_128]
          : [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };

      const onDecoded = async (decodedText) => {
        const code = String(decodedText || "").trim().toUpperCase();
        if (!code) return;

        // ===== TARGET: SUPERVISOR =====
        if (qrTarget === "SUP_VIN") {
          const supVinEl = document.getElementById("supVin");
          if (supVinEl) supVinEl.value = code;

          if (msg) msg.textContent = `VIN detectado: ${code}`;
          await closeQRModal();

          // dispara búsqueda del reporte (sin auto-start / sin sync)
          if (currentModule === "SUPERVISOR") {
            fetchSupervisorReport_().catch(() => {});
          }
          return;
        }

        // ===== TARGET: WORK (TECNICO/CALIDAD) =====
        const vinEl = el_("vin");
        if (vinEl) vinEl.value = code;

        if (msg) msg.textContent = `VIN detectado: ${code}`;
        await closeQRModal();

        await withLock(async () => {
          await refreshEstadoForVinRole({ showOut: false });
          const rolTrabajo = getRolTrabajoCurrent_();
          await autoStartFromScan_(code, rolTrabajo);
          await syncNow({ forceFull: true, showOut: false });
          await refreshEstadoForVinRole({ showOut: false });
        }, "Iniciando automáticamente...");
      };


      // 1) iPhone/Safari: exact environment
      try {
        await qr.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {});
        return;
      } catch {}

      // 2) fallback: environment
      try {
        await qr.start({ facingMode: "environment" }, config, onDecoded, () => {});
        return;
      } catch {}

      // 3) fallback: cameraId
      const devices = await Html5Qrcode.getCameras();
      let cameraId = null;
      if (devices && devices.length) {
        const env = devices.find((d) => /back|rear|environment/i.test(d.label || ""));
        cameraId = env ? env.id : devices[0].id;
      }

      await qr.start(cameraId ?? devices?.[0]?.id ?? { facingMode: "environment" }, config, onDecoded, () => {});
    } catch {
      if (msg) msg.textContent = "No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost).";
    }
  }

  async function stopQR() {
    try {
      if (qr && qr.isScanning) await qr.stop();
    } catch {}
  }

  // ==========================================================
  // 18) AUTO-INICIO: TECNICO + CALIDAD + SCAN
  // ==========================================================
  // --- TECNICO
  let tecnicoAutoInFlight_ = false;
  const tecnicoAutoDone_ = new Set();
  let tecnicoAutoQueue_ = [];

  function rolesTecnicoTargets_() {
    if (rolLock === "MOTOR") return ["MOTOR"];
    if (rolLock === "TANQUE") return ["TANQUE"];
    return ["MOTOR", "TANQUE"];
  }

  function makeAutoKey_(vin, rolTrabajo) {
    const v = String(vin || "").trim().toUpperCase();
    const r = String(rolTrabajo || "").trim().toUpperCase();
    return `${v}|${r}`;
  }

  async function enviarEventoRol_(accion, rolTrabajo, opts = {}) {
    const prevLock = rolLock;

    if (prevLock && prevLock !== rolTrabajo) return;

    try {
      rolLock = rolTrabajo;
      if ($("rol")) $("rol").value = rolTrabajo;
      await enviarEvento(accion, opts);
    } finally {
      rolLock = prevLock;
      enforceRolLock_();
    }
  }

  function tecnicoQueueMaybeAdd_(vin, rolTrabajo) {
    const k = makeAutoKey_(vin, rolTrabajo);
    if (tecnicoAutoDone_.has(k)) return;
    if (tecnicoAutoQueue_.includes(k)) return;
    tecnicoAutoQueue_.push(k);
  }

  async function tecnicoQueueDrainOne_() {
    if (tecnicoAutoInFlight_) return;
    if (!tecnicoAutoQueue_.length) return;

    const k = tecnicoAutoQueue_.shift();
    const [vin, rolTrabajo] = String(k).split("|");
    if (!vin || !rolTrabajo) return;
    if (tecnicoAutoDone_.has(k)) return;

    tecnicoAutoInFlight_ = true;
    try {
      const it = findItemByVinRol_(vin, rolTrabajo);
      const estado = String(it?.estado || "").toUpperCase();
      if (estado === "SIN_INICIAR") {
        await enviarEventoRol_("INICIO", rolTrabajo, {});
        tecnicoAutoDone_.add(k);
      }
    } finally {
      tecnicoAutoInFlight_ = false;
    }
  }

  async function autoStartTecnicoIfNeeded_(vin) {
    if (currentModule !== "TECNICO") return;

    const v = String(vin || "").trim().toUpperCase();
    if (!v) return;
    if (tecnicoAutoInFlight_) return;

    const roles = rolesTecnicoTargets_();

    if (rolLock) {
      const rol = roles[0];
      const k = makeAutoKey_(v, rol);
      if (tecnicoAutoDone_.has(k)) return;

      const it = findItemByVinRol_(v, rol);
      const estado = String(it?.estado || "").toUpperCase();
      if (estado !== "SIN_INICIAR") return;

      tecnicoAutoInFlight_ = true;
      try {
        await enviarEventoRol_("INICIO", rol, {});
        tecnicoAutoDone_.add(k);
      } finally {
        tecnicoAutoInFlight_ = false;
      }
      return;
    }

    for (const rol of roles) {
      const it = findItemByVinRol_(v, rol);
      const estado = String(it?.estado || "").toUpperCase();
      if (estado === "SIN_INICIAR") tecnicoQueueMaybeAdd_(v, rol);
    }

    await tecnicoQueueDrainOne_();
  }

  // --- CALIDAD
  let calidadAutoInFlight_ = false;
  const calidadAutoDone_ = new Set();

  function keyForAuto_(vin, rolTrabajo) {
    const v = String(vin || "").trim().toUpperCase();
    const r = String(rolTrabajo || "").trim().toUpperCase();
    return `${v}|${r}`;
  }

  async function autoStartCalidadIfNeeded_(vin) {
    if (currentModule !== "CALIDAD") return;

    const v = String(vin || "").trim().toUpperCase();
    if (!v) return;

    const rol = "CALIDAD";
    if (calidadAutoInFlight_) return;

    const it = findItemByVinRol_(v, rol);
    const estado = String(it?.estado || "").toUpperCase();
    if (estado !== "SIN_INICIAR") return;

    const kDone = keyForAuto_(v, rol);
    if (calidadAutoDone_.has(kDone)) return;

    calidadAutoInFlight_ = true;
    try {
      await autoStartFromScan_(v, rol);
      calidadAutoDone_.add(kDone);
    } finally {
      calidadAutoInFlight_ = false;
    }
  }

  // --- Auto inicio al escanear / pick
  let lastAutoStart_ = { k: "", t: 0 };

  async function autoStartFromScan_(vin, rolTrabajo) {
    const v = String(vin || "").trim().toUpperCase();
    const rol = String(rolTrabajo || "").trim().toUpperCase();
    if (!v) return;

    const k = `${v}|${rol}`;
    const now = Date.now();
    if (lastAutoStart_.k === k && now - lastAutoStart_.t < 1200) return;
    lastAutoStart_ = { k, t: now };

    const it = findItemByVinRol_(v, rol);
    const estado = String(it?.estado || "").toUpperCase();

    if (estado === "SIN_INICIAR") {
      await enviarEvento("INICIO");
    }
  }

  // ==========================================================
  // 19) VIN AUTOCOMPLETE (backend /api/vin-suggest)
  // ==========================================================
  const VIN_AC = {
    APS_URL: window.__APS_URL || "",
    APS_KEY: window.__APS_KEY || "",
    MIN_CHARS: 2,
    LIMIT: 12,
    DEBOUNCE_MS: 200,
    AUTO_SUBMIT_ON_PICK: false,
  };

  if (!VIN_AC.APS_URL || !VIN_AC.APS_KEY) {
    console.warn("Falta APS_URL/APS_KEY. VIN autocomplete deshabilitado.");
  }

  let vinAcTimer = null;
  let vinAcItems = [];
  let vinAcOpen = false;
  let vinAcIndex = -1;
  let vinAcLastQ = "";
  let vinAcAbort = null;

  function vinAcBox_() {
    return el_("vinSuggest");
  }

  function vinAcHide_() {
    const box = vinAcBox_();
    if (!box) return;
    vinAcOpen = false;
    vinAcIndex = -1;
    vinAcItems = [];
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  function vinAcRender_() {
    const box = vinAcBox_();
    if (!box) return;

    if (!vinAcItems.length) return vinAcHide_();

    box.innerHTML = vinAcItems
      .map((vin, i) => {
        const active = i === vinAcIndex ? "active" : "";
        return `
          <div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === vinAcIndex}">
            <div class="vsVin">${escapeHtml(vin)}</div>
            <div class="vsHint">Enter</div>
          </div>
        `;
      })
      .join("");

    box.classList.remove("hidden");
    vinAcOpen = true;
  }

  function vinAcSetIndex_(i) {
    vinAcIndex = Math.max(0, Math.min(i, vinAcItems.length - 1));
    vinAcRender_();

    const box = vinAcBox_();
    const el = box?.querySelector(`.vsItem[data-idx="${vinAcIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  async function vinAcFetch_(q) {
    try {
      vinAcAbort?.abort?.();
    } catch {}
    vinAcAbort = new AbortController();

    const url = `/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(VIN_AC.LIMIT)}`;
    const r = await fetch(url, { signal: vinAcAbort.signal });
    const j = await r.json();
    if (!j || !j.ok) return [];
    return Array.isArray(j.items) ? j.items : [];
  }

  function vinAcOnInput_() {
    const input = el_("vin");
    if (!input) return;

    const q = String(input.value || "").trim().toUpperCase();
    vinAcLastQ = q;

    if (!q || q.length < VIN_AC.MIN_CHARS) return vinAcHide_();

    clearTimeout(vinAcTimer);
    vinAcTimer = setTimeout(async () => {
      try {
        const items = await vinAcFetch_(q);
        if (vinAcLastQ !== q) return;

        vinAcItems = (items || []).map((v) => String(v || "").toUpperCase()).filter(Boolean);
        vinAcIndex = vinAcItems.length ? 0 : -1;
        vinAcRender_();
      } catch {
        vinAcHide_();
      }
    }, VIN_AC.DEBOUNCE_MS);
  }

  function vinAcPick_(vin) {
    const input = el_("vin");
    if (!input) return;

    input.value = String(vin || "").toUpperCase();
    vinAcHide_();

    refreshEstadoForVinRole({ showOut: false })
      .then(async () => {
        await withLock(async () => {
          const rolTrabajo = getRolTrabajoCurrent_();
          await autoStartFromScan_(input.value, rolTrabajo);
          await syncNow({ forceFull: false, showOut: false });
          await refreshEstadoForVinRole({ showOut: false });
        }, "Iniciando automáticamente...");
      })
      .catch(() => {});

    if (VIN_AC.AUTO_SUBMIT_ON_PICK) el_("btnEstado")?.click?.();
  }

  function vinAcOnKeyDown_(e) {
    if (!vinAcOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      return vinAcSetIndex_(vinAcIndex + 1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      return vinAcSetIndex_(vinAcIndex - 1);
    }
    if (e.key === "Enter") {
      if (vinAcIndex >= 0 && vinAcItems[vinAcIndex]) {
        e.preventDefault();
        return vinAcPick_(vinAcItems[vinAcIndex]);
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      return vinAcHide_();
    }
  }

  // bind once (para ambos boxes)
  (function bindVinSuggestOnce() {
    const boxT = $("vinSuggest");
    const boxQ = $("vinSuggestQ");

    [boxT, boxQ].forEach((box) => {
      if (!box) return;
      if (box.dataset.bound === "1") return;
      box.dataset.bound = "1";

      box.addEventListener("mousedown", (e) => {
        const it = e.target.closest(".vsItem[data-idx]");
        if (!it) return;
        e.preventDefault();
        const idx = Number(it.dataset.idx);
        const vin = vinAcItems[idx];
        if (vin) vinAcPick_(vin);
      });
    });

    document.addEventListener("click", (e) => {
      if (!vinAcOpen) return;

      const wraps = document.querySelectorAll(".vinWrap");
      const insideSomeWrap = [...wraps].some((w) => w.contains(e.target));
      if (insideSomeWrap) return;

      vinAcHide_();
    });
  })();


  // ==========================================================
  // 19B) SUPERVISOR NAME AUTOCOMPLETE (/api/name-suggest)
  // ==========================================================

  let supNameAll_ = [];        // lista completa cacheada
  let supNameAllLoaded_ = false;
  let supNameAllLoading_ = false;


  const SUP_NAME_AC = {
    MIN_CHARS: 2,
    LIMIT: 12,
    DEBOUNCE_MS: 30,
  };

  let supNameAcTimer = null;
  let supNameAcItems = [];
  let supNameAcOpen = false;
  let supNameAcIndex = -1;
  let supNameAcLastQ = "";
  let supNameAcAbort = null;

  function supNameAcBox_() {
    return document.getElementById("supNameSuggest");
  }

  function supNameAcHide_() {
    const box = supNameAcBox_();
    if (!box) return;
    supNameAcOpen = false;
    supNameAcIndex = -1;
    supNameAcItems = [];
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  function supNameAcRender_() {
    const box = supNameAcBox_();
    if (!box) return;

    if (!supNameAcItems.length) return supNameAcHide_();

    box.innerHTML = supNameAcItems
      .map((u, i) => {
        const active = i === supNameAcIndex ? "active" : "";
        const label = u?.label || "";
        const name = u?.name || "";
        const email = u?.email || "";
        return `
          <div class="nsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === supNameAcIndex}">
            <div class="nsName">${escapeHtml(name || label)}</div>
            <div class="nsEmail">${escapeHtml(email || "")}</div>
          </div>
        `;
      })
      .join("");

    box.classList.remove("hidden");
    supNameAcOpen = true;
  }

  function supNameAcSetIndex_(i) {
    supNameAcIndex = Math.max(0, Math.min(i, supNameAcItems.length - 1));
    supNameAcRender_();

    const box = supNameAcBox_();
    const el = box?.querySelector(`.nsItem[data-idx="${supNameAcIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  async function supNameAcFetch_(q) {
    const qq = String(q || "").trim().toLowerCase();
    if (!qq) return [];

    // 1) si ya cargamos la lista completa -> filtra local (instantáneo)
    if (supNameAllLoaded_) {
      return supNameAll_
        .filter((u) => {
          const name = String(u?.name || "").toLowerCase();
          const email = String(u?.email || "").toLowerCase();
          const label = String(u?.label || "").toLowerCase();
          return (name + " " + email + " " + label).includes(qq);
        })
        .slice(0, SUP_NAME_AC.LIMIT);
    }

    // 2) si aún no cargamos, la pedimos 1 sola vez usando tu endpoint actual
    //    (truco: mandamos q="." para que devuelva TODO si tu backend lo permite)
    //    Si tu backend NO soporta "todo", igual cacheamos lo que devuelva.
    if (!supNameAllLoading_) {
      supNameAllLoading_ = true;
      try {
        const url = `/api/name-suggest?q=${encodeURIComponent(".")}&limit=200`;
        const r = await fetch(url);
        const j = await r.json();
        const items = (j && j.ok && Array.isArray(j.items)) ? j.items : [];

        supNameAll_ = items.map((x) => ({
          userId: String(x?.userId || ""),
          name: String(x?.name || ""),
          email: String(x?.email || ""),
          label: String(x?.label || ""),
        }));

        supNameAllLoaded_ = true;
      } catch {
        // si falla, no bloqueamos (seguirá usando fetch normal abajo)
      } finally {
        supNameAllLoading_ = false;
      }
    }

    // 3) fallback: mientras carga (o si no funcionó), usa fetch normal con debounce corto
    try {
      supNameAcAbort?.abort?.();
    } catch {}
    supNameAcAbort = new AbortController();

    const url =
      `/api/name-suggest?q=${encodeURIComponent(qq)}&limit=${encodeURIComponent(SUP_NAME_AC.LIMIT)}`;

    const r = await fetch(url, { signal: supNameAcAbort.signal });
    const j = await r.json();
    if (!j || !j.ok) return [];
    return Array.isArray(j.items) ? j.items : [];
  }


  function supNameAcOnInput_() {
    if (currentModule !== "SUPERVISOR") return;

    const input = document.getElementById("supName");
    if (!input) return;

    const q = String(input.value || "").trim().toLowerCase();
    supNameAcLastQ = q;

    if (!q || q.length < SUP_NAME_AC.MIN_CHARS) return supNameAcHide_();

    clearTimeout(supNameAcTimer);
    supNameAcTimer = setTimeout(async () => {
      try {
        const items = await supNameAcFetch_(q);
        if (supNameAcLastQ !== q) return;

        supNameAcItems = (items || []).map((x) => ({
          userId: String(x?.userId || ""),
          name: String(x?.name || ""),
          email: String(x?.email || ""),
          label: String(x?.label || ""),
        }));
        supNameAcIndex = supNameAcItems.length ? 0 : -1;
        supNameAcRender_();
      } catch {
        supNameAcHide_();
      }
    }, SUP_NAME_AC.DEBOUNCE_MS);
  }

  function supNameAcPick_(u) {
    const input = document.getElementById("supName");
    if (!input) return;

    const name  = String(u?.name || u?.label || "").trim();
    // const email = String(u?.email || "").trim(); // ya no lo pegamos

    // ✅ SOLO nombre en el input
    input.value = name;

    supNameAcHide_();

    // ✅ que busque al escoger
    supervisorDebounceFetch_();
  }


  function supNameAcOnKeyDown_(e) {
    if (!supNameAcOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      return supNameAcSetIndex_(supNameAcIndex + 1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      return supNameAcSetIndex_(supNameAcIndex - 1);
    }
    if (e.key === "Enter") {
      if (supNameAcIndex >= 0 && supNameAcItems[supNameAcIndex]) {
        e.preventDefault();
        return supNameAcPick_(supNameAcItems[supNameAcIndex]);
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      return supNameAcHide_();
    }
  }

  // bind once (click pick + click outside)
  (function bindSupNameSuggestOnce() {
    const box = document.getElementById("supNameSuggest");
    if (!box) return;
    if (box.dataset.bound === "1") return;
    box.dataset.bound = "1";

    box.addEventListener("mousedown", (e) => {
      const it = e.target.closest(".nsItem[data-idx]");
      if (!it) return;
      e.preventDefault();
      const idx = Number(it.dataset.idx);
      const u = supNameAcItems[idx];
      if (u) supNameAcPick_(u);
    });

    document.addEventListener("click", (e) => {
      if (!supNameAcOpen) return;

      const wrap = document.querySelector(".supNameWrap") || document.getElementById("supName")?.parentElement;
      if (wrap && wrap.contains(e.target)) return;

      supNameAcHide_();
    });
  })();

  // ==========================================================
  // 20) DELEGACIÓN CLICK (ACTIVAS / FINALIZADOS)
  // ==========================================================
  function attachFinalizadosDelegationOnce_(mod) {
    withModule_(mod, () => {
      const box = el_("finalizadosBox");
      if (!box) return;

      const markKey = `boundFin_${mod}`;
      if (box.dataset[markKey] === "1") return;
      box.dataset[markKey] = "1";

      box.addEventListener("click", (e) => {
        const go = e.target.closest('button[data-go="RF"]');
        if (!go) return;

        if (!(currentModule === "TECNICO" || currentModule === "CALIDAD")) return;

        const vin = String(go.dataset.vin || "").trim().toUpperCase();
        if (!vin) return;

        openRegistroFallas_(vin);
      });
    });
  }

  function attachActivasDelegationOnce_(mod) {
    withModule_(mod, () => {
      const box = el_("activasBox");
      if (!box) return;

      const markKey = `bound_${mod}`;
      if (box.dataset[markKey] === "1") return;
      box.dataset[markKey] = "1";

      // mostrar botón guardar nota
      box.addEventListener("input", (e) => {
        const ta = e.target.closest("textarea.notaCard");
        if (!ta) return;
        const btn = ta.closest(".jobCard")?.querySelector(".btnNota");
        if (btn) btn.style.display = ta.value.trim() ? "block" : "none";
      });

      box.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-act]");
        const card = e.target.closest(".jobCard");
        if (!card) return;

        const c = ctx_();
        const k = card.dataset.key || "";
        const it = c.itemsByKey.get(k);
        if (!it) return;

        // Registro/Fallas
        const go = e.target.closest("button[data-go]");
        if (go && go.dataset.go === "RF") {
          e.stopPropagation();
          if (currentModule === "RAMALERO") return;
          const vin = String(go.dataset.vin || it.vin || "").trim().toUpperCase();
          if (!vin) return;
          openRegistroFallas_(vin);
          return;
        }

        // ✅ Conformidad de equipo
        if (go && go.dataset.go === "CONF") {
          e.stopPropagation();

          // NO tocamos el input VIN global
          const vinCard = String(it.vin || "").trim().toUpperCase();
          const rolCard = String(it.rolTrabajo || "").trim().toUpperCase();

          if (!vinCard || (rolCard !== "MOTOR" && rolCard !== "TANQUE")) return;

          openConfModal_({
            conversionId: it.conversionId, // ✅ AÑADIR
            vin: vinCard,
            rolTrabajo: rolCard,
            tanque_asignado: it.tanque_asignado || "",
            reductor_asignado: it.reductor_asignado || "",
            tanque_registrado: it.tanque_registrado || "",
            reductor_registrado: it.reductor_registrado || "",
          });

          return;
        }


        if (btn) {
          e.stopPropagation();
          const accion = String(btn.dataset.act || "").toUpperCase();

          if (currentModule === "RAMALERO") {
            const nota =
              accion === "NOTA" ? String(card.querySelector("textarea.notaCard")?.value || "").trim() : "";

            await enviarEvento(accion, {
              conversionId: it.conversionId,
              tipoRamal: it.tipoRamal,
              nota,
              clearKey: k,
            });
            return;
          }

          // TECNICO/CALIDAD: set VIN input
          const vinEl = el_("vin");
          if (vinEl) vinEl.value = it.vin || "";

          if (currentModule === "TECNICO" && !rolLock) {
            if ($("rol")) $("rol").value = it.rolTrabajo || "MOTOR";
            enforceRolLock_();
          }

          if (accion === "NOTA" && $("nota")) {
            $("nota").value = String(card.querySelector("textarea.notaCard")?.value || "");
          }

          await enviarEvento(accion, { clearKey: k });
          return;
        }

        // abrir/cerrar card (solo 1 abierta)
        const wasOpen = card.classList.contains("open");
        box.querySelectorAll(".jobCard.open").forEach((x) => x.classList.remove("open"));
        if (!wasOpen) card.classList.add("open");
      });
    });
  }

  // ==========================================================
  // 21) LISTENERS (GLOBAL)
  // ==========================================================

  document.getElementById("btnCloseConf")?.addEventListener("click", () => closeConfModal_());
  document.getElementById("confModal")?.addEventListener("click", async (e) => {
    if (e.target === document.getElementById("confModal")) await closeConfModal_();
  });

  document.getElementById("btnConfQR")?.addEventListener("click", () => startConfQR_());
  document.getElementById("btnConfStopQR")?.addEventListener("click", async () => {
    await stopConfQR_();
    const wrap = document.getElementById("confQrWrap");
    if (wrap) wrap.style.display = "none";
  });

  document.getElementById("btnConfClear")?.addEventListener("click", () => {
    const input = document.getElementById("confCode");
    if (input) input.value = "";
    confQrMsg_("");
    confSetMsg_("");
  });

  document.getElementById("btnConfSave")?.addEventListener("click", () => {
    saveConf_().catch(() => {});
  });


  // RAMALERO: crear nuevo ramal (sin onclick inline)
  document.getElementById("btnRamalNuevo")?.addEventListener("click", async () => {
    if (currentModule !== "RAMALERO") return;
    await enviarEvento("INICIO");
  });

  document.getElementById("btnSupQR")?.addEventListener("click", () => {
    if (currentModule !== "SUPERVISOR") return;
    openQRModal("SUP_VIN");
  });


  document.getElementById("supName")?.addEventListener("input", () => {
    if (currentModule !== "SUPERVISOR") return;
    supNameAcOnInput_();
  });

  document.getElementById("supName")?.addEventListener("keydown", (e) => {
    if (currentModule !== "SUPERVISOR") return;
    supNameAcOnKeyDown_(e);
  });


  document.querySelectorAll("[data-suptrack]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentModule !== "SUPERVISOR") return;
      setSupTrack_(btn.dataset.suptrack);
    });
  });

  document.getElementById("btnSupApply")?.addEventListener("click", () => {
    if (currentModule !== "SUPERVISOR") return;
    fetchSupervisorReport_().catch(() => {});
  });

  document.getElementById("btnSupClear")?.addEventListener("click", () => {
    if (currentModule !== "SUPERVISOR") return;

    const name = document.getElementById("supName");
    const vin = document.getElementById("supVin");
    const f = document.getElementById("supFrom");
    const t = document.getElementById("supTo");
    const m = document.getElementById("supMonth");

    if (name) name.value = "";
    if (vin) vin.value = "";
    if (f) f.value = "";
    if (t) t.value = "";
    if (m) m.value = "";

    fetchSupervisorReport_().catch(() => {});
  });

  $("btnTheme")?.addEventListener("click", toggleTheme_);

  $("btnRegistroFallas")?.addEventListener("click", () => {
    window.open(REG_FALLAS_BASE, "_blank", "noopener");
  });

  $("btnMe")?.addEventListener("click", async () => {
    const email = getEmail();
    await doLogin(email);
  });

  $("btnLogout")?.addEventListener("click", () => {
    clearEmail();
    $("email").value = "";
    currentProfile = null;
    currentModule = null;

    stopLoopsFor_("TECNICO");
    stopLoopsFor_("CALIDAD");
    stopLoopsFor_("RAMALERO");

    clearModuleUI_("TECNICO");
    clearModuleUI_("CALIDAD");
    clearModuleUI_("RAMALERO");

    hideAllModules();
    $("viewHub").style.display = "none";
    document.getElementById("debugWrap")?.classList.add("debug-hidden");

    showLogin("Sesión cerrada.");
  });

  // Estado / Crear OT (TECNICO)
  $("btnEstado")?.addEventListener("click", async () => {
    if (currentModule !== "TECNICO") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
    }, "Buscando / creando OT...");
  });

  // Estado / Crear OT (CALIDAD)
  $("btnEstadoQ")?.addEventListener("click", async () => {
    if (currentModule !== "CALIDAD") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
      await autoStartCalidadIfNeeded_(getVin());
    }, "Buscando / creando OT...");
  });

  // Refrescar
  $("btnActivas")?.addEventListener("click", async () => {
    if (currentModule !== "TECNICO") return;
    await withLock(async () => {
      await syncNow({ forceFull: true, showOut: true });
    }, "Refrescando...");
  });

  $("btnActivasQ")?.addEventListener("click", async () => {
    if (currentModule !== "CALIDAD") return;
    await withLock(async () => {
      await syncNow({ forceFull: true, showOut: true });
    }, "Refrescando...");
  });

  // Finalizados
  $("btnFinalizados")?.addEventListener("click", async () => {
    if (currentModule !== "TECNICO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("btnFinalizadosQ")?.addEventListener("click", async () => {
    if (currentModule !== "CALIDAD") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  // RAMALERO refrescar / finalizados
  $("btnActivasR")?.addEventListener("click", async () => {
    if (currentModule !== "RAMALERO") return;
    await withLock(async () => {
      await syncNow({ forceFull: true, showOut: true });
    }, "Refrescando...");
  });

  $("btnFinalizadosR")?.addEventListener("click", async () => {
    if (currentModule !== "RAMALERO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  // VIN input (TECNICO)
  $("vin")?.addEventListener("input", () => {
    if (currentModule !== "TECNICO") return;
    vinAcOnInput_();
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });


  $("vin")?.addEventListener("keydown", (e) => {
    if (currentModule !== "TECNICO") return;
    vinAcOnKeyDown_(e);
  });

  // VIN input (CALIDAD)
  $("vinQ")?.addEventListener("input", () => {
    if (currentModule !== "CALIDAD") return;
    vinAcOnInput_();
    setEstadoText("");
    scheduleEstadoRefresh_(650);
  });


  $("vinQ")?.addEventListener("keydown", (e) => {
    if (currentModule !== "CALIDAD") return;
    vinAcOnKeyDown_(e);
  });

  $("rol")?.addEventListener("change", () => {
    if (currentModule !== "TECNICO") return;
    scheduleEstadoRefresh_(0);
  });


  // QR
  $("btnQR")?.addEventListener("click", () => {
    if (!isWorkModule_()) return;
    openQRModal();
  });

  $("btnQRQ")?.addEventListener("click", () => {
    if (!isWorkModule_()) return;
    openQRModal();
  });

  $("btnCloseQR")?.addEventListener("click", closeQRModal);

  $("qrModal")?.addEventListener("click", async (e) => {
    if (e.target === $("qrModal")) await closeQRModal();
  });

  // ==========================================================
  // 23) CONFORMIDAD DE EQUIPO (MODAL + QR + GUARDAR)
  // ==========================================================
  let confQR = null;
  let confCtx_ = null; // { vin, rolTrabajo, ... }

  function confSetMsg_(t) {
    const el = document.getElementById("confMsg");
    if (el) el.textContent = String(t || "");
  }

  function openConfModal_(ctx) {
    confCtx_ = { ...ctx };

    const modal = document.getElementById("confModal");
    if (!modal) return;

    const vinInfo = document.getElementById("confVinInfo");
    if (vinInfo) vinInfo.textContent = `VIN: ${confCtx_.vin} | Rol: ${confCtx_.rolTrabajo}`;

    // asignado + registrado info
    const box = document.getElementById("confAssignedBox");
    if (box) {
      const isTanque = confCtx_.rolTrabajo === "TANQUE";
      const asign = isTanque ? confCtx_.tanque_asignado : confCtx_.reductor_asignado;
      const reg   = isTanque ? confCtx_.tanque_registrado : confCtx_.reductor_registrado;

      const labAsign = isTanque ? "Tanque asignado" : "Reductor asignado";
      const labReg   = isTanque ? "Tanque registrado" : "Reductor registrado";

      box.innerHTML = `
        <div><b>${escapeHtml(labAsign)}:</b> ${escapeHtml(String(asign||"NO ASIGNADO"))}</div>
        <div style="margin-top:4px;"><b>${escapeHtml(labReg)}:</b> ${escapeHtml(String(reg||"—"))}</div>
      `;
    }

    // prefill input con lo ya registrado
    const input = document.getElementById("confCode");
    if (input) {
      const isTanque = confCtx_.rolTrabajo === "TANQUE";
      const reg = isTanque ? confCtx_.tanque_registrado : confCtx_.reductor_registrado;
      input.value = String(reg || "");
    }

    // checklist (no pisa si ya estaban marcados; si quieres reset, descomenta)
    // ["confCk1","confCk2","confCk3","confCk4"].forEach(id => { const c=$(id); if(c) c.checked=false; });

    confSetMsg_("");
    modal.classList.add("show");

    // oculta QR wrap al abrir
    const qrWrap = document.getElementById("confQrWrap");
    if (qrWrap) qrWrap.style.display = "none";
  }

  async function closeConfModal_() {
    const modal = document.getElementById("confModal");
    modal?.classList?.remove("show");
    await stopConfQR_();
    confCtx_ = null;
    confSetMsg_("");
  }

  function confQrMsg_(t) {
    const el = document.getElementById("confQrMsg");
    if (el) el.textContent = String(t || "");
  }

  async function startConfQR_() {
    try {
      if (!window.Html5Qrcode) {
        confQrMsg_("No se pudo cargar la librería QR.");
        return;
      }
      const wrap = document.getElementById("confQrWrap");
      if (wrap) wrap.style.display = "block";

      if (!confQR) confQR = new Html5Qrcode("qrReader_conf");

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      };

      const onDecoded = async (decodedText) => {
        const code = String(decodedText || "").trim().toUpperCase();
        if (!code) return;

        const input = document.getElementById("confCode");
        if (input) input.value = code;

        confQrMsg_(`Código detectado: ${code}`);
        await stopConfQR_();
        const wrap = document.getElementById("confQrWrap");
        if (wrap) wrap.style.display = "none";
      };

      // iPhone/Safari: exact environment
      try {
        await confQR.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {});
        confQrMsg_("Apunta al QR del equipo.");
        return;
      } catch {}

      // fallback: environment
      await confQR.start({ facingMode: "environment" }, config, onDecoded, () => {});
      confQrMsg_("Apunta al QR del equipo.");
    } catch {
      confQrMsg_("No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost).");
    }
  }

  async function stopConfQR_() {
    try {
      if (confQR && confQR.isScanning) await confQR.stop();
    } catch {}
  }

  function readConfChecks_() {
    const getC = (id) => !!document.getElementById(id)?.checked;
    return {
      ck1: getC("confCk1"),
      ck2: getC("confCk2"),
      ck3: getC("confCk3"),
      ck4: getC("confCk4"),
    };
  }

  async function saveConf_() {
    if (!confCtx_?.vin || !confCtx_?.rolTrabajo) return;

    let email;
    try {
      email = requireEmailOrStop();
    } catch {
      return;
    }

    const code = String(document.getElementById("confCode")?.value || "").trim().toUpperCase();
    if (!code) {
      confSetMsg_("Ingresa o escanea el código del equipo.");
      return;
    }

    const checks = readConfChecks_();

    const payload = {
      email,
      conversionId: String(confCtx_?.conversionId || "").trim(), // ✅ AÑADIR
      vin: confCtx_.vin,
      rolTrabajo: confCtx_.rolTrabajo,
      equipoCodigo: code,
      checks,
    };


    const j = await postJSON_user("/api/equipo-conformidad", payload, "Guardando conformidad...");
    if (!j || !j.ok) {
      confSetMsg_(j?.error || "Error guardando.");
      return;
    }

    // ✅ actualiza UI local (store) para que se vea "REGISTRADO" sin esperar sync
    try {
      const c = ctx_();
      const it = findItemByVinRol_(confCtx_.vin, confCtx_.rolTrabajo);
      if (it) {
        if (confCtx_.rolTrabajo === "TANQUE") it.tanque_registrado = code;
        if (confCtx_.rolTrabajo === "MOTOR") it.reductor_registrado = code;

        const k = keyOfItem_(it);
        c.itemsByKey.set(k, it);
        renderActivas_();
      }
    } catch {}

    confSetMsg_("✅ Conformidad guardada.");
    setTimeout(() => closeConfModal_().catch(() => {}), 450);

    // refresco suave
    setTimeout(() => {
      if (!uiLocked) syncNow({ forceFull: false, showOut: false }).catch(() => {});
    }, 650);
  }


  // ==========================================================
  // 22) AUTO LOGIN ON LOAD
  // ==========================================================
  window.addEventListener("load", async () => {
    const saved = loadEmail();
    if (!saved) return showLogin("");
    $("email").value = saved;
    initTheme_();
    await doLogin(saved);
  });
})();
