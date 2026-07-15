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

        <div id="finalizadosWrap" style="display:none; margin-top:12px;">
          <h4>Finalizados</h4>
          <div id="finalizadosBox"></div>
        </div>
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
      <button id="btnTecBuscar" style="display:none;"></button>

      <div id="debugWrap" class="debug-hidden">
        <h3 style="margin-top:14px;">Respuesta</h3>
        <pre id="out">{}</pre>
      </div>

    </div>
  `;
}

// Modal avatar (fuera de viewTECNICO para evitar bug WebKit position:fixed)
export function avatarUploadModalTemplate() {
  return `
    <div id="avatarUploadModal" class="modal">
      <div class="modalBox" style="width: min(100%, 480px);">
        <div class="modalHead">
          <h3 class="modalTitle">Cambiar foto de perfil</h3>
          <button id="btnCloseAvatarModal" aria-label="Cerrar">×</button>
        </div>
        <div class="modalBody">
          <div class="avatarUploadZone" id="avatarUploadZone">
            <svg class="uploadIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p class="uploadText">Arrastra tu foto aquí o <span class="uploadLink">selecciona un archivo</span></p>
            <p class="uploadSubtext">JPG, PNG — máximo 5MB</p>
            <input type="file" id="avatarFileInput" accept="image/jpeg,image/png" style="display:none;">
          </div>
          <div id="avatarPreview" class="avatarPreview" style="display:none;">
            <img id="avatarPreviewImg" src="" alt="Preview">
          </div>
          <div id="avatarUploadStatus" class="avatarUploadStatus" style="display:none;"></div>
        </div>
        <div class="avatarModalActions">
          <button id="btnCancelAvatarUpload" class="btn">Cancelar</button>
          <button id="btnConfirmAvatarUpload" class="btn btnPrimary" disabled>Guardar</button>
        </div>
      </div>
    </div>
  `;
}

// Modal fuera de viewTECNICO para evitar bug WebKit position:fixed en padre display:none
export function tecBuscarModalTemplate() {
  return `
    <div id="tecBuscarModal" class="modal" aria-hidden="true" style="display:none;">
      <div class="modalBox">
        <div class="modalHead">
          <div class="modalTitle">🔍 Buscar VIN — Conversión</div>
          <button id="btnTecBuscarClose" type="button" title="Cerrar">✕</button>
        </div>
        <div class="modalBody">
          <div style="position:relative;">
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="tecBuscarVin" type="text" placeholder="Ingresa VIN o escanea QR"
                autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
                style="flex:1;" />
              <button id="btnTecBuscarQr" type="button" class="btn" style="flex:0 0 auto;padding:9px 14px;">📷</button>
            </div>
            <div id="tecBuscarSuggest" class="vinSuggest hidden" role="listbox"></div>
          </div>
          <div id="tecBuscarQrReader" style="margin-top:10px;"></div>
          <div id="tecBuscarMsg" class="small" style="margin-top:10px;"></div>
          <div id="tecBuscarResult" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>
  `;
}
