// =========================
// public/js/templates/views/admin-view.js
// Template HTML: vista Admin – CRUD completo
// =========================

export function adminView() {
  return `
    <!-- ADMIN -->
    <div id="viewADMIN" class="card" style="display:none;">

      <div class="adminHeader">
        <h3>Panel Admin</h3>
      </div>

      <!-- Tabs -->
      <div class="adminTabs" role="tablist">
        <button class="adminTab active" data-tab="usuarios" role="tab">Usuarios</button>
        <button class="adminTab" data-tab="vins" role="tab">VINs</button>
        <button class="adminTab" data-tab="ots" role="tab">OTs</button>
        <button class="adminTab" data-tab="incidencias" role="tab">Incidencias</button>
        <button class="adminTab" data-tab="config" role="tab">⚙ Configuración</button>
      </div>

      <!-- Toolbar -->
      <div class="adminToolbar">
        <input id="adminSearch" type="text" placeholder="Buscar…" autocomplete="off">
        <button id="btnAdminNuevo" type="button">+ Nuevo</button>
      </div>

      <!-- Table container -->
      <div id="adminTableWrap">
        <div id="adminTableContent" class="adminTableContent"></div>
      </div>

      <!-- Status / feedback -->
      <div id="adminMsg" class="adminMsg small muted"></div>

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