// ============================================================
// sup-kpis-render.js
// Renderizado de KPIs para la vista de supervisor.
// Rediseño: gauges circulares + stat tiles, 100% token-driven
// (sin colores hardcodeados → correcto en tema claro y oscuro).
// ============================================================

import { formatPct_ } from "./sup-kpis.js";
import { formatHours_ } from "../../core/format.js";
import { gaugeHTML, clamp01 } from "../../core/viz.js";

/**
 * Renderiza el panel completo de KPIs.
 * Devuelve solo el contenido interno — el wrapper #supKPIsPanel vive en el DOM.
 */
export function renderKPIsPanel_(kpis, techName = "", track = "CONVERSION") {
  if (!kpis || kpis.totalVins === 0) return "";

  const trackLabel = track === "RAMAL" ? "Ramal" :
                     track === "CALIDAD" ? "Calidad" : "Conversión";
  const title = techName ? `${trackLabel} · ${techName}` : `KPIs de ${trackLabel}`;

  const isConversion = track === "CONVERSION";
  const isIndividual = !!techName;

  const gaugesRow = isIndividual
    ? renderIndividualGauge_(kpis, track, techName)
    : (isConversion ? renderConversionGauges_(kpis) : renderGeneralGauge_(kpis));

  return `
    <div class="sectionHead">
      <h4 class="sectionHead__title"><span class="accentBar"></span>${title}</h4>
    </div>

    <div class="dashGrid dashGrid--gauges" style="margin-bottom:12px;">
      ${gaugesRow}
      ${renderCarrosPorDiaTile_(kpis)}
    </div>

    ${renderStateCountMeter_(kpis, track)}

    ${renderModelTiles_(kpis)}

    ${renderOutliersTile_(kpis, track)}
  `;
}

/* ── Gauge genérico tiempo-vs-objetivo ──
   El anillo se llena con avg/target; el color indica desempeño
   (verde si está en/bajo objetivo, rojo si lo supera). */
function timeGauge_({ label, avgHours, targetHours, vsTarget, count, icon = "" }) {
  const frac = clamp01(targetHours > 0 ? avgHours / targetHours : 0);
  const under = vsTarget <= 0;
  const tone = under ? "--dv-good" : "--dv-bad";
  const deltaCls = under ? "delta--good" : "delta--bad";
  const deltaTxt = `${vsTarget > 0 ? "+" : "−"}${formatHours_(Math.abs(vsTarget))}`;
  return gaugeHTML({
    fraction: frac,
    tone,
    display: formatHours_(avgHours),
    sub: `obj ${formatHours_(targetHours)}`,
    label: `${icon} ${label}`.trim(),
    foot: `<span class="delta ${deltaCls}">${deltaTxt}</span> · ${count} items`,
  });
}

function renderConversionGauges_(kpis) {
  return (
    timeGauge_({ label: "Motor",    icon: "🔧", avgHours: kpis.motor.avgHours,  targetHours: kpis.motor.targetHours,  vsTarget: kpis.motor.vsTarget,  count: kpis.motor.count }) +
    timeGauge_({ label: "Tanquero", icon: "⛽", avgHours: kpis.tanque.avgHours, targetHours: kpis.tanque.targetHours, vsTarget: kpis.tanque.vsTarget, count: kpis.tanque.count })
  );
}

function renderGeneralGauge_(kpis) {
  return timeGauge_({
    label: "Tiempo prom.", icon: "⏱️",
    avgHours: kpis.individual.avgHours, targetHours: kpis.individual.targetHours,
    vsTarget: kpis.individual.vsTarget, count: kpis.individual.count,
  });
}

function renderIndividualGauge_(kpis, track, techName) {
  let rolLabel = "Técnico";
  const m = kpis.motor?.count || 0, t = kpis.tanque?.count || 0;
  if (m > 0 && t === 0) rolLabel = "Motor";
  else if (t > 0 && m === 0) rolLabel = "Tanquero";
  else if (m > 0 && t > 0) rolLabel = "Motor + Tanquero";

  return timeGauge_({
    label: rolLabel, icon: "👤",
    avgHours: kpis.individual.avgHours, targetHours: kpis.individual.targetHours,
    vsTarget: kpis.individual.vsTarget, count: kpis.individual.count,
  });
}

/* ── Carros por día: stat tile héroe con gradiente de acento ── */
function renderCarrosPorDiaTile_(kpis) {
  const carros = Math.round((kpis.carrosPorDia || 0) * 10) / 10;
  return `
    <div class="statTile statTile--accent" style="justify-content:center;">
      <div class="statTile__label">🚗 Carros por día</div>
      <div class="statTile__value" style="font-size:44px;">${carros}</div>
      <div class="statTile__foot">${kpis.totalVins} carros · ${kpis.totalDias} días</div>
    </div>
  `;
}

/* ── Estado del trabajo: barra segmentada (meter) ── */
function renderStateCountMeter_(kpis, track) {
  const sc = kpis.stateCount;
  if (!sc) return "";
  const total = sc.finalizado + sc.enProceso + sc.sinIniciar;
  if (total === 0) return "";

  const isCalidad = track === "CALIDAD";
  const itemLabel = isCalidad ? "inspección" : "asignación";

  const segs = [
    { label: "Terminados",  val: sc.finalizado, tone: "var(--dv-good)" },
    { label: "En proceso",  val: sc.enProceso,  tone: "var(--dv-warn)" },
    { label: "Sin iniciar", val: sc.sinIniciar, tone: "var(--muted)" },
  ].filter(s => s.val > 0);

  const bars = segs.map(s =>
    `<div class="meter__seg" style="width:${(s.val / total * 100).toFixed(2)}%; background:${s.tone};"></div>`
  ).join("");

  const legend = segs.map(s =>
    `<span class="meter__key"><span class="meter__dot" style="background:${s.tone};"></span>${s.label} <span class="meter__num">${s.val}</span></span>`
  ).join("");

  return `
    <div class="card" style="margin-top:0;">
      <div class="statTile__label" style="margin-bottom:10px;">📋 Estado del trabajo · ${total} ${itemLabel}${total !== 1 ? "s" : ""}</div>
      <div class="meter">
        <div class="meter__track">${bars}</div>
        <div class="meter__legend">${legend}</div>
      </div>
    </div>
  `;
}

/* ── KPIs por modelo: grid de stat tiles compactos ── */
function renderModelTiles_(kpis) {
  const models = [
    { key: "JETOUR X70", icon: "🚙" }, { key: "VOLKSWAGEN", icon: "🚗" },
    { key: "KYC V3-V5", icon: "🚕" },  { key: "KYC X5", icon: "🚐" },
    { key: "KYC V7", icon: "🚙" },     { key: "T3", icon: "🚕" },
    { key: "OTRO", icon: "🚐" },       { key: "DESCONOCIDO", icon: "❓" },
  ];

  const tiles = models.map(model => {
    const data = kpis.byModel[model.key];
    if (!data || data.vinCount === 0) return "";
    const under = data.vsTarget <= 0;
    const deltaCls = under ? "delta--good" : "delta--bad";
    return `
      <div class="statTile">
        <div class="statTile__label">${model.icon} ${model.key}</div>
        <div class="statTile__value sm">${formatHours_(data.avgHours)}</div>
        <div class="statTile__foot">
          ${data.vinCount} VINs · <span class="delta ${deltaCls}">${formatPct_(data.vsTargetPct)}</span>
        </div>
      </div>
    `;
  }).join("");

  if (!tiles.trim()) return "";
  return `
    <div class="statTile__label" style="margin:16px 0 10px;">🚘 Por modelo</div>
    <div class="dashGrid">${tiles}</div>
  `;
}

/* ── Outliers ── */
function renderOutliersTile_(kpis, track) {
  const isRamal = track === "RAMAL";
  const cls = kpis.outlierPct < 5 ? "delta--good" : kpis.outlierPct < 15 ? "delta--warn" : "delta--bad";
  const label = isRamal ? "Outliers (<0.5h o >4h)" : "Outliers (<1h o >10h)";
  return `
    <div class="statTile" style="margin-top:12px;">
      <div class="statTile__label">⚠️ ${label}</div>
      <div class="statTile__value sm">
        ${kpis.outliers}
        <span class="delta ${cls}">${kpis.outlierPct.toFixed(1)}%</span>
      </div>
      <div class="statTile__foot">VINs: ${kpis.totalVins} · Total items: ${kpis.totalItems}</div>
    </div>
  `;
}
