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
  // 🔄 Si hay un lock activo, esperar a que se libere (cola en serie)
  if (CORE.state.uiLocked) {
    console.warn(`[withLock] ⏳ Lock activo. Esperando a que se libere: "${msg}"`);
    // Esperar brevemente y reintentar (máximo 10 intentos)
    let attempts = 0;
    while (CORE.state.uiLocked && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (CORE.state.uiLocked) {
      console.error(`[withLock] ❌ Lock no se liberó después de 10s. Forzando.`);
    }
  }
  
  setLocked(true, msg);
  const startTime = Date.now();
  const lockId = Math.random().toString(36).slice(2, 9);
  console.log(`[withLock] 🔒 Lock iniciado (${lockId}): "${msg}"`);
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    console.log(`[withLock] ✅ Lock completado (${lockId}): ${duration}ms`, msg);
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[withLock] ❌ Error en lock (${lockId}) después de ${duration}ms:`, err.message);
    throw err;
  } finally {
    setLocked(false);
    const duration = Date.now() - startTime;
    if (duration > 5000) {
      // ⚠️ Alerta si tardó más de 5 segundos
      console.warn(`[withLock] ⏱️ DURACIÓN LARGA (${lockId}): ${duration}ms para "${msg}"`);
    }
  }
}

export async function getJSON(url) {
  const r = await fetch(url);
  return await r.json();
}

export async function postJSON(url, body) {
  let response;
  let jsonData;
  
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Fallo de conexión: ${err?.message || err}`);
  }

  // ✅ Intentar parsear JSON siempre (incluso en errores HTTP)
  // Esto permite que errores como 404 (VIN_NOT_FOUND) y 409 (ALREADY_ASSIGNED)
  // retornen el body JSON con errorType, vin, assignedTo, etc.
  try {
    jsonData = await response.json();
  } catch {
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200) || response.statusText}`);
    }
    throw new Error(`Respuesta no-JSON desde servidor`);
  }

  // Si el servidor retornó JSON con error HTTP, incluir el statusCode para el frontend
  if (!response.ok && jsonData) {
    jsonData._statusCode = response.status;
    return jsonData;  // Retornar el objeto JSON (con ok:false) en vez de lanzar error
  }

  return jsonData;
}

export async function getJSON_user(url, msg = "Cargando...") {
  return await withLock(async () => await getJSON(url), msg);
}

export async function postJSON_user(url, body, msg = "Procesando...") {
  return await withLock(async () => await postJSON(url, body), msg);
}