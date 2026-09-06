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



import { getMisActivas, getMisFinalizadas, supabaseEnabled } from "../../../core/supabase-client.js";



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
import { checkPendingAlerts_ } from "../modals/incidencia-alert.js";
import { showRamalEntregadoAlert } from "../modals/ramal-alert.js";



// --------------------------
// AVISOS EN VIVO (SSE)
//
// Esto colgaba de subscribeToChanges(), cuatro WebSockets por dispositivo
// contra Supabase Realtime. El handshake que enviaban ({type:"subscribe"}) no
// es el de Supabase —espera un phx_join con la config de postgres_changes—, así
// que esos sockets no recibieron nunca un solo cambio: los dos avisos que
// cuelgan de aquí (incidencia asignada y ramal entregado) llevaban todo ese
// tiempo sin dispararse. Encima el reintento de onclose añadía un listener en
// vez de reabrir el socket, y con 30 técnicos eran ~120 conexiones simultáneas
// del límite del plan, a cambio de nada.
//
// El canal que sí funciona es el SSE de este servidor (core/live.js): toda
// mutación pasa por él, llega en <1s y no cuesta egress de Supabase. La lista de
// activas la refresca el propio poll, que live.js despierta con el topic
// "asignaciones"; aquí quedan solo los dos avisos que necesitan mirar QUIÉN es
// el usuario logueado.
// --------------------------

let liveHandler_ = null;



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



/**
 * Reacciona a un evento del SSE. Solo los avisos que dependen de QUIÉN mira:
 * el refresco de la lista lo dispara live.js despertando el poll de sync.
 *
 * @param {{topic:string, accion?:string, vin?:string, tecnico_email?:string}} msg
 */
function handleLiveEvent_(msg) {
  const c = ctx_();
  if (!c) return;

  const email = String(document.getElementById("email")?.value || "").trim().toLowerCase();
  if (!email) return;

  if (msg.topic === "incidencias" && msg.accion === "CREADA") {
    // El evento no trae la fila (el SSE solo manda vin y acción), así que se
    // relee lo pendiente del técnico. Es la MISMA función que corre al entrar a
    // la vista y descarta por id lo que ya está en pantalla, así que repetirla
    // no duplica popups.
    checkPendingAlerts_(email, 12).catch(() => {});
    if (CORE.state.currentModule === "INCIDENCIAS") {
      scheduleSync_({ forceFull: false, showOut: false }, 400);
    }
    return;
  }

  if (msg.topic === "ramal" && msg.accion === "ENTREGADA") {
    if (String(msg.tecnico_email || "").trim().toLowerCase() === email) {
      showRamalEntregadoAlert({ vin: msg.vin || "" });
    }
  }
}

export function initAvisosLive_() {
  if (liveHandler_) return;
  liveHandler_ = (ev) => {
    try { handleLiveEvent_(ev.detail || {}); }
    catch (e) { console.warn("[live] Error al procesar evento:", e); }
  };
  window.addEventListener("glp:live", liveHandler_);
}

export function stopAvisosLive_() {
  if (!liveHandler_) return;
  window.removeEventListener("glp:live", liveHandler_);
  liveHandler_ = null;
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

    const pendientesNombres_ = [];
    for (const [, it] of c.itemsByKey) {
      if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) pendientesNombres_.push(it.vin);
    }
    // Solo los VINs que AUN no tienen nombre: esta llamada bajaba antes el
    // reporte completo del supervisor (768 KB) para resolver un punado.
    const byVin = await ensureNombresCache_(pendientesNombres_);

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
