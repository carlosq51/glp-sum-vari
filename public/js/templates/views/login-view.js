// =========================
// public/js/templates/views/login-view.js
// Template HTML: pantalla de login
// =========================

export function loginView() {
  return `
    <!-- =========================
         LOGIN
         ========================= -->
    <div id="viewLogin" class="card">
      <h3>Iniciar sesión</h3>
      <div class="row">
        <input id="email" type="email" placeholder="tu_email@gmail.com" />
        <button id="btnMe">Iniciar sesión</button>
      </div>
      <div id="loginMsg" class="small"></div>
    </div>
  `;
}