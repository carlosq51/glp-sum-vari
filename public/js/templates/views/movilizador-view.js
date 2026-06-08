// =========================
// public/js/templates/views/movilizador-view.js
// Template HTML: vista movilizador – 4 tabs de flujo
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

      <!-- Tab bar – 4 pestañas -->
      <div class="movTabBar" role="tablist">
        <button class="movTab active" data-tab="lista" role="tab" aria-selected="true">
          <span class="movTabIcon">📋</span>
          <span class="movTabLabel">Lista</span>
          <span id="movBadgeLista" class="movBadge movBadgeWarn" style="display:none;"></span>
        </button>
        <button class="movTab" data-tab="ingreso" role="tab" aria-selected="false">
          <span class="movTabIcon">📥</span>
          <span class="movTabLabel">Ingreso</span>
          <span id="movBadge0"     class="movBadge movBadgeWarn"  style="display:none;"></span>
          <span id="movBadge0conv" class="movBadge movBadgeNote"  style="display:none;"></span>
        </button>
        <button class="movTab" data-tab="espera" role="tab" aria-selected="false">
          <span class="movTabIcon">🔧</span>
          <span class="movTabLabel">Zona Espera</span>
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

      <!-- ── Tab: LISTA DIARIA ── -->
      <div class="movTabPanel" data-panel="lista">

        <!-- ── Por registrar en GLP (lista_diaria_activa) ── -->
        <div class="movPendientesBox">
          <div class="movPendientesHdr">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="movPendientesTitle">⏳ Por registrar en GLP</span>
              <span id="movBadgePendientes" class="movBadge movBadgeWarn" style="display:none;"></span>
            </div>
            <button id="btnMovQrPendientes" type="button" class="movQrBtn" title="Escanear QR para buscar en la lista">📷 QR</button>
          </div>

          <!-- QR result card -->
          <div id="movPendientesQrCard" class="movPendientesQrCard" style="display:none;">
            <div class="movPendientesQrTop">
              <span id="movPendientesQrVin" class="movVin" style="font-size:1rem;"></span>
              <span id="movPendientesQrUbic" class="small muted"></span>
            </div>
            <div class="movPendientesQrMsg" id="movPendientesQrMsg"></div>
            <div class="movPendientesConfirmBtns" id="movPendientesQrConfirmBtns" style="display:none;">
              <button id="btnMovPendientesConfirmarQr" class="movBtnFull movBtnEntrada" type="button" data-vin="">✅ Confirmar ingreso</button>
              <button id="btnMovPendientesCancelarQr" type="button" class="movBtnCancelSm">✕ No</button>
            </div>
          </div>

          <!-- Offline sync banner -->
          <div id="movOfflineBanner" class="movOfflineBanner" style="display:none;">
            📶 <strong><span id="movOfflineCount">0</span></strong> registro(s) guardados sin conexión &mdash; se sincronizarán cuando haya internet
          </div>

          <div id="movPendientesBody" class="movPendientesBody"></div>
        </div>

        <div class="movListaSep"></div>

        <div class="movListaDiariaHeader">
          <span class="movListaDiariaTitle">Vehículos del Día</span>
          <span id="movListaDiariaCount" class="movListaDiariaCount"></span>
        </div>

        <!-- Filtro por estado -->
        <div class="movListaFiltros" id="movListaFiltros">
          <button class="movFiltroBtn active" data-filtro="todos">Todos</button>
          <button class="movFiltroBtn" data-filtro="PENDIENTE_ENTRADA">Sin ingresar</button>
          <button class="movFiltroBtn" data-filtro="EN_ESPERA">En espera</button>
          <button class="movFiltroBtn" data-filtro="EN_CONVERSION">Conversión</button>
          <button class="movFiltroBtn" data-filtro="avanzados">Avanzados</button>
        </div>

        <div id="movListaDiariaBody" class="movListaDiariaBody"></div>

      </div>

      <!-- ── Tab: INGRESO ── -->
      <div class="movTabPanel" data-panel="ingreso" style="display:none;">

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
              <span class="movPanelTitle">Vehículos Ingresados Hoy</span>
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

        <!-- QR Buscar en Salida -->
        <div class="movSalidaQrBar">
          <button id="btnMovQrSalida" type="button" class="movQrBtn movSalidaQrBtnMain" title="Escanear QR para localizar vehículo">
            📷 Escanear QR
          </button>
        </div>

        <!-- Resultado de búsqueda por QR -->
        <div id="movSalidaQrResult" class="movSalidaQrResult" style="display:none;" aria-live="polite">
          <div class="movSalidaQrResultTop">
            <div>
              <div class="movSalidaQrResultVin" id="movSalidaQrResultVin"></div>
              <div class="movSalidaQrResultDestino" id="movSalidaQrResultDestino"></div>
            </div>
            <button id="btnMovCloseSalidaQr" type="button" class="movQrResultClose" title="Cerrar">✕</button>
          </div>
          <button id="btnMovConfirmarSalidaQr" type="button"
            class="movBtnAction btnConfirmarSalida movBtnFull" data-vin="">
            Confirmar Salida ▶
          </button>
        </div>

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
