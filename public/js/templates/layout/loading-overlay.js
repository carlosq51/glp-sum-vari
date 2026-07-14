// =========================
// public/js/templates/layout/loading-overlay.js
// Template HTML: overlay de carga (spinner + dots)
// =========================

import { toroSvg } from "../../core/icons.js";

export function loadingOverlay() {
  return `
    <!-- =========================
         LOADING OVERLAY
         ========================= -->
    <div id="loadingOverlay" class="overlay hidden">
      <div class="overlay-box">
        ${toroMark()}
        <div class="spinner"></div>

        <div class="overlay-text">
          <span id="overlayMsg">Procesando</span>
          <span class="dots" aria-hidden="true">
            <span class="dot">.</span><span class="dot dot2">.</span><span class="dot dot3">.</span>
          </span>
        </div>
      </div>
    </div>
  `;
}

// Toro para el overlay de carga (usuarios especiales, ver app.js).
// Oculto por defecto; se muestra solo cuando body[data-toro="1"].
export function toroMark() {
  return `<div class="toroWrap" aria-hidden="true">${toroSvg("Load")}</div>`;
}