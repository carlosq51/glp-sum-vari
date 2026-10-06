// =========================
// public/js/templates/views/movilizador-view.js
// Template HTML: vista movilizador – cartillas de navegación
// =========================

import { icon } from "../../core/icons.js";

/** Cabecera de cada pantalla: volver + chip de icono tintado + título y bajada. */
function screenHead_(iconName, tone, title, sub) {
  return `
    <div class="adminDetailHead movScreenHead">
      <button class="adminBackBtn movBackBtn" type="button">${icon("chevronLeft", 16)} Volver</button>
      <span class="adminDetailIcon" style="--tone:${tone}" aria-hidden="true">${icon(iconName, 20)}</span>
      <div class="adminDetailText">
        <span class="adminDetailTitle">${title}</span>
        ${sub ? `<span class="adminDetailSub">${sub}</span>` : ""}
      </div>
    </div>`;
}

/** Sí / No de la app GPS (Entrada y Salida comparten la preferencia). */
function redirRow_() {
  return `
    <div class="movRedirRow">
      <span class="movRedirLabel">${icon("mapPin", 14)} Abrir app GPS al registrar</span>
      <div class="movRedirSeg" role="group" aria-label="Abrir la app GPS al registrar">
        <button type="button" class="movRedirOpt" data-val="1" aria-pressed="true">Sí</button>
        <button type="button" class="movRedirOpt" data-val="0" aria-pressed="false">No</button>
      </div>
    </div>`;
}

/** Cabecera plegable de un panel. */
function panelHead_(iconName, title, hint, hintId = "") {
  return `
    <button class="movPanelHeader" type="button" aria-expanded="true">
      <span class="movPanelIcon" aria-hidden="true">${icon(iconName, 18)}</span>
      <div class="movPanelTitleGroup">
        <span class="movPanelTitle">${title}</span>
        <span class="movPanelHint"${hintId ? ` id="${hintId}"` : ""}>${hint}</span>
      </div>
      <span class="movChevron" aria-hidden="true">${icon("chevronRight", 16)}</span>
    </button>`;
}

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

      <!-- Estado: fuera del hub para que se lea también dentro de cada pantalla -->
      <div id="movStatus" class="movStatus" aria-live="polite"></div>

      <!-- ── Hub: cartillas ── -->
      <div id="movHub">
        <div class="movHubHeader">
          <div>
            <div class="hubGreeting" id="movGreeting">Bienvenido</div>
            <div class="hubSubtitle">Movilizador · Control de flota</div>
          </div>
          <div class="movHubActions">
            <button id="btnMovRefresh" type="button" class="movRefreshBtn" title="Actualizar">${icon("refresh", 16)} Actualizar</button>
            <div class="hubAvatar" id="movAvatar" title="Foto de perfil"></div>
          </div>
        </div>

        <div id="movOfflineBanner" class="movOfflineBanner" style="display:none;">
          <strong><span id="movOfflineCount">0</span></strong> registro(s) guardados sin conexión — se sincronizarán cuando haya internet
        </div>

        <div class="hubGrid" id="movCardGrid"></div>
      </div>

      <!-- ── Screen: Lista ── -->
      <div id="movScreenLista" class="movScreen" style="display:none;">
        ${screenHead_("clipboardList", "var(--tone-slate)", "Lista del día", "Carros por traer al taller")}

        <div class="movSearchRow">
          <div class="vinWrap movSearchWrap">
            <span class="movSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
            <input id="movPendientesSearch" type="search" placeholder="Buscar VIN o zona…"
              class="movVinInput" autocomplete="off" autocapitalize="characters" spellcheck="false" />
          </div>
          <button id="btnMovQrPendientes" type="button" class="movQrBtn" title="Escanear QR">${icon("camera", 20)}</button>
          <button id="btnMovGuardarLista" type="button" class="movDownloadBtn" title="Guardar lista en el celular">${icon("download", 18)}</button>
        </div>

        <div id="movPendientesQrCard" class="movPendientesQrCard" style="display:none;">
          <div class="movPendientesQrTop">
            <span id="movPendientesQrVin" class="movVin"></span>
            <span id="movPendientesQrUbic" class="movUbic"></span>
          </div>
          <div class="movPendientesQrMsg" id="movPendientesQrMsg"></div>
          <div class="movPendientesConfirmBtns" id="movPendientesQrConfirmBtns" style="display:none;">
            <button id="btnMovPendientesConfirmarQr" class="movBtnPrimary" type="button" data-vin="">${icon("check", 16)} Confirmar ingreso</button>
            <button id="btnMovPendientesCancelarQr" type="button" class="movBtnGhost">No</button>
          </div>
        </div>

        <div id="movCacheBanner" class="movCacheBanner" style="display:none;"></div>
        <div id="movPendientesSubHdr" class="movSubHdr"></div>
        <div id="movPendientesBody" class="movPendientesBody"></div>
      </div>

      <!-- ── Screen: Ingreso ── -->
      <div id="movScreenIngreso" class="movScreen" style="display:none;">
        ${screenHead_("trayIn", "var(--tone-amber)", "Ingreso", "Carros en el taller esperando conversión")}

        <div class="movStatsRow" id="movIngresoStats">
          <div class="movStatTile movStatTile--warn">
            <span class="movStatNum" id="movStatEspera">0</span>
            <span class="movStatLabel">En espera</span>
          </div>
          <div class="movStatTile movStatTile--note">
            <span class="movStatNum" id="movStatConversion">0</span>
            <span class="movStatLabel">En conversión</span>
          </div>
          <div class="movStatTile movStatTile--total">
            <span class="movStatNum" id="movStatTotal">0</span>
            <span class="movStatLabel">Total en taller</span>
          </div>
        </div>
        <div class="movSubHdr" id="movIngresoStatsHint"></div>

        <div class="movRegBox">
          <div class="movRegTitle">Registrar ingreso</div>
          <div class="movRegHint">El carro queda <strong>En espera de conversión</strong></div>
          <div class="movVinRow">
            <div class="vinWrap">
              <input id="movVinEntrada" type="text"
                placeholder="VIN…" class="movVinInput"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
              <div id="movVinEntradaSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnMovQrEntrada" type="button" class="movQrBtn" title="Escanear QR">${icon("camera", 20)}</button>
          </div>
          ${redirRow_()}
          <button id="btnMovRegistrarEntrada" class="movBtnPrimary" type="button" disabled>
            Registrar ingreso ${icon("chevronRight", 16)}
          </button>
        </div>

        <div class="movPanel open" id="movPanel0">
          ${panelHead_("car", "En el taller", "Primero los que falta llevar a una plaza")}
          <div id="movPanel0Body" class="movPanelBody"></div>
        </div>

        <div class="movPanel" id="movPanelOlvidados" style="display:none;">
          ${panelHead_("alertTriangle", "Sin movimiento", "Registrados hace mucho y nunca cerrados", "movOlvidadosHint").replace('aria-expanded="true"', 'aria-expanded="false"')}
          <div id="movPanelOlvidadosBody" class="movPanelBody"></div>
        </div>
      </div>

      <!-- ── Screen: Pendientes de Calibración ── -->
      <div id="movScreenEspera" class="movScreen" style="display:none;">
        ${screenHead_("clock", "var(--tone-blue)", "Calibración", "Convertidos · falta calidad")}

        <div class="movSearchRow">
          <div class="vinWrap movSearchWrap">
            <span class="movSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
            <input id="movCalibSearch" type="search" placeholder="Buscar VIN…"
              class="movVinInput" autocomplete="off" autocapitalize="characters" spellcheck="false" />
            <div id="movCalibSuggest" class="vinSuggest hidden" role="listbox"></div>
          </div>
        </div>
        <div id="movCalibSubHdr" class="movSubHdr"></div>

        <div class="movPanel open" id="movPanel2">
          ${panelHead_("timer", "Esperando calidad", "El más antiguo arriba")}
          <div id="movPanel2Body" class="movPanelBody"></div>
        </div>
      </div>

      <!-- ── Screen: Salida ── -->
      <div id="movScreenSalida" class="movScreen" style="display:none;">
        ${screenHead_("trayOut", "var(--tone-lime)", "Salida", "Confirmar salida y registrar en GPS")}

        <div class="movRegBox">
          <div class="movRegTitle">Registrar salida</div>
          <div class="movRegHint">Escanea o escribe el VIN para confirmar</div>
          <div class="movVinRow">
            <div class="vinWrap">
              <input id="movSalidaVinSearch" type="text"
                placeholder="VIN…" class="movVinInput"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
              <div id="movSalidaVinSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnMovQrSalida" type="button" class="movQrBtn" title="Escanear QR">${icon("camera", 20)}</button>
          </div>
          ${redirRow_()}
        </div>

        <div id="movSalidaQrResult" class="movSalidaQrResult" style="display:none;" aria-live="polite">
          <div class="movSalidaQrResultTop">
            <div class="movSalidaQrResultMain">
              <div class="movSalidaQrResultVin" id="movSalidaQrResultVin"></div>
              <div class="movSalidaQrResultDestino" id="movSalidaQrResultDestino"></div>
              <div class="movSalidaQrResultMeta" id="movSalidaQrResultMeta"></div>
            </div>
            <button id="btnMovCloseSalidaQr" type="button" class="movQrResultClose" title="Cerrar">${icon("x", 16)}</button>
          </div>
          <button id="btnMovConfirmarSalidaQr" type="button"
            class="movBtnPrimary" data-vin="">
            Confirmar salida ${icon("chevronRight", 16)}
          </button>
          <button id="btnMovGpsSalidaQr" type="button" class="movBtnGps" data-vin="" style="display:none;">
            ${icon("mapPin", 18)} Registrar ubicación
          </button>
        </div>

        <div class="movPanel open" id="movPanel3">
          ${panelHead_("shieldCheck", "Listos para salir", "Revisión técnica finalizada")}
          <div id="movPanel3Body" class="movPanelBody"></div>
        </div>
      </div>

      <!-- ── Screen: Mapa de Zonas ── -->
      <div id="movScreenMapa" class="movScreen" style="display:none;">
        ${screenHead_("map", "var(--tone-violet)", "Mapa de zonas", "Estado en tiempo real")}
        <div class="zonasMapaBar">
          <span class="zonasMapaTs" id="movZonasMapaTs"></span>
          <button class="zonasMapaRefreshBtn" id="movZonasMapaRefreshBtn" type="button">↻ Actualizar</button>
        </div>
        <div id="movZonasMapaContainer"></div>
      </div>

    </div>
  `;
}
