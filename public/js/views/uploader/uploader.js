  // =========================
  // public/js/views/uploader/uploader.js
  // Wrapper real de Uploader (integrado en GLP Control)
  // ✅ soporte mountId (render dentro de modal)
  // =========================

  import { initUploaderUI } from "./uploader-ui.js";
  import { CORE, hideAllModulesUI } from "../../core/core.js";

  let _inited = false;
  let _ctrl = null;

  // ✅ controllers por mount (para modales / embeds)
  const _ctrlByMount = new Map(); // mountId -> controller

  const $u = (id) => document.getElementById(id);

  export function initUploaderView(options = {}) {
    if (_inited) return _ctrl;

    const root = $u("viewUploader");
    if (!root) {
      console.warn("[Uploader] No existe #viewUploader en el HTML");
      return null;
    }

    // Controller principal (pantalla normal)
    _ctrl = initUploaderUI(root, {
      apsUrl: options.apsUrl,
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

  // ✅ init controller embebido (modal)
  // ✅ init controller embebido (modal) - FIX: re-init si mount fue recreado o quedó vacío
  function initUploaderOnMount_(mountId, options = {}) {
    const mount = document.getElementById(mountId);
    if (!mount) {
      console.warn("[Uploader] mountId no existe:", mountId);
      return null;
    }

    const cached = _ctrlByMount.get(mountId);

    // ✅ Si ya existe controller pero el mount fue recreado (innerHTML borrado)
    // o no tiene uploader-shell, destruimos y re-iniciamos.
    const hasShell = !!mount.querySelector(".uploader-shell");

    if (cached && hasShell) {
      return cached;
    }

    // si había cached pero el shell no existe, destruye cache
    if (cached) {
      try { cached.stopAllScanners?.(); } catch {}
      _ctrlByMount.delete(mountId);
    }

    // inyecta template desde el uploader principal
    const mainRoot = $u("viewUploader");
    if (!mainRoot) {
      console.warn("[Uploader] No existe #viewUploader para clonar template");
      return null;
    }

    mount.innerHTML = mainRoot.innerHTML;

    const ctrl = initUploaderUI(mount, {
      apsUrl: options.apsUrl,
      onBackControl: options.onBackControl || (() => {
        try { ctrl.showScreen("menu"); } catch {}
      }),
    });

    _ctrlByMount.set(mountId, ctrl);
    return ctrl;
  }

  /**
   * showUploaderView
   * @param {string} vin
   * @param {"menu"|"params"|"falla"|"calidad"|"qc"|"conformidad"|"conf"} screen
   * @param {string} dateStr
   * @param {string} mountId - si viene, renderiza dentro de ese contenedor (modal)
   * @param {boolean} inModal - si true, NO toca viewApp/viewHub/hideAllModulesUI
   * @param {function} onBackControl - callback para botón volver (solo embed)
   * @param {string} apsUrl - opcional override
   */
  export function showUploaderView({
    vin = "",
    screen = "menu",
    dateStr = "",
    mountId = "",
    inModal = false,
    onBackControl = null,
    apsUrl = null,
  } = {}) {

    // ✅ MODO EMBEBIDO (MODAL)
    if (mountId) {
      const ctrl = initUploaderOnMount_(mountId, { apsUrl, onBackControl });
      if (ctrl) ctrl.show({ vin, screen, dateStr });
      return;
    }

    // ✅ MODO NORMAL (pantalla uploader como siempre)
    if (!_inited) initUploaderView({ apsUrl });

    if (!inModal) {
      const viewApp = document.getElementById("viewApp");
      if (viewApp) viewApp.style.display = "block";

      const hub = document.getElementById("viewHub");
      if (hub) hub.style.display = "none";
    }

    if (_ctrl) {
      _ctrl.show({ vin, screen, dateStr });
    } else {
      const root = $u("viewUploader");
      if (root) root.style.display = "block";
    }
  }

  export function hideUploaderView({ mountId = "" } = {}) {
    // ✅ ocultar embed
    if (mountId) {
      const mount = document.getElementById(mountId);
      const ctrl = _ctrlByMount.get(mountId);
      try { ctrl?.stopAllScanners?.(); } catch {}
      if (mount) mount.innerHTML = "";
      _ctrlByMount.delete(mountId);
      return;
    }

    // normal
    if (_ctrl) _ctrl.hide();
    const root = $u("viewUploader");
    if (root) root.style.display = "none";
  }