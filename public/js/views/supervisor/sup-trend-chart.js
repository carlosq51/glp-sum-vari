// =========================
// public/js/views/supervisor/sup-trend-chart.js
// GRÁFICO DE TENDENCIAS: Muestra evolución del tiempo de conversión por técnico
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, verticalFill, hexA } from "../../core/viz.js";

let chartInstance = null;
let _last = null; // { canvasEl, items, techName } para re-render al cambiar de tema

// Re-render automático cuando cambia el tema (colores desde tokens)
window.addEventListener("glp:themechange", () => {
  if (_last && chartInstance) {
    renderTrendChart_(_last.canvasEl, _last.items, _last.techName);
  }
});

/**
 * Renderiza gráfico de tendencias de tiempo de conversión
 * @param {HTMLElement} canvasEl - Canvas element para Chart.js
 * @param {Array} items - Array de items filtrados del técnico
 * @param {string} techName - Nombre del técnico
 */
export function renderTrendChart_(canvasEl, items, techName) {
  if (!canvasEl) return;

  // Destruir instancia previa
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // Si no hay técnico seleccionado, ocultar
  if (!techName || techName === "Técnico" || items.length === 0) {
    canvasEl.style.display = "none";
    const container = canvasEl.closest("#supTrendContainer");
    if (container) container.style.display = "none";
    return;
  }

  _last = { canvasEl, items, techName };

  const container = canvasEl.closest("#supTrendContainer");
  if (container) container.style.display = "block";
  canvasEl.style.display = "block";

  // Preparar datos: Mostrar CADA conversión individual (no promedios)
  const allPoints = [];
  let finalizadosCount = 0;

  items.forEach((it) => {
    const estado = String(it.estado || "").trim().toUpperCase();
    const isFinalizado = estado === "FINALIZADO" || estado === "FIN" || estado === "COMPLETADO";
    if (!isFinalizado) return;

    finalizadosCount++;

    const tiempoMs = Number(it?.tiempo_ms ?? 0);
    if (!Number.isFinite(tiempoMs) || tiempoMs <= 0) return;

    const tiempoHoras = tiempoMs / (1000 * 60 * 60);

    // Extraer fecha
    let fecha = it.updated_at || it.fecha_asignacion || it.fecha_inicio || it.fecha || it.fechaHora;
    if (!fecha) return;

    const dateObj = new Date(fecha);
    if (isNaN(dateObj.getTime())) return;

    allPoints.push({
      x: dateObj.toISOString().split("T")[0], // YYYY-MM-DD
      y: tiempoHoras,
      date: dateObj,
      vin: it.vin || "N/A",
    });
  });

  // Ordenar por fecha
  allPoints.sort((a, b) => new Date(a.x) - new Date(b.x));

  // FILTRAR OUTLIERS: Remover puntos con más de 10 horas
  const THRESHOLD_HOURS = 10;
  const filteredPoints = allPoints.filter(p => p.y <= THRESHOLD_HOURS);
  
  console.log("📊 Total finalizados:", finalizadosCount, "| Válidos con tiempo:", allPoints.length, "| Después de filtrar (≤10h):", filteredPoints.length);

  if (filteredPoints.length === 0) {
    canvasEl.style.display = "none";
    if (container) container.style.display = "none";
    return;
  }

  // Crear labels con índice secuencial
  const labels = filteredPoints.map((_, idx) => idx);
  
  const formatDate = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  // Crear gráfico
  const ctx = canvasEl.getContext("2d");

  // Colores desde los tokens del tema activo (day/night)
  const c = readVizColors();
  const line = c.accent2; // azul del acento
  const base = chartBaseOptions(c);

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Tiempo de conversión (h)",
          data: filteredPoints.map(p => p.y),
          borderColor: line,
          backgroundColor: (context) => {
            const { ctx: cx, chartArea } = context.chart;
            if (!chartArea) return hexA(line, 0.14);
            return verticalFill(cx, chartArea, line, 0.30, 0.0);
          },
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: line,
          pointBorderColor: c.surface,
          pointBorderWidth: 2,
          fill: true,
        },
      ],
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        title: { display: false }, // el título vive en el marco .trendBox
        legend: { display: false },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (context) => formatDate(filteredPoints[context[0].dataIndex].date),
            label: (context) => {
              const p = filteredPoints[context.dataIndex];
              return [`Tiempo: ${p.y.toFixed(2)} h`, `VIN: ${p.vin}`];
            },
          },
        },
      },
      scales: {
        x: {
          ...base.scales.x,
          ticks: {
            ...base.scales.x.ticks,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 5,
            callback: function (value, index) {
              const totalPoints = filteredPoints.length;
              const step = Math.max(1, Math.floor(totalPoints / 5));
              if (index === 0 || index === totalPoints - 1 || index % step === 0) {
                const point = filteredPoints[index];
                if (point) return formatDate(point.date);
              }
              return "";
            },
          },
        },
        y: {
          ...base.scales.y,
          beginAtZero: true,
          ticks: {
            ...base.scales.y.ticks,
            callback: (value) => value.toFixed(1) + "h",
          },
        },
      },
    },
  });
}

/**
 * Destruir instancia del gráfico
 */
export function destroyTrendChart_() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}
