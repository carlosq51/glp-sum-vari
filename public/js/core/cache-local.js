// =========================
// public/js/core/cache-local.js
// Caches locales (localStorage)
// =========================

const VIN_CACHE_KEY = "glp_vin_cache_v1";
const RAMAL_CACHE_KEY = "glp_ramal_cache_v1";

// --------------------------
// VIN CACHE
// --------------------------
function vinCacheLoad_() {
  try { return JSON.parse(localStorage.getItem(VIN_CACHE_KEY) || "{}"); }
  catch { return {}; }
}

function vinCacheSave_(obj) {
  try { localStorage.setItem(VIN_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

function vinCacheKey_(conversionId, rolTrabajo) {
  const cid = String(conversionId || "").trim();
  const rol = String(rolTrabajo || "").toUpperCase().trim();
  return cid && rol ? `${cid}|${rol}` : "";
}

export function vinCacheSet_(conversionId, rolTrabajo, vin) {
  const cid = String(conversionId || "").trim();
  const v = String(vin || "").trim().toUpperCase();
  if (!cid || !v) return;

  const rol = String(rolTrabajo || "").toUpperCase().trim();
  const k = vinCacheKey_(cid, rol);
  if (!k) return;

  const cache = vinCacheLoad_();
  cache[k] = { vin: v, ts: Date.now() };

  const maxAge = 14 * 24 * 3600 * 1000;
  for (const kk of Object.keys(cache)) {
    if (!cache[kk]?.ts || Date.now() - cache[kk].ts > maxAge) delete cache[kk];
  }
  vinCacheSave_(cache);
}

export function vinCacheGet_(conversionId, rolTrabajo) {
  const k = vinCacheKey_(conversionId, rolTrabajo);
  if (!k) return "";
  const cache = vinCacheLoad_();
  return String(cache[k]?.vin || "").toUpperCase();
}

// --------------------------
// RAMAL CACHE
// --------------------------
function ramalCacheLoad_() {
  try { return JSON.parse(localStorage.getItem(RAMAL_CACHE_KEY) || "{}"); }
  catch { return {}; }
}

function ramalCacheSave_(obj) {
  try { localStorage.setItem(RAMAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

function ramalCacheKey_(conversionId) {
  const cid = String(conversionId || "").trim();
  return cid ? `RAMAL|${cid}` : "";
}

export function ramalCacheSet_(conversionId, tipoRamal) {
  const cid = String(conversionId || "").trim();
  const tipo = String(tipoRamal || "").trim();
  if (!cid || !tipo) return;

  const cache = ramalCacheLoad_();
  cache[ramalCacheKey_(cid)] = { tipoRamal: tipo, ts: Date.now() };

  const maxAge = 14 * 24 * 3600 * 1000;
  for (const k of Object.keys(cache)) {
    if (!cache[k]?.ts || Date.now() - cache[k].ts > maxAge) delete cache[k];
  }
  ramalCacheSave_(cache);
}

export function ramalCacheGet_(conversionId) {
  const cid = String(conversionId || "").trim();
  if (!cid) return "";
  const cache = ramalCacheLoad_();
  return String(cache[ramalCacheKey_(cid)]?.tipoRamal || "");
}