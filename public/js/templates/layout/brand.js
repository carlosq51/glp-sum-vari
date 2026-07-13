// =========================
// public/js/templates/layout/brand.js
// Wordmark de marca SUM Vehículos (recreación CSS theme-aware) + boot splash.
// La tinta del wordmark sigue el tema (--brandInk); el punto es ámbar fijo.
// =========================

/**
 * Wordmark "sum · Vehículos".
 * @param {"sm"|"md"|"lg"} size
 */
export function brandMark(size = "md") {
  return `
    <div class="sumBrand sumBrand--${size}" role="img" aria-label="SUM Vehículos">
      <div class="sumWord">
        <span class="sumLetter">s</span><span class="sumU">u<i class="sumDot"></i></span><span class="sumLetter">m</span>
      </div>
      <div class="sumSub">Vehículos</div>
    </div>
  `;
}

/**
 * Splash de arranque a pantalla completa (logo + spinner de marca).
 * Visible en el cold boot / al despertar el render; se oculta al iniciar la app.
 */
export function bootSplash() {
  return `
    <div id="bootSplash" class="bootSplash">
      ${brandMark("lg")}
      <div class="bootSpinner" aria-hidden="true"></div>
    </div>
  `;
}
