// ============================================================
// sup-kpis-render.js
// Renderizado de KPIs para la vista de supervisor
// ============================================================

import { formatHours_, formatPct_ } from "./sup-kpis.js";

/**
 * Renderiza el panel completo de KPIs
 */
export function renderKPIsPanel_(kpis, techName = "", track = "CONVERSION") {
  if (!kpis || kpis.totalFinalizados === 0) {
    return `<div id="supKPIsPanel" style="display:none;"></div>`;
  }

  const trackLabel = track === "RAMAL" ? "Ramal" : 
                     track === "CALIDAD" ? "Calidad" : "Conversión";
  
  const title = techName 
    ? `KPIs de ${trackLabel} - ${techName}` 
    : `KPIs de ${trackLabel}`;

  return `
    <div id="supKPIsPanel" class="sup-kpis-panel">
      <h4 class="sup-kpis-title">${title}</h4>
      
      <div class="sup-kpis-grid">
        ${renderMainKPIs_(kpis, track)}
        ${renderModelKPIs_(kpis)}
      </div>
    </div>
  `;
}

/**
 * Renderiza KPIs principales (tiempo, outliers)
 */
function renderMainKPIs_(kpis, track = "CONVERSION") {
  const isRamal = track === "RAMAL";
  const targetClass = kpis.vsTarget <= 0 ? "positive" : "negative";
  const outlierClass = kpis.outlierPct < 5 ? "positive" : 
                        kpis.outlierPct < 15 ? "warning" : "negative";

  // Label de outliers según track
  const outlierLabel = isRamal 
    ? "Outliers (<0.5h o >4h)" 
    : "Outliers (<1h o >10h)";

  // Nota adicional para RAMAL
  const ramalNote = isRamal 
    ? '<div class="kpi-note">*Sin outliers en el promedio</div>' 
    : '';

  return `
    <div class="sup-kpi-card main-kpi">
      <div class="kpi-header">
        <span class="kpi-icon">⏱️</span>
        <span class="kpi-label">Tiempo Promedio</span>
      </div>
      <div class="kpi-value">${formatHours_(kpis.avgHours)}</div>
      <div class="kpi-detail">
        <span>Objetivo: ${formatHours_(kpis.targetHours)}</span>
        <span class="kpi-badge ${targetClass}">
          ${kpis.vsTarget > 0 ? "+" : ""}${formatHours_(Math.abs(kpis.vsTarget))}
        </span>
      </div>
      <div class="kpi-bar">
        <div class="kpi-bar-fill ${targetClass}" 
             style="width: ${Math.min(100, Math.abs(kpis.vsTargetPct))}%">
        </div>
      </div>
      ${ramalNote}
    </div>

    <div class="sup-kpi-card">
      <div class="kpi-header">
        <span class="kpi-icon">⚠️</span>
        <span class="kpi-label">${outlierLabel}</span>
      </div>
      <div class="kpi-value">${kpis.outliers}</div>
      <div class="kpi-detail">
        <span>Total: ${kpis.totalFinalizados}</span>
        <span class="kpi-badge ${outlierClass}">
          ${kpis.outlierPct.toFixed(1)}%
        </span>
      </div>
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
    if (!data || data.count === 0) return "";

    const targetClass = data.vsTarget <= 0 ? "positive" : "negative";

    return `
      <div class="sup-kpi-card model-kpi">
        <div class="kpi-header">
          <span class="kpi-icon">${model.icon}</span>
          <span class="kpi-label">${model.key}</span>
        </div>
        <div class="kpi-value-small">${formatHours_(data.avgHours)}</div>
        <div class="kpi-detail">
          <span>Cant: ${data.count}</span>
          <span class="kpi-badge ${targetClass}">
            ${formatPct_(data.vsTargetPct)}
          </span>
        </div>
      </div>
    `;
  }).join("");
}
