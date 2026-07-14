// =========================
// public/js/core/ui-shell.js
// UI base login/app/hub/salida
// =========================

import { CORE, MODULES } from "./state.js";
import { $, el_ } from "./dom.js";
import { icon } from "./icons.js";

// ─── Avatares personalizados por técnico ─────────────────────────────
// email (minúsculas) → URL de imagen (data URI o asset same-origin, por
// CSP no se permiten hosts externos). Vacío por ahora: todos muestran el
// avatar genérico. Para personalizar a alguien, añade su email aquí.
const TECH_AVATARS = {
  // "ley.m2692@hotmail.com": "/avatars/leysester.jpg",
};

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

  // Avatar del técnico (genérico o personalizado por email)
  renderHubAvatar_();

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

}

// ─── Avatar del hub ──────────────────────────────────────────────────
// Muestra la foto del técnico si está registrada (TECH_AVATARS por email),
// o un icono genérico de usuario. Preparado para personalizar por técnico.
function renderHubAvatar_() {
  const imgBox = $("hubAvatarImg");
  const wrap = $("hubAvatar");
  if (!imgBox) return;

  const email = String(CORE.state.currentProfile?.email || "").trim().toLowerCase();
  const url = TECH_AVATARS[email];

  if (url) {
    imgBox.innerHTML = `<img class="hubAvatarPhoto" src="${url}" alt="Foto de perfil">`;
    wrap?.classList.add("hubAvatar--photo");
  } else {
    imgBox.innerHTML = icon("user", 30);
    wrap?.classList.remove("hubAvatar--photo");
  }
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
