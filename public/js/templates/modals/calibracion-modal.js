// =========================
// public/js/templates/modals/calibracion-modal.js
// Template HTML: el inspector inicia la calibración STAG del carro desde su
// tarjeta de Calidad y sigue el avance desde el celular.
//
// Dos caras en el mismo modal: el formulario (km + mapa) y el avance (pasos,
// presión, G1–G4, preguntas de la laptop). La lógica está en
// views/conversion/modals/calibracion.js; los estilos en calibracion.css.
// =========================

export function calibracionModal() {
  return `
    <div id="calModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Calibración STAG</div>
          <button id="calClose" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="calCab" id="calCab"></div>

          <!-- Formulario: el VIN ya lo sabe la app -->
          <div id="calForm" hidden>
            <div class="iotGrid">
              <label class="iotCampo">
                <span>Kilometraje</span>
                <input id="calKm" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Ej. 12">
              </label>
              <label class="iotCampo">
                <span>Mapa (.set)</span>
                <select id="calMapa"></select>
              </label>
            </div>
            <p class="small muted calNota">La laptop hace los clics. Tú solo enciendes el carro cuando suene y regulas el reductor a 1.25 bar.</p>
            <div class="iotMsg" id="calMsg"></div>
            <div class="iotEnvios">
              <button id="calIniciar" type="button" class="btnInicio iotEnviar">
                ▶ Iniciar calibración
                <small>arranca en la laptop de calibración</small>
              </button>
            </div>
          </div>

          <!-- Avance en vivo -->
          <div id="calAvance" hidden>
            <div class="calBanner" id="calBanner"></div>
            <div class="calPregunta" id="calPregunta" hidden></div>
            <div class="calValores" id="calValores"></div>
            <div class="calAvisos" id="calAvisos"></div>
            <ol class="calPasos" id="calPasos"></ol>
            <div class="calLog small muted" id="calLog"></div>
            <div class="iotMsg" id="calMsg2"></div>
            <div class="calAcciones" id="calAcciones"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
