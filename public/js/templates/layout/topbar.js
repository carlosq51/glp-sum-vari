// public/js/templates/views/topbar.js
export function topbarView() {
  return `
    <div class="row space-between">
      <span id="userPill" class="pill small"></span>

      <div class="row" style="margin:0; gap:10px;">
        <button id="btnTheme" title="Cambiar tema">☀️/🌙</button>

        <button id="btnRegistroFallas" type="button" title="Abrir Registro / Fallas">
          📸 Registro / Fallas
        </button>

        <button id="btnLogout">Cerrar sesión</button>
      </div>
    </div>
  `;
}