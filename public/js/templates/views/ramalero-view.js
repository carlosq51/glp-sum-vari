// public/js/templates/views/ramalero-view.js
export function ramaleroView() {
  return `
    <!-- =========================
         RAMALERO
         ========================= -->
    <div id="viewRAMALERO" style="display:none;">
      <div class="card">
        <h3>Ramalero</h3>
        <div class="small">Armado de ramales (sin VIN)</div>

        <div class="fullStack" style="margin-top:10px;">
          <div class="ramalRow3">
            <select id="tipoRamal">
              <option value="">Selecciona tipo de ramal</option>
              <option value="JETOUR">JETOUR</option>
              <option value="VOLKSWAGEN POLO">VOLKSWAGEN POLO</option>
              <option value="VOLKSWAGEN TERA">VOLKSWAGEN TERA</option>
              <option value="KYC V3 / V5">KYC V3 / V5</option>
              <option value="KYC V7">KYC V7</option>
              <option value="KYC X3">KYC X3</option>
              <option value="KYC X5 SIMPLE">KYC X5 SIMPLE</option>
              <option value="KYC X5 DOBLE">KYC X5 DOBLE</option>
            </select>

            <input
              id="ramalId"
              type="text"
              placeholder="RAMAL_ID"
              readonly
              style="opacity:.85;"
            />

            <button id="btnRamalNuevo" class="btnInicio" title="Crear nuevo RAMAL">
              NUEVO RAMAL
            </button>
          </div>

          <div class="twoWide">
            <button id="btnFinalizadosR">Ver finalizados</button>
            <button id="btnActivasR">🔄 <span>Refrescar</span></button>
          </div>
        </div>

        <div style="margin-top:14px;">
          <h4>Activos</h4>
          <div id="activasBoxR"></div>
        </div>

        <div id="finalizadosWrapR" style="display:none; margin-top:14px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBoxR"></div>
        </div>
      </div>
    </div>
  `;
}