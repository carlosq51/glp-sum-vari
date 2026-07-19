// =========================
// ramal-alert.js
// Notificación al técnico cuando el ramalero marca su ramal como entregado.
// Muestra un banner llamativo + vibración 2 segundos (si el dispositivo lo soporta)
// =========================

import { showBanner_ } from "../../../core/banner.js";

const ALERT_ID = "ramalAlertBanner";

export function showRamalEntregadoAlert({ vin } = {}) {
  try { if (navigator.vibrate) navigator.vibrate(2000); } catch {}

  showBanner_({
    id: ALERT_ID,
    kind: "top-card",
    zIndex: 99999,
    autoCloseMs: 8000,
    onClose: () => { try { navigator.vibrate(0); } catch {} },
    style:
      "background:var(--ok);color:var(--bg0);border-radius:16px;" +
      "padding:16px 18px;display:flex;align-items:center;gap:14px;",
    html: `
      <span style="font-size:2rem; line-height:1;">🔩</span>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:900; font-size:1rem; line-height:1.2;">
          ¡Tu ramal está listo!
        </div>
        <div style="font-size:.82rem; margin-top:4px; opacity:.9;">
          ${vin ? `VIN: <b>${vin}</b><br>` : ""}Acércate a recoger tu ramal.
        </div>
      </div>
      <button data-banner-close
        style="background:none; border:none; color:var(--bg0); font-size:1.2rem;
               cursor:pointer; padding:4px; line-height:1; opacity:.8;">
        ✕
      </button>`,
  });
}

// La suscripción Web Push se movió a core/push-client.js
// (compartida por settings-sheet, Admin y los módulos que suscriben al entrar).
