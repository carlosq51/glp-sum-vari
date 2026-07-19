// =========================
// public/js/core/banner.js
// Avisos flotantes (barras y toasts) — singleton por id.
//
// El helper pone la posición base según `kind`, y gestiona el ciclo de vida:
// crear/reemplazar, cerrar con cualquier [data-banner-close] del contenido,
// auto-dismiss opcional y onClick en el resto del aviso. El caller aporta el
// contenido HTML y su estilo de color (siempre tokens var(--…)).
//
// NO cubre paneles fijos del template (ej. movSalidaQrResult del movilizador):
// esos son parte de la vista con estado propio, no avisos flotantes.
// =========================

const KIND_CSS = {
  // Barra pegada al borde superior, ancho completo
  "top-bar":
    "position:fixed;top:0;left:0;right:0;" +
    "display:flex;align-items:center;justify-content:space-between;" +
    "padding:12px 16px;gap:10px;font-weight:700;font-size:.95rem;" +
    "box-shadow:var(--shadowSm);",
  // Tarjeta flotante centrada arriba (con slide-in)
  "top-card":
    "position:fixed;top:16px;left:50%;transform:translateX(-50%);" +
    "max-width:340px;width:calc(100% - 32px);box-shadow:var(--shadow);" +
    "animation:glpBannerIn .3s cubic-bezier(.22,1,.36,1);",
  // Tarjeta flotante centrada abajo
  "bottom-card":
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
    "max-width:340px;width:90%;box-shadow:var(--shadow);",
};

let _cssInjected = false;
function ensureCss_() {
  if (_cssInjected) return;
  _cssInjected = true;
  const st = document.createElement("style");
  st.textContent =
    "@keyframes glpBannerIn{from{opacity:0;transform:translateX(-50%) translateY(-14px)}" +
    "to{opacity:1;transform:translateX(-50%) translateY(0)}}";
  document.head.appendChild(st);
}

const _live = new Map(); // id → { timer, onClose }

/**
 * Muestra (o reemplaza) un aviso flotante.
 * @param {object}   o
 * @param {string}   o.id           id único del aviso (singleton)
 * @param {string}   [o.kind]       "top-bar" | "top-card" | "bottom-card"
 * @param {string}   o.html         contenido; un [data-banner-close] dentro cierra el aviso
 * @param {string}   [o.style]      CSS extra del contenedor (fondo, borde, padding…)
 * @param {number}   [o.zIndex]
 * @param {number}   [o.autoCloseMs] >0 para auto-cerrar
 * @param {Function} [o.onClick]    click en el aviso (fuera del botón de cierre)
 * @param {Function} [o.onClose]    al cerrarse (por botón, timer o hideBanner_)
 * @returns {HTMLElement}
 */
export function showBanner_({ id, kind = "bottom-card", html = "", style = "", zIndex = 9000, autoCloseMs = 0, onClick = null, onClose = null } = {}) {
  ensureCss_();
  hideBanner_(id);

  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "alert");
  el.style.cssText = `${KIND_CSS[kind] || KIND_CSS["bottom-card"]}z-index:${zIndex};${style}`;
  el.innerHTML = html;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-banner-close]")) {
      e.stopPropagation();
      hideBanner_(id);
      return;
    }
    if (onClick) onClick(e);
  });

  _live.set(id, {
    onClose,
    timer: autoCloseMs > 0 ? setTimeout(() => hideBanner_(id), autoCloseMs) : null,
  });
  return el;
}

/** Cierra un aviso por id (no falla si no existe). */
export function hideBanner_(id) {
  const rec = _live.get(id);
  if (rec) {
    clearTimeout(rec.timer);
    _live.delete(id);
  }
  const el = document.getElementById(id);
  if (!el) return;
  el.remove();
  if (rec?.onClose) { try { rec.onClose(); } catch { /* best-effort */ } }
}
