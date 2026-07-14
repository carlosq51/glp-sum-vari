// =========================
// public/js/core/ui-shell.js
// UI base login/app/hub/salida
// =========================

import { CORE, MODULES } from "./state.js";
import { $, el_ } from "./dom.js";
import { applyTheme_, loadTheme_ } from "./theme.js";
import { loadSettings, saveSettings, applySettings } from "./app-settings.js";
import { icon } from "./icons.js";

// ─── Metadata de módulos ─────────────────────────────────────────────
const MODULE_META = {
  TECNICO:     { icon: "wrench",      label: "Técnico",     desc: "Motor y tanque GLP" },
  RAMALERO:    { icon: "branch",      label: "Ramalero",    desc: "Suministro de ramales" },
  CALIDAD:     { icon: "shieldCheck", label: "Calidad",     desc: "Revisión y aprobación" },
  MOVILIZADOR: { icon: "truck",       label: "Movilizador", desc: "Traslados y listas" },
  SUPERVISOR:  { icon: "target",      label: "Supervisor",  desc: "Supervisión del taller" },
  ADMIN:       { icon: "sliders",     label: "Admin",       desc: "Administración del sistema" },
};

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
  const hub = $("viewHub");
  if (hub) hub.style.display = "none";

  MODULES.forEach((m) => {
    const el = document.getElementById(`view${m}`);
    if (el) el.style.display = "none";
  });

  document.body.dataset.appModule = "";
}

export function showHubUI(mods, onPick) {
  hideAllModulesUI();

  const hub = $("viewHub");
  if (hub) hub.style.display = "block";

  // Saludo personalizado
  const nombre = String(CORE.state.currentProfile?.nombre || "").split(" ")[0];
  const greeting = $("hubGreeting");
  if (greeting) greeting.textContent = nombre ? `Hola, ${nombre} 👋` : "Bienvenido";

  // Cerrar settings panel al volver al hub
  const panel = $("hubSettingsPanel");
  if (panel) panel.style.display = "none";

  // Renderizar cartillas
  const box = $("hubButtons");
  if (!box) return;

  box.innerHTML = "";
  mods.forEach((m) => {
    const meta = MODULE_META[m] || { icon: "box", label: m, desc: "" };
    const card = document.createElement("button");
    card.className = "hubCard";
    card.dataset.mod = m;
    card.innerHTML = `
      <span class="hubCardIcon" aria-hidden="true">${icon(meta.icon, 22)}</span>
      <div class="hubCardText">
        <div class="hubCardName">${meta.label}</div>
        ${meta.desc ? `<div class="hubCardDesc">${meta.desc}</div>` : ""}
      </div>
      <span class="hubCardArrow" aria-hidden="true">${icon("chevronRight", 18)}</span>
    `;
    card.addEventListener("click", () => onPick?.(m));
    box.appendChild(card);
  });

  // Inicializar settings panel (una sola vez)
  initHubSettings_();
}

// ─── Settings panel ──────────────────────────────────────────────────
let hubSettingsInited_ = false;

function refreshSettingsUI_() {
  const s   = loadSettings();
  const cur = document.documentElement.dataset.theme || "night";

  $("hubOptTheme")?.querySelectorAll(".hubOptBtn").forEach(b =>
    b.classList.toggle("active", b.dataset.val === cur)
  );
  $("hubOptSize")?.querySelectorAll(".hubOptBtn").forEach(b =>
    b.classList.toggle("active", b.dataset.val === (s.size || "md"))
  );
  $("hubOptAccent")?.querySelectorAll(".hubColorBtn").forEach(b =>
    b.classList.toggle("active", b.dataset.val === (s.accent || "blue"))
  );
}

function initHubSettings_() {
  if (hubSettingsInited_) return;
  hubSettingsInited_ = true;

  const panel = $("hubSettingsPanel");

  $("btnHubSettings")?.addEventListener("click", () => {
    if (!panel) return;
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if (!isOpen) refreshSettingsUI_();
  });

  $("btnHubSettingsClose")?.addEventListener("click", () => {
    if (panel) panel.style.display = "none";
  });

  // Tema (usa el mecanismo existente de theme.js)
  $("hubOptTheme")?.addEventListener("click", e => {
    const btn = e.target.closest(".hubOptBtn");
    if (!btn) return;
    applyTheme_(btn.dataset.val);
    refreshSettingsUI_();
  });

  // Tamaño de fuente
  $("hubOptSize")?.addEventListener("click", e => {
    const btn = e.target.closest(".hubOptBtn");
    if (!btn) return;
    applySettings(saveSettings({ size: btn.dataset.val }));
    refreshSettingsUI_();
  });

  // Acento de color
  $("hubOptAccent")?.addEventListener("click", e => {
    const btn = e.target.closest(".hubColorBtn");
    if (!btn) return;
    applySettings(saveSettings({ accent: btn.dataset.val }));
    refreshSettingsUI_();
  });
}

/**
 * Muestra u oculta badge de pendientes en la cartilla de un módulo.
 */
export function updateHubModuleBadge(modName, count) {
  const btn = document.querySelector(`#hubButtons [data-mod="${modName}"]`);
  if (!btn) return;
  btn.querySelector(".hubBadge")?.remove();
  if (count > 0) {
    const badge = document.createElement("span");
    badge.className = "hubBadge";
    badge.textContent = String(count);
    btn.appendChild(badge);
  }
}

export function hasMultipleModulesUI() {
  const mods = CORE.state.currentProfile?.modulos;
  return Array.isArray(mods) && mods.filter(Boolean).length > 1;
}

export function syncTopbarHomeButtonUI() {
  const btn = $("btnGoHome");
  if (!btn) return;
  btn.classList.toggle("hidden", !hasMultipleModulesUI());
}

export function goToHubUI(mods, onPick) {
  showHubUI(mods, onPick);
}

export function setUserPillUI() {
  const p = CORE.state.currentProfile || {};
  const rol    = String(p.rol || "").toUpperCase();
  const esp    = String(p.especialidad || "").toUpperCase();
  const nombre = String(p.nombre || "").trim();

  const helloEl = $("userHello");
  const pillEl  = $("userPill");

  if (helloEl) helloEl.textContent = nombre ? `HOLA: ${nombre}` : "HOLA:";

  const extraTec = rol === "TECNICO" ? ` | ESP: ${esp || "-"}` : "";
  if (pillEl) pillEl.textContent = `ROL: ${rol}${extraTec}`;
}

export function applyDebugVisibilityUI() {
  const wrap = document.getElementById("debugWrap");
  if (!wrap) return;
  const rol = String(CORE.state.currentProfile?.rol || "").toUpperCase();
  if (rol === "ADMIN") wrap.classList.remove("debug-hidden");
  else wrap.classList.add("debug-hidden");
}

export function setOut(obj) {
  const out = $("out");
  if (out) out.textContent = JSON.stringify(obj, null, 2);
}

export function setEstadoText(text) {
  const box = el_("estadoBox");
  if (box) box.textContent = text || "";
}
