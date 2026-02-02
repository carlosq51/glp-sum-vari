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

// Estado "AppSheet style"
const store = {
  // key: VIN|ROL  => item normalizado
  itemsByKey: new Map(),
  // lista ordenada de keys activos/finalizados
  activeKeys: [],
  finalKeys: [],
  // sync state
  lastSyncSince: null,      // ISO (server_time) del último sync
  lastSyncRev: null,        // rev
  lastSyncAtMs: 0,
};

let showFinalizados = false;
let openCardKey = null; // "VIN|ROL"

// Timers
let syncTimer = null;
let clockTimer = null;
let estadoTimer = null;

// =========================
// UI LOCK
// =========================
function setOut(obj) {
  const out = $("out");
  if (out) out.textContent = JSON.stringify(obj, null, 2);
}

function setEstadoText(text) {
  const box = $("estadoBox");
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

  ["email", "vin", "rol", "accion", "nota"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = uiLocked;
  });

  ["btnMe", "btnLogout", "btnEstado", "btnActivas", "btnFinalizados", "btnEnviar", "btnNotaOnly", "btnQR"].forEach((id) => {
    const b = $(id);
    if (b) b.disabled = uiLocked;
  });

  // botones dinámicos
  document.querySelectorAll("#activasBox button[data-act], #finalizadosBox button[data-act]").forEach((b) => {
    b.disabled = uiLocked;
  });

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
function saveEmail(email) { localStorage.setItem(EMAIL_KEY, email); }
function loadEmail() { return localStorage.getItem(EMAIL_KEY) || ""; }
function clearEmail() { localStorage.removeItem(EMAIL_KEY); }

function getEmail() { return String($("email").value || "").trim().toLowerCase(); }
function getVin() { return String($("vin").value || "").trim().toUpperCase(); }
function getRol() { return $("rol").value; }

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

  stopTecnicoLoops();
  clearTecnicoUI();
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

/*
function applyEspecialidad(profile) {
  const rolUser = String(profile?.rol || "").toUpperCase();
  if (rolUser !== "TECNICO") return;

  const esp = String(profile?.especialidad || "").toUpperCase();

  if (esp === "MOTOR") {
    $("rol").value = "MOTOR";
    $("rol").disabled = true;
  } else if (esp === "TANQUE" || esp === "TANQUERO") {
    $("rol").value = "TANQUE";
    $("rol").disabled = true;
  } else {
    $("rol").disabled = false;
  }
}
*/

function applyEspecialidad(profile) {
  rolLock = computeRolLock_(profile);
  enforceRolLock_();
}


function openModule(m) {
  currentModule = m;

  $("viewHub").style.display = "none";
  hideAllModules();

  const el = document.getElementById(`view${m}`);
  if (el) el.style.display = "block";

  if (m === "TECNICO") startTecnicoLoops();
  else stopTecnicoLoops();

  enforceRolLock_();
}

// =========================
// HELPERS
// =========================



function computeRolLock_(profile) {
  const rolUser = String(profile?.rol || "").toUpperCase();
  if (rolUser !== "TECNICO") return null;

  const esp = String(profile?.especialidad || "").toUpperCase();

  if (esp === "MOTOR") return "MOTOR";
  if (esp === "TANQUE" || esp === "TANQUERO") return "TANQUE";

  // AMBOS / vacío / otro => editable
  return null;
}

function enforceRolLock_() {
  const sel = $("rol");
  if (!sel) return;

  if (rolLock) {
    sel.value = rolLock;     // fuerza valor
    sel.disabled = true;     // bloquea
  } else {
    sel.disabled = false;    // ambos => editable
  }
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

function keyOf_(vin, rol) {
  return `${String(vin || "").toUpperCase()}|${String(rol || "").toUpperCase()}`;
}

// ✅ Key estable (AppSheet style): CONVERSION_ID|ROL
function keyOfItem_(it) {
  const cid = String(it?.conversionId || "").trim();
  const rol = String(it?.rolTrabajo || "").toUpperCase();
  return `${cid}|${rol}`;
}

// ✅ Busca item por VIN+ROL (para estadoBox / input actual)
function findItemByVinRol_(vin, rol) {
  const v = String(vin || "").toUpperCase();
  const r = String(rol || "").toUpperCase();
  for (const it of store.itemsByKey.values()) {
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

  // FINALIZADO -> solo nota (se guarda con el botón de nota al final)
  return `
    <div class="jobActionsGrid">
      <button class="btnInicio" data-act="NOTA">GUARDAR NOTA</button>
    </div>
  `;
}

// =========================
// CRONÓMETRO LOCAL (AppSheet style)
// - No dependes del server para ver el tiempo correr.
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
  if (currentModule !== "TECNICO") return;

  const nowMs = Date.now();

  // pills en cards activas (por key estable)
  document.querySelectorAll("#activasBox .jobCard[data-key] .js-tiempo").forEach((el) => {
    const card = el.closest(".jobCard");
    if (!card) return;
    const k = card.dataset.key || "";
    const it = store.itemsByKey.get(k);
    if (!it) return;
    el.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;
  });

  // estadoBox por VIN+ROL actual (busca dentro del store)
  const vin = getVin();
  const rol = getRol();
  if (vin && rol) {
    const it = findItemByVinRol_(vin, rol);
    if (it) {
      $("estadoBox").textContent = `Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it, nowMs))}`;
    }
  }
}

// =========================
// RENDER (solo cuando cambia lista / estado / nota)
// =========================
function snapshotNotasActivas_() {
  const map = new Map();
  document.querySelectorAll("#activasBox .jobCard[data-key]").forEach((card) => {
    const k = card.dataset.key || "";
    const ta = card.querySelector("textarea.notaCard");
    if (!ta) return;
    map.set(k, String(ta.value || ""));
  });
  return map;
}

function restoreNotasActivas_(snapMap) {
  if (!snapMap) return;
  document.querySelectorAll("#activasBox .jobCard[data-key]").forEach((card) => {
    const k = card.dataset.key || "";
    const ta = card.querySelector("textarea.notaCard");
    if (!ta) return;
    if (snapMap.has(k)) ta.value = snapMap.get(k);
  });
}

function renderActivas_() {
  const box = $("activasBox");
  if (!box) return;

  if (!store.activeKeys.length) {
    box.innerHTML = `<div class="small">No tienes conversiones activas.</div>`;
    return;
  }

  const nowMs = Date.now();

  const html = store.activeKeys.map((k) => {
    const it = store.itemsByKey.get(k);
    if (!it) return "";

    const vin = escapeHtml(it.vin || "");
    const rol = escapeHtml(it.rolTrabajo || "");
    const estado = String(it.estado || "").toUpperCase();

    const live = msToHMS_(computeLiveMs_(it, nowMs));
    const cid = escapeHtml(it.conversionId || "");
    const lastNota = escapeHtml(it.last_nota || "");
    const lastNotaTs = escapeHtml(it.last_nota_ts || "");

    return `
      <div class="jobCard card state-${estado}" data-key="${escapeHtml(k)}">
        <div class="jobTop">
          <div class="jobMeta">
            <div class="jobTitle">${vin || "<span class='small'>(sin VIN)</span>"} <span>(${rol})</span></div>
            <div class="jobSub">
              <span><b>Estado:</b> <span class="js-estado">${estado}</span></span>
              <span class="small">ConvID: ${cid}</span>
            </div>
          </div>
          <div class="jobRight">
            <div class="jobTimePill js-tiempo">⏱ ${live}</div>
            <div class="jobChevron"></div>
          </div>
        </div>

        <div class="jobExpand">
          <div class="small" style="margin-top:2px;">
            <b>Última nota:</b> ${lastNota || "-"}
            ${lastNotaTs ? `<div class="small">${lastNotaTs}</div>` : ""}
          </div>

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

  // reabrir si había una abierta
  if (openCardKey) {
    const el = box.querySelector(`.jobCard[data-key="${cssEsc_(openCardKey)}"]`);
    if (el) el.classList.add("open");
  }
  enforceRolLock_();
}


function renderFinalizados_() {
  const wrap = $("finalizadosWrap");
  const box = $("finalizadosBox");
  if (!wrap || !box) return;

  if (!showFinalizados) {
    wrap.style.display = "none";
    box.innerHTML = "";
    return;
  }

  wrap.style.display = "block";

  if (!store.finalKeys.length) {
    box.innerHTML = `<div class="small">No tienes finalizados.</div>`;
    return;
  }

  const nowMs = Date.now();

  const html = store.finalKeys.map((k) => {
    const it = store.itemsByKey.get(k);
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

function rebuildListsFromStore_() {
  const all = [...store.itemsByKey.values()];
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

  store.activeKeys = activos;
  store.finalKeys = fins;
}


// =========================
// SYNC (snapshot + delta)
// =========================
function normalizeItem_(raw) {
  const vin = String(raw.vin || "").toUpperCase();
  const rol = String(raw.rolTrabajo || raw.rol || "").toUpperCase();
  return {
    conversionId: String(raw.conversionId || "").trim(),
    vin,
    rolTrabajo: rol,
    estado: String(raw.estado || "").toUpperCase(),
    tiempo_ms: Number(raw.tiempo_ms ?? 0),
    running_since: raw.running_since || null,
    last_nota: String(raw.last_nota || ""),
    last_nota_ts: raw.last_nota_ts || null,
    updated_at: raw.updated_at || null,
  };
}

// Intenta /api/sync; si tu Node aún no lo expone, cae a /api/mis-activas
async function apiSync_(email, since) {
  // si existe endpoint /api/sync => úsalo
  try {
    const body = { email, since };
    const j = await postJSON("/api/sync", body);
    if (j && j.ok) return { mode: "sync", data: j };
  } catch {}

  // fallback
  const j2 = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}`);
  return { mode: "legacy", data: j2 };
}

function applySyncResultToStore_(syncData) {
  const items = Array.isArray(syncData.items) ? syncData.items : [];
  for (const raw of items) {
    const it = normalizeItem_(raw);
    const k = keyOfItem_(it);

    // merge suave: si vin viene vacío, no borres el vin anterior
    const prev = store.itemsByKey.get(k);
    if (prev && (!it.vin || it.vin === "")) it.vin = prev.vin || "";

    store.itemsByKey.set(k, it);
  }
}

function storeFullReplace_(allItems) {
  store.itemsByKey.clear();
  for (const raw of allItems) {
    const it = normalizeItem_(raw);
    const k = keyOfItem_(it);
    store.itemsByKey.set(k, it);
  }
}


function detectIfNeedsFullRerender_(prevActiveKeys, prevFinalKeys) {
  const a1 = prevActiveKeys.join(",");
  const a2 = store.activeKeys.join(",");
  const f1 = prevFinalKeys.join(",");
  const f2 = store.finalKeys.join(",");
  return (a1 !== a2) || (f1 !== f2);
}

async function syncNow({ forceFull = false, showOut = false } = {}) {
  if (uiLocked) return;
  if (currentModule !== "TECNICO") return;

  let email;
  try { email = requireEmailOrStop(); } catch { return; }

  const prevA = store.activeKeys.slice();
  const prevF = store.finalKeys.slice();
  const snapNotas = snapshotNotasActivas_();

  const since = forceFull ? null : store.lastSyncSince;

  const res = await apiSync_(email, since);
  const j = res.data;

  if (showOut) setOut(j);

  if (!j || !j.ok) return;

  // legacy => trae todo
  if (res.mode === "legacy") {
    storeFullReplace_(j.items || []);
    store.lastSyncSince = new Date().toISOString();
    store.lastSyncRev = null;
  } else {
    // sync => full/delta
    if (j.full) {
      storeFullReplace_(j.items || []);
    } else {
      applySyncResultToStore_(j);
    }
    store.lastSyncSince = j.server_time || new Date().toISOString();
    store.lastSyncRev = j.rev || store.lastSyncRev;
  }

  rebuildListsFromStore_();

  const needsFull = detectIfNeedsFullRerender_(prevA, prevF);
  if (needsFull) {
    renderActivas_();
    renderFinalizados_();
    restoreNotasActivas_(snapNotas);
  } else {
    // patch rápido (estado/nota) sin rearmar todo
    patchVisibleCards_();
  }

  store.lastSyncAtMs = Date.now();
  enforceRolLock_();
}

function patchVisibleCards_() {
  const nowMs = Date.now();

  for (const k of store.activeKeys) {
    const it = store.itemsByKey.get(k);
    if (!it) continue;

    const card = document.querySelector(`#activasBox .jobCard[data-key="${cssEsc_(k)}"]`);
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
// ESTADO (1 VIN/ROL) -> se muestra rápido con store; si no existe, consulta server
// =========================
async function refreshEstadoForVinRole({ showOut = false } = {}) {
  if (uiLocked) return;
  if (currentModule !== "TECNICO") return;

  let email;
  try { email = requireEmailOrStop(); } catch { return; }

  const vin = getVin();
  const rolTrabajo = getRol();
  if (!vin) { setEstadoText(""); return; }

  // busca en store por VIN+ROL
  const it = findItemByVinRol_(vin, rolTrabajo);
  if (it) {
    setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it))}`);
    return;
  }

  // si no existe aún: pide al server (asegura assignment)
  const j = await getJSON(`/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(vin)}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`);
  if (showOut) setOut(j);
  if (!j.ok) { setEstadoText(j.error || "Error"); return; }

  const it2 = normalizeItem_(j);
  const k2 = keyOfItem_(it2);
  store.itemsByKey.set(k2, it2);

  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();

  setEstadoText(`Estado: ${it2.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it2))}`);
}


// =========================
// EVENTOS
// =========================
async function enviarEvento(accionOverride, opts = {}) {
  if (currentModule !== "TECNICO") {
    return setOut({ ok: false, error: "Solo disponible en módulo TECNICO." });
  }

  let email;
  try { email = requireEmailOrStop(); } catch { return; }

  const vin = getVin();
  const rolTrabajo = getRol();
  const accion = String(accionOverride || $("accion")?.value || "").toUpperCase();

  let nota = "";
  if (accion === "NOTA") {
    nota = String($("nota")?.value || "").trim();
    if (!nota) {
      return setOut({ ok: false, error: "Escribe una nota antes de guardar." });
    }
  }

  if (!vin) return setOut({ ok: false, error: "Pon el VIN" });

  // ✅ validación local usando store (por VIN+ROL, porque es lo que el usuario está operando)
  const itLocal = findItemByVinRol_(vin, rolTrabajo);
  if (itLocal) {
    const allowed = allowedActionsByEstado(itLocal.estado);
    if (!allowed.includes(accion)) {
      return setOut({ ok: false, error: `Acción ${accion} no permitida desde estado ${itLocal.estado}.` });
    }
  }

  // ✅ POST (bloquea UI solo hasta recibir JSON)
  const j = await postJSON_user(
    "/api/evento",
    { email, vin, rolTrabajo, accion, nota },
    accion === "NOTA" ? "Guardando nota..." : "Registrando..."
  );

  setOut(j);
  if (!j || !j.ok) return;

  // ✅ Normaliza lo que devuelve el backend
  const it2 = normalizeItem_(j);

  // ✅ Key estable: CONVERSION_ID|ROL
  const k2 = keyOfItem_(it2);

  // ✅ Merge: si el backend manda vin vacío en algún delta, NO lo borres
  const prev = store.itemsByKey.get(k2);
  if (prev) {
    if (!it2.vin) it2.vin = prev.vin || "";
    if (!it2.updated_at) it2.updated_at = prev.updated_at || null;
    if (!it2.last_nota_ts) it2.last_nota_ts = prev.last_nota_ts || null;
  }

  // ✅ Actualiza store
  store.itemsByKey.set(k2, it2);
  rebuildListsFromStore_();

  // ✅ Render rápido preservando lo que el usuario está escribiendo
  const snapNotas = snapshotNotasActivas_();

  // ✅ Si acabas de guardar NOTA, fuerza que esa card quede vacía
  if (accion === "NOTA" && opts?.clearKey) {
    snapNotas.set(String(opts.clearKey), ""); // deja esa nota en blanco al restaurar
  }

  renderActivas_();
  renderFinalizados_();
  restoreNotasActivas_(snapNotas);


  // ✅ Limpia nota global si fue NOTA
  if (accion === "NOTA") $("nota").value = "";

  // ✅ Consolidación estilo AppSheet (delta pronto)
  setTimeout(() => {
    if (!uiLocked) syncNow({ forceFull: false, showOut: false });
  }, 400);
}


// =========================
// TECNICO LOOPS (fluido)
// - sync cada 6s (delta)
// - clock cada 250ms (solo UI)
// - estado “light” cada 2s (pero sin server si ya está en store)
// =========================
function startTecnicoLoops() {
  stopTecnicoLoops();

  // primer snapshot full (bloque corto solo en carga inicial)
  syncNow({ forceFull: true, showOut: false }).catch(() => {});

  // sync delta
  syncTimer = setInterval(() => syncNow({ forceFull: false, showOut: false }), 6000);

  // reloj UI
  clockTimer = setInterval(() => tickClocksUI_(), 250);

  // estado vin/rol actual (sin server si ya está)
  refreshEstadoForVinRole({ showOut: false }).catch(() => {});
  estadoTimer = setInterval(() => refreshEstadoForVinRole({ showOut: false }), 2000);
}

function stopTecnicoLoops() {
  if (syncTimer) clearInterval(syncTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (estadoTimer) clearInterval(estadoTimer);
  syncTimer = clockTimer = estadoTimer = null;
}

function clearTecnicoUI() {
  if ($("vin")) $("vin").value = "";
  if ($("nota")) $("nota").value = "";
  if ($("activasBox")) $("activasBox").innerHTML = "";
  if ($("finalizadosBox")) $("finalizadosBox").innerHTML = "";
  setEstadoText("");
  showFinalizados = false;
  openCardKey = null;

  store.itemsByKey.clear();
  store.activeKeys = [];
  store.finalKeys = [];
  store.lastSyncSince = null;
  store.lastSyncRev = null;
}

// =========================
// LOGIN FLOW
// =========================


function applyDebugVisibility_() {
  const wrap = document.getElementById("debugWrap");
  if (!wrap) return;

  const rol = String(currentProfile?.rol || "").toUpperCase();

  if (rol === "ADMIN") {
    wrap.classList.remove("debug-hidden");
  } else {
    wrap.classList.add("debug-hidden");
  }
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

    stopTecnicoLoops();
    clearTecnicoUI();
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

        $("vin").value = code;
        if (msg) msg.textContent = `VIN detectado: ${code}`;
        await closeQRModal();

        await withLock(async () => {
          await refreshEstadoForVinRole({ showOut: true });
          await syncNow({ forceFull: true, showOut: false });
        }, "Buscando / creando OT...");
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
// LISTENERS
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

  stopTecnicoLoops();
  clearTecnicoUI();

  hideAllModules();
  $("viewHub").style.display = "none";

  document.getElementById("debugWrap")?.classList.add("debug-hidden");

  showLogin("Sesión cerrada.");
});



$("btnEstado")?.addEventListener("click", async () => {
  await withLock(async () => {
    await refreshEstadoForVinRole({ showOut: true });
    await syncNow({ forceFull: true, showOut: false });
  }, "Buscando / creando OT...");
});


/*
$("btnEstado")?.addEventListener("click", (e) => {
  // No hace nada a propósito (botón “dummy”)
  setOut({ ok: true, msg: "Botón desactivado (no ejecuta acciones)." });
});
*/


$("btnActivas")?.addEventListener("click", async () => {
  if (currentModule !== "TECNICO") return;
  await withLock(async () => {
    await syncNow({ forceFull: true, showOut: true });
  }, "Refrescando...");
});

$("btnFinalizados")?.addEventListener("click", async () => {
  await withLock(async () => {
    showFinalizados = !showFinalizados;
    $("btnFinalizados").textContent = showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
    renderFinalizados_();
  }, "Cargando finalizados...");
});

$("vin")?.addEventListener("input", () => {
  if (currentModule !== "TECNICO") return;

  refreshEstadoForVinRole({ showOut: false }).catch(() => {});

  // ✅ autocomplete
  vinAcOnInput_();
});

$("vin")?.addEventListener("keydown", (e) => {
  if (currentModule !== "TECNICO") return;
  vinAcOnKeyDown_(e);
});


$("rol")?.addEventListener("change", () => {
  if (currentModule !== "TECNICO") return;
  refreshEstadoForVinRole({ showOut: false }).catch(() => {});
});

// QR modal
$("btnQR")?.addEventListener("click", openQRModal);
$("btnCloseQR")?.addEventListener("click", closeQRModal);
$("qrModal")?.addEventListener("click", async (e) => {
  if (e.target === $("qrModal")) await closeQRModal();
});

// Delegación en activas (una sola)
(function attachActivasDelegationOnce(){
  const box = $("activasBox");
  if (!box) return;
  if (box.dataset.bound === "1") return;
  box.dataset.bound = "1";

  // Mostrar/ocultar botón Guardar nota al escribir
  box.addEventListener("input", (e) => {
    const ta = e.target.closest("textarea.notaCard");
    if (!ta) return;
    const card = ta.closest(".jobCard");
    if (!card) return;
    const btnNota = card.querySelector("button.btnNota");
    if (!btnNota) return;
    btnNota.style.display = ta.value.trim() ? "block" : "none";
  });

  box.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    const card = e.target.closest(".jobCard");
    if (!card) return;

    const k = card.dataset.key || "";
    const it = store.itemsByKey.get(k);
    if (!it) return;

    // Click en botón de acción
    if (btn) {
      e.stopPropagation();
      const accion = String(btn.dataset.act || "").toUpperCase();

      // set VIN/ROL global para backend
      $("vin").value = it.vin || "";

      // si está bloqueado, NO se permite cambiar por la card
      if (!rolLock) {
        $("rol").value = it.rolTrabajo || "MOTOR";
      }
      enforceRolLock_();


      if (accion === "NOTA") {
        const ta = card.querySelector("textarea.notaCard");
        const texto = ta ? String(ta.value || "").trim() : "";
        $("nota").value = texto;
      }

      await enviarEvento(accion, { clearKey: k });

      if (accion === "NOTA") {
        const ta = card.querySelector("textarea.notaCard");
        const btnNota = card.querySelector("button.btnNota");

        if (ta) ta.value = "";
        if (btnNota) btnNota.style.display = "none";
      }

      return;
    }

    // Click en card -> abrir/cerrar
    const wasOpen = card.classList.contains("open");
    box.querySelectorAll(".jobCard.open").forEach((c) => c.classList.remove("open"));

    if (!wasOpen) {
      card.classList.add("open");
      openCardKey = k;

      const slot = card.querySelector(".jobActionsSlot");
      if (slot) slot.innerHTML = buildBotonesByEstado_(it.estado);
    } else {
      openCardKey = null;
    }
  });

})();


// =========================
// VIN AUTOCOMPLETE (usa Apps Script directo)
// =========================
const VIN_AC = {
  APS_URL: (window.__APS_URL || ""), // opcional si lo inyectas
  APS_KEY: (window.__APS_KEY || ""), // opcional si lo inyectas
  MIN_CHARS: 2,
  LIMIT: 12,
  DEBOUNCE_MS: 200,
  AUTO_SUBMIT_ON_PICK: false,
};

// ✅ si no inyectas window.__APS_URL, pega aquí tus valores (los de tu .env)
if (!VIN_AC.APS_URL) VIN_AC.APS_URL = "https://script.google.com/macros/s/AKfycbykBM8J36OXyzV4oatpAkZqcwfWTvTosiGQNtHkBObT8Ke-6EqLg4pXRxvklF50WSeXcQ/exec";
if (!VIN_AC.APS_KEY) VIN_AC.APS_KEY = "glp-2026-super-secreta";

let vinAcTimer = null;
let vinAcItems = [];
let vinAcOpen = false;
let vinAcIndex = -1;
let vinAcLastQ = "";
let vinAcAbort = null;

function vinAcHide_() {
  const box = $("vinSuggest");
  if (!box) return;
  vinAcOpen = false;
  vinAcIndex = -1;
  vinAcItems = [];
  box.classList.add("hidden");
  box.innerHTML = "";
}

function vinAcRender_() {
  const box = $("vinSuggest");
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

  const box = $("vinSuggest");
  const el = box?.querySelector(`.vsItem[data-idx="${vinAcIndex}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

async function vinAcFetch_(q) {
  // cancela anterior
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
  const input = $("vin");
  if (!input) return;

  const q = String(input.value || "").trim().toUpperCase();
  vinAcLastQ = q;

  if (!q || q.length < VIN_AC.MIN_CHARS) return vinAcHide_();

  clearTimeout(vinAcTimer);
  vinAcTimer = setTimeout(async () => {
    try {
      const items = await vinAcFetch_(q);
      if (vinAcLastQ !== q) return; // input cambió

      vinAcItems = (items || []).map(v => String(v || "").toUpperCase()).filter(Boolean);
      vinAcIndex = vinAcItems.length ? 0 : -1;
      vinAcRender_();
    } catch {
      vinAcHide_();
    }
  }, VIN_AC.DEBOUNCE_MS);
}

function vinAcPick_(vin) {
  const input = $("vin");
  if (!input) return;

  input.value = String(vin || "").toUpperCase();
  vinAcHide_();

  // tu lógica actual
  refreshEstadoForVinRole({ showOut: false }).catch(() => {});

  if (VIN_AC.AUTO_SUBMIT_ON_PICK) $("btnEstado")?.click?.();
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

// bind once
(function bindVinSuggestOnce(){
  const box = $("vinSuggest");
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

  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".vinWrap");
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
