// public/js/templates/views/movilizador-view.js
export function movilizadorView() {
  return `
    <div id="viewMOVILIZADOR" class="card" style="display:none;">
      <h3>Movilizador</h3>
      <div class="small">
        Se muestran solo unidades con conversión finalizada que aún no tienen registro en calidad.
      </div>

      <div class="row" style="gap:10px; margin:10px 0; flex-wrap:wrap;">
        <button id="btnMovRefresh" type="button">Actualizar</button>
      </div>

      <div id="movSummary" class="small" style="margin-top:10px;"></div>
      <div id="movTable" style="margin-top:10px;"></div>
    </div>
  `;
}