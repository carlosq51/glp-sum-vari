// =========================
// public/js/templates/views/admin-view.js
// Template HTML: vista Admin – cartillas de sección + detalle
// =========================

export function adminView() {
  return `
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">

      <!-- ── Vista cartillas ── -->
      <div id="adminCards">
        <h3 style="margin-bottom:16px;">Panel Admin</h3>
        <div class="hubGrid" id="adminCardGrid"></div>
      </div>

      <!-- ── Vista detalle de sección ── -->
      <div id="adminDetail" style="display:none;">

        <div class="adminDetailHead">
          <button id="btnAdminBack" class="adminBackBtn">← Volver</button>
          <span id="adminDetailTitle" class="adminDetailTitle"></span>
        </div>

        <div class="adminToolbar" id="adminToolbar">
          <input id="adminSearch" type="text" placeholder="Buscar…" autocomplete="off">
          <button id="btnAdminNuevo" type="button">+ Nuevo</button>
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
