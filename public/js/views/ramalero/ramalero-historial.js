// =========================
// public/js/views/ramalero/ramalero-historial.js
// Historial del ramalero — sus ramales terminados, filtrables por marca.
//
// POR QUÉ EL FILTRO ES DE CLIENTE Y NO DE SERVIDOR
// ───────────────────────────────────────────────
// Las tarjetas ya vienen pintadas por el renderer compartido de trabajo
// (work/work-render.js), que sirve por igual a técnico, calidad y
// ramalero. Meterle un filtro por marca ahí obligaría a que ese módulo
// conozca un concepto que solo existe para el ramalero.
//
// En su lugar, el renderer marca cada tarjeta con `data-tipo` (una línea)
// y aquí se esconden las que no tocan. El historial de una persona son
// decenas de filas, no miles: filtrar en el navegador es instantáneo y no
// gasta una consulta más.
//
// El contador («12 de 30») se recalcula sobre lo que quedó visible, así
// que responde la pregunta real: «¿cuántos Jetour llevo?».
// =========================

let _bound = false;
let _marca = "";   // "" = todas

const BOX = "finalizadosBoxR";

/** Aplica el filtro activo sobre las tarjetas ya pintadas. */
export function aplicarFiltroHistorial_() {
  const box = document.getElementById(BOX);
  if (!box) return;

  const cards = [...box.querySelectorAll("[data-tipo]")];
  let visibles = 0;
  for (const c of cards) {
    const ok = !_marca || c.dataset.tipo === _marca;
    c.style.display = ok ? "" : "none";
    if (ok) visibles++;
  }

  const cuenta = document.getElementById("ramalHistCuenta");
  if (!cuenta) return;

  if (!cards.length) {
    cuenta.textContent = "";
    return;
  }
  cuenta.textContent = _marca
    ? `${visibles} de ${cards.length} ramales · ${_marca}`
    : `${cards.length} ramales en total`;
}

/**
 * Engancha el desplegable del historial y los botones de marca.
 * @param {() => Promise<void>} cargarFinalizados  trae y pinta los finalizados
 */
export function initRamaleroHistorial_(cargarFinalizados) {
  if (_bound) return;
  _bound = true;

  const toggle = document.getElementById("ramalHistToggle");
  const body   = document.getElementById("ramalHistBody");
  const chev   = document.getElementById("ramalHistChev");

  toggle?.addEventListener("click", async () => {
    if (!body) return;
    const abrir = body.style.display === "none";
    body.style.display = abrir ? "block" : "none";
    if (chev) chev.textContent = abrir ? "▲" : "▼";
    // Se carga al abrir, no al entrar a la vista: la mayoría de los días
    // el ramalero no lo mira, y son varias consultas que no hacen falta.
    if (abrir) {
      await cargarFinalizados();
      aplicarFiltroHistorial_();
    }
  });

  document.getElementById("ramalHistFiltro")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-marca]");
    if (!b) return;
    _marca = b.dataset.marca || "";
    for (const otro of document.querySelectorAll("#ramalHistFiltro [data-marca]")) {
      otro.classList.toggle("is-on", otro === b);
    }
    aplicarFiltroHistorial_();
  });
}

/** Al salir del módulo: el filtro no debe sobrevivir a la siguiente sesión. */
export function resetHistorial_() {
  _marca = "";
  const body = document.getElementById("ramalHistBody");
  if (body) body.style.display = "none";
  const chev = document.getElementById("ramalHistChev");
  if (chev) chev.textContent = "▼";
  for (const b of document.querySelectorAll("#ramalHistFiltro [data-marca]")) {
    b.classList.toggle("is-on", !b.dataset.marca);
  }
}
