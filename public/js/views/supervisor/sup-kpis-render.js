// ============================================================
// sup-kpis-render.js
// Renderizado de KPIs para la vista de supervisor
// ============================================================

import { formatPct_ } from "./sup-kpis.js";
import { formatHours_ } from "../../core/format.js";

/**
 * Renderiza el panel completo de KPIs
 */
export function renderKPIsPanel_(kpis, techName = "", track = "CONVERSION") {
  if (!kpis || kpis.totalVins === 0) {
    return "";
  }

  const trackLabel = track === "RAMAL" ? "Ramal" : 
                     track === "CALIDAD" ? "Calidad" : "Conversión";
  
  const title = techName 
    ? `KPIs de ${trackLabel} - ${techName}` 
    : `KPIs de ${trackLabel}`;

  const isConversion = track === "CONVERSION";
  const isIndividual = !!techName; // Si hay nombre, es búsqueda individual

  // Devuelve solo el contenido interno — el wrapper #supKPIsPanel vive en el DOM
  return `
    <h4 class="sup-kpis-title">${title}</h4>
    <div class="sup-kpis-grid">
      ${isIndividual
        ? renderIndividualKPIs_(kpis, track, techName)
        : (isConversion ? renderConversionKPIs_(kpis) : renderGeneralKPIs_(kpis, track))
      }
      ${renderCarrosPorDiaKPI_(kpis)}
      ${renderStateCountKPI_(kpis, track)}
      ${renderModelKPIs_(kpis)}
      ${renderOutliersKPI_(kpis, track)}
    </div>
  `;
}

/**
 * Renderiza KPIs para búsqueda individual (por persona)
 */
function renderIndividualKPIs_(kpis, track, techName) {
  const targetClass = kpis.individual.vsTarget <= 0 ? "positive" : "negative";
  
  // Determinar rol predominante
  let rolLabel = "Técnico";
  const motorCount = kpis.motor?.count || 0;
  const tanqueCount = kpis.tanque?.count || 0;
  
  if (motorCount > 0 && tanqueCount === 0) {
    rolLabel = "Motor";
  } else if (tanqueCount > 0 && motorCount === 0) {
    rolLabel = "Tanquero";
  } else if (motorCount > 0 && tanqueCount > 0) {
    rolLabel = "Motor + Tanquero";
  }

  return `
    <div class="sup-kpi-card main-kpi individual-kpi">
      <div class="kpi-header">
        <span class="kpi-icon">👤</span>
        <span class="kpi-label">${techName} - ${rolLabel}</span>
      </div>
      <div class="kpi-value">${formatHours_(kpis.individual.avgHours)}</div>
      <div class="kpi-detail">
        <span>Objetivo: ${formatHours_(kpis.individual.targetHours)}</span>
        <span class="kpi-badge ${targetClass}">
          ${kpis.individual.vsTarget > 0 ? "+" : ""}${formatHours_(Math.abs(kpis.individual.vsTarget))}
        </span>
      </div>
      <div class="kpi-bar">
        <div class="kpi-bar-fill ${targetClass}" 
             style="width: ${Math.min(100, Math.abs(kpis.individual.vsTargetPct))}%">
        </div>
      </div>
      <div class="kpi-note">*Promedio robusto (${kpis.individual.count} items | ${kpis.totalVins} VINs)</div>
    </div>
  `;
}

/**
 * Renderiza KPIs para conversión vista general (motor + tanquero separados)
 */
function renderConversionKPIs_(kpis) {
  const motorClass = kpis.motor.vsTarget <= 0 ? "positive" : "negative";
  const tanqueClass = kpis.tanque.vsTarget <= 0 ? "positive" : "negative";

  return `
    <!-- Tiempo Motor -->
    <div class="sup-kpi-card main-kpi">
      <div class="kpi-header">
        <span class="kpi-icon">🔧</span>
        <span class="kpi-label">Motor</span>
      </div>
      <div class="kpi-value">${formatHours_(kpis.motor.avgHours)}</div>
      <div class="kpi-detail">
        <span>Objetivo: ${formatHours_(kpis.motor.targetHours)}</span>
        <span class="kpi-badge ${motorClass}">
          ${kpis.motor.vsTarget > 0 ? "+" : ""}${formatHours_(Math.abs(kpis.motor.vsTarget))}
        </span>
      </div>
      <div class="kpi-bar">
        <div class="kpi-bar-fill ${motorClass}" 
             style="width: ${Math.min(100, Math.abs(kpis.motor.vsTargetPct))}%">
        </div>
      </div>
      <div class="kpi-note">*Promedio robusto (${kpis.motor.count} items)</div>
    </div>

    <!-- Tiempo Tanquero -->
    <div class="sup-kpi-card main-kpi">
      <div class="kpi-header">
        <span class="kpi-icon">⛽</span>
        <span class="kpi-label">Tanquero</span>
      </div>
      <div class="kpi-value">${formatHours_(kpis.tanque.avgHours)}</div>
      <div class="kpi-detail">
        <span>Objetivo: ${formatHours_(kpis.tanque.targetHours)}</span>
        <span class="kpi-badge ${tanqueClass}">
          ${kpis.tanque.vsTarget > 0 ? "+" : ""}${formatHours_(Math.abs(kpis.tanque.vsTarget))}
        </span>
      </div>
      <div class="kpi-bar">
        <div class="kpi-bar-fill ${tanqueClass}" 
             style="width: ${Math.min(100, Math.abs(kpis.tanque.vsTargetPct))}%">
        </div>
      </div>
      <div class="kpi-note">*Promedio robusto (${kpis.tanque.count} items)</div>
    </div>
  `;
}

/**
 * Renderiza KPIs para ramal/calidad vista general
 */
function renderGeneralKPIs_(kpis, track = "RAMAL") {
  const targetClass = kpis.individual.vsTarget <= 0 ? "positive" : "negative";

  return `
    <div class="sup-kpi-card main-kpi">
      <div class="kpi-header">
        <span class="kpi-icon">⏱️</span>
        <span class="kpi-label">Tiempo Promedio</span>
      </div>
      <div class="kpi-value">${formatHours_(kpis.individual.avgHours)}</div>
      <div class="kpi-detail">
        <span>Objetivo: ${formatHours_(kpis.individual.targetHours)}</span>
        <span class="kpi-badge ${targetClass}">
          ${kpis.individual.vsTarget > 0 ? "+" : ""}${formatHours_(Math.abs(kpis.individual.vsTarget))}
        </span>
      </div>
      <div class="kpi-bar">
        <div class="kpi-bar-fill ${targetClass}" 
             style="width: ${Math.min(100, Math.abs(kpis.individual.vsTargetPct))}%">
        </div>
      </div>
      <div class="kpi-note">*Promedio robusto (${kpis.individual.count} items)</div>
    </div>
  `;
}

/**
 * Renderiza KPI de carros convertidos por día (destacado)
 */
function renderCarrosPorDiaKPI_(kpis) {
  const carrosPorDia = kpis.carrosPorDia || 0;
  const carrosPorDiaRedondeado = Math.round(carrosPorDia * 10) / 10; // 1 decimal
  
  // Clase para determinar si ocupa 1 o 2 columnas
  const spanClass = kpis.isIndividual ? "individual-kpi" : "";
  
  return `
    <div class="sup-kpi-card carros-dia-kpi ${spanClass}">
      <div class="kpi-header">
        <span class="kpi-icon">🚗</span>
        <span class="kpi-label">Carros por Día</span>
      </div>
      <div class="kpi-value" style="color: #10b981; font-size: 48px; font-weight: 700;">${carrosPorDiaRedondeado}</div>
      <div class="kpi-detail">
        <span style="font-size: 13px;">${kpis.totalVins} carros • ${kpis.totalDias} días</span>
      </div>
      <div class="kpi-note">*Promedio de VINs únicos por día</div>
    </div>
  `;
}

/**
 * Renderiza KPI de outliers (al final de todos los KPIs)
 */
function renderOutliersKPI_(kpis, track) {
  const isRamal = track === "RAMAL";
  const outlierClass = kpis.outlierPct < 5 ? "positive" : 
                        kpis.outlierPct < 15 ? "warning" : "negative";

  const outlierLabel = isRamal 
    ? "Outliers (<0.5h o >4h)" 
    : "Outliers (<1h o >10h)";

  return `
    <div class="sup-kpi-card compact-kpi outliers-kpi">
      <div class="kpi-header-compact">
        <span class="kpi-icon-small">⚠️</span>
        <span class="kpi-label-small">${outlierLabel}</span>
      </div>
      <div class="kpi-value-compact">
        ${kpis.outliers} <span class="kpi-badge-inline ${outlierClass}">${kpis.outlierPct.toFixed(1)}%</span>
      </div>
      <div class="kpi-detail-compact">VINs: ${kpis.totalVins} | Total: ${kpis.totalItems}</div>
    </div>
  `;
}

/**
 * Renderiza card de estado del trabajo: Terminados | En proceso | Sin iniciar
 */
function renderStateCountKPI_(kpis, track) {
  const sc = kpis.stateCount;
  if (!sc) return "";

  const total = sc.finalizado + sc.enProceso + sc.sinIniciar;
  if (total === 0) return "";

  const isCalidad = track === "CALIDAD";
  const itemLabel = isCalidad ? "inspección" : "asignación";

  const rows = [
    { icon: "🏁", label: "Terminados",  val: sc.finalizado,  color: "#4ade80" },
    { icon: "⚙️", label: "En proceso",  val: sc.enProceso,   color: "#fbbf24" },
    { icon: "⭕", label: "Sin iniciar", val: sc.sinIniciar,  color: "#94a3b8" },
  ];

  const rowsHtml = rows
    .filter(r => r.val > 0)
    .map(r => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,.06);">
        <span style="font-size:.8em; color:rgba(255,255,255,.7);">${r.icon} ${r.label}</span>
        <span style="font-weight:900; font-size:1.05em; color:${r.color};">${r.val}</span>
      </div>`)
    .join("");

  return `
    <div class="sup-kpi-card compact-kpi" style="grid-column: span 1;">
      <div class="kpi-header-compact" style="margin-bottom:8px;">
        <span class="kpi-icon-small">📋</span>
        <span class="kpi-label-small">Estado del trabajo</span>
      </div>
      ${rowsHtml}
      <div style="margin-top:6px; font-size:.68em; opacity:.45;">${total} ${itemLabel}${total !== 1 ? "s" : ""} en total</div>
    </div>
  `;
}

/**
 * Renderiza KPIs por modelo
 */
function renderModelKPIs_(kpis) {
  const models = [
    { key: "JETOUR X70", icon: "🚙", color: "#3b82f6" },
    { key: "VOLKSWAGEN", icon: "🚗", color: "#8b5cf6" },
    { key: "KYC V3-V5", icon: "🚕", color: "#10b981" },
    { key: "KYC X5", icon: "🚐", color: "#f59e0b" },
    { key: "KYC V7", icon: "🚙", color: "#ef4444" },
    { key: "T3", icon: "🚕", color: "#06b6d4" },
    { key: "OTRO", icon: "🚐", color: "#64748b" },
    { key: "DESCONOCIDO", icon: "❓", color: "#6b7280" },
  ];

  return models.map(model => {
    const data = kpis.byModel[model.key];
    if (!data || data.vinCount === 0) return "";

    const targetClass = data.vsTarget <= 0 ? "positive" : "negative";

    return `
      <div class="sup-kpi-card model-kpi">
        <div class="kpi-header">
          <span class="kpi-icon">${model.icon}</span>
          <span class="kpi-label">${model.key}</span>
        </div>
        <div class="kpi-value-small">${formatHours_(data.avgHours)}</div>
        <div class="kpi-detail">
          <span>VINs: ${data.vinCount}</span>
          <span class="kpi-badge ${targetClass}">
            ${formatPct_(data.vsTargetPct)}
          </span>
        </div>
      </div>
    `;
  }).join("");
}
