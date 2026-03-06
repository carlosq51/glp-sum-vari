// =========================
// public/js/templates/layout/loading-overlay.js
// Template HTML: overlay de carga (spinner + dots)
// =========================

export function loadingOverlay() {
  return `
    <!-- =========================
         LOADING OVERLAY
         ========================= -->
    <div id="loadingOverlay" class="overlay hidden">
      <div class="overlay-box">
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