// public/js/templates/modals/incidencias-modal.js
export function incidenciasModal() {
  return `
    <!-- =========================
        MODAL INCIDENCIAS
        ========================= -->
    <div id="incModal" class="modal" aria-hidden="true">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">Registro de incidencias</div>
          <button id="btnCloseInc" title="Cerrar">✕</button>
        </div>

        <div class="modalBody">
          <div class="small" id="incInfo" style="opacity:.85; margin-bottom:10px;"></div>

          <div class="card" style="border:1px solid rgba(255,255,255,.16);">
            <div style="font-weight:900; margin-bottom:8px;">Selecciona técnico y severidad</div>

            <label class="small" style="display:block; margin-top:8px;">Técnico</label>

            <div class="supNameWrap" style="margin-top:10px;">
              <input id="incTechInput" type="text" placeholder="Buscar técnico..." autocomplete="off" />
              <div id="incTechSuggest" class="nameSuggest hidden" role="listbox"></div>
            </div>

            <select id="incTech" style="display:none;"></select>

            <label class="small" style="display:block; margin-top:10px;">Tipo de incidencia</label>
            <select id="incTipo" style="width:100%; height:44px;">
              <option value="">Selecciona tipo</option>
              <option value="LEVE">Incidencia leve</option>
              <option value="MODERADA">Incidencia moderada</option>
              <option value="CRITICA">Incidencia crítica</option>
            </select>

            <label class="small" style="display:block; margin-top:10px;">Nota (opcional)</label>
            <textarea id="incNota" rows="2" placeholder="Describe brevemente la incidencia..."
              style="width:100%;"></textarea>

            <label class="small" style="display:block; margin-top:10px;">Foto de incidencia (opcional)</label>

            <div class="incFotoWrap" style="margin-top:8px;">
              <input
                id="incFotoInput"
                type="file"
                accept="image/*"
                capture="environment"
                style="width:100%;"
              />

              <div id="incFotoPreviewWrap" class="hidden" style="margin-top:10px;">
                <div class="thumb" style="max-width:220px;">
                  <img
                    id="incFotoPreview"
                    alt="Preview incidencia"
                    style="width:100%; height:auto; display:block; border-radius:8px;"
                  />
                </div>

                <button
                  type="button"
                  id="btnIncFotoClear"
                  class="btn3"
                  style="margin-top:8px;"
                >
                  🧹 Quitar foto
                </button>
              </div>
            </div>
          </div>

          <button id="btnIncSave" class="btnInicio"
            style="margin-top:12px; width:100%; height:64px; font-weight:1000;" disabled>
            Guardar incidencia
          </button>

          <div id="incMsg" class="small" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  `;
}