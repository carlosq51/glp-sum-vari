// =========================
// public/js/views/supervisor/sup-dashboard.js
// Panel visual del REPORTE — estilo Power BI:
//   1. Producción por día (barras, Motor vs Tanque en CONVERSIÓN)
//   2. Estado del trabajo (dona con colores de estado)
//   3. Top técnicos (barras horizontales)
//   4. Tiempo por modelo vs objetivo (barras + línea de objetivo)
// Todo token-driven (--dv-*) con re-render al cambiar de tema y
// drill-down al hacer click en cualquier barra/segmento.
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, hexA } from "../../core/viz.js";
import { openDrilldown } from "../../core/drilldown.js";
import { isFinalizado_, durationMsFromItem_ } from "./sup-filters.js";
import { robustLocalAverage_ } from "./sup-stats.js";
import { detectModel_ } from "./sup-kpis.js";
import { fmtDur_ } from "../../core/format.js";
import { escapeHtml } from "../../core/core.js";
import { cfg } from "../../core/config.js";

let charts_ = [];
let _last = null; // args para re-render al cambiar de tema

window.addEventListener("glp:themechange", () => {
  if (_last) renderSupDashboard_(_last.container, _last.data);
});

// ─── Helpers ──────────────────────────────────────────────────────────

const FMT_PERU_ = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" });
const peruDay_ = (iso) => { try { return iso ? FMT_PERU_.format(new Date(iso)) : null; } catch { return null; } };
const ddmm_ = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

const rolOf_ = (it) => String(it.rol || it.rolTrabajo || "").toUpperCase();
const isMotor_  = (r) => ["MOTOR", "TECNICO", "CONVERSION"].includes(r);
const isTanque_ = (r) => ["TANQUE", "TANQUERO"].includes(r);

function targetHours_(track) {
  const min = track === "CALIDAD" ? cfg("TARGET_CALIDAD_MIN")
            : track === "RAMAL"   ? cfg("TARGET_RAMAL_MIN")
            : cfg("TARGET_CONVERSION_MIN");
  return Number(min) / 60;
}

// Color del track activo (mismo mapeo que el resto de la app)
function trackColor_(c, track) {
  return track === "CALIDAD" ? c.series[1]   // --dv-2
       : track === "RAMAL"   ? c.series[4]   // --dv-5
       : c.series[0];                        // --dv-1 (motor/conversión)
}

function drillRow_(it) {
  const rol = rolOf_(it);
  const est = String(it.estado || "").toUpperCase();
  const dur = durationMsFromItem_(it);
  return `<div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--surfaceLine);">
    <code style="font-size:.78em;font-weight:800;">${escapeHtml(it.vin || "—")}</code>
    <span style="font-size:.74em;opacity:.6;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
      ${escapeHtml(it.userName || "—")}${it.modelo ? " · " + escapeHtml(it.modelo) : ""}
    </span>
    <span class="pill small">${escapeHtml(rol)}</span>
    ${dur > 0 ? `<span style="font-size:.74em;font-weight:800;color:var(--note);">${escapeHtml(fmtDur_(dur))}</span>` : ""}
    <span style="font-size:.7em;font-weight:800;color:${est === "FINALIZADO" ? "var(--ok)" : "var(--warn)"};">${escapeHtml(est)}</span>
  </div>`;
}

function openListDrill_(title, list) {
  const sorted = [...list].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  openDrilldown({
    title,
    badge: sorted.length,
    html: sorted.length ? sorted.map(drillRow_).join("") : `<div style="padding:16px;text-align:center;opacity:.5;">Sin resultados.</div>`,
  });
}

// Marcas: barras delgadas con extremo redondeado, gap de 2px vía porcentajes
const BAR_STYLE = {
  borderRadius: { topLeft: 4, topRight: 4 },
  maxBarThickness: 26,
  categoryPercentage: 0.72,
  barPercentage: 0.86,
};
const HBAR_STYLE = {
  borderRadius: { topRight: 4, bottomRight: 4 },
  maxBarThickness: 20,
  categoryPercentage: 0.72,
  barPercentage: 0.86,
};

function clickable_(base, onIndex) {
  return {
    ...base,
    onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
    onClick: (e, els) => { if (els.length) onIndex(els[0].datasetIndex, els[0].index); },
  };
}

// ─── Render principal ─────────────────────────────────────────────────

export function destroySupDashboard_() {
  charts_.forEach((ch) => { try { ch.destroy(); } catch { /* ya destruido */ } });
  charts_ = [];
  _last = null;
}

/**
 * @param {HTMLElement} container  #supDashboard
 * @param {Object} data  { items, track, techName }
 */
export function renderSupDashboard_(container, data) {
  if (!container) return;
  charts_.forEach((ch) => { try { ch.destroy(); } catch { /* noop */ } });
  charts_ = [];

  const items = Array.isArray(data?.items) ? data.items : [];
  const track = data?.track || "CONVERSION";
  const techName = data?.techName || "";

  if (!items.length) {
    container.style.display = "none";
    container.innerHTML = "";
    _last = null;
    return;
  }
  _last = { container, data };
  container.style.display = "";

  const c = readVizColors();
  const isConversion = track === "CONVERSION";
  const finalizados = items.filter((it) => isFinalizado_(it.estado));

  // ── 1. Producción por día ──
  const byDay = new Map(); // ymd → { motor, tanque, otros, items: [] }
  for (const it of finalizados) {
    const day = peruDay_(it.updated_at || it.timestamp_finalizado || it.fecha_asignacion);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, { motor: 0, tanque: 0, otros: 0, items: [] });
    const b = byDay.get(day);
    const r = rolOf_(it);
    if (isConversion && isMotor_(r)) b.motor++;
    else if (isConversion && isTanque_(r)) b.tanque++;
    else b.otros++;
    b.items.push(it);
  }
  const days = [...byDay.keys()].sort();

  // ── 2. Estado del trabajo ──
  const estadoGroups = {
    Terminados:    items.filter((it) => isFinalizado_(it.estado)),
    "En proceso":  items.filter((it) => ["TRABAJANDO", "PAUSADO"].includes(String(it.estado || "").toUpperCase())),
    "Sin iniciar": items.filter((it) => String(it.estado || "").toUpperCase() === "SIN_INICIAR"),
  };
  const estadoEntries = Object.entries(estadoGroups).filter(([, l]) => l.length > 0);

  // ── 3. Top técnicos (solo vista general) ──
  const byTech = new Map();
  if (!techName) {
    for (const it of finalizados) {
      const who = String(it.userName || it.userEmail || "").trim() || "—";
      if (!byTech.has(who)) byTech.set(who, []);
      byTech.get(who).push(it);
    }
  }
  const topTechs = [...byTech.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);

  // ── 4. Tiempo por modelo ──
  const byModel = new Map();
  for (const it of finalizados) {
    if (!(Number(it.tiempo_ms) > 0)) continue;
    const m = detectModel_(it.modelo, it.vin);
    if (!byModel.has(m)) byModel.set(m, []);
    byModel.get(m).push(it);
  }
  const modelEntries = [...byModel.entries()]
    .filter(([, l]) => l.length >= 2)
    .map(([m, l]) => ({ model: m, items: l, avgH: robustLocalAverage_(l.map((x) => x.tiempo_ms), 2.1).avgMs / 3600000 }))
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 7);
  const tgtH = targetHours_(track);

  // ── Markup ──
  const cards = [];
  if (days.length)          cards.push(chartCardHTML_("supChDias",    "Producción por día",     isConversion ? "Trabajos finalizados · Motor vs Tanque" : "Trabajos finalizados por fecha de cierre"));
  if (estadoEntries.length) cards.push(chartCardHTML_("supChEstado",  "Estado del trabajo",     `${items.length} asignaciones en el filtro actual`, true));
  if (topTechs.length > 1)  cards.push(chartCardHTML_("supChTecnicos","Top técnicos",           "Trabajos finalizados por persona"));
  if (modelEntries.length)  cards.push(chartCardHTML_("supChModelos", "Tiempo por modelo",      `Promedio robusto vs objetivo (${tgtH.toFixed(1)}h)`));

  if (!cards.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="sectionHead" style="margin-top:16px;">
      <h4 class="sectionHead__title"><span class="accentBar"></span>Panel visual</h4>
      <span class="small muted">Toca una barra o segmento para ver el detalle</span>
    </div>
    <div class="supDashGrid">${cards.join("")}</div>
  `;

  const base = chartBaseOptions(c);

  // ── Chart 1: Producción por día ──
  const elDias = container.querySelector("#supChDias");
  if (elDias) {
    const motorColor = c.series[0]; // --dv-1 (mismo azul que track motor)
    const tanqueColor = c.series[7]; // --dv-8 (mismo naranja que track tanque)
    const datasets = isConversion
      ? [
          { label: "Motor",  data: days.map((d) => byDay.get(d).motor),  backgroundColor: motorColor,  ...BAR_STYLE },
          { label: "Tanque", data: days.map((d) => byDay.get(d).tanque), backgroundColor: tanqueColor, ...BAR_STYLE },
        ]
      : [
          { label: "Finalizados", data: days.map((d) => byDay.get(d).motor + byDay.get(d).tanque + byDay.get(d).otros), backgroundColor: trackColor_(c, track), ...BAR_STYLE },
        ];

    charts_.push(new Chart(elDias.getContext("2d"), {
      type: "bar",
      data: { labels: days.map(ddmm_), datasets },
      options: clickable_({
        ...base,
        plugins: {
          ...base.plugins,
          legend: { display: isConversion, labels: { ...base.plugins.legend.labels, boxWidth: 12, boxHeight: 12, borderRadius: 3, useBorderRadius: true } },
        },
        scales: {
          x: { ...base.scales.x, grid: { display: false } },
          y: { ...base.scales.y, beginAtZero: true, ticks: { ...base.scales.y.ticks, precision: 0 } },
        },
      }, (dsIdx, idx) => {
        const day = days[idx];
        let list = byDay.get(day)?.items || [];
        let sub = "";
        if (isConversion) {
          const wantMotor = dsIdx === 0;
          list = list.filter((it) => (wantMotor ? isMotor_(rolOf_(it)) : isTanque_(rolOf_(it))));
          sub = wantMotor ? " · MOTOR" : " · TANQUE";
        }
        openListDrill_(`Finalizados el ${ddmm_(day)}${sub}`, list);
      }),
    }));
  }

  // ── Chart 2: Estado del trabajo (dona con colores de estado) ──
  const elEstado = container.querySelector("#supChEstado");
  if (elEstado) {
    const toneOf = { Terminados: c.good, "En proceso": c.warn, "Sin iniciar": c.axis };
    charts_.push(new Chart(elEstado.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: estadoEntries.map(([k, l]) => `${k} · ${l.length}`),
        datasets: [{
          data: estadoEntries.map(([, l]) => l.length),
          backgroundColor: estadoEntries.map(([k]) => toneOf[k]),
          borderColor: c.surface,   // gap de 2px entre segmentos
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: clickable_({
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { color: c.ink2, font: { family: "inherit", weight: "700" }, boxWidth: 12, boxHeight: 12, borderRadius: 3, useBorderRadius: true, padding: 14 } },
          tooltip: base.plugins.tooltip,
        },
      }, (_dsIdx, idx) => {
        const [k, list] = estadoEntries[idx];
        openListDrill_(k, list);
      }),
    }));
  }

  // ── Chart 3: Top técnicos (barras horizontales) ──
  const elTech = container.querySelector("#supChTecnicos");
  if (elTech && topTechs.length > 1) {
    charts_.push(new Chart(elTech.getContext("2d"), {
      type: "bar",
      data: {
        labels: topTechs.map(([who]) => who.split(" ").slice(0, 2).join(" ")),
        datasets: [{ label: "Finalizados", data: topTechs.map(([, l]) => l.length), backgroundColor: trackColor_(c, track), ...HBAR_STYLE }],
      },
      options: clickable_({
        ...base,
        indexAxis: "y",
        plugins: { ...base.plugins, legend: { display: false } },
        scales: {
          x: { ...base.scales.x, beginAtZero: true, ticks: { ...base.scales.x.ticks, precision: 0 } },
          y: { ...base.scales.y, grid: { display: false } },
        },
      }, (_dsIdx, idx) => {
        const [who, list] = topTechs[idx];
        openListDrill_(`Finalizados · ${who}`, list);
      }),
    }));
  }

  // ── Chart 4: Tiempo por modelo vs objetivo ──
  const elModel = container.querySelector("#supChModelos");
  if (elModel && modelEntries.length) {
    const barColor = trackColor_(c, track);
    charts_.push(new Chart(elModel.getContext("2d"), {
      type: "bar",
      data: {
        labels: modelEntries.map((m) => m.model),
        datasets: [
          {
            type: "line",
            label: "Objetivo",
            data: modelEntries.map(() => tgtH),
            borderColor: c.bad,
            borderWidth: 2,
            borderDash: [6, 5],
            pointRadius: 0,
            pointHitRadius: 0,
            fill: false,
          },
          {
            label: "Horas promedio",
            data: modelEntries.map((m) => Number(m.avgH.toFixed(2))),
            backgroundColor: hexA(barColor, 0.88),
            ...BAR_STYLE,
          },
        ],
      },
      options: clickable_({
        ...base,
        plugins: {
          ...base.plugins,
          legend: { display: true, labels: { ...base.plugins.legend.labels, boxWidth: 12, boxHeight: 12, borderRadius: 3, useBorderRadius: true } },
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.type === "line") return `Objetivo: ${tgtH.toFixed(1)}h`;
                const m = modelEntries[ctx.dataIndex];
                const delta = m.avgH - tgtH;
                return [`Promedio: ${m.avgH.toFixed(2)}h · ${m.items.length} trabajos`, `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}h vs objetivo`];
              },
            },
          },
        },
        scales: {
          x: { ...base.scales.x, grid: { display: false }, ticks: { ...base.scales.x.ticks, autoSkip: false, maxRotation: 30 } },
          y: { ...base.scales.y, beginAtZero: true, ticks: { ...base.scales.y.ticks, callback: (v) => v + "h" } },
        },
      }, (dsIdx, idx) => {
        if (dsIdx === 0) return; // línea de objetivo: sin drill
        const m = modelEntries[idx];
        openListDrill_(`Trabajos · ${m.model}`, m.items);
      }),
    }));
  }
}

function chartCardHTML_(id, title, sub, small = false) {
  return `
    <div class="chartCard">
      <div class="chartCard__head">
        <div class="chartCard__title">${title}</div>
        <div class="chartCard__sub">${sub}</div>
      </div>
      <div class="chartCanvasWrap${small ? " chartCanvasWrap--sm" : ""}"><canvas id="${id}"></canvas></div>
    </div>
  `;
}
