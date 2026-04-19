// ============================================================
// sup-kpis.js
// Cálculo de KPIs para la vista de supervisor
// ============================================================

import { isFinalizado_ } from "./sup-filters.js";

const TARGET_HOURS_CONVERSION = 3; // Objetivo conversión: 3 horas
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
 * @returns {Object} Objeto con todos los KPIs calculados
 */
export function calculateKPIs_(items, track = "CONVERSION") {
  const isRamal = track === "RAMAL";
  
  // Configuración según track
  const TARGET_HOURS = isRamal ? TARGET_HOURS_RAMAL : TARGET_HOURS_CONVERSION;
  const OUTLIER_MAX = isRamal ? OUTLIER_THRESHOLD_MAX_RAMAL : OUTLIER_THRESHOLD_MAX_CONVERSION;
  const OUTLIER_MIN = isRamal ? OUTLIER_THRESHOLD_MIN_RAMAL : OUTLIER_THRESHOLD_MIN_CONVERSION;
  
  // Filtrar solo finalizados con tiempo válido
  const finalizados = items.filter(it => 
    isFinalizado_(it.estado) && 
    it.tiempo_ms > 0
  );

  if (finalizados.length === 0) {
    return {
      totalFinalizados: 0,
      avgHours: 0,
      targetHours: TARGET_HOURS,
      vsTarget: 0,
      vsTargetPct: 0,
      outliers: 0,
      outlierPct: 0,
      byModel: {},
    };
  }

  // Identificar outliers
  const outliersItems = finalizados.filter(it => {
    const hours = it.tiempo_ms / (1000 * 60 * 60);
    return hours < OUTLIER_MIN || hours > OUTLIER_MAX;
  });

  // Para RAMAL: calcular tiempo promedio SIN outliers
  // Para CONVERSION: calcular con todos los items
  const itemsForAvg = isRamal 
    ? finalizados.filter(it => {
        const hours = it.tiempo_ms / (1000 * 60 * 60);
        return hours >= OUTLIER_MIN && hours <= OUTLIER_MAX;
      })
    : finalizados;

  const totalMs = itemsForAvg.reduce((sum, it) => sum + it.tiempo_ms, 0);
  const avgMs = itemsForAvg.length > 0 ? totalMs / itemsForAvg.length : 0;
  const avgHours = avgMs / (1000 * 60 * 60);

  // KPI: Diferencia vs objetivo
  const vsTarget = avgHours - TARGET_HOURS;
  const vsTargetPct = TARGET_HOURS > 0 ? ((avgHours / TARGET_HOURS) - 1) * 100 : 0;

  // KPI: Outliers
  const outliers = outliersItems.length;
  const outlierPct = (outliers / finalizados.length) * 100;

  // KPI: Por modelo
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

  finalizados.forEach(it => {
    const model = detectModel_(it.modelo, it.vin);
    if (!modelGroups[model]) modelGroups[model] = [];
    modelGroups[model].push(it);
  });

  // Calcular estadísticas por modelo
  Object.entries(modelGroups).forEach(([model, list]) => {
    if (list.length === 0) {
      byModel[model] = {
        count: 0,
        avgHours: 0,
        vsTarget: 0,
      };
      return;
    }

    const totalMs = list.reduce((sum, it) => sum + it.tiempo_ms, 0);
    const avgMs = totalMs / list.length;
    const avgHours = avgMs / (1000 * 60 * 60);
    const vsTarget = avgHours - TARGET_HOURS;

    byModel[model] = {
      count: list.length,
      avgHours: avgHours,
      vsTarget: vsTarget,
      vsTargetPct: ((avgHours / TARGET_HOURS) - 1) * 100,
    };
  });

  return {
    totalFinalizados: finalizados.length,
    avgHours: avgHours,
    targetHours: TARGET_HOURS,
    vsTarget: vsTarget,
    vsTargetPct: vsTargetPct,
    outliers: outliers,
    outlierPct: outlierPct,
    byModel: byModel,
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
