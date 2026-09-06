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
// EL EJE Y ES LOGARÍTMICO Y GIRA ALREDEDOR DEL OBJETIVO
// En escala lineal un carro de 14 h estira el eje hasta 14 h, y los cientos de
// carros que están entre 2 h y 4 h —donde de verdad se decide si el taller
// cumple— quedan aplastados en una franja de dos milímetros. Se perdía justo la
// información que se venía a mirar.
// Con eje log la distancia deja de medir horas y pasa a medir PROPORCIÓN: la
// separación entre 1 h30 y 3 h es la misma que entre 3 h y 6 h. Los ticks se
// generan anclados en el objetivo (…×¼, ×½, objetivo, ×2, ×4), así que el
// objetivo cae siempre sobre una línea rotulada y "el doble del objetivo" es
// una distancia constante. Los outliers siguen dibujados, pero a una casilla
// del resto en vez de a media pantalla.
// La escala lineal sigue disponible en el selector: es la que no exagera ni
// disimula la pendiente cuando se quiere leer la mejora en horas reales.
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
import { normalizeModelo_ } from "../../../../lib/utils.js";

let chartInstance = null;
let _last = null;   // { items, techName } para re-render al cambiar de tema/filtro

// Filtros de la vista. Viven aquí porque son del gráfico, no del reporte: el
// supervisor acota lo que MIRA sin recargar ni volver a consultar la base.
const F = { rol: "TODOS", modelo: "TODOS", escala: "LOG", visible: false };

const ROLES_CONV = ["MOTOR", "TANQUE", "TANQUERO", "TECNICO", "CONVERSION"];
const esDelantero_ = (r) => ["MOTOR", "TECNICO", "CONVERSION"].includes(r);
const esTanquero_  = (r) => ["TANQUE", "TANQUERO"].includes(r);

// Cada peldaño del eje log es el DOBLE del anterior. Con 2 el objetivo de 3 h
// da 45 min · 1 h30 · 3 h · 6 h · 12 h: números que el supervisor ya usa al
// hablar ("el doble del objetivo"). Con 10 el eje tendría tres marcas y con
// √2 sería ilegible.
const PASO_LOG = 2;

// Los ticks se generan más allá de los datos y luego se recortan; este tope
// evita que un dato absurdo (un tiempo de milisegundos) genere miles de vueltas.
const MAX_PELDANOS_LOG = 24;

/** Horas → texto corto: "20 s", "45 min", "3.5 h", "14 h". */
function fmtHoras_(h) {
  if (!Number.isFinite(h) || h <= 0) return "";
  // Los peldaños de abajo del eje log pueden bajar del minuto; sin este caso
  // todos se rotularían "0 min" y el eje quedaría con marcas repetidas.
  if (h < 1 / 60) return `${Math.max(1, Math.round(h * 3600))} s`;
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 10) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round(h)} h`;
}

/**
 * ticksLog_ — marcas del eje ancladas en el objetivo, no en potencias de 10.
 * Devuelve objetivoH · PASO_LOG^k, el peldaño justo por debajo del mínimo y el
 * justo por encima del máximo: los datos quedan dentro sin desperdiciar eje.
 */
function ticksLog_(minH, maxH, objetivoH) {
  const lp  = Math.log(PASO_LOG);
  const lo  = Math.max(Math.min(minH, maxH), Number.MIN_VALUE);
  const hi  = Math.max(maxH, lo);
  let kMin  = Math.floor(Math.log(lo / objetivoH) / lp);
  let kMax  = Math.ceil(Math.log(hi / objetivoH) / lp);
  // Todos los carros en el mismo peldaño (o uno solo) daría min === max y el
  // eje se queda sin altura: se abre un peldaño a cada lado.
  if (kMax - kMin < 1) { kMin -= 1; kMax += 1; }
  // Un tiempo absurdo por abajo (una OT cerrada en milisegundos) pediría cien
  // peldaños. Se recorta por ABAJO, nunca por arriba: perder el techo dejaría
  // los outliers lentos —el motivo de mirar el gráfico— fuera del eje.
  kMin = Math.max(kMin, kMax - MAX_PELDANOS_LOG + 1);

  const out = [];
  for (let k = kMin; k <= kMax && out.length < MAX_PELDANOS_LOG; k++) {
    out.push(objetivoH * Math.pow(PASO_LOG, k));
  }
  return out;
}

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
      // El backend ya manda el canónico, pero se vuelve a normalizar aquí: es
      // idempotente ("Jetour X70" entra y sale igual) y evita que un servidor
      // aún sin desplegar —o una respuesta cacheada— reviente el selector en
      // seis "Jetour" que son el mismo carro.
      modelo: normalizeModelo_(it?.modelo) || String(it?.modelo || "").trim() || "Sin modelo",
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
      <select id="supTrendEscala" class="small" style="padding:7px 10px; border-radius:8px;">
        ${opt("LOG", "Detalle cerca del objetivo", F.escala)}
        ${opt("LINEAL", "Horas a escala real", F.escala)}
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
  onFiltro("#supTrendEscala", "escala");
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

  const esLog = F.escala === "LOG";
  const ys    = pts.map(p => p.y);
  const marcas = ticksLog_(Math.min(...ys), Math.max(...ys), objetivoH);
  // En log el cero no existe: un valor de la recta que caiga en negativo (la
  // extrapolación de Theil–Sen puede hacerlo con pocos puntos) se deja sin
  // dibujar en vez de romper el eje entero.
  const paraEje_ = (v) => (esLog && !(v > 0) ? null : v);

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
          data: tendencia.map(paraEje_),
          spanGaps: true,
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
        y: esLog ? {
          ...base.scales.y,
          type: "logarithmic",
          // Los extremos son el primer y el último peldaño: así el eje empieza
          // y termina en una marca rotulada y nadie queda pegado al borde.
          min: marcas[0],
          max: marcas[marcas.length - 1],
          // Chart.js rellena el eje log con sus propias marcas (1, 2, 5, 10…),
          // que no dicen nada aquí. Se reemplazan por las del objetivo.
          afterBuildTicks: (eje) => { eje.ticks = marcas.map(value => ({ value })); },
          ticks: {
            ...base.scales.y.ticks,
            autoSkip: false,
            callback: (v) => fmtHoras_(v),
          },
        } : {
          ...base.scales.y,
          // En lineal arranca en cero a propósito: un eje recortado exagera la
          // pendiente, y este gráfico se usa para decidir si alguien mejora.
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
    // Advertir la escala es parte del dato: en log la nube parece más apretada
    // de lo que es y la recta se dibuja curvada. Callarlo sería engañar.
    const nota = esLog
      ? ` · <span style="opacity:.75;">Eje en pasos de ×${PASO_LOG} sobre el objetivo (${fmtHoras_(objetivoH)}): acerca los extremos para ver el detalle de la zona del objetivo.</span>`
      : "";
    lecturaEl.innerHTML = `📈 <b>${lectura.texto}</b>${aviso}${nota}`;
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
