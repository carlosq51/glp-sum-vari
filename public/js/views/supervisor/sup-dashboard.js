// =========================
// public/js/views/supervisor/sup-dashboard.js
// Panel visual del REPORTE — UN gráfico con filtros.
//
// Antes eran cuatro tarjetas de gráfico, una debajo de la otra (producción
// por día, estado, top técnicos, tiempo por modelo). Cuatro ejes distintos,
// cuatro leyendas y cuatro alturas: para leer una había que pasar de largo
// las otras tres, y en celular eran cuatro pantallazos de scroll.
//
// Ahora es un solo bloque con un segmentado arriba: se elige la pregunta
// ("¿cuánto se produjo por día?", "¿en qué estado está el trabajo?") y el
// gráfico se redibuja en el mismo sitio, con el mismo alto y en el mismo
// lugar de la pantalla. Lo que antes se comparaba mirando cuatro cajas ahora
// se compara tocando una pestaña, y el drill-down al tocar una barra sigue
// funcionando igual.
//
// La vista elegida se recuerda: el supervisor que siempre mira "por día" no
// tiene que volver a elegirla en cada "Aplicar filtros".
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, hexA } from "../../core/viz.js";
import { openDrilldown } from "../../core/drilldown.js";
import { isFinalizado_, durationMsFromItem_ } from "./sup-filters.js";
import { robustLocalAverage_ } from "./sup-stats.js";
import { detectModel_ } from "./sup-kpis.js";
import { fmtDur_ } from "../../core/format.js";
import { escapeHtml } from "../../core/core.js";
import { icon } from "../../core/icons.js";
import { cfg } from "../../core/config.js";

let chart_ = null;
let _last = null;   // args para re-render al cambiar de tema

// Qué vista está elegida. Se guarda para que no haya que volver a elegirla
// en cada aplicación de filtros.
const VISTA_KEY = "glp_sup_dash_vista";
let vistaSel_ = (() => {
  try { return localStorage.getItem(VISTA_KEY) || ""; } catch { return ""; }
})();

function setVistaSel_(id) {
  vistaSel_ = id;
  try { localStorage.setItem(VISTA_KEY, id); } catch { /* modo privado */ }
}

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

// ─── Preparación de datos ─────────────────────────────────────────────

/**
 * prep_ — el cálculo de las cuatro vistas, una sola vez por render.
 *
 * Se hace entero aunque solo se dibuje una vista, por dos razones: el
 * segmentado cambia de gráfico al instante, y hace falta saber qué pestañas
 * tienen datos para esconder las que no. Son cuentas sobre una lista que ya
 * está en memoria, no viajes al servidor.
 */
function prep_(items, track, techName) {
  const isConversion = track === "CONVERSION";
  const finalizados = items.filter((it) => isFinalizado_(it.estado));

  // Producción por día
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

  // Estado del trabajo
  const estadoGroups = {
    Terminados:    finalizados,
    "En proceso":  items.filter((it) => ["TRABAJANDO", "PAUSADO"].includes(String(it.estado || "").toUpperCase())),
    "Sin iniciar": items.filter((it) => String(it.estado || "").toUpperCase() === "SIN_INICIAR"),
  };
  const estadoEntries = Object.entries(estadoGroups).filter(([, l]) => l.length > 0);

  // Top técnicos — no tiene sentido cuando ya se filtró por un técnico
  const byTech = new Map();
  if (!techName) {
    for (const it of finalizados) {
      const who = String(it.userName || it.userEmail || "").trim() || "—";
      if (!byTech.has(who)) byTech.set(who, []);
      byTech.get(who).push(it);
    }
  }
  const topTechs = [...byTech.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);

  // Tiempo por modelo
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

  return {
    items, track, isConversion,
    byDay, days, estadoEntries, topTechs, modelEntries,
    tgtH: targetHours_(track),
  };
}

// ─── Las cuatro vistas ────────────────────────────────────────────────
//
// Cada una responde una pregunta distinta y sabe tres cosas: si tiene datos
// con el filtro puesto (`hay`), qué decir en la bajada del bloque (`sub`) y
// cómo dibujarse (`build`, que devuelve la config de Chart.js ya con su
// drill-down). Agregar una quinta pregunta es agregar un objeto acá.

const VISTAS = [
  {
    id: "dias",
    label: "Por día",
    ico: "calendar",
    alto: 340,
    hay: (d) => d.days.length > 0,
    sub: (d) => d.isConversion
      ? "Trabajos finalizados cada día · Motor vs Tanque"
      : "Trabajos finalizados cada día, por fecha de cierre",
    build: (d, c, base) => {
      const motorColor  = c.series[0];  // --dv-1 (mismo azul que track motor)
      const tanqueColor = c.series[7];  // --dv-8 (mismo naranja que track tanque)
      const datasets = d.isConversion
        ? [
            { label: "Motor",  data: d.days.map((x) => d.byDay.get(x).motor),  backgroundColor: motorColor,  ...BAR_STYLE },
            { label: "Tanque", data: d.days.map((x) => d.byDay.get(x).tanque), backgroundColor: tanqueColor, ...BAR_STYLE },
          ]
        : [
            {
              label: "Finalizados",
              data: d.days.map((x) => {
                const b = d.byDay.get(x);
                return b.motor + b.tanque + b.otros;
              }),
              backgroundColor: trackColor_(c, d.track),
              ...BAR_STYLE,
            },
          ];
      return {
        type: "bar",
        data: { labels: d.days.map(ddmm_), datasets },
        options: clickable_({
          ...base,
          plugins: {
            ...base.plugins,
            legend: { display: d.isConversion, labels: { ...base.plugins.legend.labels, boxWidth: 12, boxHeight: 12, borderRadius: 3, useBorderRadius: true } },
          },
          scales: {
            x: { ...base.scales.x, grid: { display: false } },
            y: { ...base.scales.y, beginAtZero: true, ticks: { ...base.scales.y.ticks, precision: 0 } },
          },
        }, (dsIdx, idx) => {
          const day = d.days[idx];
          let list = d.byDay.get(day)?.items || [];
          let sub = "";
          if (d.isConversion) {
            const wantMotor = dsIdx === 0;
            list = list.filter((it) => (wantMotor ? isMotor_(rolOf_(it)) : isTanque_(rolOf_(it))));
            sub = wantMotor ? " · MOTOR" : " · TANQUE";
          }
          openListDrill_(`Finalizados el ${ddmm_(day)}${sub}`, list);
        }),
      };
    },
  },

  {
    id: "estado",
    label: "Estado",
    ico: "listChecks",
    alto: 300,
    hay: (d) => d.estadoEntries.length > 0,
    sub: (d) => `En qué va cada una de las ${d.items.length} asignaciones del filtro`,
    build: (d, c, base) => {
      const toneOf = { Terminados: c.good, "En proceso": c.warn, "Sin iniciar": c.axis };
      return {
        type: "doughnut",
        data: {
          labels: d.estadoEntries.map(([k, l]) => `${k} · ${l.length}`),
          datasets: [{
            data: d.estadoEntries.map(([, l]) => l.length),
            backgroundColor: d.estadoEntries.map(([k]) => toneOf[k]),
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
          const [k, list] = d.estadoEntries[idx];
          openListDrill_(k, list);
        }),
      };
    },
  },

  {
    id: "tecnicos",
    label: "Técnicos",
    ico: "users",
    alto: 340,
    // Con un solo técnico en la lista no hay nada que comparar.
    hay: (d) => d.topTechs.length > 1,
    sub: () => "Trabajos finalizados por persona, de mayor a menor",
    build: (d, c, base) => ({
      type: "bar",
      data: {
        labels: d.topTechs.map(([who]) => who.split(" ").slice(0, 2).join(" ")),
        datasets: [{ label: "Finalizados", data: d.topTechs.map(([, l]) => l.length), backgroundColor: trackColor_(c, d.track), ...HBAR_STYLE }],
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
        const [who, list] = d.topTechs[idx];
        openListDrill_(`Finalizados · ${who}`, list);
      }),
    }),
  },

  {
    id: "modelos",
    label: "Modelos",
    ico: "car",
    alto: 340,
    hay: (d) => d.modelEntries.length > 0,
    sub: (d) => `Horas promedio por modelo contra el objetivo de ${d.tgtH.toFixed(1)} h`,
    build: (d, c, base) => {
      const barColor = trackColor_(c, d.track);
      return {
        type: "bar",
        data: {
          labels: d.modelEntries.map((m) => m.model),
          datasets: [
            {
              type: "line",
              label: "Objetivo",
              data: d.modelEntries.map(() => d.tgtH),
              borderColor: c.bad,
              borderWidth: 2,
              borderDash: [6, 5],
              pointRadius: 0,
              pointHitRadius: 0,
              fill: false,
            },
            {
              label: "Horas promedio",
              data: d.modelEntries.map((m) => Number(m.avgH.toFixed(2))),
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
                  if (ctx.dataset.type === "line") return `Objetivo: ${d.tgtH.toFixed(1)}h`;
                  const m = d.modelEntries[ctx.dataIndex];
                  const delta = m.avgH - d.tgtH;
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
          if (dsIdx === 0) return;   // la línea de objetivo no abre detalle
          const m = d.modelEntries[idx];
          openListDrill_(`Trabajos · ${m.model}`, m.items);
        }),
      };
    },
  },
];

// ─── Render ───────────────────────────────────────────────────────────

export function destroySupDashboard_() {
  try { chart_?.destroy(); } catch { /* ya destruido */ }
  chart_ = null;
  _last = null;
}

/**
 * @param {HTMLElement} container  #supDashboard
 * @param {Object} data  { items, track, techName }
 */
export function renderSupDashboard_(container, data) {
  if (!container) return;
  try { chart_?.destroy(); } catch { /* noop */ }
  chart_ = null;

  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) {
    container.style.display = "none";
    container.innerHTML = "";
    _last = null;
    return;
  }
  _last = { container, data };
  container.style.display = "";

  const c    = readVizColors();
  const base = chartBaseOptions(c);
  const d    = prep_(items, data?.track || "CONVERSION", data?.techName || "");

  // Solo las vistas que tienen algo que mostrar con el filtro actual.
  const disponibles = VISTAS.filter((v) => v.hay(d));
  if (!disponibles.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  // La guardada si sigue disponible; si no, la primera que haya.
  let vista = disponibles.find((v) => v.id === vistaSel_) || disponibles[0];

  container.innerHTML = `
    <section class="dataBlock supDashBlock" style="--tone:${trackColor_(c, d.track)};">
      <div class="dataBlock__hdr">
        <span class="dataBlock__icon" aria-hidden="true">${icon("chart", 22)}</span>
        <div class="dataBlock__text">
          <span class="dataBlock__title">Panel visual</span>
          <span class="dataBlock__sub" id="supDashSub">${escapeHtml(vista.sub(d))}</span>
        </div>
      </div>
      <div class="supDashTabs" role="tablist" aria-label="Qué mostrar en el gráfico">
        ${disponibles.map((v) => `
          <button type="button" class="supDashTab${v.id === vista.id ? " supDashTab--on" : ""}"
            role="tab" aria-selected="${v.id === vista.id}" data-vista="${v.id}">
            ${icon(v.ico, 16)} ${v.label}
          </button>`).join("")}
      </div>
      <div class="dataBlock__body">
        <div class="supDashCanvasWrap" id="supDashCanvasWrap">
          <canvas id="supDashCanvas"></canvas>
        </div>
        <div class="supDashHint">Toca una barra o segmento para ver el detalle</div>
      </div>
    </section>
  `;

  const wrap   = container.querySelector("#supDashCanvasWrap");
  const canvas = container.querySelector("#supDashCanvas");
  const subEl  = container.querySelector("#supDashSub");

  // El alto vive en el contenedor y no en el canvas: con responsive y
  // maintainAspectRatio:false, si el canvas saca su alto del contenedor y el
  // contenedor del canvas, el gráfico crece un poco en cada frame.
  const pintar = () => {
    try { chart_?.destroy(); } catch { /* noop */ }
    if (wrap) wrap.style.height = `${vista.alto}px`;
    if (subEl) subEl.textContent = vista.sub(d);
    chart_ = new Chart(canvas.getContext("2d"), vista.build(d, c, base));
  };
  pintar();

  container.querySelectorAll(".supDashTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const siguiente = disponibles.find((v) => v.id === btn.dataset.vista);
      if (!siguiente || siguiente.id === vista.id) return;
      vista = siguiente;
      setVistaSel_(vista.id);
      container.querySelectorAll(".supDashTab").forEach((b) => {
        const on = b.dataset.vista === vista.id;
        b.classList.toggle("supDashTab--on", on);
        b.setAttribute("aria-selected", String(on));
      });
      pintar();
    });
  });
}
