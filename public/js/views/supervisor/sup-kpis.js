// ============================================================
// sup-kpis.js
// Cálculo de KPIs para la vista de supervisor
// ============================================================

import { isFinalizado_ } from "./sup-filters.js";
import { median_, mad_, robustLocalAverage_ } from "./sup-stats.js";

const TARGET_HOURS_CONVERSION = 3; // Objetivo conversión: 3 horas (motor y tanquero)
const TARGET_HOURS_CALIDAD = 50 / 60; // Objetivo calidad: 50 minutos
const TARGET_HOURS_RAMAL = 40 / 60; // Objetivo ramal: 40 minutos
const OUTLIER_THRESHOLD_MAX_CONVERSION = 10; // Outlier conversión: > 10 horas
const OUTLIER_THRESHOLD_MIN_CONVERSION = 1; // Outlier conversión: < 1 hora
const OUTLIER_THRESHOLD_MAX_RAMAL = 4; // Outlier ramal: > 4 horas
const OUTLIER_THRESHOLD_MIN_RAMAL = 0.5; // Outlier ramal: < 0.5 hora

/**
 * Detecta el modelo basado en patrones en el string
 */
function detectModel_(modeloStr, vin = "") {
  if (!modeloStr) {
    console.log("🔍 [DESCONOCIDO] VIN:", vin, "| Modelo:", modeloStr);
    return "DESCONOCIDO";
  }
  const upper = modeloStr.toUpperCase();
  
  // Orden de prioridad para evitar falsos positivos
  if (upper.includes("X70")) return "JETOUR X70";
  if (upper.includes("TERA") || upper.includes("POLO")) return "VOLKSWAGEN";
  if (upper.includes("X5")) return "KYC X5";
  if (upper.includes("V7")) return "KYC V7";
  if (upper.includes("V3") || upper.includes("V5")) return "KYC V3-V5";
  if (upper.includes("T3")) return "T3";
  
  console.log("🔍 [OTRO] VIN:", vin, "| Modelo:", modeloStr);
  return "OTRO";
}

/**
 * Calcula todos los KPIs para la vista de supervisor
 * @param {Array} items - Lista de items (conversiones)
 * @param {String} track - Tipo de track: CONVERSION, CALIDAD, RAMAL
 * @param {Boolean} isIndividual - Si es búsqueda por persona individual
 * @returns {Object} Objeto con todos los KPIs calculados
 */

export function calculateKPIs_(items, track = "CONVERSION", isIndividual = false, dateRange = null) {
  const isRamal = track === "RAMAL";
  const isConversion = track === "CONVERSION";
  const isCalidad = track === "CALIDAD";
  
  // Configuración según track
  const TARGET_HOURS = isRamal ? TARGET_HOURS_RAMAL : 
                       isCalidad ? TARGET_HOURS_CALIDAD : 
                       TARGET_HOURS_CONVERSION;
  const OUTLIER_MAX = isRamal ? OUTLIER_THRESHOLD_MAX_RAMAL : OUTLIER_THRESHOLD_MAX_CONVERSION;
  const OUTLIER_MIN = isRamal ? OUTLIER_THRESHOLD_MIN_RAMAL : OUTLIER_THRESHOLD_MIN_CONVERSION;
  
  // Filtrar solo finalizados con tiempo válido
  const finalizados = items.filter(it => 
    isFinalizado_(it.estado) && 
    it.tiempo_ms > 0
  );

  if (finalizados.length === 0) {
    const stateCountEmpty = {
      finalizado: 0,
      enProceso: items.filter(it => {
        const s = String(it.estado || "").toUpperCase();
        return s === "TRABAJANDO" || s === "PAUSADO";
      }).length,
      sinIniciar: items.filter(it =>
        String(it.estado || "").toUpperCase() === "SIN_INICIAR"
      ).length,
    };
    return {
      isIndividual,
      totalVins: 0,
      totalItems: 0,
      totalDias: 0,
      carrosPorDia: 0,
      stateCount: stateCountEmpty,
      // Individual stats (para búsqueda por persona)
      individual: {
        count: 0,
        avgHours: 0,
        targetHours: TARGET_HOURS,
        vsTarget: 0,
        vsTargetPct: 0,
      },
      // Motor stats (para vista general)
      motor: {
        count: 0,
        avgHours: 0,
        targetHours: TARGET_HOURS,
        vsTarget: 0,
        vsTargetPct: 0,
      },
      // Tanquero stats (para vista general)
      tanque: {
        count: 0,
        avgHours: 0,
        targetHours: TARGET_HOURS,
        vsTarget: 0,
        vsTargetPct: 0,
      },
      outliers: 0,
      outlierPct: 0,
      byModel: {},
    };
  }

  // === PARTE 1: Contar VINs únicos y días de trabajo ===
  const vinsUnicos = new Set();
  const FMT_PERU_ = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" });
  const diasUnicos = new Set();

  finalizados.forEach(it => {
    const vin = String(it.vin || "").trim();
    if (vin) vinsUnicos.add(vin);

    // Usar hora Perú para la fecha del día (evita cortes a las 7 PM con UTC)
    const ts = it.updated_at || it.timestamp_finalizado || it.fecha_asignacion;
    if (ts) {
      try { diasUnicos.add(FMT_PERU_.format(new Date(ts))); } catch (_) {}
    }
  });

  // totalDias: solo días CON al menos un carro finalizado (días vacíos/domingos se excluyen)
  const totalDias = diasUnicos.size;

  // Calcular carros por día
  const carrosPorDia = totalDias > 0 ? vinsUnicos.size / totalDias : 0;

  // === PARTE 2: Calcular estadísticas robustas ===
  function calcRobustStats(itemsList, targetHours) {
    if (itemsList.length === 0) {
      return {
        count: 0,
        avgHours: 0,
        targetHours: targetHours,
        vsTarget: 0,
        vsTargetPct: 0,
      };
    }

    const durationsMs = itemsList.map(it => it.tiempo_ms);
    const robust = robustLocalAverage_(durationsMs, 2.1);
    const avgHours = robust.avgMs / (1000 * 60 * 60);
    const vsTarget = avgHours - targetHours;
    const vsTargetPct = targetHours > 0 ? ((avgHours / targetHours) - 1) * 100 : 0;

    return {
      count: itemsList.length,
      avgHours: avgHours,
      targetHours: targetHours,
      vsTarget: vsTarget,
      vsTargetPct: vsTargetPct,
      medianHours: robust.medianMs / (1000 * 60 * 60),
    };
  }

  // Si es búsqueda individual, calcular stats generales
  let individualStats = { count: 0, avgHours: 0, targetHours: TARGET_HOURS, vsTarget: 0, vsTargetPct: 0 };
  let motorStats = { count: 0, avgHours: 0, targetHours: TARGET_HOURS, vsTarget: 0, vsTargetPct: 0 };
  let tanqueStats = { count: 0, avgHours: 0, targetHours: TARGET_HOURS, vsTarget: 0, vsTargetPct: 0 };

  if (isIndividual) {
    // Vista individual: calcular stats de todos los items juntos
    individualStats = calcRobustStats(finalizados, TARGET_HOURS);
  } else if (isConversion) {
    // Vista general de conversión: separar motor y tanquero
    const motorItems = [];
    const tanqueItems = [];
    
    finalizados.forEach(it => {
      const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
      if (rol === "MOTOR" || rol === "TECNICO" || rol === "CONVERSION") {
        motorItems.push(it);
      } else if (rol === "TANQUE" || rol === "TANQUERO") {
        tanqueItems.push(it);
      }
    });

    motorStats = calcRobustStats(motorItems, TARGET_HOURS);
    tanqueStats = calcRobustStats(tanqueItems, TARGET_HOURS);
  } else {
    // Vista general de ramal/calidad: usar stats individuales
    individualStats = calcRobustStats(finalizados, TARGET_HOURS);
  }

  // === PARTE 3: Identificar outliers ===
  const outliersItems = finalizados.filter(it => {
    const hours = it.tiempo_ms / (1000 * 60 * 60);
    return hours < OUTLIER_MIN || hours > OUTLIER_MAX;
  });

  const outliers = outliersItems.length;
  const outlierPct = (outliers / finalizados.length) * 100;

  // === PARTE 4: Estadísticas por modelo (contando VINs únicos) ===
  const byModel = {};
  const modelGroups = {
    "JETOUR X70": [],
    "VOLKSWAGEN": [],
    "KYC V3-V5": [],
    "KYC X5": [],
    "KYC V7": [],
    "T3": [],
    "OTRO": [],
  };

  // Agrupar por modelo (por VIN único, no por items)
  const vinsByModel = new Map();
  finalizados.forEach(it => {
    const vin = String(it.vin || "").trim();
    if (!vin) return;
    
    const model = detectModel_(it.modelo, vin);
    if (!vinsByModel.has(model)) {
      vinsByModel.set(model, new Set());
    }
    vinsByModel.get(model).add(vin);
    
    if (!modelGroups[model]) modelGroups[model] = [];
    modelGroups[model].push(it);
  });

  // Calcular estadísticas por modelo usando promedio robusto
  Object.entries(modelGroups).forEach(([model, list]) => {
    if (list.length === 0) {
      byModel[model] = {
        vinCount: 0,
        itemCount: 0,
        avgHours: 0,
        vsTarget: 0,
      };
      return;
    }

    const durationsMs = list.map(it => it.tiempo_ms);
    const robust = robustLocalAverage_(durationsMs, 2.1);
    const avgHours = robust.avgMs / (1000 * 60 * 60);
    const vsTarget = avgHours - TARGET_HOURS;

    byModel[model] = {
      vinCount: vinsByModel.get(model)?.size || 0,
      itemCount: list.length,
      avgHours: avgHours,
      vsTarget: vsTarget,
      vsTargetPct: ((avgHours / TARGET_HOURS) - 1) * 100,
    };
  });

  // === PARTE 5: Conteo de estados (incluye WIP) ===
  const stateCount = {
    finalizado: items.filter(it => isFinalizado_(it.estado)).length,
    enProceso: items.filter(it => {
      const s = String(it.estado || "").toUpperCase();
      return s === "TRABAJANDO" || s === "PAUSADO";
    }).length,
    sinIniciar: items.filter(it =>
      String(it.estado || "").toUpperCase() === "SIN_INICIAR"
    ).length,
  };

  return {
    isIndividual,
    track,
    totalVins: vinsUnicos.size,
    totalItems: finalizados.length,
    totalDias: totalDias,
    carrosPorDia: carrosPorDia,
    individual: individualStats,
    motor: motorStats,
    tanque: tanqueStats,
    outliers: outliers,
    outlierPct: outlierPct,
    byModel: byModel,
    stateCount,
  };
}

/**
 * Formatea horas a string legible
 */
export function formatHours_(hours) {
  if (!hours || hours < 0) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m}m`;
}

/**
 * Formatea porcentaje con signo
 */
export function formatPct_(pct) {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
