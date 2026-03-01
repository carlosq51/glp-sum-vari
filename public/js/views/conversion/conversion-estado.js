// public/js/views/conversion/conversion-estado.js

import {
  CORE,
  $,
  ctx_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setEstadoText,
  setOut,
  getJSON,
  msToHMS_,
  withLock,
  keyOfItem_,
} from "../../core/core.js";

import {
  computeLiveMs_,
  rebuildListsFromStore_,
  renderActivas_,
  renderFinalizados_,
} from "../../work/index.js";

import { isWorkModule_ } from "../../core/core.js";
import { normalizeItem_ } from "./conversion-store.js";
import { syncNow } from "./conversion-sync.js";

let estadoDebounceTimer_ = null;

// --------------------------
// ESTADO VIN/ROL
// --------------------------
export async function refreshEstadoForVinRole({ showOut = false } = {}) {
  if (CORE.state.uiLocked) return;
  if (!isWorkModule_()) return;

  let email;
  try { email = requireEmailOrStop(); }
  catch { return; }

  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  const vin = getVin();
  const rolTrabajo = getRolTrabajoCurrent_();
  if (!vin) { setEstadoText(""); return; }

  const c = ctx_();
  const v = vin.toUpperCase();
  for (const it of c.itemsByKey.values()) {
    if (String(it.vin || "").toUpperCase() === v && String(it.rolTrabajo || "").toUpperCase() === rolTrabajo) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it))}`);
      return;
    }
  }

  const j = await getJSON(`/api/estado?email=${encodeURIComponent(email)}&vin=${encodeURIComponent(vin)}&rolTrabajo=${encodeURIComponent(rolTrabajo)}`);
  if (showOut) setOut(j);
  if (!j?.ok) { setEstadoText(j?.error || "Error"); return; }

  const it2 = normalizeItem_(j);
  const k2 = keyOfItem_(it2);
  c.itemsByKey.set(k2, it2);

  rebuildListsFromStore_();
  renderActivas_();
  renderFinalizados_();

  setEstadoText(`Estado: ${it2.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it2))}`);
}

export function scheduleEstadoRefresh_(ms = 500) {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;
  clearTimeout(estadoDebounceTimer_);
  estadoDebounceTimer_ = setTimeout(() => refreshEstadoForVinRole({ showOut: false }).catch(() => {}), ms);
}

export function initEstadoUI_() {
  $("btnEstado")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
    }, "Buscando / creando OT...");
  });

  $("btnEstadoQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      await refreshEstadoForVinRole({ showOut: true });
      await syncNow({ forceFull: true, showOut: false });
    }, "Buscando / creando OT...");
  });

  $("rol")?.addEventListener("change", () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    scheduleEstadoRefresh_(0);
  });
}