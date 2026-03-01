// =========================
// public/js/core/loops.js
// Loops sin circular imports: recibe callbacks
// =========================
import { CORE, ctx_ } from "./state.js";
import { el_ } from "./dom.js";
import { setEstadoText } from "./ui-shell.js";

import { snapshotNotasActivas_, restoreNotasActivas_, renderActivas_, renderFinalizados_ } from "../work/index.js";

const timersByModule = {
  TECNICO: { syncTimer: null, clockTimer: null, estadoTimer: null },
  CALIDAD: { syncTimer: null, clockTimer: null, estadoTimer: null },
  RAMALERO: { syncTimer: null, clockTimer: null, estadoTimer: null },
};

function tctx_(mod) {
  return timersByModule[mod] || timersByModule.TECNICO;
}

export function stopLoopsFor_(mod) {
  const t = tctx_(mod);
  if (t.syncTimer) clearInterval(t.syncTimer);
  if (t.clockTimer) clearInterval(t.clockTimer);
  if (t.estadoTimer) clearInterval(t.estadoTimer);
  t.syncTimer = t.clockTimer = t.estadoTimer = null;
}

export function clearModuleUI_(mod) {
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;
  try {
    if (mod === "RAMALERO") {
      const ramalIdEl = document.getElementById("ramalId");
      if (ramalIdEl) ramalIdEl.value = "";
      const tipoEl = document.getElementById("tipoRamal");
      if (tipoEl) tipoEl.value = "";
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

export function startLoopsFor_(mod, { syncNow, tickClocksUI, refreshEstadoForVinRole, buildAvgTopHTML } = {}) {
  stopLoopsFor_(mod);

  // set currentModule temporal para que el_ ctx_ funcionen
  const prev = CORE.state.currentModule;
  CORE.state.currentModule = mod;

  try {
    syncNow?.({ forceFull: true, showOut: false }).catch(() => {});

    const t = tctx_(mod);

    t.syncTimer = setInterval(() => syncNow?.({ forceFull: false, showOut: false }), 10000);
    t.clockTimer = setInterval(() => tickClocksUI?.(), 1000);

    if (mod === "TECNICO" || mod === "CALIDAD") {
      t.estadoTimer = setInterval(() => refreshEstadoForVinRole?.({ showOut: false }), 8000);
      setTimeout(() => refreshEstadoForVinRole?.({ showOut: false }).catch(() => {}), 700);
    }

    // render finalizados (si ya estaban abiertos) con top card opcional
    const c = ctx_();
    if (c.showFinalizados) {
      const avgTop = buildAvgTopHTML ? (buildAvgTopHTML() || "") : "";
      renderFinalizados_(avgTop);
    }
  } finally {
    CORE.state.currentModule = prev;
  }
}