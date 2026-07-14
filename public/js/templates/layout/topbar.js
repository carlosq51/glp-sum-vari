// =========================
// public/js/templates/layout/topbar.js
// Template HTML: barra superior (título, user pill, acciones)
// =========================

import { icon } from "../../core/icons.js";

export function topbarView() {
  return `
    <div class="topbarShell">
      <div class="topbarMain">
        <div class="topbarLeft">
          <div class="topbarTitleRow">
            <h2>Control de Trabajo GLP</h2>
            <span id="userHello" class="topbarHello"></span>
          </div>

          <div class="topbarMetaRow">
            <span id="userPill" class="pill small"></span>
          </div>
        </div>

        <div class="topbarRight">
          <button id="btnLogout" class="topbarBtn topbarBtnLogout" type="button">
            Cerrar sesión
          </button>
        </div>
      </div>

      <div class="topbarActions">
        <button id="btnAppSettings" type="button" title="Ajustes de apariencia (tema, tamaño, color)">${icon("settings", 18)}</button>

        <button id="btnRegistroFallas" type="button" title="Abrir Registro / Fallas">
          ${icon("camera", 15)} Registro / Fallas
        </button>

        <button
          id="btnGoHome"
          type="button"
          class="hidden"
          title="Ir a pantalla principal"
        >
          Pantalla principal
        </button>
      </div>
    </div>
  `;
}