/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { initIncidenciasUI_ } from "./modals/incidencias.js";
import { initRFModalUI_ } from "./modals/rf-modal.js";
import { initRFTecModalUI_ } from "./modals/rf-tecnico-modal.js";
import { initConfirmFinishUI_ } from "./modals/confirm-finish.js";
import { initErrorModal } from "./modals/error-modal.js";
import {
  initConformidadUI_,
  setConformidadAfterSaveRefresh_,
} from "./modals/conformidad.js";

import {
  CORE,
  $,
  el_,
  ctx_,
  isWorkModule_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setEstadoText,
  msToHMS_,
  withLock,
  getJSON,
} from "../../core/core.js";

import { computeLiveMs_, renderFinalizados_, rebuildListsFromStore_ } from "../../work/index.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";

import { syncNow, fetchFinalizados_, initializeRealtime_, destroyRealtime_ } from "./data/conversion-sync.js";
import {
  refreshEstadoForVinRole,
  initEstadoUI_,
} from "./data/conversion-estado.js";
import { PAUSA_AUTO_RESUME_MS, autoResumingKeys_, enviarEvento, SCHEDULED_PAUSES, isInfinitePauseWindow_ } from "./data/conversion-eventos.js";
import { initConversionDelegation_ } from "./ui/conversion-delegation.js";
import { initVinAutocomplete_ } from "./ui/conversion-vin-autocomplete.js";
import { checkPendingAlerts_, getMyNombre_ } from "./modals/incidencia-alert.js";
import { requestNotifPermission } from "./modals/ramal-alert.js";
import { initConversionQR_ } from "./ui/conversion-qr.js";
import { initTecValidar_, openTecBuscarModal_ } from "./ui/conversion-validar.js";
import { escapeHtml, fmtShort_ } from "../../core/format.js";
import { loadTecMapa_ } from "./tec-mapa.js";

// --------------------------
// TEC CARD NAVIGATION
// --------------------------

const TEC_PANELS = ["tecPanelMiOT", "tecPanelCola", "tecPanelRendimiento", "tecPanelIncidencias", "tecPanelMapa"];
let tecCardsInited_      = false;
let colaBadgeInterval_    = null;
let vinReadyNotifInterval_ = null;
const notifiedVins_        = new Set();
let ramalListoInterval_    = null;
let colaRamalInterval_     = null;

// ── Pair suggest popup ─────────────────────────────────────────────
let pairSuggestQueue_     = [];    // top-3 free suggestions
let pairSuggestIdx_       = 0;    // current card index
let pairSuggestMode_      = "pair"; // "pair" | "new_car"
let pairSuggestLastHadOT_ = null;  // tracks OT presence for transition detection
let pairCheckInterval_    = null;

function showTecCards_() {
  const hub = document.getElementById("tecCards");
  if (hub) hub.style.display = "block";
  TEC_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  // Ocultar tarjetas restringidas al módulo actual
  const mod = CORE.state.currentModule;
  document.querySelectorAll("#tecCardGrid [data-tec-card-module]").forEach(btn => {
    btn.style.display = btn.dataset.tecCardModule === mod ? "" : "none";
  });
  // Update greeting
  const nombre = String(CORE.state.currentProfile?.nombre || "").split(" ")[0];
  const esp    = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
  const greet  = document.getElementById("tecGreeting");
  if (greet) greet.textContent = nombre ? `Hola, ${nombre} 👋` : "Bienvenido";
  // Badge on Mi OT if there's an active OT
  updateTecMiOTBadge_();
  // AI pairing suggestion banner
  loadPairingSuggestion_();
}

function showTecPanel_(panelId, loader) {
  const hub = document.getElementById("tecCards");
  if (hub) hub.style.display = "none";
  TEC_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === panelId ? "block" : "none";
  });
  if (loader) loader();
}

function updateTecMiOTBadge_() {
  const btn = document.querySelector("#tecCardGrid [data-tec-card='miOT']");
  if (!btn) return;
  btn.querySelector(".hubBadge")?.remove();
  const c = ctx_();
  const active = [...(c?.itemsByKey?.values() || [])].filter(
    it => ["TRABAJANDO", "PAUSADO"].includes(String(it.estado || "").toUpperCase())
  );
  if (active.length > 0) {
    const badge = document.createElement("span");
    badge.className = "hubBadge";
    badge.textContent = String(active.length);
    btn.appendChild(badge);
  }
}

async function updateColaBadge_() {
  const esp = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
  if (!esp) return;
  try {
    const j = await getJSON(`/api/tecnico/cola?especialidad=${encodeURIComponent(esp)}`);
    if (!j?.ok) return;
    const count = (j.vins?.length || 0) + (j.vinsFallback?.length || 0);
    const btn = document.querySelector("#tecCardGrid [data-tec-card='cola']");
    if (!btn) return;
    btn.querySelector(".hubBadge")?.remove();
    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "hubBadge";
      badge.textContent = String(count);
      btn.appendChild(badge);
    }
  } catch {}
}

async function loadPairingSuggestion_() {
  const emailEl = document.getElementById("email");
  const email   = String(emailEl?.value || "").trim().toLowerCase();
  if (!email) return;

  // Ensure banner container exists below the card grid
  const grid = document.getElementById("tecCardGrid");
  if (!grid) return;
  let banner = document.getElementById("tecPairBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "tecPairBanner";
    grid.after(banner);
  }

  try {
    const j = await getJSON(`/api/ml/suggest-pair?email=${encodeURIComponent(email)}`);
    if (!j?.ok || !j.suggestion) { banner.innerHTML = ""; return; }
    const s = j.suggestion;
    const reasons = s.reasons?.length ? s.reasons.join(" · ") : "";
    banner.innerHTML = `
      <div class="tecPairBanner">
        <div class="tecPairIcon">💡</div>
        <div class="tecPairBody">
          <div class="tecPairLabel">Compañero recomendado por IA</div>
          <div class="tecPairName">${escapeHtml(s.nombre)} <span class="tecPairEsp">${escapeHtml(s.especialidad)}</span></div>
          ${reasons ? `<div class="tecPairReasons small">${escapeHtml(reasons)}</div>` : ""}
        </div>
        <div class="tecPairSim">
          <div class="tecPairSimNum">${s.similarity}%</div>
          <div class="small muted">similitud</div>
        </div>
      </div>`;
  } catch { banner.innerHTML = ""; }
}

// ── Pair suggest popup ─────────────────────────────────────────────────────

function buildPairSuggestModal_() {
  if (document.getElementById("pairSuggestModal")) return;
  const el = document.createElement("div");
  el.id = "pairSuggestModal";
  el.className = "modal";
  el.setAttribute("aria-hidden", "true");
  el.style.display = "none";
  // Modal persistente: sin botón ✕ ni cierre al hacer clic fuera
  el.innerHTML = `
    <div class="modalBox pairSuggestBox">
      <div class="pairSuggestHeader">
        <div class="pairSuggestTitle">✨ Tu próximo compañero</div>
      </div>
      <div id="pairSuggestBody" class="pairSuggestBody"></div>
      <div class="pairSuggestActions">
        <button id="btnPairSuggestAccept" type="button" class="btn pairSuggestBtnAccept">🤝 Trabajar juntos</button>
        <div class="pairSuggestNavRow">
          <span id="pairSuggestCounter" class="small muted"></span>
          <button id="btnPairSuggestNext" type="button" class="pairSuggestBtnNext">Ver otro →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  el.querySelector("#btnPairSuggestAccept")?.addEventListener("click", () => {
    closePairSuggestModal_();
    showTecPanel_("tecPanelMiOT", null);
  });

  el.querySelector("#btnPairSuggestNext")?.addEventListener("click", () => {
    if (pairSuggestIdx_ >= pairSuggestQueue_.length - 1) {
      renderPairSuggestSolo_();
    } else {
      pairSuggestIdx_++;
      renderPairSuggestCard_();
    }
  });
}

function renderPairSuggestCard_() {
  const s       = pairSuggestQueue_[pairSuggestIdx_];
  const total   = pairSuggestQueue_.length;
  const isLast  = pairSuggestIdx_ >= total - 1;
  const body    = document.getElementById("pairSuggestBody");
  const counter = document.getElementById("pairSuggestCounter");
  const btnNext = document.getElementById("btnPairSuggestNext");
  const btnAcc  = document.getElementById("btnPairSuggestAccept");
  if (!body) return;

  if (!s) {
    body.innerHTML = `<div class="pairSuggestEmpty">
      <div class="pairSuggestEmoji">😔</div>
      <div class="pairSuggestEmptyTitle">Sin compañeros disponibles</div>
      <div class="small muted">Todos están ocupados. Puedes iniciar un nuevo carro solo y esperar.</div>
    </div>`;
    if (btnNext)   btnNext.style.display = "none";
    if (btnAcc)  { btnAcc.textContent = "🚀 Ver cola de VINs"; }
    if (counter)   counter.textContent = "";
    return;
  }

  const sim      = s.similarity ?? 0;
  const simColor = sim >= 85 ? "#4ade80" : sim >= 75 ? "#fbbf24" : "#94a3b8";
  const simLabel = sim >= 85 ? "Excelente match" : sim >= 75 ? "Buen match" : s.hasMLData ? "Match débil" : "Sin datos ML";
  const feat     = s.features;
  const trendIcon = s.trend === "up" ? "📈" : s.trend === "down" ? "📉" : "";
  const trendTxt  = s.trend === "up"   ? ` ${trendIcon} +${s.trendPct}% últ. 7d`
                  : s.trend === "down" ? ` ${trendIcon} ${s.trendPct}% últ. 7d`
                  : "";

  const modeloBadge = s.modelo
    ? `<div class="pairSuggestModelo">${escapeHtml(s.modelo)}</div>`
    : "";

  body.innerHTML = `<div class="pairSuggestCard">
    <div class="pairSuggestAvatar">👤</div>
    <div class="pairSuggestName">${escapeHtml(s.nombre)}</div>
    <div class="pairSuggestEsp">${escapeHtml(s.especialidad)}</div>
    ${modeloBadge}
    <div class="pairSuggestSimRow">
      <span class="pairSuggestSimNum" style="color:${simColor};">${s.hasMLData ? sim + "%" : "—"}</span>
      <span class="pairSuggestSimLabel" style="color:${simColor};">${simLabel}</span>
    </div>
    ${feat ? `<div class="pairSuggestFeats small muted">
      ${feat.dailyRate} conv./día · pico ${feat.peakHour}:00h${feat.avgMs ? ` · ${feat.avgMs}min/conv.` : ""}${trendTxt}
    </div>` : ""}
  </div>`;

  if (counter) counter.textContent = `${pairSuggestIdx_ + 1} de ${total}`;
  if (btnNext) {
    btnNext.style.display = "";
    btnNext.textContent = isLast ? "Ver otro →" : "Ver otro →";
  }
  if (btnAcc) btnAcc.textContent = "🤝 Trabajar juntos";
}

// Se muestra cuando el servidor indica mode="new_car": no hay compañeros libres.
function renderPairSuggestNewCar_() {
  const body    = document.getElementById("pairSuggestBody");
  const counter = document.getElementById("pairSuggestCounter");
  const btnNext = document.getElementById("btnPairSuggestNext");
  const btnAcc  = document.getElementById("btnPairSuggestAccept");
  if (!body) return;

  const esp   = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
  const other = esp === "MOTOR" ? "TANQUE" : "MOTOR";

  body.innerHTML = `<div class="pairSuggestCard pairSuggestSoloCard">
    <div class="pairSuggestAvatar">🚗</div>
    <div class="pairSuggestName">No hay ${other}s libres</div>
    <div class="pairSuggestEsp">Todos están ocupados ahora</div>
    <div class="pairSuggestSoloHint">
      Empieza un <strong>carro nuevo sin ${other}</strong>. Si te unes a uno donde ya hay un ${other} trabajando, se registrará como omisión.
    </div>
  </div>`;

  if (counter) counter.textContent = "";
  if (btnNext) btnNext.style.display = "none";
  if (btnAcc)  btnAcc.textContent = "📷 Ir a Mi OT";
}

// Se muestra cuando el técnico rechaza los 3 compañeros sugeridos.
function renderPairSuggestSolo_() {
  const body    = document.getElementById("pairSuggestBody");
  const counter = document.getElementById("pairSuggestCounter");
  const btnNext = document.getElementById("btnPairSuggestNext");
  const btnAcc  = document.getElementById("btnPairSuggestAccept");
  if (!body) return;

  const esp   = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
  const other = esp === "MOTOR" ? "TANQUE" : "MOTOR";

  const titleEl = document.querySelector(".pairSuggestTitle");
  if (titleEl) titleEl.textContent = "🚗 Trabajar solo";

  body.innerHTML = `<div class="pairSuggestCard pairSuggestSoloCard">
    <div class="pairSuggestAvatar">🔍</div>
    <div class="pairSuggestName">Escanea tu VIN</div>
    <div class="pairSuggestEsp">Elige un carro libre</div>
    <div class="pairSuggestSoloHint">
      Busca un VIN <strong>sin ${other} activo</strong>. Si te unes a uno con ${other} ya trabajando, se registrará como omisión de emparejamiento.
    </div>
  </div>`;

  if (counter) counter.textContent = "";
  if (btnNext) btnNext.style.display = "none";
  if (btnAcc)  btnAcc.textContent = "📷 Ir a Mi OT";
}

function closePairSuggestModal_() {
  const modal = document.getElementById("pairSuggestModal");
  if (modal) { modal.classList.remove("show"); modal.style.display = "none"; }
}

function showPairSuggestLoading_() {
  buildPairSuggestModal_();
  const modal   = document.getElementById("pairSuggestModal");
  if (!modal) return;
  const titleEl = modal.querySelector(".pairSuggestTitle");
  const btnNext = modal.querySelector("#btnPairSuggestNext");
  const btnAcc  = modal.querySelector("#btnPairSuggestAccept");
  const counter = modal.querySelector("#pairSuggestCounter");
  if (titleEl)  titleEl.textContent = "🔍 Buscando compañero...";
  if (btnNext)  btnNext.style.display = "none";
  if (btnAcc)   btnAcc.style.display  = "none";
  if (counter)  counter.textContent   = "";
  const body = modal.querySelector("#pairSuggestBody");
  if (body) body.innerHTML = `
    <div class="pairSuggestLoading">
      <div class="pairSuggestSpinner"></div>
      <div class="pairSuggestLoadingText">Analizando disponibilidad y afinidad...</div>
    </div>`;
  modal.style.display = "flex";
  modal.classList.add("show");
}

function openPairSuggestModal_() {
  buildPairSuggestModal_();
  pairSuggestIdx_ = 0;

  const modal   = document.getElementById("pairSuggestModal");
  if (!modal) return;

  const titleEl = modal.querySelector(".pairSuggestTitle");
  const btnNext = modal.querySelector("#btnPairSuggestNext");
  const btnAcc  = modal.querySelector("#btnPairSuggestAccept");

  if (btnAcc) btnAcc.style.display = "";

  if (pairSuggestMode_ === "new_car" || pairSuggestQueue_.length === 0) {
    if (titleEl) titleEl.textContent = "🚗 Empieza un carro nuevo";
    if (btnNext) btnNext.style.display = "none";
    renderPairSuggestNewCar_();
  } else {
    if (titleEl) titleEl.textContent = "✨ Tu próximo compañero";
    if (btnNext) btnNext.style.display = "";
    renderPairSuggestCard_();
  }

  modal.style.display = "flex";
  modal.classList.add("show");
}

async function checkAndShowPairSuggest_() {
  // Solo mostrar cuando el técnico está en la vista "Mi OT", nunca en el menú general ni otros paneles
  const miOTPanel = document.getElementById("tecPanelMiOT");
  if (!miOTPanel || miOTPanel.style.display === "none") { closePairSuggestModal_(); return; }

  const c = ctx_();
  const hasActive = [...(c?.itemsByKey?.values() || [])].some(
    it => ["TRABAJANDO", "PAUSADO"].includes(String(it.estado || "").toUpperCase())
  );

  // Si ya tiene trabajo activo → cerrar popup y salir
  if (hasActive) { closePairSuggestModal_(); return; }

  // Sin OT activa → mostrar siempre.
  // Guard: si el modal ya está visible no re-disparar fetch
  if (document.getElementById("pairSuggestModal")?.classList.contains("show")) return;

  const emailEl = document.getElementById("email");
  const email   = String(emailEl?.value || "").trim().toLowerCase();
  if (!email) return;

  // Mostrar loading inmediatamente — no hay retardo visible
  showPairSuggestLoading_();

  try {
    const j = await getJSON(`/api/ml/suggest-next?email=${encodeURIComponent(email)}`);
    if (!j?.ok) { closePairSuggestModal_(); return; }
    pairSuggestQueue_ = j.suggestions || [];
    pairSuggestMode_  = j.mode || (pairSuggestQueue_.length === 0 ? "new_car" : "pair");
    openPairSuggestModal_();
  } catch { closePairSuggestModal_(); }
}

async function checkVinReadyNotif_() {
  const esp = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
  if (!esp || Notification.permission !== "granted") return;
  try {
    const j = await getJSON(`/api/tecnico/cola?especialidad=${encodeURIComponent(esp)}`);
    if (!j?.ok) return;
    const vins = j.vins || [];
    const currentKeys = new Set(vins.map(v => v.vin));
    for (const v of vins) {
      if (notifiedVins_.has(v.vin)) continue;
      notifiedVins_.add(v.vin);
      new Notification(`🚘 VIN disponible: ${v.vin}`, {
        body: `⚡ Falta ${esp} — ${esp === "TANQUE" ? "MOTOR" : "TANQUE"} ya está trabajando\nTécnico: ${v.tecnico || "—"}`,
        icon: "/favicon.ico",
        tag: `vin-ready-${v.vin}`,
      });
    }
    for (const k of notifiedVins_) { if (!currentKeys.has(k)) notifiedVins_.delete(k); }
  } catch {}
}

// ── Banner "Tu ramal está listo" ──────────────────────────────────────────────

function showRamalListoBanner_(item) {
  let banner = document.getElementById("ramalListoBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "ramalListoBanner";
    banner.style.cssText = [
      "position:fixed;top:0;left:0;right:0;z-index:8500;",
      "background:var(--danger);color:var(--bg0);",
      "display:flex;align-items:center;justify-content:space-between;",
      "padding:12px 16px;gap:10px;",
      "font-weight:700;font-size:.95rem;",
      "box-shadow:var(--shadowSm);",
    ].join("");
    document.body.appendChild(banner);
  }
  const vin = item?.vin ? ` · VIN ${item.vin}` : "";
  banner.innerHTML = `
    <span>🔩 Tu ramal está listo${vin} — ¡acércate a recogerlo!</span>
    <button onclick="this.parentElement.style.display='none'" style="
      background:none;border:none;cursor:pointer;
      font-size:1.3rem;color:var(--bg0);line-height:1;padding:2px 4px;opacity:.8;
    ">×</button>
  `;
  banner.style.display = "flex";
}

function hideRamalListoBanner_() {
  const banner = document.getElementById("ramalListoBanner");
  if (banner) banner.remove();
}

async function checkRamalListo_() {
  if (CORE.state.currentModule !== "TECNICO") return;
  const email = String(document.getElementById("email")?.value || "").trim().toLowerCase();
  if (!email) return;
  try {
    const j = await getJSON(`/api/solicitud-ramal/mi-ramal?email=${encodeURIComponent(email)}`);
    if (j?.ok && j.listo) {
      showRamalListoBanner_(j.item);
    } else {
      hideRamalListoBanner_();
    }
  } catch {}
}

// ── Banner "Posición en cola de ramal" ────────────────────────────────────────

function showColaBanner_(posicion, total) {
  let banner = document.getElementById("colaRamalBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "colaRamalBanner";
    banner.style.cssText = [
      "position:fixed;top:0;left:0;right:0;z-index:8400;",
      "background:var(--note);color:var(--bg0);",
      "display:flex;align-items:center;justify-content:space-between;",
      "padding:12px 16px;gap:10px;",
      "font-weight:700;font-size:.95rem;",
      "box-shadow:var(--shadowSm);",
    ].join("");
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span>🔩 Eres #${posicion} de ${total} en la cola de ramales</span>
    <button onclick="this.parentElement.style.display='none'" style="
      background:none;border:none;cursor:pointer;
      font-size:1.3rem;color:var(--bg0);line-height:1;padding:2px 4px;opacity:.8;
    ">×</button>
  `;
  banner.style.display = "flex";
}

function hideColaBanner_() {
  const banner = document.getElementById("colaRamalBanner");
  if (banner) banner.remove();
}

async function checkColaPosicion_() {
  if (CORE.state.currentModule !== "TECNICO") return;
  const email = String(document.getElementById("email")?.value || "").trim().toLowerCase();
  if (!email) return;
  // Don't show cola banner if ramal-listo banner is visible
  const listoBanner = document.getElementById("ramalListoBanner");
  if (listoBanner && listoBanner.style.display !== "none") { hideColaBanner_(); return; }
  try {
    const j = await getJSON(`/api/solicitud-ramal/mi-posicion?email=${encodeURIComponent(email)}`);
    if (j?.ok && j.enCola) {
      showColaBanner_(j.posicion, j.total);
    } else {
      hideColaBanner_();
    }
  } catch {}
}

function initTecCards_() {
  if (tecCardsInited_) return;
  tecCardsInited_ = true;

  // Back buttons (class shared across all panels)
  document.addEventListener("click", e => {
    if (e.target.closest(".tecBackBtn")) showTecCards_();
  });

  const grid = document.getElementById("tecCardGrid");
  if (!grid) return;

  const cards = [
    { key: "miOT",        emoji: "🔧", label: "Mi OT",           desc: "Tu VIN activo y orden de trabajo"    },
    { key: "cola",        emoji: "📋", label: "Cola pendiente",   desc: "VINs disponibles y compañeros libres" },
    { key: "validar",     emoji: "🔍", label: "Buscar / Validar", desc: "Verificar un VIN por código o QR"    },
    { key: "rendimiento", emoji: "📊", label: "Mi rendimiento",   desc: "Historial, estadísticas y meta"      },
    { key: "incidencias", emoji: "⚠️", label: "Mis incidencias",  desc: "Registrar y ver fallas detectadas"   },
    { key: "mapa",        emoji: "🗺",  label: "Mapa de zonas",   desc: "Ve a qué zona ir y con quién trabajar", onlyModule: "TECNICO" },
  ];

  cards.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "hubCard";
    btn.dataset.tecCard = c.key;
    btn.innerHTML = `
      <div class="hubCardEmoji">${c.emoji}</div>
      <div class="hubCardText">
        <div class="hubCardName">${c.label}</div>
        <div class="hubCardDesc">${c.desc}</div>
      </div>
    `;
    if (c.onlyModule) btn.dataset.tecCardModule = c.onlyModule;
    btn.addEventListener("click", () => {
      if (c.key === "validar")      { openTecBuscarModal_(); return; }
      if (c.key === "miOT")         { showTecPanel_("tecPanelMiOT", null); checkAndShowPairSuggest_(); }
      if (c.key === "cola")         showTecPanel_("tecPanelCola", loadTecCola_);
      if (c.key === "rendimiento")  showTecPanel_("tecPanelRendimiento", loadTecRendimiento_);
      if (c.key === "incidencias")  showTecPanel_("tecPanelIncidencias", loadTecIncidencias_);
      if (c.key === "mapa") {
        const email = String(document.getElementById("email")?.value || "").trim().toLowerCase();
        const esp   = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
        showTecPanel_("tecPanelMapa", () => loadTecMapa_("tecMapaContainer", email, esp));
      }
    });
    grid.appendChild(btn);
  });
}

async function loadTecCola_() {
  const box = document.getElementById("tecColaContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando…</div>`;
  try {
    const esp   = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
    const email = String(document.getElementById("email")?.value || "").trim().toLowerCase();
    const pair  = esp === "MOTOR" ? "TANQUE" : esp === "TANQUE" ? "MOTOR" : "";

    // Real-time availability + ML ranking in parallel
    const [j, jML] = await Promise.all([
      getJSON(`/api/tecnico/cola?especialidad=${encodeURIComponent(esp)}`),
      email ? getJSON(`/api/ml/suggest-pair?email=${encodeURIComponent(email)}`) : Promise.resolve(null),
    ]);
    if (!j?.ok) throw new Error(j?.error || "Error");

    const freeComps  = j.companeros || [];          // {id, nombre} - free right now
    const mlRanked   = jML?.ranked  || [];          // [{user_id, nombre, similarity, features, reasons}]
    const suggestion = jML?.suggestion || null;     // best single match (if clear winner)

    // Merge: enrich free companions with ML data (match by id or nombre fallback)
    const freeWithML = freeComps.map(c => {
      const ml = mlRanked.find(r => r.user_id === c.id || r.nombre === c.nombre);
      return { ...c, similarity: ml?.similarity ?? null, features: ml?.features ?? null, reasons: ml?.reasons ?? [], isSuggested: suggestion && (ml?.user_id === suggestion.user_id || ml?.nombre === suggestion.nombre) };
    }).sort((a, b) => {
      if (a.isSuggested !== b.isSuggested) return a.isSuggested ? -1 : 1;
      if (a.similarity !== null && b.similarity !== null) return b.similarity - a.similarity;
      return a.similarity !== null ? -1 : 1;
    });

    let html = "";

    // ── SECTION 1: Free companions ranked by ML ──────────────────────────
    if (pair) {
      html += `<div class="tecColaSection">
        <div class="tecColaSectionTitle">🤝 ${pair} libres — ordenados por afinidad (${freeWithML.length})</div>`;

      if (!freeWithML.length) {
        html += `<div class="tecColaEmpty small muted">Ningún ${pair} disponible ahora.</div>`;
      } else {
        html += `<div class="tecColaCompList">`;
        for (const c of freeWithML) {
          const simNum  = c.similarity ?? 0;
          const simCls  = simNum >= 75 ? "simHigh" : simNum >= 50 ? "simMid" : "simLow";
          const simTxt  = c.similarity !== null ? `${simNum}%` : "—";
          const starTag = c.isSuggested ? `<span class="tecPairSugTag">⭐ Mejor afinidad</span>` : "";
          const feat    = c.features;
          const featTxt = feat ? `${feat.dailyRate} conv./día · pico ${feat.peakHour}:00h${feat.avgMs ? ` · ${feat.avgMs}min/conv.` : ""}` : "";
          const reasons = c.reasons?.length ? c.reasons.join(" · ") : "";
          html += `<div class="tecColaCompRow${c.isSuggested ? " tecColaCompRow--top" : ""}">
            <div class="tecColaCompLeft">
              <div class="tecColaCompName">👤 ${escapeHtml(c.nombre)}${starTag}</div>
              ${featTxt ? `<div class="small muted tecColaCompFeat">${escapeHtml(featTxt)}</div>` : ""}
              ${reasons ? `<div class="small tecColaCompReasons">${escapeHtml(reasons)}</div>` : ""}
            </div>
            <div class="tecColaSim ${simCls}">${simTxt}<div class="tecColaSimLabel">afinidad</div></div>
          </div>`;
        }
        html += `</div>`;

        // ML not trained yet hint
        if (!mlRanked.length) {
          html += `<div class="small muted" style="margin-top:6px;font-style:italic;">IA no entrenada — entrena el modelo en Admin → Configuración para ver afinidades.</div>`;
        }
      }
      html += `</div>`;
    }

    // ── SECTION 2: VINs where pair is working, my slot is free ──────────
    const vinsPrimary = j.fallbackUsed ? [] : (j.vins || []);
    if (vinsPrimary.length) {
      html += `<div class="tecColaSection">
        <div class="tecColaSectionTitle">🚘 VINs listos — falta ${esp} (${vinsPrimary.length})</div>
        <div class="tecColaTable">
          <div class="tecColaTableHead"><span>VIN</span><span>${pair} activo</span><span>Prioridad</span></div>
          ${vinsPrimary.map(v => `<div class="tecColaTableRow">
            <span class="tecColaVin">${escapeHtml(v.vin)}</span>
            <span class="small tecColaTecnico">${escapeHtml(v.tecnico || "—")}</span>
            <span class="tecColaEst tecEst--priority">⚡ Falta ${esp}</span>
          </div>`).join("")}
        </div>
      </div>`;
    }

    // ── SECTION 3: Solo start fallback ──────────────────────────────────
    const vinsFallback = j.fallbackUsed ? (j.vinsFallback || []) : [];
    const noFreeComps  = freeWithML.length === 0;
    const noActiveVins = vinsPrimary.length === 0;

    if (noFreeComps && noActiveVins) {
      html += `<div class="tecColaSection tecColaFallback">
        <div class="tecColaSectionTitle">🚀 Iniciar solo — en espera de ${pair}</div>
        <div class="small" style="margin-bottom:10px;color:var(--muted);">
          No hay ${pair} libre ni VINs esperándote. Puedes iniciar un VIN de la cola ahora — cuando se conecte un ${pair}, el sistema lo sugerirá como tu compañero.
        </div>`;
      if (vinsFallback.length) {
        html += `<div class="tecColaTable">
          <div class="tecColaTableHead"><span>VIN</span><span>Registrado por</span><span>Estado</span></div>
          ${vinsFallback.slice(0, 10).map(v => `<div class="tecColaTableRow">
            <span class="tecColaVin">${escapeHtml(v.vin)}</span>
            <span class="small tecColaTecnico">${escapeHtml(v.tecnico || "—")}</span>
            <span class="tecColaEst tecEst--pend">En espera</span>
          </div>`).join("")}
        </div>`;
      } else {
        html += `<div class="small muted">Sin VINs en cola de ingreso.</div>`;
      }
      html += `</div>`;
    } else if (vinsFallback.length) {
      // Queue visible as secondary info
      html += `<div class="tecColaSection">
        <div class="tecColaSectionTitle">🚘 Cola de ingreso (${vinsFallback.length})</div>
        <div class="tecColaTable">
          ${vinsFallback.slice(0, 5).map(v => `<div class="tecColaTableRow">
            <span class="tecColaVin">${escapeHtml(v.vin)}</span>
            <span class="small tecColaTecnico">${escapeHtml(v.tecnico || "—")}</span>
            <span class="tecColaEst tecEst--pend">En espera</span>
          </div>`).join("")}
        </div>
      </div>`;
    }

    box.innerHTML = html || `<div class="small muted">Sin información disponible.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

async function loadTecRendimiento_() {
  const box = document.getElementById("tecRendContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando…</div>`;
  try {
    const emailEl = document.getElementById("email");
    const email   = String(emailEl?.value || "").trim().toLowerCase();
    if (!email) throw new Error("No hay sesión activa");

    const espR = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
    const [jRend, jCfg, jEquipo, jOmis] = await Promise.all([
      getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}`),
      getJSON("/api/admin/config"),
      espR ? getJSON(`/api/tecnico/equipo-stats?especialidad=${encodeURIComponent(espR)}`) : Promise.resolve(null),
      getJSON("/api/omisiones"),
    ]);
    if (!jRend?.ok) throw new Error(jRend?.error || "Error al cargar rendimiento");

    const meta  = Number(jCfg?.config?.META_MENSUAL || 60);
    const items = Array.isArray(jRend.items) ? jRend.items : [];

    const msDay        = 86400000;
    const ahora        = new Date();
    const hoy          = ahora.toDateString();
    const cutSem       = Date.now() - 7 * msDay;
    const primerDeMes  = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    const hoyItems = items.filter(it => new Date(it.updated_at || 0).toDateString() === hoy);
    const semItems = items.filter(it => +new Date(it.updated_at || 0) >= cutSem);
    const mesItems = items.filter(it => +new Date(it.updated_at || 0) >= +primerDeMes);

    const fmtTime = ms => { const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000); return h ? `${h}h ${m}m` : `${m}m`; };
    const fmtHora = ts => ts ? new Date(ts).toLocaleTimeString("es-PE", {hour:"2-digit", minute:"2-digit"}) : "—";
    const avgMs   = items.length ? items.reduce((s, it) => s + (Number(it.tiempo_trab_ms) || 0), 0) / items.length : 0;

    // SVG circle — META MENSUAL
    const pct  = Math.min((mesItems.length / meta) * 100, 100);
    const r = 44, cx = 54, cy = 54, circ = 2 * Math.PI * r;
    const fill  = circ * (pct / 100);
    const color = pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#60a5fa";

    // Omisiones de emparejamiento de este técnico
    const myUserId    = CORE.state.currentProfile?.id || "";
    const myOmisData  = jOmis?.omisiones?.find(o => o.userId === myUserId);
    const myOmisTotal = myOmisData?.total || 0;

    // Fair team comparison: daily rate (conv / days worked) vs. active techs only
    const avgDailyRate  = jEquipo?.avgDailyRate  || 0;
    const activeTechs   = jEquipo?.activeTechs   || 0;
    const totalTechs    = jEquipo?.totalTechs    || 0;
    const userWorkDays  = new Set(semItems.map(it => it.updated_at?.split("T")[0]).filter(Boolean)).size;
    const userDailyRate = userWorkDays ? Math.round((semItems.length / userWorkDays) * 10) / 10 : 0;
    const rateDiff      = userDailyRate - avgDailyRate;
    const compClass     = rateDiff >= 0 ? "tecRendCompPos" : "tecRendCompNeg";
    const compLabel     = rateDiff >= 0
      ? `▲ +${Math.abs(rateDiff).toFixed(1)} conv./día por encima`
      : `▼ ${Math.abs(rateDiff).toFixed(1)} conv./día por debajo`;

    function renderHistogram(filtered) {
      const byHour = new Array(24).fill(0);
      filtered.forEach(it => { if (it.updated_at) byHour[new Date(it.updated_at).getHours()]++; });
      const hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6–22
      const maxH = Math.max(...hours.map(h => byHour[h]), 1);
      return `<div class="tecHistoChart">${hours.map(h => {
        const cnt = byHour[h];
        const p   = (cnt / maxH * 100).toFixed(0);
        return `<div class="tecHistoCol" title="${h}:00 — ${cnt} conv.">
          <div class="tecHistoFill" style="height:${p}%"></div>
          <div class="tecHistoHora">${h}</div>
        </div>`;
      }).join("")}</div>`;
    }

    function renderList(filtered) {
      if (!filtered.length) return `<div class="small muted" style="padding:8px 0;">Sin registros en este período.</div>`;
      return filtered.map(it => `
        <div class="tecRendRow">
          <span class="tecRendVin">${escapeHtml(it.vin || "")}</span>
          <span class="tecRendRole small">${escapeHtml(it.rol_trabajo || it.rolTrabajo || "")}</span>
          <span class="small muted">${fmtShort_(it.updated_at)}</span>
          <span class="tecRendHora small" title="Hora de fin">${fmtHora(it.updated_at)}</span>
          ${it.tiempo_trab_ms ? `<span class="small muted" style="margin-left:auto;">${fmtTime(Number(it.tiempo_trab_ms))}</span>` : ""}
        </div>`).join("");
    }

    let activePill = "hoy";
    let activeVin  = "";
    let activeDate = "";

    function getBase() {
      if (activePill === "hoy")    return hoyItems;
      if (activePill === "semana") return semItems;
      if (activePill === "mes")    return mesItems;
      return items;
    }

    function applyRendFilters() {
      let f = getBase();
      if (activeVin)  f = f.filter(it => String(it.vin || "").toUpperCase().includes(activeVin.toUpperCase()));
      if (activeDate) f = f.filter(it => it.updated_at?.startsWith(activeDate));
      box.querySelector("#tecRendList").innerHTML      = renderList(f);
      box.querySelector("#tecRendHistogram").innerHTML = renderHistogram(f);
      box.querySelector("#tecRendCount").textContent   = `${f.length} registros`;
    }

    box.innerHTML = `
      <!-- KPI hero (meta mensual) -->
      <div class="sup-kpis-panel" style="margin-bottom:12px;">
        <div class="sup-kpis-title">📊 Mi rendimiento</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;">
          <div style="text-align:center;">
            <svg viewBox="0 0 108 108" width="108" height="108">
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="12"/>
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
                stroke-dasharray="${fill.toFixed(1)} ${(circ-fill).toFixed(1)}" stroke-linecap="round"
                transform="rotate(-90 ${cx} ${cy})"/>
              <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">${mesItems.length}</text>
              <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="10">de ${meta}</text>
            </svg>
            <div style="color:rgba(255,255,255,.8);font-size:12px;margin-top:4px;">Meta del mes</div>
          </div>
          <div class="sup-kpis-grid" style="flex:1;min-width:200px;">
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">☀️</span><span class="kpi-label">Hoy</span></div>
              <div class="kpi-value">${hoyItems.length}</div>
            </div>
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">📅</span><span class="kpi-label">Semana</span></div>
              <div class="kpi-value">${semItems.length}</div>
            </div>
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">📆</span><span class="kpi-label">Este mes</span></div>
              <div class="kpi-value">${mesItems.length}</div>
              <div class="kpi-bar"><div class="kpi-bar-fill ${pct>=100?"positive":pct>=60?"warning":"negative"}" style="width:${pct.toFixed(0)}%"></div></div>
            </div>
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">⏱</span><span class="kpi-label">Prom.</span></div>
              <div class="kpi-value-small">${avgMs ? fmtTime(avgMs) : "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Comparativa de equipo (tasa diaria, solo técnicos activos) -->
      ${jEquipo?.ok && activeTechs > 0 ? `
      <div class="tecRendComp">
        <div class="tecRendCompIcon">👥</div>
        <div class="tecRendCompBody">
          <div class="tecRendCompMain">Tu ritmo: <b>${userDailyRate} conv./día</b> (${userWorkDays} día${userWorkDays !== 1 ? "s" : ""} trabajado${userWorkDays !== 1 ? "s" : ""})</div>
          <div class="tecRendCompSub">Equipo activo: ${avgDailyRate} conv./día · ${activeTechs} de ${totalTechs} técnicos</div>
        </div>
        <div class="tecRendCompDiff ${compClass}">${compLabel}</div>
      </div>` : ""}

      <!-- Omisiones de emparejamiento -->
      <div class="tecRendOmisRow">
        <div class="tecRendOmisIcon">🔗</div>
        <div class="tecRendOmisBody">
          <div class="tecRendOmisTitle">Omisiones de emparejamiento</div>
          <div class="small muted">Veces que iniciaste en un VIN con el complementario ya activo</div>
        </div>
        <div class="tecRendOmisCnt ${myOmisTotal === 0 ? "tecRendOmisCntOk" : myOmisTotal <= 3 ? "tecRendOmisCntWarn" : "tecRendOmisCntBad"}">${myOmisTotal}</div>
      </div>

      <!-- Histograma por hora -->
      <div class="tecHistoWrap">
        <div class="tecHistoTitle">Producción por hora del día</div>
        <div id="tecRendHistogram">${renderHistogram(hoyItems)}</div>
      </div>

      <!-- Historial -->
      <div class="tecRendHistTitle" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span>Historial</span>
        <span id="tecRendCount" class="small muted">${hoyItems.length} registros</span>
      </div>
      <div class="tecRendSearchRow">
        <div class="tecFilterPills" id="tecRendFilters">
          <button class="tecFilterPill active" data-filter="hoy">Hoy</button>
          <button class="tecFilterPill" data-filter="semana">Semana</button>
          <button class="tecFilterPill" data-filter="mes">Mes</button>
          <button class="tecFilterPill" data-filter="todo">Todo</button>
        </div>
      </div>
      <div class="tecRendSearchRow" style="margin-top:8px;margin-bottom:10px;">
        <input id="tecRendVinSearch" class="tecHistSearch" placeholder="🔍 Buscar VIN…" type="text" autocomplete="off">
        <input id="tecRendDatePick"  class="tecHistDate"   type="date" title="Filtrar por fecha específica">
      </div>
      <div id="tecRendList">${renderList(hoyItems)}</div>
    `;

    box.querySelector("#tecRendFilters")?.addEventListener("click", e => {
      const btn = e.target.closest(".tecFilterPill");
      if (!btn) return;
      box.querySelectorAll("#tecRendFilters .tecFilterPill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activePill = btn.dataset.filter;
      activeDate = "";
      box.querySelector("#tecRendDatePick").value = "";
      applyRendFilters();
    });

    box.querySelector("#tecRendVinSearch")?.addEventListener("input", e => {
      activeVin = e.target.value.trim();
      applyRendFilters();
    });

    box.querySelector("#tecRendDatePick")?.addEventListener("change", e => {
      activeDate = e.target.value;
      if (activeDate) {
        box.querySelectorAll("#tecRendFilters .tecFilterPill").forEach(b => b.classList.remove("active"));
        activePill = "todo";
      }
      applyRendFilters();
    });

  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

async function loadTecIncidencias_() {
  const box = document.getElementById("tecIncContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando…</div>`;
  try {
    const emailEl = document.getElementById("email");
    const email   = String(emailEl?.value || "").trim().toLowerCase();
    if (!email) throw new Error("No hay sesión activa");

    const j = await getJSON(`/api/incidencias/by-tecnico?email=${encodeURIComponent(email)}&days=365`);
    if (!j?.ok) throw new Error(j?.error || "Error");

    const all   = Array.isArray(j.items) ? j.items : [];
    const msDay = 86400000;
    const hoy   = new Date().toDateString();
    const cutSem = Date.now() - 7  * msDay;
    const cutMes = Date.now() - 30 * msDay;

    if (!all.length) {
      box.innerHTML = `<div class="small muted">Sin incidencias registradas.</div>`;
      return;
    }

    function renderIncCard(it) {
      const thumb = it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl || "";
      const full  = it.fotoUrl || it.fotoImgUrl || "";
      return `<div class="tecIncCard">
        <div class="tecIncCardTop">
          <span class="tecIncVin">${escapeHtml(it.vin || "")}</span>
          <span class="small muted">${fmtShort_(it.fecha_hora)} ${new Date(it.fecha_hora).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span>
        </div>
        ${it.nota ? `<div class="tecIncNota small">${escapeHtml(it.nota)}</div>` : ""}
        ${thumb ? `<a href="${full || thumb}" target="_blank" rel="noopener" class="tecIncPhotoWrap">
          <img src="${thumb}" class="tecIncThumb" alt="Foto incidencia" loading="lazy">
          <span class="tecIncPhotoLabel small">📷 Ver foto</span>
        </a>` : ""}
      </div>`;
    }

    function renderDashboard(filtered) {
      if (!filtered.length) return `<div class="small muted" style="padding:8px 0;">Sin incidencias en este período.</div>`;
      // Group by tipo
      const byTipo = {};
      filtered.forEach(it => {
        const t = it.tipo || "Sin tipo";
        if (!byTipo[t]) byTipo[t] = [];
        byTipo[t].push(it);
      });
      const sorted = Object.entries(byTipo).sort((a,b) => b[1].length - a[1].length);
      const maxCount = sorted[0][1].length;

      // Bars chart
      const bars = sorted.map(([tipo, incs]) => {
        const pct = (incs.length / maxCount * 100).toFixed(0);
        return `<div class="tecIncTypeLine">
          <span class="tecIncTypeName" title="${escapeHtml(tipo)}">${escapeHtml(tipo)}</span>
          <div class="tecIncTypeTrack"><div class="tecIncTypeFill" style="width:${pct}%"></div></div>
          <span class="tecIncTypeCount">${incs.length}</span>
        </div>`;
      }).join("");

      // Expandable groups
      const groups = sorted.map(([tipo, incs]) => `
        <div class="tecIncGroup">
          <button class="tecIncGroupHead" type="button">
            <span class="tecIncGroupName">${escapeHtml(tipo)}</span>
            <span class="tecIncGroupCount">${incs.length} caso${incs.length!==1?"s":""}</span>
            <span class="tecIncGroupChevron">▾</span>
          </button>
          <div class="tecIncGroupBody">
            ${incs.map(renderIncCard).join("")}
          </div>
        </div>`).join("");

      return `
        <div class="tecIncDashboard">
          <div class="tecIncDashTitle">Distribución por tipo (${filtered.length} total)</div>
          <div class="tecIncTypeChart">${bars}</div>
        </div>
        <div class="tecIncGroupsTitle">Detalle por tipo</div>
        <div class="tecIncGroups">${groups}</div>
      `;
    }

    // Default: este mes
    const mesFilt = all.filter(it => +new Date(it.fecha_hora) >= cutMes);

    box.innerHTML = `
      <div class="tecFilterRow" style="margin-bottom:12px;">
        <div class="tecFilterPills" id="tecIncDateFilters">
          <button class="tecFilterPill" data-filter="hoy">Hoy</button>
          <button class="tecFilterPill" data-filter="semana">Semana</button>
          <button class="tecFilterPill active" data-filter="mes">Este mes</button>
          <button class="tecFilterPill" data-filter="todo">Todo</button>
        </div>
      </div>
      <div id="tecIncDash">${renderDashboard(mesFilt)}</div>
    `;

    let activeDateFilter = "mes";

    function applyFilters() {
      let filtered = [...all];
      if (activeDateFilter === "hoy")    filtered = filtered.filter(it => new Date(it.fecha_hora).toDateString() === hoy);
      if (activeDateFilter === "semana") filtered = filtered.filter(it => +new Date(it.fecha_hora) >= cutSem);
      if (activeDateFilter === "mes")    filtered = filtered.filter(it => +new Date(it.fecha_hora) >= cutMes);
      box.querySelector("#tecIncDash").innerHTML = renderDashboard(filtered);
      bindGroups_();
    }

    function bindGroups_() {
      box.querySelectorAll(".tecIncGroupHead").forEach(btn => {
        btn.addEventListener("click", () => btn.closest(".tecIncGroup").classList.toggle("open"));
      });
    }
    bindGroups_();

    box.querySelector("#tecIncDateFilters")?.addEventListener("click", e => {
      const btn = e.target.closest(".tecFilterPill");
      if (!btn) return;
      box.querySelectorAll("#tecIncDateFilters .tecFilterPill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeDateFilter = btn.dataset.filter;
      applyFilters();
    });

  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

// --------------------------
// TICK CLOCK
// --------------------------

// Rastrea qué pausas programadas ya se dispararon hoy ("YYYY-MM-DD_HH:MM")
const scheduledPauseFired_ = new Set();

export function tickClocksUI_() {
  if (!isWorkModule_()) return;

  const c = ctx_();
  const nowMs = Date.now();

  // ── Pausas programadas (almuerzo 13:00, fin tarde 16:30) ────────────────
  {
    const now = new Date(nowMs);
    for (const [ph, pm] of SCHEDULED_PAUSES) {
      if (now.getHours() === ph && now.getMinutes() === pm) {
        const fireKey = `${now.toDateString()}_${ph}:${String(pm).padStart(2, "0")}`;
        if (!scheduledPauseFired_.has(fireKey)) {
          scheduledPauseFired_.add(fireKey);
          for (const it of c.itemsByKey.values()) {
            if (String(it.estado || "").toUpperCase() === "TRABAJANDO") {
              enviarEvento("PAUSA", { vin: it.vin, rolTrabajo: it.rolTrabajo })
                .catch(e => console.warn("[PAUSA-PROGRAMADA] Error:", e));
            }
          }
        }
      }
    }
  }

  el_("activasBox")
    ?.querySelectorAll(".jobCard[data-key] .js-tiempo")
    ?.forEach((elTime) => {
      const card = elTime.closest(".jobCard");
      if (!card) return;

      const k = card.dataset.key || "";
      const it = c.itemsByKey.get(k);
      if (!it) return;

      elTime.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;

      // Countdown de pausa automática basado en it.updated_at (servidor)
      if (String(it.estado || "").toUpperCase() === "PAUSADO") {
        const cdEl = card.querySelector(".js-pausa-countdown");
        if (cdEl) {
          const pausedAt = it.updated_at ? Date.parse(it.updated_at) : NaN;
          const pausedMs = isNaN(pausedAt) ? Infinity : nowMs - pausedAt;

          // En ventana de pausa infinita, pausa muy larga, o pausa impuesta por supervisor
          // → no mostrar countdown ni auto-reanudar
          const esSupervisor = String(it.last_nota || "").startsWith("__SUP") ||
                                String(it.last_nota || "").startsWith("__ADMIN");
          isInfinitePauseWindow_().then(isInfinite => {
            if (isInfinite || pausedMs > PAUSA_AUTO_RESUME_MS * 2 || esSupervisor) {
              cdEl.textContent = esSupervisor ? "⏸ Pausado por supervisor" : "";
              return;
            }

            if (!isNaN(pausedAt)) {
              const remainMs = PAUSA_AUTO_RESUME_MS - pausedMs;
              if (remainMs > 0) {
                const mins = Math.floor(remainMs / 60000);
                const secs = Math.floor((remainMs % 60000) / 1000);
                cdEl.textContent = `⏳ Auto-reanuda en ${mins}:${String(secs).padStart(2, "0")}`;
              } else if (!autoResumingKeys_.has(k)) {
                cdEl.textContent = "⏳ Reanudando...";
                autoResumingKeys_.add(k);
                enviarEvento("REANUDAR", { vin: it.vin, rolTrabajo: it.rolTrabajo, clearKey: k })
                  .catch((e) => console.warn("[AUTO-PAUSA] Error al reanudar:", e))
                  .finally(() => autoResumingKeys_.delete(k));
              }
            } else {
              cdEl.textContent = "";
            }
          }).catch(() => {});
        }
      }
    });

  if (CORE.state.currentModule === "RAMALERO") return;

  const vin = getVin();
  const rol = getRolTrabajoCurrent_();

  if (vin && rol) {
    const it = [...c.itemsByKey.values()].find(
      (x) =>
        String(x.vin || "").toUpperCase() === vin &&
        String(x.rolTrabajo || "").toUpperCase() === rol
    );

    if (it) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it, nowMs))}`);
    }
  }
}

// --------------------------
// VIEW LIFECYCLE
// --------------------------
export function init() {
  initTecCards_();  // card hub navigation (TECNICO)
  initEstadoUI_();
  initVinAutocomplete_();
  initConversionQR_();
  initTecValidar_();

  initIncidenciasUI_();
  initConformidadUI_();
  initConfirmFinishUI_();
  initErrorModal();

  setConformidadAfterSaveRefresh_(async () => {
    await syncNow({ forceFull: true, showOut: false });
  });

  initRFModalUI_();
  initRFTecModalUI_();

  initConversionDelegation_();

  $("btnActivas")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });
  $('btnVerMisInc')?.addEventListener('click', async () => {
    if (CORE.state.currentModule !== 'TECNICO') return;
    const emailEl = document.getElementById('email');
    const email   = String(emailEl?.value || '').trim().toLowerCase();
    if (!email) return;

    // Abrir modal y mostrar loading
    const modal = document.getElementById('supIncModal');
    if (modal) { modal.classList.add('show'); }
    const infoEl = document.getElementById('supIncInfo');
    const listEl = document.getElementById('supIncList');
    const msgEl  = document.getElementById('supIncMsg');
    if (infoEl) infoEl.textContent = 'Cargando...';
    if (listEl) listEl.innerHTML  = '';
    if (msgEl)  msgEl.textContent  = '';

    try {
      const r = await getJSON(`/api/incidencias/by-tecnico?email=${encodeURIComponent(email)}&days=90`);
      if (!r?.ok) throw new Error(r?.error || 'Error al cargar incidencias');

      const nombre = r.nombre || email;
      if (infoEl) infoEl.textContent = `${nombre} — últimos 90 días`;

      const { renderIncidencias_ } = await import('../supervisor/sup-incidencias.js');
      const { escapeHtml: esc, fmtShort_: fmt } = await import('../../core/format.js');
      renderIncidencias_(
        { ok: true, items: r.items },
        { who: nombre, vin: '', conversionId: '' },
        { escapeHtml: esc, fmtShort_: fmt },
      );
    } catch (err) {
      if (infoEl) infoEl.textContent = '';
      if (msgEl)  msgEl.textContent  = `Error: ${err.message}`;
    }
  });
  $("btnFinalizados")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await fetchFinalizados_(email);
        if (j?.ok && Array.isArray(j.items)) {
          const { normalizeItem_ } = await import("./state/conversion-store.js");
          for (const raw of j.items) {
            const it = normalizeItem_(raw);
            const k = `${it.conversionId}|${it.rolTrabajo}`;
            c.itemsByKey.set(k, it);
          }
          rebuildListsFromStore_();
          c._finalizadosLoaded = true;
        }
      }
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("btnActivasQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });

  // ─── Modal sugerencias calidad: 3 VINs más antiguos sin revisión iniciada ───
  $("btnSugQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    const modal = document.getElementById("calSugModal");
    const body  = document.getElementById("calSugBody");
    if (!modal || !body) return;

    body.innerHTML = `<div class="small muted">Cargando…</div>`;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("show");

    try {
      const { escapeHtml, fmtShort_ } = await import("../../core/format.js");
      const j = await getJSON("/api/movilizador/status");
      if (!j?.ok) throw new Error(j?.error || "Error al cargar");

      // list2 tiene los VINs en zona de espera; filtrar los que NO están en EN_REVISION
      const pending = (j.list2 || [])
        .filter(r => r.estado !== "EN_REVISION")
        .sort((a, b) => new Date(a.trasladado_at || 0) - new Date(b.trasladado_at || 0))
        .slice(0, 3);

      if (!pending.length) {
        body.innerHTML = `<div class="small muted" style="padding:8px 0;">✅ No hay carros en espera sin revisión.</div>`;
        return;
      }

      body.innerHTML = pending.map((r, i) => `
        <div class="calSugCard">
          <span class="calSugNum">${i + 1}</span>
          <div class="calSugInfo">
            <span class="calSugVin">${escapeHtml(r.vin)}</span>
            <span class="calSugDate small muted">Traslado: ${fmtShort_(r.trasladado_at)}</span>
          </div>
        </div>
      `).join("");
    } catch (e) {
      body.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
    }
  });

  document.getElementById("btnCalSugClose")?.addEventListener("click", () => {
    const modal = document.getElementById("calSugModal");
    if (modal) { modal.classList.remove("show"); modal.setAttribute("aria-hidden", "true"); }
  });
  document.getElementById("calSugModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove("show");
      e.currentTarget.setAttribute("aria-hidden", "true");
    }
  });

  $("btnFinalizadosQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizadosQ").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await fetchFinalizados_(email);
        if (j?.ok && Array.isArray(j.items)) {
          const { normalizeItem_, ensureNombresCache_ } = await import("./state/conversion-store.js");
          for (const raw of j.items) {
            const it = normalizeItem_(raw);
            const k = `${it.conversionId}|${it.rolTrabajo}`;
            c.itemsByKey.set(k, it);
          }
          // Enriquecer finalizados con nombres MOTOR/TANQUERO
          const byVin = await ensureNombresCache_();
          for (const [, it] of c.itemsByKey) {
            if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) {
              const nombres = byVin.get(it.vin.toUpperCase().trim()) || {};
              it.motorNombre = nombres.motorNombre || "";
              it.tanqueroNombre = nombres.tanqueroNombre || "";
            }
          }
          rebuildListsFromStore_();
          c._finalizadosLoaded = true;
        }
      }
      renderFinalizados_();
    }, "Cargando finalizados...");
  });
}

export function enter(mod) {
  CORE.state.currentModule = mod;

  // 🚀 Inicializar Realtime subscriptions
  initializeRealtime_()
    .catch(e => console.warn("[enter] Realtime init error:", e.message));

  // Verificar incidencias no vistas (offline -> online / primer login)
  if (mod === "TECNICO") {
    showTecCards_();

    const emailEl = document.getElementById("email");
    const email = String(emailEl?.value || "").trim().toLowerCase();
    if (email) checkPendingAlerts_(email, 12).catch(() => {});

    requestNotifPermission(email);

    // Cola badge + VIN-ready notifications (poll every 3 / 2 min)
    updateColaBadge_();
    colaBadgeInterval_ = setInterval(updateColaBadge_, 3 * 60 * 1000);
    checkVinReadyNotif_();
    vinReadyNotifInterval_ = setInterval(checkVinReadyNotif_, 2 * 60 * 1000);

    // Banner ramal listo: check on enter + poll every 15s
    checkRamalListo_();
    ramalListoInterval_ = setInterval(checkRamalListo_, 15 * 1000);

    // Banner posición en cola: check on enter + poll every 15s + on solicitud created
    checkColaPosicion_();
    colaRamalInterval_ = setInterval(checkColaPosicion_, 15 * 1000);
    document.addEventListener("glp:ramal-solicitado", checkColaPosicion_);

    // Pair suggest popup: check on enter + poll every 90s for OT-finish transition
    pairSuggestLastHadOT_ = null;
    buildPairSuggestModal_();
    checkAndShowPairSuggest_();
    pairCheckInterval_ = setInterval(checkAndShowPairSuggest_, 90 * 1000);
  }

  startLoopsFor_(mod, {
    syncNow,
    tickClocksUI: tickClocksUI_,
    refreshEstadoForVinRole,
  });
}

export function exit(mod) {
  stopLoopsFor_(mod);
  clearModuleUI_(mod);
  if (mod === "TECNICO") {
    clearInterval(colaBadgeInterval_);
    clearInterval(vinReadyNotifInterval_);
    clearInterval(pairCheckInterval_);
    clearInterval(ramalListoInterval_);
    clearInterval(colaRamalInterval_);
    colaBadgeInterval_ = null;
    vinReadyNotifInterval_ = null;
    pairCheckInterval_ = null;
    ramalListoInterval_ = null;
    colaRamalInterval_ = null;
    document.removeEventListener("glp:ramal-solicitado", checkColaPosicion_);
    notifiedVins_.clear();
    pairSuggestLastHadOT_ = null;
    closePairSuggestModal_();
    hideRamalListoBanner_();
    hideColaBanner_();
  }
  destroyRealtime_();
}

export { syncNow } from "./data/conversion-sync.js";