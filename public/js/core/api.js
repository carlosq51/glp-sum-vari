// =========================
// public/js/core/api.js
// API + UI lock
// =========================

import { CORE } from "./state.js";
import { $, el_ } from "./dom.js";
import { setEstadoText } from "./ui-shell.js";

export function setLocked(on, msg = "Procesando...") {
  CORE.state.uiLocked = !!on;

  const overlay = $("loadingOverlay");
  if (overlay) {
    overlay.classList.toggle("hidden", !CORE.state.uiLocked);
    const msgEl = document.getElementById("overlayMsg");
    if (msgEl) msgEl.textContent = String(msg || "Procesando").replace(/\.*\s*$/, "");
  }

  if (CORE.state.uiLocked) setEstadoText(msg);
  else setEstadoText("");

  const emailEl = $("email");
  if (emailEl) emailEl.disabled = CORE.state.uiLocked;

  if (CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD") {
    const vinEl = el_("vin");
    if (vinEl) vinEl.disabled = CORE.state.uiLocked;
  }

  const rolEl = $("rol");
  if (rolEl) {
    rolEl.disabled =
      CORE.state.uiLocked ||
      !!CORE.state.rolLock ||
      (CORE.state.currentModule !== "TECNICO");
  }

  const bMe = $("btnMe");
  if (bMe) bMe.disabled = CORE.state.uiLocked;

  const bLo = $("btnLogout");
  if (bLo) bLo.disabled = CORE.state.uiLocked;

  const ids = ["btnEstado", "btnActivas", "btnFinalizados", "btnQR", "btnSupQR"];
  for (const id of ids) {
    const b = el_(id);
    if (b) b.disabled = CORE.state.uiLocked;
  }

  const actBox = el_("activasBox");
  const finBox = el_("finalizadosBox");
  actBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = CORE.state.uiLocked));
  finBox?.querySelectorAll("button[data-act]")?.forEach((b) => (b.disabled = CORE.state.uiLocked));
}

export async function withLock(fn, msg) {
  if (CORE.state.uiLocked) return;
  setLocked(true, msg);
  try {
    return await fn();
  } finally {
    setLocked(false);
  }
}

export async function getJSON(url) {
  const r = await fetch(url);
  return await r.json();
}

export async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json();
}

export async function getJSON_user(url, msg = "Cargando...") {
  return await withLock(async () => await getJSON(url), msg);
}

export async function postJSON_user(url, body, msg = "Procesando...") {
  return await withLock(async () => await postJSON(url, body), msg);
}