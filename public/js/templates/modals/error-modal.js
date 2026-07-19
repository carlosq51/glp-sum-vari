// =========================
// public/js/templates/modals/error-modal.js
// Template HTML: modal de error genérico
// ⚠️ Homónimo intencional: el COMPORTAMIENTO (abrir/cerrar/promesa) vive en
//    views/conversion/modals/error-modal.js — este archivo solo aporta el HTML.
// =========================

export function errorModal() {
  return `
    <!-- =========================
         MODAL ERROR
         ========================= -->
    <div id="errorModal" class="modal modalConfirm" aria-hidden="true">
      <div class="modalBox modalConfirmBox">
        <div class="modalHead">
          <div id="errorModalTitle" class="modalTitle">❌ Error</div>
          <button id="btnCloseErrorX" type="button" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div
            id="errorModalText"
            class="small"
            style="opacity:.92; line-height:1.5;"
          >
            Ha ocurrido un error.
          </div>

          <div id="errorModalDetails" style="margin-top:12px; opacity:.75; font-size:.9em; display:none;"></div>

          <div class="row" style="gap:12px; margin-top:18px; flex-wrap:nowrap;">
            <button id="btnCloseError" type="button" class="btn" style="flex:1;">
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
