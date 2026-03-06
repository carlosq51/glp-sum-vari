// =========================
// public/js/templates/modals/rf-tecnico-modal.js
// Template HTML: modal de registro parámetros/fallas (técnico)
// =========================

export function rfTecnicoModal() {
  return `
    <div id="rfTecModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro / Fallas</div>
          <button id="btnCloseRFTec" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="small" id="rfTecInfo" style="opacity:.85; margin-bottom:10px;"></div>

          <!-- MENU -->
          <div id="rfTecMenu">
            <div class="card" style="border:1px solid rgba(255,255,255,.16); margin-bottom:12px;">
              <div style="font-weight:900; margin-bottom:8px;">Registrar parámetros</div>
              <div class="small" style="opacity:.9;">Sube las 9 fotos (VIN, COMPRESIÓN, AMPERAJE, VOLTAJE, SCANNER).</div>

              <button id="btnRFTecParams" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>

            <div class="card" style="border:1px solid rgba(255,255,255,.16);">
              <div style="font-weight:900; margin-bottom:8px;">Registrar falla</div>
              <div class="small" style="opacity:.9;">Registra una falla con nota y fotos.</div>

              <button id="btnRFTecFalla" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>
          </div>

          <!-- STAGE -->
          <div id="rfTecStage" style="display:none; margin-top:12px;"></div>

          <div id="rfTecMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `;
}