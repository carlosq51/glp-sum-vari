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

      <!-- Panel 1: Conversión Finalizada – pendientes de traslado -->
      <div class="movPanel open" id="movPanel1">
        <button class="movPanelHeader" type="button" aria-expanded="true">
          <span class="movPanelIcon">⚙️</span>
          <span class="movPanelTitle">Conversión Finalizada</span>
          <span class="movPanelHint">Pendientes de traslado</span>
          <span id="movBadge1" class="movBadge movBadgeWarn" aria-label="Pendientes" style="display:none;"></span>
          <span class="movChevron" aria-hidden="true">▼</span>
        </button>
        <div id="movPanel1Body" class="movPanelBody"></div>
      </div>

      <!-- Panel 2: En zona de calidad / espera -->
      <div class="movPanel open" id="movPanel2">
        <button class="movPanelHeader" type="button" aria-expanded="true">
          <span class="movPanelIcon">🔍</span>
          <span class="movPanelTitle">En Zona de Calidad</span>
          <span class="movPanelHint">Esperando revisión</span>
          <span id="movBadge2" class="movBadge movBadgeNote" aria-label="En calidad" style="display:none;"></span>
          <span class="movChevron" aria-hidden="true">▼</span>
        </button>
        <div id="movPanel2Body" class="movPanelBody"></div>
      </div>

      <!-- Panel 3: Listos para salir -->
      <div class="movPanel open" id="movPanel3">
        <button class="movPanelHeader" type="button" aria-expanded="true">
          <span class="movPanelIcon">✅</span>
          <span class="movPanelTitle">Listos para Salir</span>
          <span class="movPanelHint">Calidad finalizada</span>
          <span id="movBadge3" class="movBadge movBadgeOk" aria-label="Listos" style="display:none;"></span>
          <span class="movChevron" aria-hidden="true">▼</span>
        </button>
        <div id="movPanel3Body" class="movPanelBody"></div>
      </div>

    </div>
  `;
}
