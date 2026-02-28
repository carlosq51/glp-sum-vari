// =========================
// public/js/core/auth.js
// Perfil, módulos efectivos, inputs auth/work
// =========================

import { CORE, MODULES } from "./state.js";
import { $, el_ } from "./dom.js";

const EMAIL_KEY = "glp_email";

export function effectiveModulos(profile) {
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

export function computeRolLock_(profile) {
  const rolUser = String(profile?.rol || "").toUpperCase();
  if (rolUser !== "TECNICO") return null;
  const esp = String(profile?.especialidad || "").toUpperCase();
  if (esp === "MOTOR") return "MOTOR";
  if (esp === "TANQUE" || esp === "TANQUERO") return "TANQUE";
  return null;
}

export function enforceRolLock_() {
  if (CORE.state.currentModule !== "TECNICO") return;
  const sel = $("rol");
  if (!sel) return;

  if (CORE.state.rolLock) {
    sel.value = CORE.state.rolLock;
    sel.disabled = true;
  } else {
    sel.disabled = false;
  }
}

export function saveEmail(email) {
  localStorage.setItem(EMAIL_KEY, email);
}

export function loadEmail() {
  return localStorage.getItem(EMAIL_KEY) || "";
}

export function clearEmail() {
  localStorage.removeItem(EMAIL_KEY);
}

export function getEmail() {
  return String($("email")?.value || "").trim().toLowerCase();
}

export function getVin() {
  return String(el_("vin")?.value || "").trim().toUpperCase();
}

export function getRolTecnico_() {
  if (CORE.state.rolLock) return CORE.state.rolLock;
  const sel = $("rol");
  return sel ? String(sel.value || "MOTOR").toUpperCase() : "MOTOR";
}

export function getRolTrabajoCurrent_() {
  if (CORE.state.currentModule === "CALIDAD") return "CALIDAD";
  if (CORE.state.currentModule === "RAMALERO") return "RAMALERO";
  return String(getRolTecnico_() || "").toUpperCase();
}

export function requireEmailOrStop() {
  const email = getEmail();
  if (!email) throw new Error("NO_EMAIL");
  return email;
}