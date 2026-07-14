// public/js/templates/views/supervisor-view.js
import { icon } from "../../core/icons.js";

export function supervisorView() {
  return `
    <div id="viewSUPERVISOR" class="card" style="display:none;">
      <h3>Supervisor</h3>

      <!-- Pestañas principales: REPORTE / LIVE / UBICACIONES / INCIDENCIAS / LISTA -->
      <div class="sup-tab-row">
        <button type="button" class="btn sup-tab" data-suptab="REPORTE">${icon("chart", 14)} REPORTE</button>
        <button type="button" class="btn sup-tab active" data-suptab="LIVE">${icon("radio", 14)} LIVE</button>
        <button type="button" class="btn sup-tab" data-suptab="UBICACIONES">${icon("mapPin", 14)} UBIC.</button>
        <button type="button" class="btn sup-tab" data-suptab="INCIDENCIAS">${icon("alertTriangle", 14)} INCID.</button>
        <button type="button" class="btn sup-tab" data-suptab="VALIDAR">${icon("scanSearch", 14)} VALIDAR</button>
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
            <button id="btnSupQR" type="button" title="Escanear VIN con cámara">${icon("camera", 16)}</button>
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
          <div style="text-align:right;margin-top:4px;">
            <button id="btnSupExportCsv" type="button" class="btn3" title="Exportar tabla actual como CSV">${icon("download", 14)} Exportar CSV</button>
          </div>
        </div>

        <div id="supAvgCard" style="margin-top:10px;"></div>

        <!-- Panel visual: gráficos del reporte (estilo Power BI) -->
        <div id="supDashboard" style="display:none;"></div>

        <!-- Panel de KPIs -->
        <div id="supKPIsWrap">
          <button id="btnVerKPIs" type="button" class="btn-ver-kpis" style="display:none;">${icon("chart", 14)} VER KPIS</button>
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

        <!-- Mapa de zonas de conversión (solo lectura) -->
        <div class="movPanel open" id="ubPanelZonas" style="margin-top:10px;">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">🗺️</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Mapa de Zonas de Conversión</span>
              <span class="movPanelHint">Estado en tiempo real de las 15 zonas</span>
            </div>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div class="movPanelBody" style="padding:8px 12px 12px;">
            <div class="zonasMapaBar">
              <span class="zonasMapaTs" id="supZonasMapaTs"></span>
              <button class="zonasMapaRefreshBtn" id="supZonasMapaRefreshBtn" type="button">↻</button>
            </div>
            <div id="supZonasMapaContainer"></div>
          </div>
        </div>

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

      <!-- ══════════════════════════════════════════════
           PANEL INCIDENCIAS — Reporte global
      ══════════════════════════════════════════════ -->
      <div id="supPanelIncidencias" style="display:none;">

        <!-- Barra de filtros -->
        <div class="inc-rep-filters" style="margin-top:10px;">
          <div class="supDateRow">
            <input id="incRepFrom" type="date" title="Desde" />
            <input id="incRepTo" type="date" title="Hasta" />
            <button id="btnIncRepHoy" type="button" class="btn3">HOY</button>
            <button id="btnIncRepMes" type="button" class="btn3">MES</button>
          </div>

          <div class="inc-rep-tipo-row" style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            <button type="button" class="btn3 inc-rep-tipo active" data-tipo="ALL">TODOS</button>
            <button type="button" class="btn3 inc-rep-tipo" data-tipo="CRITICA" style="border-color:rgba(248,113,113,.6);">🔴 CRÍTICA</button>
            <button type="button" class="btn3 inc-rep-tipo" data-tipo="MODERADA" style="border-color:rgba(251,146,60,.6);">🟠 MODERADA</button>
            <button type="button" class="btn3 inc-rep-tipo" data-tipo="LEVE" style="border-color:rgba(250,204,21,.6);">🟡 LEVE</button>
          </div>

          <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
            <input id="incRepQ" type="text" placeholder="Buscar por VIN, técnico o nota..." autocomplete="off" style="flex:1;" />
            <button id="btnIncRepApply" type="button" class="btn">Buscar</button>
            <button id="btnIncRepExport" type="button" class="btn3" title="Descargar CSV">⬇️ CSV</button>
          </div>
        </div>

        <!-- KPI pills -->
        <div id="incRepKpis" style="display:none; margin-top:12px;"></div>

        <!-- Ranking tables -->
        <div id="incRepRanking" style="display:none; margin-top:10px;"></div>

        <!-- Lista de incidencias -->
        <div id="incRepList" style="margin-top:10px;"></div>
      </div>

      <!-- ══════════════════════════════════════════════
           PANEL VALIDAR — Verificar si un VIN está registrado
      ══════════════════════════════════════════════ -->
      <div id="supPanelValidar" style="display:none;">
        <div style="margin-top:10px;">
          <p class="small muted" style="margin-bottom:12px;">Verifica si un vehículo está registrado en el sistema para conversión.</p>

          <div class="supVinRow">
            <div class="supVinWrap">
              <input id="supValidarVin" type="text" placeholder="Buscar VIN…"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
              <div id="supValidarVinSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnSupValidarQr" type="button" title="Escanear QR">${icon("camera", 16)}</button>
          </div>

          <button id="btnSupValidarBuscar" type="button" class="btn" style="margin-top:10px; width:100%;">
            ${icon("scanSearch", 15)} Validar VIN
          </button>

          <div id="supValidarResult" style="margin-top:14px;"></div>
        </div>
      </div>
    </div>
  `;
}

// QR modal exclusivo del tab VALIDAR — fuera de viewSUPERVISOR para evitar
// el bug de WebKit donde position:fixed en un padre display:none infla el scroll
export function supValidarQrModalTemplate() {
  return `
    <div id="supValidarQrModal" class="modal" aria-hidden="true" style="display:none;">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Escanear QR — Validar VIN</div>
          <button id="btnSupValidarCloseQr" type="button" title="Cerrar">✕</button>
        </div>
        <div class="modalBody">
          <div id="supValidarQrReader"></div>
          <div id="supValidarQrMsg" class="small" style="margin-top:10px;"></div>
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