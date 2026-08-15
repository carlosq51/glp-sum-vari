// =========================
// public/js/templates/views/tecnico-view.js
// Template HTML: vista técnico (conversión MOTOR/TANQUE)
// =========================

export function tecnicoView() {
  return `
    <!-- ========================= TECNICO ========================= -->
    <div id="viewTECNICO" style="display:none;">

      <!-- ── Cartillas ── -->
      <div id="tecCards" class="card">
        <div class="tecCardsHeader">
          <div>
            <div class="hubGreeting" id="tecGreeting">Bienvenido</div>
            <div class="hubSubtitle">Técnico — Conversión GLP</div>
          </div>
          <div class="hubAvatar" id="tecAvatar" title="Foto de perfil"></div>
        </div>
        <div class="hubGrid" id="tecCardGrid"></div>
      </div>

      <!-- ── Panel: Mi OT ── -->
      <div id="tecPanelMiOT" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">🔧 Mi OT</span>
        </div>

        <div class="fullStack">
          <div class="vinRow3">
            <div class="vinWrap">
              <input id="vin" placeholder="Ingresa VIN o escanea QR" />
              <div id="vinSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnQR" title="Escanear QR">📷</button>
            <button id="btnEstado" title="Busca la OT por VIN o la crea si no existe">
              Buscar / Crear
            </button>
          </div>

          <div class="twoWide">
            <button id="btnFinalizados">Ver finalizados</button>
            <button id="btnActivas" title="Refrescar conversiones">🔄 <span>Refrescar</span></button>
          </div>
        </div>

        <div id="estadoBox" class="small"></div>
        <div id="activasBox"></div>

        <!-- Avanzar el siguiente carro: solo lo ven las duplas (y quien
             trabaja con ayudantes que no marcan). Vacío para el resto. -->
        <div id="tecAvanceMiOT"></div>

        <div id="finalizadosWrap" style="display:none; margin-top:12px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBox"></div>
        </div>
      </div>

      <!-- ── Panel: Asistencia ──
           El técnico marca desde su celular, pero solo escaneando el QR de la
           TV del taller: eso es lo que prueba que estuvo ahí. Sin el escaneo
           esto sería un botón de "marcar desde casa". -->
      <div id="tecPanelAsistencia" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">🕐 Mi asistencia</span>
        </div>
        <div id="tecAsisEstado"><div class="small muted">Cargando…</div></div>
        <div id="tecAsisReader" class="tecAsisReader"></div>
        <div id="tecAsisMsg" class="tecAsisMsg"></div>
        <div id="tecAsisDupla"></div>
        <div id="tecAvanceAsis"></div>
      </div>

      <!-- ── Panel: Cola pendiente ── -->
      <div id="tecPanelCola" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">📋 Cola pendiente</span>
        </div>
        <div id="tecColaContent"><div class="small muted">Cargando…</div></div>
      </div>

      <!-- ── Panel: Mi rendimiento ── -->
      <div id="tecPanelRendimiento" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">📊 Mi rendimiento</span>
        </div>
        <div id="tecRendContent"><div class="small muted">Cargando…</div></div>
      </div>

      <!-- ── Panel: Mis incidencias ── -->
      <div id="tecPanelIncidencias" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">⚠️ Mis incidencias</span>
        </div>
        <div id="tecIncContent"><div class="small muted">Cargando…</div></div>
      </div>

      <!-- ── Panel: Mi inventario ── -->
      <div id="tecPanelInventario" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">🧰 Mi inventario</span>
        </div>
        <div id="tecInventarioContent"><div class="small muted">Cargando…</div></div>
      </div>

      <!-- ── Panel: Registrar carro en zona ──
           De noche no hay movilizador: el técnico ubica el carro él mismo y
           queda registrado a su nombre (mismo endpoint que usa movilizador). -->
      <div id="tecPanelZona" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">📍 Registrar carro</span>
        </div>

        <div class="fullStack">
          <div class="small muted">Ingresa o escanea el VIN del carro y elige en qué zona lo dejaste.</div>
          <div class="vinRow3">
            <div class="vinWrap">
              <input id="tecZonaVin" type="text" placeholder="Ingresa VIN o escanea QR"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
              <div id="tecZonaSuggest" class="vinSuggest hidden" role="listbox"></div>
            </div>
            <button id="btnTecZonaQr" type="button" title="Escanear QR">📷</button>
            <button id="btnTecZonaElegir" type="button" disabled>Elegir zona</button>
          </div>
        </div>

        <div id="tecZonaQrArea" style="display:none;margin-top:10px;">
          <div id="tecZonaQrReader"></div>
          <div id="tecZonaQrMsg" class="small" style="margin-top:6px;"></div>
        </div>

        <div id="tecZonaActual" style="margin-top:10px;"></div>
        <div id="tecZonaMsg" class="small" style="margin-top:10px;"></div>
      </div>

      <!-- ── Panel: Mapa de zonas ── -->
      <div id="tecPanelMapa" class="card" style="display:none;">
        <div class="adminDetailHead">
          <button class="adminBackBtn tecBackBtn">← Volver</button>
          <span class="adminDetailTitle">🗺 Mapa de zonas</span>
        </div>
        <div id="tecMapaLeyenda" class="tecMapaLeyenda"></div>
        <div class="zonasMapaBar">
          <span class="zonasMapaTs" id="tecMapaTs"></span>
          <button class="zonasMapaRefreshBtn" id="tecMapaRefreshBtn" type="button">↻ Actualizar</button>
        </div>
        <div id="tecMapaContainer"></div>
      </div>

      <!-- ── Stubs ocultos (siempre en DOM para delegation.js) ── -->
      <select id="accion" style="display:none;">
        <option value="INICIO">INICIO</option>
        <option value="PAUSA">PAUSA</option>
        <option value="REANUDAR">REANUDAR</option>
        <option value="FIN">FIN</option>
        <option value="NOTA">NOTA</option>
      </select>
      <textarea id="nota" style="display:none;"></textarea>
      <button id="btnNotaOnly" style="display:none;"></button>
      <button id="btnEnviar" style="display:none;"></button>
      <button id="btnVerMisInc" style="display:none;"></button>

      <div id="debugWrap" class="debug-hidden">
        <h3 style="margin-top:14px;">Respuesta</h3>
        <pre id="out">{}</pre>
      </div>

    </div>
  `;
}
