// =========================
// public/js/views/uploader/uploader.js
// Wrapper real de Uploader (integrado en GLP Control)
// Conecta uploader-ui.js + uploader-api.js
// =========================

import { initUploaderUI } from "./uploader-ui.js";

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
      // ✅ SIN redirección a página anterior
      hideUploaderView();

      // muestra el hub (o puedes cambiar esto para volver al módulo actual)
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