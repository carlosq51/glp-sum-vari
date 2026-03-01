/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { initIncidenciasUI_ } from "./incidencias.js";
import { initRFModalUI_ } from "./rf-modal.js";
import { initRFTecModalUI_ } from "./rf-tecnico-modal.js";
import {
  initConformidadUI_,
  setConformidadAfterSaveRefresh_,
} from "./conformidad.js";

import {
  CORE,
  $,
  el_,
  ctx_,
  isWorkModule_,
  getVin,
  getRolTrabajoCurrent_,
  setEstadoText,
  msToHMS_,
  withLock,
} from "../../core/core.js";

import { computeLiveMs_, renderFinalizados_ } from "../../work/index.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";

import { syncNow } from "./conversion-sync.js";
import {
  refreshEstadoForVinRole,
  initEstadoUI_,
} from "./conversion-estado.js";
import { initConversionDelegation_ } from "./conversion-delegation.js";
import { initVinAutocomplete_ } from "./conversion-vin-autocomplete.js";
import { initConversionQR_ } from "./conversion-qr.js";

// --------------------------
// TICK CLOCK
// --------------------------
export function tickClocksUI_() {
  if (!isWorkModule_()) return;

  const c = ctx_();
  const nowMs = Date.now();

  el_("activasBox")
    ?.querySelectorAll(".jobCard[data-key] .js-tiempo")
    ?.forEach((elTime) => {
      const card = elTime.closest(".jobCard");
      if (!card) return;

      const k = card.dataset.key || "";
      const it = c.itemsByKey.get(k);
      if (!it) return;

      elTime.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;
    });

  if (CORE.state.currentModule === "RAMALERO") return;

  const vin = getVin();
  const rol = getRolTrabajoCurrent_();

  if (vin && rol) {
    const it = [...c.itemsByKey.values()].find(
      (x) =>
        String(x.vin || "").toUpperCase() === vin &&
        String(x.rolTrabajo || "").toUpperCase() === rol
    );

    if (it) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it, nowMs))}`);
    }
  }
}

// --------------------------
// VIEW LIFECYCLE
// --------------------------
export function init() {
  initEstadoUI_();
  initVinAutocomplete_();
  initConversionQR_();

  initIncidenciasUI_();
  initConformidadUI_();

  setConformidadAfterSaveRefresh_(async () => {
    await syncNow({ forceFull: true, showOut: false });
  });

  initRFModalUI_();
  initRFTecModalUI_();

  initConversionDelegation_();

  $("btnActivas")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true }), "Refrescando...");
  });

  $("btnFinalizados")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("btnActivasQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true }), "Refrescando...");
  });

  $("btnFinalizadosQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizadosQ").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      renderFinalizados_();
    }, "Cargando finalizados...");
  });
}

export function enter(mod) {
  CORE.state.currentModule = mod;

  startLoopsFor_(mod, {
    syncNow,
    tickClocksUI: tickClocksUI_,
    refreshEstadoForVinRole,
  });
}

export function exit(mod) {
  stopLoopsFor_(mod);
  clearModuleUI_(mod);
}

export { syncNow } from "./conversion-sync.js";