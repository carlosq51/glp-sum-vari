 // =========================
  // public/app.js  (REEMPLAZO TOTAL)
  // =========================
  const $ = (id) => document.getElementById(id);

  const EMAIL_KEY = "glp_email";

  // =========================
  // ROL LOCK (según especialidad)
  // =========================
  let rolLock = null; // "MOTOR" | "TANQUE" | null (null => ambos)

  let currentProfile = null;
  let currentModule = null;

  const MODULES = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];

  let uiLocked = false;

  // =========================
  // UI / STORE por módulo
  // =========================
  function modSuffix_() {
    if (currentModule === "CALIDAD") return "Q";
    if (currentModule === "RAMALERO") return "R";
    return "";
  }


  // Elemento del módulo actual: id o id+Q (si no existe, cae al id base)
  function el_(id) {
    const sfx = modSuffix_();
    const a = $(id + sfx);
    return a || $(id);
  }

  // Estado "AppSheet style" (por módulo)
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


  // Timers (uno por módulo, para no mezclar)
  const timersByModule = {
    TECNICO: { syncTimer: null, clockTimer: null, estadoTimer: null },
    CALIDAD: { syncTimer: null, clockTimer: null, estadoTimer: null },
    RAMALERO:{ syncTimer: null, clockTimer: null, estadoTimer: null },
  };

  function tctx_() {
    if (currentModule === "CALIDAD") return timersByModule.CALIDAD;
    if (currentModule === "RAMALERO") return timersByModule.RAMALERO;
    return timersByModule.TECNICO;
  }

  // =========================
  // UI LOCK
  // =========================
  function setOut(obj) {
    const out = $("out"); // debug es global, solo se muestra para ADMIN
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

    // botones del módulo actual (con fallback el_)
    const ids = ["btnEstado", "btnActivas", "btnFinalizados", "btnQR"];
    for (const id of ids) {
      const b = el_(id);
      if (b) b.disabled = uiLocked;
    }

    // botones dinámicos dentro de cards (solo del módulo actual)
    const actBox = el_("activasBox");
    const finBox = el_("finalizadosBox");
    actBox?.querySelectorAll("button[data-act]")?.forEach(b => (b.disabled = uiLocked));
    finBox?.querySelectorAll("button[data-act]")?.forEach(b => (b.disabled = uiLocked));
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

  // =========================
  // STORAGE
  // =========================

  const THEME_KEY = "glp_theme_v1"; // "night" | "day"

function applyTheme_(t){
  const theme = (t === "day") ? "day" : "night";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function loadTheme_(){
  try { return localStorage.getItem(THEME_KEY) || ""; } catch { return ""; }
}

function initTheme_(){
  const saved = loadTheme_();
  if (saved) return applyTheme_(saved);

  // si no hay preferencia guardada, usa el sistema
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme_(prefersLight ? "day" : "night");
}

function toggleTheme_(){
  const cur = document.documentElement.dataset.theme || "night";
  applyTheme_(cur === "day" ? "night" : "day");
}


  const VIN_CACHE_KEY = "glp_vin_cache_v1"; // no lo cambies

function vinCacheLoad_() {
  try { return JSON.parse(localStorage.getItem(VIN_CACHE_KEY) || "{}"); }
  catch { return {}; }
}

function vinCacheSave_(obj) {
  try { localStorage.setItem(VIN_CACHE_KEY, JSON.stringify(obj)); } catch {}
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

  // (opcional) limpiar entradas viejas (> 14 días) para que no crezca infinito
  const maxAge = 14 * 24 * 3600 * 1000;
  for (const kk of Object.keys(cache)) {
    if (!cache[kk]?.ts || (Date.now() - cache[kk].ts) > maxAge) delete cache[kk];
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

// =========================
// RAMAL CACHE (tipoRamal)
// =========================
const RAMAL_CACHE_KEY = "glp_ramal_cache_v1";

function ramalCacheLoad_() {
  try { return JSON.parse(localStorage.getItem(RAMAL_CACHE_KEY) || "{}"); }
  catch { return {}; }
}

function ramalCacheSave_(obj) {
  try { localStorage.setItem(RAMAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
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

  // limpieza (14 días)
  const maxAge = 14 * 24 * 3600 * 1000;
  for (const k of Object.keys(cache)) {
    if (!cache[k]?.ts || (Date.now() - cache[k].ts) > maxAge) delete cache[k];
  }

  ramalCacheSave_(cache);
}

function ramalCacheGet_(conversionId) {
  const cid = String(conversionId || "").trim();
  if (!cid) return "";
  const cache = ramalCacheLoad_();
  return String(cache[ramalCacheKey_(cid)]?.tipoRamal || "");
}



  function saveEmail(email) { localStorage.setItem(EMAIL_KEY, email); }
  function loadEmail() { return localStorage.getItem(EMAIL_KEY) || ""; }
  function clearEmail() { localStorage.removeItem(EMAIL_KEY); }

  function getEmail() { return String($("email").value || "").trim().toLowerCase(); }
  function getVin() { return String(el_("vin")?.value || "").trim().toUpperCase(); }

  function getRolTecnico_() {
    // ✅ si está bloqueado por especialidad (MOTOR/TANQUE), usa ese valor
    if (rolLock) return rolLock;

    const sel = $("rol");
    return sel ? String(sel.value || "MOTOR").toUpperCase() : "MOTOR";
  }


  // Rol efectivo según módulo
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

  // =========================
  // PROFILE / MODULOS
  // =========================
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

  function computeRolLock_(profile) {
    const rolUser = String(profile?.rol || "").toUpperCase();
    if (rolUser !== "TECNICO") return null;

    const esp = String(profile?.especialidad || "").toUpperCase();

    if (esp === "MOTOR") return "MOTOR";
    if (esp === "TANQUE" || esp === "TANQUERO") return "TANQUE";
    return null;
  }

  function enforceRolLock_() {
    // Solo aplica al módulo TECNICO (CALIDAD no tiene selector rol)
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
    // antes de cambiar, parar loops del módulo actual (si era de trabajo)
    if (currentModule === "TECNICO") stopLoopsFor_("TECNICO");
    if (currentModule === "CALIDAD") stopLoopsFor_("CALIDAD");
    if (currentModule === "RAMALERO") stopLoopsFor_("RAMALERO");


    currentModule = m;

    $("viewHub").style.display = "none";
    hideAllModules();

    const el = document.getElementById(`view${m}`);
    if (el) el.style.display = "block";

    // Bind delegación del box de este módulo (solo una vez)
    if (m === "TECNICO") attachActivasDelegationOnce_("TECNICO");
    if (m === "CALIDAD") attachActivasDelegationOnce_("CALIDAD");
    if (m === "RAMALERO") attachActivasDelegationOnce_("RAMALERO");

    if (m === "TECNICO") startLoopsFor_("TECNICO");
    else if (m === "CALIDAD") startLoopsFor_("CALIDAD");
    else if (m === "RAMALERO") startLoopsFor_("RAMALERO");

    enforceRolLock_();
  }

  // =========================
  // HELPERS
  // =========================

  function fmtShort_(iso){
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("es-PE", {
      day:"2-digit", month:"2-digit", year:"2-digit",
      hour:"2-digit", minute:"2-digit"
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
  // es-PE, hora Lima automática por navegador
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(d);
}


  // Key estable: CONVERSION_ID|ROL
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
      if (String(it.vin || "").toUpperCase() === v && String(it.rolTrabajo || "").toUpperCase() === r) {
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
  // CRONÓMETRO LOCAL
  // =========================
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

    // ⏱ actualizar cronómetro en cards activas
    el_("activasBox")?.querySelectorAll(".jobCard[data-key] .js-tiempo")?.forEach((el) => {
      const card = el.closest(".jobCard");
      if (!card) return;
      const k = card.dataset.key || "";
      const it = c.itemsByKey.get(k);
      if (!it) return;
      el.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;
    });

    // ⛔ RAMALERO no usa estadoBox (no VIN)
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


  // =========================
  // RENDER
  // =========================

  // =========================
// SUPERVISOR: TRACK (pantalla 3 botones)
// =========================
let supTrack = "CONVERSION"; // "CONVERSION" | "CALIDAD" | "RAMAL"

function setSupTrack_(t){
  supTrack = (t === "CALIDAD" || t === "RAMAL") ? t : "CONVERSION";

  // UI: marca activo
  document.querySelectorAll("[data-suptrack]").forEach(b => {
    const on = b.dataset.suptrack === supTrack;
    b.classList.toggle("active", on);
  });

  // (opcional) texto visible
  const pill = document.getElementById("supTrackPill");
  if (pill) pill.textContent =
    supTrack === "CONVERSION" ? "CONVERSIÓN (MOTOR + TANQUE)" :
    supTrack === "CALIDAD" ? "CALIDAD" : "RAMAL";

  // refresca reporte
  if (currentModule === "SUPERVISOR") fetchSupervisorReport_().catch(() => {});
}


  let supTimer = null;

  async function fetchSupervisorReport_(){
    const name = String(document.getElementById("supName")?.value || "").trim();
    const vin  = String(document.getElementById("supVin")?.value  || "").trim().toUpperCase();

    const from  = String(document.getElementById("supFrom")?.value  || "").trim();   // YYYY-MM-DD
    const to    = String(document.getElementById("supTo")?.value    || "").trim();   // YYYY-MM-DD
    const month = String(document.getElementById("supMonth")?.value || "").trim();   // YYYY-MM

    // ✅ compatibilidad: si tu backend solo tiene "q", armamos q = name + vin
    const q = [name, vin].filter(Boolean).join(" ").trim();

    const url =
      `/api/supervisor/report` +
      `?name=${encodeURIComponent(name)}` +
      `&vin=${encodeURIComponent(vin)}` +
      `&q=${encodeURIComponent(q)}` +          // 👈 compat
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


function renderSupervisor_(j){
  const sum = document.getElementById("supSummary");
  const box = document.getElementById("supTable");

  const items = Array.isArray(j.items) ? j.items : [];
  if (!box) return;

  if (!items.length){
    if (sum) sum.textContent = "Resultados: 0";
    box.innerHTML = `<div class="small">No hay resultados con esos filtros.</div>`;
    return;
  }

  // ✅ 1) CALIDAD / RAMAL: 1 registro = 1 trabajo (contador normal)
  if (supTrack === "CALIDAD" || supTrack === "RAMAL") {
    if (sum) sum.textContent = `Resultados: ${items.length}`;
    box.innerHTML = items.map(it => renderSupItemCard_(it)).join("");
    return;
  }

  // ✅ 2) CONVERSION: contar VIN únicos (MOTOR+TANQUE se agrupan)
  const groups = groupByVinMotorTanque_(items);

  const vinCount = groups.length;     // ✅ VIN únicos
  const regCount = items.length;      // registros crudos (motor+tanque)

  if (sum) sum.textContent = `Resultados: ${vinCount}`;

  // (tu lógica del avgCard se queda igual)
  const q = String(document.getElementById("supName")?.value || "").trim().toLowerCase();

  let avgCard = "";
  if (q) {
    let sumMotor = 0, nMotor = 0;
    let sumTanque = 0, nTanque = 0;

    for (const g of groups) {
      const m = g.motor;
      const t = g.tanque;

      if (m) {
        const who = String(m.userName || m.userEmail || m.userId || "").toLowerCase();
        const est = String(m.estado || "").toUpperCase();
        if (who.includes(q) && est === "FINALIZADO") {
          const ms = hmsToMs_(m.tiempo_hms ?? m.tiempo_ms ?? m.tiempo);
          if (ms > 0) { sumMotor += ms; nMotor++; }
        }
      }

      if (t) {
        const who = String(t.userName || t.userEmail || t.userId || "").toLowerCase();
        const est = String(t.estado || "").toUpperCase();
        if (who.includes(q) && est === "FINALIZADO") {
          const ms = hmsToMs_(t.tiempo_hms ?? t.tiempo_ms ?? t.tiempo);
          if (ms > 0) { sumTanque += ms; nTanque++; }
        }
      }
    }

    const sumTotal = sumMotor + sumTanque;
    const nTotal = nMotor + nTanque;

    const avgTotal = nTotal ? (sumTotal / nTotal) : 0;

    if (nTotal > 0) {
      avgCard = buildSupervisorAvgCardHTML_({
        q,
        countTotal: nTotal,
        avgTotalMs: avgTotal,
        countMotor: nMotor,
        avgMotorMs: nMotor ? (sumMotor / nMotor) : 0,
        countTanque: nTanque,
        avgTanqueMs: nTanque ? (sumTanque / nTanque) : 0,
      });
    }
  }

  box.innerHTML = avgCard + groups.map(g => renderSupConversionCard_(g)).join("");
}


// ---------------------------
// Card actual (tu versión base)
// ---------------------------
function renderSupItemCard_(it){
  const who = (it.userName || it.userEmail || it.userId || "-");
  const rolLabel = String(it.rol || it.rolTrabajo || "").toUpperCase() || "-";

  const isRamal = (rolLabel === "RAMALERO" || rolLabel === "RAMAL");
  const vinOrTipo = isRamal ? (`RAMAL: ${it.tipoRamal || "-"}`) : (it.vin || "-");

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
        <div class="pill" style="font-size:16px; font-weight:900;">⏱ ${escapeHtml(hmsOnly_(it.tiempo_hms ?? it.tiempo_ms ?? it.tiempo))}
</div>
      </div>
    </div>
  `;
}


// ---------------------------
// ✅ Agrupar por VIN: MOTOR + TANQUE
// ---------------------------
function groupByVinMotorTanque_(items){
  const map = new Map();

  for (const it of items) {
    const rol = String(it.rolTrabajo || it.rol || "").toUpperCase();
    const vin = String(it.vin || "").toUpperCase().trim();
    if (!vin) continue;

    if (!map.has(vin)) {
      map.set(vin, { vin, motor: null, tanque: null, updated_at: null });
    }

    const g = map.get(vin);
    if (rol === "MOTOR") g.motor = it;
    if (rol === "TANQUE") g.tanque = it;

    // para orden/“última actividad” del grupo
    const t = it.updated_at ? Date.parse(it.updated_at) : 0;
    const prev = g.updated_at ? Date.parse(g.updated_at) : 0;
    if (t > prev) g.updated_at = it.updated_at;
  }

  // convierte a array y ordena por última actualización (desc)
  const arr = [...map.values()];
  arr.sort((a,b) => (Date.parse(b.updated_at||0) - Date.parse(a.updated_at||0)));
  return arr;
}


// ---------------------------
// ✅ 1 Cartilla por VIN con 2 técnicos
// ---------------------------
function renderSupConversionCard_(g){
  const vin = g.vin;

  const m = g.motor;
  const t = g.tanque;

  const mWho = m ? (m.userName || m.userEmail || m.userId || "-") : "-";
  const tWho = t ? (t.userName || t.userEmail || t.userId || "-") : "-";

  const mEstado = m ? (m.estado || "-") : "-";
  const tEstado = t ? (t.estado || "-") : "-";

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



// ---------------------------
// ✅ Click: abre/cierra y pide detalle al backend
// ---------------------------



  function supervisorDebounceFetch_(){
    clearTimeout(supTimer);
    supTimer = setTimeout(() => {
      if (currentModule === "SUPERVISOR") fetchSupervisorReport_().catch(() => {});
    }, 250);
  }

  
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
          : (vin || "<span class='small'>(sin VIN)</span>");

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
            <div class="jobActionsSlot">
              ${buildBotonesByEstado_(estado)}
            </div>

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

    if (!c.finalKeys.length) {
      box.innerHTML = `<div class="small">No tienes finalizados.</div>`;
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
        </div>
      `;
    }

    box.innerHTML = out;
  }


  // Filtrado por módulo:
  // - TECNICO: MOTOR/TANQUE
  // - CALIDAD: CALIDAD
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

  // =========================
  // SYNC
  // =========================

  function mergePrevAndCache_(it, prev) {
    // VIN: si backend manda vacío, usa prev o cache
    if ((!it.vin || it.vin === "") && prev?.vin) it.vin = prev.vin;
    if (!it.vin && it.conversionId && it.rolTrabajo) {
      const cached = vinCacheGet_(it.conversionId, it.rolTrabajo);
      if (cached) it.vin = cached;
    }

    // RAMAL: tipoRamal vacío => prev o cache
    if (it.rolTrabajo === "RAMALERO") {
      if ((!it.tipoRamal || it.tipoRamal === "") && prev?.tipoRamal) it.tipoRamal = prev.tipoRamal;
      if (!it.tipoRamal && it.conversionId) {
        const cachedTipo = ramalCacheGet_(it.conversionId);
        if (cachedTipo) it.tipoRamal = cachedTipo;
      }
    }

    // updated_at / last_nota_ts: conserva si el backend no manda
    if (prev) {
      if (!it.updated_at) it.updated_at = prev.updated_at || null;
      if (!it.last_nota_ts) it.last_nota_ts = prev.last_nota_ts || null;
      if (!it.created_at) it.created_at = prev.created_at || null;
    }

    return it;
  }


  function normalizeItem_(raw) {
    const it = {
      conversionId: String(raw?.conversionId ?? raw?.CONVERSION_ID ?? "").trim(),
      vin: String(raw?.vin ?? raw?.VIN ?? "").trim().toUpperCase(),

      tipoRamal: String(
        raw?.tipoRamal ??
        raw?.tipo_ramal ??
        raw?.tipo ??
        raw?.TIPO_RAMAL ??
        ""
      ).trim(),

      // ✅ fecha de creación / inicio (prioridad)
      created_at:
        raw?.fecha_asignacion ?? raw?.FECHA_ASIGNACION ??   // ✅ PRIMERO
        raw?.fecha_inicio ?? raw?.inicio_at ?? raw?.FECHA_INICIO ??
        raw?.created_at ??
        raw?.fecha_creacion ?? raw?.FECHA_CREACION ??
        null,


      rolTrabajo: String(raw?.rolTrabajo ?? raw?.rol ?? raw?.ROL_TRABAJO ?? "").trim().toUpperCase(),
      estado: String(raw?.estado ?? raw?.ESTADO_ACTUAL ?? "").trim().toUpperCase(),

      tiempo_ms: Number(raw?.tiempo_ms ?? raw?.TIEMPO_TRAB_MS ?? 0) || 0,
      running_since: raw?.running_since ?? raw?.RUNNING_SINCE ?? null,

      last_nota: String(raw?.last_nota ?? raw?.LAST_NOTA ?? ""),
      last_nota_ts: raw?.last_nota_ts ?? raw?.LAST_NOTA_TS ?? null,

      updated_at: raw?.updated_at ?? raw?.UPDATED_AT ?? null,
    };

    // cache VIN por conversionId|rol
    if (it.conversionId && it.rolTrabajo && it.vin) {
      vinCacheSet_(it.conversionId, it.rolTrabajo, it.vin);
    }

    // cache RAMAL por conversionId
    if (it.conversionId && it.rolTrabajo === "RAMALERO" && it.tipoRamal) {
      ramalCacheSet_(it.conversionId, it.tipoRamal);
    }

    return it;
  }



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

      // en full replace no hay prev, solo cache
      mergePrevAndCache_(it, null);

      c.itemsByKey.set(k, it);
    }
  }


  function detectIfNeedsFullRerender_(prevActiveKeys, prevFinalKeys) {
    const c = ctx_();
    const a1 = prevActiveKeys.join(",");
    const a2 = c.activeKeys.join(",");
    const f1 = prevFinalKeys.join(",");
    const f2 = c.finalKeys.join(",");
    return (a1 !== a2) || (f1 !== f2);
  }

  async function syncNow({ forceFull = false, showOut = false } = {}) {
    if (uiLocked) return;
    if (!isWorkModule_()) return;

    let email;
    try { email = requireEmailOrStop(); } catch { return; }

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

    // ✅ CALIDAD: si el sync trajo OTs SIN_INICIAR, iniciar 1 por ciclo (para no spamear)
    if (currentModule === "CALIDAD") {
      const c = ctx_();

      // Busca la primera OT sin iniciar
      const first = c.activeKeys
        .map(k => c.itemsByKey.get(k))
        .find(it => it && String(it.rolTrabajo).toUpperCase() === "CALIDAD" && String(it.estado).toUpperCase() === "SIN_INICIAR");

      if (first?.vin) {
        // No bloquees el render; dispara y que el próximo ciclo lo termine de estabilizar
        autoStartCalidadIfNeeded_(first.vin).catch(() => {});
      }
    }

    // ✅ TECNICO: si el sync trajo OTs SIN_INICIAR, iniciar automático
    // - si rolLock existe: inicia ese rol
    // - si rolLock null: inicia 1 rol por ciclo (de la cola)
    if (currentModule === "TECNICO") {
      const c = ctx_();

      // buscamos VIN "candidato" (prioriza el VIN que esté en input si existe)
      const vinInput = getVin();
      let vinCandidato = vinInput;

      if (!vinCandidato) {
        // si no hay vin en input, toma el primero que tenga SIN_INICIAR (MOTOR/TANQUE)
        const first = c.activeKeys
          .map(k => c.itemsByKey.get(k))
          .find(it => it &&
            (String(it.rolTrabajo).toUpperCase() === "MOTOR" || String(it.rolTrabajo).toUpperCase() === "TANQUE") &&
            String(it.estado).toUpperCase() === "SIN_INICIAR" &&
            String(it.vin || "").trim()
          );

        vinCandidato = String(first?.vin || "").trim().toUpperCase();
      }

      if (vinCandidato) {
        autoStartTecnicoIfNeeded_(vinCandidato).catch(() => {});
      }
    }


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

    // estado visual
    card.className = `jobCard card state-${estado}` + (wasOpen ? " open" : "");

    // texto estado
    const estadoEl = card.querySelector(".js-estado");
    if (estadoEl) estadoEl.textContent = estado;

    // tiempo
    const timeEl = card.querySelector(".js-tiempo");
    if (timeEl) timeEl.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;

    // si está abierto, refresca botones para el nuevo estado
    if (wasOpen) {
      const slot = card.querySelector(".jobActionsSlot");
      if (slot) slot.innerHTML = buildBotonesByEstado_(estado);
    }
  }
}


  // =========================
  // ESTADO (1 VIN/ROL)
  // =========================
  async function refreshEstadoForVinRole({ showOut = false } = {}) {
    if (uiLocked) return;
    if (!isWorkModule_()) return;

    let email;
    try { email = requireEmailOrStop(); } catch { return; }

    const vin = getVin();
    const rolTrabajo = getRolTrabajoCurrent_();
    if (!vin) { setEstadoText(""); return; }

    const it = findItemByVinRol_(vin, rolTrabajo);
    if (it) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it))}`);

      // ✅ AUTO-INICIO
      if (currentModule === "CALIDAD") {
        await autoStartCalidadIfNeeded_(vin);
      } else if (currentModule === "TECNICO") {
        await autoStartTecnicoIfNeeded_(vin);
      }

      return;
    }


    const j = await getJSON(`/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(vin)}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`);
    if (showOut) setOut(j);
    if (!j.ok) { setEstadoText(j.error || "Error"); return; }

    const c = ctx_();
    const it2 = normalizeItem_(j);
    const k2 = keyOfItem_(it2);
    c.itemsByKey.set(k2, it2);

    rebuildListsFromStore_();
    renderActivas_();
    renderFinalizados_();

    setEstadoText(`Estado: ${it2.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it2))}`);

    // ✅ AUTO-INICIO si CALIDAD quedó en SIN_INICIAR (OT recién creada o recién detectada)
    if (currentModule === "CALIDAD") {
      await autoStartCalidadIfNeeded_(vin);
    } else if (currentModule === "TECNICO") {
      await autoStartTecnicoIfNeeded_(vin);
    }


  }

  // =========================
  // EVENTOS
  // =========================
  // =========================
  // EVENTOS (SOPORTA TECNICO / CALIDAD / RAMALERO)
  // =========================
  async function enviarEvento(accionOverride, opts = {}) {
    // ✅ ahora permite RAMALERO también
    if (!(currentModule === "TECNICO" || currentModule === "CALIDAD" || currentModule === "RAMALERO")) {
      return setOut({ ok: false, error: "Solo disponible en módulos TECNICO/CALIDAD/RAMALERO." });
    }

    let email;
    try { email = requireEmailOrStop(); } catch { return; }

    // rol efectivo por módulo
    let rolTrabajo = getRolTrabajoCurrent_(); // TECNICO=>MOTOR/TANQUE, CALIDAD=>CALIDAD
    if (currentModule === "RAMALERO") rolTrabajo = "RAMALERO";

    const accion = String(accionOverride || $("accion")?.value || "").toUpperCase();

    // nota (global)
    let nota = "";
    if (accion === "NOTA") {
      nota = String($("nota")?.value || "").trim();
      // si viene desde card: nota puede venir en opts.nota
      if (!nota && opts?.nota) nota = String(opts.nota || "").trim();
      if (!nota) return setOut({ ok: false, error: "Escribe una nota antes de guardar." });
    }

    // =========================
    // RAMALERO: NO requiere VIN
    // - Si NO hay conversionId:
    //    - solo INICIO
    //    - requiere tipoRamal
    // - Si hay conversionId:
    //    - PAUSA/REANUDAR/FIN/NOTA usan conversionId
    // =========================
    if (rolTrabajo === "RAMALERO") {
      // conversionId (RAMAL_ID) puede venir:
      // - desde card (it.conversionId)
      // - o desde opts.conversionId (si lo llamas manualmente)
      // - o desde un input id="ramalId" (si lo agregas)
      let conversionId =
        String(opts?.conversionId || "").trim() ||
        String(document.getElementById("ramalId")?.value || "").trim();

      // si no hay conversionId, solo se permite INICIO y hay que mandar tipoRamal
      let tipoRamal = String(opts?.tipoRamal || "").trim() ||
                      String(document.getElementById("tipoRamal")?.value || "").trim();

      if (!conversionId) {
        if (accion !== "INICIO") {
          return setOut({ ok: false, error: "RAMALERO: sin ID solo puedes INICIO (para crear RAMAL_ID)." });
        }
        if (!tipoRamal) {
          return setOut({ ok: false, error: "RAMALERO: selecciona tipoRamal (JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5)." });
        }
      }

      const payload = {
        email,
        rolTrabajo: "RAMALERO",
        accion,
        nota,
        // OJO: backend usa conversionId para identificar el trabajo
        conversionId: conversionId || undefined,
        // solo necesario cuando INICIO sin conversionId (crea RAMAL_ID)
        tipoRamal: (!conversionId && accion === "INICIO") ? tipoRamal : undefined,
      };

      const j = await postJSON_user(
        "/api/evento",
        payload,
        accion === "NOTA" ? "Guardando nota..." :
        accion === "INICIO" ? "Iniciando..." : "Registrando..."
      );

      setOut(j);
      if (!j || !j.ok) return;


      // =========================
      // ✅ ACTUALIZA STORE + UI INMEDIATO (RAMALERO)
      // =========================
      try {
        const c = ctx_();

        const it2 = normalizeItem_(j);

        // Si backend no devolvió tipoRamal, lo preservamos
        if (!it2.tipoRamal) it2.tipoRamal = tipoRamal || String(opts?.tipoRamal || "");

        if (it2.conversionId && it2.tipoRamal) {
          ramalCacheSet_(it2.conversionId, it2.tipoRamal);
        }


        const k2 = keyOfItem_(it2);

        const prev = c.itemsByKey.get(k2);
        if (prev) {
          if (!it2.tipoRamal) it2.tipoRamal = prev.tipoRamal || "";
        }

        c.itemsByKey.set(k2, it2);
        rebuildListsFromStore_();

        const snapNotas = snapshotNotasActivas_();
        if (accion === "NOTA" && opts?.clearKey) snapNotas.set(String(opts.clearKey), "");

        renderActivas_();
        renderFinalizados_();
        restoreNotasActivas_(snapNotas);
      } catch {}


      // Si el backend creó el RAMAL_ID, nos lo devuelve como conversionId
      // (tu backend lo devuelve como conversionId en la respuesta)
      const createdId = String(j.conversionId || "").trim();
      if (createdId) {
        // si tienes input ramalId, lo guardamos ahí
        const ramalIdEl = document.getElementById("ramalId");
        if (ramalIdEl) ramalIdEl.value = createdId;
      }

      // Si quieres que aparezca en cards, tu sync ya lo va a traer en mis_activas
      // Forzamos refresco suave
      setTimeout(() => {
        if (!uiLocked) {
          // si aún no tienes store RAMALERO, esto al menos no rompe
          try { syncNow({ forceFull: true, showOut: false }); } catch {}
        }
      }, 350);

      // limpiar nota global si aplica
      if (accion === "NOTA" && $("nota")) $("nota").value = "";
      return;
    }

    // =========================
    // TECNICO / CALIDAD: requiere VIN
    // =========================
    const vin = getVin();
    if (!vin) return setOut({ ok: false, error: "Pon el VIN" });

    // validación local (solo si ya existe en store)
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


  // =========================
  // LOOPS por módulo
  // =========================
  function startLoopsFor_(mod) {
    stopLoopsFor_(mod);

    withModule_(mod, () => {
      syncNow({ forceFull: true, showOut: false }).catch(() => {});

      const t = tctx_();
      t.syncTimer = setInterval(() => syncNow({ forceFull: false, showOut: false }), 6000);
      t.clockTimer = setInterval(() => tickClocksUI_(), 250);

      if (mod === "TECNICO" || mod === "CALIDAD") {
        refreshEstadoForVinRole({ showOut: false }).catch(() => {});
        t.estadoTimer = setInterval(() => refreshEstadoForVinRole({ showOut: false }), 2000);
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
      const vinEl = el_("vin");
      if (vinEl) vinEl.value = "";

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


  // =========================
  // LOGIN FLOW
  // =========================
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

  // =========================
  // QR SCANNER
  // =========================
  let qr = null;

  // ✅ NUEVO: modo de escaneo
  let scanMode = "QR"; // "QR" | "BAR"

  function setScanMode_(mode) {
    scanMode = (mode === "BAR") ? "BAR" : "QR";

    // UI: resaltar botón activo
    const bQR = document.getElementById("btnScanQR");
    const bBar = document.getElementById("btnScanBar");
    if (bQR && bBar) {
      // Puedes ajustar estilos si quieres; por ahora solo “intercambia” clases
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
    // si el modal está abierto, reinicia el scanner
    const modal = $("qrModal");
    const isOpen = modal?.classList?.contains("show");
    if (!isOpen) return;

    await stopQR();
    await startQR();
  }



  function openQRModal() {
    const modal = $("qrModal");
    const msg = $("qrMsg");

    modal.classList.add("show");

    // ✅ default al abrir
    setScanMode_(scanMode);

    // ✅ bind botones (una vez)
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

    // mensaje inicial
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

      const isBar = (scanMode === "BAR");

      // ✅ config distinto según modo
      const config = {
        fps: isBar ? 8 : 10,

        // QR cuadrado, barras rectangular (más fácil para CODE_128)
        qrbox: isBar
          ? { width: 320, height: 140 }
          : { width: 250, height: 250 },

        // ✅ CLAVE: limitar formatos para ayudar a Android viejito
        formatsToSupport: isBar
          ? [Html5QrcodeSupportedFormats.CODE_128]
          : [Html5QrcodeSupportedFormats.QR_CODE],

        // ✅ en varios Android ayuda (si está disponible)
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };


      // 1) iPhone/Safari: fuerza trasera con EXACT primero
      try {
        await qr.start(
          { facingMode: { exact: "environment" } },
          config,
          async (decodedText) => {
            const code = String(decodedText || "").trim().toUpperCase();
            if (!code) return;

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
          },
          () => {}
        );
        return; // ✅ si funcionó, salimos
      } catch (eExact) {
        // sigue al fallback
      }

      // 2) Fallback: environment "normal" (Android/otros suele ir perfecto)
      try {
        await qr.start(
          { facingMode: "environment" },
          config,
          async (decodedText) => {
            const code = String(decodedText || "").trim().toUpperCase();
            if (!code) return;

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
          },
          () => {}
        );
        return;
      } catch (eEnv) {
        // sigue al fallback por cameraId
      }

      // 3) Último fallback: elegir cameraId (tu lógica original, pero más robusta)
      const devices = await Html5Qrcode.getCameras();
      let cameraId = null;

      if (devices && devices.length) {
        const env = devices.find(d => /back|rear|environment/i.test(d.label || ""));
        cameraId = (env ? env.id : devices[0].id);
      }

      await qr.start(
        cameraId ?? devices?.[0]?.id ?? { facingMode: "environment" },
        config,
        async (decodedText) => {
          const code = String(decodedText || "").trim().toUpperCase();
          if (!code) return;

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
        },
        () => {}
      );

    } catch (e) {
      if (msg) msg.textContent = "No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost).";
    }
  }


  async function stopQR() {
    try {
      if (qr && qr.isScanning) await qr.stop();
    } catch {}
  }



  // =========================
// AUTO-INICIO TECNICO (cuando OT está SIN_INICIAR)
// - si rolLock existe => solo ese rol
// - si rolLock null => MOTOR y TANQUE (uno por ciclo)
// =========================
let tecnicoAutoInFlight_ = false;

// evita repetir INICIO en la sesión por VIN|ROL
const tecnicoAutoDone_ = new Set();

// cola simple para iniciar "uno por ciclo" cuando rolLock == null
let tecnicoAutoQueue_ = [];

// helpers

function withModule_(mod, fn) {
  const prev = currentModule;
  currentModule = mod;
  try {
    return fn();
  } finally {
    currentModule = prev;
  }
}



function hmsToMs_(v){
  if (v == null) return 0;

  if (typeof v === "number" && isFinite(v)) return Math.max(0, v);

  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return 0;

  const hh = Number(m[1] || 0);
  const mm = Number(m[2] || 0);
  const ss = Number(m[3] || 0);
  return ((hh * 3600) + (mm * 60) + ss) * 1000;
}

function msToHMSh_(ms){
  ms = Math.max(0, Number(ms) || 0);
  const total = Math.floor(ms / 1000);
  const hh = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}h ${mm}m ${ss}s`;
}

function buildSupervisorAvgCardHTML_({ q, countTotal, avgTotalMs, countMotor, avgMotorMs, countTanque, avgTanqueMs }) {
  const safeQ = escapeHtml(q || "-");

  return `
    <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.16);">
      
      <!-- NOMBRE GRANDE -->
      <div style="font-weight:1000; font-size:22px; line-height:1.1;">
        ${safeQ}
      </div>

      <!-- CRONÓMETRO GRANDE -->
      <div style="margin-top:10px; font-weight:1000; font-size:34px; letter-spacing:.5px;">
        ⏱ ${msToHMSh_(avgTotalMs)}
      </div>

      <!-- DETALLE PEQUEÑO -->
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


function hmsOnly_(v){
  // Queremos SIEMPRE devolver "HH:MM:SS"
  if (v == null) return "00:00:00";

  // Si viene como milisegundos (número), lo convertimos
  if (typeof v === "number" && isFinite(v)) return msToHMS_(v);

  // Si viene como string, extraemos el patrón HH:MM:SS donde esté
  const s = String(v);

  // Caso típico: "00:07:10" o "2:07:10"
  const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (m) {
    const hh = String(m[1]).padStart(2, "0");
    return `${hh}:${m[2]}:${m[3]}`;
  }

  // Si no calza, no mostramos basura tipo GMT
  return "00:00:00";
}


function rolesTecnicoTargets_() {
  // si está bloqueado, solo uno
  if (rolLock === "MOTOR") return ["MOTOR"];
  if (rolLock === "TANQUE") return ["TANQUE"];

  // sin lock => ambos
  return ["MOTOR", "TANQUE"];
}

function makeAutoKey_(vin, rolTrabajo) {
  const v = String(vin || "").trim().toUpperCase();
  const r = String(rolTrabajo || "").trim().toUpperCase();
  return `${v}|${r}`;
}

// Fuerza el INICIO para un rol específico SIN tocar tu backend
// (porque enviarEvento usa getRolTrabajoCurrent_ / selector)
async function enviarEventoRol_(accion, rolTrabajo, opts = {}) {
  const prevLock = rolLock;

  // si hay lock y no coincide con rol pedido, no hacemos nada
  if (prevLock && prevLock !== rolTrabajo) return;

  try {
    // Forzar rol solo durante el envío
    rolLock = rolTrabajo;

    // si existe selector, lo alineamos (evita payload raro)
    if ($("rol")) $("rol").value = rolTrabajo;

    await enviarEvento(accion, opts);
  } finally {
    // volver al estado real
    rolLock = prevLock;
    enforceRolLock_();
  }
}

// agrega a cola si aplica
function tecnicoQueueMaybeAdd_(vin, rolTrabajo) {
  const k = makeAutoKey_(vin, rolTrabajo);
  if (tecnicoAutoDone_.has(k)) return;
  if (tecnicoAutoQueue_.includes(k)) return;
  tecnicoAutoQueue_.push(k);
}

// procesa 1 elemento de cola (para no spamear)
async function tecnicoQueueDrainOne_() {
  if (tecnicoAutoInFlight_) return;
  if (!tecnicoAutoQueue_.length) return;

  const k = tecnicoAutoQueue_.shift();
  const [vin, rolTrabajo] = String(k).split("|");
  if (!vin || !rolTrabajo) return;
  if (tecnicoAutoDone_.has(k)) return;

  tecnicoAutoInFlight_ = true;
  try {
    // Solo iniciar si sigue SIN_INICIAR en store
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

// Auto-start principal
async function autoStartTecnicoIfNeeded_(vin) {
  // Solo en TECNICO
  if (currentModule !== "TECNICO") return;

  const v = String(vin || "").trim().toUpperCase();
  if (!v) return;

  // si ya estamos haciendo auto-start, no reentrar
  if (tecnicoAutoInFlight_) return;

  // Ver roles objetivo
  const roles = rolesTecnicoTargets_();

  // Si rolLock está fijo => iniciar de frente si SIN_INICIAR
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

  // Sin lock => encolar los que estén SIN_INICIAR
  for (const rol of roles) {
    const it = findItemByVinRol_(v, rol);
    const estado = String(it?.estado || "").toUpperCase();
    if (estado === "SIN_INICIAR") {
      tecnicoQueueMaybeAdd_(v, rol);
    }
  }

  // procesa solo 1 por llamada
  await tecnicoQueueDrainOne_();
}


  // =========================
// AUTO-INICIO CALIDAD (cuando OT está SIN_INICIAR)
// =========================
let calidadAutoInFlight_ = false;
const calidadAutoDone_ = new Set(); // session-only: evita repetir INICIO al mismo key

function keyForAuto_(vin, rolTrabajo) {
  const v = String(vin || "").trim().toUpperCase();
  const r = String(rolTrabajo || "").trim().toUpperCase();
  return `${v}|${r}`;
}

async function autoStartCalidadIfNeeded_(vin) {
  // Solo en CALIDAD
  if (currentModule !== "CALIDAD") return;

  const v = String(vin || "").trim().toUpperCase();
  if (!v) return;

  const rol = "CALIDAD";

  // Evita spam si ya estamos iniciando algo
  if (calidadAutoInFlight_) return;

  // Busca en store
  const it = findItemByVinRol_(v, rol);
  const estado = String(it?.estado || "").toUpperCase();

  if (estado !== "SIN_INICIAR") return;

  // Evita iniciar 2 veces la misma OT en la sesión
  const kDone = keyForAuto_(v, rol);
  if (calidadAutoDone_.has(kDone)) return;

  calidadAutoInFlight_ = true;
  try {
    // Usa tu anti-doble-QR también (tú ya tienes lastAutoStart_)
    await autoStartFromScan_(v, rol); // esto hace enviarEvento("INICIO") si SIN_INICIAR
    calidadAutoDone_.add(kDone);
  } finally {
    calidadAutoInFlight_ = false;
  }
}


  // =========================
  // AUTO-INICIO al escanear QR (solo si está SIN_INICIAR)
  // =========================
  let lastAutoStart_ = { k: "", t: 0 };

async function autoStartFromScan_(vin, rolTrabajo) {
  const v = String(vin || "").trim().toUpperCase();
  const rol = String(rolTrabajo || "").trim().toUpperCase();
  if (!v) return;

  const k = `${v}|${rol}`;
  const now = Date.now();
  if (lastAutoStart_.k === k && (now - lastAutoStart_.t) < 1200) return;
  lastAutoStart_ = { k, t: now };

  // ❌ QUITA esto (el caller ya hace refresh)
  // await refreshEstadoForVinRole({ showOut: false });

  const it = findItemByVinRol_(v, rol);
  const estado = String(it?.estado || "").toUpperCase();

  if (estado === "SIN_INICIAR") {
    await enviarEvento("INICIO");
  }
}



  // =========================
  // LISTENERS (globales)
  // =========================

  document.querySelectorAll("[data-suptrack]").forEach(btn => {
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
    const vin  = document.getElementById("supVin");
    const f = document.getElementById("supFrom");
    const t = document.getElementById("supTo");
    const m = document.getElementById("supMonth");

    if (name) name.value = "";
    if (vin)  vin.value  = "";
    if (f) f.value = "";
    if (t) t.value = "";
    if (m) m.value = "";

    fetchSupervisorReport_().catch(() => {});
  });



  $("btnTheme")?.addEventListener("click", toggleTheme_);

  $("btnRegistroFallas")?.addEventListener("click", () => {
  window.open("https://glp-registro-fallas.pages.dev/", "_blank", "noopener");
});



  $("btnMe").addEventListener("click", async () => {
    const email = getEmail();
    await doLogin(email);
  });

  $("btnLogout").addEventListener("click", () => {
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

  // Botón buscar/crear (TECNICO)
  $("btnEstado")?.addEventListener("click", async () => {
    if (currentModule !== "TECNICO") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
    }, "Buscando / creando OT...");
  });

  // Botón buscar/crear (CALIDAD)
  $("btnEstadoQ")?.addEventListener("click", async () => {
    if (currentModule !== "CALIDAD") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
      // al final del handler de btnEstadoQ:
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

  // Ver finalizados
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

  // Refrescar (RAMALERO)
  $("btnActivasR")?.addEventListener("click", async () => {
    if (currentModule !== "RAMALERO") return;
    await withLock(async () => {
      await syncNow({ forceFull: true, showOut: true });
    }, "Refrescando...");
  });

  // Ver finalizados (RAMALERO)
  $("btnFinalizadosR")?.addEventListener("click", async () => {
    if (currentModule !== "RAMALERO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;

      // OJO: usa el_ para que apunte al botón del módulo actual (R)
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";

      renderFinalizados_();
    }, "Cargando finalizados...");
  });


  // VIN input (TECNICO)
  $("vin")?.addEventListener("input", () => {
    if (currentModule !== "TECNICO") return;

    // ✅ SOLO autocomplete (NO crear/buscar OT)
    vinAcOnInput_();

    // (opcional) limpiar estadoBox mientras escribe para que no “quede pegado”
    setEstadoText("");
  });

  $("vin")?.addEventListener("keydown", (e) => {
    if (currentModule !== "TECNICO") return;
    vinAcOnKeyDown_(e);
  });

  // VIN input (CALIDAD)
  $("vinQ")?.addEventListener("input", () => {
    if (currentModule !== "CALIDAD") return;

    // ✅ SOLO autocomplete (NO crear/buscar OT)
    vinAcOnInput_();

    setEstadoText("");
  });

  $("vinQ")?.addEventListener("keydown", (e) => {
    if (currentModule !== "CALIDAD") return;
    vinAcOnKeyDown_(e);
  });

  // rol change (solo TECNICO)
  $("rol")?.addEventListener("change", () => {
    if (currentModule !== "TECNICO") return;
    refreshEstadoForVinRole({ showOut: false }).catch(() => {});
  });

  // QR modal (ambos botones)
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

  // =========================
  // Delegación en activas (por módulo)
  // =========================
function attachActivasDelegationOnce_(mod) {
  withModule_(mod, () => {
    const box = el_("activasBox");
    if (!box) return;

    const markKey = `bound_${mod}`;
    if (box.dataset[markKey] === "1") return;
    box.dataset[markKey] = "1";

    // Mostrar botón guardar nota
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

      if (btn) {
        e.stopPropagation();
        const accion = String(btn.dataset.act || "").toUpperCase();

        // RAMALERO (no VIN)
        if (currentModule === "RAMALERO") {
          const nota =
            accion === "NOTA"
              ? String(card.querySelector("textarea.notaCard")?.value || "").trim()
              : "";

          await enviarEvento(accion, {
            conversionId: it.conversionId,
            tipoRamal: it.tipoRamal,
            nota,
            clearKey: k,
          });
          return;
        }

        // TECNICO / CALIDAD
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

      // abrir / cerrar card (solo 1 abierta)
      const wasOpen = card.classList.contains("open");
      box.querySelectorAll(".jobCard.open").forEach(x => x.classList.remove("open"));
      if (!wasOpen) card.classList.add("open");
    });
  });
}



  // =========================
  // VIN AUTOCOMPLETE (usa Apps Script directo)
  // =========================
  const VIN_AC = {
    APS_URL: (window.__APS_URL || ""),
    APS_KEY: (window.__APS_KEY || ""),
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

    box.innerHTML = vinAcItems.map((vin, i) => {
      const active = i === vinAcIndex ? "active" : "";
      return `
        <div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === vinAcIndex}">
          <div class="vsVin">${escapeHtml(vin)}</div>
          <div class="vsHint">Enter</div>
        </div>
      `;
    }).join("");

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
  try { vinAcAbort?.abort?.(); } catch {}
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

        vinAcItems = (items || []).map(v => String(v || "").toUpperCase()).filter(Boolean);
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
      // auto inicio también al seleccionar sugerencia
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
  (function bindVinSuggestOnce(){
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

      const wraps = document.querySelectorAll(".vinWrap"); // ✅ todos
      const insideSomeWrap = [...wraps].some(w => w.contains(e.target));
      if (insideSomeWrap) return;

      vinAcHide_();
    });

  })();

  // =========================
  // AUTO LOGIN on load
  // =========================
  window.addEventListener("load", async () => {
    const saved = loadEmail();
    if (!saved) return showLogin("");
    $("email").value = saved;
    initTheme_();
    await doLogin(saved);
  });
