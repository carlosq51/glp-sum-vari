// =========================
// public/js/templates/views/ramales-view.js
// Template HTML: el control de ramales como página propia (/ramales).
//
// Es el mismo panel que vive en la pestaña RAMALES del supervisor, pero
// servido en su URL para que quien maneja las cajas entre directo, sin
// pasear por el resto del módulo de supervisión.
// =========================

import { icon } from "../../core/icons.js";

export function ramalesView() {
  return `
    <div id="viewRamales" style="display:none;">
      <div class="rmPageHead">
        <button id="rmPageBack" type="button" class="adminBtnGhost" title="Volver a la pantalla principal">
          ${icon("chevronLeft", 15)} Volver
        </button>
        <div class="rmPageTitle">
          <h2>Control de ramales</h2>
          <span>Turno, desembalaje, reparto y stock</span>
        </div>
      </div>
      <div id="rmPageBody" class="invPageBody"></div>
    </div>
  `;
}
