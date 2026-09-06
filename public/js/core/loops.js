// =========================
// public/js/core/loops.js
// Loops sin circular imports: recibe callbacks
//
// Los dos bucles que hablan con la RED (sync de "mis activas" y estado del VIN
// escrito) van por startPoll, no por setInterval. Antes eran timers crudos y se
// quedaban fuera de todo lo que core/poll.js aporta: seguían latiendo con la app
// en segundo plano —el celular del técnico en el bolsillo toda la jornada— y sus
// intervalos estaban hardcodeados aquí, así que no había forma de tocarlos sin
// redeploy. Ahora salen de POLL_TEC_SYNC_MS y POLL_TEC_ESTADO_MS.
//
// El reloj de las tarjetas sí sigue en setInterval: es pintar segundos en
// pantalla, no pide nada a nadie, y pausarlo dejaría los cronómetros congelados.
// =========================
import { CORE, ctx_ } from "./state.js";
import { el_ } from "./dom.js";
import { setEstadoText } from "./ui-shell.js";
import { startPoll, stopPoll } from "./poll.js";

import { renderFinalizados_ } from "../work/index.js";

const timersByModule = {
  TECNICO: { clockTimer: null, syncStopped: false },
  CALIDAD: { clockTimer: null, syncStopped: false },
  RAMALERO: { clockTimer: null, syncStopped: false },
};

// Claves de poll por módulo: únicas por módulo para que cambiar de vista pare
// las del módulo anterior sin tocar las del nuevo.
const syncKey_   = (mod) => `TEC_SYNC:${mod}`;
const estadoKey_ = (mod) => `TEC_ESTADO:${mod}`;

function tctx_(mod) {
  return timersByModule[mod] || timersByModule.TECNICO;
}

export function stopLoopsFor_(mod) {
  const t = tctx_(mod);

  t.syncStopped = true;

  stopPoll(syncKey_(mod));
  stopPoll(estadoKey_(mod));

  if (t.clockTimer) clearInterval(t.clockTimer);
  t.clockTimer = null;
}

export function clearModuleUI_(mod) {
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;

  try {
    if (mod === "RAMALERO") {
      // Vuelve al default, no a vacío: JETOUR es la mayoría del trabajo y
      // dejar el select en blanco obligaba a elegirlo otra vez cada día.
      const tipoEl = document.getElementById("tipoRamal");
      if (tipoEl) tipoEl.value = "JETOUR";
    } else {
      const vinEl = el_("vin");
      if (vinEl) vinEl.value = "";
    }

    const act = el_("activasBox");
    if (act) act.innerHTML = "";

    const fin = el_("finalizadosBox");
    if (fin) fin.innerHTML = "";

    setEstadoText("");

    const c = ctx_();
    c.showFinalizados = false;
    c.itemsByKey.clear();
    c.activeKeys = [];
    c.finalKeys = [];
    c.lastSyncSince = null;
    c.lastSyncRev = null;
    c.lastSyncAtMs = 0;
  } finally {
    CORE.state.currentModule = prev;
  }
}

export function startLoopsFor_(
  mod,
  { syncNow, tickClocksUI, refreshEstadoForVinRole, buildAvgTopHTML } = {}
) {
  stopLoopsFor_(mod);

  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;

  try {
    const t = tctx_(mod);
    t.syncStopped = false;

    // primer sync inmediato
    Promise.resolve(syncNow?.({ forceFull: true, showOut: false }))
      .catch((err) => {
        console.error(`[${mod}] initial sync error:`, err);
      })
      .finally(() => {
        // El poll arranca DESPUÉS del sync completo y sin repetirlo
        // (immediate:false): entrar a la vista pedía las mismas activas dos
        // veces, la segunda diez segundos después de la primera.
        if (t.syncStopped || !syncNow) return;
        startPoll(syncKey_(mod), async () => {
          try {
            await syncNow({ forceFull: false, showOut: false });
          } catch (err) {
            console.error(`[${mod}] sync loop error:`, err);
          }
        }, { immediate: false, cfgKey: "POLL_TEC_SYNC_MS" });
      });

    t.clockTimer = setInterval(() => {
      tickClocksUI?.();
    }, 1000);

    if (mod === "TECNICO" || mod === "CALIDAD") {
      startPoll(estadoKey_(mod), () => refreshEstadoForVinRole?.({ showOut: false }),
        { immediate: false, cfgKey: "POLL_TEC_ESTADO_MS" });

      setTimeout(() => {
        refreshEstadoForVinRole?.({ showOut: false }).catch(() => {});
      }, 700);
    }

    const c = ctx_();
    if (c.showFinalizados) {
      const avgTop = buildAvgTopHTML ? (buildAvgTopHTML() || "") : "";
      renderFinalizados_(avgTop);
    }
  } finally {
    CORE.state.currentModule = prev;
  }
}