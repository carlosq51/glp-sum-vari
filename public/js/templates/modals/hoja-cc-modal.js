// =========================
// public/js/templates/modals/hoja-cc-modal.js
// Template HTML: el inspector de calidad valida su hoja CONTROL FINAL antes
// de pedirla a la oficina.
//
// Misma interfaz que el informe del técnico (informe-ot-modal.js) y con sus
// estilos: arriba lo que el sistema ya sabe, de solo lectura; debajo las
// casillas. Lo que el modelo deja sin "ok" sale primero y sin marcar, que es
// lo que el inspector tiene que mirar; el resto va plegado y todo marcado.
// Las casillas dependen del modelo del carro, así que se pintan al abrir
// (views/conversion/modals/hoja-cc.js).
// =========================

export function hojaCcModal() {
  return `
    <!-- =========================
        MODAL HOJA DE CONTROL FINAL
        ========================= -->
    <div id="hccModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Hoja de control final</div>
          <button id="hccClose" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="iotCabecera" id="hccCabecera"></div>
          <div id="hccPuntos"></div>
          <div class="iotMsg" id="hccMsg"></div>

          <div class="iotEnvios">
            <button id="hccEnviar" type="button" class="btnInicio iotEnviar">
              Pedir a la oficina
              <small>la imprimen con las demás pendientes</small>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
