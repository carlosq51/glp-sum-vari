// =========================
// public/js/views/supervisor/sup-live-cortes-chart.js
// Los dos gráficos del bloque "Cortes del día", bajo sus tablas.
//
// QUÉ CONTESTAN, y por qué son DOS y no uno
// -----------------------------------------
//   1. Puestos  · cuántas MITADES cerró cada puesto en cada franja.
//                 Delantero y tanquero van juntos por franja porque la
//                 pregunta es si el carro avanza parejo: veinte motores y
//                 cuatro tanques no son "24 mitades", son un cuello de
//                 botella en el tanque que el total esconde.
//   2. Producción · carros CONVERTIDOS contra carros APROBADOS por calidad.
//                 Bruta y final. La distancia entre las dos barras es el
//                 trabajo hecho que todavía no es trabajo entregado.
//
// No se juntan en un gráfico porque no comparten unidad: arriba son mitades
// (dos por carro) y abajo son carros. Meterlas en el mismo eje diría que 46 y
// 26 son comparables, y no lo son; y meterlas con DOS ejes es peor todavía,
// porque entonces la altura relativa de las barras la decide quien eligió las
// escalas, no los datos.
//
// LOS COLORES NO SE ELIGEN AQUÍ
// Salen de los tokens de oficio (--track-motor, --track-tanque,
// --track-calidad), los mismos que ya usan los iconos de la tabla de arriba y
// las cards de los técnicos. El color sigue a la ENTIDAD en toda la app: si el
// delantero es azul en la tabla, es azul en el gráfico.
//
// Validados con el validador de paletas en los dos temas. El par
// delantero/tanquero pasa de sobra (ΔE 24.7–26.8 en protanopía). El par
// conversión/calidad pasa separación pero el verde de calidad queda en 2.82:1
// sobre el blanco del tema día, por debajo de 3:1: por eso cada barra lleva su
// número encima y la tabla con las mismas cifras está justo arriba. La
// identidad nunca depende solo del color.
//
// EL CANVAS NO LLEVA ALTURA
// Misma trampa que en sup-trend-chart.js: con maintainAspectRatio:false el
// canvas se dimensiona al contenedor, y si el contenedor no tiene altura
// propia se la pide al canvas, que se la pide al contenedor. La altura vive en
// el contenedor y el canvas no la declara.
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, onThemeChange } from "../../core/viz.js";
import { escapeHtml } from "../../core/format.js";

let _charts = [];
let _series = null;   // últimas series pintadas, para re-render al cambiar de tema
let _offTema = null;

const CANVAS_PUESTOS = "lvCortesChartPuestos";
const CANVAS_PROD    = "lvCortesChartProd";

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
      for (const [i, barra] of ds.data.entries()) {
        const v = chart.data.datasets[ds.index].data[i];
        if (!v) continue;
        ctx.fillText(String(v), barra.x, barra.y - 3);
      }
    }
    ctx.restore();
  },
};

/** El hueco de los dos gráficos. Se pinta vacío y se llena al montar. */
export function cortesChartsHTML_() {
  const bloque = (id, titulo, sub) => `
    <figure class="lvCortesFig">
      <figcaption class="lvCortesFig__cap">
        ${escapeHtml(titulo)} <em>${escapeHtml(sub)}</em>
      </figcaption>
      <div class="lvCortesFig__box"><canvas id="${id}"></canvas></div>
    </figure>`;

  return `
    <div class="lvCortesCharts">
      ${bloque(CANVAS_PUESTOS, "Por puesto", "mitades cerradas en cada franja")}
      ${bloque(CANVAS_PROD, "Bruta y final", "carros convertidos · carros aprobados por calidad")}
    </div>`;
}

function destruir_() {
  for (const c of _charts) { try { c.destroy(); } catch {} }
  _charts = [];
}

function ejes_(colors, maximo) {
  return {
    x: {
      grid: { display: false },
      border: { color: colors.axis },
      ticks: { color: colors.ink2, font: { size: 10, weight: "600" } },
    },
    y: {
      beginAtZero: true,
      // Un techo por encima del máximo para que la etiqueta de la barra más
      // alta no quede cortada contra el borde de arriba.
      suggestedMax: Math.max(4, Math.ceil(maximo * 1.18)),
      grid: { color: colors.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: colors.ink2, font: { size: 10 }, precision: 0, maxTicksLimit: 5 },
    },
  };
}

function pintar_(canvasId, datasets, labels, colors) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const maximo = Math.max(0, ...datasets.flatMap(d => d.data));

  const chart = new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.color,
        borderRadius: 4,
        // Solo el extremo de datos se redondea: la base se queda pegada a la
        // línea del cero, que es contra lo que se compara la altura.
        borderSkipped: "bottom",
        maxBarThickness: 22,
        // En Chart.js 4 esto va en el dataset, no en la escala. De aquí sale
        // el hueco entre las dos barras de una misma franja: la categoría
        // ocupa el 70% del paso y cada barra el 88% de su mitad.
        categoryPercentage: 0.70,
        barPercentage: 0.88,
      })),
    },
    options: {
      ...chartBaseOptions(colors),
      animation: false,          // se re-monta en cada pasada del poll
      maintainAspectRatio: false,
      scales: ejes_(colors, maximo),
      plugins: {
        ...(chartBaseOptions(colors).plugins || {}),
        legend: {
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
        },
        tooltip: {
          ...(chartBaseOptions(colors).plugins?.tooltip || {}),
          callbacks: {
            title: (items) => `Franja ${items[0]?.label ?? ""}`,
          },
        },
        etiquetasArriba: { color: colors.ink2 },
      },
    },
    plugins: [etiquetasArriba_],
  });

  _charts.push(chart);
}

/**
 * Pinta los dos gráficos con las series que acaba de calcular la tabla.
 *
 * Las series llegan de cortesHTML_ y no se recalculan aquí A PROPÓSITO: son
 * los mismos números que la tabla de arriba, y si se contaran dos veces
 * podrían acabar diciendo cosas distintas en la misma pantalla.
 *
 * @param {{labels:string[], delantero:number[], tanquero:number[],
 *          bruta:number[], final:number[]}} series
 */
export function montarCortesCharts_(series) {
  destruir_();
  if (!series?.labels?.length) return;
  _series = series;

  const colors = readVizColors();
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => css.getPropertyValue(n).trim() || fb;

  pintar_(CANVAS_PUESTOS, [
    { label: "Delantero", data: series.delantero, color: tok("--track-motor",  colors.series[0]) },
    { label: "Tanquero",  data: series.tanquero,  color: tok("--track-tanque", colors.series[7]) },
  ], series.labels, colors);

  pintar_(CANVAS_PROD, [
    { label: "Convertidos", data: series.bruta, color: tok("--track-motor",   colors.series[0]) },
    { label: "Aprobados",   data: series.final, color: tok("--track-calidad", colors.series[1]) },
  ], series.labels, colors);

  // Chart.js pinta los colores resueltos, no las var(): al cambiar de tema hay
  // que volver a pintar o los gráficos se quedan con la paleta del tema viejo.
  if (!_offTema) {
    _offTema = onThemeChange(() => { if (_series) montarCortesCharts_(_series); });
  }
}

/** Al salir del LIVE: sin esto los canvas quedan vivos bajo un DOM que ya no está. */
export function destruirCortesCharts_() {
  destruir_();
  _series = null;
}
