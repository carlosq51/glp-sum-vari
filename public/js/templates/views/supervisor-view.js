// public/js/templates/views/supervisor-view.js
export function supervisorView() {
  return `
    <div id="viewSUPERVISOR" class="card" style="display:none;">
      <h3>Supervisor</h3>

      <!-- Pestañas principales: REPORTE / LIVE / UBICACIONES -->
      <div class="sup-tab-row">
        <button type="button" class="btn sup-tab" data-suptab="REPORTE">📊 REPORTE</button>
        <button type="button" class="btn sup-tab active" data-suptab="LIVE">🔴 LIVE</button>
        <button type="button" class="btn sup-tab" data-suptab="UBICACIONES">📍 UBICACIONES</button>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL REPORTE (contenido anterior)
      ══════════════════════════════════════════════ -->
      <div id="supPanelReporte" style="display:none;">
        <div class="small" style="margin-top:6px;">Filtros opcionales: nombre/email, fechas o mes.</div>

        <div class="supTrackRow">
          <button type="button" class="btn" data-suptrack="CONVERSION">CONVERSIÓN</button>
          <button type="button" class="btn" data-suptrack="CALIDAD">CALIDAD</button>
          <button type="button" class="btn" data-suptrack="RAMAL">RAMAL</button>
        </div>
        <div id="supTrackPill" class="pill small" style="text-align:center;">
          CONVERSIÓN (MOTOR + TANQUE)
        </div>

        <div class="fullStack" style="margin-top:10px;">
          <div class="supNameWrap" style="display:flex; gap:10px; align-items:center;">
            <input id="supName" type="text" placeholder="Buscar por nombre o email..." autocomplete="off" style="flex:1;" />
            <select id="supMarca" title="Filtrar por marca" style="width:140px;height:44px;border-radius:14px;padding:0 10px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.18);color:#fff;font-weight:800;outline:none;">
              <option value="ALL">TODOS</option>
              <option value="KYC">KYC</option>
              <option value="JETOUR">JETOUR</option>
              <option value="VW">VOLKSWAGEN</option>
            </select>
            <div id="supNameSuggest" class="nameSuggest hidden" role="listbox"></div>
          </div>

          <div class="supVinRow">
            <div class="supVinWrap">
              <input id="supVin" type="text" placeholder="Buscar por VIN..." autocomplete="off" />
              <div id="supVinSuggest" class="vinSuggest hidden" role="listbox"></div>
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

        <!-- Panel de KPIs -->
        <div id="supKPIsWrap">
          <button id="btnVerKPIs" type="button" class="btn-ver-kpis" style="display:none;">📊 VER KPIS</button>
          <div id="supKPIsPanel" style="display:none;"></div>
        </div>

        <!-- Gráfico de tendencias (solo cuando hay técnico seleccionado) -->
        <div id="supTrendContainer" style="display:none; margin-top:20px; background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.08)); border:1px solid rgba(255,255,255,.18); border-radius:18px; padding:20px;">
          <canvas id="supTrendChart" style="width:100%; height:400px;"></canvas>
        </div>

        <div id="supSummary" class="small" style="margin-top:10px;"></div>
        <div id="supTable" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL LIVE
      ══════════════════════════════════════════════ -->
      <div id="supPanelLive" style="display:none;">
        <div id="liveContainer" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL UBICACIONES (solo lectura, datos del movilizador)
      ══════════════════════════════════════════════ -->
      <div id="supPanelUbicaciones" style="display:none;">
        <div class="live-refresh-bar" style="margin-top:10px;">
          <span class="live-fecha small">📅 Estado de traslados</span>
          <span id="ubLastUpdate" class="live-last-update small"></span>
          <button type="button" id="btnUbRefresh" class="live-refresh-btn" title="Actualizar ahora">↻</button>
        </div>
        <div id="ubError" class="small" style="color:#f87171;"></div>

        <!-- Panel 0: En espera de conversión -->
        <div class="movPanel open" id="ubPanel0">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">🚗</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">En Espera de Conversión</span>
              <span class="movPanelHint">Ingresados al taller, pendientes de conversión</span>
            </div>
            <span id="ubBadge0" class="movBadge movBadgeWarn" style="display:none;"></span>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="ubPanel0Body" class="movPanelBody"></div>
        </div>

        <!-- Panel 1: Conversión finalizada -->
        <div class="movPanel open" id="ubPanel1">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">⚙️</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Conversión Finalizada</span>
              <span class="movPanelHint">Pendientes de traslado a zona de espera</span>
            </div>
            <span id="ubBadge1" class="movBadge movBadgeWarn" style="display:none;"></span>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="ubPanel1Body" class="movPanelBody"></div>
        </div>

        <!-- Panel 2: Zona de espera -->
        <div class="movPanel open" id="ubPanel2">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">🕐</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Zona de Espera</span>
              <span class="movPanelHint">En espera o en revisión técnica</span>
            </div>
            <span id="ubBadge2" class="movBadge movBadgeNote" style="display:none;"></span>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="ubPanel2Body" class="movPanelBody"></div>
        </div>

        <!-- Panel 3: Revisión finalizada -->
        <div class="movPanel open" id="ubPanel3">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">✅</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Revisión Técnica Finalizada</span>
              <span class="movPanelHint">Listo para trasladar a otras áreas</span>
            </div>
            <span id="ubBadge3" class="movBadge movBadgeOk" style="display:none;"></span>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="ubPanel3Body" class="movPanelBody"></div>
        </div>
      </div>
    </div>
  `;
}

// Modal global — usado tanto en Supervisor como en Calidad
export function supIncModal() {
  return `
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
  `;
}

// Modal detalle LIVE — detalle del día de un técnico
export function liveDetailModal() {
  return `
    <div id="liveDetailModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div id="liveDetailTitle" class="modalTitle">Detalle del día</div>
          <button id="btnCloseLiveDetail" title="Cerrar">✕</button>
        </div>
        <div id="liveDetailBody" class="modalBody live-detail-body"></div>
      </div>
    </div>
  `;
}