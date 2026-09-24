// =========================
// public/js/core/state.js
// Estado global + contexto por módulo
// =========================

// Los módulos que existen en el enum `modulo` de Supabase y se conceden por
// usuario. Admin pinta sus casillas a partir de esta lista, así que meter aquí
// algo que el enum no acepta rompería el guardado de permisos.
export const MODULES = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];

// Módulos que NO viven en la base: los tiene todo el que entra y no se
// conceden ni se quitan. Van aparte precisamente para no tocar ese enum.
export const MODULES_VIRTUALES = ["CONSULTA"];

// Todo lo que puede llegar a pintarse como vista. Lo usa quien necesita
// recorrer las vistas existentes (ocultarlas, registrarlas), no quien reparte
// permisos.
export const MODULES_TODOS = [...MODULES, ...MODULES_VIRTUALES];

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