// =========================
// public/js/templates/views/consulta-view.js
// Template HTML: Consulta de VIN — ficha de un carro dentro de la app.
//
// La versión de dentro de /invitado: mismo veredicto, pero con el detrás
// (zona, técnicos, tiempos) para quien tiene rol para verlo.
// =========================

export function consultaView() {
  return `
    <div id="viewCONSULTA" class="card" style="display:none;">

      <div class="adminDetailHead">
        <span class="adminDetailTitle">🔎 Consulta de VIN</span>
      </div>

      <div class="cqModos">
        <button class="cqModoBtn activo" id="btnCqModoUno"   type="button">Un carro</button>
        <button class="cqModoBtn"        id="btnCqModoLista" type="button">Pegar lista</button>
      </div>

      <div id="cqBloqueUno" class="cqSearchRow">
        <div class="vinWrap" style="flex:1;">
          <input id="cqVin" type="search" placeholder="Buscar VIN…"
            class="movVinInput" autocomplete="off" autocapitalize="characters"
            spellcheck="false" aria-label="VIN del vehículo">
          <div id="cqVinSuggest" class="vinSuggest hidden" role="listbox"></div>
        </div>
        <button id="btnCqQr" type="button" class="movQrBtn" title="Escanear QR">📷</button>
      </div>

      <div id="cqBloqueLista">
        <textarea id="cqVinsLista" class="cqTextarea" spellcheck="false" aria-label="Lista de VINs"
          placeholder="Pegue aquí los VIN, uno por línea.&#10;Da igual si vienen con comas, tabulaciones o texto de más."></textarea>
        <button id="btnCqLista" type="button" class="cqBtnLista">Consultar lista</button>
      </div>

      <div id="cqAviso" class="cqAviso"></div>

      <div id="cqResultadoLista" style="display:none;"></div>

      <div id="cqResultado" style="display:none;">

        <div class="cqVeredicto" id="cqVeredicto">
          <span class="cqVin" id="cqRVin"></span>
          <span class="cqTitulo" id="cqTitulo"></span>
          <span class="cqDetalle" id="cqDetalle"></span>
        </div>

        <div class="cqChips" id="cqChips"></div>

        <div class="cqFicha" id="cqFicha"></div>

        <!-- Detalle: solo supervisor y admin. El JS lo rellena o lo deja
             vacío según el rol; la plantilla no decide nada. -->
        <div id="cqDetalleBloque"></div>
      </div>

    </div>
  `;
}
