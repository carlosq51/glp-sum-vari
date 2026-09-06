// =========================
// public/js/views/supervisor/sup-trend-chart.js
// GRÁFICO DE TENDENCIAS: Muestra evolución del tiempo de conversión por técnico
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, verticalFill, hexA } from "../../core/viz.js";
import { cfg } from "../../core/config.js";
import { theilSen_, lecturaTendencia_ } from "../../../../lib/regresion.js";

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

  // Los carros disparatados YA NO SE BORRAN.
  //
  // Antes se descartaba todo lo que pasara de 10 h. El motivo era bueno —esos
  // puntos son casi siempre OTs que nadie cerró, no trabajo lento— pero la
  // solución escondía datos: el supervisor no veía que existían, y son justo la
  // señal de que hay que enseñarle a alguien a cerrar su OT.
  //
  // Ahora se dibujan todos y se les quita el VOTO, no la existencia: la recta
  // de tendencia es Theil–Sen (mediana de pendientes), que aguanta hasta ~29%
  // de basura sin moverse. Ver lib/regresion.js.
  const filteredPoints = allPoints;

  // Umbral de "esto huele a OT sin cerrar": el doble del objetivo. Se pintan
  // en rojo para que se distingan de un carro simplemente lento.
  const objetivoMin  = Math.max(1, Number(cfg("TARGET_CONVERSION_MIN")) || 180);
  const objetivoH    = objetivoMin / 60;
  const sospechosoH  = objetivoH * 2;
  const nSospechosos = filteredPoints.filter(p => p.y > sospechosoH).length;

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

  // Tendencia robusta sobre (índice, horas). El eje X del gráfico es el índice
  // secuencial del punto, así que la regresión se hace en ese mismo espacio
  // para que la recta caiga donde tiene que caer.
  const modelo = theilSen_(filteredPoints.map((p, i) => ({ x: i, y: p.y })));
  const tendencia = modelo.ok
    ? labels.map(i => modelo.intercepto + modelo.pendiente * i)
    : [];
  const lectura = lecturaTendencia_(modelo, objetivoH, Math.max(0, filteredPoints.length - 1));

  // La lectura en castellano bajo el gráfico. Una recta sin interpretar obliga
  // a cada supervisor a deducir la pendiente a ojo, y cada uno deduce otra cosa.
  const elLectura = document.getElementById("supTrendLectura");
  if (elLectura) {
    const aviso = nSospechosos
      ? ` · <span style="color:var(--danger,#f87171);">${nSospechosos} carro(s) sobre ${sospechosoH.toFixed(0)} h</span>, probablemente OTs sin cerrar: se muestran pero no inclinan la tendencia.`
      : "";
    elLectura.innerHTML = `📈 <b>${lectura.texto}</b>${aviso}`;
  }

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
        // Recta de tendencia y objetivo van PRIMERO para quedar por debajo de
        // los puntos: la nube es el dato, las líneas son la referencia.
        ...(tendencia.length ? [{
          label: "Tendencia",
          data: tendencia,
          borderColor: c.ok || "#22c55e",
          borderWidth: 3,
          borderDash: [],
          pointRadius: 0,
          tension: 0,
          fill: false,
        }] : []),
        {
          label: `Objetivo ${Math.round(objetivoMin)} min`,
          data: labels.map(() => objetivoH),
          borderColor: c.warn || "#facc15",
          borderWidth: 2,
          borderDash: [6, 5],
          pointRadius: 0,
          tension: 0,
          fill: false,
        },
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
          pointBackgroundColor: filteredPoints.map(
            p => (p.y > sospechosoH ? (c.danger || "#f87171") : line)),
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
        // Con tres series (nube, tendencia y objetivo) la leyenda deja de ser
        // decoración: sin ella no se sabe cuál línea es cuál.
        legend: { display: true, labels: { color: c.ink2, boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (context) => formatDate(filteredPoints[context[0].dataIndex].date),
            label: (context) => {
              // Solo la NUBE lleva VIN. Sin esta guarda, pasar por la recta de
              // tendencia o por la línea de objetivo mostraría el VIN del
              // carro que casualmente cae en ese índice.
              const esNube = String(context.dataset?.label || "").startsWith("Tiempo de conversión");
              if (!esNube) return `${context.dataset?.label}: ${Number(context.parsed?.y ?? 0).toFixed(2)} h`;
              const p = filteredPoints[context.dataIndex];
              const sosp = p && p.y > sospechosoH ? " ⚠ probable OT sin cerrar" : "";
              return [`Tiempo: ${p.y.toFixed(2)} h${sosp}`, `VIN: ${p.vin}`];
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
