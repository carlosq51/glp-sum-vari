// =========================
// public/js/templates/views/hub-view.js
// Template HTML: selección de módulo (hub) — cartillas con ajustes de apariencia
// =========================

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
        <button id="btnHubSettings" class="hubSettingsBtn" title="Ajustes de apariencia">⚙️</button>
      </div>

      <!-- Cartillas de módulos (rellenas dinámicamente) -->
      <div id="hubButtons" class="hubGrid"></div>

      <p class="small hubHint">
        Si tienes varios permisos, puedes cambiar de módulo cuando quieras.
      </p>

      <!-- Panel de ajustes de apariencia -->
      <div id="hubSettingsPanel" class="hubSettingsPanel" style="display:none;">

        <div class="hubSettingsHead">
          <span>⚙️ Ajustes de apariencia</span>
          <button id="btnHubSettingsClose" class="hubSettingsClose" title="Cerrar">✕</button>
        </div>

        <!-- Tema -->
        <div class="hubSettingRow">
          <div class="hubSettingLabel">Tema</div>
          <div class="hubSettingOpts" id="hubOptTheme">
            <button class="hubOptBtn" data-val="night">🌙 Oscuro</button>
            <button class="hubOptBtn" data-val="day">☀️ Claro</button>
          </div>
        </div>

        <!-- Tamaño de texto -->
        <div class="hubSettingRow">
          <div class="hubSettingLabel">Tamaño de texto</div>
          <div class="hubSettingOpts" id="hubOptSize">
            <button class="hubOptBtn" data-val="sm">A− Pequeño</button>
            <button class="hubOptBtn" data-val="md">A Normal</button>
            <button class="hubOptBtn" data-val="lg">A+ Grande</button>
            <button class="hubOptBtn" data-val="xl">A⁺⁺ XL</button>
          </div>
        </div>

        <!-- Color de acento -->
        <div class="hubSettingRow">
          <div class="hubSettingLabel">Color de acento</div>
          <div class="hubSettingOpts" id="hubOptAccent">
            <button class="hubColorBtn" data-val="amber"  style="background:#f59e0b;" title="Ámbar (SUM)"></button>
            <button class="hubColorBtn" data-val="orange" style="background:#f97316;" title="Naranja"></button>
            <button class="hubColorBtn" data-val="slate"  style="background:#334155;" title="Grafito"></button>
            <button class="hubColorBtn" data-val="blue"   style="background:#1d4ed8;" title="Azul"></button>
            <button class="hubColorBtn" data-val="teal"   style="background:#0d9488;" title="Verde"></button>
          </div>
        </div>

      </div>
    </div>
  `;
}
