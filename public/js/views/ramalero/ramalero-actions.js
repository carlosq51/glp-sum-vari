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
 * Trae y pinta los ramales terminados de este ramalero en un rango de
 * fechas (`{ desde, hasta }`, días de Perú), o la ventana de siempre sin él.
 *
 * Cada rango se descarga UNA vez por sesión de vista: volver a «Hoy» o a
 * la semana que ya se miró no vuelve a pedirlo. Lo traído se suma al store,
 * así que puede haber tarjetas de otros rangos: las esconde el filtro del
 * historial por `data-fin`. Lo que sí se repinta siempre es el render.
 *
 * `_finalizadosLoaded` se sigue marcando porque es lo que le dice al sync
 * que conserve estas tarjetas al reemplazar el store. Si el store se vació
 * sin conservarlas, el flag vuelve a false y los rangos se piden de nuevo.
 */
async function cargarFinalizados_(rango = null) {
  await withLock(async () => {
    const c = ctx_();
    c.showFinalizados = true;

    if (!c._finalizadosLoaded || !c._finalizadosRangos) c._finalizadosRangos = new Set();
    const clave = rango ? `${rango.desde}|${rango.hasta}` : "*";

    if (!c._finalizadosRangos.has(clave)) {
      let email;
      try { email = requireEmailOrStop(); } catch { return; }
      const qs = rango
        ? `&desde=${encodeURIComponent(rango.desde)}&hasta=${encodeURIComponent(rango.hasta)}`
        : "";
      const j = await getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}${qs}`);
      if (j?.ok && Array.isArray(j.items)) {
        for (const raw of j.items) {
          const it = normalizeItem_(raw);
          c.itemsByKey.set(`${it.conversionId}|${it.rolTrabajo}`, it);
        }
        rebuildListsFromStore_();
        c._finalizadosLoaded = true;
        c._finalizadosRangos.add(clave);
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
