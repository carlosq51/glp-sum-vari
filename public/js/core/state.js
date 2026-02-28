// =========================
// public/js/core/state.js
// Estado global + contexto por módulo
// =========================

export const MODULES = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];

export const CORE = {
  state: {
    rolLock: null,          // "MOTOR" | "TANQUE" | null
    currentProfile: null,
    currentModule: null,
    uiLocked: false,

    storeByModule: {
      TECNICO: {
        itemsByKey: new Map(),
        activeKeys: [],
        finalKeys: [],
        lastSyncSince: null,
        lastSyncRev: null,
        lastSyncAtMs: 0,
        showFinalizados: false,
      },
      CALIDAD: {
        itemsByKey: new Map(),
        activeKeys: [],
        finalKeys: [],
        lastSyncSince: null,
        lastSyncRev: null,
        lastSyncAtMs: 0,
        showFinalizados: false,
      },
      RAMALERO: {
        itemsByKey: new Map(),
        activeKeys: [],
        finalKeys: [],
        lastSyncSince: null,
        lastSyncRev: null,
        lastSyncAtMs: 0,
        showFinalizados: false,
      },
    },
  },
};

export function ctx_() {
  const m = CORE.state.currentModule;
  if (m === "CALIDAD") return CORE.state.storeByModule.CALIDAD;
  if (m === "RAMALERO") return CORE.state.storeByModule.RAMALERO;
  return CORE.state.storeByModule.TECNICO;
}

export function isWorkModule_() {
  const m = CORE.state.currentModule;
  return m === "TECNICO" || m === "CALIDAD" || m === "RAMALERO";
}