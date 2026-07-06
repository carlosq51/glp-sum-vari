// =========================
// public/js/templates/views/ramalero-view.js
// Template HTML: vista ramalero (armado de ramales)
// =========================

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
              <option value="VOLKSWAGEN">VOLKSWAGEN</option>
              <option value="KYC V3">KYC V3</option>
              <option value="KYC V5">KYC V5</option>
              <option value="KYC V7">KYC V7</option>
              <option value="KYC X5">KYC X5</option>
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
          <div style="margin-top:8px;">
            <button id="btnVerSolicitudesR" style="width:100%;position:relative;">
              🔩 Ver Solicitudes de Ramal
              <span id="solRamalBadge" style="
                display:none;
                position:absolute;top:-6px;right:-6px;
                background:var(--danger);color:var(--bg0);
                border-radius:50%;width:18px;height:18px;
                font-size:.7rem;font-weight:700;
                align-items:center;justify-content:center;
              "></span>
            </button>
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