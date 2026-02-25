// public/js/templates/views/supervisor-view.js
export function supervisorView() {
  return `
    <!-- =========================
         SUPERVISOR
         ========================= -->
    <div id="viewSUPERVISOR" class="card" style="display:none;">
      <h3>Supervisor</h3>
      <div class="small">Filtros opcionales: nombre/email, fechas o mes.</div>

      <div class="row" style="gap:10px; margin:10px 0; flex-wrap:wrap;">
        <button type="button" class="btn" data-suptrack="CONVERSION">CONVERSIÓN</button>
        <button type="button" class="btn" data-suptrack="CALIDAD">CALIDAD</button>
        <button type="button" class="btn" data-suptrack="RAMAL">RAMAL</button>

        <div id="supTrackPill" class="pill small" style="margin-left:auto;">
          CONVERSIÓN (MOTOR + TANQUE)
        </div>
      </div>

      <div class="fullStack" style="margin-top:10px;">
        <div class="supNameWrap">
          <input id="supName" type="text" placeholder="Buscar por nombre o email..." autocomplete="off" />
          <div id="supNameSuggest" class="nameSuggest hidden" role="listbox"></div>
        </div>

        <div class="supVinRow">
          <div class="supVinWrap">
            <input id="supVin" type="text" placeholder="Buscar por VIN..." />
          </div>

          <button id="btnSupQR" type="button" title="Escanear VIN con cámara">📷</button>
        </div>

        <div class="twoWide">
          <input id="supFrom" type="date" />
          <input id="supTo" type="date" />
        </div>

        <input id="supMonth" type="month" placeholder="Mes (YYYY-MM)" />

        <div class="twoWide">
          <button id="btnSupApply">Aplicar filtros</button>
          <button id="btnSupClear">Limpiar</button>
        </div>
      </div>

      <div id="supSummary" class="small" style="margin-top:10px;"></div>
      <div id="supTable" style="margin-top:10px;"></div>
    </div>
  `;
}