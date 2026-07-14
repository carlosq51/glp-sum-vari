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
    </div>
  `;
}
