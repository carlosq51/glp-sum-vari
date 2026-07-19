// =========================
// public/js/core/settings-sheet.js
// Panel de ajustes de apariencia GLOBAL (tema + tamaño de texto + acento).
// Accesible desde el topbar en cualquier módulo y desde el hub — así los
// técnicos/calidad (que entran directo a su vista sin pasar por el hub)
// también pueden ajustar apariencia.
// =========================

import { applyTheme_ } from "./theme.js";
import { loadSettings, saveSettings, applySettings } from "./app-settings.js";
import { icon } from "./icons.js";
import { getNotifStatus, requestNotifPermission, disableNotifs } from "./push-client.js";
import { getEmail } from "./auth.js";

let built_ = false;

function buildSheet_() {
  if (built_) return;
  built_ = true;

  const wrap = document.createElement("div");
  wrap.id = "appSettingsModal";
  wrap.className = "modal appSettingsModal";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `
    <div class="modalBox appSettingsBox">
      <div class="modalHead">
        <div class="modalTitle">${icon("settings", 18)} Ajustes de apariencia</div>
        <button id="btnAppSettingsClose" type="button" title="Cerrar">✕</button>
      </div>
      <div class="modalBody">
        <div class="hubSettingRow">
          <div class="hubSettingLabel">Tema</div>
          <div class="hubSettingOpts" id="appOptTheme">
            <button class="hubOptBtn" data-val="night">${icon("moon", 14)} Oscuro</button>
            <button class="hubOptBtn" data-val="day">${icon("radio", 14)} Claro</button>
          </div>
        </div>

        <div class="hubSettingRow">
          <div class="hubSettingLabel">Tamaño de texto</div>
          <div class="hubSettingOpts" id="appOptSize">
            <button class="hubOptBtn" data-val="sm">A− Pequeño</button>
            <button class="hubOptBtn" data-val="md">A Normal</button>
            <button class="hubOptBtn" data-val="lg">A+ Grande</button>
            <button class="hubOptBtn" data-val="xl">A⁺⁺ XL</button>
          </div>
        </div>

        <div class="hubSettingRow">
          <div class="hubSettingLabel">Color de acento</div>
          <div class="hubSettingOpts" id="appOptAccent">
            <button class="hubColorBtn" data-val="graphite" style="background:#3a3f47;" title="Grafito (SUM)"></button>
            <button class="hubColorBtn" data-val="amber"    style="background:#f59e0b;" title="Ámbar"></button>
            <button class="hubColorBtn" data-val="orange"   style="background:#f97316;" title="Naranja"></button>
            <button class="hubColorBtn" data-val="blue"     style="background:#1d4ed8;" title="Azul"></button>
            <button class="hubColorBtn" data-val="teal"     style="background:#0d9488;" title="Verde"></button>
          </div>
        </div>

        <div class="hubSettingRow">
          <div class="hubSettingLabel">${icon("bell", 14)} Notificaciones en este dispositivo</div>
          <div class="hubSettingOpts" id="appOptNotif">
            <button class="hubOptBtn" data-val="on">🔔 Activadas</button>
            <button class="hubOptBtn" data-val="off">🔕 Desactivadas</button>
          </div>
          <div id="appNotifHint" class="small muted" style="margin-top:6px;min-height:16px;"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // Cerrar (botón + click en backdrop)
  document.getElementById("btnAppSettingsClose")?.addEventListener("click", closeSettingsSheet);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeSettingsSheet(); });

  // Tema
  document.getElementById("appOptTheme")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".hubOptBtn");
    if (!btn) return;
    applyTheme_(btn.dataset.val);
    refreshSheetUI_();
  });

  // Tamaño de texto
  document.getElementById("appOptSize")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".hubOptBtn");
    if (!btn) return;
    applySettings(saveSettings({ size: btn.dataset.val }));
    refreshSheetUI_();
  });

  // Color de acento
  document.getElementById("appOptAccent")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".hubColorBtn");
    if (!btn) return;
    applySettings(saveSettings({ accent: btn.dataset.val }));
    refreshSheetUI_();
  });

  // Notificaciones (alta/baja de ESTE dispositivo)
  document.getElementById("appOptNotif")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".hubOptBtn");
    if (!btn) return;
    const hint = document.getElementById("appNotifHint");
    if (btn.dataset.val === "on") {
      if (hint) hint.textContent = "Activando…";
      await requestNotifPermission(getEmail() || "", { force: true });
    } else {
      if (hint) hint.textContent = "Desactivando…";
      await disableNotifs();
    }
    refreshNotifRow_();
  });

  // ESC para cerrar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrap.classList.contains("show")) closeSettingsSheet();
  });
}

async function refreshNotifRow_() {
  const st = await getNotifStatus();
  const on = st.suscrito && st.permiso === "granted";

  document.getElementById("appOptNotif")?.querySelectorAll(".hubOptBtn").forEach((b) =>
    b.classList.toggle("active", (b.dataset.val === "on") === on)
  );

  const hint = document.getElementById("appNotifHint");
  if (!hint) return;
  if (!st.soporta)                 hint.textContent = "Este navegador no soporta notificaciones push.";
  else if (st.permiso === "denied") hint.textContent = "Permiso bloqueado — tócalo en el candado 🔒 junto a la dirección y permite Notificaciones.";
  else if (on)                      hint.textContent = "Este celular recibirá los avisos del taller (ramal listo, incidencias…).";
  else                              hint.textContent = "Sin avisos en este celular. Actívalas cuando estés en el taller.";
}

function refreshSheetUI_() {
  const s = loadSettings();
  const cur = document.documentElement.dataset.theme || "night";

  document.getElementById("appOptTheme")?.querySelectorAll(".hubOptBtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.val === cur)
  );
  document.getElementById("appOptSize")?.querySelectorAll(".hubOptBtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.val === (s.size || "md"))
  );
  document.getElementById("appOptAccent")?.querySelectorAll(".hubColorBtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.val === (s.accent || "graphite"))
  );
}

export function openSettingsSheet() {
  buildSheet_();
  const modal = document.getElementById("appSettingsModal");
  if (!modal) return;
  refreshSheetUI_();
  refreshNotifRow_();
  modal.style.display = "flex";
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

export function closeSettingsSheet() {
  const modal = document.getElementById("appSettingsModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  modal.style.display = "none";
}
