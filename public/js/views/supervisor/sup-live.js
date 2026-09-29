// =========================
// public/js/views/supervisor/sup-live.js
// Panel LIVE del supervisor — foto de la jornada de HOY.
//
// Alcance de datos (lo define el backend, ver routes/supervisor.js):
//   · carros CERRADOS hoy      → cuentan 1 c/u (ya no hay medios carros)
//   · trabajos ABIERTOS hoy    → "en curso"
//   · trabajos de días previos → NO suman; solo indican en qué está parado
//     alguien que hoy no abrió nada (se marcan "ayer").
//
// Jerarquía visual: 1) meta del día  2) pulso del taller  3) duplas  4) técnicos.
// Todo lo secundario (historial de asignaciones) vive en el modal de detalle.
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
import { clasificarDuplas_, renderDuplasPanel_, cumplioMeta_, ROLES_DUPLA } from "./sup-duplas.js";

let liveActive_   = false;
let liveLastData_ = null;   // último fetch, para re-abrir detalle actualizado
let estadoFilter_ = null;   // "TRABAJANDO"|"PAUSADO"|"SIN_INICIAR"|"STALLED"|"META_OK"|null
let rolFilter_    = null;   // "MOTOR"|"TANQUE"|"CALIDAD"|"RAMALERO"|null
let offOpen_      = false;  // bloque "sin actividad hoy" desplegado (sobrevive al polling)
let mediosOpen_   = false;  // bloque "carros a medias" desplegado (idem)
let cortesOpen_   = false;  // tabla de cortes por técnico desplegada (idem)

let _prevKpi = { conv: null, cal: null }; // para animar los números al cambiar

const ORDEN_ROLES = ["MOTOR", "TANQUE", "CALIDAD", "RAMALERO"];

// Umbrales de "sin movimiento" (ms)
const STALL_PAUSADO_MS = 40 * 60_000;
const STALL_SIN_INI_MS = 60 * 60_000;

// ── API ───────────────────────────────────────────────────────────────
async function fetchLive_() {
  return getJSON("/api/supervisor/live").catch(() => null);
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

/** Las horas que componen la jornada, en orden: [5,6,…,23,0]. */
function horasJornada_() {
  const ini = hhmmAMin_(cfg("LIVE_JORNADA_INICIO")) ?? 300;
  const fin = hhmmAMin_(cfg("LIVE_JORNADA_FIN"))    ?? 60;
  const h0  = Math.floor(ini / 60);
  const total = (((Math.floor(fin / 60) - h0) % 24) + 24) % 24 || 24;
  return Array.from({ length: total }, (_, i) => (h0 + i) % 24);
}

/**
 * Qué fracción de la jornada va consumida (0…1).
 *
 * Fuera de la ventana devuelve 1: si ya son las 03:00 la jornada terminó, y el
 * objetivo del día era el objetivo entero, no una parte de él.
 */
function fracJornada_() {
  const ini = hhmmAMin_(cfg("LIVE_JORNADA_INICIO")) ?? 300;
  let   fin = hhmmAMin_(cfg("LIVE_JORNADA_FIN"))    ?? 60;
  if (fin <= ini) fin += 1440;          // la jornada cruza la medianoche
  let ahora = minutosPE_();
  if (ahora < ini) ahora += 1440;       // estamos en la cola de la jornada de ayer
  return Math.max(0, Math.min(1, (ahora - ini) / (fin - ini)));
}

// ── Helpers de dominio ────────────────────────────────────────────────
function carsOf_(t)    { return Number(t.carsHoy ?? t.finalizadosHoy ?? 0) || 0; }
function enCursoOf_(t) { return Number(t.virtualHoy ?? t.activosHoy ?? 0) || 0; }

/** Trabajo abierto más reciente + cuánto lleva sin cambiar de estado. */
function stallInfo_(t) {
  if (t.estadoActivo !== "PAUSADO" && t.estadoActivo !== "SIN_INICIAR") return null;
  const abierto = (t.asignacionesHoy || [])
    .filter(a => a.estado !== "FINALIZADO")
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
  if (!abierto?.updated_at) return null;
  const ms    = Date.now() - new Date(abierto.updated_at).getTime();
  const limit = t.estadoActivo === "PAUSADO" ? STALL_PAUSADO_MS : STALL_SIN_INI_MS;
  return ms > limit ? { ms, mins: Math.floor(ms / 60_000) } : null;
}

/** ¿La card pasa los filtros activos del header? */
function pasaFiltros_(t, metaTec) {
  if (rolFilter_ && String(t.rol || "").toUpperCase() !== rolFilter_) return false;
  if (!estadoFilter_) return true;
  if (estadoFilter_ === "STALLED") return !!stallInfo_(t);
  if (estadoFilter_ === "META_OK") return cumplioMeta_(t, metaTec);
  return t.estadoActivo === estadoFilter_;
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

/** "2026-08-05" → "05/08" */
function fmtFechaCorta_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  return m ? `${m[3]}/${m[2]}` : String(ymd || "");
}

// ── Render principal ──────────────────────────────────────────────────
function renderLive_(container, data) {
  if (!container) return;
  if (!data?.ok) {
    container.innerHTML = `<div class="lvEmpty">⚠️ ${escapeHtml(data?.error || "Error cargando datos.")}</div>`;
    return;
  }

  const techs = Array.isArray(data.techs) ? data.techs : [];
  if (!techs.length) {
    container.innerHTML = `<div class="lvEmpty">Sin actividad registrada hoy.</div>`;
    return;
  }

  const metaTec = Number(cfg("META_CARROS_TEC")) || 2;
  const duplas  = clasificarDuplas_(techs, metaTec);

  const nowIso = new Date().toISOString();
  const html = `
    ${headerHTML_(data, nowIso)}
    ${diaHTML_(data)}
    ${cortesHTML_(data, techs)}
    ${mesHTML_(data)}
    ${mediosHTML_(data)}
    ${pulsoHTML_(techs, duplas, metaTec)}
    ${renderDuplasPanel_(duplas)}
    ${rolesTabsHTML_(techs)}
    ${listaHTML_(techs, metaTec)}
  `;

  container.innerHTML = html;

  // Números de meta animados (count-up desde el valor anterior)
  const vsum = data.vinsSummary || {};
  countUp(container.querySelector("#liveKpiConv"), vsum.convDone || 0, { from: _prevKpi.conv });
  countUp(container.querySelector("#liveKpiCal"),  vsum.calDone  || 0, { from: _prevKpi.cal  });
  _prevKpi = { conv: vsum.convDone || 0, cal: vsum.calDone || 0 };

  bindLive_(container, techs, metaTec);
}

// ── 0. Barra superior: fecha + frescura + refresh ─────────────────────
function headerHTML_(data, nowIso) {
  return `
  <div class="lvBar">
    <span class="lvBar__date">${escapeHtml(fmtFechaCorta_(data.fecha))}</span>
    <span class="lvBar__live"><i class="lvBar__beat"></i>EN VIVO</span>
    <span class="lvBar__ago">Actualizado <span id="liveLastUpdate" data-reltime="${nowIso}">${relTimeText(nowIso)}</span></span>
    <button type="button" id="btnLiveRefresh" class="lvBar__btn" title="Actualizar ahora" aria-label="Actualizar">↻</button>
  </div>`;
}

// ── 1. El día: ¿vamos a tiempo? ───────────────────────────────────────
//
// Aquí había dos tarjetas ("Conversión 12/25", "Calidad 11/22") que respondían
// CUÁNTO llevamos pero no SI VAMOS BIEN. El número que hace accionable el panel
// es la diferencia contra lo que tocaría a esta hora — el mismo que el
// supervisor sacaba a mano de la hoja de producción diaria.
//
// La barra lleva una marca en la posición de ese objetivo parcial: si el
// relleno pasa la marca vamos sobrados, si se queda corto vamos tarde. Es la
// lectura de un vistazo que un porcentaje suelto nunca da.
function diaHTML_(data) {
  const v    = data.vinsSummary || {};
  const done = Number(v.convDone) || 0;
  const meta = Number(v.metaDia ?? v.metaConv ?? cfg("META_DIARIA")) || 0;

  const frac     = fracJornada_();
  const esperado = Math.round(meta * frac);
  const delta    = done - esperado;
  const pct      = meta > 0 ? Math.min(100, Math.round(done / meta * 100)) : 0;

  // Sin objetivo (domingo) no hay nada contra qué comparar: decirlo es más
  // honesto que pintar un 0 % en rojo.
  const sinMeta = meta <= 0;
  const tone = sinMeta        ? "var(--muted)"
             : delta >= 0     ? "var(--dv-good)"
             : delta >= -Math.max(1, meta * 0.1) ? "var(--warn)"
             : "var(--dv-serious, var(--danger))";

  const veredicto = sinMeta
    ? `<span class="lvDay__flat">Hoy no hay objetivo de producción</span>`
    : `<b>${delta >= 0 ? "+" : "−"}${Math.abs(delta)}</b>
       <span>${delta >= 0 ? "por encima" : "por debajo"} de lo esperado a esta hora (${esperado})</span>`;

  return `
  <div class="lvDay" style="--dayTone:${tone};">
    <div class="lvDay__head">
      <div class="lvDay__num"><b id="liveKpiConv">${done}</b><span class="lvDay__of">/ ${meta}</span></div>
      <div class="lvDay__label">carros<br>convertidos hoy</div>
      <div class="lvDay__verdict">${veredicto}</div>
    </div>
    <div class="lvDay__track">
      <i style="width:${pct}%;"></i>
      ${sinMeta || frac >= 1 ? "" : `<u style="left:${(frac * 100).toFixed(1)}%;" title="Lo esperado a esta hora: ${esperado}"></u>`}
    </div>
    ${sparkHTML_(data.cierres)}
    ${funnelHTML_(v)}
  </div>`;
}

// ── 1b. Pulso por hora: el ritmo real del taller ──────────────────────
//
// Réplica en vivo de los "cortes diarios" que el taller llevaba en la hoja de
// cálculo. El dato siempre estuvo en la base (la hora en que cerró la última
// mitad de cada carro); lo que faltaba era mirarlo por hora en vez de sumarlo
// todo en un único total que oculta si el turno noche produjo o no.
function sparkHTML_(cierres) {
  const lista = Array.isArray(cierres?.conv) ? cierres.conv : null;
  if (!lista) return "";

  // El servidor manda los instantes, no un conteo: agrupar por hora es cosa de
  // quien pinta. Ver cortesHTML_, que agrupa los MISMOS datos por turno.
  const conv = new Array(24).fill(0);
  for (const ms of lista) conv[Math.floor(minutosPE_(new Date(ms)) / 60) % 24]++;

  const horas = horasJornada_();
  const hNow  = horaPE_();
  const idx   = horas.indexOf(hNow);
  const max   = Math.max(1, ...horas.map(h => Number(conv[h]) || 0));
  const hh    = (h) => String(h).padStart(2, "0");

  const barras = horas.map((h, i) => {
    const n = Number(conv[h]) || 0;
    // "Todavía no ha pasado" no es lo mismo que "pasó y no salió nada": las
    // horas futuras van atenuadas para no leerse como un bajón.
    const futura = idx >= 0 && i > idx;
    const cls = [futura ? "is-next" : "", i === idx ? "is-now" : ""].filter(Boolean).join(" ");
    return `<i class="${cls}" style="height:${Math.max(n > 0 ? 12 : 2, n / max * 100)}%;"
              title="${hh(h)}:00 · ${n} carro${n === 1 ? "" : "s"}"></i>`;
  }).join("");

  const ahora = idx >= 0 ? (Number(conv[hNow]) || 0) : null;
  return `
  <div class="lvSpark">
    <div class="lvSpark__bars">${barras}</div>
    <div class="lvSpark__axis">
      <span>${hh(horas[0])}:00</span>
      <span class="lvSpark__now">${ahora == null ? "fuera de jornada" : `esta hora · ${ahora}`}</span>
      <span>${hh((horas[horas.length - 1] + 1) % 24)}:00</span>
    </div>
  </div>`;
}

// ── 1b-bis. Cortes del día: quién cerró qué y en qué turno ────────────
//
// La segunda hoja del taller ("CORTES DIARIOS · PRODUCCIÓN POR TÉCNICO"), en
// vivo. El sparkline de arriba dice a qué ritmo va el taller; esto dice QUIÉN
// lo movió y en qué franja, que es lo que se mira cuando el ritmo cae.
//
// Son DOS TABLAS, no una con secciones. La primera es la del taller: los que
// convierten carros, que es lo que se mide todos los días. La segunda junta
// calidad y ramales, que son apoyo y cuentan en otra unidad.
//
// El intento anterior las metía en una sola tabla con cabeceras de grupo, y no
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

export function cortesHTML_(data, techs) {
  const bloques = bloquesJornada_(cfg("LIVE_CORTES"));
  if (!bloques.length) return "";

  const nb     = bloques.length;
  const vacio_ = () => new Array(nb).fill(0);
  const suma_  = (arr) => arr.reduce((s, n) => s + n, 0);

  // Quien no marcó nada hoy no es una fila vacía: es alguien que no vino.
  const enPista = techs.filter(t => t.estadoActivo !== "DESCONECTADO");
  if (!enPista.length) return "";

  const filas = enPista.map(t => {
    const celdas = vacio_();
    let fuera = 0;   // cerrado fuera de las franjas configuradas
    for (const a of (t.asignacionesHoy || [])) {
      if (a.estado !== "FINALIZADO" || !a.updated_at) continue;
      const i = indiceBloque_(minutosPE_(new Date(a.updated_at)), bloques);
      if (i < 0) { fuera++; continue; }
      celdas[i]++;
    }
    return { t, celdas, fuera, total: suma_(celdas) + fuera };
  });
  // Igual que en la hoja: los de más producción arriba, los de cero al final.
  filas.sort((a, b) => b.total - a.total || (a.t.nombre || "").localeCompare(b.t.nombre || ""));

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
      const i = indiceBloque_(minutosPE_(new Date(ms)), bloques);
      if (i >= 0) out[i]++;
    }
    return out;
  };

  // Una franja que nadie usó no merece la misma tinta que una con producción.
  const usadas = subtotal_(filas);
  const ahora  = indiceBloque_(minutosPE_(), bloques);
  const colCls_ = (i) => (usadas[i] === 0 ? "is-vacio" : "");

  const cero_  = `<i class="lvCortes__cero">·</i>`;
  const celda_ = (n, i) => `<td class="${colCls_(i)}">${n > 0 ? n : cero_}</td>`;
  const fila_  = (arr) => arr.map(celda_).join("");

  const cabecera_ = `
    <tr>
      <th scope="col">Técnico</th>
      ${bloques.map((b, i) => `<th scope="col" class="${[colCls_(i), i === ahora ? "is-ahora" : ""].filter(Boolean).join(" ")}"
           title="${escapeHtml(b.label)}${i === ahora ? " · franja en curso" : ""}">${escapeHtml(b.label.split("–")[0])}</th>`).join("")}
      <th scope="col" class="lvCortes__tot">TOT</th>
    </tr>`;

  const cuerpo_ = (lista) => lista.map(({ t, celdas, fuera, total }) => {
    const rm     = rolMeta(t.rol);
    const nombre = t.nombre || t.email || "—";
    return `
    <tr class="${total === 0 ? "is-cero" : ""}">
      <th scope="row" title="${escapeHtml(nombre)} — ${escapeHtml(rm.label)}">
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

  const tablaConv = conv.length ? tabla_({
    titulo: "🔧 Técnicos de conversión",
    unidad: "mitades de carro cerradas",
    secciones: [{ lista: conv, cierre: { label: "Mitades cerradas", arr: subtotal_(conv) } }],
    pie: [{ label: "🚗 Carros completos", arr: porBloque_(data.cierres?.conv) }],
  }) : "";

  // Ramales arriba con su subtotal, calidad al fondo. Así "Aprobados QC" queda
  // pegado a las filas que lo producen en vez de flotando debajo de una lista
  // mezclada, que era lo que hacía el total ilegible.
  const ramales = apoyo.filter(f => grupoDeRol_(f.t.rol)?.id === "RAMALES");
  const calidad = apoyo.filter(f => grupoDeRol_(f.t.rol)?.id !== "RAMALES");

  const tablaApoyo = apoyo.length ? tabla_({
    titulo: "🤝 Apoyo",
    unidad: "ramales armados e inspecciones",
    secciones: [
      ...(ramales.length ? [{ lista: ramales, cierre: { label: "🔗 Ramales armados", arr: subtotal_(ramales) } }] : []),
      ...(calidad.length ? [{ lista: calidad }] : []),
    ],
    pie: calidad.length ? [{ label: "✅ Aprobados QC", arr: porBloque_(data.cierres?.cal) }] : [],
  }) : "";

  return `
  <details class="lvCortes"${cortesOpen_ ? " open" : ""}>
    <summary>🕐 Cortes del día · producción por técnico</summary>
    ${tablaConv}
    ${tablaApoyo}
    <div class="lvCortes__nota">
      Cada columna es la franja que <b>empieza</b> a esa hora. Arriba, cada fila cuenta
      <b>mitades</b> (el motor de un carro, o su tanque); el carro entero lo cierran dos
      personas, por eso «Carros completos» es menor que «Mitades cerradas».
      El punto <i class="lvVivo" aria-hidden="true"></i> marca a quien está en el taller ahora.
    </div>
  </details>
`;
}

// ── 1c. Embudo: el carro no termina cuando se convierte ───────────────
//
// Conversión y calidad estaban como dos metas paralelas, y se leían como dos
// objetivos distintos cuando son dos etapas del MISMO carro. En embudo, la
// diferencia entre lo convertido y lo aprobado se ve sola.
//
// No hay paso de "rechazados" porque hoy la base no registra el rechazo de QC
// como tal: inventarlo aquí sería pintar un número que nadie puede auditar.
function funnelHTML_(v) {
  const pasos = [
    { icon: "🔧", label: "Convertidos", n: Number(v.convDone) || 0,   id: "" },
    { icon: "🕒", label: "En QC",       n: Number(v.calActive) || 0,  id: "" },
    { icon: "✅", label: "Aprobados",   n: Number(v.calDone) || 0,    id: "liveKpiCal" },
  ];
  return `<div class="lvFunnel">${pasos.map((s, i) => `
    ${i ? `<span class="lvFunnel__arrow" aria-hidden="true">→</span>` : ""}
    <span class="lvFunnel__step">
      <b${s.id ? ` id="${s.id}"` : ""}>${s.n}</b>
      <em>${s.icon} ${escapeHtml(s.label)}</em>
    </span>`).join("")}</div>`;
}

// ── 1d. El mes: el acumulado que vivía solo en la hoja de cálculo ─────
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

// ── 1e. Carros a medias: la mitad que quedó esperando ─────────────────
//
// El LIVE agrupa por persona, así que nadie podía preguntarle "¿qué carro está
// parado?". El backend ya lo sabía — calculaba por VIN qué mitades estaban
// cerradas y tiraba todo menos el contador.
//
// Solo se listan los carros cuya otra mitad NO tiene a nadie encima. Un carro
// con motor cerrado y tanque en curso es un carro normal a media mañana; si
// entrara en la lista, un día cualquiera diría "12 carros a medias" y el aviso
// dejaría de significar nada. Los que sí tienen a alguien se cuentan aparte,
// en una línea, para que no parezca que se los comió el filtro.
function mediosHTML_(data) {
  const lista   = Array.isArray(data.carrosMedios) ? data.carrosMedios : [];
  const parados = lista.filter(c => !c.faltaEnCurso);   // ya vienen del más antiguo al más nuevo
  const enCurso = lista.length - parados.length;
  if (!parados.length) return "";

  const ahora  = Date.now();
  const espera = (ms) => (ms ? fmtTiempo_(Math.max(0, ahora - ms)) : "—");
  const TOPE   = 8;

  const filas = parados.slice(0, TOPE).map(c => {
    const rm = rolMeta(c.falta);
    return `
    <div class="lvMedios__row">
      <span class="lvVin" title="${escapeHtml(c.vin)}">${escapeHtml(c.vin)}</span>
      <span class="lvMedios__falta" style="--faltaTone:${rm.color};">
        falta ${rm.icon} ${escapeHtml(rm.label)}
      </span>
      <span class="lvMedios__ago" title="Desde que cerró la otra mitad">⏳ ${escapeHtml(espera(c.cerroMs))}</span>
      ${c.cerroNombre ? `<span class="lvMedios__who">cerró ${escapeHtml(primerNombre_(c.cerroNombre))}</span>` : ""}
    </div>`;
  }).join("");

  const pie = [
    parados.length > TOPE ? `y ${parados.length - TOPE} más` : "",
    enCurso > 0 ? `Otro${enCurso === 1 ? "" : "s"} ${enCurso} con la otra mitad en curso` : "",
  ].filter(Boolean).join(" · ");

  return `
  <details class="lvMedios"${mediosOpen_ ? " open" : ""}>
    <summary>⏸ ${parados.length} carro${parados.length === 1 ? "" : "s"} esperando la otra mitad · el más antiguo lleva ${escapeHtml(espera(parados[0].cerroMs))}</summary>
    ${filas}
    ${pie ? `<div class="lvMedios__mas">${escapeHtml(pie)}</div>` : ""}
  </details>`;
}

// ── 2. Pulso del taller: barra segmentada + filtros ───────────────────
function pulsoHTML_(techs, duplas, metaTec) {
  const conteo = e => techs.filter(t => t.estadoActivo === e).length;
  const activos  = conteo("TRABAJANDO");
  const pausados = conteo("PAUSADO");
  const sinIni   = conteo("SIN_INICIAR");
  const stalled  = techs.filter(t => stallInfo_(t)).length;
  const enPista  = activos + pausados + sinIni;

  const segs = [
    { f: "TRABAJANDO",  n: activos,  tone: "var(--ok)",    label: "activos" },
    { f: "PAUSADO",     n: pausados, tone: "var(--warn)",  label: "pausados" },
    { f: "SIN_INICIAR", n: sinIni,   tone: "var(--muted)", label: "sin iniciar" },
  ];

  const chips = segs.filter(s => s.n > 0).map(s => chipHTML_(s.f, s.tone, `${s.n} ${s.label}`));
  if (stalled > 0) {
    chips.push(chipHTML_("STALLED", "var(--dv-serious)", `⚠️ ${stalled} sin mov.`));
  }
  if (duplas.totalMeta > 0) {
    chips.push(chipHTML_("META_OK", "var(--note)", `🤝 ${duplas.totalMeta} en meta ${metaTec}`));
  }

  return `
  <div class="lvPulse">
    <div class="lvPulse__track" role="img" aria-label="${activos} trabajando, ${pausados} pausados, ${sinIni} sin iniciar">
      ${enPista > 0
        ? segs.filter(s => s.n > 0).map(s =>
            `<i style="width:${(s.n / enPista * 100).toFixed(2)}%;background:${s.tone};" title="${s.n} ${s.label}"></i>`).join("")
        : `<i style="width:100%;background:var(--ring-track);"></i>`}
    </div>
    <div class="lvPulse__chips">
      ${chips.join("")}
      <span class="lvPulse__total">${enPista} en pista</span>
    </div>
  </div>`;
}

function chipHTML_(filtro, tone, texto) {
  const on = estadoFilter_ === filtro;
  return `<button type="button" class="lvChip${on ? " is-on" : ""}" data-estado-filter="${filtro}"
    style="--chipTone:${tone};" aria-pressed="${on}">${texto}</button>`;
}

// ── 3. Tabs por especialidad (filtran, ya no colapsan) ────────────────
function rolesTabsHTML_(techs) {
  const presentes = ORDEN_ROLES.filter(r => techs.some(t => String(t.rol || "").toUpperCase() === r));
  if (presentes.length < 2) return "";

  const tab = (rol, label, icon, tone, n) => `
    <button type="button" class="lvTab${rolFilter_ === rol ? " is-on" : ""}" data-rol-filter="${rol || ""}"
      style="--tabTone:${tone};" aria-pressed="${rolFilter_ === rol}">
      ${icon} ${escapeHtml(label)} <b>${n}</b>
    </button>`;

  const activosDe = rol => techs.filter(t =>
    String(t.rol || "").toUpperCase() === rol && t.estadoActivo !== "DESCONECTADO").length;
  const totalActivos = techs.filter(t => t.estadoActivo !== "DESCONECTADO").length;

  return `<div class="lvTabs">
    ${tab(null, "Todos", "👥", "var(--accent)", totalActivos)}
    ${presentes.map(r => {
      const m = rolMeta(r);
      return tab(r, m.label, m.icon, m.color, activosDe(r));
    }).join("")}
  </div>`;
}

// ── 4. Grid plano de técnicos ─────────────────────────────────────────
function listaHTML_(techs, metaTec) {
  const visibles = techs.filter(t => pasaFiltros_(t, metaTec));
  if (!visibles.length) {
    return `<div class="lvEmpty">Nadie coincide con el filtro.</div>`;
  }
  // Los desconectados al final y en su propio bloque atenuado
  const enPista      = visibles.filter(t => t.estadoActivo !== "DESCONECTADO");
  const desconectados = visibles.filter(t => t.estadoActivo === "DESCONECTADO");

  return `
    <div class="lvGrid">${enPista.map(t => cardHTML_(t, metaTec)).join("")}</div>
    ${desconectados.length ? `
    <details class="lvOff"${offOpen_ ? " open" : ""}>
      <summary>Sin actividad hoy · ${desconectados.length}</summary>
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

  return `
  <article class="${clases.join(" ")}" style="--rolTone:${rm.color};--estadoTone:${em.color};"
    data-techkey="${escapeHtml(t.userId + "__" + t.rol)}"
    tabindex="${off ? -1 : 0}" role="${off ? "presentation" : "button"}"
    title="${escapeHtml(nombre)}${off ? " — sin actividad hoy" : " — ver detalle del día"}">

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

// ── Bindings ──────────────────────────────────────────────────────────
function bindLive_(container, techs, metaTec) {
  container.querySelector("#btnLiveRefresh")?.addEventListener("click", () => refreshLive_().catch(() => {}));

  container.querySelectorAll("[data-estado-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.estadoFilter;
      estadoFilter_ = estadoFilter_ === f ? null : f;
      renderLive_(container, liveLastData_);
    });
  });

  container.querySelectorAll("[data-rol-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.rolFilter || null;
      rolFilter_ = rolFilter_ === r ? null : r;
      renderLive_(container, liveLastData_);
    });
  });

  const off = container.querySelector(".lvOff");
  if (off) off.addEventListener("toggle", () => { offOpen_ = off.open; });

  const medios = container.querySelector(".lvMedios");
  if (medios) medios.addEventListener("toggle", () => { mediosOpen_ = medios.open; });

  const cortes = container.querySelector(".lvCortes");
  if (cortes) cortes.addEventListener("toggle", () => { cortesOpen_ = cortes.open; });

  container.querySelectorAll(".lvCard:not(.is-off)").forEach(card => {
    const abrir = () => {
      const tech = techs.find(t => `${t.userId}__${t.rol}` === card.dataset.techkey);
      if (tech) openLiveDetail_(tech);
    };
    card.addEventListener("click", abrir);
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    });
  });
}

// ── Modal de detalle del día ───────────────────────────────────────────
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
    body.innerHTML = `<div class="small">Sin asignaciones hoy.</div>`;
  } else {
    // Cerrados hoy primero, luego lo abierto, y el arrastre al final
    const orden = a => (a.estado === "FINALIZADO" ? 0 : a.arrastre ? 2 : 1);
    const filas = [...asgList].sort((a, b) => orden(a) - orden(b));
    const summary = `<div class="lvDetail__sum">
      <span><b>${cars}</b> ${cars === 1 ? unidad[0] : unidad[1]} cerrado${cars !== 1 ? "s" : ""} hoy</span>
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
  const tiempoTotal = fmtTiempo_(a.tiempo_ms, a.estado === "TRABAJANDO" ? a.running_since : null);
  const inicioStr = a.fecha_asignacion ? fmtFechaHora_(a.fecha_asignacion) : null;
  const finStr    = a.estado === "FINALIZADO" && a.updated_at ? fmtFechaHora_(a.updated_at) : null;

  return `
  <div class="lvDetail__row${a.arrastre ? " is-old" : ""}">
    <div class="lvDetail__top">
      <span class="lvDetail__vin" title="${escapeHtml(etq.titulo || vin)}">${escapeHtml(vin)}</span>
      ${a.arrastre ? `<span class="lvVin__old" title="Abierto un día anterior — no suma a hoy">ayer</span>` : ""}
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
  if (liveLastData_) {
    const container = document.getElementById("liveContainer");
    if (container) renderLive_(container, liveLastData_);
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────
async function refreshLive_() {
  if (!liveActive_) return;
  const container = document.getElementById("liveContainer");
  if (!container) return;
  const data = await fetchLive_();
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
  // Polling gobernado por config; se pausa en background (core/poll.js)
  startPoll("POLL_SUP_LIVE_MS", () => refreshLive_(), { immediate: false });
}

export function exitLive_() {
  liveActive_ = false;
  stopPoll("POLL_SUP_LIVE_MS");
}
