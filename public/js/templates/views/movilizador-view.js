// =========================
// public/js/templates/views/movilizador-view.js
// Template HTML: vista movilizador – cartillas de navegación
// =========================

export function movilizadorView() {
  return `
    <div id="viewMOVILIZADOR" class="card" style="display:none;">

      <!-- QR Modal (siempre en DOM) -->
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

      <!-- ── Hub: cartillas ── -->
      <div id="movHub">
        <div class="movHubHeader">
          <div>
            <div class="hubGreeting" id="movGreeting">Bienvenido</div>
            <div class="hubSubtitle">Movilizador — Control de flota</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span id="movStatus" class="small muted"></span>
            <button id="btnMovRefresh" type="button" class="movRefreshBtn" title="Actualizar">↻ Actualizar</button>
          </div>
        </div>

        <div id="movOfflineBanner" class="movOfflineBanner" style="display:none;">
          📶 <strong><span id="movOfflineCount">0</span></strong> registro(s) guardados sin conexión &mdash; se sincronizarán cuando haya internet
        </div>

        <div class="hubGrid" id="movCardGrid"></div>
      </div>

      <!-- ── Screen: Lista ── -->
      <div id="movScreenLista" class="movScreen" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn movBackBtn" type="button">← Volver</button>
          <span class="adminDetailTitle">📋 Lista del día</span>
        </div>

        <div class="movSearchRow">
          <div class="vinWrap" style="flex:1;">
            <input id="movPendientesSearch" type="search" placeholder="Buscar VIN…"
              class="movVinInput" autocomplete="off" autocapitalize="characters" spellcheck="false" />
          </div>
          <button id="btnMovQrPendientes" type="button" class="movQrBtn" title="Escanear QR">📷</button>
          <button id="btnMovGuardarLista" type="button" class="movDownloadBtn" title="Guardar lista en el celular">💾</button>
        </div>

        <div id="movPendientesQrCard" class="movPendientesQrCard" style="display:none;">
          <div class="movPendientesQrTop">
            <span id="movPendientesQrVin" class="movVin" style="font-size:1rem;font-family:monospace;"></span>
            <span id="movPendientesQrUbic" class="small muted"></span>
          </div>
          <div class="movPendientesQrMsg" id="movPendientesQrMsg"></div>
          <div class="movPendientesConfirmBtns" id="movPendientesQrConfirmBtns" style="display:none;">
            <button id="btnMovPendientesConfirmarQr" class="movBtnFull movBtnEntrada" type="button" data-vin="">✅ Confirmar ingreso</button>
            <button id="btnMovPendientesCancelarQr" type="button" class="movBtnCancelSm">✕ No</button>
          </div>
        </div>

        <div id="movCacheBanner" class="movCacheBanner" style="display:none;"></div>
        <div id="movPendientesSubHdr" class="movPendientesSubHdr"></div>
        <div id="movPendientesBody" class="movPendientesBody"></div>
      </div>

      <!-- ── Screen: Ingreso ── -->
      <div id="movScreenIngreso" class="movScreen" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn movBackBtn" type="button">← Volver</button>
          <span class="adminDetailTitle">📥 Ingreso</span>
        </div>

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

      <!-- ── Screen: Zona de Espera ── -->
      <div id="movScreenEspera" class="movScreen" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn movBackBtn" type="button">← Volver</button>
          <span class="adminDetailTitle">🔧 Zona de Espera</span>
        </div>

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

      <!-- ── Screen: Salida ── -->
      <div id="movScreenSalida" class="movScreen" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn movBackBtn" type="button">← Volver</button>
          <span class="adminDetailTitle">📤 Salida</span>
        </div>

        <div class="movRegBox">
          <div class="movRegTitle">Registrar Salida</div>
          <div class="movRegHint">Busca el VIN para confirmar la salida</div>
          <div class="movVinRow">
            <div class="vinWrap">
              <input id="movSalidaVinSearch" type="text"
                placeholder="Buscar VIN…" class="movVinInput"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
              <div id="movSalidaVinSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnMovQrSalida" type="button" class="movQrBtn" title="Escanear QR">📷</button>
          </div>
        </div>

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

      <!-- ── Screen: Mapa de Zonas ── -->
      <div id="movScreenMapa" class="movScreen" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn movBackBtn" type="button">← Volver</button>
          <span class="adminDetailTitle">🗺️ Mapa de Zonas</span>
        </div>
        <div class="zonasMapaBar">
          <span class="zonasMapaTs" id="movZonasMapaTs"></span>
          <button class="zonasMapaRefreshBtn" id="movZonasMapaRefreshBtn" type="button">↻ Actualizar</button>
        </div>
        <div id="movZonasMapaContainer"></div>
      </div>

    </div>
  `;
}
