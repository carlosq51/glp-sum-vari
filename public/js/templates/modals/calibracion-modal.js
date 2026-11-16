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
    <div id="calModal" class="modal calModal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Calibración STAG</div>
          <button id="calClose" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="calCab" id="calCab"></div>
          <div class="calLaptop" id="calLaptop" hidden></div>

          <!-- Formulario: el VIN ya lo sabe la app -->
          <div id="calForm" hidden>
            <div class="calCampos">
              <label class="calCampo">
                <span>Kilometraje</span>
                <div class="calKmWrap">
                  <input id="calKm" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="0">
                  <em>km</em>
                </div>
              </label>
              <label class="calCampo">
                <span>Mapa (.set) <b class="calSugerido" id="calSugerido" hidden>sugerido</b></span>
                <select id="calMapa"></select>
              </label>
            </div>

            <ol class="calGuia">
              <li><b>1</b><span>La laptop carga el mapa y hace los clics.</span></li>
              <li><b>2</b><span>Cuando suene, <strong>enciende el carro</strong>.</span></li>
              <li><b>3</b><span>Regula el reductor a <strong>1.25 bar</strong>.</span></li>
            </ol>

            <div class="iotMsg" id="calMsg"></div>
            <button id="calIniciar" type="button" class="calIniciar">
              <span>▶ Iniciar calibración</span>
              <small id="calIniciarSub">arranca en la laptop de calibración</small>
            </button>
          </div>

          <!-- Avance en vivo -->
          <div id="calAvance" hidden>
            <div class="calBanner" id="calBanner"></div>
            <div class="calPregunta" id="calPregunta" hidden></div>
            <div class="calValores" id="calValores"></div>
            <div class="calAvisos" id="calAvisos"></div>
            <div class="calProg" id="calProg"></div>
            <ol class="calPasos" id="calPasos"></ol>
            <div class="calLog" id="calLog"></div>
            <div class="iotMsg" id="calMsg2"></div>
            <div class="calAcciones" id="calAcciones"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
