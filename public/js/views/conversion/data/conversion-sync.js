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
  if (!_fromLock && CORE.state.uiLocked) {
    console.warn("[syncNow] ⏸️ Ignorado: UI está bloqueada (uiLocked=true)");
    return;
  }
  if (!isWorkModule_()) {
    console.debug("[syncNow] ⏸️ Ignorado: No es work module");
    return;
  }

  let email;
  try { 
    email = requireEmailOrStop();
  }
  catch { 
    console.warn("[syncNow] ⏸️ No hay email");
    return; 
  }

  const syncStartTime = Date.now();
  const c = ctx_();
  if (forceFull) clearNombresCache_();
  const prevA = c.activeKeys.slice();
  const prevF = c.finalKeys.slice();
  const snapNotas = snapshotNotasActivas_();

  console.log(`[syncNow] 🔄 Iniciando sync (forceFull=${forceFull}, from=${_fromLock ? "lock" : "user"})`);
  const apiStartTime = Date.now();
  
  const since = forceFull ? null : c.lastSyncSince;
  const res = await apiSync_(email, since, { forceRefresh: forceFull });
  const apiDuration = Date.now() - apiStartTime;
  console.log(`[syncNow] 📡 apiSync_ completada en ${apiDuration}ms`);
  
  const j = res.data;

  if (showOut) setOut(j);
  
  // ✅ Mejor error handling: siempre mostrar errores importantes
  if (!j || !j.ok) {
    const msg = j?.error || "Error al sincronizar";
    console.warn("[syncNow] ❌ Error:", msg);
    
    // Solo mostrar error si es falla crítica o showOut es true
    if (showOut || msg.includes("Usuario") || msg.includes("no autorizado")) {
      setOut({ ok: false, error: `Sync error: ${msg}` });
    }
    return;
  }

  const storeStartTime = Date.now();
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
  const storeDuration = Date.now() - storeStartTime;
  console.log(`[syncNow] 💾 Store updated en ${storeDuration}ms`);

  const rebuildStartTime = Date.now();
  rebuildListsFromStore_();
  const rebuildDuration = Date.now() - rebuildStartTime;
  console.log(`[syncNow] 🔨 rebuildListsFromStore_ en ${rebuildDuration}ms`);

  // Enriquecer con nombres MOTOR/TANQUERO para Calidad
  let enrichDuration = 0;
  if (CORE.state.currentModule === "CALIDAD") {
    const enrichStartTime = Date.now();
    const byVin = await ensureNombresCache_();
    for (const k of [...c.activeKeys, ...c.finalKeys]) {
      const it = c.itemsByKey.get(k);
      if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) {
        const nombres = byVin.get(it.vin.toUpperCase().trim()) || { motorNombre: "", tanqueroNombre: "" };
        it.motorNombre = nombres.motorNombre;
        it.tanqueroNombre = nombres.tanqueroNombre;
      }
    }
    enrichDuration = Date.now() - enrichStartTime;
    console.log(`[syncNow] 🏭 Enriquecer nombres en ${enrichDuration}ms`);
  }

  const renderStartTime = Date.now();
  const needsFull = forceFull || detectIfNeedsFullRerender_(prevA, prevF);
  if (needsFull) {
    renderActivas_();
    renderFinalizados_();
    restoreNotasActivas_(snapNotas);
  } else {
    patchVisibleCards_();
  }
  const renderDuration = Date.now() - renderStartTime;
  console.log(`[syncNow] 🎨 Render en ${renderDuration}ms`);

  c.lastSyncAtMs = Date.now();
  enforceRolLock_();

  const totalDuration = Date.now() - syncStartTime;
  console.log(`[syncNow] ✅ TOTAL syncNow: ${totalDuration}ms (api:${apiDuration}ms, store:${storeDuration}ms, rebuild:${rebuildDuration}ms, enrich:${enrichDuration}ms, render:${renderDuration}ms)`);

  // ✅ MEJOR: Auto-start SIN_INICIAR solo si NO hay VIN ingresado
  // Evita crear autos duplicados si el usuario está ingresando VINes manualmente
  if (CORE.state.currentModule === "CALIDAD") {
    const vinInput = getVin();
    // Solo hacer auto-start si no hay input de VIN
    if (!vinInput) {
      const first = c.activeKeys
        .map((k) => c.itemsByKey.get(k))
        .find((it) => it && it.rolTrabajo === "CALIDAD" && it.estado === "SIN_INICIAR");
      if (first?.vin) {
        console.log(`[SYNC] Auto-start CALIDAD: ${first.vin}`);
        autoStartFromScan_(first.vin, "CALIDAD").catch((e) => {
          console.warn("[SYNC] Auto-start error:", e.message);
        });
      }
    }
  }

  if (CORE.state.currentModule === "TECNICO") {
    const vinInput = getVin();
    const rolActual = getRolTrabajoCurrent_();
    
    // Solo hacer auto-start si:
    // 1. No hay VIN ingresado en input
    // 2. Hay un rol actual
    if (!vinInput && rolActual) {
      const candidates = c.activeKeys
        .map((k) => c.itemsByKey.get(k))
        .filter((it) => 
          it && 
          (it.rolTrabajo === "MOTOR" || it.rolTrabajo === "TANQUE") && 
          it.estado === "SIN_INICIAR" && 
          String(it.vin || "").trim()
        );
      
      // ✅ Solo iniciar la primera, no todas
      if (candidates.length > 0) {
        const first = candidates[0];
        console.log(`[SYNC] Auto-start TECNICO: ${first.vin} | Rol: ${rolActual} (${candidates.length} candidatas)`);
        autoStartFromScan_(first.vin, rolActual).catch((e) => {
          console.warn("[SYNC] Auto-start error:", e.message);
        });
      }
    }
  }
}