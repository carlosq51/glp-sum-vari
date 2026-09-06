// =========================
// public/js/templates/modals/rf-calidad-modal.js
// Template HTML: modal de registro fotos/fallas (calidad)
// =========================

export function rfModal() {
  return `
    <!-- =========================
        MODAL RF (CALIDAD)
        ========================= -->
    <div id="rfModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro</div>
          <button id="btnCloseRF" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="small" id="rfInfo" style="opacity:.85; margin-bottom:10px;"></div>

          <!-- ✅ MENU (lo que ya tienes) -->
          <div id="rfMenu">
            <div class="card" style="border:1px solid rgba(255,255,255,.16); margin-bottom:12px;">
              <div style="font-weight:900; margin-bottom:8px;">Control de Calidad</div>
              <div class="small" style="opacity:.9;">Pantalla de control de calidad.</div>

              <button id="btnRfControl" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>

            <div class="card" style="border:1px solid rgba(255,255,255,.16);">
              <div style="font-weight:900; margin-bottom:8px;">Registrar falla</div>
              <div class="small" style="opacity:.9;">Registra una falla con nota.</div>

              <button id="btnRfFalla" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Entrar
              </button>
            </div>

            <div class="card" style="border:1px solid rgba(255,255,255,.16); margin-top:12px;">
              <div style="font-weight:900; margin-bottom:8px;">📸 Ver fotos del carro</div>
              <div class="small" style="opacity:.9;">Compresión (4 cilindros), soldadura y eléctrico, tal como los subió el técnico.</div>

              <button id="btnRfSoldadura" class="btnInicio"
                style="margin-top:12px; width:100%; height:64px; font-weight:1000;">
                Ver fotos
              </button>
            </div>
          </div>

          <!-- ✅ AQUI se renderiza el uploader (dentro del modal) -->
          <div id="rfStage" style="display:none; margin-top:12px;"></div>

          <div id="rfMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `;
}