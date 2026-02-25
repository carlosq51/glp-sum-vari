// public/js/templates/modals/qr-modal.js
export function qrModal() {
  return `
    <!-- =========================
         MODAL QR
         ========================= -->
    <div id="qrModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Escanear QR</div>
          <button id="btnCloseQR" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div id="qrReader"></div>

          <div class="twoWide" style="margin-top:12px;">
            <button id="btnScanQR"  type="button" class="btnInicio">QR</button>
            <button id="btnScanBar" type="button" class="btnPausa">CÓDIGO DE BARRAS (CODE_128)</button>
          </div>

          <div id="qrMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `;
}