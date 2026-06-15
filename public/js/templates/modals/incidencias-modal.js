// =========================
// public/js/templates/modals/incidencias-modal.js
// Template HTML: modal de registro de incidencias
// =========================

const INC_TITULOS = [
  "FALTA MARCAR AJUSTAR COMPONENTES",
  "CABLEADO",
  "CINTILLOS",
  "MANGUERA",
  "CAÑERIA",
  "REDUCTOR",
  "FILTRO DE GAS",
  "SENSOR MAP",
  "EMULACIÓN INVERTIDA",
  "CONECTORES INVERTIDOS",
  "DOCUMENTO OT INCOMPLETA",
  "PERFORACIÓN INCORRECTA",
  "GRAPAS",
  "FUGA DE GAS",
  "TOMA DE CARGA",
  "TANQUE MAL INSTALADO",
  "DAÑO ESTÉTICO",
  "SIN PINTURA O ANTICORROSIVO",
  "TANQUE SIN GAS",
  "HERMETICIDAD",
  "CABLE DE BUJÍAS",
  "SUCCION DE AIRE POR EL MULTIPLE",
  "OTRO",
];

export { INC_TITULOS };

export function incidenciasModal() {
  const tituloOpts = INC_TITULOS.map(t =>
    `<option value="${t}">${t}</option>`
  ).join("");

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
            <div style="font-weight:900; margin-bottom:8px;">Selecciona técnico, tipo y gravedad</div>

            <label class="small" style="display:block; margin-top:8px;">Técnico</label>

            <div class="supNameWrap" style="margin-top:10px;">
              <input id="incTechInput" type="text" placeholder="Buscar técnico..." autocomplete="off" />
              <div id="incTechSuggest" class="nameSuggest hidden" role="listbox"></div>
            </div>

            <select id="incTech" style="display:none;"></select>

            <label class="small" style="display:block; margin-top:10px;">Tipo de incidencia</label>
            <select id="incTitulo" class="incSelect" style="width:100%; height:44px;">
              <option value="">— Selecciona tipo —</option>
              ${tituloOpts}
            </select>

            <label class="small" style="display:block; margin-top:10px;">Gravedad</label>
            <div class="incGravedadGroup" style="margin-top:6px;">
              <label class="incGravedadBtn">
                <input type="radio" name="incGravedad" value="LEVE"> <span>🟡 Leve</span>
              </label>
              <label class="incGravedadBtn">
                <input type="radio" name="incGravedad" value="MODERADA"> <span>🟠 Moderada</span>
              </label>
              <label class="incGravedadBtn">
                <input type="radio" name="incGravedad" value="CRITICA"> <span>🔴 Crítica</span>
              </label>
            </div>

            <label class="small" style="display:block; margin-top:10px;">Nota adicional (opcional)</label>
            <textarea id="incNota" rows="2" placeholder="Detalle adicional..." style="width:100%;"></textarea>

            <!-- =========================
                 FOTO INCIDENCIA
                 ========================= -->
            <label class="small" style="display:block; margin-top:10px;">Foto de incidencia (opcional)</label>

            <div class="incFotoWrap" style="margin-top:8px;">
              <!-- inputs ocultos -->
              <!-- capture="environment" = cámara trasera en iOS/Android -->
              <input id="incFotoCam" type="file" accept="image/*" capture="environment" style="display:none;" />
              <input id="incFotoFile" type="file" accept="image/*" style="display:none;" />

              <!-- 3 botones en una fila -->
              <div class="row" style="gap:10px; flex-wrap:nowrap; margin-top:8px; align-items:center;">
                <button type="button" id="btnIncFotoCam" class="btn3" style="flex:1; white-space:nowrap;">
                  📷 Foto
                </button>

                <button type="button" id="btnIncFotoFile" class="btn3" style="flex:1; white-space:nowrap;">
                  📁 Cargar
                </button>

                <button type="button" id="btnIncFotoClear" class="btn3" style="flex:1; white-space:nowrap;">
                  🗑️ Borrar
                </button>
              </div>

              <!-- preview (solo una vez) -->
              <div id="incFotoPreviewWrap" class="hidden" style="margin-top:10px;">
                <div class="thumb" style="max-width:220px;">
                  <img
                    id="incFotoPreview"
                    alt="Preview incidencia"
                    style="width:100%; height:auto; display:block; border-radius:8px;"
                  />
                </div>
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