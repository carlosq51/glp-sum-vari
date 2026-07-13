// =========================
// public/js/templates/views/login-view.js
// Template HTML: pantalla de login (con marca SUM)
// =========================

import { brandMark } from "../layout/brand.js";

export function loginView() {
  return `
    <!-- =========================
         LOGIN
         ========================= -->
    <div id="viewLogin" class="loginScreen">
      <div class="loginBrand">${brandMark("md")}</div>
      <div class="card loginCard">
        <h3>Iniciar sesión</h3>
        <div class="row">
          <input id="email" type="email" placeholder="tu_email@gmail.com" autocomplete="email" />
          <button id="btnMe" class="btn-accent">Iniciar sesión</button>
        </div>
        <div id="loginMsg" class="small"></div>
      </div>
    </div>
  `;
}
