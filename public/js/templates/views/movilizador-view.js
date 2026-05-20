// =========================
// public/js/templates/views/movilizador-view.js
// Template HTML: vista movilizador – 3 paneles de flujo
// =========================

export function movilizadorView() {
  return `
    <div id="viewMOVILIZADOR" class="card" style="display:none;">

      <!-- Header -->
      <div class="movHeader">
        <h3>Movilizador</h3>
        <div class="movHeaderActions">
          <span id="movStatus" class="small muted"></span>
          <button id="btnMovRefresh" type="button" class="movRefreshBtn" title="Actualizar">↻ Actualizar</button>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="movTabBar" role="tablist">
        <button class="movTab active" data-tab="entrada" role="tab" aria-selected="true">
          <span class="movTabIcon">📥</span>
          <span class="movTabLabel">Entrada</span>
          <span id="movBadge0"     class="movBadge movBadgeWarn"  style="display:none;"></span>
          <span id="movBadge0conv" class="movBadge movBadgeNote"  style="display:none;"></span>
        </button>
        <button class="movTab" data-tab="espera" role="tab" aria-selected="false">
          <span class="movTabIcon">🔧</span>
          <span class="movTabLabel">Zona de Espera</span>
          <span id="movBadge1" class="movBadge movBadgeWarn" style="display:none;"></span>
          <span id="movBadge2" class="movBadge movBadgeNote" style="display:none;"></span>
        </button>
        <button class="movTab" data-tab="salida" role="tab" aria-selected="false">
          <span class="movTabIcon">📤</span>
          <span class="movTabLabel">Salida</span>
          <span id="movBadge3" class="movBadge movBadgeOk" style="display:none;"></span>
        </button>
      </div>

      <!-- QR Modal -->
      <div id="movQrModal" class="modal" aria-hidden="true" style="display:none;">
        <div class="modalBox">
          <div class="modalHead">
            <div class="modalTitle">Escanear QR / Código de Barras</div>
            <button id="btnMovCloseQr" type="button" title="Cerrar">✕</button>
          </div>
          <div class="modalBody">
            <div id="movQrReader"></div>
            <div id="movQrMsg" class="small" style="margin-top:10px;"></div>
          </div>
        </div>
      </div>

      <!-- ── Tab: ENTRADA ── -->
      <div class="movTabPanel" data-panel="entrada">

        <div class="movRegBox">
          <div class="movRegTitle">Registrar Ingreso</div>
          <div class="movRegHint">Marca el vehículo como <strong>En Espera Conversión</strong></div>
          <div class="movVinRow">
            <div class="vinWrap">
              <input id="movVinEntrada" type="text"
                placeholder="Buscar VIN…" class="movVinInput"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
              <div id="movVinEntradaSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnMovQrEntrada" type="button" class="movQrBtn" title="Escanear QR">📷</button>
          </div>
          <button id="btnMovRegistrarEntrada" class="movBtnFull movBtnEntrada" type="button" disabled>
            Registrar Ingreso ▶
          </button>
        </div>

        <div class="movPanel open" id="movPanel0">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">🚗</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Vehículos Ingresados</span>
              <span class="movPanelHint">En espera de conversión o en proceso</span>
            </div>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="movPanel0Body" class="movPanelBody"></div>
        </div>

      </div>

      <!-- ── Tab: ZONA DE ESPERA ── -->
      <div class="movTabPanel" data-panel="espera" style="display:none;">

        <div class="movPanel open" id="movPanel1">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">⚙️</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Conversión Finalizada</span>
              <span class="movPanelHint">Pendientes de traslado a zona de espera</span>
            </div>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="movPanel1Body" class="movPanelBody"></div>
        </div>

        <div class="movPanel open" id="movPanel2">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">🕐</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">En Zona de Espera</span>
              <span class="movPanelHint">Convertidos · esperando revisión o en proceso</span>
            </div>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="movPanel2Body" class="movPanelBody"></div>
        </div>

      </div>

      <!-- ── Tab: SALIDA ── -->
      <div class="movTabPanel" data-panel="salida" style="display:none;">

        <div class="movPanel open" id="movPanel3">
          <button class="movPanelHeader" type="button" aria-expanded="true">
            <span class="movPanelIcon">✅</span>
            <div class="movPanelTitleGroup">
              <span class="movPanelTitle">Revisión Técnica Finalizada</span>
              <span class="movPanelHint">Confirmar salida y registrar en app GPS</span>
            </div>
            <span class="movChevron" aria-hidden="true">▼</span>
          </button>
          <div id="movPanel3Body" class="movPanelBody"></div>
        </div>

      </div>

    </div>
  `;
}
