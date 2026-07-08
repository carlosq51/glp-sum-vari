// public/js/views/conversion/state/conversion-store.js

import {
  CORE,
  ctx_,
  getRolTecnico_,
  keyOfItem_,
  vinCacheGet_,
  vinCacheSet_,
  ramalCacheGet_,
  ramalCacheSet_,
  getJSON,
} from "../../../core/core.js";

export { normalizeItem_ } from "../../../work/work-normalize.js";

// --------------------------
// NORMALIZE / MERGE
// --------------------------
export function mergePrevAndCache_(it, prev) {
  if ((!it.vin || it.vin === "") && prev?.vin) it.vin = prev.vin;
  if (!it.vin && it.conversionId && it.rolTrabajo) {
    const cached = vinCacheGet_(it.conversionId, it.rolTrabajo);
    if (cached) it.vin = cached;
  }

  if (it.rolTrabajo === "RAMALERO") {
    if ((!it.tipoRamal || it.tipoRamal === "") && prev?.tipoRamal) it.tipoRamal = prev.tipoRamal;
    if (!it.tipoRamal && it.conversionId) {
      const cachedTipo = ramalCacheGet_(it.conversionId);
      if (cachedTipo) it.tipoRamal = cachedTipo;
    }
  }

  if (prev) {
    if (!it.updated_at) it.updated_at = prev.updated_at || null;
    if (!it.last_nota_ts) it.last_nota_ts = prev.last_nota_ts || null;
    if (!it.created_at) it.created_at = prev.created_at || null;
  }
  return it;
}


export function applySyncResultToStore_(syncData) {
  const c = ctx_();
  const items = Array.isArray(syncData?.items) ? syncData.items : [];
  for (const raw of items) {
    const it = normalizeItem_(raw);
    const k = keyOfItem_(it);
    const prev = c.itemsByKey.get(k);
    mergePrevAndCache_(it, prev);
    c.itemsByKey.set(k, it);
  }
}

export function storeFullReplace_(allItems) {
  const c = ctx_();
  c.itemsByKey.clear();
  c._finalizadosLoaded = false;
  const arr = Array.isArray(allItems) ? allItems : [];
  for (const raw of arr) {
    const it = normalizeItem_(raw);
    const k = keyOfItem_(it);
    mergePrevAndCache_(it, null);
    c.itemsByKey.set(k, it);
  }
}

export function detectIfNeedsFullRerender_(prevActiveKeys, prevFinalKeys) {
  const c = ctx_();
  return (prevActiveKeys.join(",") !== c.activeKeys.join(",") || prevFinalKeys.join(",") !== c.finalKeys.join(","));
}

// --------------------------
// NOMBRES MOTOR/TANQUERO PARA CALIDAD
// --------------------------
let _nombresCache = null;   // { ts, byVin: Map<VIN, {motorNombre,tanqueroNombre}> }
const NOMBRES_TTL_MS = 5 * 60 * 1000; // 5 min

export function clearNombresCache_() { _nombresCache = null; }

export async function ensureNombresCache_() {
  const now = Date.now();
  if (_nombresCache && (now - _nombresCache.ts) < NOMBRES_TTL_MS) return _nombresCache.byVin;

  try {
    const j = await getJSON("/api/supervisor/report?track=CONVERSION");
    const byVin = new Map();
    if (j?.ok && Array.isArray(j.items)) {
      for (const it of j.items) {
        const vin = String(it.vin || "").toUpperCase().trim();
        if (!vin) continue;
        const rol = String(it.rol || "").toUpperCase();
        const entry = byVin.get(vin) || { motorNombre: "", tanqueroNombre: "" };
        if (rol === "MOTOR") entry.motorNombre = String(it.userName || "").trim();
        if (rol === "TANQUE" || rol === "TANQUERO") entry.tanqueroNombre = String(it.userName || "").trim();
        byVin.set(vin, entry);
      }
    }
    _nombresCache = { ts: now, byVin };
    return byVin;
  } catch {
    const byVin = new Map();
    _nombresCache = { ts: now, byVin };
    return byVin;
  }
}

export async function fetchNombresParaVin_(vin) {
  const vinUp = String(vin || "").toUpperCase().trim();
  const byVin = await ensureNombresCache_();
  return byVin.get(vinUp) || { motorNombre: "", tanqueroNombre: "" };
}