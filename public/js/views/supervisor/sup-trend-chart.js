// =========================
// public/js/views/supervisor/sup-trend-chart.js
// Tendencia de los tiempos de conversión: datos crudos + regresión + objetivo.
//
// QUÉ CONTESTA: "¿estamos mejorando?". El promedio del mes no lo dice —sube y
// baja con el mix de carros— y la lista de tiempos tampoco: son cien números
// sueltos. Aquí se ve la nube real, la recta de tendencia encima, y la línea
// del objetivo cruzando las dos.
//
// LA RECTA ES THEIL–SEN, NO MÍNIMOS CUADRADOS
// Un carro que nadie cerró marca catorce horas. Eso no es trabajo lento, es un
// registro roto, y con el error al cuadrado un solo punto así inclina la recta
// entera: la "tendencia" acabaría midiendo los olvidos. Theil–Sen toma la
// mediana de las pendientes entre pares y aguanta ~29% de basura. Ver
// lib/regresion.js.
//
// LOS OUTLIERS SE DIBUJAN, NO SE BORRAN
// Antes se descartaba todo lo que pasara de 10 h. Escondía datos: el supervisor
// no veía que existían, y son justo la señal de que hay que enseñarle a alguien
// a cerrar su OT. Se les quita el voto sobre la recta, no la existencia.
//
// EL CANVAS NO LLEVA ALTURA
// Con responsive + maintainAspectRatio:false, Chart.js dimensiona el canvas al
// CONTENEDOR. Si el contenedor no tiene altura propia, la toma del canvas, que
// a su vez la toma del contenedor: cada frame crece un poco y el gráfico se
// "genera" hacia abajo sin parar. La altura vive en el contenedor (que además
// es position:relative) y el canvas no la declara.
// =========================

import { Chart } from "chart.js/auto";
import { readVizColors, chartBaseOptions, hexA } from "../../core/viz.js";
import { cfg } from "../../core/config.js";
import { theilSen_, lecturaTendencia_ } from "../../../../lib/regresion.js";

let chartInstance = null;
let _last = null;   // { items, techName } para re-render al cambiar de tema/filtro

// Filtros de la vista. Viven aquí porque son del gráfico, no del reporte: el
// supervisor acota lo que MIRA sin recargar ni volver a consultar la base.
const F = { rol: "TODOS", modelo: "TODOS", visible: false };

const ROLES_CONV = ["MOTOR", "TANQUE", "TANQUERO", "TECNICO", "CONVERSION"];
const esDelantero_ = (r) => ["MOTOR", "TECNICO", "CONVERSION"].includes(r);
const esTanquero_  = (r) => ["TANQUE", "TANQUERO"].includes(r);

window.addEventListener("glp:themechange", () => {
  if (_last && F.visible) pintar_();
});

export function destroyTrendChart_() {
  try { chartInstance?.destroy(); } catch { /* ya destruido */ }
  chartInstance = null;
}

/** Puntos utilizables: finalizados, de conversión, con tiempo y fecha. */
function puntosDe_(items) {
  const out = [];
  for (const it of items || []) {
    const est = String(it?.estado || "").trim().toUpperCase();
    if (!["FINALIZADO", "FIN", "COMPLETADO"].includes(est)) continue;

    const rol = String(it?.rol || it?.rolTrabajo || "").toUpperCase();
    if (!ROLES_CONV.includes(rol)) continue;

    const ms = Number(it?.tiempo_ms ?? it?.tiempo_trab_ms ?? 0);
    if (!Number.isFinite(ms) || ms <= 0) continue;

    const d = new Date(it?.updated_at || it?.fecha_asignacion || it?.fecha_inicio || 0);
    if (isNaN(d.getTime()) || d.getTime() <= 0) continue;

    out.push({
      y: ms / 3600000,             // horas
      date: d,
      rol,
      vin: it?.vin || "N/A",
      modelo: String(it?.modelo || "").trim() || "Sin modelo",
      tecnico: it?.userName || "",
    });
  }
  out.sort((a, b) => a.date - b.date);
  return out;
}

const aplicaFiltro_ = (p) => {
  if (F.rol === "DELANTERO" && !esDelantero_(p.rol)) return false;
  if (F.rol === "TANQUERO"  && !esTanquero_(p.rol))  return false;
  if (F.modelo !== "TODOS" && p.modelo !== F.modelo) return false;
  return true;
};

function fmtFecha_(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Barra de filtros + botón. Se re-pinta sola al cambiar de selección. */
function pintarControles_(todos) {
  const box = document.getElementById("supTrendControls");
  if (!box) return;

  const modelos = [...new Set(todos.map(p => p.modelo))].sort();
  const opt = (v, txt, sel) => `<option value="${v}"${sel === v ? " selected" : ""}>${txt}</option>`;

  box.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;">
      <button type="button" id="supTrendToggle" class="btn3"
        style="font-weight:900;">${F.visible ? "Ocultar gráfico" : "📈 Mostrar gráfico"}</button>
      <select id="supTrendRol" class="small" style="padding:7px 10px; border-radius:8px;">
        ${opt("TODOS", "Ambos puestos", F.rol)}
        ${opt("DELANTERO", "Solo delantero", F.rol)}
        ${opt("TANQUERO", "Solo tanquero", F.rol)}
      </select>
      <select id="supTrendModelo" class="small" style="padding:7px 10px; border-radius:8px; max-width:190px;">
        ${opt("TODOS", `Todos los modelos (${modelos.length})`, F.modelo)}
        ${modelos.map(m => opt(m, m, F.modelo)).join("")}
      </select>
      <span class="small" id="supTrendCount" style="opacity:.7;"></span>
    </div>`;

  box.querySelector("#supTrendToggle")?.addEventListener("click", () => {
    F.visible = !F.visible;
    pintar_();
  });
  const onFiltro = (id, campo) => {
    box.querySelector(id)?.addEventListener("change", (e) => {
      F[campo] = e.target.value;
      // Cambiar un filtro implica querer verlo: obligar a pulsar "mostrar"
      // otra vez sería castigar al que está explorando.
      F.visible = true;
      pintar_();
    });
  };
  onFiltro("#supTrendRol", "rol");
  onFiltro("#supTrendModelo", "modelo");
}

function pintar_() {
  destroyTrendChart_();
  if (!_last) return;

  const canvasEl = document.getElementById("supTrendChart");
  const wrap     = document.getElementById("supTrendCanvasWrap");
  const lecturaEl = document.getElementById("supTrendLectura");
  if (!canvasEl || !wrap) return;

  const todos = puntosDe_(_last.items);
  pintarControles_(todos);

  const pts = todos.filter(aplicaFiltro_);
  const cnt = document.getElementById("supTrendCount");
  if (cnt) cnt.textContent = `${pts.length} de ${todos.length} carros`;

  // Oculto: el canvas no se dibuja y no hay nada que crezca.
  wrap.style.display = F.visible ? "block" : "none";
  if (lecturaEl) lecturaEl.style.display = F.visible ? "block" : "none";
  if (!F.visible) return;

  if (pts.length < 2) {
    if (lecturaEl) lecturaEl.innerHTML = "Faltan carros cerrados con estos filtros para dibujar una tendencia.";
    wrap.style.display = "none";
    return;
  }

  const objetivoMin = Math.max(1, Number(cfg("TARGET_CONVERSION_MIN")) || 180);
  const objetivoH   = objetivoMin / 60;
  const sospechosoH = objetivoH * 2;

  // La regresión va sobre el ÍNDICE del punto, que es el eje X del gráfico.
  const modelo    = theilSen_(pts.map((p, i) => ({ x: i, y: p.y })));
  const tendencia = modelo.ok ? pts.map((_, i) => modelo.intercepto + modelo.pendiente * i) : [];
  const lectura   = lecturaTendencia_(modelo, objetivoH, Math.max(0, pts.length - 1));

  const c    = readVizColors();
  const base = chartBaseOptions(c);
  const line = c.accent2;

  chartInstance = new Chart(canvasEl.getContext("2d"), {
    type: "line",
    data: {
      labels: pts.map((_, i) => i),
      datasets: [
        // Objetivo y tendencia van primero: quedan DEBAJO de la nube, que es
        // el dato. Las líneas son la referencia, no el protagonista.
        {
          label: `Objetivo ${Math.round(objetivoMin)} min`,
          data: pts.map(() => objetivoH),
          borderColor: c.warn || "#facc15",
          borderWidth: 2, borderDash: [6, 5], pointRadius: 0, fill: false, tension: 0,
        },
        ...(tendencia.length ? [{
          label: "Tendencia",
          data: tendencia,
          borderColor: c.good || "#0ca30c",
          borderWidth: 3, pointRadius: 0, fill: false, tension: 0,
        }] : []),
        {
          label: "Tiempo por carro (h)",
          data: pts.map(p => p.y),
          // Sin línea entre puntos: son carros distintos, no una serie continua.
          // Unirlos sugeriría una evolución que no existe entre dos VIN.
          showLine: false,
          pointRadius: 3.5,
          pointHoverRadius: 7,
          pointBackgroundColor: pts.map(p => (p.y > sospechosoH ? (c.bad || "#d03b3b") : line)),
          pointBorderColor: hexA(c.surface, 1),
          pointBorderWidth: 1,
        },
      ],
    },
    options: {
      ...base,
      plugins: {
        ...base.plugins,
        title: { display: false },
        legend: { display: true, labels: { color: c.ink2, boxWidth: 12, font: { size: 10 } } },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (ctx) => {
              const p = pts[ctx?.[0]?.dataIndex];
              return p ? fmtFecha_(p.date) : "";
            },
            label: (ctx) => {
              // Solo la NUBE lleva VIN. Sin esta guarda, pasar por la recta o
              // por el objetivo mostraría el VIN del carro de ese índice.
              if (!String(ctx.dataset?.label || "").startsWith("Tiempo por carro")) {
                return `${ctx.dataset?.label}: ${Number(ctx.parsed?.y ?? 0).toFixed(2)} h`;
              }
              const p = pts[ctx.dataIndex];
              if (!p) return "";
              const sosp = p.y > sospechosoH ? "  ⚠ probable OT sin cerrar" : "";
              return [
                `${p.y.toFixed(2)} h${sosp}`,
                `VIN: ${p.vin}`,
                `Modelo: ${p.modelo}`,
                p.tecnico ? `Técnico: ${p.tecnico}` : "",
              ].filter(Boolean);
            },
          },
        },
      },
      scales: {
        ...base.scales,
        x: {
          ...base.scales.x,
          ticks: {
            ...base.scales.x.ticks,
            maxRotation: 0, autoSkip: true, maxTicksLimit: 6,
            callback: (_v, i) => {
              const paso = Math.max(1, Math.floor(pts.length / 6));
              return (i === 0 || i === pts.length - 1 || i % paso === 0) && pts[i]
                ? fmtFecha_(pts[i].date) : "";
            },
          },
        },
        y: {
          ...base.scales.y,
          // Arranca en cero a propósito: un eje recortado exagera la pendiente,
          // y este gráfico se usa para decidir si alguien está mejorando.
          beginAtZero: true,
          ticks: { ...base.scales.y.ticks, callback: (v) => `${v}h` },
        },
      },
    },
  });

  if (lecturaEl) {
    const n = pts.filter(p => p.y > sospechosoH).length;
    const aviso = n
      ? ` · <span style="color:var(--danger,#f87171);">${n} carro(s) sobre ${sospechosoH.toFixed(0)} h</span>, probablemente OTs sin cerrar: se muestran, pero no inclinan la tendencia.`
      : "";
    lecturaEl.innerHTML = `📈 <b>${lectura.texto}</b>${aviso}`;
  }
}

/**
 * Punto de entrada desde el reporte.
 *
 * Ya NO exige técnico: la pregunta "¿está bajando el tiempo de conversión?" es
 * del taller entero, y limitarla a una persona obligaba a revisarla de uno en
 * uno para responder algo global.
 *
 * @param {HTMLElement} canvasEl  (se conserva por compatibilidad de la firma)
 * @param {Array}  items          items del reporte, ya filtrados
 * @param {string} techName       nombre si hay filtro de técnico (solo informativo)
 */
export function renderTrendChart_(canvasEl, items, techName) {
  const container = document.getElementById("supTrendContainer");
  if (!container) return;

  const hay = (items || []).length > 0;
  container.style.display = hay ? "block" : "none";
  if (!hay) { destroyTrendChart_(); return; }

  _last = { items, techName };
  pintar_();
}
