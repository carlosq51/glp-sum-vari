// public/js/templates/modals/confirm-finish-modal.js
export function confirmFinishModal() {
  return `
    <!-- =========================
         MODAL CONFIRMAR FIN
         ========================= -->
    <div id="confirmFinishModal" class="modal modalConfirm" aria-hidden="true">
      <div class="modalBox modalConfirmBox">
        <div class="modalHead">
          <div id="confirmFinishTitle" class="modalTitle">Confirmar finalización</div>
          <button id="btnCloseFinishX" type="button" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div
            id="confirmFinishText"
            class="small"
            style="opacity:.92; line-height:1.5;"
          >
            ¿Seguro que quieres finalizar este trabajo?
          </div>

          <div class="row" style="gap:12px; margin-top:18px; flex-wrap:nowrap;">
            <button id="btnCancelFinish" type="button" class="btn" style="flex:1;">
              Cancelar
            </button>

            <button id="btnAcceptFinish" type="button" class="btn danger" style="flex:1;">
              Sí, finalizar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}