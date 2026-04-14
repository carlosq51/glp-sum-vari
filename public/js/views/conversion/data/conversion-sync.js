// public/js/views/conversion/data/conversion-sync.js

import {
  CORE,
  ctx_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setOut,
  postJSON,
  getJSON,
  enforceRolLock_,
  isWorkModule_,
  withLock,
} from "../../../core/core.js";

import { getMisActivas, getMisFinalizadas, supabaseEnabled, subscribeToChanges } from "../../../core/supabase-client.js";

import {
  rebuildListsFromStore_,
  renderActivas_,
  renderFinalizados_,
  patchVisibleCards_,
  snapshotNotasActivas_,
  restoreNotasActivas_,
} from "../../../work/index.js";

import {
  applySyncResultToStore_,
  storeFullReplace_,
  detectIfNeedsFullRerender_,
} from "../state/conversion-store.js";

import { autoStartFromScan_ } from "./conversion-eventos.js";
import { fetchNombresParaVin_, ensureNombresCache_, clearNombresCache_ } from "../state/conversion-store.js";

// --------------------------
// REALTIME INITIALIZATION
// --------------------------
let realtimeUnsubscribers = [];

export async function initializeRealtime_() {
  if (!supabaseEnabled()) return;
  
  // Tabla asignaciones
  realtimeUnsubscribers.push(
    await subscribeToChanges("asignaciones", (payload) => {
      handleRealtimeChange_("asignaciones", payload);
    })
  );
  
  // Tabla work_orders
  realtimeUnsubscribers.push(
    await subscribeToChanges("work_orders", (payload) => {
      handleRealtimeChange_("work_orders", payload);
    })
  );
  
  // Tabla incidencias
  realtimeUnsubscribers.push(
    await subscribeToChanges("incidencias", (payload) => {
      handleRealtimeChange_("incidencias", payload);
    })
  );
}

export function destroyRealtime_() {
  realtimeUnsubscribers.forEach(unsub => {
    try { unsub(); } catch (e) { console.warn("Unsub error:", e); }
  });
  realtimeUnsubscribers = [];
}

function handleRealtimeChange_(tableName, payload) {
  const c = ctx_();
  if (!c) return;
  
  // Solo procesar si es un cambio relevante
  if (tableName === "asignaciones") {
    // Cambio en asignaciones → refrescar automáticamente
    syncNow({ forceFull: false, showOut: false })
      .catch(e => console.warn("[Realtime] Sync error:", e.message));
  } else if (tableName === "work_orders") {
    // Cambio en work_orders → refrescar la lista
    syncNow({ forceFull: false, showOut: false })
      .catch(e => console.warn("[Realtime] Sync error:", e.message));
  } else if (tableName === "incidencias") {
    // Cambio en incidencias → solo si estamos en esa vista
    if (CORE.state.currentModule === "INCIDENCIAS") {
      syncNow({ forceFull: false, showOut: false })
        .catch(e => console.warn("[Realtime] Sync error:", e.message));
    }
  }
}

// --------------------------
// SYNC (sin logs de timing)
// --------------------------
export async function apiSync_(email, since, { forceRefresh = false } = {}) {
  if (supabaseEnabled()) {
    try {
      const items = await getMisActivas(email);
      return { mode: "sync", data: { ok: true, items } };
    } catch (err) {
      console.warn("[apiSync_] Supabase error:", err.message);
    }
  }
  
  // Fallback: Node API
  try {
    const body = { email, since, excludeFinalizados: true, forceRefresh };
    const j = await postJSON("/api/sync", body);
    if (j && j.ok) return { mode: "sync", data: j };
  } catch {}
  
  const j2 = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}&excludeFinalizados=true&_t=${Date.now()}`);
  return { mode: "legacy", data: j2 };
}

export async function fetchFinalizados_(email) {
  if (supabaseEnabled()) {
    try {
      const items = await getMisFinalizadas(email);
      return { ok: true, items };
    } catch (err) {
      console.warn("[fetchFinalizados_] Supabase error:", err.message);
    }
  }
  
  // Fallback: Node API
  return getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}`);
}

export async function syncNow({ forceFull = false, showOut = false, _fromLock = false } = {}) {
  if (!_fromLock && CORE.state.uiLocked) return;
  if (!isWorkModule_()) return;

  let email;
  try { 
    email = requireEmailOrStop();
  }
  catch { 
    return; 
  }

  const c = ctx_();
  if (forceFull) clearNombresCache_();
  const prevA = c.activeKeys.slice();
  const prevF = c.finalKeys.slice();
  const snapNotas = snapshotNotasActivas_();

  const since = forceFull ? null : c.lastSyncSince;
  const res = await apiSync_(email, since, { forceRefresh: forceFull });
  const j = res.data;

  if (showOut) setOut(j);
  if (!j || !j.ok) return;

  if (res.mode === "legacy") {
    storeFullReplace_(j.items || []);
    c.lastSyncSince = new Date().toISOString();
    c.lastSyncRev = null;
  } else {
    if (j.full) storeFullReplace_(j.items || []);
    else applySyncResultToStore_(j);

    c.lastSyncSince = j.server_time || new Date().toISOString();
    c.lastSyncRev = j.rev || c.lastSyncRev;
  }

  rebuildListsFromStore_();

  // Enriquecer con nombres MOTOR/TANQUERO para Calidad
  if (CORE.state.currentModule === "CALIDAD") {
    const byVin = await ensureNombresCache_();
    for (const k of [...c.activeKeys, ...c.finalKeys]) {
      const it = c.itemsByKey.get(k);
      if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) {
        const nombres = byVin.get(it.vin.toUpperCase().trim()) || { motorNombre: "", tanqueroNombre: "" };
        it.motorNombre = nombres.motorNombre;
        it.tanqueroNombre = nombres.tanqueroNombre;
      }
    }
  }

  const needsFull = forceFull || detectIfNeedsFullRerender_(prevA, prevF);
  if (needsFull) {
    renderActivas_();
    renderFinalizados_();
    restoreNotasActivas_(snapNotas);
  } else {
    patchVisibleCards_();
  }

  c.lastSyncAtMs = Date.now();
  enforceRolLock_();

  // auto-start básico
  if (CORE.state.currentModule === "CALIDAD") {
    const first = c.activeKeys.map((k) => c.itemsByKey.get(k)).find((it) => it && it.rolTrabajo === "CALIDAD" && it.estado === "SIN_INICIAR");
    if (first?.vin) autoStartFromScan_(first.vin, "CALIDAD").catch(() => {});
  }
  if (CORE.state.currentModule === "TECNICO") {
    const vinInput = getVin();
    let vinCandidato = vinInput;
    if (!vinCandidato) {
      const first = c.activeKeys.map((k) => c.itemsByKey.get(k)).find((it) => it && (it.rolTrabajo === "MOTOR" || it.rolTrabajo === "TANQUE") && it.estado === "SIN_INICIAR" && String(it.vin || "").trim());
      vinCandidato = String(first?.vin || "").trim().toUpperCase();
    }
    if (vinCandidato) autoStartFromScan_(vinCandidato, getRolTrabajoCurrent_()).catch(() => {});
  }
}