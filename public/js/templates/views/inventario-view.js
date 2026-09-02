// =========================
// public/js/templates/views/inventario-view.js
// Template HTML: el inventario abierto como página propia (/inventario).
// Es el mismo módulo que vive dentro de Admin → Inventario, pero servido
// en su propia URL para que el encargado del almacén entre directo, sin
// pasear por el panel de administración.
// =========================

import { icon } from "../../core/icons.js";

export function inventarioView() {
  return `
    <div id="viewInventario" style="display:none;">
      <div class="invPageHead">
        <button id="invPageBack" type="button" class="adminBtnGhost" title="Volver a la pantalla principal">
          ${icon("chevronLeft", 15)} Volver
        </button>
        <div class="invPageTitle">
          <h2>Inventario de herramientas</h2>
          <span>Almacén, existencias y hojas por técnico</span>
        </div>
      </div>
      <div id="invPageBody" class="invPageBody"></div>
    </div>
  `;
}
