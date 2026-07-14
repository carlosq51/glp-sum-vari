// =========================
// public/js/core/drilldown.js
// Drill-down universal: cualquier número agregado de la UI puede abrirse
// para ver los datos que hay detrás.
//
// Uso:
//   import { openDrilldown } from "../../core/drilldown.js";
//   openDrilldown({ title: "Incidencias críticas", badge: "12", html: "<div>…</div>" });
//
// Es un bottom-sheet (móvil-primero): se ancla abajo, ocupa hasta el 82%
// del alto, cierra con backdrop / Escape / botón ✕ y hace scroll interno.
// Un solo nodo en el DOM, reutilizado por todas las vistas.
// =========================

let _sheet = null;

function ensureSheet_() {
  if (_sheet) return _sheet;
  const el = document.createElement("div");
  el.id = "drillSheet";
  el.className = "drill";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="drill__backdrop" data-drill-close></div>
    <div class="drill__panel" role="dialog" aria-modal="true">
      <div class="drill__grip" aria-hidden="true"></div>
      <div class="drill__head">
        <div class="drill__titles">
          <div class="drill__title" id="drillTitle"></div>
          <div class="drill__subtitle" id="drillSubtitle"></div>
        </div>
        <span class="drill__badge" id="drillBadge"></span>
        <button type="button" class="drill__close" data-drill-close aria-label="Cerrar">✕</button>
      </div>
      <div class="drill__body" id="drillBody"></div>
    </div>`;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-drill-close]")) closeDrilldown();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("show")) closeDrilldown();
  });

  _sheet = el;
  return el;
}

/**
 * Abre el panel de detalle.
 * @param {string} o.title     qué se está viendo ("Incidencias críticas")
 * @param {string} [o.subtitle] contexto ("del 01/07 al 14/07")
 * @param {string|number} [o.badge] conteo mostrado junto al título
 * @param {string} o.html      contenido ya renderizado (la vista decide el formato)
 */
export function openDrilldown({ title = "", subtitle = "", badge = "", html = "" } = {}) {
  const el = ensureSheet_();
  el.querySelector("#drillTitle").textContent = title;
  const sub = el.querySelector("#drillSubtitle");
  sub.textContent = subtitle;
  sub.style.display = subtitle ? "" : "none";
  const bd = el.querySelector("#drillBadge");
  bd.textContent = String(badge);
  bd.style.display = badge !== "" && badge !== null && badge !== undefined ? "" : "none";
  const body = el.querySelector("#drillBody");
  body.innerHTML = html;
  body.scrollTop = 0;

  el.setAttribute("aria-hidden", "false");
  el.classList.add("show");
  document.body.style.overflow = "hidden"; // no scroll de fondo
  return body; // por si la vista quiere bindear clicks internos (drill anidado)
}

export function closeDrilldown() {
  if (!_sheet) return;
  _sheet.classList.remove("show");
  _sheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/** ¿Está abierto? (para no re-renderizar debajo, como hace sup-live con su modal) */
export function isDrilldownOpen() {
  return !!_sheet?.classList.contains("show");
}
