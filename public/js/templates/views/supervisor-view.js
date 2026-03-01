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
        <div class="supNameWrap" style="display:flex; gap:10px; align-items:center;">
          <input id="supName" type="text" placeholder="Buscar por nombre o email..." autocomplete="off" style="flex:1;" />

          <select id="supMarca" title="Filtrar por marca" style="
            width:140px;
            height:44px;
            border-radius:14px;
            padding:0 10px;
            background: rgba(0,0,0,.25);
            border:1px solid rgba(255,255,255,.18);
            color: #fff;
            font-weight:800;
            outline:none;
          ">
            <option value="ALL">TODOS</option>
            <option value="KYC">KYC</option>
            <option value="JETOUR">JETOUR</option>
            <option value="VW">VOLKSWAGEN</option>
          </select>

          <div id="supNameSuggest" class="nameSuggest hidden" role="listbox"></div>
        </div>

        <div class="supVinRow">
          <div class="supVinWrap">
            <input id="supVin" type="text" placeholder="Buscar por VIN..." />
          </div>

          <button id="btnSupQR" type="button" title="Escanear VIN con cámara">📷</button>
        </div>

        <div class="supDateRow">
          <input id="supFrom" type="date" />
          <input id="supTo" type="date" />
          <button id="btnSupAyer" type="button" class="btn3" title="Rango: Ayer">AYER</button>
          <button id="btnSupHoy" type="button" class="btn3" title="Rango: Hoy">HOY</button>
        </div>

        <div class="row" style="gap:10px; align-items:center;">
          <input id="supMonth" type="month" placeholder="Mes (YYYY-MM)" style="flex:1;" />
          <button id="btnSupEsteMes" type="button" class="btn3" title="Filtrar por este mes">ESTE MES</button>
        </div>

        <div class="twoWide">
          <button id="btnSupApply">Aplicar filtros</button>
          <button id="btnSupClear">Limpiar</button>
        </div>
      </div>

      <div id="supAvgCard" style="margin-top:10px;"></div>
      <div id="supSummary" class="small" style="margin-top:10px;"></div>
      <div id="supTable" style="margin-top:10px;"></div>
          <!-- =========================
         MODAL: INCIDENCIAS (LISTA)
         ========================= -->
      <div id="supIncModal" class="modal" aria-hidden="true">
        <div class="modalBox">
          <div class="modalHead">
            <div class="modalTitle">Incidencias registradas</div>
            <button id="btnCloseSupInc" title="Cerrar">✕</button>
          </div>

          <div class="modalBody">
            <div id="supIncInfo" class="small" style="opacity:.9; margin-bottom:10px;"></div>
            <div id="supIncList"></div>
            <div id="supIncMsg" class="small" style="margin-top:10px;"></div>
          </div>
        </div>
      </div>
      
    </div>
  `;
}