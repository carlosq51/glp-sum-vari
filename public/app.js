// =========================
// public/app.js  (COPIAR Y PEGAR TODO)
// =========================
const $ = (id) => document.getElementById(id);

const EMAIL_KEY = "glp_email";

let currentProfile = null;
let currentModule = null;

const MODULES = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];

let stateTimer = null;
let lastEstado = null;

let activasTimer = null;
let showFinalizados = false;
let openCardKey = null; // "VIN|ROL"


/* =========================
   VISTAS: LOGIN / APP / HUB
   ========================= */
function showLogin(msg = "") {
  $("viewLogin").style.display = "block";
  $("viewApp").style.display = "none";
  $("loginMsg").textContent = msg;

  stopAutoEstado();
  stopAutoActivas();
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

/**
 * Si profile.modulos viene null/vacío, usamos default por rol.
 * Si viene ["ALL"], habilitamos todos los módulos.
 */
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

function openModule(m) {
  currentModule = m;

  $("viewHub").style.display = "none";
  hideAllModules();

  const el = document.getElementById(`view${m}`);
  if (el) el.style.display = "block";

  // Timers SOLO para TECNICO
  if (m === "TECNICO") {
    startAutoEstado();
    startAutoActivas();
  } else {
    stopAutoEstado();
    stopAutoActivas();
  }
}

/* =========================
   UTIL: STORAGE / FETCH
   ========================= */
function setOut(obj) {
  const out = document.getElementById("out");
  if (out) out.textContent = JSON.stringify(obj, null, 2);
}

let uiLocked = false;

function setLocked(on, msg = "Procesando...") {
  uiLocked = !!on;

  const overlay = document.getElementById("loadingOverlay");
  const overlayText = overlay?.querySelector(".overlay-text");

  if (overlay) {
    overlay.classList.toggle("hidden", !uiLocked);
    if (overlayText) overlayText.textContent = msg;
  }

  // inputs/selects
  ["email", "vin", "rol", "accion", "nota"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = uiLocked;
  });

  // botones clave
  ["btnMe", "btnLogout", "btnEstado", "btnActivas", "btnFinalizados", "btnEnviar", "btnNotaOnly", "btnQR"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.disabled = uiLocked;
  });

  // botones dinámicos (cards)
  document.querySelectorAll("button[data-quick], button[data-act]").forEach((b) => {
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

/** ✅ Polling/silent (NO bloquea) */
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

/** ✅ Acciones del usuario (bloquea HASTA JSON) */
async function getJSON_user(url, msg = "Cargando...") {
  return await withLock(async () => {
    const r = await fetch(url);
    return await r.json();
  }, msg);
}

async function postJSON_user(url, body, msg = "Procesando...") {
  return await withLock(async () => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  }, msg);
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
  return String($("email").value || "").trim().toLowerCase();
}
function getVin() {
  return String($("vin").value || "").trim().toUpperCase();
}
function getRol() {
  return $("rol").value;
}

function requireEmailOrStop() {
  const email = getEmail();
  if (!email) {
    setOut({ ok: false, error: "Primero inicia sesión con tu email." });
    throw new Error("NO_EMAIL");
  }
  return email;
}

/* =========================
   TECNICO: ESPECIALIDAD
   ========================= */
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

/* =========================
   HELPERS: TIEMPO / ESCAPE
   ========================= */

function cardKey_(vin, rol) {
  return `${String(vin || "").toUpperCase()}|${String(rol || "")}`;
}


function msToHMS_(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const total = Math.floor(ms / 1000);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toHMS_(v) {
  if (v == null || v === "") return "";

  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{1,3}:\d{2}:\d{2}$/.test(s)) return s;

    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) {
      const ms = (d2.getHours() * 3600 + d2.getMinutes() * 60 + d2.getSeconds()) * 1000;
      return msToHMS_(ms);
    }
    return s;
  }

  if (typeof v === "number") {
    if (v >= 1000) return msToHMS_(v);
    return msToHMS_(v * 86400000);
  }

  if (v instanceof Date && !isNaN(v.getTime())) {
    const ms = (v.getHours() * 3600 + v.getMinutes() * 60 + v.getSeconds()) * 1000;
    return msToHMS_(ms);
  }

  return String(v);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// CSS.escape seguro (fallback)
function cssEsc_(s) {
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, "\\$&");
}

/* =========================
   TECNICO: UI HELPERS
   ========================= */
function setEstadoText(text) {
  const box = document.getElementById("estadoBox");
  if (box) box.textContent = text || "";
}

function disableAllActionButtons() {
  document.querySelectorAll("button[data-quick]").forEach((b) => (b.disabled = true));
  const btnEnviar = document.getElementById("btnEnviar");
  if (btnEnviar) btnEnviar.disabled = true;
}

function enableQuick(actionsAllowed) {
  const allowed = new Set(actionsAllowed.map((x) => String(x).toUpperCase()));

  document.querySelectorAll("button[data-quick]").forEach((b) => {
    const a = String(b.dataset.quick || "").toUpperCase();
    b.disabled = !allowed.has(a);
  });

  const btnEnviar = document.getElementById("btnEnviar");
  const selAcc = document.getElementById("accion");
  if (btnEnviar && selAcc) {
    btnEnviar.disabled = !allowed.has(String(selAcc.value).toUpperCase());
  }
}

// ✅ NOTA permitida SIEMPRE
function allowedActionsByEstado(estado) {
  const e = String(estado || "").toUpperCase();

  if (e === "SIN_INICIAR") return ["INICIO", "NOTA"];
  if (e === "TRABAJANDO") return ["PAUSA", "FIN", "NOTA"];
  if (e === "PAUSADO") return ["REANUDAR", "FIN", "NOTA"];
  if (e === "FINALIZADO") return ["NOTA"];

  return ["INICIO", "NOTA"];
}

function updateButtonsFromEstado(estado) {
  enableQuick(allowedActionsByEstado(estado));
}

function buildBotonesByEstado_(estado) {
  const e = String(estado || "").toUpperCase();

  // SIN_INICIAR: INICIO full width (2 columnas)
  if (e === "SIN_INICIAR") {
    return `
      <div class="jobActionsGrid">
        <button class="btnInicio" data-act="INICIO">INICIO</button>
      </div>
    `;
  }

  // TRABAJANDO: PAUSA + FIN (50/50, juntos full width)
  if (e === "TRABAJANDO") {
    return `
      <div class="jobActionsGrid">
        <button class="btnPausa" data-act="PAUSA">PAUSA</button>
        <button class="btnFin" data-act="FIN">FIN</button>
      </div>
    `;
  }

  // PAUSADO: REANUDAR + FIN (50/50, juntos full width)
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


/* =========================
   TECNICO: ESTADO AUTO (2s)
   ========================= */
async function refreshEstado({ silent = true } = {}) {
  if (uiLocked) return;
  if (currentModule !== "TECNICO") return;

  let email;
  try {
    email = requireEmailOrStop();
  } catch {
    return;
  }

  const vin = getVin();
  const rolTrabajo = getRol();

  if (!vin) {
    setEstadoText("");
    disableAllActionButtons();
    lastEstado = null;
    return;
  }

  const url = `/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(
    vin
  )}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`;

  const j = await getJSON(url);

  if (!silent) setOut(j);

  if (!j.ok) {
    setEstadoText(j.error || "Error");
    disableAllActionButtons();
    lastEstado = null;
    return;
  }

  setEstadoText(`Estado: ${j.estado} | Tiempo: ${toHMS_(j.tiempo_hms)}`);
  lastEstado = j.estado;
  updateButtonsFromEstado(lastEstado);
}

function startAutoEstado() {
  stopAutoEstado();
  refreshEstado({ silent: true });
  stateTimer = setInterval(() => refreshEstado({ silent: true }), 2000);
}

function stopAutoEstado() {
  if (stateTimer) clearInterval(stateTimer);
  stateTimer = null;
}

/* =========================
   TECNICO: EVENTOS
   ========================= */
async function enviarEvento(accionOverride) {
  if (currentModule !== "TECNICO") {
    return setOut({ ok: false, error: "Solo disponible en módulo TECNICO." });
  }

  let email;
  try {
    email = requireEmailOrStop();
  } catch {
    return;
  }

  const vin = getVin();
  const rolTrabajo = getRol();
  const accion = String(accionOverride || $("accion")?.value || "").toUpperCase();
  const nota = String($("nota")?.value || "").trim();

  if (!vin) return setOut({ ok: false, error: "Pon el VIN" });

  // ✅ Si es NOTA, obligamos texto
  if (accion === "NOTA" && !nota) {
    return setOut({ ok: false, error: "Escribe una nota antes de guardar." });
  }

  // ✅ Validación: NOTA siempre permitida
  if (lastEstado) {
    const allowed = allowedActionsByEstado(lastEstado);
    if (!allowed.includes(accion)) {
      return setOut({
        ok: false,
        error: `Acción ${accion} no permitida desde estado ${lastEstado}.`,
      });
    }
  }

  // ✅ Acción principal (bloquea SOLO hasta recibir JSON del POST)
  const j = await postJSON_user(
    "/api/evento",
    { email, vin, rolTrabajo, accion, nota },
    accion === "NOTA" ? "Guardando nota..." : "Enviando evento..."
  );

  setOut(j);

  // Si falló, NO dispares refreshes extra (solo agrega lag)
  if (!j || !j.ok) return;

  if (accion === "NOTA") {
    // Limpia nota global
    if ($("nota")) $("nota").value = "";

    // ✅ NOTA no cambia estado ⇒ NO hagas refreshEstado inmediato
    // Primero un refresh LIGHT para actualizar cronómetro/estado visual sin re-render pesado
    setTimeout(() => {
      if (!uiLocked) refreshActivasLight();
    }, 0);

    // Luego un FULL "de consolidación" en background por si el backend demora en reflejar la nota
    setTimeout(() => {
      if (!uiLocked) refreshActivasFull({ silent: true });
    }, 800);

    return;
  }

  // ✅ Para acciones que SÍ cambian estado (INICIO/PAUSA/REANUDAR/FIN)
  // Haz refresh en background (sin bloquear UI)
  setTimeout(() => {
    if (!uiLocked) refreshEstado({ silent: true });
  }, 0);

  setTimeout(() => {
    if (!uiLocked) refreshActivasLight();
  }, 0);

  setTimeout(() => {
    if (!uiLocked) refreshActivasFull({ silent: true });
  }, 800);
}


/* =========================
   TECNICO: ACTIVAS / FINALIZADOS
   ========================= */
function isFinalizado_(it) {
  const e = String(it?.estado || it?.estado_actual || "").toUpperCase();
  return e === "FINALIZADO";
}

// snapshot para no perder lo que escribes en notas dentro de cards
function keyVR_(vin, rol) {
  return `${String(vin || "").toUpperCase()}|${String(rol || "")}`;
}

function snapshotNotasActivas_() {
  const map = new Map();

  document.querySelectorAll("#activasBox .card[data-vin]").forEach((card) => {
    const vin = card.dataset.vin || "";
    const rol = card.dataset.rol || "";
    const ta = card.querySelector("textarea.notaCard");
    if (!ta) return;
    map.set(keyVR_(vin, rol), String(ta.value || ""));
  });

  const active = document.activeElement;
  let activeKey = null;
  if (active && active.classList && active.classList.contains("notaCard")) {
    const card = active.closest(".card");
    if (card) activeKey = keyVR_(card.dataset.vin, card.dataset.rol);
  }

  return { map, activeKey };
}

function restoreNotasActivas_(snap) {
  if (!snap || !snap.map) return;

  document.querySelectorAll("#activasBox .card[data-vin]").forEach((card) => {
    const vin = card.dataset.vin || "";
    const rol = card.dataset.rol || "";
    const ta = card.querySelector("textarea.notaCard");
    if (!ta) return;

    const k = keyVR_(vin, rol);
    if (snap.map.has(k)) ta.value = snap.map.get(k);
  });

  if (snap.activeKey) {
    const [v, r] = snap.activeKey.split("|");
    const target = document.querySelector(
      `#activasBox .card[data-vin="${cssEsc_(v)}"][data-rol="${cssEsc_(r)}"] textarea.notaCard`
    );
    //if (target) target.focus();
  }
}


function renderActivas(items) {
  const box = document.getElementById("activasBox");
  if (!box) return;

  if (!Array.isArray(items) || items.length === 0) {
    box.innerHTML = `<div class="small">No tienes conversiones activas.</div>`;
    return;
  }

  const html = items.map((it) => {
    const vin = escapeHtml(it.vin || "");
    const rol = escapeHtml(it.rolTrabajo || "");
    const estado = String(it.estado || "").toUpperCase();

    const ms = Number(it.tiempo_ms ?? 0);
    const t = escapeHtml(ms > 0 ? msToHMS_(ms) : toHMS_(it.tiempo_hms ?? ""));

    const cid = escapeHtml(it.conversionId || "");
    const lastNota = escapeHtml(it.last_nota || "");
    const lastNotaTs = escapeHtml(it.last_nota_ts || "");

    // ✅ AQUÍ SE DEFINE "botones" (ANTES NO EXISTÍA)
    const botones = buildBotonesByEstado_(estado);

    return `
      <div class="jobCard card state-${estado}" data-vin="${vin}" data-rol="${rol}">
        <div><b>${vin}</b> <span class="small">(${rol})</span></div>

        <div class="row" style="justify-content:space-between; align-items:center;">
          <div class="small"><b>Estado:</b> <span class="js-estado">${estado}</span></div>
          <div class="pill js-tiempo" style="font-size:20px; font-weight:700;">
            ⏱ ${t}
          </div>
        </div>

        <div class="small">ConvID: ${cid}</div>

        <div style="margin-top:8px;">
          <div class="small"><b>Última nota:</b> ${lastNota || "-"}</div>
          ${lastNotaTs ? `<div class="small">${lastNotaTs}</div>` : ""}
        </div>

        <!-- 1) BOTONES DE ACCIÓN -->
        ${botones}

        <!-- 2) TEXTAREA NOTA -->
        <textarea class="notaCard" rows="2" placeholder="Escribe una nota..."></textarea>

        <!-- 3) GUARDAR NOTA AL FINAL -->
        <button
          class="btnNota"
          data-act="NOTA"
          style="margin-top:12px; width:100%; height:66px; font-weight:900; display:none;"
        >
          Guardar nota
        </button>
      </div>
    `;
  }).join("");

  box.innerHTML = html;

    // ✅ re-aplica open a la card que estaba abierta
  if (openCardKey) {
    const [v, r] = openCardKey.split("|");
    const openEl = box.querySelector(`.jobCard[data-vin="${cssEsc_(v)}"][data-rol="${cssEsc_(r)}"]`);
    if (openEl) openEl.classList.add("open");
  }

}


function renderFinalizados(items) {
  const box = document.getElementById("finalizadosBox");
  const wrap = document.getElementById("finalizadosWrap");
  if (!box || !wrap) return;

  if (!showFinalizados) {
    wrap.style.display = "none";
    box.innerHTML = "";
    return;
  }

  wrap.style.display = "block";

  if (!Array.isArray(items) || items.length === 0) {
    box.innerHTML = `<div class="small">No tienes finalizados.</div>`;
    return;
  }

  const html = items
    .map((it) => {
      const vin = escapeHtml(String(it.vin || "").toUpperCase());
      const rol = escapeHtml(String(it.rolTrabajo || ""));
      const estado = escapeHtml(String(it.estado || "FINALIZADO"));
      const ms = Number(it.tiempo_ms ?? 0);
      const t = escapeHtml(ms > 0 ? msToHMS_(ms) : toHMS_(it.tiempo_hms ?? ""));
      const cid = escapeHtml(String(it.conversionId || ""));

      return `
        <div class="card" style="margin-top:10px;">
          <div><b>${vin}</b> <span class="small">(${rol})</span></div>

          <div class="row space-between" style="margin-top:6px;">
            <div class="small"><b>Estado:</b> ${estado}</div>
            <div class="pill" style="font-size:18px; font-weight:800;">⏱ ${t}</div>
          </div>

          <div class="small">ConvID: ${cid}</div>
        </div>
      `;
    })
    .join("");

  box.innerHTML = html;
}

// =========================
// POLLING LIGERO: solo cronómetro/estado (NO re-render)
// =========================
function updateActivasUI_light(items) {
  if (!Array.isArray(items)) return;

  items.forEach((it) => {
    const vin = String(it.vin || "").toUpperCase();
    const rol = String(it.rolTrabajo || "");
    const estado = String(it.estado || "").toUpperCase();

    const ms = Number(it.tiempo_ms ?? 0);
    const t = ms > 0 ? msToHMS_(ms) : toHMS_(it.tiempo_hms ?? "");

    const card = document.querySelector(
      `#activasBox .jobCard[data-vin="${cssEsc_(vin)}"][data-rol="${cssEsc_(rol)}"]`
    );

    if (!card) return;

    const estadoEl = card.querySelector(".js-estado");
    const timeEl = card.querySelector(".js-tiempo");

    if (estadoEl) estadoEl.textContent = estado;
    if (timeEl) timeEl.textContent = `⏱ ${t}`;

    // ✅ Solo si está abierta, refresca los botones (porque cambian PAUSA/REANUDAR)
    if (card.classList.contains("open")) {
      const rowBtns = card.querySelector(".row.btns");
      if (rowBtns) rowBtns.innerHTML = buildBotonesByEstado_(estado);
    }
  });
}


// ✅ FULL: render completo (usa SOLO en acciones manuales o primera vez)
async function refreshActivasFull({ silent = true } = {}) {
  if (uiLocked) return;
  if (currentModule !== "TECNICO") return;

  let email;
  try {
    email = requireEmailOrStop();
  } catch {
    return;
  }

  const snap = snapshotNotasActivas_();

  const j = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}`);
  if (!silent) setOut(j);

  if (!j.ok) {
    const box = document.getElementById("activasBox");
    if (box) box.innerHTML = "";
    renderFinalizados([]);
    return;
  }

  const items = j.items || [];
  const activos = items.filter((it) => !isFinalizado_(it));
  const finalizados = items.filter((it) => isFinalizado_(it));

  renderActivas(activos);
  renderFinalizados(finalizados);

  restoreNotasActivas_(snap);
}

// ✅ LIGHT: NO re-render (solo actualiza cronómetro/estado)
async function refreshActivasLight() {
  if (uiLocked) return;
  if (currentModule !== "TECNICO") return;

  let email;
  try {
    email = requireEmailOrStop();
  } catch {
    return;
  }

  const j = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}`);
  if (!j.ok) return;

  const items = j.items || [];
  const activos = items.filter((it) => !isFinalizado_(it));

  updateActivasUI_light(activos);
}

function startAutoActivas() {
  stopAutoActivas();
  refreshActivasFull({ silent: true });
  activasTimer = setInterval(() => refreshActivasLight(), 5000);
}

function stopAutoActivas() {
  if (activasTimer) clearInterval(activasTimer);
  activasTimer = null;
}

/* =========================
   LOGIN FLOW (ME)
   ========================= */
async function doLogin(email) {
  if (!email) return showLogin("Pon tu email.");

  const j = await getJSON_user(
    `/api/me?email=${encodeURIComponent(email)}`,
    "Iniciando sesión..."
  );
  if (!j.ok) return showLogin(j.error || "No se pudo iniciar sesión.");

  currentProfile = j.profile;
  saveEmail(email);

  setUserPill();
  applyEspecialidad(currentProfile);

  const mods = effectiveModulos(currentProfile);

  showApp();
  lastEstado = null;

  if (mods.length > 1) {
    hideAllModules();
    $("viewHub").style.display = "block";
    showHub(mods);
    currentModule = null;

    stopAutoEstado();
    stopAutoActivas();

    disableAllActionButtons();
    setEstadoText("");
  } else {
    openModule(mods[0]);
  }
}

/* =========================
   QR SCANNER (CAMARA REAL)
   ========================= */
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

    // elegir cámara trasera si existe
    const devices = await Html5Qrcode.getCameras();
    let cameraId = null;

    if (devices && devices.length) {
      // intenta “environment” por label si existe
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

        // similar a figma: al escanear, dispara búsqueda
        await withLock(async () => {
          await refreshEstado({ silent: false });
          await refreshActivasFull({ silent: true });
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

/* =========================
   LISTENERS
   ========================= */
$("btnMe").addEventListener("click", async () => {
  const email = getEmail();
  await doLogin(email);
});



$("btnLogout").addEventListener("click", () => {
  clearEmail();
  $("email").value = "";
  currentProfile = null;
  currentModule = null;

  stopAutoEstado();
  stopAutoActivas();

  if ($("vin")) $("vin").value = "";
  if ($("nota")) $("nota").value = "";
  if ($("activasBox")) $("activasBox").innerHTML = "";

  setEstadoText("");
  disableAllActionButtons();

  hideAllModules();
  $("viewHub").style.display = "none";

  showLogin("Sesión cerrada.");
});

const btnEstado = document.getElementById("btnEstado");
if (btnEstado) {
  btnEstado.addEventListener("click", async () => {
    await withLock(async () => {
      // 1) Acción principal (mostrar resultado rápido)
      await refreshEstado({ silent: false });

      // 2) Lo demás NO bloquea (se siente instantáneo)
      setTimeout(() => refreshActivasFull({ silent: true }), 0);
    }, "Buscando / creando OT...");
  });

}

const btnActivas = document.getElementById("btnActivas");
if (btnActivas) {
  btnActivas.addEventListener("click", async () => {
    if (currentModule !== "TECNICO") return;
    await withLock(async () => {
      await refreshActivasFull({ silent: false });
    }, "Refrescando...");
  });
}

const btnFinalizados = document.getElementById("btnFinalizados");
if (btnFinalizados) {
  btnFinalizados.addEventListener("click", async () => {
    await withLock(async () => {
      showFinalizados = !showFinalizados;
      btnFinalizados.textContent = showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      await refreshActivasFull({ silent: false });
    }, "Cargando finalizados...");
  });
}

// Botones estilo Figma (quick actions)
document.querySelectorAll("button[data-quick]").forEach((btn) => {
  btn.addEventListener("click", () => enviarEvento(btn.dataset.quick));
});

// Mantener compatibilidad con “btnEnviar” si lo activas
const btnEnviar = document.getElementById("btnEnviar");
if (btnEnviar) {
  btnEnviar.addEventListener("click", () => enviarEvento());
}

const accionSel = document.getElementById("accion");
if (accionSel) {
  accionSel.addEventListener("change", () => {
    if (currentModule !== "TECNICO") return;
    if (!lastEstado) return;
    updateButtonsFromEstado(lastEstado);
  });
}

const vinInp = document.getElementById("vin");
if (vinInp) {
  vinInp.addEventListener("input", () => {
    if (currentModule === "TECNICO") {
      startAutoEstado();
      refreshActivasFull({ silent: true });
    }
  });
}

const rolSel = document.getElementById("rol");
if (rolSel) {
  rolSel.addEventListener("change", () => {
    if (currentModule === "TECNICO") {
      startAutoEstado();
      refreshActivasFull({ silent: true });
    }
  });
}

// QR modal controls
const btnQR = document.getElementById("btnQR");
if (btnQR) btnQR.addEventListener("click", openQRModal);

const btnCloseQR = document.getElementById("btnCloseQR");
if (btnCloseQR) btnCloseQR.addEventListener("click", closeQRModal);

const qrModal = document.getElementById("qrModal");
if (qrModal) {
  qrModal.addEventListener("click", async (e) => {
    if (e.target === qrModal) await closeQRModal();
  });
}

/* =========================
   AUTO LOGIN on load
   ========================= */
window.addEventListener("load", async () => {
  const saved = loadEmail();
  if (!saved) return showLogin("");

  $("email").value = saved;
  await doLogin(saved);
});

(function attachActivasDelegationOnce(){
  const box = document.getElementById("activasBox");
  if (!box) return;

  // evita duplicar listeners si recargas scripts
  if (box.dataset.bound === "1") return;
  box.dataset.bound = "1";

    // ✅ Mostrar/ocultar botón Guardar nota al escribir
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

    const vin = String(card.dataset.vin || "").toUpperCase();
    const rol = String(card.dataset.rol || "");

    // Si hicieron click en un botón de acción
    if (btn) {
      e.stopPropagation();

      const accion = String(btn.dataset.act || "").toUpperCase();

      // setea VIN/ROL global (para que tu lógica actual funcione igual)
      $("vin").value = vin;
      $("rol").value = rol;

      if (accion === "NOTA") {
        //const ta = card.querySelector("textarea.notaCard");
        const texto = ta ? String(ta.value || "").trim() : "";
        $("nota").value = texto; // reutiliza tu input global
      }

      await enviarEvento(accion);
      return;
    }

        // Si hicieron click en la card (no botón) => toggle open (solo una abierta)
    const vinKey = String(card.dataset.vin || "").toUpperCase();
    const rolKey = String(card.dataset.rol || "");
    const key = cardKey_(vinKey, rolKey);

    const wasOpen = card.classList.contains("open");

    // cierra todas
    box.querySelectorAll(".jobCard.open").forEach((c) => c.classList.remove("open"));

    if (!wasOpen) {
      // abre solo esta
      card.classList.add("open");
      openCardKey = key;

      // (opcional) enfoca el textarea al abrir
      const ta = card.querySelector("textarea.notaCard");
      //if (ta) ta.focus();
    } else {
      // si la cierras, no queda ninguna abierta
      openCardKey = null;
    }

  });
})();
