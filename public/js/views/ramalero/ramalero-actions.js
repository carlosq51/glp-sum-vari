import {
  CORE,
  $,
  ctx_,
  withLock,
  requireEmailOrStop,
  getJSON,
} from "../../core/core.js";

import { renderFinalizados_, rebuildListsFromStore_, normalizeItem_ } from "../../work/index.js";
import { crearNuevoRamal_ } from "./ramalero-eventos.js";
import { initRamaleroSolicitudes_ } from "./ramalero-solicitudes.js";
import { initRamaleroHistorial_, aplicarFiltroHistorial_ } from "./ramalero-historial.js";

let boundActions_ = false;

/**
 * Trae y pinta los ramales terminados de este ramalero.
 *
 * La descarga se hace UNA vez por sesión de vista (`_finalizadosLoaded`):
 * abrir y cerrar el historial no vuelve a pedirlos. Lo que sí se repinta
 * siempre es el render, porque el filtro por marca trabaja sobre el DOM
 * ya montado.
 */
async function cargarFinalizados_() {
  await withLock(async () => {
    const c = ctx_();
    c.showFinalizados = true;

    if (!c._finalizadosLoaded) {
      let email;
      try { email = requireEmailOrStop(); } catch { return; }
      const j = await getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}`);
      if (j?.ok && Array.isArray(j.items)) {
        for (const raw of j.items) {
          const it = normalizeItem_(raw);
          c.itemsByKey.set(`${it.conversionId}|${it.rolTrabajo}`, it);
        }
        rebuildListsFromStore_();
        c._finalizadosLoaded = true;
      }
    }

    renderFinalizados_();
  }, "Cargando historial...");
}

export function initRamaleroActions_() {
  if (boundActions_) return;
  boundActions_ = true;

  // Botón oculto que conserva el gesto de refresco manual: el SSE ya
  // refresca solo, pero otras piezas siguen disparando este evento.
  $("btnActivasR")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    document.dispatchEvent(new CustomEvent("glp:force-sync"));
  });

  // El historial dejó de ser un botón «ver finalizados» y pasó a ser una
  // sección con su propio desplegable y su filtro por marca.
  initRamaleroHistorial_(cargarFinalizados_);

  // Si el store se repinta por su cuenta (llega un FIN por sync), el
  // filtro activo tiene que volver a aplicarse o reaparecen tarjetas
  // que el ramalero había filtrado.
  document.addEventListener("glp:finalizados-render", aplicarFiltroHistorial_);

  $("btnRamalNuevo")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await crearNuevoRamal_();
  });

  initRamaleroSolicitudes_();
}
