// =========================
// public/js/views/supervisor/sup-live-charts.js
// Los gráficos del tablero LIVE. Sustituye a sup-live-cortes-chart.js, que
// solo pintaba los dos de abajo de la tabla de cortes.
//
// QUÉ CONTESTA CADA UNO, y por qué son cuatro y no uno con todo dentro
// -------------------------------------------------------------------
//   1. Ritmo      · carros cerrados en cada HORA de la jornada. Es el pulso:
//                   dice si el taller sigue produciendo o se apagó a las 15:00.
//   2. Acumulado  · lo cerrado hasta cada hora contra la línea del objetivo.
//                   La misma unidad en los dos trazos (carros acumulados), así
//                   que comparten eje y la distancia entre ellos ES el retraso.
//   3. Puestos    · cuántas MITADES cerró cada puesto en cada franja.
//                   Delantero y tanquero juntos por franja porque la pregunta
//                   es si el carro avanza parejo: veinte motores y cuatro
//                   tanques no son "24 mitades", son un cuello de botella que
//                   el total esconde.
//   4. Bruta/final· carros CONVERTIDOS contra carros APROBADOS por calidad.
//                   La distancia entre las dos barras es el trabajo hecho que
//                   todavía no es trabajo entregado.
//
// Ritmo y acumulado NO se juntan: uno es carros por hora y el otro carros
// acumulados. Puestos y bruta/final tampoco: arriba son mitades (dos por
// carro) y abajo son carros. Meterlas en el mismo eje diría que 46 y 26 son
// comparables, y no lo son; con DOS ejes es peor todavía, porque entonces la
// altura relativa de las barras la decide quien eligió las escalas, no los
// datos.
//
// LOS COLORES NO SE ELIGEN AQUÍ
// Salen de los tokens de oficio (--track-motor, --track-tanque,
// --track-calidad), los mismos que usan los iconos de la tabla y las cards de
// los técnicos. El color sigue a la ENTIDAD en toda la app: si el delantero es
// azul en la tabla, es azul en el gráfico. La línea de objetivo no es una
// serie sino una referencia, y va en tinta gris discontinua: pintarla de color
// la pondría a competir con la producción real.
//
// Validados con el validador de paletas en los dos temas. El par
// delantero/tanquero pasa de sobra (ΔE 24.7–26.8 en protanopía). El par
// conversión/calidad pasa separación pero el verde de calidad queda en 2.82:1
// sobre el blanco del tema día, por debajo de 3:1: por eso cada barra lleva su
// número encima y la tabla con las mismas cifras está en el mismo tablero. La
// identidad nunca depende solo del color.
//
// EL CANVAS NO LLEVA ALTURA
// Con maintainAspectRatio:false el canvas se dimensiona al contenedor, y si el
// contenedor no tiene altura propia se la pide al canvas, que se la pide al
// contenedor. La altura vive en el contenedor (.lvTile__box) y el canvas no la
// declara.
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, hexA, onThemeChange } from "../../core/viz.js";

let _charts  = [];
let _series  = null;   // últimas series pintadas, para re-render al cambiar de tema
let _hooks   = null;   // callbacks de interacción (cross-filter)
let _offTema = null;

export const CANVAS = {
  ritmo:   "lvChartRitmo",
  acum:    "lvChartAcum",
  puestos: "lvChartPuestos",
  prod:    "lvChartProd",
};

/**
 * El número encima de cada barra.
 *
 * Solo sobre las barras con valor: poner un "0" sobre cada hueco llenaría el
 * gráfico de ceros y taparía justo lo que hay que leer. Es además la muleta
 * que exige el validador para el verde de calidad en tema día, que no llega a
 * 3:1 contra el blanco — el número se lee aunque la barra no se distinga.
 */
const etiquetasArriba_ = {
  id: "etiquetasArriba",
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "700 10px system-ui, sans-serif";
    ctx.fillStyle = opts.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const ds of chart.getSortedVisibleDatasetMetas()) {
      if (ds.type && ds.type !== "bar") continue;      // la línea de objetivo no se etiqueta
      for (const [i, barra] of ds.data.entries()) {
        const v = chart.data.datasets[ds.index].data[i];
        if (!v) continue;
        ctx.fillText(String(v), barra.x, barra.y - 3);
      }
    }
    ctx.restore();
  },
};

/** Marca vertical en la hora/franja en curso: "esto es ahora, lo de la derecha no ha pasado". */
const lineaAhora_ = {
  id: "lineaAhora",
  afterDatasetsDraw(chart, _args, opts) {
    const i = opts?.index;
    if (i == null || i < 0) return;
    const x = chart.scales.x?.getPixelForValue(i);
    if (x == null || Number.isNaN(x)) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function destruir_() {
  for (const c of _charts) { try { c.destroy(); } catch { /* ya destruido */ } }
  _charts = [];
}

function ejes_(colors, maximo, { pasoY = true } = {}) {
  return {
    x: {
      grid: { display: false },
      border: { color: colors.axis },
      ticks: { color: colors.ink2, font: { size: 10, weight: "600" }, autoSkipPadding: 6 },
    },
    y: {
      beginAtZero: true,
      // Un techo por encima del máximo para que la etiqueta de la barra más
      // alta no quede cortada contra el borde de arriba.
      suggestedMax: Math.max(4, Math.ceil(maximo * 1.18)),
      grid: { color: colors.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: colors.ink2, font: { size: 10 }, precision: 0, maxTicksLimit: pasoY ? 5 : 4 },
    },
  };
}

/**
 * Resalta la franja seleccionada apagando las demás.
 *
 * El color no cambia: cambia la opacidad. Repintar la barra elegida de otro
 * color rompería la regla de que el color sigue a la entidad — el delantero es
 * azul esté seleccionado o no.
 */
function colorPorBarra_(color, n, sel) {
  if (sel == null) return color;
  return Array.from({ length: n }, (_, i) => (i === sel ? color : hexA(color, 0.26)));
}

function clicks_(onIndex) {
  if (!onIndex) return {};
  return {
    onHover: (e, els) => {
      const t = e.native?.target;
      if (t) t.style.cursor = els.length ? "pointer" : "default";
    },
    onClick: (e, els) => { if (els.length) onIndex(els[0].index); },
  };
}

/** Barras agrupadas (puestos, bruta/final, ritmo). */
function barras_(canvasId, datasets, labels, colors, { sel = null, onIndex = null, ahora = null } = {}) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const maximo = Math.max(0, ...datasets.flatMap(d => d.data));
  const base   = chartBaseOptions(colors);

  _charts.push(new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        backgroundColor: colorPorBarra_(d.color, labels.length, sel),
        borderRadius: 4,
        // Solo el extremo de datos se redondea: la base se queda pegada a la
        // línea del cero, que es contra lo que se compara la altura.
        borderSkipped: "bottom",
        maxBarThickness: 22,
        // En Chart.js 4 esto va en el dataset, no en la escala. De aquí sale el
        // hueco entre las dos barras de una misma franja: la categoría ocupa el
        // 70% del paso y cada barra el 88% de su mitad.
        categoryPercentage: 0.70,
        barPercentage: 0.88,
      })),
    },
    options: {
      ...base,
      ...clicks_(onIndex),
      animation: false,          // se re-monta en cada pasada del poll
      maintainAspectRatio: false,
      scales: ejes_(colors, maximo),
      plugins: {
        ...(base.plugins || {}),
        legend: datasets.length > 1 ? {
          display: true,
          position: "top",
          align: "end",
          labels: {
            color: colors.ink,          // la leyenda es TEXTO: tinta, no color de serie
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "rectRounded",
            font: { size: 11, weight: "600" },
          },
        } : { display: false },         // una sola serie: el título ya la nombra
        tooltip: {
          ...(base.plugins?.tooltip || {}),
          callbacks: { title: (items) => `${items[0]?.label ?? ""}` },
        },
        etiquetasArriba: { color: colors.ink2 },
        lineaAhora: { index: ahora, color: colors.axis },
      },
    },
    plugins: [etiquetasArriba_, lineaAhora_],
  }));
}

/** Acumulado real contra la línea de objetivo. Misma unidad, un solo eje. */
function acumulado_(canvasId, serie, colors) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const base = chartBaseOptions(colors);
  const real = colors.series[0] || colors.accent;
  const maximo = Math.max(0, ...serie.real.filter(v => v != null), ...serie.objetivo);

  _charts.push(new Chart(el, {
    type: "line",
    data: {
      labels: serie.labels,
      datasets: [
        {
          label: "Cerrados",
          data: serie.real,
          borderColor: real,
          backgroundColor: hexA(real, 0.16),
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 5,
          spanGaps: false,
        },
        {
          // No es una serie más: es la referencia contra la que se lee la otra.
          // Gris y discontinua a propósito.
          label: "Objetivo",
          data: serie.objetivo,
          borderColor: colors.ink2,
          borderWidth: 2,
          borderDash: [5, 4],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      ...base,
      animation: false,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: ejes_(colors, maximo, { pasoY: false }),
      plugins: {
        ...(base.plugins || {}),
        legend: {
          display: true, position: "top", align: "end",
          labels: {
            color: colors.ink, boxWidth: 14, boxHeight: 2,
            usePointStyle: false, font: { size: 11, weight: "600" },
          },
        },
        tooltip: {
          ...(base.plugins?.tooltip || {}),
          callbacks: {
            title: (items) => `A las ${items[0]?.label ?? ""}`,
            label: (it) => `${it.dataset.label}: ${Math.round(it.parsed.y)}`,
          },
        },
        lineaAhora: { index: serie.idxAhora, color: colors.axis },
      },
    },
    plugins: [lineaAhora_],
  }));
}

/**
 * Pinta los cuatro gráficos con las series que ya calculó el tablero.
 *
 * Las series llegan de fuera y no se recalculan aquí A PROPÓSITO: son los
 * mismos números que la matriz de cortes, y si se contaran dos veces podrían
 * acabar diciendo cosas distintas en la misma pantalla.
 *
 * @param {Object} series   ver modeloCortes_ en sup-live.js
 * @param {Object} [hooks]  { onFranja(i) } — click en una barra = elegir franja
 */
export function montarLiveCharts_(series, hooks = null) {
  destruir_();
  if (!series) return;
  _series = series;
  if (hooks) _hooks = hooks;

  const colors = readVizColors();
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => css.getPropertyValue(n).trim() || fb;

  const cMotor   = tok("--track-motor",   colors.series[0]);
  const cTanque  = tok("--track-tanque",  colors.series[7]);
  const cCalidad = tok("--track-calidad", colors.series[1]);

  const sel      = series.franjaSel ?? null;
  const onFranja = _hooks?.onFranja || null;

  if (series.horas) {
    barras_(CANVAS.ritmo,
      [{ label: "Carros", data: series.horas.conv, color: cMotor }],
      series.horas.labels, colors,
      {
        ahora: series.horas.idxAhora,
        // Una hora pertenece a una franja: el click en la hora elige su franja,
        // que es la unidad con la que el taller corta el día.
        onIndex: onFranja ? (i) => onFranja(series.horas.franjaDe?.[i] ?? null) : null,
      });
  }

  if (series.acum) acumulado_(CANVAS.acum, series.acum, colors);

  barras_(CANVAS.puestos, [
    { label: "Delantero", data: series.delantero, color: cMotor },
    { label: "Tanquero",  data: series.tanquero,  color: cTanque },
  ], series.labels, colors, { sel, onIndex: onFranja, ahora: series.franjaAhora });

  barras_(CANVAS.prod, [
    { label: "Convertidos", data: series.bruta, color: cMotor },
    { label: "Aprobados",   data: series.final, color: cCalidad },
  ], series.labels, colors, { sel, onIndex: onFranja, ahora: series.franjaAhora });

  // Chart.js pinta los colores resueltos, no las var(): al cambiar de tema hay
  // que volver a pintar o los gráficos se quedan con la paleta del tema viejo.
  if (!_offTema) {
    _offTema = onThemeChange(() => { if (_series) montarLiveCharts_(_series); });
  }
}

/** Al salir del LIVE: sin esto los canvas quedan vivos bajo un DOM que ya no está. */
export function destruirLiveCharts_() {
  destruir_();
  _series = null;
  _hooks  = null;
}
