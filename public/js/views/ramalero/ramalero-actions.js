import {
  CORE,
  $,
  el_,
  ctx_,
  withLock,
  requireEmailOrStop,
  getJSON,
} from "../../core/core.js";

import { renderFinalizados_, rebuildListsFromStore_, normalizeItem_ } from "../../work/index.js";
import { crearNuevoRamal_ } from "./ramalero-eventos.js";
import { initRamaleroSolicitudes_ } from "./ramalero-solicitudes.js";

let boundActions_ = false;

export function initRamaleroActions_() {
  if (boundActions_) return;
  boundActions_ = true;

  $("btnActivasR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    document.dispatchEvent(new CustomEvent("glp:force-sync"));
  });

  $("btnFinalizadosR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;

      const btn = el_("btnFinalizados");
      if (btn) btn.textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";

      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}`);
        if (j?.ok && Array.isArray(j.items)) {
          for (const raw of j.items) {
            const it = normalizeItem_(raw);
            const k = `${it.conversionId}|${it.rolTrabajo}`;
            c.itemsByKey.set(k, it);
          }
          rebuildListsFromStore_();
          c._finalizadosLoaded = true;
        }
      }

      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("btnRamalNuevo")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await crearNuevoRamal_();
  });

  initRamaleroSolicitudes_();
}