// =========================
// public/js/core/ui-shell.js
// UI base login/app/hub/salida
// =========================

import { CORE, MODULES } from "./state.js";
import { $, el_ } from "./dom.js";
import { icon, toroSvg, venadoSvg } from "./icons.js";

// ─── Avatares personalizados por técnico ─────────────────────────────
// email (minúsculas) → URL de imagen (data URI o asset same-origin, por
// CSP no se permiten hosts externos). Para personalizar a alguien con foto,
// añade su email aquí.
const TECH_AVATARS = {
  "do-ni2010@hotmail.com": "/avatars/bowser.jpg",
};

// Emails que usan el toro (dibujo SVG con dos cuernos) como avatar.
const TORO_AVATAR_EMAILS = [
  "ley.m2692@hotmail.com",
  "gianfrancofloresflores3@gmail.com",
];

// Emails que usan el venado (dibujo SVG con astas) como avatar.
const VENADO_AVATAR_EMAILS = [
  // "correo@ejemplo.com",
];

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

// ─── Avatar de usuario ───────────────────────────────────────────────
// Reutilizable en cualquier cabecera (hub, técnico, movilizador, …).
// Muestra: toro (usuarios especiales), foto registrada (TECH_AVATARS por
// email) o un icono genérico de usuario. Preparado para personalizar.
export function renderUserAvatar(wrap) {
  if (!wrap) return;

  let imgBox = wrap.querySelector(".hubAvatarImg");
  if (!imgBox) {
    imgBox = document.createElement("span");
    imgBox.className = "hubAvatarImg";
    imgBox.setAttribute("aria-hidden", "true");
    wrap.appendChild(imgBox);
  }

  const email = String(CORE.state.currentProfile?.email || getEmail_() || "").trim().toLowerCase();
  const avatarUrl = CORE.state.currentProfile?.avatar_url;
  const legacyUrl = TECH_AVATARS[email];
  const url = avatarUrl || legacyUrl;

  wrap.classList.remove("hubAvatar--photo", "hubAvatar--toro");

  if (TORO_AVATAR_EMAILS.includes(email)) {
    imgBox.innerHTML = toroSvg("Avatar");
    wrap.classList.add("hubAvatar--toro");
  } else if (VENADO_AVATAR_EMAILS.includes(email)) {
    imgBox.innerHTML = venadoSvg("Avatar");
    wrap.classList.add("hubAvatar--toro");
  } else if (url) {
    imgBox.innerHTML = `<img class="hubAvatarPhoto" src="${url}" alt="Foto de perfil">`;
    wrap.classList.add("hubAvatar--photo");
  } else {
    imgBox.innerHTML = icon("user", 30);
  }

  wrap.style.cursor = "pointer";
  wrap.title = "Hacer clic para cambiar foto de perfil";
}

function renderHubAvatar_() {
  renderUserAvatar($("hubAvatar"));
}

// Email actual: del perfil o del input de login como respaldo.
function getEmail_() {
  return String($("email")?.value || "").trim();
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
