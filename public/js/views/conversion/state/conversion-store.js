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
  getJSON,   // 👈 agrega esto
} from "../../../core/core.js";

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

export function normalizeItem_(raw) {
  const pickFirst_ = (...xs) => {
    for (const x of xs) {
      if (x !== undefined && x !== null && String(x).trim() !== "") return x;
    }
    return "";
  };

  const it = {
    conversionId: String(pickFirst_(raw?.conversionId, raw?.conversion_id, raw?.CONVERSION_ID, raw?.ID, raw?.id)).trim(),
    vin: String(pickFirst_(raw?.vin, raw?.VIN)).trim().toUpperCase(),
    tipoRamal: String(pickFirst_(raw?.tipoRamal, raw?.tipo_ramal, raw?.tipo, raw?.TIPO_RAMAL, raw?.TIPO)).trim(),
    created_at: raw?.fecha_asignacion ?? raw?.FECHA_ASIGNACION ?? raw?.fecha_inicio ?? raw?.inicio_at ?? raw?.FECHA_INICIO ??
               raw?.created_at ?? raw?.fecha_creacion ?? raw?.FECHA_CREACION ?? null,

    rolTrabajo: String(pickFirst_(raw?.rolTrabajo, raw?.rol_trabajo, raw?.rol, raw?.ROL_TRABAJO, raw?.ROL)).trim().toUpperCase(),
    estado: String(pickFirst_(raw?.estado, raw?.estado_actual, raw?.estadoActual, raw?.ESTADO_ACTUAL, raw?.ESTADO)).trim().toUpperCase(),

    tiempo_ms: Number(pickFirst_(raw?.tiempo_ms, raw?.tiempoMs, raw?.tiempo_trab_ms, raw?.TIEMPO_TRAB_MS, raw?.TIEMPO_MS, 0)) || 0,
    running_since: raw?.running_since ?? raw?.RUNNING_SINCE ?? null,

    last_nota: String(pickFirst_(raw?.last_nota, raw?.LAST_NOTA, "")),
    last_nota_ts: raw?.last_nota_ts ?? raw?.LAST_NOTA_TS ?? null,
    updated_at: raw?.updated_at ?? raw?.UPDATED_AT ?? null,

    tanque_asignado: String(pickFirst_(raw?.tanque_asignado, raw?.tanqueAsignado, raw?.TANQUE_ASIGNADO, "")).trim(),
    reductor_asignado: String(pickFirst_(raw?.reductor_asignado, raw?.reductorAsignado, raw?.REDUCTOR_ASIGNADO, "")).trim(),

    tanque_registrado: String(pickFirst_(raw?.tanque_registrado, raw?.tanqueRegistrado, raw?.TANQUE_REGISTRADO, "")).trim(),
    reductor_registrado: String(pickFirst_(raw?.reductor_registrado, raw?.reductorRegistrado, raw?.REDUCTOR_REGISTRADO, "")).trim(),

    inc_leve: Number(pickFirst_(raw?.inc_leve, raw?.INC_LEVE, 0)) || 0,
    inc_moderada: Number(pickFirst_(raw?.inc_moderada, raw?.INC_MODERADA, 0)) || 0,
    inc_critica: Number(pickFirst_(raw?.inc_critica, raw?.INC_CRITICA, 0)) || 0,
    motorNombre: String(pickFirst_(raw?.motorNombre, raw?.motor_nombre, raw?.MOTOR_NOMBRE, "")).trim(),
    tanqueroNombre: String(pickFirst_(raw?.tanqueroNombre, raw?.tanquero_nombre, raw?.TANQUERO_NOMBRE, "")).trim(),
  };

  if (!it.rolTrabajo) {
    if (it.tipoRamal) it.rolTrabajo = "RAMALERO";
    else if (CORE.state.currentModule === "CALIDAD") it.rolTrabajo = "CALIDAD";
    else it.rolTrabajo = String(getRolTecnico_() || "MOTOR").toUpperCase();
  }
  if (!it.estado) it.estado = "SIN_INICIAR";

  if (it.conversionId && it.rolTrabajo && it.vin) vinCacheSet_(it.conversionId, it.rolTrabajo, it.vin);
  if (it.conversionId && it.rolTrabajo === "RAMALERO" && it.tipoRamal) ramalCacheSet_(it.conversionId, it.tipoRamal);

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