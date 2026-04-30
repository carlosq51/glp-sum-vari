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

      <!-- Panel 1: Conversión Finalizada – mover a zona de espera -->
      <div class="movPanel open" id="movPanel1">
        <button class="movPanelHeader" type="button" aria-expanded="true">
          <span class="movPanelIcon">⚙️</span>
          <div class="movPanelTitleGroup">
            <span class="movPanelTitle">Conversión Finalizada</span>
            <span class="movPanelHint">Pendientes de traslado a zona de espera</span>
          </div>
          <span id="movBadge1" class="movBadge movBadgeWarn" aria-label="Pendientes" style="display:none;"></span>
          <span class="movChevron" aria-hidden="true">▼</span>
        </button>
        <div id="movPanel1Body" class="movPanelBody"></div>
      </div>

      <!-- Panel 2: Zona de espera / revisión técnica -->
      <div class="movPanel open" id="movPanel2">
        <button class="movPanelHeader" type="button" aria-expanded="true">
          <span class="movPanelIcon">🕐</span>
          <div class="movPanelTitleGroup">
            <span class="movPanelTitle">Zona de Espera</span>
            <span class="movPanelHint">En espera o en revisión técnica</span>
          </div>
          <span id="movBadge2" class="movBadge movBadgeNote" aria-label="En espera" style="display:none;"></span>
          <span class="movChevron" aria-hidden="true">▼</span>
        </button>
        <div id="movPanel2Body" class="movPanelBody"></div>
      </div>

      <!-- Panel 3: Revisión técnica finalizada – listo para traslado -->
      <div class="movPanel open" id="movPanel3">
        <button class="movPanelHeader" type="button" aria-expanded="true">
          <span class="movPanelIcon">✅</span>
          <div class="movPanelTitleGroup">
            <span class="movPanelTitle">Revisión Técnica Finalizada</span>
            <span class="movPanelHint">Listo para trasladar a otras áreas</span>
          </div>
          <span id="movBadge3" class="movBadge movBadgeOk" aria-label="Listos" style="display:none;"></span>
          <span class="movChevron" aria-hidden="true">▼</span>
        </button>
        <div id="movPanel3Body" class="movPanelBody"></div>
      </div>

    </div>
  `;
}
