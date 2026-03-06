// =========================
// public/js/work/index.js
// Barrel: re-exporta toda la lógica de trabajo
// =========================

export { isFinalizado_, allowedActionsByEstado, shouldShowItemInCurrentModule_ } from "./work-status.js";
export { computeLiveMs_ } from "./work-time.js";
export { buildBotonesByEstado_, buildAsignadoHTML_, buildIncidenciasBtnHTML_ } from "./work-templates.js";
export { snapshotNotasActivas_, restoreNotasActivas_ } from "./work-notes.js";
export { rebuildListsFromStore_ } from "./work-store.js";
export { renderActivas_, renderFinalizados_, patchVisibleCards_ } from "./work-render.js";