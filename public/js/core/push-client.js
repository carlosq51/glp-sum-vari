// =========================
// public/js/core/push-client.js
// Cliente Web Push de ESTE dispositivo: estado, alta y baja de la suscripción.
//
// Centraliza lo que antes vivía en views/conversion/modals/ramal-alert.js.
// Lo consumen: settings-sheet (toggle global), Admin → Notificaciones (panel
// de prueba) y los módulos que suscriben al entrar (técnico, ramalero).
//
// La baja es POR DISPOSITIVO: desuscribe este navegador y borra su endpoint
// del servidor — los demás dispositivos del usuario siguen recibiendo.
// =========================

function urlBase64ToUint8Array_(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/**
 * Estado completo del dispositivo (los 4 requisitos del push).
 * @returns {Promise<{soporta:boolean, permiso:string, suscrito:boolean, vibra:boolean}>}
 */
export async function getNotifStatus() {
  const soporta = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const permiso = soporta ? Notification.permission : "unsupported";
  let suscrito = false;
  if (soporta) {
    try {
      const reg = await navigator.serviceWorker.ready;
      suscrito = !!(await reg.pushManager.getSubscription());
    } catch { /* sin SW registrado */ }
  }
  return { soporta, permiso, suscrito, vibra: !!navigator.vibrate };
}

// Opt-out del usuario en ESTE dispositivo. Los módulos suscriben solos al
// entrar (técnico/ramalero); si el usuario apagó las notificaciones desde
// ajustes, ese auto-subscribe debe respetarlo — solo el toggle explícito
// (force:true) vuelve a activarlas.
const OPTOUT_KEY = "glp_notifs_off";

function optedOut_() {
  try { return localStorage.getItem(OPTOUT_KEY) === "1"; } catch { return false; }
}

let _subscribeInFlight = false;

async function subscribeWebPush_(email) {
  if (_subscribeInFlight) return;
  _subscribeInFlight = true;
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;

    // Re-register existing subscription so backend always has it
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyJ   = await keyRes.json();
      if (!keyJ?.key) return;
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array_(keyJ.key),
      });
    }

    await fetch("/api/push/subscribe", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, subscription: subscription.toJSON() }),
    });
  } catch (e) {
    console.warn("[WebPush] subscribe:", e.message);
  } finally {
    _subscribeInFlight = false;
  }
}

/**
 * Solicita permiso de notificaciones y suscribe este dispositivo.
 * - Módulos al entrar: requestNotifPermission(email) — respeta el opt-out.
 * - Toggle/botón explícito: requestNotifPermission(email, { force: true }) —
 *   limpia el opt-out y reactiva.
 */
export async function requestNotifPermission(email, { force = false } = {}) {
  try {
    if (!("Notification" in window)) return;
    if (!force && optedOut_()) return; // el usuario las apagó aquí a propósito
    if (force) { try { localStorage.removeItem(OPTOUT_KEY); } catch {} }

    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm === "granted") await subscribeWebPush_(email || "");
  } catch (e) {
    console.warn("[WebPush] requestNotifPermission:", e.message);
  }
}

/**
 * Da de baja ESTE dispositivo: desuscribe el navegador y borra el endpoint
 * del servidor. El permiso del navegador queda intacto (re-activar no vuelve
 * a preguntar). Devuelve true si quedó desuscrito.
 */
export async function disableNotifs() {
  try {
    try { localStorage.setItem(OPTOUT_KEY, "1"); } catch {}
    if (!("serviceWorker" in navigator)) return true;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch("/api/push/unsubscribe", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ endpoint }),
    }).catch(() => { /* el servidor la limpiará al fallar el próximo envío (410) */ });
    return true;
  } catch (e) {
    console.warn("[WebPush] disable:", e.message);
    return false;
  }
}
