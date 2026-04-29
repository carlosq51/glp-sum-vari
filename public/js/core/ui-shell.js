// =========================
// public/js/core/ui-shell.js
// UI base login/app/hub/salida
// =========================

import { CORE, MODULES } from "./state.js";
import { $, el_ } from "./dom.js";

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
}

export function showHubUI(mods, onPick) {
  hideAllModulesUI();

  const hub = $("viewHub");
  if (hub) hub.style.display = "block";

  const box = $("hubButtons");
  if (!box) return;

  box.innerHTML = "";
  mods.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m;
    btn.dataset.mod = m;
    btn.addEventListener("click", () => onPick?.(m));
    box.appendChild(btn);
  });
}

/**
 * Muestra u oculta un badge con el número de pendientes
 * en el botón del hub correspondiente al módulo dado.
 * @param {string} modName  - Nombre del módulo (ej. "MOVILIZADOR")
 * @param {number} count    - Cantidad a mostrar (0 = ocultar)
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

  const show = hasMultipleModulesUI();
  btn.classList.toggle("hidden", !show);
}

export function goToHubUI(mods, onPick) {
  showHubUI(mods, onPick);
}

export function setUserPillUI() {
  const p = CORE.state.currentProfile || {};
  const rol = String(p.rol || "").toUpperCase();
  const esp = String(p.especialidad || "").toUpperCase();
  const mods = Array.isArray(p.modulos) ? p.modulos.join(",") : "(default)";
  const nombre = String(p.nombre || "").trim();

  const helloEl = $("userHello");
  const pillEl = $("userPill");

  if (helloEl) {
    helloEl.textContent = nombre ? `HOLA: ${nombre}` : "HOLA:";
  }

  const extraTec = rol === "TECNICO" ? ` | ESP: ${esp || "-"}` : "";

  if (pillEl) {
    pillEl.textContent = `ROL: ${rol}${extraTec} | MOD: ${mods}`;
  }
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