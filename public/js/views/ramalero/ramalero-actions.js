import {
  CORE,
  $,
  el_,
  ctx_,
  withLock,
} from "../../core/core.js";

import { renderFinalizados_ } from "../../work/index.js";
import { syncNow } from "../conversion/conversion.js";
import { crearNuevoRamal_ } from "./ramalero-eventos.js";

let boundActions_ = false;

export function initRamaleroActions_() {
  if (boundActions_) return;
  boundActions_ = true;

  $("btnActivasR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });

  $("btnFinalizadosR")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;

      const btn = el_("btnFinalizados");
      if (btn) btn.textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";

      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("btnRamalNuevo")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    await crearNuevoRamal_();
  });
}