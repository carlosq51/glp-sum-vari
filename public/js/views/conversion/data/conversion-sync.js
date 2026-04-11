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
} from "../state/conversion-store.js";

import { autoStartFromScan_ } from "./conversion-eventos.js";
import { fetchNombresParaVin_, ensureNombresCache_, clearNombresCache_ } from "../state/conversion-store.js";

// --------------------------
// SYNC
// --------------------------
export async function apiSync_(email, since, { forceRefresh = false } = {}) {
  const t0 = performance.now();
  
  if (supabaseEnabled()) {
    // 🚀 LECTURA DIRECTA DE SUPABASE (Sin Node proxy)
    try {
      const t1 = performance.now();
      const items = await getMisActivas(email);
      const dur = performance.now() - t1;
      console.log(`  ⏱ getMisActivas (Supabase): ${dur.toFixed(0)}ms`);
      return { mode: "sync", data: { ok: true, items } };
    } catch (err) {
      console.warn("[apiSync_] Supabase error:", err.message);
      // Fallback a Node API
    }
  }
  
  // Fallback: Node API
  try {
    const t1 = performance.now();
    const body = { email, since, excludeFinalizados: true, forceRefresh };
    const j = await postJSON("/api/sync", body);
    const dur = performance.now() - t1;
    console.log(`  ⏱ postJSON /api/sync: ${dur.toFixed(0)}ms`);
    if (j && j.ok) return { mode: "sync", data: j };
  } catch {}
  
  const t1 = performance.now();
  const j2 = await getJSON(`/api/mis-activas?email=${encodeURIComponent(email)}&excludeFinalizados=true&_t=${Date.now()}`);
  const dur = performance.now() - t1;
  console.log(`  ⏱ getJSON /api/mis-activas: ${dur.toFixed(0)}ms`);
  return { mode: "legacy", data: j2 };
}

export async function fetchFinalizados_(email) {
  const t0 = performance.now();
  
  if (supabaseEnabled()) {
    // 🚀 LECTURA DIRECTA DE SUPABASE (Sin Node proxy)
    try {
      const t1 = performance.now();
      const items = await getMisFinalizadas(email);
      const dur = performance.now() - t1;
      console.log(`  ⏱ getMisFinalizadas (Supabase): ${dur.toFixed(0)}ms`);
      return { ok: true, items };
    } catch (err) {
      console.warn("[fetchFinalizados_] Supabase error:", err.message);
      // Fallback a Node API
    }
  }
  
  // Fallback: Node API
  const t1 = performance.now();
  const res = await getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}`);
  const dur = performance.now() - t1;
  console.log(`  ⏱ getJSON /api/mis-finalizadas: ${dur.toFixed(0)}ms`);
  return res;
}

export async function syncNow({ forceFull = false, showOut = false, _fromLock = false } = {}) {
  console.log("🔵 [syncNow] CALLED - forceFull=%o, showOut=%o, _fromLock=%o", forceFull, showOut, _fromLock);
  console.log("  uiLocked=%o, isWorkModule=%o", CORE.state.uiLocked, isWorkModule_());
  
  if (!_fromLock && CORE.state.uiLocked) {
    console.log("  ⛔ UI LOCKED - regresando");
    return;
  }
  if (!isWorkModule_()) {
    console.log("  ⛔ NO ES WORK MODULE - regresando");
    return;
  }

  let email;
  try { 
    email = requireEmailOrStop();
    console.log("  ✓ email=%o", email);
  }
  catch (e) { 
    console.log("  ⛔ NO EMAIL - regresando", e.message);
    return; 
  }

  const c = ctx_();
  if (forceFull) clearNombresCache_();
  const prevA = c.activeKeys.slice();
  const prevF = c.finalKeys.slice();
  const snapNotas = snapshotNotasActivas_();

  // 🚀 TIMING: inicia sync
  const t0 = performance.now();
  console.log(`[syncNow] iniciando... forceFull=${forceFull}`);

  const since = forceFull ? null : c.lastSyncSince;
  
  // 🚀 TIMING: fetch de activas
  const t1 = performance.now();
  const res = await apiSync_(email, since, { forceRefresh: forceFull });
  const durFetchActivas = performance.now() - t1;
  console.log(`⏱ fetch activas: ${durFetchActivas.toFixed(0)}ms`);
  
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

  // 🚀 TIMING: rebuild store
  const t2 = performance.now();
  rebuildListsFromStore_();
  const durRebuild = performance.now() - t2;
  console.log(`⏱ rebuilding store: ${durRebuild.toFixed(0)}ms`);

  // Enriquecer con nombres MOTOR/TANQUERO para Calidad
  if (CORE.state.currentModule === "CALIDAD") {
    const t3 = performance.now();
    const byVin = await ensureNombresCache_();
    const durNombresFetch = performance.now() - t3;
    console.log(`⏱ fetch nombres: ${durNombresFetch.toFixed(0)}ms`);
    
    const t4 = performance.now();
    for (const k of [...c.activeKeys, ...c.finalKeys]) {
      const it = c.itemsByKey.get(k);
      if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) {
        const nombres = byVin.get(it.vin.toUpperCase().trim()) || { motorNombre: "", tanqueroNombre: "" };
        it.motorNombre = nombres.motorNombre;
        it.tanqueroNombre = nombres.tanqueroNombre;
      }
    }
    const durNombresEnrich = performance.now() - t4;
    console.log(`⏱ enrich nombres in items: ${durNombresEnrich.toFixed(0)}ms`);
  }

  // 🚀 TIMING: render
  const t5 = performance.now();
  const needsFull = forceFull || detectIfNeedsFullRerender_(prevA, prevF);
  if (needsFull) {
    renderActivas_();
    renderFinalizados_();
    restoreNotasActivas_(snapNotas);
  } else {
    patchVisibleCards_();
  }
  const durRender = performance.now() - t5;
  console.log(`⏱ render: ${durRender.toFixed(0)}ms (needsFull=${needsFull})`);

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

  // 🚀 TIMING: total
  const durTotal = performance.now() - t0;
  console.log(`✅ [syncNow] completado en ${durTotal.toFixed(0)}ms`);
}