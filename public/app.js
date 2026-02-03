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
    const overlayText = overlay?.querySelector(".overlay-text");

    if (overlay) {
      overlay.classList.toggle("hidden", !uiLocked);
      if (overlayText) overlayText.textContent = msg;
    }

    // inputs base
    const emailEl = $("email");
    if (emailEl) emailEl.disabled = uiLocked;

    // VIN solo en TECNICO/CALIDAD
    if (currentModule === "TECNICO" || currentModule === "CALIDAD") {
      const vinEl = el_("vin");
      if (vinEl) vinEl.disabled = uiLocked;
    }

    // rol solo en TECNICO
    const rolEl = $("rol");
    if (rolEl) rolEl.disabled = uiLocked || !!rolLock || (currentModule !== "TECNICO");


    // botones globales
    ["btnMe", "btnLogout"].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = uiLocked;
    });

    // botones del módulo actual (con fallback)
    ["btnEstado", "btnActivas", "btnFinalizados", "btnQR"].forEach((id) => {
      const b = el_(id);
      if (b) b.disabled = uiLocked;
    });

    // botones dinámicos (activas/finalizados del módulo actual)
    const actBox = el_("activasBox");
    const finBox = el_("finalizadosBox");
    actBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = uiLocked));
    finBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = uiLocked));

    if (uiLocked) setEstadoText(msg);
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

    const html = c.activeKeys.map((k) => {
      const it = c.itemsByKey.get(k);
      if (!it) return "";

      const estado = String(it.estado || "").toUpperCase();
      const rol = escapeHtml(it.rolTrabajo || "");
      const vin = escapeHtml(it.vin || "");
      const tipo = escapeHtml(it.tipoRamal || "");
      const live = msToHMS_(computeLiveMs_(it, nowMs));
      const cid = escapeHtml(it.conversionId || "");

      const title =
        currentModule === "RAMALERO"
          ? `RAMAL: ${tipo || "-"}`
          : (vin || "<span class='small'>(sin VIN)</span>");

      return `
        <div class="jobCard card state-${estado}" data-key="${escapeHtml(k)}">
          <div class="jobTop">
            <div class="jobMeta">
              <div class="jobTitle">${title} <span>(${rol})</span></div>
              <div class="jobSub">
                <span><b>Estado:</b> <span class="js-estado">${estado}</span></span>
                <span class="small">ID: ${cid}</span>
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
    }).join("");

    box.innerHTML = html;
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

    const html = c.finalKeys.map((k) => {
      const it = c.itemsByKey.get(k);
      if (!it) return "";
      const vin = escapeHtml(String(it.vin || "").toUpperCase());
      const rol = escapeHtml(String(it.rolTrabajo || ""));
      const estado = escapeHtml(String(it.estado || "FINALIZADO").toUpperCase());
      const cid = escapeHtml(String(it.conversionId || ""));
      const live = msToHMS_(computeLiveMs_(it, nowMs));
      return `
        <div class="card" style="margin-top:10px;">
          <div><b>${vin}</b> <span class="small">(${rol})</span></div>
          <div class="row space-between" style="margin-top:6px;">
            <div class="small"><b>Estado:</b> ${estado}</div>
            <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${live}</div>
          </div>
          <div class="small">ConvID: ${cid}</div>
        </div>
      `;
    }).join("");

    box.innerHTML = html;
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
  function normalizeItem_(raw) {
  const it = {
    conversionId: String(raw.conversionId || raw.CONVERSION_ID || "").trim(),
    vin: String(raw.vin || raw.VIN || "").toUpperCase(),

    tipoRamal: String(
      raw.tipoRamal ??
      raw.tipo_ramal ??
      raw.tipo ??
      raw.TIPO_RAMAL ??
      ""
    ),

    rolTrabajo: String(raw.rolTrabajo || raw.rol || raw.ROL_TRABAJO || "").toUpperCase(),
    estado: String(raw.estado || raw.ESTADO_ACTUAL || "").toUpperCase(),
    tiempo_ms: Number(raw.tiempo_ms ?? raw.TIEMPO_TRAB_MS ?? 0),
    running_since: raw.running_since || raw.RUNNING_SINCE || null,
    last_nota: String(raw.last_nota || raw.LAST_NOTA || ""),
    last_nota_ts: raw.last_nota_ts || raw.LAST_NOTA_TS || null,
    updated_at: raw.updated_at || raw.UPDATED_AT || null,
  };

  // ✅ Si llega VIN, lo guardamos para sobrevivir al F5
  if (it.conversionId && it.rolTrabajo && it.vin) {
    vinCacheSet_(it.conversionId, it.rolTrabajo, it.vin);
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
    const items = Array.isArray(syncData.items) ? syncData.items : [];
    for (const raw of items) {
      const it = normalizeItem_(raw);
      const k = keyOfItem_(it);

      const prev = c.itemsByKey.get(k);

      // ✅ ya lo tenías para VIN
      if (prev && (!it.vin || it.vin === "")) it.vin = prev.vin || "";

      // ✅ AGREGA ESTO para RAMALERO (marca/tipo)
      if (prev && (!it.tipoRamal || it.tipoRamal === "")) it.tipoRamal = prev.tipoRamal || "";

      // ✅ si el backend manda VIN vacío y no hay prev (o prev no tiene), lo recupero del cache
      if (!it.vin) {
        const cached = vinCacheGet_(it.conversionId, it.rolTrabajo);
        if (cached) it.vin = cached;
      }



      c.itemsByKey.set(k, it);
    }
  }


  function storeFullReplace_(allItems) {
    const c = ctx_();
    c.itemsByKey.clear();
    for (const raw of allItems) {
      const it = normalizeItem_(raw);
      if (!it.vin) {
        const cached = vinCacheGet_(it.conversionId, it.rolTrabajo);
        if (cached) it.vin = cached;
      }

      const k = keyOfItem_(it);
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
  }

  function patchVisibleCards_() {
    const c = ctx_();
    const nowMs = Date.now();

    for (const k of c.activeKeys) {
      const it = c.itemsByKey.get(k);
      if (!it) continue;

      const card = el_("activasBox")?.querySelector(`.jobCard[data-key="${cssEsc_(k)}"]`);
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

    const prev = currentModule;
    currentModule = mod;

    syncNow({ forceFull: true, showOut: false }).catch(() => {});

    const t = tctx_();
    t.syncTimer = setInterval(() => syncNow({ forceFull: false, showOut: false }), 6000);
    t.clockTimer = setInterval(() => tickClocksUI_(), 250);

    // SOLO TECNICO/CALIDAD (RAMALERO no tiene VIN)
    if (mod === "TECNICO" || mod === "CALIDAD") {
      refreshEstadoForVinRole({ showOut: false }).catch(() => {});
      t.estadoTimer = setInterval(() => refreshEstadoForVinRole({ showOut: false }), 2000);
    }

    currentModule = prev;
  }


  function stopLoopsFor_(mod) {
    const t = timersByModule[mod] || timersByModule.TECNICO;
    if (t.syncTimer) clearInterval(t.syncTimer);
    if (t.clockTimer) clearInterval(t.clockTimer);
    if (t.estadoTimer) clearInterval(t.estadoTimer);
    t.syncTimer = t.clockTimer = t.estadoTimer = null;
  }

  function clearModuleUI_(mod) {
    const prev = currentModule;
    currentModule = mod;

    el_("vin") && (el_("vin").value = "");
    $("nota") && ($("nota").value = "");
    el_("activasBox") && (el_("activasBox").innerHTML = "");
    el_("finalizadosBox") && (el_("finalizadosBox").innerHTML = "");
    setEstadoText("");

    const c = ctx_();
    c.showFinalizados = false;
    c.openCardKey = null;

    c.itemsByKey.clear();
    c.activeKeys = [];
    c.finalKeys = [];
    c.lastSyncSince = null;
    c.lastSyncRev = null;

    currentModule = prev;
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

  function openQRModal() {
    const modal = $("qrModal");
    const msg = $("qrMsg");
    if (msg) msg.textContent = "Apunta la cámara al QR del VIN.";
    modal.classList.add("show");
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

      const devices = await Html5Qrcode.getCameras();
      let cameraId = null;

      if (devices && devices.length) {
        const env = devices.find(d => /back|rear|environment/i.test(d.label || ""));
        cameraId = (env ? env.id : devices[0].id);
      }

      await qr.start(
        cameraId ?? { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          const code = String(decodedText || "").trim().toUpperCase();
          if (!code) return;

          // 1) set VIN en el módulo actual
          const vinEl = el_("vin");
          if (vinEl) vinEl.value = code;

          if (msg) msg.textContent = `VIN detectado: ${code}`;
          await closeQRModal();

          // 2) Auto iniciar SOLO si estaba SIN_INICIAR
          await withLock(async () => {
            // refresca/crea OT + trae estado
            await refreshEstadoForVinRole({ showOut: false });

            // IMPORTANTE: rol actual depende del módulo (TECNICO usa selector / CALIDAD fijo)
            const rolTrabajo = getRolTrabajoCurrent_();

            // auto-start seguro
            await autoStartFromScan_(code, rolTrabajo);

            // refresca UI/tiempos/listas
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
  // AUTO-INICIO al escanear QR (solo si está SIN_INICIAR)
  // =========================
  let lastAutoStart_ = { k: "", t: 0 };

  async function autoStartFromScan_(vin, rolTrabajo) {
    const v = String(vin || "").trim().toUpperCase();
    const rol = String(rolTrabajo || "").trim().toUpperCase();
    if (!v) return;

    // anti-doble lectura del QR (misma pareja vin|rol en 1.2s)
    const k = `${v}|${rol}`;
    const now = Date.now();
    if (lastAutoStart_.k === k && (now - lastAutoStart_.t) < 1200) return;
    lastAutoStart_ = { k, t: now };

    // 1) Asegurar/leer estado (esto puede crear OT/assignment, pero NO inicia)
    await refreshEstadoForVinRole({ showOut: false });

    // 2) Leer item del store
    const it = findItemByVinRol_(v, rol);
    const estado = String(it?.estado || "").toUpperCase();

    // 3) Si está SIN_INICIAR => enviar INICIO automático
    if (estado === "SIN_INICIAR") {
      await enviarEvento("INICIO");
    }
  }


  // =========================
  // LISTENERS (globales)
  // =========================
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
    refreshEstadoForVinRole({ showOut: false }).catch(() => {});
    vinAcOnInput_();
  });
  $("vin")?.addEventListener("keydown", (e) => {
    if (currentModule !== "TECNICO") return;
    vinAcOnKeyDown_(e);
  });

  // VIN input (CALIDAD)
  $("vinQ")?.addEventListener("input", () => {
    if (currentModule !== "CALIDAD") return;
    refreshEstadoForVinRole({ showOut: false }).catch(() => {});
    vinAcOnInput_();
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
    const prev = currentModule;
    currentModule = mod;

    const box = el_("activasBox");
    if (!box) { currentModule = prev; return; }

    const markKey = `bound_${mod}`;
    if (box.dataset[markKey] === "1") { currentModule = prev; return; }
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
      const k = card.dataset.key;
      const it = c.itemsByKey.get(k);
      if (!it) return;

      if (btn) {
        e.stopPropagation();
        const accion = btn.dataset.act.toUpperCase();

        // 🔴 RAMALERO (NO VIN)
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

        // 🟢 TECNICO / CALIDAD
        el_("vin").value = it.vin || "";

        if (currentModule === "TECNICO" && !rolLock) {
          $("rol").value = it.rolTrabajo || "MOTOR";
          enforceRolLock_();
        }

        if (accion === "NOTA") {
          $("nota").value = String(card.querySelector("textarea.notaCard")?.value || "");
        }

        await enviarEvento(accion, { clearKey: k });
        return;
      }

      // abrir / cerrar card
      const wasOpen = card.classList.contains("open");
      box.querySelectorAll(".jobCard.open").forEach(c => c.classList.remove("open"));
      if (!wasOpen) card.classList.add("open");
    });

    currentModule = prev;
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

  if (!VIN_AC.APS_URL) VIN_AC.APS_URL = "https://script.google.com/macros/s/AKfycbykBM8J36OXyzV4oatpAkZqcwfWTvTosiGQNtHkBObT8Ke-6EqLg4pXRxvklF50WSeXcQ/exec";
  if (!VIN_AC.APS_KEY) VIN_AC.APS_KEY = "glp-2026-super-secreta";

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

    const url =
      `${VIN_AC.APS_URL}?action=vin_suggest&key=${encodeURIComponent(VIN_AC.APS_KEY)}` +
      `&q=${encodeURIComponent(q)}&limit=${encodeURIComponent(VIN_AC.LIMIT)}`;

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
      const wrap = document.querySelector(".vinWrap"); // ambos usan misma clase
      if (!vinAcOpen) return;
      if (wrap && wrap.contains(e.target)) return;
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
    await doLogin(saved);
  });
