// =========================
// public/js/views/supervisor/sup-live.js
// Tablero LIVE del supervisor — la jornada del taller en una sola pantalla.
//
// QUÉ ES
// ------
// Un tablero al modo Power BI: una barra de mando arriba (qué jornada se está
// mirando), una fila de segmentadores, una fila de KPIs y una rejilla de
// visuales que se filtran entre sí. Antes era una pila de bloques: cada uno
// contestaba bien su pregunta, pero no se podían cruzar — no había forma de
// decir "esto, pero solo del tanquero" o "esto, pero solo la franja de noche".
//
// Alcance de datos (lo define el backend, ver routes/supervisor.js):
//   · carros CERRADOS en la jornada  → cuentan 1 c/u (ya no hay medios carros)
//   · trabajos ABIERTOS               → "en curso"
//   · trabajos de días previos        → NO suman; solo indican en qué está
//     parado alguien que hoy no abrió nada (se marcan "ayer"). En una jornada
//     pasada no viajan: lo que alguien tenga abierto esta tarde no dice nada
//     de lo que hizo el martes.
//
// EL FILTRO DE FECHA
// ------------------
// El LIVE solo sabía mirar la jornada en curso, y la pregunta que más se hacía
// en el taller era "¿cómo nos fue ayer a esta misma hora?". La fecha viaja al
// endpoint (`?fecha=`) y con ella el panel pasa a modo histórico: se apaga el
// polling, se apaga el latido y desaparece todo lo que es estado de AHORA
// (quién está dentro del taller, qué arrastra abierto). Lo que queda es la
// producción de ese día, que es un hecho cerrado.
//
// EL CRUCE DE FILTROS
// -------------------
// Hay dos naturalezas de dato y se filtran distinto, a propósito:
//   · por técnico   (mitades, matriz de cortes, cards, gráfico de puestos)
//     → responde a rol, estado y a la persona seleccionada
//   · por carro/VIN (convertidos, aprobados, ritmo, acumulado, carros a medias)
//     → es del taller y NO se puede repartir por persona: un carro lo cierran
//       dos. Esos visuales llevan dicho "del taller" en su subtítulo en vez de
//       fingir un filtro que mentiría.
// =========================

import { getJSON } from "../../core/api.js";
import {
  escapeHtml, fmtTiempo_, etiquetaTrabajo_,
  hhmmAMin_, minutosPE_, bloquesJornada_, indiceBloque_,
} from "../../core/format.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { rolMeta, estadoMeta, grupoDeRol_ } from "../../core/domain-meta.js";
import { cfg } from "../../core/config.js";
import { relTimeText, startRelTimeTicker, countUp, skeletonHTML } from "../../core/ui-dynamics.js";
import { openDrilldown, closeDrilldown } from "../../core/drilldown.js";
import { clasificarDuplas_, cumplioMeta_, ROLES_DUPLA } from "./sup-duplas.js";
import { CANVAS, montarLiveCharts_, destruirLiveCharts_ } from "./sup-live-charts.js";

let liveActive_   = false;
let liveLastData_ = null;   // último fetch, para re-abrir detalle actualizado


// ── Segmentadores ─────────────────────────────────────────────────────
// Todos sobreviven al polling: un re-render no puede deshacer lo que el
// supervisor acaba de elegir.
let estadoFilter_ = null;   // "TRABAJANDO"|"PAUSADO"|"SIN_INICIAR"|"STALLED"|"META_OK"|null
let rolFilter_    = null;   // "MOTOR"|"TANQUE"|"CALIDAD"|"RAMALERO"|null
let franjaFilter_ = null;   // índice de franja de la jornada
let techFilter_   = null;   // "userId__rol" de la persona seleccionada
let fechaSel_     = null;   // null = jornada en curso; "YYYY-MM-DD" = día cerrado
let esHoy_        = true;   // lo confirma el backend en cada respuesta
let cargando_     = false;  // hay un fetch en vuelo (lo pinta la barra de mando)

// Orden de la matriz: por nombre, por total o por una franja concreta.
let orden_ = { col: "total", dir: "desc" };

let focoTile_   = null;     // visual maximizado (el "modo foco" de Power BI)
let vistaGrafico_ = "jornada"; // pestaña del panel de gráficos
let _prevKpi    = { conv: null, cal: null }; // para animar los números al cambiar

const ORDEN_ROLES = ["MOTOR", "TANQUE", "CALIDAD", "RAMALERO"];

// Umbrales de "sin movimiento" (ms)
const STALL_PAUSADO_MS = 40 * 60_000;
const STALL_SIN_INI_MS = 60 * 60_000;

// ── API ───────────────────────────────────────────────────────────────
async function fetchLive_() {
  const q = fechaSel_ ? `?fecha=${encodeURIComponent(fechaSel_)}` : "";
  return getJSON(`/api/supervisor/live${q}`).catch(() => null);
}

// ── La jornada, en minutos ───────────────────────────────────────────────
//
// El taller trabaja de 05:00 a 01:00: su jornada CRUZA la medianoche. Todo lo
// de aquí abajo existe para poder decir "van 12 y a esta hora deberían ir 17".
// Sin esa referencia, un 48 % a las 07:00 y un 48 % a las 22:00 se leen igual
// y el panel no dice nada sobre lo que hay que hacer.

const TZ_PE = "America/Lima";

// hhmmAMin_, minutosPE_, bloquesJornada_ e indiceBloque_ viven en core/format.js:
// son aritmética pura sobre el reloj del taller y así se pueden probar sin DOM.

function horaPE_() { return Math.floor(minutosPE_() / 60); }

function inicioJornadaMin_() { return hhmmAMin_(cfg("LIVE_JORNADA_INICIO")) ?? 300; }

/** Las horas que componen la jornada, en orden: [5,6,…,23,0]. */
function horasJornada_() {
  const ini = inicioJornadaMin_();
  const fin = hhmmAMin_(cfg("LIVE_JORNADA_FIN")) ?? 60;
  const h0  = Math.floor(ini / 60);
  const total = (((Math.floor(fin / 60) - h0) % 24) + 24) % 24 || 24;
  return Array.from({ length: total }, (_, i) => (h0 + i) % 24);
}

/**
 * Qué fracción de la jornada va consumida (0…1).
 *
 * Fuera de la ventana devuelve 1: si ya son las 03:00 la jornada terminó, y el
 * objetivo del día era el objetivo entero, no una parte de él. En una jornada
 * pasada es 1 por definición — ese día ya se acabó.
 */
function fracJornada_() {
  if (!esHoy_) return 1;
  const ini = inicioJornadaMin_();
  let   fin = hhmmAMin_(cfg("LIVE_JORNADA_FIN")) ?? 60;
  if (fin <= ini) fin += 1440;          // la jornada cruza la medianoche
  let ahora = minutosPE_();
  if (ahora < ini) ahora += 1440;       // estamos en la cola de la jornada de ayer
  return Math.max(0, Math.min(1, (ahora - ini) / (fin - ini)));
}

/**
 * La jornada en curso, en hora Perú: la fecha a la que pertenece AHORA.
 *
 * No es la fecha civil. A la 01:00 del día 30 el taller sigue en la jornada del
 * 29, y es la del 29 la que tiene que salir marcada como "HOY" en el selector.
 */
function jornadaHoyPE_() {
  return diaPE_(new Date(Date.now() - inicioJornadaMin_() * 60_000));
}

/** "2026-09-28" + n días. Date.UTC normaliza mes, año y bisiestos. */
function masDias_(ymd, n) {
  const [a, m, d] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

// ── Helpers de dominio ────────────────────────────────────────────────
function carsOf_(t)    { return Number(t.carsHoy ?? t.finalizadosHoy ?? 0) || 0; }
function enCursoOf_(t) { return Number(t.virtualHoy ?? t.activosHoy ?? 0) || 0; }

/** Trabajo abierto más reciente + cuánto lleva sin cambiar de estado. */
function stallInfo_(t) {
  // En una jornada cerrada no hay nada "sin movimiento": el movimiento se mide
  // contra el reloj de ahora, y ese reloj no aplica a un día que ya pasó.
  if (!esHoy_) return null;
  if (t.estadoActivo !== "PAUSADO" && t.estadoActivo !== "SIN_INICIAR") return null;
  const abierto = (t.asignacionesHoy || [])
    .filter(a => a.estado !== "FINALIZADO")
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
  if (!abierto?.updated_at) return null;
  const ms    = Date.now() - new Date(abierto.updated_at).getTime();
  const limit = t.estadoActivo === "PAUSADO" ? STALL_PAUSADO_MS : STALL_SIN_INI_MS;
  return ms > limit ? { ms, mins: Math.floor(ms / 60_000) } : null;
}

const keyTech_ = (t) => `${t.userId}__${t.rol}`;
const esTecConversion_ = (t) => grupoDeRol_(t.rol)?.id === "CONVERSION";

/** ¿La persona pasa los segmentadores activos? */
function pasaFiltros_(t, metaTec) {
  if (techFilter_ && keyTech_(t) !== techFilter_) return false;
  if (rolFilter_ && String(t.rol || "").toUpperCase() !== rolFilter_) return false;
  if (!estadoFilter_) return true;
  if (estadoFilter_ === "STALLED") return !!stallInfo_(t);
  if (estadoFilter_ === "META_OK") return cumplioMeta_(t, metaTec);
  return t.estadoActivo === estadoFilter_;
}

function hayFiltros_() {
  return !!(estadoFilter_ || rolFilter_ || techFilter_ || franjaFilter_ != null);
}

function limpiarFiltros_() {
  estadoFilter_ = null;
  rolFilter_    = null;
  techFilter_   = null;
  franjaFilter_ = null;
}

// Etiquetas cortas de estado para la card (el label completo queda en el modal)
const ESTADO_CORTO = {
  TRABAJANDO:    "EN CURSO",
  PAUSADO:       "PAUSA",
  SIN_INICIAR:   "SIN INI.",
  FINALIZADO:    "CERRÓ",
  SIN_ACTIVIDAD: "—",
  DESCONECTADO:  "—",
};

/** "2026-09" → "setiembre" (el mes en palabras; "2026-09" no es un mes, es una clave). */
function nombreMes_(ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return String(ym || "");
  return new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" })
    .format(new Date(`${ym}-01T00:00:00Z`));
}

/** "2026-08-05" → "05/08" */

function fmtFechaCorta_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  return m ? `${m[3]}/${m[2]}` : String(ymd || "");
}

/** "2026-08-05" → "Miércoles 5 de agosto" (solo la inicial en mayúscula). */
function fmtFechaLarga_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return String(ymd || "");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const txt = new Intl.DateTimeFormat("es-PE", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(d);
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}


// ── Render principal ──────────────────────────────────────────────────
function renderLive_(container, data) {
  if (!container) return;
  if (!data?.ok) {
    container.innerHTML = `
      ${cmdHTML_(data || {})}
      <div class="lvEmpty">⚠️ ${escapeHtml(data?.error || "Error cargando datos.")}</div>`;
    bindCmd_(container);
    return;
  }

  // El backend manda qué jornada armó: con él se decide si esto es un panel en
  // vivo o la foto de un día cerrado, y de ahí cuelga medio comportamiento.
  esHoy_ = data.esHoy !== false;

  const techs = Array.isArray(data.techs) ? data.techs : [];
  if (!techs.length) {
    container.innerHTML = `
      ${cmdHTML_(data)}
      <div class="lvEmpty">Sin actividad registrada ${esHoy_ ? "hoy" : `el ${escapeHtml(fmtFechaCorta_(data.fecha))}`}.</div>`;
    bindCmd_(container);
    return;
  }

  const metaTec = Number(cfg("META_CARROS_TEC")) || 2;
  const duplas  = clasificarDuplas_(techs, metaTec);
  const modelo  = construirModelo_(data, techs);


  const nowIso  = new Date().toISOString();

  container.innerHTML = `
  <div class="lvDash">
    ${cmdHTML_(data, nowIso)}
    ${slicersHTML_(techs, duplas, metaTec, modelo)}
    ${kpisHTML_(data, techs, modelo)}
    <div class="lvDash__grid${focoTile_ ? " is-foco" : ""}">

      <!-- ── Las cifras. Primero, y por delante de cualquier gráfico. ── -->
      ${modelo.nb ? tileHTML_({
        id: "resumen", titulo: "El día en cifras",
        sub: `conversiones y producción, corte a corte${filtroNota_()}`,
        span: 2, body: resumenHTML_(modelo),
      }) : ""}
      ${modelo.nb && modelo.filas.length ? tileHTML_({
        id: "cortes", titulo: "Producción por técnico",
        sub: `quién cerró qué y en qué corte${filtroNota_()}`,
        span: 2, body: cortesTablasHTML_(modelo),
      }) : ""}
      <!-- Sin tiles de "esperando la otra mitad", duplas ni tarjetas de
           técnicos: repetían lo que ya dicen los KPIs y la tabla. Viven en
           los popups de sus chips y KPIs (abrirEstado_, abrirDrill_). -->

      <!-- ── Los gráficos. Complemento: enseñan la FORMA de lo de arriba (si
           el ritmo cae, si una mitad se queda atrás), no cifras nuevas. Por
           eso van al final y bajo su propio rótulo. ── -->
      <div class="lvDash__sep">
        <span>Gráficos</span>
        <em>la forma de las mismas cifras · ningún número nuevo</em>
      </div>
      ${graficoTileHTML_(data, modelo)}
    </div>
  </div>`;

  // Números de meta animados (count-up desde el valor anterior)
  const vsum = data.vinsSummary || {};
  countUp(container.querySelector("#liveKpiConv"), vsum.convDone || 0, { from: _prevKpi.conv });
  countUp(container.querySelector("#liveKpiCal"),  vsum.calDone  || 0, { from: _prevKpi.cal  });
  _prevKpi = { conv: vsum.convDone || 0, cal: vsum.calDone || 0 };

  montarLiveCharts_(modelo.series, { onFranja: (i) => toggleFranja_(i) });
  bindLive_(container, techs, metaTec, data);
}

/** Aviso de que un visual por técnico está recortado por los segmentadores. */
function filtroNota_() {
  const partes = [];
  if (techFilter_) partes.push("1 técnico");
  if (rolFilter_)  partes.push(rolMeta(rolFilter_).label.toLowerCase());
  if (estadoFilter_) partes.push("por estado");
  return partes.length ? ` · filtrado: ${partes.join(" · ")}` : "";
}

// ── 0. Barra de mando: qué jornada se mira y en qué modo ──────────────
//
// Es lo primero de la pantalla porque es lo primero que hay que saber: un 12/25
// no significa nada si no se sabe de qué día es. En vivo lleva latido y la
// frescura del dato; en histórico, la fecha en largo y ni una pista de tiempo
// real, que sería mentira.
function cmdHTML_(data, nowIso = new Date().toISOString()) {
  const hoy    = jornadaHoyPE_();
  const fecha  = data?.fecha || fechaSel_ || hoy;
  const enVivo = esHoy_ && !fechaSel_;
  const puedeAvanzar = !!fechaSel_ && fechaSel_ < hoy;

  return `
  <div class="lvCmd">
    <div class="lvCmd__title">
      <span class="lvCmd__icon" aria-hidden="true">${enVivo ? "📡" : "🗓"}</span>
      <span>
        <b>${escapeHtml(enVivo ? "Jornada en curso" : fmtFechaLarga_(fecha))}</b>
        <em>${escapeHtml(enVivo ? fmtFechaLarga_(fecha) : "jornada cerrada")}</em>
      </span>
    </div>

    <div class="lvCmd__dates" role="group" aria-label="Jornada que se está mirando">
      <button type="button" class="lvCmd__nav" data-dia="-1" title="Jornada anterior" aria-label="Jornada anterior">◀</button>
      <input type="date" id="lvFecha" class="lvCmd__date" value="${escapeHtml(fecha)}" max="${escapeHtml(hoy)}"
        title="Elegir jornada" aria-label="Elegir jornada" />
      <button type="button" class="lvCmd__nav" data-dia="1" title="Jornada siguiente" aria-label="Jornada siguiente"
        ${puedeAvanzar ? "" : "disabled"}>▶</button>
      <button type="button" class="lvCmd__hoy${enVivo ? " is-on" : ""}" data-dia="hoy"
        title="Volver a la jornada en curso" ${enVivo ? "disabled" : ""}>HOY</button>
    </div>

    <div class="lvCmd__status">
      ${enVivo
        ? `<span class="supModeBadge supModeBadge--live"><i class="supLiveDot"></i>EN VIVO</span>
           <span class="lvCmd__ago">Actualizado <span id="liveLastUpdate" data-reltime="${nowIso}">${relTimeText(nowIso)}</span></span>`
        : `<span class="supModeBadge supModeBadge--hist">🗄 HISTÓRICO</span>
           <span class="lvCmd__ago">Sin refresco automático</span>`}
      <button type="button" id="btnLiveRefresh" class="lvCmd__btn${cargando_ ? " is-busy" : ""}"
        title="Volver a leer los datos" aria-label="Actualizar">↻</button>
    </div>
  </div>`;
}

// ── 0b. Segmentadores: una fila, encima de todo lo que recortan ───────
function slicersHTML_(techs, duplas, metaTec, modelo) {
  const conteo = e => techs.filter(t => t.estadoActivo === e).length;
  const stalled = techs.filter(t => stallInfo_(t)).length;

  const estados = [
    { f: "TRABAJANDO",  n: conteo("TRABAJANDO"),  tone: "var(--ok)",    label: "activos" },
    { f: "PAUSADO",     n: conteo("PAUSADO"),     tone: "var(--warn)",  label: "pausados" },
    { f: "SIN_INICIAR", n: conteo("SIN_INICIAR"), tone: "var(--muted)", label: "sin iniciar" },
  ].filter(s => s.n > 0);

  // Leyenda de la barra: cada cifra abre a esas personas. Va sin marco ni
  // relleno de color porque informa; los controles con marco son los filtros.
  const item = (valor, tone, texto, title = "", on = false) => `
    <button type="button" class="lvTeam__item${on ? " is-on" : ""}" data-filtro="estado" data-valor="${valor}"
      style="--itemTone:${tone};"${title ? ` title="${escapeHtml(title)}"` : ""}${on ? ` aria-pressed="true"` : ""}>${texto}</button>`;

  const leyenda = estados.map(s => item(s.f, s.tone, `<i></i><b>${s.n}</b> ${s.label}`));
  // Los parados son un subconjunto de pausados y sin iniciar, no un estado más:
  // sin el title, 14 + 8 + 6 no cuadra con el total y parece un error.
  if (stalled > 0) leyenda.push(item("STALLED", "var(--dv-serious)", `⚠️ <b>${stalled}</b> parados`,
    `De los pausados y sin iniciar: ${stalled} llevan más de ${STALL_PAUSADO_MS / 60_000} min en pausa o ${STALL_SIN_INI_MS / 60_000} min sin iniciar`));
  if (duplas.totalMeta > 0) leyenda.push(item("META_OK", "var(--note)", `🤝 <b>${duplas.totalMeta}</b> en meta ${metaTec}`,
    "Filtra el tablero a quienes ya cumplieron la meta", estadoFilter_ === "META_OK"));

  const enTurno = techs.filter(t => ["TRABAJANDO", "PAUSADO", "SIN_INICIAR"].includes(t.estadoActivo)).length;
  const conActividad = techs.filter(t => t.estadoActivo !== "DESCONECTADO").length;

  // Control segmentado: "todos" quita el filtro (data-quitar), el resto lo pone.
  const seg = (tag, todos, opciones) => `
    <div class="lvSeg">
      <span class="lvSlice__tag">${tag}</span>
      <div class="lvSeg__group" role="group" aria-label="${tag}">
        <button type="button" class="lvSeg__btn${todos.on ? " is-on" : ""}" data-quitar="${todos.quitar}" aria-pressed="${todos.on}">${todos.label}</button>
        ${opciones.join("")}
      </div>
    </div>`;
  const segBtn = (tipo, valor, texto, on, title = "") => `
    <button type="button" class="lvSeg__btn${on ? " is-on" : ""}" data-filtro="${tipo}" data-valor="${escapeHtml(valor)}"
      aria-pressed="${on}"${title ? ` title="${escapeHtml(title)}"` : ""}>${texto}</button>`;

  const presentes = ORDEN_ROLES.filter(r => techs.some(t => String(t.rol || "").toUpperCase() === r));
  const delRol = r => techs.filter(t => String(t.rol || "").toUpperCase() === r && t.estadoActivo !== "DESCONECTADO").length;
  const puestos = presentes.length < 2 ? "" : seg("Puesto", { label: "Todos", quitar: "rol", on: !rolFilter_ },
    presentes.map(r => segBtn("rol", r, `${rolMeta(r).icon} ${escapeHtml(rolMeta(r).label)} <em>${delRol(r)}</em>`, rolFilter_ === r)));

  const cortes = !modelo.bloques.length ? "" : seg("Corte", { label: "Todo el día", quitar: "franja", on: franjaFilter_ == null },
    modelo.bloques.map((b, i) => segBtn("franja", String(i),
      `${escapeHtml(String(b.label).split("–")[0])}${i === modelo.ahora ? `<i class="lvSeg__now" aria-label="en curso"></i>` : ""}`,
      franjaFilter_ === i, `${b.label}${i === modelo.ahora ? " · corte en curso" : ""}`)));

  const tech = techFilter_ ? techs.find(t => keyTech_(t) === techFilter_) : null;

  return `
  <div class="lvSlice">
    <section class="lvTeam" aria-label="Técnicos">
      <div class="lvTeam__head">
        <span class="lvSlice__tag">Técnicos</span>
        ${esHoy_
          ? `<span class="lvTeam__num" title="Marcaron hoy y aún no cerraron su día"><b>${enTurno}</b> en turno</span>`
          : `<span class="lvTeam__num"><b>${conActividad}</b> con actividad</span>`}
        <button type="button" class="lvTeam__all" data-filtro="estado" data-valor="TODOS"
          title="Las tarjetas de cada técnico: carro actual, tiempo y carros del día">Ver todos (${conActividad}) →</button>
      </div>
      ${pulseHTML_(techs)}
      <div class="lvTeam__legend">${leyenda.join("") || `<span class="lvSlice__none">sin actividad</span>`}</div>
    </section>

    ${puestos || cortes ? `<section class="lvFilters" aria-label="Filtros">${puestos}${cortes}</section>` : ""}

    ${tech || estadoFilter_ ? `
    <div class="lvSlice__on">
      ${tech ? `<button type="button" class="lvPill" data-quitar="tech">👤 ${escapeHtml(primerNombre_(tech.nombre || tech.email))} ✕</button>` : ""}
      ${estadoFilter_ === "META_OK" ? `<button type="button" class="lvPill" data-quitar="estado">🤝 en meta ✕</button>` : ""}
      <button type="button" class="lvPill lvPill--clear" data-quitar="todo">Limpiar todo</button>
    </div>` : ""}
  </div>`;
}

/**
 * La barra segmentada del taller: cuánta gente activa, pausada y sin iniciar.
 *
 * Solo en vivo. En una jornada cerrada todo el mundo acabó o no vino, así que
 * la barra sale vacía y el contador en "0 en pista" — un cero que no informa de
 * nada y que encima se lee como si el taller hubiera estado parado.
 */
function pulseHTML_(techs) {
  if (!esHoy_) return "";
  const conteo = e => techs.filter(t => t.estadoActivo === e).length;

  const segs = [
    { n: conteo("TRABAJANDO"),  tone: "var(--ok)",    label: "activos" },
    { n: conteo("PAUSADO"),     tone: "var(--warn)",  label: "pausados" },
    { n: conteo("SIN_INICIAR"), tone: "var(--muted)", label: "sin iniciar" },
  ].filter(s => s.n > 0);
  const enPista = segs.reduce((s, x) => s + x.n, 0);

  return `
  <span class="lvSlice__pulse" role="img"
    aria-label="${segs.map(s => `${s.n} ${s.label}`).join(", ") || "sin gente en pista"}">
    ${enPista > 0
      ? segs.map(s => `<i style="width:${(s.n / enPista * 100).toFixed(2)}%;background:${s.tone};" title="${s.n} ${s.label}"></i>`).join("")
      : `<i style="width:100%;background:var(--ring-track);"></i>`}
  </span>`;
}

// ── 1. La fila de KPIs ────────────────────────────────────────────────
//
// Cada tile contesta una pregunta y ninguna repite a otra. El de arriba a la
// izquierda es el único que lleva veredicto, porque es el único que tiene
// contra qué compararse: lo que tocaría a esta hora. Un porcentaje suelto
// ("48 %") se lee igual a las 07:00 que a las 22:00 y no dice nada sobre lo
// que hay que hacer.
function kpisHTML_(data, techs, modelo) {
  const v    = data.vinsSummary || {};
  const done = Number(v.convDone) || 0;
  const meta = Number(v.metaDia ?? v.metaConv ?? cfg("META_DIARIA")) || 0;

  const frac     = fracJornada_();
  const esperado = Math.round(meta * frac);
  const delta    = done - esperado;
  const pct      = meta > 0 ? Math.min(100, Math.round(done / meta * 100)) : 0;
  const pctEsp   = meta > 0 ? Math.min(100, Math.round(esperado / meta * 100)) : 0;

  // Sin objetivo (domingo) no hay nada contra qué comparar: decirlo es más
  // honesto que pintar un 0 % en rojo.
  const sinMeta = meta <= 0;
  const tone = sinMeta    ? "var(--muted)"
             : delta >= 0 ? "var(--dv-good)"
             : delta >= -Math.max(1, meta * 0.1) ? "var(--warn)"
             : "var(--dv-serious, var(--danger))";

  const veredicto = sinMeta
    ? `<span class="lvKpi__flat">No había objetivo de producción</span>`
    : `<b>${delta >= 0 ? "+" : "−"}${Math.abs(delta)}</b>
       <span>${delta >= 0 ? "por encima" : "por debajo"} de lo esperado ${esHoy_ ? "a esta hora" : "al cierre"} (${esperado})</span>`;

  const medios = (Array.isArray(data.carrosMedios) ? data.carrosMedios : []).filter(c => !c.faltaEnCurso);
  // Solo conversión: un ramal o una revisión de calidad abiertos no son carros
  // en curso, y sumarlos inflaba el número contra el que se lee la producción.
  const techsConv = techs.filter(esTecConversion_);
  const enCurso = techsConv.reduce((s, t) => s + enCursoOf_(t), 0);
  const franja  = franjaFilter_ != null ? modelo.bloques[franjaFilter_] : null;
  const mitadesFranja = franjaFilter_ != null
    ? modelo.series.delantero[franjaFilter_] + modelo.series.tanquero[franjaFilter_]
    : modelo.totales.mitades;

  const tile = ({ id, label, valor, unidad = "", pie = "", clase = "", drill = "" }) => `
    <${drill ? "button type=\"button\"" : "div"} class="statTile ${clase}${drill ? " statTile--tap" : ""}"
      ${drill ? `data-drill="${drill}"` : ""}>
      <div class="statTile__label">${label}</div>
      <div class="statTile__value">${valor}${unidad ? `<span class="unit">${unidad}</span>` : ""}</div>
      ${pie ? `<div class="statTile__foot">${pie}</div>` : ""}
    </${drill ? "button" : "div"}>`;

  const m = data.mes;
  const mesDelta = m?.metaMes ? (Number(m.convDone) || 0) - (Number(m.metaAcum) || 0) : null;

  // La final se lee contra la bruta: de los carros que ya tienen sus dos
  // mitades, cuántos pasaron calidad. Contra la meta del día no dice nada
  // nuevo, porque nunca puede ir por delante de la bruta.
  const cal    = Number(v.calDone) || 0;
  const pctCal = done > 0 ? Math.min(100, Math.round(cal / done * 100)) : 0;

  return `
  <div class="lvKpis">
    <div class="lvKpis__heroes">
      <button type="button" class="lvKpi lvKpi--hero lvKpi--tap" data-drill="conv" style="--kpiTone:${tone};">
        <div class="lvKpi__label">Producción bruta</div>
        <div class="lvKpi__hint">carros con motor y tanque cerrados</div>
        <div class="lvKpi__num"><b id="liveKpiConv">${done}</b><span>/ ${meta}</span></div>
        <div class="lvKpi__verdict">${veredicto}</div>
        <div class="lvKpi__track" title="${pct}% del objetivo del día">
          <i style="width:${pct}%;"></i>
          ${sinMeta || pctEsp >= 100 ? "" : `<u style="left:${pctEsp}%;" title="Lo esperado ${esHoy_ ? "a esta hora" : "al cierre"}: ${esperado}"></u>`}
        </div>
      </button>

      <button type="button" class="lvKpi lvKpi--hero lvKpi--tap" data-drill="cal" style="--kpiTone:var(--accent);">
        <div class="lvKpi__label">Producción con control de calidad</div>
        <div class="lvKpi__hint">carros que además pasaron calidad</div>
        <div class="lvKpi__num"><b id="liveKpiCal">${cal}</b><span>/ ${done}</span></div>
        <div class="lvKpi__verdict">
          <span>${done > 0 ? `${pctCal}% de la bruta` : "aún no hay bruta"} · <b>${Number(v.calActive) || 0}</b> en control ahora</span>
        </div>
        <div class="lvKpi__track" title="${pctCal}% de la producción bruta ya pasó calidad">
          <i style="width:${pctCal}%;"></i>
        </div>
      </button>
    </div>

    <div class="lvKpis__grid">
      ${tile({
        // Un carro lo convierten dos personas: el delantero cierra el motor y
        // el tanquero el tanque. Cada uno de esos trabajos es una mitad.
        label: franja ? `Mitades · ${escapeHtml(franja.label)}` : "Mitades cerradas",
        // Sin "½" al lado: "11 ½" se leía como once y medio.
        valor: mitadesFranja,
        pie: `motores o tanques terminados · ${modelo.conv.filter(f => f.total > 0).length} técnicos`,
        drill: "mitades",
      })}
      ${tile({
        // En una jornada cerrada "en curso" no significa nada —el día terminó—
        // y el pie decía "0 técnicos trabajando" junto a un 16, que es la clase
        // de contradicción por la que se deja de creer en un panel. Lo que ese
        // número cuenta ahí es lo que quedó abierto cuando acabó el día.
        label: esHoy_ ? "Trabajos en curso" : "Abiertos al cierre",
        valor: enCurso,
        pie: esHoy_
          ? `${techsConv.filter(t => t.estadoActivo === "TRABAJANDO").length} técnicos de conversión trabajando`
          : "se cerraron después o siguen abiertos",
        drill: "curso",
      })}

      ${tile({
        label: "Esperando la otra mitad", valor: medios.length,
        pie: medios.length ? `el más antiguo lleva ${escapeHtml(fmtTiempo_(Math.max(0, Date.now() - (medios[0].cerroMs || 0))))}` : "ningún carro parado",
        clase: medios.length ? "statTile--warnEdge" : "", drill: medios.length ? "medios" : "",
      })}
      ${m?.metaMes ? tile({
        label: `Mes · ${escapeHtml(nombreMes_(m.ym))}`,

        valor: `${m.parcial ? "≥" : ""}${Number(m.convDone) || 0}`, unidad: `/ ${m.metaMes}`,
        pie: `${mesDelta >= 0 ? "+" : "−"}${Math.abs(mesDelta)} vs. ${m.metaAcum} esperados`,
      }) : ""}
    </div>
  </div>`;
}

// ── 2. El contenedor de cada visual ───────────────────────────────────
//
// Todos los visuales llevan el mismo marco: título, subtítulo que dice su
// alcance y botón de foco. El foco existe porque la matriz de cortes con 24
// filas y seis franjas no cabe en media rejilla, y antes la única salida era
// hacer scroll dentro de un bloque de 200 px.
function tileHTML_({ id, titulo, sub = "", span = 1, bare = false, body = "" }) {
  const foco = focoTile_ === id;
  const cls = ["lvTile"];
  if (span === 2) cls.push("lvTile--wide");
  if (bare) cls.push("lvTile--bare");
  if (foco) cls.push("is-foco");

  return `
  <section class="${cls.join(" ")}" data-tile="${id}">
    <header class="lvTile__head">
      <div class="lvTile__titles">
        <h4 class="lvTile__title">${escapeHtml(titulo)}</h4>
        ${sub ? `<p class="lvTile__sub">${escapeHtml(sub)}</p>` : ""}
      </div>
      <button type="button" class="lvTile__foco" data-foco="${id}"
        title="${foco ? "Volver al tablero" : "Ver solo este visual"}"
        aria-pressed="${foco}">${foco ? "✕" : "⛶"}</button>
    </header>
    <div class="lvTile__body">${body}</div>
  </section>`;
}

// Un solo gráfico con pestañas en vez de cinco tiles: se mira uno a la vez, y
// cinco a la vez obligaban a bajar media pantalla para llegar al que importaba.
// Solo el canvas de la vista elegida está en el DOM; los demás no se montan
// (barras_ y acumulado_ se saltan el canvas que no encuentran).
const VISTAS_GRAFICO = [
  { id: "jornada", tab: "Jornada",       titulo: "Ritmo de la jornada",          sub: () => "carros convertidos en cada hora · del taller" },
  { id: "acum",    tab: "Acumulado",     titulo: "Acumulado contra el objetivo", sub: () => "lo cerrado hasta cada hora · del taller" },
  { id: "puestos", tab: "Por puesto",    titulo: "Mitades por puesto",           sub: () => `motores y tanques cerrados en cada corte${filtroNota_()}` },
  { id: "prod",    tab: "Bruta y final", titulo: "Bruta y final",                sub: () => "carros con las dos mitades contra carros ya con calidad · del taller" },
  { id: "mes",     tab: "Embudo y mes",  titulo: "Embudo y acumulado del mes",   sub: () => "el carro no termina cuando se convierte" },
];

function graficoTileHTML_(data, modelo) {
  const v = VISTAS_GRAFICO.find(x => x.id === vistaGrafico_) || VISTAS_GRAFICO[0];
  const canvas = { jornada: CANVAS.ritmo, acum: CANVAS.acum, puestos: CANVAS.puestos, prod: CANVAS.prod }[v.id];
  const tabs = `
    <div class="lvTabs lvTabs--graf" role="tablist">
      ${VISTAS_GRAFICO.map(x => `
        <button type="button" class="lvTab${x.id === v.id ? " is-on" : ""}" role="tab"
          data-grafico="${x.id}" aria-selected="${x.id === v.id}" style="--tabTone:var(--accent);">${escapeHtml(x.tab)}</button>`).join("")}
    </div>`;
  return tileHTML_({
    id: "graficos", titulo: v.titulo, sub: v.sub(), span: 2,
    body: tabs + totalesGraficoHTML_(v.id, data, modelo)
      + (canvas ? canvasHTML_(canvas) : `${funnelHTML_(data.vinsSummary || {})}${mesHTML_(data)}`),
  });
}

/**
 * El total del día de cada serie, encima del gráfico. Las barras enseñan la
 * forma corte a corte; el total es la otra mitad de la pregunta y obligaba a
 * sumar a ojo. Con un corte elegido se añade lo de ese corte al lado.
 * Salen del mismo modelo que la tabla de cifras, no se recuentan aquí.
 */
function totalesGraficoHTML_(vista, data, modelo) {
  const suma_ = (arr) => (arr || []).reduce((s, n) => s + n, 0);
  const s   = modelo.series;
  const sel = franjaFilter_;
  const corte_ = (arr) => (sel != null && arr ? arr[sel] || 0 : null);

  const v    = data.vinsSummary || {};
  const meta = Number(v.metaDia ?? v.metaConv ?? cfg("META_DIARIA")) || 0;

  const items = {
    jornada: [{ label: "Carros del día", n: modelo.totales.carros, tone: "var(--track-motor)", corte: corte_(s.bruta) }],
    acum: [
      { label: "Cerrados", n: modelo.totales.carros, tone: "var(--track-motor)" },
      { label: "Objetivo del día", n: meta, tone: "var(--muted)" },
      { label: "Faltan", n: Math.max(0, meta - modelo.totales.carros), tone: "var(--muted)" },
    ],
    puestos: [
      { label: s.rotulos.motor,  n: suma_(s.delantero), tone: "var(--track-motor)",  corte: corte_(s.delantero) },
      { label: s.rotulos.tanque, n: suma_(s.tanquero),  tone: "var(--track-tanque)", corte: corte_(s.tanquero) },
      { label: "Mitades", n: suma_(s.delantero) + suma_(s.tanquero), tone: "var(--text)",
        corte: sel != null ? corte_(s.delantero) + corte_(s.tanquero) : null },
    ],
    prod: [
      { label: "Bruta", n: modelo.totales.carros,    tone: "var(--track-motor)",   corte: corte_(s.bruta) },
      { label: "Final", n: modelo.totales.aprobados, tone: "var(--track-calidad)", corte: corte_(s.final) },
    ],
  }[vista];
  if (!items) return "";

  const nombreCorte = sel != null ? String(modelo.bloques[sel]?.label || "").split("–")[0] : "";
  return `
    <div class="lvTotals">
      <span class="lvSlice__tag">Total</span>
      ${items.map(it => `
        <span class="lvTotals__item" style="--totTone:${it.tone};">
          <i></i>${escapeHtml(it.label)} <b>${it.n}</b>
          ${it.corte != null ? `<em title="En el corte de las ${escapeHtml(nombreCorte)}">· ${it.corte} en ${escapeHtml(nombreCorte)}</em>` : ""}
        </span>`).join("")}
    </div>`;
}

function canvasHTML_(id) {
  return `<div class="lvTile__box"><canvas id="${id}"></canvas></div>`;
}

// ── 3. El modelo de la jornada ────────────────────────────────────────
//
// Un solo sitio que cuenta, y todos los visuales leen de él. Antes la tabla
// contaba sus celdas y el gráfico recibía unas series calculadas al paso: si
// alguna de las dos cuentas se hubiera tocado por separado, tabla y gráfico
// habrían dicho cosas distintas en la misma pantalla y no habría forma de
// saber cuál mentía.
//
// Qué responde a los segmentadores y qué no:
//   · filas, mitades y el gráfico de puestos → sí (son por técnico)
//   · carros convertidos, aprobados, ritmo y acumulado → no, es del taller:
//     un carro lo cierran dos personas y no se puede repartir por cabeza
export function construirModelo_(data, techs) {
  const bloques = bloquesJornada_(cfg("LIVE_CORTES"));
  const nb      = bloques.length;
  const vacio_  = () => new Array(nb).fill(0);
  const suma_   = (arr) => arr.reduce((s, n) => s + n, 0);
  const metaTec = Number(cfg("META_CARROS_TEC")) || 2;

  // Quien no marcó nada no es una fila vacía: es alguien que no vino.
  // Los segmentadores se aplican con la MISMA regla que a las cards: si la
  // matriz y la grilla filtraran distinto, el tablero se contradiría consigo
  // mismo en la misma pantalla.
  const enPista  = techs.filter(t => t.estadoActivo !== "DESCONECTADO");
  const visibles = enPista.filter(t => pasaFiltros_(t, metaTec));


  const filas = visibles.map(t => {
    const celdas = vacio_();
    let fuera = 0;   // cerrado fuera de las franjas configuradas
    for (const a of (t.asignacionesHoy || [])) {
      // `cerradoDespues` lo marca el backend: la mitad se cerró al día
      // siguiente, así que al cierre de ESTA jornada seguía abierta y su hora
      // de cierre no pertenece a ninguna franja de este día.
      if (a.estado !== "FINALIZADO" || a.cerradoDespues || !a.updated_at) continue;

      const i = nb ? indiceBloque_(minutosPE_(new Date(a.updated_at)), bloques) : -1;
      if (i < 0) { fuera++; continue; }
      celdas[i]++;
    }
    return { t, celdas, fuera, total: suma_(celdas) + fuera };
  });

  ordenarFilas_(filas);

  const esConversion_ = (f) => grupoDeRol_(f.t.rol)?.id === "CONVERSION";
  const conv  = filas.filter(esConversion_);
  const apoyo = filas.filter(f => !esConversion_(f));

  const subtotal_ = (lista) => {
    const out = vacio_();
    for (const f of lista) for (let i = 0; i < nb; i++) out[i] += f.celdas[i];
    return out;
  };

  // Las cifras de VIN: carros enteros y aprobaciones, no mitades.
  const porBloque_ = (lista) => {
    const out = vacio_();
    for (const ms of (Array.isArray(lista) ? lista : [])) {
      const i = nb ? indiceBloque_(minutosPE_(new Date(ms)), bloques) : -1;
      if (i >= 0) out[i]++;
    }
    return out;
  };

  // El puesto se decide por el rol crudo: en conversión solo hay MOTOR
  // (delantero) y TANQUE (tanquero) — los demás roles ya quedaron fuera al
  // separar `conv` de `apoyo`.
  const sumaSi_ = (pred) => {
    const out = vacio_();
    for (const f of conv) {
      if (!pred(String(f.t.rol || "").toUpperCase())) continue;
      for (let i = 0; i < nb; i++) out[i] += f.celdas[i];
    }
    return out;
  };

  const ahora   = nb && esHoy_ ? indiceBloque_(minutosPE_(), bloques) : -1;
  const usadas  = subtotal_(filas);
  const ramales = apoyo.filter(f => grupoDeRol_(f.t.rol)?.id === "RAMALES");
  const calidad = apoyo.filter(f => grupoDeRol_(f.t.rol)?.id !== "RAMALES");

  return {
    bloques, nb, filas, conv, apoyo, ramales, calidad, usadas,
    ahora: ahora >= 0 ? ahora : null,
    subtotal_, porBloque_,
    totales: {
      mitades:   suma_(subtotal_(conv)),
      carros:    (Array.isArray(data?.cierres?.conv) ? data.cierres.conv.length : 0),
      aprobados: (Array.isArray(data?.cierres?.cal) ? data.cierres.cal.length : 0),
      ramales:   suma_(subtotal_(ramales)),
    },
    series: {
      labels:      bloques.map(b => String(b.label).split("–")[0]),
      delantero:   sumaSi_(r => r === "MOTOR"),
      tanquero:    sumaSi_(r => r === "TANQUE"),
      bruta:       porBloque_(data?.cierres?.conv),
      final:       porBloque_(data?.cierres?.cal),
      rotulos:     { motor: rolMeta("MOTOR").label, tanque: rolMeta("TANQUE").label },
      franjaSel:   franjaFilter_,

      franjaAhora: ahora >= 0 ? ahora : null,
      horas:       seriesHoras_(data, bloques),
      acum:        seriesAcum_(data),
    },
  };
}

function ordenarFilas_(filas) {
  const nombre_ = (f) => String(f.t.nombre || f.t.email || "");
  const valor_  = (f) => (orden_.col === "total" ? f.total
                        : orden_.col === "nombre" ? 0
                        : (f.celdas[orden_.col] || 0));
  const signo = orden_.dir === "asc" ? -1 : 1;

  if (orden_.col === "nombre") {
    filas.sort((a, b) => nombre_(a).localeCompare(nombre_(b)) * (orden_.dir === "asc" ? 1 : -1));
    return;
  }
  // Igual que en la hoja del taller: los de más producción arriba, los de cero
  // al final, y a igualdad por nombre para que el orden no baile entre pasadas.
  filas.sort((a, b) => (valor_(b) - valor_(a)) * signo || nombre_(a).localeCompare(nombre_(b)));
}

/** Carros cerrados en cada HORA de la jornada, y a qué franja pertenece cada hora. */
function seriesHoras_(data, bloques) {
  const lista = Array.isArray(data?.cierres?.conv) ? data.cierres.conv : null;
  if (!lista) return null;

  const porHora = new Array(24).fill(0);
  for (const ms of lista) porHora[Math.floor(minutosPE_(new Date(ms)) / 60) % 24]++;

  const horas = horasJornada_();
  const hNow  = horaPE_();
  const idx   = esHoy_ ? horas.indexOf(hNow) : -1;

  return {
    labels:   horas.map(h => `${String(h).padStart(2, "0")}:00`),
    conv:     horas.map(h => porHora[h] || 0),
    // Para que un click en la hora elija la franja que el taller sí usa.
    franjaDe: horas.map(h => (bloques.length ? indiceBloque_(h * 60, bloques) : -1)).map(i => (i >= 0 ? i : null)),
    idxAhora: idx >= 0 ? idx : null,
  };
}

/**
 * Acumulado real contra la línea del objetivo, hora a hora.
 *
 * La línea del objetivo es recta porque el objetivo del taller es diario, no
 * horario: repartirlo en partes iguales es la única lectura que no inventa un
 * perfil de producción que nadie ha pactado. El trazo real se corta en la hora
 * en curso (null hacia adelante) para que no se lea como un estancamiento lo
 * que todavía no ha pasado.
 */
function seriesAcum_(data) {
  const lista = Array.isArray(data?.cierres?.conv) ? data.cierres.conv : [];
  const v     = data?.vinsSummary || {};
  const meta  = Number(v.metaDia ?? v.metaConv ?? cfg("META_DIARIA")) || 0;

  const porHora = new Array(24).fill(0);
  for (const ms of lista) porHora[Math.floor(minutosPE_(new Date(ms)) / 60) % 24]++;

  const horas = horasJornada_();
  const idx   = esHoy_ ? horas.indexOf(horaPE_()) : horas.length - 1;

  let acc = 0;
  const real = horas.map((h, i) => {
    acc += porHora[h] || 0;
    return idx >= 0 && i > idx ? null : acc;
  });

  const n = horas.length;
  return {
    labels:   horas.map(h => `${String(h).padStart(2, "0")}:00`),
    real,
    objetivo: horas.map((_, i) => Math.round(meta * (i + 1) / n)),
    idxAhora: idx >= 0 && idx < n - 1 ? idx : null,
  };
}

// ── 4. La matriz de cortes ────────────────────────────────────────────
//
// La segunda hoja del taller ("CORTES DIARIOS · PRODUCCIÓN POR TÉCNICO"), en
// vivo. Los gráficos dicen a qué ritmo va el taller; esto dice QUIÉN lo movió
// y en qué franja, que es lo que se mira cuando el ritmo cae.
//
// Son DOS TABLAS, no una con secciones. La primera es la del taller: los que
// convierten carros, que es lo que se mide todos los días. La segunda junta
// calidad y ramales, que son apoyo y cuentan en otra unidad.
//
// Un intento anterior las metía en una sola tabla con cabeceras de grupo, y no
// se entendía: la cabecera "CONVERSIÓN 10 13 · · · 7 30" se leía como una
// persona más, pero en negrita, encima de la gente. Un subtotal va DEBAJO de lo
// que suma, no encima — ahora vive en el pie, donde nadie lo confunde con una
// fila de alguien.
//
// Todo sale de `asignacionesHoy`, que ya viajaba para el modal de detalle:
// cada cierre trae su `updated_at`. Ni una consulta más.

/**
 * Punto de presencia junto al nombre.
 *
 * Sale del marcaje del módulo de despacho (asistencia_jornada). Verde latiendo
 * = está en el taller ahora; ámbar fijo = marcó pausa. Sin marca no se pinta
 * nada: no saber dónde está alguien no es lo mismo que saber que se fue, y
 * llenar la tabla de puntos rojos el día que el despacho esté apagado sería
 * afirmar una ausencia que nadie ha comprobado.
 */
function presenciaHTML_(t) {
  const estado = String(t.asistencia || "").toUpperCase();
  if (!estado || estado === "FUERA") return "";
  const pausa = estado === "PAUSA";
  const desde = t.asistenciaAt ? ` (entró ${fmtFechaHora_(t.asistenciaAt)})` : "";
  const texto = `${pausa ? "En pausa" : "En el taller"}${desde}`;
  return `<i class="lvVivo${pausa ? " is-pausa" : ""}" role="img" aria-label="${escapeHtml(texto)}" title="${escapeHtml(texto)}"></i>`;
}

// ── 3b. El día en cifras ──────────────────────────────────────────────
//
// LO PRIMERO DE LA PANTALLA, por delante de cualquier gráfico. Un gráfico
// ayuda a ver una forma; para decir "hoy van 22 y en el corte de las 13:00
// salieron 11" hace falta el número, y el número se lee en una tabla.
//
// Las cuatro preguntas que se hacen todos los días viven aquí juntas, y por
// eso es UNA tabla y no cuatro tarjetas: así se cruzan solas.
//   · conversiones totales   → la fila de arriba, columna TOT
//   · conversiones por corte → esa misma fila, por columnas
//   · producción total       → el pie
//   · producción por rol     → una fila por puesto
//
// El pie NO suma los carros: un carro ES sus dos mitades, y sumarlo encima de
// ellas contaría el mismo trabajo dos veces. Por eso los carros van arriba,
// separados por una línea, y el pie solo suma lo que cada persona cerró.
function resumenHTML_(modelo) {
  const { bloques, nb, series, subtotal_, ramales, ahora } = modelo;
  if (!nb) return "";

  const suma_ = (arr) => arr.reduce((s, n) => s + n, 0);
  const rMotor = rolMeta("MOTOR"), rTanque = rolMeta("TANQUE");
  const rRamal = rolMeta("RAMALERO"), rCal = rolMeta("CALIDAD");

  const ramalesArr = subtotal_(ramales);
  const total = bloques.map((_, i) =>
    series.delantero[i] + series.tanquero[i] + ramalesArr[i] + series.final[i]);

  const colCls_ = (i) => (franjaFilter_ === i ? "is-sel" : "");
  const cero_   = `<i class="lvCortes__cero">·</i>`;

  const fila_ = ({ icon, tone, label, unidad, arr, cls = "" }) => `
    <tr class="${cls}">
      <th scope="row">
        <span class="lvResumen__ico" style="color:${tone};">${icon}</span>
        ${escapeHtml(label)}<em>${escapeHtml(unidad)}</em>
      </th>
      ${arr.map((n, i) => `<td class="${colCls_(i)}">${n > 0 ? n : cero_}</td>`).join("")}
      <td class="lvCortes__tot">${suma_(arr)}</td>
    </tr>`;

  return `
  <div class="lvResumen">
    <div class="lvCortes__scroll">
      <table class="lvCortes__tbl lvResumen__tbl">
        <thead>
          <tr>
            <th scope="col">Corte</th>
            ${bloques.map((b, i) => `<th scope="col" class="${[colCls_(i), i === ahora ? "is-ahora" : ""].filter(Boolean).join(" ")}">
                <button type="button" class="lvCortes__sort" data-filtro="franja" data-valor="${i}"
                  title="${escapeHtml(b.label)}${i === ahora ? " · corte en curso" : ""} — toca para quedarte con este corte">${escapeHtml(b.label.split("–")[0])}</button>
              </th>`).join("")}
            <th scope="col" class="lvCortes__tot">TOTAL</th>
          </tr>
        </thead>
        <!-- Arriba, EL CARRO. Son dos cosas distintas y el taller las nombra
             distinto: bruta es el carro con sus dos mitades cerradas; final es
             ese mismo carro ya pasado por control de calidad. Mezclarlas —o
             dejar la de calidad abajo, como si fuera "lo que produjo un
             puesto"— borra justo la diferencia que el taller mide. -->
        <tbody>
          ${fila_({ icon: "🚗", tone: "var(--accent)", label: "Conversión bruta",
                    unidad: "carro con motor y tanque cerrados", arr: series.bruta, cls: "is-head" })}
          ${fila_({ icon: "✅", tone: rCal.color, label: "Conversión final",
                    unidad: "carro con control de calidad", arr: series.final, cls: "is-head is-final" })}
        </tbody>
        <!-- Abajo, EL TRABAJO DE CADA PUESTO, en la unidad de cada uno. Las dos
             mitades de un carro salen aquí en Motor y en Tanque, y su
             inspección en Calidad: por eso esto no se suma con lo de arriba. -->
        <tbody>
          ${fila_({ icon: rMotor.icon, tone: rMotor.color, label: rMotor.label, unidad: "mitades cerradas", arr: series.delantero })}
          ${fila_({ icon: rTanque.icon, tone: rTanque.color, label: rTanque.label, unidad: "mitades cerradas", arr: series.tanquero })}
          ${ramales.length ? fila_({ icon: rRamal.icon, tone: rRamal.color, label: "Ramales", unidad: "ramales armados", arr: ramalesArr }) : ""}
          ${fila_({ icon: rCal.icon, tone: rCal.color, label: rCal.label, unidad: "inspecciones cerradas", arr: series.final })}
        </tbody>
        <tfoot>
          <tr class="is-fuerte">
            <th scope="row">Producción del taller<em>cierres de todos los puestos</em></th>
            ${total.map((n, i) => `<td class="${colCls_(i)}">${n > 0 ? n : cero_}</td>`).join("")}
            <td class="lvCortes__tot">${suma_(total)}</td>
          </tr>
        </tfoot>

      </table>
    </div>
    <div class="lvCortes__nota">
      Cada columna es el corte que <b>empieza</b> a esa hora.
      Arriba se cuentan <b>carros</b>: <b>bruta</b> es el carro con motor y tanque
      cerrados, y <b>final</b> es ese carro ya con control de calidad.
      Abajo se cuenta lo que cerró <b>cada puesto</b>, en su propia unidad — las
      dos mitades de un carro salen en Motor y en Tanque, y su inspección en
      Calidad. Por eso las dos mitades <b>no</b> se suman con los carros: sería
      contar el mismo trabajo dos veces.
    </div>

  </div>`;
}

/** Las dos tablas + la nota. Lee del modelo; no cuenta nada por su cuenta. */

export function cortesTablasHTML_(modelo) {
  const { bloques, nb, filas, conv, ramales, calidad, apoyo, usadas, ahora, subtotal_, porBloque_ } = modelo;
  if (!nb || !filas.length) return "";

  const suma_   = (arr) => arr.reduce((s, n) => s + n, 0);
  const colCls_ = (i) => [
    usadas[i] === 0 ? "is-vacio" : "",
    franjaFilter_ === i ? "is-sel" : "",
  ].filter(Boolean).join(" ");

  const cero_  = `<i class="lvCortes__cero">·</i>`;
  const celda_ = (n, i) => `<td class="${colCls_(i)}">${n > 0 ? n : cero_}</td>`;
  const fila_  = (arr) => arr.map(celda_).join("");

  const flecha_ = (col) => (orden_.col === col ? (orden_.dir === "desc" ? " ▾" : " ▴") : "");

  const cabecera_ = `
    <tr>
      <th scope="col" class="lvCortes__th">
        <button type="button" class="lvCortes__sort" data-orden="nombre">Técnico${flecha_("nombre")}</button>
      </th>
      ${bloques.map((b, i) => `<th scope="col" class="${[colCls_(i), i === ahora ? "is-ahora" : ""].filter(Boolean).join(" ")}">
           <button type="button" class="lvCortes__sort" data-orden="${i}" data-franja="${i}"
             title="${escapeHtml(b.label)}${i === ahora ? " · corte en curso" : ""} — toca para filtrar u ordenar">${escapeHtml(b.label.split("–")[0])}${flecha_(i)}</button>
         </th>`).join("")}
      <th scope="col" class="lvCortes__tot">
        <button type="button" class="lvCortes__sort" data-orden="total">TOT${flecha_("total")}</button>
      </th>
    </tr>`;

  const cuerpo_ = (lista) => lista.map(({ t, celdas, fuera, total }) => {
    const rm     = rolMeta(t.rol);
    const nombre = t.nombre || t.email || "—";
    const sel    = techFilter_ === keyTech_(t);
    return `
    <tr class="${[total === 0 ? "is-cero" : "", sel ? "is-sel" : ""].filter(Boolean).join(" ")}" data-techrow="${escapeHtml(keyTech_(t))}">
      <th scope="row" title="${escapeHtml(nombre)} — ${escapeHtml(rm.label)} · toca para filtrar el tablero por esta persona">
        ${presenciaHTML_(t)}<span class="lvCortes__rol" style="color:${rm.color};">${rm.icon}</span>${escapeHtml(nombre)}
      </th>
      ${fila_(celdas)}
      <td class="lvCortes__tot">${total > 0 ? total : cero_}${
        fuera > 0 ? `<sup title="${fuera} cerrado${fuera === 1 ? "" : "s"} fuera de las franjas configuradas">*</sup>` : ""
      }</td>
    </tr>`;
  }).join("");

  const filaTotal_ = (r, cls) => `
    <tr${cls ? ` class="${cls}"` : ""}>
      <th scope="row">${r.label}</th>
      ${fila_(r.arr)}
      <td class="lvCortes__tot">${suma_(r.arr)}</td>
    </tr>`;

  // Cada sección es un tbody, y su subtotal va al FINAL de la sección. Un total
  // encima de lo que suma se lee como una fila más; debajo, se lee como lo que
  // es. Fue exactamente el error de la versión anterior de esta tabla.
  const tabla_ = ({ titulo, unidad, secciones, pie }) => `
    <div class="lvCortes__bloque">
      <div class="lvCortes__cap">${titulo} <em>${escapeHtml(unidad)}</em></div>
      <div class="lvCortes__scroll">
        <table class="lvCortes__tbl">
          <thead>${cabecera_}</thead>
          ${secciones.map(s =>
            `<tbody>${cuerpo_(s.lista)}${s.cierre ? filaTotal_(s.cierre, "is-sub") : ""}</tbody>`).join("")}
          ${pie.length ? `<tfoot>${pie.map(r => filaTotal_(r, "is-fuerte")).join("")}</tfoot>` : ""}
        </table>
      </div>
    </div>`;

  // Con un filtro por persona puesto, las mitades de arriba son suyas pero los
  // carros completos siguen siendo los del taller: un carro lo cierran dos y no
  // se puede partir por cabeza. Sin decirlo, la fila se leería como "este
  // señor cerró 22 carros".
  const tablaConv = conv.length ? tabla_({
    titulo: "🔧 Técnicos de conversión",
    unidad: "mitades de carro cerradas",
    secciones: [{ lista: conv, cierre: { label: "Mitades cerradas", arr: subtotal_(conv) } }],
    pie: [{ label: `🚗 Carros completos${techFilter_ ? " <em>del taller</em>" : ""}`, arr: modelo.series.bruta }],
  }) : "";


  // Ramales arriba con su subtotal, calidad al fondo. Así "Aprobados QC" queda
  // pegado a las filas que lo producen en vez de flotando debajo de una lista
  // mezclada, que era lo que hacía el total ilegible.
  const tablaApoyo = apoyo.length ? tabla_({
    titulo: "🤝 Apoyo",
    unidad: "ramales armados e inspecciones",
    secciones: [
      ...(ramales.length ? [{ lista: ramales, cierre: { label: "🔗 Ramales armados", arr: subtotal_(ramales) } }] : []),
      ...(calidad.length ? [{ lista: calidad }] : []),
    ],
    pie: calidad.length ? [{ label: "✅ Aprobados QC", arr: modelo.series.final }] : [],

  }) : "";

  return `
  <div class="lvCortes">
    ${tablaConv}
    ${tablaApoyo}
    <div class="lvCortes__nota">
      Cada columna es el corte que <b>empieza</b> a esa hora. Arriba, cada fila cuenta
      <b>mitades</b> (el motor de un carro, o su tanque); el carro entero lo cierran dos
      personas, por eso «Carros completos» es menor que «Mitades cerradas».
      Toca un <b>nombre</b> para filtrar el tablero por esa persona y una <b>cabecera</b>
      para ordenar o quedarte con un corte.
      ${esHoy_ ? `El punto <i class="lvVivo" aria-hidden="true"></i> marca a quien está en el taller ahora.` : ""}
    </div>
  </div>`;
}

/**
 * Compatibilidad: la tabla a partir de (data, techs).
 *
 * Es la puerta que usan las pruebas y la que deja claro que la tabla es una
 * función pura de sus datos. El tablero usa el modelo directamente para no
 * contar dos veces.
 */
export function cortesHTML_(data, techs) {
  return cortesTablasHTML_(construirModelo_(data, techs));
}

// ── 5. Embudo: el carro no termina cuando se convierte ────────────────
//
// Conversión y calidad estaban como dos metas paralelas, y se leían como dos
// objetivos distintos cuando son dos etapas del MISMO carro. En embudo, la
// diferencia entre lo convertido y lo aprobado se ve sola.
//
// No hay paso de "rechazados" porque hoy la base no registra el rechazo de QC
// como tal: inventarlo aquí sería pintar un número que nadie puede auditar.
function funnelHTML_(v) {
  const pasos = [
    { icon: "🚗", label: "Bruta",  n: Number(v.convDone) || 0 },
    { icon: "🕒", label: "En QC",  n: Number(v.calActive) || 0 },
    { icon: "✅", label: "Final",  n: Number(v.calDone) || 0 },
  ];

  const max = Math.max(1, ...pasos.map(p => p.n));
  return `<div class="lvFunnel">${pasos.map(s => `
    <div class="lvFunnel__step">
      <span class="lvFunnel__lbl">${s.icon} ${escapeHtml(s.label)}</span>
      <span class="lvFunnel__bar"><i style="width:${(s.n / max * 100).toFixed(1)}%;"></i></span>
      <b>${s.n}</b>
    </div>`).join("")}</div>`;
}

// ── 5b. El mes: el acumulado que vivía solo en la hoja de cálculo ─────
function mesHTML_(data) {
  const m = data.mes;
  if (!m || !m.metaMes) return "";

  const done  = Number(m.convDone) || 0;
  const acum  = Number(m.metaAcum) || 0;
  const total = Number(m.metaMes)  || 0;
  const delta = done - acum;
  const pct   = Math.min(100, Math.round(done / total * 100));
  const pctEsp = Math.min(100, Math.round(acum / total * 100));
  const ritmo = m.jornadas > 0 ? (done / m.jornadas) : 0;

  const nombre = new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" })
    .format(new Date(`${m.ym}-01T00:00:00Z`)).toUpperCase();

  const tone = delta >= 0 ? "var(--dv-good)"
             : delta >= -Math.max(1, acum * 0.05) ? "var(--warn)"
             : "var(--dv-serious, var(--danger))";

  return `
  <div class="lvMonth" style="--monthTone:${tone};">
    <div class="lvMonth__head">
      <span class="lvMonth__name">${escapeHtml(nombre)}</span>
      <span class="lvMonth__num">
        ${m.parcial ? `<abbr title="El acumulado de días anteriores no se pudo leer completo: este número es un piso, no el total exacto.">≥</abbr>` : ""}<b>${done}</b>
        <span>/ ${total}</span>
      </span>
      <span class="lvMonth__delta"><b>${delta >= 0 ? "+" : "−"}${Math.abs(delta)}</b> vs. ${acum} esperados</span>
    </div>
    <div class="lvMonth__track">
      <i style="width:${pct}%;"></i>
      <u style="left:${pctEsp}%;" title="Objetivo acumulado a hoy: ${acum}"></u>
    </div>
    <div class="lvMonth__foot">
      Ritmo ${ritmo.toFixed(1)} carros/jornada · ${m.jornadas} de ${m.jornadasMes} jornadas
    </div>
  </div>`;
}

// ── 7. Tarjetas de técnicos (dentro del popup) ────────────────────────
function listaHTML_(lista, metaTec) {
  if (!lista.length) return `<div class="lvDrill__empty">Nadie en este estado.</div>`;
  // Los desconectados al final y en su propio bloque atenuado
  const enPista       = lista.filter(t => t.estadoActivo !== "DESCONECTADO");
  const desconectados = lista.filter(t => t.estadoActivo === "DESCONECTADO");

  return `
    ${enPista.length ? `<div class="lvGrid">${enPista.map(t => cardHTML_(t, metaTec)).join("")}</div>` : ""}
    ${desconectados.length ? `
    <details class="lvOff">
      <summary>Sin actividad ${esHoy_ ? "hoy" : "ese día"} · ${desconectados.length}</summary>
      <div class="lvGrid">${desconectados.map(t => cardHTML_(t, metaTec)).join("")}</div>
    </details>` : ""}`;
}

/** Marcador de carros contra la meta: ●●○ */
function goalDotsHTML_(cars, meta) {
  const llenos = Math.min(cars, meta);
  const extra  = Math.max(cars - meta, 0);
  let out = "";
  for (let i = 0; i < meta; i++) out += `<i class="${i < llenos ? "is-full" : ""}"></i>`;
  return `<span class="lvDots">${out}${extra > 0 ? `<em>+${extra}</em>` : ""}</span>`;
}

const primerNombre_ = n => String(n || "").trim().split(/\s+/)[0] || "compañero";

/**
 * Distintivo de la dupla del carro extra en la card.
 *
 * Tres estados y los tres dicen algo distinto al supervisor:
 *   apoya a X  → está en el carro de otro, no le asignes nada
 *   +X         → es su carro y le mandaron ayuda
 *   SOLO       → ya hizo su dupla hoy; la regla no lo vuelve a emparejar
 *
 * El último es el que evita que alguien "arregle" a mano lo que el sistema
 * decidió a propósito. Devuelve "" si no aplica, para no pisar LIBRE/EXTRA.
 */
function duplaBadgeHTML_(t, dupla) {
  if (dupla) {
    const con = primerNombre_(dupla.conNombre);
    return dupla.soyAncla
      ? `<span class="lvCard__free is-dupla" title="${escapeHtml(dupla.conNombre || "Un compañero")} lo apoya en este carro — el carro va a su nombre">🤝 +${escapeHtml(con)}</span>`
      : `<span class="lvCard__free is-dupla" title="Trabaja en el carro de ${escapeHtml(dupla.conNombre || "su compañero")} — el carro va a nombre de él">🤝 apoya a ${escapeHtml(con)}</span>`;
  }
  if (t.duplaAutoUsada) {
    return `<span class="lvCard__free is-sola" title="Ya hizo su dupla del carro extra hoy — trabaja solo el resto de la jornada">SOLO</span>`;
  }
  return "";
}

function cardHTML_(t, metaTec) {
  const em      = estadoMeta(t.estadoActivo);
  const rm      = rolMeta(t.rol);
  const nombre  = t.nombre || t.email || "Técnico";
  const corto   = String(nombre).trim().split(/\s+/)[0] || "Técnico";
  const off     = t.estadoActivo === "DESCONECTADO";
  const stall   = stallInfo_(t);
  const cars    = carsOf_(t);
  const enCurso = enCursoOf_(t);
  const esConv  = ROLES_DUPLA.includes(String(t.rol || "").toUpperCase());
  const enMeta  = cumplioMeta_(t, metaTec);
  const dupla   = t.duplaAuto || null;
  // En dupla del carro extra no está "libre" aunque no tenga OT propia: está
  // trabajando en la de su compañero. Marcarlo LIBRE mandaría al supervisor a
  // darle carro justo a quien el sistema acaba de asignar a otro.
  const libre   = enMeta && enCurso === 0 && !dupla;

  const asgActual = (t.asignacionesHoy || []).find(a => a.vin === t.vinActivo && a.estado !== "FINALIZADO");
  const tiempo = asgActual?.running_since ? fmtTiempo_(asgActual.tiempo_ms, asgActual.running_since) : "";
  // Un ramal se nombra por su marca, no por el código que la base le inventó.
  const etq = etiquetaTrabajo_(t.vinActivo, t.tipoRamalActivo || asgActual?.tipo_ramal);

  const clases = ["lvCard"];
  if (off)   clases.push("is-off");
  if (stall) clases.push("is-stalled");
  if (libre) clases.push("is-libre");
  if (techFilter_ === keyTech_(t)) clases.push("is-sel");

  return `
  <article class="${clases.join(" ")}" style="--rolTone:${rm.color};--estadoTone:${em.color};"
    data-techkey="${escapeHtml(keyTech_(t))}"
    tabindex="${off ? -1 : 0}" role="${off ? "presentation" : "button"}"
    title="${escapeHtml(nombre)}${off ? " — sin actividad" : " — ver detalle de la jornada"}">

    <div class="lvCard__row">
      <span class="lvCard__dot"></span>
      <span class="lvCard__name">${escapeHtml(corto)}</span>
      <span class="lvCard__rol" title="${escapeHtml(rm.label)}">${rm.icon}</span>
      ${stall ? `<span class="lvCard__alert">⚠️ ${stall.mins}m</span>`
              : `<span class="lvCard__state" title="${escapeHtml(em.label)}">${escapeHtml(ESTADO_CORTO[t.estadoActivo] || em.label)}</span>`}
    </div>

    ${off ? "" : `
    <div class="lvCard__row lvCard__row--vin">
      ${t.vinActivo
        ? `<span class="lvVin${etq.esRamal ? " lvVin--ramal" : ""}" title="${escapeHtml(etq.titulo)}">${escapeHtml(etq.texto)}</span>${t.vinArrastre ? `<span class="lvVin__old" title="Trabajo abierto un día anterior — no suma a la producción de hoy">ayer</span>` : ""}`
        : dupla
          // El ayudante no tiene OT propia: el carro es del compañero. Sin esta
          // línea su card se lee "sin VIN activo", o sea parado, cuando en
          // realidad está trabajando en la zona de al lado.
          ? `<span class="lvVin lvVin--dupla" title="Trabaja en el carro de ${escapeHtml(dupla.conNombre || "su compañero")}">🤝 ${escapeHtml(dupla.vin || "carro de " + primerNombre_(dupla.conNombre))}${dupla.zonaId != null ? ` · Z${escapeHtml(String(dupla.zonaId))}` : ""}</span>`
          : `<span class="lvVin lvVin--none">sin VIN activo</span>`}
      ${tiempo ? `<span class="lvCard__time">⏱ ${escapeHtml(tiempo)}</span>` : ""}
    </div>

    <div class="lvCard__row lvCard__row--prod">
      ${esConv
        ? `${goalDotsHTML_(cars, metaTec)}<span class="lvCard__cars">${cars}<em>/${metaTec}</em></span>`
        : `<span class="lvCard__cars">🚗 ${cars}<em> hoy</em></span>`}
      ${enCurso > 0 ? `<span class="lvCard__curso">⚙️ ${enCurso}</span>` : ""}
      ${duplaBadgeHTML_(t, dupla) ||
        (libre ? `<span class="lvCard__free">LIBRE</span>`
               : enMeta ? `<span class="lvCard__free is-extra">EXTRA</span>` : "")}
    </div>`}
  </article>`;
}

// ── 8. Interacción ────────────────────────────────────────────────────

function repintar_() {
  const container = document.getElementById("liveContainer");
  if (container && liveLastData_) renderLive_(container, liveLastData_);
}

function toggleFranja_(i) {
  if (i == null) return;
  franjaFilter_ = franjaFilter_ === i ? null : i;
  repintar_();
}

/** Cambia de jornada: null = la de ahora. Vuelve a consultar el servidor. */
async function irAFecha_(ymd) {
  const hoy = jornadaHoyPE_();
  const destino = !ymd || ymd >= hoy ? null : ymd;
  if (destino === fechaSel_) return;
  fechaSel_ = destino;
  // Los filtros son del día que se estaba mirando: al cambiar de jornada se
  // quedan sin sentido (la persona seleccionada puede no haber venido ese día).
  limpiarFiltros_();
  focoTile_ = null;

  // El polling solo tiene sentido sobre la jornada en curso: un día cerrado no
  // se mueve, y refrescarlo cada cinco minutos sería pedirle al servidor que
  // rearme el mismo informe para nada.
  if (fechaSel_) stopPoll("POLL_SUP_LIVE_MS");

  await refreshLive_();
  if (!fechaSel_) startPoll("POLL_SUP_LIVE_MS", () => refreshLive_(), { immediate: false });
}

/** La barra de mando se liga aparte: también existe cuando el fetch falló. */
function bindCmd_(container) {
  container.querySelector("#btnLiveRefresh")?.addEventListener("click", () => {
    refreshLive_().catch(() => {});
  });

  container.querySelector("#lvFecha")?.addEventListener("change", (e) => {
    irAFecha_(e.target.value || null).catch(() => {});
  });

  container.querySelectorAll("[data-dia]").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = btn.dataset.dia;
      if (d === "hoy") { irAFecha_(null).catch(() => {}); return; }
      const base = fechaSel_ || jornadaHoyPE_();
      irAFecha_(masDias_(base, Number(d))).catch(() => {});
    });
  });
}

function bindLive_(container, techs, metaTec, data) {
  bindCmd_(container);

  // Segmentadores: estado, rol y franja comparten mecánica (toca para poner,
  // toca otra vez para quitar). Un solo listener evita tener tres casi iguales.
  container.querySelectorAll("[data-filtro]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tipo = btn.dataset.filtro;
      const val  = btn.dataset.valor || null;
      // Un chip de estado contesta "¿quiénes?": abre la lista. La meta sigue
      // filtrando, porque ahí lo que se quiere es ver sus duplas en el tablero.
      if (tipo === "estado" && val !== "META_OK") { abrirEstado_(val, techs); return; }
      if (tipo === "estado") estadoFilter_ = estadoFilter_ === val ? null : val;
      if (tipo === "rol")    rolFilter_    = rolFilter_ === val ? null : val;
      if (tipo === "franja") { toggleFranja_(Number(val)); return; }
      repintar_();
    });
  });

  container.querySelectorAll("[data-quitar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const q = btn.dataset.quitar;
      if (q === "todo")   limpiarFiltros_();
      if (q === "tech")   techFilter_   = null;
      if (q === "rol")    rolFilter_    = null;
      if (q === "estado") estadoFilter_ = null;
      if (q === "franja") franjaFilter_ = null;
      repintar_();
    });
  });

  // Modo foco: un visual a pantalla de tablero. La matriz de cortes con 24
  // filas y seis franjas no se lee en media rejilla.
  container.querySelectorAll("[data-foco]").forEach(btn => {
    btn.addEventListener("click", () => {
      focoTile_ = focoTile_ === btn.dataset.foco ? null : btn.dataset.foco;
      repintar_();
    });
  });

  // Cabeceras de la matriz: ordenar. El click con Alt/⌘ filtra por la franja,
  // que es la otra cosa que se quiere hacer con una columna.
  container.querySelectorAll("[data-orden]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const raw = btn.dataset.orden;
      const col = raw === "nombre" || raw === "total" ? raw : Number(raw);
      if ((e.altKey || e.metaKey) && btn.dataset.franja != null) {
        toggleFranja_(Number(btn.dataset.franja));
        return;
      }
      orden_ = orden_.col === col
        ? { col, dir: orden_.dir === "desc" ? "asc" : "desc" }
        : { col, dir: col === "nombre" ? "asc" : "desc" };
      repintar_();
    });
  });

  // Fila de la matriz: filtra el tablero por esa persona (cross-filter).
  container.querySelectorAll("[data-techrow]").forEach(tr => {
    tr.querySelector("th[scope=row]")?.addEventListener("click", () => {
      const k = tr.dataset.techrow;
      techFilter_ = techFilter_ === k ? null : k;
      repintar_();
    });
  });

  container.querySelectorAll("[data-grafico]").forEach(btn => {
    btn.addEventListener("click", () => {
      vistaGrafico_ = btn.dataset.grafico;
      repintar_();
    });
  });

  // KPI tiles: el drill-down de los números agregados.
  container.querySelectorAll("[data-drill]").forEach(btn => {
    btn.addEventListener("click", () => abrirDrill_(btn.dataset.drill, data, techs));
  });

}

// ── 9. Drill-down de los KPIs ─────────────────────────────────────────
//
// Un número agregado sin forma de abrirlo obliga a creérselo. Estos cuatro son
// los que el supervisor cuestiona en voz alta ("¿qué 14 aprobados?"), así que
// son los que se abren.
function abrirDrill_(cual, data, techs) {
  const fila = (izq, der) => `
    <div class="lvDrill__row"><span>${izq}</span><span>${der}</span></div>`;
  const vacio = `<div class="lvDrill__empty">Nada que mostrar.</div>`;

  if (cual === "conv" || cual === "cal") {
    const esCal = cual === "cal";
    // `cierresDet` trae VIN y modelo; un servidor anterior solo mandaba los
    // instantes, y con eso al menos se puede listar la hora.
    const det = data.cierresDet?.[cual];
    const lista = Array.isArray(det) ? det
      : (Array.isArray(data.cierres?.[cual]) ? data.cierres[cual] : []).map(ms => ({ ms, vin: "", modelo: "" }));

    const porModelo = new Map();
    for (const c of lista) {
      const m = c.modelo || "Sin modelo";
      porModelo.set(m, (porModelo.get(m) || 0) + 1);
    }
    const resumen = det && lista.length ? `
      <div class="lvDrill__models">
        ${[...porModelo].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([m, n]) => `<span class="lvDrill__model"><b>${n}</b> ${escapeHtml(m)}</span>`).join("")}
      </div>` : "";

    const html = lista.length
      ? resumen + [...lista].sort((a, b) => b.ms - a.ms)
          .map(c => fila(
            c.vin
              ? `${esCal ? "✅" : "🚗"} <code>${escapeHtml(c.vin)}</code> · ${escapeHtml(c.modelo || "sin modelo")}`
              : (esCal ? "✅ Carro con control de calidad" : "🚗 Carro con motor y tanque cerrados"),
            escapeHtml(fmtFechaHora_(new Date(c.ms).toISOString())))).join("")
      : vacio;
    openDrilldown({
      title: esCal ? "Producción con control de calidad" : "Producción bruta",
      subtitle: `jornada del ${fmtFechaCorta_(data.fecha)} · por modelo y hora de cierre`,
      badge: lista.length, html,
    });
    return;
  }

  if (cual === "mitades") {
    // Cada mitad es el motor o el tanque de un carro, cerrado por una persona.
    // Se lista por técnico, y la que todavía espera su otra mitad va marcada:
    // es la que aún no suma a la producción bruta.
    const medios = new Map((Array.isArray(data.carrosMedios) ? data.carrosMedios : []).map(c => [c.vin, c]));
    const bloques = bloquesJornada_(cfg("LIVE_CORTES"));
    const enCorte_ = (a) => franjaFilter_ == null
      || indiceBloque_(minutosPE_(new Date(a.updated_at)), bloques) === franjaFilter_;

    const metaTec = Number(cfg("META_CARROS_TEC")) || 2;
    const grupos = techs
      .filter(t => esTecConversion_(t) && pasaFiltros_(t, metaTec))
      .map(t => ({
        t,
        mitades: (t.asignacionesHoy || [])
          .filter(a => a.estado === "FINALIZADO" && !a.cerradoDespues && a.updated_at && enCorte_(a))
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),
      }))
      .filter(g => g.mitades.length)
      .sort((a, b) => b.mitades.length - a.mitades.length
        || String(a.t.nombre || "").localeCompare(String(b.t.nombre || "")));

    const total = grupos.reduce((s, g) => s + g.mitades.length, 0);
    const html = grupos.length
      ? grupos.map(({ t, mitades }) => `
          <div class="lvDrill__group">
            <div class="lvDrill__groupHead">
              <span>${rolMeta(t.rol).icon} ${escapeHtml(t.nombre || t.email || "—")}</span>
              <span>${mitades.length} ${mitades.length === 1 ? "mitad" : "mitades"}</span>
            </div>
            ${mitades.map(a => {
              const medio = medios.get(a.vin);
              const nota = medio
                ? `<span class="lvDrill__half" title="El carro aún no cuenta en la producción bruta">½ falta ${escapeHtml(rolMeta(medio.falta).label.toLowerCase())}${medio.faltaEnCurso ? " (en curso)" : ""}</span>`
                : `<span class="lvDrill__ok">carro completo</span>`;
              return fila(`<code>${escapeHtml(a.vin || "—")}</code> ${nota}`,
                          escapeHtml(fmtFechaHora_(a.updated_at)));
            }).join("")}
          </div>`).join("")
      : vacio;
    const corte = franjaFilter_ != null ? bloques[franjaFilter_]?.label : null;
    openDrilldown({
      title: "Mitades cerradas",
      subtitle: `motor o tanque terminado, por técnico${corte ? ` · corte ${corte}` : ""} · ½ = el carro espera su otra mitad`,
      badge: total, html,
    });
    return;
  }

  if (cual === "curso") {
    const abiertos = techs.filter(esTecConversion_).flatMap(t => (t.asignacionesHoy || [])
      .filter(a => a.estado !== "FINALIZADO" && !a.arrastre)
      .map(a => ({ t, a })));
    const html = abiertos.length
      ? abiertos.map(({ t, a }) => fila(
          `${rolMeta(t.rol).icon} ${escapeHtml(t.nombre || t.email || "—")}`,
          `<code>${escapeHtml(etiquetaTrabajo_(a.vin, a.tipo_ramal).texto || "—")}</code> · ${escapeHtml(estadoMeta(a.estado).label)}`,
        )).join("")
      : vacio;
    openDrilldown({ title: "Trabajos en curso", subtitle: "solo técnicos de conversión", badge: abiertos.length, html });
    return;
  }

  if (cual === "medios") {
    const parados = (Array.isArray(data.carrosMedios) ? data.carrosMedios : []).filter(c => !c.faltaEnCurso);
    const html = parados.length
      ? parados.map(c => fila(
          `<code>${escapeHtml(c.vin)}</code> falta ${rolMeta(c.falta).icon} ${escapeHtml(rolMeta(c.falta).label)}`,
          `⏳ ${escapeHtml(fmtTiempo_(Math.max(0, Date.now() - (c.cerroMs || 0))))}${c.cerroNombre ? ` · cerró ${escapeHtml(primerNombre_(c.cerroNombre))}` : ""}`,
        )).join("")
      : vacio;
    openDrilldown({
      title: "Carros esperando la otra mitad",
      subtitle: "solo los que no tienen a nadie en la mitad que falta",
      badge: parados.length, html,
    });
  }
}

/**
 * Las tarjetas de técnicos de un chip: todos, activos, pausados, sin iniciar o
 * parados. Antes la grilla vivía siempre abierta al pie del tablero y repetía
 * lo que dicen los chips y la tabla; ahora se abre cuando se pregunta "¿quiénes?".
 * Respeta el filtro de puesto, que es el que se pone para mirar a un grupo.
 */
function abrirEstado_(estado, techs) {
  const metaTec = Number(cfg("META_CARROS_TEC")) || 2;
  const parados = estado === "STALLED";
  const delPuesto = (t) => !rolFilter_ || String(t.rol || "").toUpperCase() === rolFilter_;
  const lista = techs
    .filter(t => delPuesto(t) && (estado === "TODOS" ? true
      : parados ? !!stallInfo_(t) : t.estadoActivo === estado))
    .sort((a, b) => (stallInfo_(b)?.ms || 0) - (stallInfo_(a)?.ms || 0));

  const titulos = {
    TODOS:       "Técnicos",
    TRABAJANDO:  "Técnicos activos",
    PAUSADO:     "Técnicos en pausa",
    SIN_INICIAR: "Técnicos sin iniciar",
    STALLED:     "Técnicos parados",
  };
  const puesto = rolFilter_ ? ` · solo ${rolMeta(rolFilter_).label.toLowerCase()}` : "";

  const body = openDrilldown({
    title: titulos[estado] || "Técnicos",
    subtitle: (parados
      ? `más de ${STALL_PAUSADO_MS / 60_000} min en pausa o ${STALL_SIN_INI_MS / 60_000} min sin iniciar · toca uno para ver su día`
      : "toca uno para ver su día") + puesto,
    badge: lista.filter(t => t.estadoActivo !== "DESCONECTADO").length,
    html: listaHTML_(lista, metaTec),
    wide: true,
  });

  // El drill se pinta fuera del contenedor del LIVE: las tarjetas se ligan aquí.
  body.querySelectorAll(".lvCard:not(.is-off)").forEach(row => {
    const abrir = () => {
      const tech = techs.find(t => keyTech_(t) === row.dataset.techkey);
      if (!tech) return;
      closeDrilldown();
      openLiveDetail_(tech);
    };
    row.addEventListener("click", abrir);
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    });
  });
}

// ── 10. Modal de detalle del día ───────────────────────────────────────
function openLiveDetail_(tech) {
  const modal = document.getElementById("liveDetailModal");
  const title = document.getElementById("liveDetailTitle");
  const body  = document.getElementById("liveDetailBody");
  if (!modal || !title || !body) return;

  const nombre = tech.nombre || tech.email || "Técnico";
  const meta   = rolMeta(tech.rol);
  title.textContent = `${meta.icon} ${nombre} — ${meta.label}`;

  const asgList = Array.isArray(tech.asignacionesHoy) ? tech.asignacionesHoy : [];
  const cars    = carsOf_(tech);
  const enCurso = enCursoOf_(tech);
  // Un ramalero no cierra carros, cierra ramales. Decirle "carros" a su trabajo
  // es la clase de detalle por el que la gente deja de creerle al panel.
  const unidad  = String(tech.rol || "").toUpperCase() === "RAMALERO"
    ? ["ramal", "ramales"] : ["carro", "carros"];

  if (!asgList.length) {
    body.innerHTML = `<div class="small">Sin asignaciones ${esHoy_ ? "hoy" : "esa jornada"}.</div>`;
  } else {
    // Cerrados hoy primero, luego lo abierto, y el arrastre al final
    const orden = a => (a.estado === "FINALIZADO" ? 0 : a.arrastre ? 2 : 1);
    const filas = [...asgList].sort((a, b) => orden(a) - orden(b));
    const summary = `<div class="lvDetail__sum">
      <span><b>${cars}</b> ${cars === 1 ? unidad[0] : unidad[1]} cerrado${cars !== 1 ? "s" : ""}</span>
      ${enCurso > 0 ? `<span>⚙️ <b>${enCurso}</b> en curso</span>` : ""}
    </div>`;
    body.innerHTML = summary + filas.map(renderDetailRow_).join("");
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
}

function renderDetailRow_(a) {
  const em  = estadoMeta(a.estado);
  // Antes: `a.vin || (a.tipo_ramal ? …)`. El fallback no se disparaba NUNCA,
  // porque un ramal también trae vin — el código inventado. Resultado: cuatro
  // filas de `RAMAL-1790686306788-46NX` y ninguna forma de saber qué se armó.
  const etq = etiquetaTrabajo_(a.vin, a.tipo_ramal);
  const vin = etq.texto || "–";
  const tarde = !!a.cerradoDespues;
  const tiempoTotal = fmtTiempo_(a.tiempo_ms, a.estado === "TRABAJANDO" ? a.running_since : null);

  const inicioStr = a.fecha_asignacion ? fmtFechaHora_(a.fecha_asignacion) : null;
  const finStr    = a.estado === "FINALIZADO" && a.updated_at ? fmtFechaHora_(a.updated_at) : null;

  return `
  <div class="lvDetail__row${a.arrastre ? " is-old" : ""}">
    <div class="lvDetail__top">
      <span class="lvDetail__vin" title="${escapeHtml(etq.titulo || vin)}">${escapeHtml(vin)}</span>
      ${a.arrastre ? `<span class="lvVin__old" title="Abierto un día anterior — no suma a hoy">ayer</span>` : ""}
      ${tarde ? `<span class="lvVin__old" title="Se cerró después de esta jornada: al cierre del día seguía abierto y no suma aquí">cerró después</span>` : ""}

      <span class="lvDetail__time">⏱ ${escapeHtml(tiempoTotal)}</span>
    </div>
    <div class="lvDetail__meta small">
      <span class="live-badge ${escapeHtml(em.badge)}">${escapeHtml(em.label)}</span>
      ${inicioStr ? `<span>🟢 ${escapeHtml(inicioStr)}</span>` : ""}
      ${finStr    ? `<span>🏁 ${escapeHtml(finStr)}</span>`    : ""}
    </div>
  </div>`;
}

// La jornada del taller es en hora Perú, no la del navegador ni UTC. Comparar
// contra `toISOString()` (UTC) hacía pasar por "hoy" todo lo ocurrido después de
// las 19:00 del día anterior — el mismo desfase que rompía el filtro del backend.
// (TZ_PE se declara arriba, con los helpers de jornada que también la usan.)
const _fDiaPE  = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ_PE });
const _fHoraPE = new Intl.DateTimeFormat("es-PE", { timeZone: TZ_PE, hour: "2-digit", minute: "2-digit" });

/** Fecha (YYYY-MM-DD) en hora Perú. */
function diaPE_(d) { return _fDiaPE.format(d); }

// Formatea ISO → "DD/MM HH:MM" en hora Perú (omite la fecha si es hoy)
function fmtFechaHora_(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const dia  = diaPE_(d);
  const hhmm = _fHoraPE.format(d);
  if (dia === diaPE_(new Date())) return hhmm;
  const [, mm, dd] = dia.split("-");
  return `${dd}/${mm} ${hhmm}`;
}

function closeLiveDetail_() {
  const modal = document.getElementById("liveDetailModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("show");
  // Si hubo actualización mientras el modal estaba abierto, aplicarla ahora
  repintar_();
}

// ── 11. Ciclo de vida ─────────────────────────────────────────────────
async function refreshLive_() {
  if (!liveActive_) return;
  const container = document.getElementById("liveContainer");
  if (!container) return;

  cargando_ = true;
  container.querySelector("#btnLiveRefresh")?.classList.add("is-busy");
  // Qué jornada se pidió. Al volver hay que comprobar que siga siendo la que
  // interesa: una pasada del polling puede estar EN VUELO cuando el supervisor
  // cambia de día, y al aterrizar pisaría la jornada que acaba de elegir. Se
  // veía como un panel con la cabecera de ayer y los números de hoy — el peor
  // fallo posible aquí, porque no parece un fallo, parece un dato.
  const pedida = fechaSel_;
  const data = await fetchLive_();
  if (pedida !== fechaSel_) return;      // llegó tarde: esta respuesta ya no es
  cargando_ = false;
  liveLastData_ = data;


  // Si hay un modal abierto, NO re-renderizar para no interrumpir al usuario
  const modalOpen = document.getElementById("liveDetailModal")?.classList.contains("show");
  if (!modalOpen) {
    renderLive_(container, data);
  }

  // Actualizar solo el timestamp (siempre, silenciosamente)
  const ts = document.getElementById("liveLastUpdate");
  if (ts) {
    const nowIso = new Date().toISOString();
    ts.dataset.reltime = nowIso;          // el ticker global lo mantiene fresco
    ts.textContent = relTimeText(nowIso);
  }
}

export function bindSupLive_() {
  // Botón cerrar modal detalle
  document.getElementById("btnCloseLiveDetail")?.addEventListener("click", closeLiveDetail_);
  document.getElementById("liveDetailModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLiveDetail_();
  });
}

export async function enterLive_() {
  liveActive_ = true;
  startRelTimeTicker(); // mantiene frescos los "hace X min" (singleton global)

  // Skeleton mientras llega el primer fetch (estructura > texto "cargando")
  const container = document.getElementById("liveContainer");
  if (container && !container.querySelector(".lvCard")) {
    container.innerHTML = skeletonHTML(4, { height: 64 });
  }

  await refreshLive_();
  // Polling gobernado por config; se pausa en background (core/poll.js). Sobre
  // una jornada cerrada no se arranca: no hay nada que refrescar.
  if (!fechaSel_) startPoll("POLL_SUP_LIVE_MS", () => refreshLive_(), { immediate: false });
}

export function exitLive_() {
  liveActive_ = false;
  stopPoll("POLL_SUP_LIVE_MS");
  // Chart.js guarda sus instancias en un registro propio y engancha listeners
  // de resize y de tema: sin este destroy quedan vivas sobre un DOM que ya no
  // existe, y cada entrada al LIVE deja un par más detrás.
  destruirLiveCharts_();
}
