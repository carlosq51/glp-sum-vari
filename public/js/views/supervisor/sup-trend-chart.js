// =========================
// public/js/views/supervisor/sup-trend-chart.js
// GRÁFICO DE TENDENCIAS: Muestra evolución del tiempo de conversión por técnico
// =========================

import { Chart } from "chart.js/auto";

let chartInstance = null;

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

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Tiempo promedio (horas)",
          data: filteredPoints.map(p => p.y),
          borderColor: "rgba(75, 192, 192, 1)",
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "rgba(75, 192, 192, 1)",
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Tendencia de tiempo de conversión - ${techName}`,
          color: "#fff",
          font: {
            size: 18,
            weight: "bold",
          },
          padding: 20,
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
          callbacks: {
            title: function(context) {
              const index = context[0].dataIndex;
              const point = filteredPoints[index];
              return formatDate(point.date);
            },
            label: function (context) {
              const index = context.dataIndex;
              const point = filteredPoints[index];
              return [
                `Tiempo: ${point.y.toFixed(2)} horas`,
                `VIN: ${point.vin}`,
              ];
            },
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Fecha",
            color: "#fff",
            font: {
              size: 14,
              weight: "bold",
            },
          },
          ticks: {
            color: "#fff",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 5, // Mostrar ~5 labels distribuidos
            callback: function(value, index) {
              // Mostrar fechas distribuidas uniformemente
              const totalPoints = filteredPoints.length;
              const step = Math.floor(totalPoints / 5);
              
              // Mostrar primera, última y algunas intermedias
              if (index === 0 || index === totalPoints - 1 || index % step === 0) {
                const point = filteredPoints[index];
                if (point) return formatDate(point.date);
              }
              return '';
            },
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
            drawOnChartArea: true,
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Duración (horas)",
            color: "#fff",
            font: {
              size: 14,
              weight: "bold",
            },
          },
          ticks: {
            color: "#fff",
            callback: function (value) {
              return value.toFixed(1) + "h";
            },
          },
          grid: {
            color: "rgba(255, 255, 255, 0.15)",
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
