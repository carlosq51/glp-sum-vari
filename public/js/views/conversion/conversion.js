/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { initIncidenciasUI_ } from "./modals/incidencias.js";
import { initRFModalUI_ } from "./modals/rf-modal.js";
import { initRFTecModalUI_ } from "./modals/rf-tecnico-modal.js";
import { initConfirmFinishUI_ } from "./modals/confirm-finish.js";
import { initErrorModal } from "./modals/error-modal.js";
import {
  initConformidadUI_,
  setConformidadAfterSaveRefresh_,
} from "./modals/conformidad.js";

import {
  CORE,
  $,
  el_,
  ctx_,
  isWorkModule_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setEstadoText,
  msToHMS_,
  withLock,
} from "../../core/core.js";

import { computeLiveMs_, renderFinalizados_, rebuildListsFromStore_ } from "../../work/index.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";

import { syncNow, fetchFinalizados_, initializeRealtime_, destroyRealtime_ } from "./data/conversion-sync.js";
import {
  refreshEstadoForVinRole,
  initEstadoUI_,
} from "./data/conversion-estado.js";
import { initConversionDelegation_ } from "./ui/conversion-delegation.js";
import { initVinAutocomplete_ } from "./ui/conversion-vin-autocomplete.js";
import { initConversionQR_ } from "./ui/conversion-qr.js";

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
  initConfirmFinishUI_();
  initErrorModal();

  setConformidadAfterSaveRefresh_(async () => {
    await syncNow({ forceFull: true, showOut: false });
  });

  initRFModalUI_();
  initRFTecModalUI_();

  initConversionDelegation_();

  $("btnActivas")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });

  $("btnFinalizados")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await fetchFinalizados_(email);
        if (j?.ok && Array.isArray(j.items)) {
          const { normalizeItem_ } = await import("./state/conversion-store.js");
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

  $("btnActivasQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });

  $("btnFinalizadosQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizadosQ").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await fetchFinalizados_(email);
        if (j?.ok && Array.isArray(j.items)) {
          const { normalizeItem_, ensureNombresCache_ } = await import("./state/conversion-store.js");
          for (const raw of j.items) {
            const it = normalizeItem_(raw);
            const k = `${it.conversionId}|${it.rolTrabajo}`;
            c.itemsByKey.set(k, it);
          }
          // Enriquecer finalizados con nombres MOTOR/TANQUERO
          const byVin = await ensureNombresCache_();
          for (const [, it] of c.itemsByKey) {
            if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) {
              const nombres = byVin.get(it.vin.toUpperCase().trim()) || {};
              it.motorNombre = nombres.motorNombre || "";
              it.tanqueroNombre = nombres.tanqueroNombre || "";
            }
          }
          rebuildListsFromStore_();
          c._finalizadosLoaded = true;
        }
      }
      renderFinalizados_();
    }, "Cargando finalizados...");
  });
}

export function enter(mod) {
  CORE.state.currentModule = mod;

  // 🚀 Inicializar Realtime subscriptions
  initializeRealtime_()
    .catch(e => console.warn("[enter] Realtime init error:", e.message));

  startLoopsFor_(mod, {
    syncNow,
    tickClocksUI: tickClocksUI_,
    refreshEstadoForVinRole,
  });
}

export function exit(mod) {
  stopLoopsFor_(mod);
  clearModuleUI_(mod);
  
  // 🚀 Limpiar Realtime subscriptions
  destroyRealtime_();
}

export { syncNow } from "./data/conversion-sync.js";