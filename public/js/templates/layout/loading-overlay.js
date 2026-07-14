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

// Toro — imagen SVG autocontenida (silueta sobre disco ámbar de marca).
// Oculta por defecto; se muestra solo cuando body[data-toro="1"]
// (usuarios especiales, ver app.js). Lleva su propio disco para leer
// bien tanto en tema claro como oscuro.
export function toroMark() {
  return `
    <div class="toroWrap" aria-hidden="true">
      <svg class="toroSvg" viewBox="0 0 120 120" role="img" aria-label="Toro">
        <defs>
          <linearGradient id="toroDisc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f7b733"/>
            <stop offset="1" stop-color="#ea7317"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="54" fill="url(#toroDisc)"/>
        <g fill="#241a08">
          <path d="M40 46 C 26 40 17 41 12 28 C 23 30 33 35 44 41 Z"/>
          <path d="M80 46 C 94 40 103 41 108 28 C 97 30 87 35 76 41 Z"/>
          <path d="M60 40 C 44 40 36 50 36 64 C 36 82 47 96 60 96 C 73 96 84 82 84 64 C 84 50 76 40 60 40 Z"/>
        </g>
        <path d="M52 34 C 54 27 58 25 60 25 C 62 25 66 27 68 34 Z" fill="#241a08"/>
        <ellipse cx="60" cy="78" rx="16" ry="12" fill="#3a2a12"/>
        <circle cx="49" cy="60" r="3.6" fill="#f7b733"/>
        <circle cx="71" cy="60" r="3.6" fill="#f7b733"/>
        <path d="M53 75 q 3 6 6 1" fill="none" stroke="#f7b733" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M67 75 q -3 6 -6 1" fill="none" stroke="#f7b733" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="60" cy="88" r="6" fill="none" stroke="#f7b733" stroke-width="2.4"/>
      </svg>
    </div>
  `;
}