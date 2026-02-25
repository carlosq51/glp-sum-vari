// =========================
// public/js/views/uploader/uploader.js
// Wrapper real de Uploader (integrado en GLP Control)
// Conecta uploader-ui.js + uploader-api.js
// =========================

import { initUploaderUI } from "./uploader-ui.js";
import { CORE, hideAllModulesUI } from "../../core/core.js";

let _inited = false;
let _ctrl = null;

const $u = (id) => document.getElementById(id);

export function initUploaderView(options = {}) {
  if (_inited) return _ctrl;

  const root = $u("viewUploader");
  if (!root) {
    console.warn("[Uploader] No existe #viewUploader en el HTML");
    return null;
  }

  // 👇 Aquí conectamos el UI real (uploads/status/scanners/etc)
  _ctrl = initUploaderUI(root, {
    apsUrl: options.apsUrl, // opcional (si quieres inyectar URL oculta)
    onBackControl: () => {
      hideUploaderView();

      // Oculta todo primero
      hideAllModulesUI();

      // Recupera módulo actual (se mantiene en app.js)
      const m = String(CORE?.state?.currentModule || "").trim().toUpperCase();

      // Si hay módulo actual, vuelve a esa vista
      if (m) {
        const view = document.getElementById(`view${m}`);
        if (view) {
          view.style.display = "block";
          return;
        }
      }

      // Fallback: si no hay módulo, muestra hub
      const hub = document.getElementById("viewHub");
      if (hub) hub.style.display = "block";
    },
  });

  _inited = true;
  return _ctrl;
}

export function showUploaderView({ vin = "", screen = "menu", dateStr = "" } = {}) {
  if (!_inited) initUploaderView();

  const viewApp = document.getElementById("viewApp");
  if (viewApp) viewApp.style.display = "block";

  const hub = document.getElementById("viewHub");
  if (hub) hub.style.display = "none";

  if (_ctrl) {
    _ctrl.show({ vin, screen, dateStr });
  } else {
    const root = $u("viewUploader");
    if (root) root.style.display = "block";
  }
}

export function hideUploaderView() {
  if (_ctrl) _ctrl.hide();
  const root = $u("viewUploader");
  if (root) root.style.display = "none";
}