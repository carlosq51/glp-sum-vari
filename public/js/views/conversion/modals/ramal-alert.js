// =========================
// ramal-alert.js
// Notificación al técnico cuando el ramalero marca su ramal como entregado.
// Muestra un banner llamativo + vibración 2 segundos (si el dispositivo lo soporta)
// =========================

const ALERT_ID = "ramalAlertBanner";

export function showRamalEntregadoAlert({ vin } = {}) {
  // Vibrar 2 segundos si el dispositivo lo soporta
  try {
    if (navigator.vibrate) {
      navigator.vibrate(2000);
    }
  } catch {}

  // Notificación Web si hay permiso (background)
  try {
    if (Notification.permission === "granted") {
      new Notification("🔩 ¡Tu ramal está listo!", {
        body: vin ? `VIN: ${vin} — Acércate a recoger tu ramal.` : "Acércate a recoger tu ramal.",
        icon: "/favicon.ico",
        tag:  "ramal-entregado",
      });
    }
  } catch {}

  // Banner en pantalla (siempre, sin importar permisos)
  document.getElementById(ALERT_ID)?.remove();

  const banner = document.createElement("div");
  banner.id = ALERT_ID;
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <div style="
      position:fixed; top:16px; left:50%; transform:translateX(-50%);
      z-index:99999; max-width:340px; width:calc(100% - 32px);
      background:linear-gradient(135deg,#16a34a,#15803d);
      color:#fff; border-radius:16px; padding:16px 18px;
      box-shadow:0 8px 32px rgba(0,0,0,.45);
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
        style="background:none; border:none; color:#fff; font-size:1.2rem;
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

  // Auto-cierre a los 8 segundos
  setTimeout(close, 8000);
}

/**
 * Solicita permiso de notificaciones (llamar una vez al entrar al módulo TECNICO).
 */
export function requestNotifPermission() {
  try {
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch {}
}
