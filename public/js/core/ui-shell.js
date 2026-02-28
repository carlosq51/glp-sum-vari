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
  MODULES.forEach((m) => {
    const el = document.getElementById(`view${m}`);
    if (el) el.style.display = "none";
  });
}

export function showHubUI(mods, onPick) {
  $("viewHub").style.display = "block";
  const box = $("hubButtons");
  box.innerHTML = "";
  mods.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m;
    btn.addEventListener("click", () => onPick?.(m));
    box.appendChild(btn);
  });
}

export function setUserPillUI() {
  const p = CORE.state.currentProfile || {};
  const rol = String(p.rol || "").toUpperCase();
  const esp = String(p.especialidad || "").toUpperCase();
  const mods = Array.isArray(p.modulos) ? p.modulos.join(",") : "(default)";
  const extraTec = rol === "TECNICO" ? ` | ESP: ${esp || "-"}` : "";
  $("userPill").textContent = `ROL: ${rol}${extraTec} | MOD: ${mods}`;
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