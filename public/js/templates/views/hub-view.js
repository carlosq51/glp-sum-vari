// =========================
// public/js/templates/views/hub-view.js
// Template HTML: selección de módulo (hub) — cartillas con ajustes de apariencia
// =========================

import { icon } from "../../core/icons.js";

export function hubView() {
  return `
    <!-- HUB -->
    <div id="viewHub" class="card" style="display:none;">

      <!-- Cabecera -->
      <div class="hubHeader">
        <div>
          <div class="hubGreeting" id="hubGreeting">Bienvenido</div>
          <div class="hubSubtitle">Selecciona tu módulo de trabajo</div>
        </div>
        <div id="hubAvatar" class="hubAvatar" title="Foto de perfil">
          <span class="hubAvatarImg" id="hubAvatarImg" aria-hidden="true">${icon("user", 30)}</span>
        </div>
      </div>

      <!-- Cartillas de módulos (rellenas dinámicamente) -->
      <div id="hubButtons" class="hubGrid"></div>

      <p class="small hubHint">
        Si tienes varios permisos, puedes cambiar de módulo cuando quieras.
      </p>

      <!-- Modal para cambiar avatar -->
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
    </div>
  `;
}
