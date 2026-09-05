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

import { normalizeItem_ } from "../../../work/work-normalize.js";
export { normalizeItem_ };

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
// Cache POR VIN, no un volcado global.
//
// Antes esto se resolvía pidiendo /api/supervisor/report?track=CONVERSION: el
// reporte ENTERO del supervisor —1003 items, 768 KB al cliente y ~1.5 MB de
// lecturas en Supabase— cada 5 minutos y por cada inspector, para sacar dos
// nombres de los pocos VINs que tiene en pantalla. Era, con diferencia, la
// consulta más cara del sistema, y encima invisible: vivía en el store de una
// vista, no en la vista misma.
//
// Ahora se piden solo los VINs que faltan (/api/nombres-por-vin): 0.97 KB para
// cinco VINs. Cada entrada caduca por su cuenta, así que un VIN ya resuelto no
// vuelve a pedirse aunque aparezcan otros nuevos al lado.
const _nombresPorVin = new Map();   // VIN → { ts, nombres:{motorNombre,tanqueroNombre} }
const NOMBRES_TTL_MS = 5 * 60 * 1000; // 5 min

export function clearNombresCache_() { _nombresPorVin.clear(); }

/**
 * Resuelve los nombres MOTOR/TANQUERO de los VINs dados.
 * @param {string[]} vins  VINs que la vista necesita AHORA (no "todos")
 * @returns {Promise<Map<string,{motorNombre:string,tanqueroNombre:string}>>}
 */
export async function ensureNombresCache_(vins = []) {
  const now = Date.now();
  const pedidos = [...new Set(
    (vins || []).map(v => String(v || "").toUpperCase().trim()).filter(Boolean),
  )];

  const faltan = pedidos.filter(v => {
    const hit = _nombresPorVin.get(v);
    return !hit || (now - hit.ts) >= NOMBRES_TTL_MS;
  });

  if (faltan.length) {
    try {
      const j = await getJSON(`/api/nombres-por-vin?vins=${encodeURIComponent(faltan.join(","))}`);
      const byVin = (j?.ok && j.byVin) ? j.byVin : {};
      // Se cachean TODOS los pedidos, incluidos los que no vinieron: un VIN sin
      // técnicos asignados es una respuesta válida, y sin esto se volvería a
      // preguntar por él en cada ciclo.
      for (const v of faltan) {
        _nombresPorVin.set(v, {
          ts: now,
          nombres: byVin[v] || { motorNombre: "", tanqueroNombre: "" },
        });
      }
    } catch {
      // Sin red no se cachea nada: se reintenta en el siguiente ciclo.
    }
  }

  const out = new Map();
  for (const v of pedidos) {
    out.set(v, _nombresPorVin.get(v)?.nombres || { motorNombre: "", tanqueroNombre: "" });
  }
  return out;
}

export async function fetchNombresParaVin_(vin) {
  const vinUp = String(vin || "").toUpperCase().trim();
  if (!vinUp) return { motorNombre: "", tanqueroNombre: "" };
  const byVin = await ensureNombresCache_([vinUp]);
  return byVin.get(vinUp) || { motorNombre: "", tanqueroNombre: "" };
}