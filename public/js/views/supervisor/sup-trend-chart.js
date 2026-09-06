// =========================
// public/js/views/supervisor/sup-trend-chart.js
// Tendencia de los tiempos de conversión: mediana diaria + dispersión + objetivo.
//
// QUÉ CONTESTA: "¿estamos mejorando?". El promedio del mes no lo dice —sube y
// baja con el mix de carros— y la lista de tiempos tampoco: son cien números
// sueltos.
//
// SE REGRESA SOBRE LA MEDIANA DIARIA, NO SOBRE EL CARRO SUELTO
// La versión anterior ajustaba la recta a los 7.505 carros crudos y contra el
// ÍNDICE del carro en la lista. Dos problemas. Uno: la pendiente salía en
// "horas por carro-en-la-lista", y como el volumen diario va de 30 a 93 carros
// ese número no se traduce a nada que se pueda decir en voz alta. Dos: una
// recta sobre 185 días no puede mostrar CUÁNDO cambió algo, y este taller no va
// a la deriva constante, cambia a saltos (gente nueva, modelo nuevo).
// Ahora se agrupa por jornada, se toma la MEDIANA del día y se regresa contra
// la fecha real. La mediana es inmune por construcción a los 199 carros sin
// cerrar: no hay que decidir qué borrar. La pendiente sale en minutos por
// semana, y la serie diaria (2,61 · 2,74 · 2,73 · 2,55 …) se lee de un vistazo.
//
// LA RECTA ES THEIL–SEN Y SOLO HABLA SI MANN–KENDALL LA DEJA
// Theil–Sen toma la mediana de las pendientes entre pares: aguanta ~29% de
// basura sin moverse. Pero SIEMPRE devuelve una pendiente, también sobre ruido
// puro, y la lectura anunciaba "vas mejorando" por un número que era azar.
// Mann–Kendall contrasta el desbalance de pares subida/bajada contra el que
// daría el azar; si no hay significancia, la lectura lo dice y se calla el
// resto. Ver lib/regresion.js.
//
// EL EJE NO LO FIJAN LOS EXTREMOS, LOS FIJA UN PERCENTIL
// El taller tiene registros de 7 SEGUNDOS y de 947 HORAS: un factor de 470.000.
// No son mediciones —son OTs abiertas y cerradas por error, y OTs que nadie
// cerró—, y ninguna escala arregla eso, tampoco la logarítmica: con peldaños de
// ×2 harían falta 19 para cubrir ese rango, y la banda donde vive el 40% de los
// carros (2 h–3 h) ocuparía menos de uno. El eje se recorta con percentiles del
// subconjunto FILTRADO (dinámico: cambia con el rol y el modelo que se estén
// mirando) y anclado al objetivo, para que la línea de meta nunca quede fuera.
//
// LOS OUTLIERS SE APOYAN EN EL RIEL, NO SE BORRAN
// Lo que cae fuera de la banda se clava en el borde como triángulo y se cuenta
// en la leyenda. Borrarlos escondería datos: el supervisor no vería que existen
// y son justo la señal de que hay que enseñarle a alguien a cerrar su OT. Se
// les quita el eje, no la existencia.
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
import { theilSen_, lecturaTendencia_, mannKendall_, percentil_, mediana_ } from "../../../../lib/regresion.js";
import { normalizeModelo_ } from "../../../../lib/utils.js";

let chartInstance = null;
let _last = null;   // { items, techName } para re-render al cambiar de tema/filtro

// Filtros de la vista. Viven aquí porque son del gráfico, no del reporte: el
// supervisor acota lo que MIRA sin recargar ni volver a consultar la base.
const F = { rol: "TODOS", modelo: "TODOS", visible: false };

const ROLES_CONV = ["MOTOR", "TANQUE", "TANQUERO", "TECNICO", "CONVERSION"];
const esDelantero_ = (r) => ["MOTOR", "TECNICO", "CONVERSION"].includes(r);
const esTanquero_  = (r) => ["TANQUE", "TANQUERO"].includes(r);

// ─── Constantes de la vista ──────────────────────────────────────────────────

// Percentiles que fijan la banda visible. El problema está ARRIBA —el 2,7% de
// carros sobre 12 h que nadie cerró— y por eso el techo recorta al p95 (6,5 h
// con los datos de hoy). El suelo es mucho más tímido a propósito: un carro
// hecho en 1 h es trabajo rápido de verdad, no un registro roto, y mandarlo al
// riel sería llamar error a lo que hay que copiar. Abajo solo se recorta el
// p1, donde viven los tiempos físicamente imposibles.
const PCT_TECHO = 95;
const PCT_SUELO = 1;

// El eje nunca se cierra más que esto alrededor del objetivo, pase lo que pase
// con el percentil: si un filtro deja solo carros de 2,9 h a 3,1 h, un eje
// pegado a los datos convertiría medio minuto de diferencia en media pantalla.
const TECHO_MIN_x_OBJETIVO = 1.5;
const SUELO_MAX_x_OBJETIVO = 0.25;

// Por encima de esto un tiempo deja de ser trabajo lento y pasa a ser, casi
// seguro, una OT que nadie cerró. Solo colorea y cuenta; no borra nada.
const SOSPECHOSO_x_OBJETIVO = 2;

// Días mínimos con datos para dibujar la serie diaria. Por debajo no hay
// jornada que comparar con jornada y se cae a la nube de carros sueltos.
const MIN_DIAS_SERIE = 3;

// Un día con dos carros da una "mediana diaria" que es un carro suelto con
// nombre de estadístico. Por debajo de esto el día se dibuja, pero no vota en
// la tendencia.
const MIN_CARROS_POR_DIA = 5;

const DIAS_POR_SEMANA = 7;
const TZ_PERU = "America/Lima";

// ─── Utilidades ──────────────────────────────────────────────────────────────

const fmtDiaPeru_ = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_PERU, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Jornada peruana de una fecha, "YYYY-MM-DD". A las 21:00 de Lima ya es otro día en UTC. */
const diaPeru_ = (d) => fmtDiaPeru_.format(d);

/** "2026-09-05" → "05/09" */
const fmtDiaCorto_ = (clave) => `${clave.slice(8, 10)}/${clave.slice(5, 7)}`;

/** Clave "YYYY-MM-DD" a N días de otra. Inversa de diasEntre_. */
function diaMasOffset_(clave, off) {
  const [a, m, d] = clave.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + Math.round(off))).toISOString().slice(0, 10);
}

/** Horas → texto corto: "20 s", "45 min", "3.5 h", "14 h". */
function fmtHoras_(h) {
  if (!Number.isFinite(h) || h <= 0) return "";
  if (h < 1 / 60) return `${Math.max(1, Math.round(h * 3600))} s`;
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 10) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round(h)} h`;
}

/**
 * Diferencia en días CIVILES entre dos claves "YYYY-MM-DD".
 * Se arma con Date.UTC para que ni el horario de verano de la máquina del
 * supervisor ni su zona horaria puedan mover el resultado un día.
 */
function diasEntre_(claveA, claveB) {
  const utc = (clave) => {
    const [a, m, d] = clave.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(claveB) - utc(claveA)) / 86400000);
}

window.addEventListener("glp:themechange", () => {
  if (_last && F.visible) pintar_();
});

export function destroyTrendChart_() {
  try { chartInstance?.destroy(); } catch { /* ya destruido */ }
  chartInstance = null;
}

// ─── Datos ───────────────────────────────────────────────────────────────────

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
      dia: diaPeru_(d),
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

/**
 * resumenDiario_ — una fila por jornada con mediana y cuartiles.
 *
 * Los cuartiles no son adorno: mediana 2,8 h con p75 en 3,5 h es un taller, y
 * mediana 2,8 h con p75 en 6 h es otro muy distinto. El promedio no los
 * distingue y es justo la diferencia sobre la que se puede actuar.
 */
function resumenDiario_(pts) {
  const porDia = new Map();
  for (const p of pts) {
    if (!porDia.has(p.dia)) porDia.set(p.dia, []);
    porDia.get(p.dia).push(p.y);
  }
  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dia, ys]) => ({
      dia,
      n: ys.length,
      mediana: mediana_(ys),
      p25: percentil_(ys, 25),
      p75: percentil_(ys, 75),
      // Un día de dos carros no es una jornada medida: se dibuja, pero no vota.
      fiable: ys.length >= MIN_CARROS_POR_DIA,
    }));
}

/**
 * bandaVisible_ — límites del eje a partir del subconjunto filtrado.
 *
 * Dinámica (cambia con el rol y el modelo elegidos) pero siempre con el
 * objetivo holgadamente dentro: un eje que se coma la línea de meta no sirve
 * para lo único que se le pide a este gráfico.
 */
function bandaVisible_(ys, objetivoH) {
  const techoPct = percentil_(ys, PCT_TECHO);
  const sueloPct = percentil_(ys, PCT_SUELO);
  const techo = Math.max(Number.isFinite(techoPct) ? techoPct : 0, objetivoH * TECHO_MIN_x_OBJETIVO);
  const suelo = Math.max(0, Math.min(Number.isFinite(sueloPct) ? sueloPct : 0, objetivoH * SUELO_MAX_x_OBJETIVO));
  return { suelo, techo };
}

// ─── Controles ───────────────────────────────────────────────────────────────

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

// ─── Pintado ─────────────────────────────────────────────────────────────────

function pintar_() {
  destroyTrendChart_();
  if (!_last) return;

  const canvasEl  = document.getElementById("supTrendChart");
  const wrap      = document.getElementById("supTrendCanvasWrap");
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

  const dias = resumenDiario_(pts);
  if (dias.length < MIN_DIAS_SERIE) {
    if (lecturaEl) {
      lecturaEl.innerHTML = `Con estos filtros hay ${dias.length} jornada(s) cerrada(s). ` +
        `Hacen falta ${MIN_DIAS_SERIE} para comparar día contra día.`;
    }
    wrap.style.display = "none";
    return;
  }

  const objetivoMin  = Math.max(1, Number(cfg("TARGET_CONVERSION_MIN")) || 180);
  const objetivoH    = objetivoMin / 60;
  const sospechosoH  = objetivoH * SOSPECHOSO_x_OBJETIVO;

  const { suelo, techo } = bandaVisible_(pts.map(p => p.y), objetivoH);
  const dentro_ = (v) => v >= suelo && v <= techo;
  const aRiel_  = (v) => Math.min(techo, Math.max(suelo, v));

  // ── Tendencia: Theil–Sen sobre las medianas diarias FIABLES, contra la
  // FECHA real, no contra la posición del día en la lista. Un lunes después de
  // un feriado largo quedaría pegado al viernes y la pendiente saldría inflada.
  // Por eso el eje X también es lineal en días y no una lista de categorías —
  // que además Chart.js resolvería mal: sobre una escala de categorías ignora
  // las x numéricas y las sustituye por la posición en el array, lo que dejaría
  // cada carro de la nube en un día que no es el suyo.
  const base0 = dias[0].dia;
  dias.forEach(d => { d.x = diasEntre_(base0, d.dia); });

  const fiables  = dias.filter(d => d.fiable && Number.isFinite(d.mediana));
  const modelo   = theilSen_(fiables.map(d => ({ x: d.x, y: d.mediana })));
  const mk       = mannKendall_(fiables.map(d => d.mediana));
  const xUltimo  = dias[dias.length - 1].x;
  const lectura  = lecturaTendencia_(modelo, objetivoH, xUltimo, 30, mk);
  const recta    = modelo.ok
    ? dias.map(d => ({ x: d.x, y: modelo.intercepto + modelo.pendiente * d.x }))
    : [];

  const c    = readVizColors();
  const b    = chartBaseOptions(c);
  const acc  = c.accent2;
  const malo = c.bad || "#d03b3b";

  // La nube cruda va como textura de fondo: un carro por punto, en su jornada.
  // Deja ver la dispersión real y de dónde sale cada mediana, sin competir con
  // la serie diaria, que es lo que se lee.
  const idxDia = new Map(dias.map((d, i) => [d.dia, i]));
  const nube = [], rielAlto = [], rielBajo = [];
  for (const p of pts) {
    const d = dias[idxDia.get(p.dia) ?? -1];
    if (!d) continue;
    const destino = dentro_(p.y) ? nube : (p.y > techo ? rielAlto : rielBajo);
    destino.push({ x: d.x, y: aRiel_(p.y), _p: p });
  }

  const ds = [];

  // Banda p25–p75: se dibuja primero para que quede DEBAJO de todo. Es
  // contexto, no dato que se señale con el dedo.
  ds.push({
    label: "p25 diario", data: dias.map(d => ({ x: d.x, y: aRiel_(d.p25) })),
    borderColor: "transparent", pointRadius: 0, fill: false, tension: .3, order: 40,
  });
  ds.push({
    label: "Mitad central de los carros (p25–p75)", data: dias.map(d => ({ x: d.x, y: aRiel_(d.p75) })),
    borderColor: "transparent", backgroundColor: hexA(acc, .14),
    pointRadius: 0, fill: "-1", tension: .3, order: 39,
  });

  ds.push({
    label: `Objetivo ${Math.round(objetivoMin)} min`,
    data: dias.map(d => ({ x: d.x, y: objetivoH })),
    borderColor: c.warn || "#facc15",
    borderWidth: 2, borderDash: [6, 5], pointRadius: 0, fill: false, tension: 0, order: 30,
  });

  if (recta.length) {
    ds.push({
      label: mk.significativa ? "Tendencia" : "Tendencia (no significativa)",
      data: recta.map(r => ({ x: r.x, y: dentro_(r.y) ? r.y : null })),
      borderColor: mk.significativa ? (c.good || "#0ca30c") : hexA(c.ink2, .5),
      borderWidth: 3, borderDash: mk.significativa ? [] : [4, 4],
      pointRadius: 0, fill: false, tension: 0, spanGaps: true, order: 20,
    });
  }

  ds.push({
    label: "Carros (uno por punto)",
    data: nube,
    showLine: false, pointRadius: 2, pointHoverRadius: 5,
    pointBackgroundColor: hexA(acc, .22), pointBorderWidth: 0, order: 15,
  });

  ds.push({
    label: "Mediana del día",
    data: dias.map(d => ({ x: d.x, y: aRiel_(d.mediana) })),
    borderColor: acc, borderWidth: 3, tension: .25, fill: false,
    pointRadius: dias.map(d => (d.fiable ? 3.5 : 2)),
    pointHoverRadius: 7,
    pointBackgroundColor: dias.map(d => (d.mediana > sospechosoH ? malo : acc)),
    pointBorderColor: hexA(c.surface, 1), pointBorderWidth: 1,
    order: 10,
  });

  // Rieles: lo que no cabe en la banda se apoya en el borde como triángulo.
  const riel_ = (etiqueta, datos, rot) => ({
    label: etiqueta, data: datos,
    showLine: false, pointStyle: "triangle", rotation: rot,
    pointRadius: 6, pointHoverRadius: 9,
    pointBackgroundColor: hexA(malo, .85), pointBorderColor: hexA(c.surface, 1), pointBorderWidth: 1,
    order: 5,
  });
  if (rielAlto.length) ds.push(riel_(`Sobre ${fmtHoras_(techo)} (${rielAlto.length})`, rielAlto, 0));
  if (rielBajo.length) ds.push(riel_(`Bajo ${fmtHoras_(suelo)} (${rielBajo.length})`, rielBajo, 180));

  chartInstance = new Chart(canvasEl.getContext("2d"), {
    type: "line",
    data: { datasets: ds },
    options: {
      ...b,
      plugins: {
        ...b.plugins,
        title: { display: false },
        legend: {
          display: true,
          labels: {
            color: c.ink2, boxWidth: 12, font: { size: 10 },
            // "p25 diario" solo existe para que la banda tenga contra qué
            // rellenar; enseñarlo en la leyenda sería ruido.
            filter: (item) => item.text !== "p25 diario",
          },
        },
        tooltip: {
          ...b.plugins.tooltip,
          callbacks: {
            title: (ctx) => {
              // La nube y los rieles llevan un punto por CARRO: su dataIndex no
              // es el del día. El día se saca del propio carro.
              const p = ctx?.[0]?.raw?._p;
              const d = p ? dias[idxDia.get(p.dia)] : dias[ctx?.[0]?.dataIndex];
              return d ? `${fmtDiaCorto_(d.dia)} · ${d.n} carro(s)` : "";
            },
            label: (ctx) => {
              const p = ctx.raw?._p;
              if (p) {
                const sosp = p.y > sospechosoH ? "  ⚠ probable OT sin cerrar" : "";
                return [
                  `${fmtHoras_(p.y)}${sosp}`,
                  `VIN: ${p.vin}`,
                  `Modelo: ${p.modelo}`,
                  p.tecnico ? `Técnico: ${p.tecnico}` : "",
                ].filter(Boolean);
              }
              const et = String(ctx.dataset?.label || "");
              if (et === "Mediana del día") {
                const d = dias[ctx.dataIndex];
                const flojo = d && !d.fiable ? "  (pocos carros: no vota en la tendencia)" : "";
                return `Mediana: ${fmtHoras_(d?.mediana)}${flojo}`;
              }
              if (et.startsWith("Mitad central")) {
                const d = dias[ctx.dataIndex];
                return `Mitad central: ${fmtHoras_(d?.p25)} – ${fmtHoras_(d?.p75)}`;
              }
              return `${et}: ${fmtHoras_(Number(ctx.parsed?.y ?? 0))}`;
            },
          },
        },
      },
      scales: {
        ...b.scales,
        x: {
          ...b.scales.x,
          type: "linear",
          min: 0,
          max: xUltimo,
          ticks: {
            ...b.scales.x.ticks,
            maxRotation: 0, autoSkip: true, maxTicksLimit: 8,
            // El valor del eje son días desde la primera jornada; al supervisor
            // se le enseña la fecha, no el número de días.
            callback: (v) => fmtDiaCorto_(diaMasOffset_(base0, v)),
          },
        },
        y: {
          ...b.scales.y,
          // Los límites NO salen de min/max: salen de percentiles del
          // subconjunto filtrado, con el objetivo siempre dentro.
          min: suelo,
          max: techo,
          ticks: { ...b.scales.y.ticks, callback: (v) => fmtHoras_(v) },
        },
      },
    },
  });

  if (lecturaEl) lecturaEl.innerHTML = textoLectura_(lectura, modelo, mk, dias, rielAlto, rielBajo, suelo, techo, sospechosoH);
}

/** La frase de abajo: qué dice la tendencia, con cuánta confianza, y qué quedó fuera del eje. */
function textoLectura_(lectura, modelo, mk, dias, rielAlto, rielBajo, suelo, techo, sospechosoH) {
  const partes = [`📈 <b>${lectura.texto}</b>`];

  // La pendiente en minutos por SEMANA: en minutos por día sale "-0,6 min" y
  // no significa nada para nadie.
  if (modelo.ok && mk.ok && mk.significativa) {
    const minSemana = modelo.pendiente * 60 * DIAS_POR_SEMANA;
    const signo = minSemana < 0 ? "−" : "+";
    partes.push(`${signo}${Math.abs(minSemana).toFixed(0)} min por semana ` +
      `<span style="opacity:.7;">(${dias.length} jornadas, p=${mk.p.toFixed(3)})</span>`);
  } else if (mk.ok) {
    partes.push(`<span style="opacity:.7;">${dias.length} jornadas · p=${mk.p.toFixed(2)}: ` +
      `el sube y baja no se distingue del azar</span>`);
  }

  const lentos = dias.filter(d => d.mediana > sospechosoH).length;
  if (lentos) {
    partes.push(`<span style="color:var(--danger,#f87171);">${lentos} jornada(s) con mediana sobre ` +
      `${fmtHoras_(sospechosoH)}</span>`);
  }

  const fuera = [];
  if (rielAlto.length) fuera.push(`${rielAlto.length} sobre ${fmtHoras_(techo)} (probable OT sin cerrar)`);
  if (rielBajo.length) fuera.push(`${rielBajo.length} bajo ${fmtHoras_(suelo)} (probable OT cerrada por error)`);
  if (fuera.length) {
    partes.push(`<span style="opacity:.75;">Fuera del eje, apoyados en el borde: ${fuera.join(" · ")}. ` +
      `Se cuentan, pero no estiran la escala ni mueven la mediana.</span>`);
  }

  return partes.join(" · ");
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
