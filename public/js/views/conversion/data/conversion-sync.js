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

  clearNombresCache_,

  fetchNombresParaVin_, 

  ensureNombresCache_,

} from "../state/conversion-store.js";



import { autoStartFromScan_ } from "./conversion-eventos.js";
import { isFinalizado_ } from "../../../work/work-status.js";
import { showIncidenciaAlert, getMyNombre_ } from "../modals/incidencia-alert.js";



// --------------------------

// REALTIME INITIALIZATION

// --------------------------

let realtimeUnsubscribers = [];



// --------------------------

// DEBOUNCE para evitar mÃºltiples syncs simultÃ¡neas

// --------------------------

let lastSyncTime = 0;

let pendingSyncTimer = null;



function scheduleSync_(opts, delay = 400) {

  clearTimeout(pendingSyncTimer);

  

  const now = Date.now();

  const timeSinceLastSync = now - lastSyncTime;

  

  // Si hace poco que sincronizÃ³, esperar un poco antes de sincronizar nuevamente

  if (timeSinceLastSync < delay) {

    const waitTime = delay - timeSinceLastSync;

    pendingSyncTimer = setTimeout(() => {

      syncNow(opts).catch(e => console.warn("[scheduleSync] Error:", e));

    }, waitTime);

  } else {

    // Sincronizar inmediatamente

    syncNow(opts).catch(e => console.warn("[scheduleSync] Error:", e));

  }

}



function handleRealtimeChange_(tableName, payload) {

  const c = ctx_();

  if (!c) return;

  

  // Solo procesar si es un cambio relevante

  if (tableName === "asignaciones") {

    // Cambio en asignaciones â†’ refrescar automÃ¡ticamente (con debounce)

    scheduleSync_({ forceFull: false, showOut: false }, 400);

  } else if (tableName === "work_orders") {

    // Cambio en work_orders â†’ refrescar la lista (con debounce)

    scheduleSync_({ forceFull: false, showOut: false }, 400);

  } else if (tableName === "incidencias") {

    // Cambio en incidencias â†’ solo si estamos en esa vista (con debounce)

    if (CORE.state.currentModule === "INCIDENCIAS") {

      scheduleSync_({ forceFull: false, showOut: false }, 400);

    }
    // Popup de alerta: si el INSERT es para el técnico logueado
    const row = payload?.new;
    if (row && row.tecnico) {
      try {
        const myEmail = String(
          document.getElementById("email")?.value || ""
        ).trim().toLowerCase();
        if (myEmail) {
          getMyNombre_(myEmail).then(myNombre => {
            if (myNombre && String(row.tecnico || "").trim() === myNombre.trim()) {
              showIncidenciaAlert(row);
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("[incidencia-alert] Error al evaluar popup:", e);
      }
    }
  }

}



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



// --------------------------

// SYNC (sin logs de timing)

// --------------------------

export async function apiSync_(email, since, { forceRefresh = false } = {}) {

  if (supabaseEnabled()) {

    try {

      const items = await getMisActivas(email);

      // El userId ahora estÃ¡ cacheado en getMisActivas (primera llamada solamente)

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



  // Preservar finalizados cargados antes de reemplazar el store
  const hadFins = !!c._finalizadosLoaded;
  const savedFins = new Map();
  if (hadFins) {
    for (const [k, it] of c.itemsByKey) {
      if (isFinalizado_(it)) savedFins.set(k, it);
    }
  }

  if (res.mode === "legacy" || forceFull) {

    storeFullReplace_(j.items || []);

    c.lastSyncSince = j.server_time || new Date().toISOString();

    c.lastSyncRev = j.rev || null;

  } else {

    if (j.full) storeFullReplace_(j.items || []);

    else applySyncResultToStore_(j);



    c.lastSyncSince = j.server_time || new Date().toISOString();

    c.lastSyncRev = j.rev || c.lastSyncRev;

  }

  // Restaurar finalizados preservados
  if (hadFins && savedFins.size) {
    for (const [k, it] of savedFins) {
      if (!c.itemsByKey.has(k)) c.itemsByKey.set(k, it);
    }
    c._finalizadosLoaded = true;
  }



  rebuildListsFromStore_();



  // ðŸ” NOTA: Enriquecimiento SIN asyncâ€”removido para prevenir duplicados

  // El VIN se enriquecerÃ¡ lazily cuando se renderice el item si es necesario

  

  // ðŸ“Š Enriquecimiento Nombres MOTOR/TANQUERO para Calidad (sync, sin await)

  if (CORE.state.currentModule === "CALIDAD") {

    const byVin = await ensureNombresCache_();

    for (const [k, it] of c.itemsByKey) {

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

  lastSyncTime = Date.now(); // ðŸ”„ Actualizar marcador de debounce

  enforceRolLock_();

}
