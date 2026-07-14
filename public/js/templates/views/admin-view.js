// =========================
// public/js/templates/views/admin-view.js
// Template HTML: vista Admin – cartillas de sección + detalle
// =========================

import { icon } from "../../core/icons.js";

export function adminView() {
  return `
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">

      <!-- ── Vista cartillas ── -->
      <div id="adminCards">
        <div class="adminHero">
          <span class="adminHeroIcon" aria-hidden="true">${icon("sliders", 22)}</span>
          <div class="adminHeroText">
            <h3 class="adminHeroTitle">Panel de administración</h3>
            <div class="adminHeroSub">Gestiona usuarios, vehículos, órdenes y parámetros del sistema</div>
          </div>
        </div>
        <div class="hubGrid" id="adminCardGrid"></div>
      </div>

      <!-- ── Vista detalle de sección ── -->
      <div id="adminDetail" style="display:none;">

        <div class="adminDetailHead">
          <button id="btnAdminBack" class="adminBackBtn">${icon("chevronLeft", 16)} Volver</button>
          <span id="adminDetailIcon" class="adminDetailIcon" aria-hidden="true"></span>
          <div class="adminDetailText">
            <span id="adminDetailTitle" class="adminDetailTitle"></span>
            <span id="adminDetailSub" class="adminDetailSub"></span>
          </div>
        </div>

        <div class="adminToolbar" id="adminToolbar">
          <div class="adminSearchWrap">
            <span class="adminSearchIcon" aria-hidden="true">${icon("search", 16)}</span>
            <input id="adminSearch" type="text" placeholder="Buscar…" autocomplete="off">
          </div>
          <button id="btnAdminNuevo" type="button">${icon("plus", 16)} Nuevo</button>
        </div>

        <div id="adminTableWrap">
          <div id="adminTableContent" class="adminTableContent"></div>
        </div>

        <div id="adminMsg" class="adminMsg small muted"></div>
      </div>

    </div>
  `;
}

export function adminCrudModal() {
  return `
    <!-- ADMIN CRUD Modal -->
    <div id="adminModal" class="modal" aria-hidden="true">
      <div class="modalBox adminModalBox">
        <div class="modalHead">
          <span id="adminModalTitle" class="modalTitle"></span>
          <button id="btnAdminModalClose" type="button" title="Cerrar">✕</button>
        </div>
        <div class="modalBody" id="adminModalBody">
          <!-- Form rendered dynamically by admin.js -->
        </div>
        <div class="adminModalFoot">
          <button id="btnAdminModalCancel" type="button" class="adminBtnGhost">Cancelar</button>
          <button id="btnAdminModalSave" type="button" class="adminBtnOk">Guardar</button>
        </div>
      </div>
    </div>
  `;
}
