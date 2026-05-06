// =========================
// public/js/templates/views/calidad-view.js
// Template HTML: vista control de calidad
// =========================

export function calidadView() {
  return `
    <!-- =========================
         CALIDAD
         ========================= -->
    <div id="viewCALIDAD" style="display:none;">
      <div class="card">
        <h3>Control de Calidad</h3>

        <div class="fullStack" style="margin-top:10px;">
          <div class="vinRow3">
            <div class="vinWrap">
              <input id="vinQ" placeholder="Ingresa VIN o escanea QR" />
              <div id="vinSuggestQ" class="vinSuggest hidden" role="listbox"></div>
            </div>

            <button id="btnQRQ" title="Escanear QR">📷</button>

            <button id="btnEstadoQ" title="Busca la OT por VIN o la crea si no existe">
              Buscar / Crear
            </button>
          </div>

          <div class="twoWide">
            <button id="btnFinalizadosQ">Ver finalizados</button>
            <button id="btnActivasQ" title="Refrescar conversiones">🔄 <span>Refrescar</span></button>
          </div>

          <button id="btnSugQ" class="btn3" title="Ver los 3 carros más antiguos en zona de espera sin iniciar revisión">
            💡 Sugerencias de la cola
          </button>
        </div>

        <div id="estadoBoxQ" class="small"></div>
        <div id="activasBoxQ"></div>

        <div id="finalizadosWrapQ" style="display:none; margin-top:12px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBoxQ"></div>
        </div>
      </div>
    </div>

    <!-- Modal sugerencias calidad -->
    <div id="calSugModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="calSugTitle" aria-hidden="true">
      <div class="modalBox" style="max-width:360px;">
        <div class="modalHeader">
          <span id="calSugTitle" class="modalTitle">💡 Cola de espera</span>
          <button type="button" class="modalClose" id="btnCalSugClose" aria-label="Cerrar">✕</button>
        </div>
        <div class="modalBody">
          <p class="small muted" style="margin:0 0 10px;">Los <b>3 carros más antiguos</b> en zona de espera sin revisión iniciada:</p>
          <div id="calSugBody"></div>
        </div>
      </div>
    </div>
  `;
}