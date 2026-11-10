// =========================
// public/js/work/telefonos.js
// 📞 / 🟢 junto al MOTOR y al TANQUERO en las tarjetas de CALIDAD.
//
// 📞 abre el marcador con el número del técnico (llamada normal, del saldo
//    de quien llama). 🟢 abre su chat de WhatsApp: WhatsApp no deja empezar
//    una llamada desde un enlace, así que ahí se toca el ícono de llamar.
//
// Los números vienen de GET /api/telefonos (solo CALIDAD, SUPERVISOR y
// ADMIN: routes/telefonos.js). Las tarjetas se pintan sin esperar a la red:
// llevan un hueco <span class="js-tel" data-tel-nombre="…"> y pintarTelefonos_
// lo llena cuando ya se tienen los números.
// =========================

import { getEmail } from "../core/auth.js";
import { escapeHtml } from "../core/format.js";

const VIGENCIA_MS = 10 * 60_000;
let _porNombre = null;     // nombre normalizado → "51987654321"
let _ts = 0;
let _pidiendo = null;

const norm_ = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/\s+/g, " ").trim();

async function cargar_() {
  if (_porNombre && Date.now() - _ts < VIGENCIA_MS) return _porNombre;
  if (!_pidiendo) {
    _pidiendo = fetch(`/api/telefonos?email=${encodeURIComponent(getEmail() || "")}`)
      .then((r) => r.json())
      .then((j) => {
        _porNombre = new Map((j?.ok ? j.items : []).map((u) => [norm_(u.nombre), String(u.telefono || "")]));
        _ts = Date.now();
        return _porNombre;
      })
      .catch(() => _porNombre || new Map())
      .finally(() => { _pidiendo = null; });
  }
  return _pidiendo;
}

/** El hueco que va en la línea de personal (siempre el mismo texto). */
export function huecoTelefono_(nombre) {
  if (!nombre) return "";
  return `<span class="js-tel" data-tel-nombre="${escapeHtml(nombre)}"></span>`;
}

function botones_(tel, nombre) {
  const n = escapeHtml(nombre);
  return `<a class="btnTel" href="tel:+${tel}" title="Llamar a ${n}" aria-label="Llamar a ${n}">📞</a>` +
    `<a class="btnTel" href="https://wa.me/${tel}" target="_blank" rel="noopener" title="WhatsApp de ${n}" aria-label="WhatsApp de ${n}">🟢</a>`;
}

let _programado = false;
/** Llena los huecos vacíos. Se puede llamar las veces que sea. */
export function pintarTelefonos_() {
  if (_programado) return;
  _programado = true;
  setTimeout(async () => {
    _programado = false;
    const huecos = [...document.querySelectorAll(".js-tel:not([data-tel-listo])")];
    if (!huecos.length) return;
    const mapa = await cargar_();
    for (const h of huecos) {
      const tel = mapa.get(norm_(h.dataset.telNombre));
      h.dataset.telListo = "1";
      h.innerHTML = tel ? botones_(tel, h.dataset.telNombre) : "";
    }
  }, 0);
}

// Los enlaces viven dentro de la tarjeta: que el toque no la abra/cierre.
document.addEventListener("click", (e) => {
  if (e.target.closest?.(".btnTel")) e.stopPropagation();
}, true);
