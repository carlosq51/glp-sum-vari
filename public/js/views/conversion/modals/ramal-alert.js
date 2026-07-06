// =========================
// ramal-alert.js
// Notificación al técnico cuando el ramalero marca su ramal como entregado.
// Muestra un banner llamativo + vibración 2 segundos (si el dispositivo lo soporta)
// =========================

const ALERT_ID = "ramalAlertBanner";

export function showRamalEntregadoAlert({ vin } = {}) {
  try { if (navigator.vibrate) navigator.vibrate(2000); } catch {}

  document.getElementById(ALERT_ID)?.remove();

  const banner = document.createElement("div");
  banner.id = ALERT_ID;
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <div style="
      position:fixed; top:16px; left:50%; transform:translateX(-50%);
      z-index:99999; max-width:340px; width:calc(100% - 32px);
      background:var(--ok); color:var(--bg0);
      border-radius:16px; padding:16px 18px;
      box-shadow:var(--shadow);
      display:flex; align-items:center; gap:14px;
      animation: ramalSlideIn .3s cubic-bezier(.22,1,.36,1);
    ">
      <span style="font-size:2rem; line-height:1;">🔩</span>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:900; font-size:1rem; line-height:1.2;">
          ¡Tu ramal está listo!
        </div>
        <div style="font-size:.82rem; margin-top:4px; opacity:.9;">
          ${vin ? `VIN: <b>${vin}</b><br>` : ""}Acércate a recoger tu ramal.
        </div>
      </div>
      <button id="btnCloseRamalAlert"
        style="background:none; border:none; color:var(--bg0); font-size:1.2rem;
               cursor:pointer; padding:4px; line-height:1; opacity:.8;">
        ✕
      </button>
    </div>
    <style>
      @keyframes ramalSlideIn {
        from { opacity:0; transform:translateX(-50%) translateY(-20px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    </style>
  `;

  document.body.appendChild(banner);

  const close = () => {
    try { navigator.vibrate(0); } catch {}
    banner.remove();
  };

  banner.querySelector("#btnCloseRamalAlert")?.addEventListener("click", close);
  setTimeout(close, 8000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array_(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
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
 * Solicita permiso de notificaciones y suscribe al Web Push.
 * Llamar una vez al entrar al módulo TECNICO con el email del usuario.
 */
export async function requestNotifPermission(email) {
  try {
    if (!("Notification" in window)) return;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm === "granted") await subscribeWebPush_(email || "");
  } catch (e) {
    console.warn("[WebPush] requestNotifPermission:", e.message);
  }
}
