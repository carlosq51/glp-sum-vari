// =========================
// public/js/views/movilizador/movilizador.js
// Vista MOVILIZADOR – flujo de 3 etapas
//
// Lista 0: Ingreso              → registrados, aún sin trabajar
// Lista 2: Pendientes de calibración → convertidos y sin calidad
// Lista 3: Listos para salir    → calidad finalizada
// =========================

import { CORE, escapeHtml, fmtShort_, getJSON, getJSON_user, postJSON, createVinSuggest_, renderUserAvatar } from "../../core/core.js";
import { updateHubModuleBadge } from "../../core/ui-shell.js";
import { createScanner } from "../../core/qr-scanner.js";
import { icon } from "../../core/icons.js";
import { initZonasMapa, promptZonaForVin } from "../zonas/zonas-mapa.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { exportCsv_ } from "../../core/csv.js";

// VINs del panel salida que aún no tienen OT según el último render
let _vinsSinOT_ = new Set();
const GPS_URL = "https://gps-ubicaciones-app.vercel.app/";
const OFFLINE_KEY = "glp_mov_offline_q";
const LISTA_CACHE_KEY = "glp_mov_lista_cache";
// ¿Abrir la app GPS al registrar? Una sola preferencia para Entrada y Salida:
// los dos segmentados escriben y leen esta clave, así que mover uno mueve el otro.
const REDIR_KEY = "glp_mov_redir";

let _pendientesRows = [];
let _pendientesFiltro = "";

// Mapa de zonas
let _zonasMapa = null;

// ─── Helpers ──────────────────────────────────────────────────────────

function getMovNombre_() {
  return CORE.state.currentProfile?.nombre || CORE.state.currentProfile?.email || "Movilizador";
}

function fmtDate_(iso) {
  return iso ? fmtShort_(iso) : "—";
}

/**
 * diasDesde_ — días completos transcurridos desde una fecha ISO hasta ahora.
 * null si no hay fecha (VIN sin registro de entrada).
 */
function diasDesde_(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms >= 0 ? Math.floor(ms / 86400000) : 0;
}

/**
 * badgeDias_ — escala de color según cuánto lleva un carro esperando
 * conversión sin que nadie lo toque: 0 días es normal, de ahí en más es
 * señal de que puede haberse ido a otra área sin que el movilizador se
 * entere. Los cortes (1 / 3 días) son ajustables si en la práctica resultan
 * muy sensibles o muy laxos.
 */
function badgeDias_(dias) {
  if (dias === null) return "";
  let cls = "movChip--note", label = "Hoy";
  if (dias === 1)      { cls = "movChip--warn";   label = "1 día"; }
  else if (dias >= 2)  { cls = "movChip--danger"; label = `${dias} días`; }
  return `<span class="movChip ${cls}">${icon("timer", 13)}${label}</span>`;
}

/**
 * esHoyPeru_ — ¿la fecha cae en el día de hoy en Lima?
 *
 * Se compara en hora de Perú y no con la del dispositivo: el taller trabaja
 * de madrugada y un teléfono en otra zona horaria contaría el turno de la
 * noche como si fuera de ayer o de mañana.
 */
function esHoyPeru_(iso) {
  if (!iso) return false;
  const fmt = d => d.toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  return fmt(new Date(iso)) === fmt(new Date());
}

/** plDias_ — "hoy" / "1 día" / "N días", para meterlo dentro de una frase. */
function plDias_(dias) {
  if (dias === null) return "";
  if (dias === 0) return "hoy";
  return `${dias} día${dias === 1 ? "" : "s"}`;
}

/**
 * ubicCorta_ — la ubicación en una palabra, como se dice en el patio.
 * "ZONA DE ESPERA DE PINTURA" → "PINTURA", "COLA DE ESPERA REPUESTOS" →
 * "REPUESTOS", "ZONA DE INGRESO" → "INGRESO". Lo que no sigue el patrón
 * ("LISTOS - REVISADO") pasa tal cual.
 */
function ubicCorta_(u) {
  return String(u || "").trim().toUpperCase()
    .replace(/^(ZONA|COLA)\s+DE\s+ESPERA\s+(DE\s+|DEL\s+)?/, "")
    .replace(/^ZONA\s+DE\s+/, "")
    .trim();
}

/** Chip de ubicación en negrita; vacío si no hay ubicación. */
function ubicHtml_(u) {
  const c = ubicCorta_(u);
  return c ? `<span class="movUbic" title="${escapeHtml(u)}">${icon("mapPin", 14)}${escapeHtml(c)}</span>` : "";
}

/** "YYYY-MM-DD" del día en Lima. Acepta un ISO o una fecha "YYYY-MM-DD" tal cual. */
function diaLima_(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Cabecera de un grupo de día: "Hoy · vie 03 oct", "Ayer · …", "Lun 29 sep · hace 6 días". */
function diaHdrHtml_(ymd, n) {
  let fecha = "Sin fecha", rel = "";
  if (ymd) {
    const d = new Date(`${ymd}T12:00:00Z`);
    fecha = d.toLocaleDateString("es-PE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" })
      .replace(/\./g, "").replace(",", "");
    fecha = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    const dias = Math.round((Date.parse(`${diaLima_(new Date().toISOString())}T12:00:00Z`) - d.getTime()) / 86400000);
    rel = dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : dias > 1 ? `hace ${dias} días` : "";
  }
  return `
    <div class="movDayHdr">
      <span class="movDayDate">${fecha}</span>
      ${rel ? `<span class="movDayRel">${rel}</span>` : ""}
      <span class="movDayCount">${n}</span>
    </div>`;
}

/** Agrupa filas por día (en el orden en que vienen) → [[ymd, filas], ...]. */
function porDia_(rows, campo) {
  const grupos = new Map();
  for (const r of rows) {
    const k = diaLima_(r[campo]);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  return [...grupos];
}

/** "14:20" en hora de Lima. */
function horaLima_(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
}

function setBadge_(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count > 0 ? String(count) : "";
  el.style.display = count > 0 ? "inline-flex" : "none";
}

// ─── Render ───────────────────────────────────────────────────────────

function renderList0_(rows) {
  const box = document.getElementById("movPanel0Body");
  if (!box) return;

  const countEspera     = rows.filter(r => !r.en_conversion).length;
  const countConversion = rows.filter(r =>  r.en_conversion).length;

  // Badge naranja = en espera, badge azul = en conversión
  setBadge_("movBadge0",      countEspera);
  setBadge_("movBadge0conv",  countConversion);

  // Los tres números de la cabecera de Ingreso. Suman entre sí a propósito:
  // "en espera" y "en conversión" no se solapan, así que el total es el parque
  // que hay ahora mismo en el taller. Los ingresados hoy van aparte en la
  // línea de abajo porque un carro registrado hoy puede estar ya en conversión
  // y sumarlo aquí lo contaría dos veces.
  const setNum_ = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  };
  setNum_("movStatEspera",     countEspera);
  setNum_("movStatConversion", countConversion);
  setNum_("movStatTotal",      rows.length);

  // Tres grupos, ya ordenados del backend:
  //   · en zona y sin técnicos — colocado en una plaza, esperando su dupla
  //   · sin zona — registrado y nadie lo ha puesto en ningún sitio: el que
  //     lleva días así es el que otra área pudo haberse llevado
  //   · en conversión — con OT abierta, técnicos encima
  const enZona     = rows.filter(r => !r.en_conversion &&  r.zona);
  const sinZona    = rows.filter(r => !r.en_conversion && !r.zona);
  const conversion = rows.filter(r =>  r.en_conversion);

  const hoy = rows.filter(r => esHoyPeru_(r.fecha_entrada)).length;
  const hintEl = document.getElementById("movIngresoStatsHint");
  if (hintEl) {
    hintEl.textContent = rows.length
      ? `${hoy} ingresado${hoy !== 1 ? "s" : ""} hoy` +
        (enZona.length ? ` · ${enZona.length} en zona esperando técnicos` : "")
      : "";
  }

  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty">Sin vehículos en espera de conversión.</div>`;
    return;
  }

  /** Fila "Zona 11 · desde 15:20 · Carlos" del timeline de la tarjeta. */
  const zonaRowHtml = (z) => {
    if (!z) return "";
    const nombre = z.id === "LIBRE" ? "Zona libre" : `Zona ${z.id}`;
    const dz = diasDesde_(z.desde);
    const cuando = !z.desde ? ""
      : esHoyPeru_(z.desde) ? `hoy ${horaLima_(z.desde)}`
      : `${fmtDate_(z.desde)} · ${plDias_(dz)}`;
    return `
      <div class="movTimelineRow">
        <span class="movTimelineIcon" aria-hidden="true">${icon("mapPin", 14)}</span>
        <span class="movTimelineLabel">En plaza</span>
        <span class="movZonaTag">${nombre}</span>
        ${cuando || z.por
          ? `<span class="movPor">${[cuando, z.por && escapeHtml(z.por.split(/\s+/)[0])].filter(Boolean).join(" · ")}</span>`
          : ""}
      </div>`;
  };

  const ingresoRowHtml = (r) => {
    const d = diasDesde_(r.fecha_entrada);
    return `
      <div class="movTimelineRow">
        <span class="movTimelineIcon" aria-hidden="true">${icon("trayIn", 14)}</span>
        <span class="movTimelineLabel">Ingreso</span>
        ${r.fecha_entrada
          ? `<span class="movFecha">${fmtDate_(r.fecha_entrada)}</span><span class="movPor">${plDias_(d)}${r.registrado_por ? ` · ${escapeHtml(r.registrado_por)}` : ""}</span>`
          : `<span class="movCardNoReg">Sin registro</span>`}
      </div>`;
  };

  /** Delantero y tanquero; el lado que ya cerró lleva ✓. */
  const tecnicosHtml = (t) => {
    if (!t) return "";
    const lado = (rol, n, fin) => n
      ? `<span class="movTec${fin ? " movTec--fin" : ""}">${rol} ${escapeHtml(n)}${fin ? " ✓" : ""}</span>`
      : `<span class="movTec movTec--falta">${rol} —</span>`;
    return `<div class="movTecs">${lado("Del.", t.delantero, t.delantero_fin)}${lado("Tanq.", t.tanquero, t.tanquero_fin)}</div>`;
  };

  // Sin zona: agrupado por día de ingreso, la fecha va en la cabecera del
  // grupo y la tarjeta solo dice hora, quién y dónde lo vio el GPS.
  const sinZonaCard = (r) => {
    const dias = diasDesde_(r.fecha_entrada);
    return `
    <div class="movCard${dias >= 2 ? " movCard--late" : ""}">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        ${badgeDias_(dias)}
      </div>
      <div class="movCardMeta">
        ${ubicHtml_(r.ubicacion)}
        ${r.fecha_entrada
          ? `<span class="movHora">${horaLima_(r.fecha_entrada)}</span>${r.registrado_por ? `<span class="movPor">${escapeHtml(r.registrado_por)}</span>` : ""}`
          : `<span class="movCardNoReg">Sin registro de entrada</span>`}
      </div>
    </div>`;
  };

  // En zona: el reloj que importa es el de la plaza, no el del ingreso. Un
  // carro que entró hace 3 días y lo pusieron en zona hace una hora no está
  // olvidado — se dicen las dos fechas para que se vea la diferencia.
  const enZonaCard = (r) => `
    <div class="movCard movCard--zona">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        <span class="movChip movChip--warn">${icon("users", 13)}Sin técnicos</span>
      </div>
      <div class="movTimeline">
        ${zonaRowHtml(r.zona)}
        ${ingresoRowHtml(r)}
      </div>
      ${r.ubicacion ? `<div class="movCardMeta"><span class="movTimelineLabel">GPS</span>${ubicHtml_(r.ubicacion)}</div>` : ""}
    </div>`;

  const convCard = (r) => `
    <div class="movCard movCard--conv">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        <span class="movChip movChip--note movChip--live">En conversión</span>
      </div>
      ${tecnicosHtml(r.tecnicos)}
      <div class="movTimeline">
        ${zonaRowHtml(r.zona)}
        ${ingresoRowHtml(r)}
      </div>
    </div>`;

  const blockHdr = (ic, txt, n) =>
    `<div class="movBlockHdr">${icon(ic, 16)} ${txt} <span class="movDayCount">${n}</span></div>`;

  let html = "";
  if (enZona.length) {
    html += blockHdr("mapPin", "En zona · esperando técnicos", enZona.length);
    html += `<div class="movCardList">${enZona.map(enZonaCard).join("")}</div>`;
  }
  if (sinZona.length) {
    if (enZona.length) html += blockHdr("car", "Sin zona asignada", sinZona.length);
    html += porDia_(sinZona, "fecha_entrada").map(([dia, filas]) => `
    <section class="movDayGroup">
      ${diaHdrHtml_(dia, filas.length)}
      <div class="movCardList">${filas.map(sinZonaCard).join("")}</div>
    </section>`).join("");
  }
  if (conversion.length) {
    html += blockHdr("wrench", "En conversión", conversion.length);
    html += `<div class="movCardList">${conversion.map(convCard).join("")}</div>`;
  }
  box.innerHTML = html;
}

/**
 * renderOlvidados_ — VINs registrados hace más de MOV_VENTANA_TRASLADOS_DIAS
 * que siguen sin cerrarse.
 *
 * Van en un panel aparte y plegado en vez de mezclados en Ingreso: casi
 * siempre son carros que salieron sin que nadie registrara la salida, y
 * ensuciaban la lista del día con meses de historia. Pero tampoco pueden
 * desaparecer solos — el movilizador es el único que puede saber si alguno
 * sigue de verdad en el patio.
 */
function renderOlvidados_(rows) {
  const panel = document.getElementById("movPanelOlvidados");
  const box   = document.getElementById("movPanelOlvidadosBody");
  const hint  = document.getElementById("movOlvidadosHint");
  if (!panel || !box) return;

  if (!rows?.length) {
    panel.style.display = "none";
    box.innerHTML = "";
    return;
  }
  panel.style.display = "";
  if (hint) hint.textContent = `${rows.length} sin cerrar — revisar si ya salieron`;

  box.innerHTML = `
    <div class="movCardList">
      ${rows.map(r => `
        <div class="movCard">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            <span class="movChip movChip--warn">${escapeHtml(String(r.estado || "").replace(/_/g, " "))}</span>
          </div>
          <div class="movCardMeta">
            <span class="movFecha">${r.fecha ? fmtDate_(r.fecha) : "Sin fecha"}</span>
            ${r.registrado_por ? `<span class="movPor">${escapeHtml(r.registrado_por)}</span>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Lista cache (localStorage) ─────────────────────────────────────

function saveListaCache_(rows) {
  try {
    localStorage.setItem(LISTA_CACHE_KEY, JSON.stringify({ rows, savedAt: new Date().toISOString() }));
  } catch {}
}

function loadListaCache_() {
  try { return JSON.parse(localStorage.getItem(LISTA_CACHE_KEY) || "null"); } catch { return null; }
}

function showCacheBanner_(savedAt) {
  const banner = document.getElementById("movCacheBanner");
  if (!banner) return;
  const d = savedAt ? new Date(savedAt) : null;
  const label = d ? d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?";
  banner.style.display = "";
  banner.textContent = `Sin conexión — mostrando lista guardada el ${label}`;
}

function hideCacheBanner_() {
  const banner = document.getElementById("movCacheBanner");
  if (banner) banner.style.display = "none";
}

function updateGuardarBtn_(savedAt) {
  const btn = document.getElementById("btnMovGuardarLista");
  if (!btn) return;
  if (savedAt) {
    const d = new Date(savedAt);
    const t = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    btn.title = `Lista guardada a las ${t}`;
    btn.classList.add("movDownloadBtnSaved");
  } else {
    btn.title = "Guardar lista en el celular";
    btn.classList.remove("movDownloadBtnSaved");
  }
}

// ─── Preferencia de redirección al GPS ─────────────────────────────
//
// Vive en localStorage: es del dispositivo, no de la cuenta. El movilizador
// usa siempre el mismo celular y la elección tiene que sobrevivir al cierre de
// la app — se guarda hasta que él mismo la cambie.

/** Default true: hasta ahora SIEMPRE redirigía, y nadie debe perder el GPS por actualizar. */
function getRedir_() {
  try { return localStorage.getItem(REDIR_KEY) !== "0"; } catch { return true; }
}

function setRedir_(on) {
  try { localStorage.setItem(REDIR_KEY, on ? "1" : "0"); } catch {}
  paintRedir_();
}

/** Deja los DOS segmentados mostrando lo que está guardado. */
function paintRedir_() {
  const on = getRedir_();
  document.querySelectorAll(".movRedirOpt").forEach(b => {
    const activo = (b.dataset.val === "1") === on;
    b.classList.toggle("movRedirOptOn", activo);
    b.setAttribute("aria-pressed", activo ? "true" : "false");
  });
}

// ─── Offline queue ─────────────────────────────────────

function getOfflineQueue_() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch { return []; }
}
function saveOfflineQueue_(q) {
  try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); } catch {}
}
function addToOfflineQueue_(vin) {
  const q = getOfflineQueue_();
  if (!q.find(i => i.vin === vin))
    q.push({ vin, accion: "REGISTRAR_ENTRADA", usuario: getMovNombre_(), ts: Date.now() });
  saveOfflineQueue_(q);
  updateOfflineBanner_();
}
function removeFromOfflineQueue_(vin) {
  saveOfflineQueue_(getOfflineQueue_().filter(i => i.vin !== vin));
  updateOfflineBanner_();
}
function updateOfflineBanner_() {
  const q = getOfflineQueue_();
  const banner = document.getElementById("movOfflineBanner");
  const countEl = document.getElementById("movOfflineCount");
  if (!banner) return;
  banner.style.display = q.length ? "" : "none";
  if (countEl) countEl.textContent = String(q.length);
}
async function drainOfflineQueue_() {
  const q = getOfflineQueue_();
  if (!q.length || !navigator.onLine) return;
  const synced = [];
  for (const item of q) {
    try {
      const j = await postJSON("/api/movilizador/traslado", { vin: item.vin, accion: item.accion, usuario: item.usuario });
      if (j?.ok) synced.push(item.vin);
    } catch { /* keep for next retry */ }
  }
  if (synced.length) {
    saveOfflineQueue_(getOfflineQueue_().filter(i => !synced.includes(i.vin)));
    updateOfflineBanner_();
  }
}

// ─── Pendientes por registrar ────────────────────────────────────────

function renderPendientesRegistrar_(rows) {
  _pendientesRows = rows || [];
  updateOfflineBanner_();

  // Badge en la tab Lista
  setBadge_("movBadgeLista", _pendientesRows.length);
  setBadge_("movBadgePendientes", _pendientesRows.length);

  // Re-aplicar filtro de búsqueda actual
  applyPendientesFiltro_(_pendientesFiltro);
}

function renderPendientesBody_(filtered) {
  const box = document.getElementById("movPendientesBody");
  const subHdr = document.getElementById("movPendientesSubHdr");

  const total = _pendientesRows.length;
  const showing = filtered.length;

  if (subHdr) {
    if (!total) {
      subHdr.textContent = "";
    } else if (_pendientesFiltro && showing !== total) {
      subHdr.textContent = `${showing} resultado${showing !== 1 ? "s" : ""} de ${total} pendiente${total !== 1 ? "s" : ""}`;
    } else {
      subHdr.textContent = `${total} vehículo${total !== 1 ? "s" : ""} por registrar`;
    }
  }

  if (!box) return;

  // Con una observación a medio escribir no se repinta: el poll pasa cada
  // pocos segundos y borraría lo que el movilizador está tecleando. Se repinta
  // al cerrar el editor (closeObsEditor_).
  if (_obsEditVin) { _pendientesDirty = true; return; }
  _pendientesDirty = false;

  if (!filtered.length) {
    box.innerHTML = `<div class="movEmpty">${
      total ? "Ningún VIN coincide con la búsqueda." : "Todos los carros ya están registrados."
    }</div>`;
    return;
  }

  // Agrupados por fecha de la lista: la fecha va en la cabecera del grupo, del
  // mismo tamaño que el VIN, y la ubicación en negrita dentro de la tarjeta.
  box.innerHTML = porDia_(filtered, "fecha").map(([dia, filas]) => `
    <section class="movDayGroup">
      ${diaHdrHtml_(dia, filas.length)}
      <div class="movCardList">${filas.map(pendienteCardHtml_).join("")}</div>
    </section>`).join("");
}

function pendienteCardHtml_(r) {
  const vin = escapeHtml(r.vin);
  return `
    <div class="movCard movPendienteCard${r.observacion ? " movCard--obs" : ""}" id="movPCard_${vin}">
      <div class="movCardTop">
        <span class="movVin">${vin}</span>
        ${ubicHtml_(r.ubicacion)}
      </div>
      <div class="movObsSlot" id="movObsSlot_${vin}">${obsHtml_(r)}</div>
      <div class="movPendienteConfirmRow" id="movPConfirm_${vin}" style="display:none;">
        <span class="movConfirmQ">¿Confirmar ingreso a GLP?</span>
        <div class="movBtnPair">
          <button class="movBtnPrimary movBtnConfirmarIngreso" data-vin="${vin}" type="button">${icon("check", 16)} Sí, confirmar</button>
          <button class="movBtnGhost movBtnCancelarIngreso" data-vin="${vin}" type="button">No</button>
        </div>
      </div>
      <div class="movBtnPair movPendienteActions">
        <button class="movBtnRegistrarPendiente" data-vin="${vin}" type="button">
          ${icon("trayIn", 16)} Registrar ingreso
        </button>
        ${r.observacion ? "" : `<button class="movObsAddBtn" data-obs-vin="${vin}" type="button" title="Anotar por qué no se ha traído">${icon("note", 16)} Nota</button>`}
      </div>
    </div>`;
}

/** La observación guardada: se toca para editarla. */
function obsHtml_(r) {
  const o = r.observacion;
  if (!o?.texto) return "";
  const quien = [o.por, o.at ? `${fmtDate_(o.at)}` : ""].filter(Boolean).join(" · ");
  return `
    <button class="movObs" data-obs-vin="${escapeHtml(r.vin)}" type="button" title="Editar observación">
      <span class="movObsIcon" aria-hidden="true">${icon("note", 16)}</span>
      <span class="movObsBody">
        <span class="movObsText">${escapeHtml(o.texto)}</span>
        ${quien ? `<span class="movObsBy">${escapeHtml(quien)}</span>` : ""}
      </span>
      <span class="movObsEdit" aria-hidden="true">${icon("pencil", 14)}</span>
    </button>`;
}

function applyPendientesFiltro_(q) {
  _pendientesFiltro = String(q || "").toUpperCase().trim();
  const filtered = _pendientesFiltro
    ? _pendientesRows.filter(r =>
        r.vin.includes(_pendientesFiltro) ||
        (r.ubicacion || "").toUpperCase().includes(_pendientesFiltro) ||
        (r.observacion?.texto || "").toUpperCase().includes(_pendientesFiltro)
      )
    : _pendientesRows;
  renderPendientesBody_(filtered);
}

// ─── Observaciones (por qué un carro de la lista no se ha traído) ──────

const OBS_RAPIDAS = ["Desarmado", "En otra zona", "No ubicado", "Lo tiene otra área"];
let _obsEditVin = null;
let _pendientesDirty = false;

function openObsEditor_(vin) {
  if (_obsEditVin && _obsEditVin !== vin) closeObsEditor_();
  const slot = document.getElementById(`movObsSlot_${vin}`);
  if (!slot) return;
  _obsEditVin = vin;
  const actual = _pendientesRows.find(r => r.vin === vin)?.observacion?.texto || "";
  document.querySelector(`#movPCard_${CSS.escape(vin)} .movObsAddBtn`)?.setAttribute("hidden", "");
  slot.innerHTML = `
    <div class="movObsEditor">
      <div class="movObsQuick">
        ${OBS_RAPIDAS.map(t => `<button type="button" class="movObsQuickBtn" data-obs-quick="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
      </div>
      <input class="movObsInput" type="text" maxlength="200" value="${escapeHtml(actual)}"
        placeholder="¿Por qué no se ha traído?" autocomplete="off" />
      <div class="movObsErr" aria-live="polite"></div>
      <div class="movBtnPair">
        <button type="button" class="movBtnPrimary movObsSave" data-vin="${escapeHtml(vin)}">Guardar</button>
        ${actual ? `<button type="button" class="movBtnGhost movBtnGhost--danger movObsDel" data-vin="${escapeHtml(vin)}" title="Borrar observación">${icon("trash", 16)}</button>` : ""}
        <button type="button" class="movBtnGhost movObsCancel">Cancelar</button>
      </div>
    </div>`;
  const inp = slot.querySelector(".movObsInput");
  inp?.focus();
  inp?.setSelectionRange?.(inp.value.length, inp.value.length);
}

function closeObsEditor_() {
  _obsEditVin = null;
  // Repinta siempre: además de lo que el poll dejó pendiente, devuelve la
  // tarjeta abierta a su estado normal (nota guardada o botón "Nota").
  applyPendientesFiltro_(_pendientesFiltro);
}

async function saveObs_(vin, texto) {
  const slot = document.getElementById(`movObsSlot_${vin}`);
  const errEl = slot?.querySelector(".movObsErr");
  const btn = slot?.querySelector(".movObsSave");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  try {
    const j = await postJSON("/api/movilizador/observacion", { vin, texto, usuario: getMovNombre_() });
    if (!j?.ok) throw new Error(j?.error || "No se pudo guardar");
    const row = _pendientesRows.find(r => r.vin === vin);
    if (row) row.observacion = j.observacion || null;
    saveListaCache_(_pendientesRows);
    closeObsEditor_();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    if (errEl) errEl.textContent = navigator.onLine ? (e.message || "Error") : "Sin conexión — no se guardó.";
  }
}

function bindObs_() {
  const screen = document.getElementById("movScreenLista");
  if (!screen || screen.dataset.obsBound) return;
  screen.dataset.obsBound = "1";

  screen.addEventListener("click", e => {
    const abrir = e.target.closest("[data-obs-vin]");
    if (abrir) { openObsEditor_(abrir.dataset.obsVin); return; }
    const quick = e.target.closest("[data-obs-quick]");
    if (quick) {
      const inp = quick.closest(".movObsEditor")?.querySelector(".movObsInput");
      if (inp) { inp.value = quick.dataset.obsQuick; inp.focus(); }
      return;
    }
    const save = e.target.closest(".movObsSave");
    if (save) {
      const inp = save.closest(".movObsEditor")?.querySelector(".movObsInput");
      saveObs_(save.dataset.vin, inp?.value || "").catch(() => {});
      return;
    }
    const del = e.target.closest(".movObsDel");
    if (del) { saveObs_(del.dataset.vin, "").catch(() => {}); return; }
    if (e.target.closest(".movObsCancel")) closeObsEditor_();
  });

  screen.addEventListener("keydown", e => {
    if (!e.target.classList?.contains("movObsInput")) return;
    if (e.key === "Enter") { e.preventDefault(); saveObs_(_obsEditVin, e.target.value).catch(() => {}); }
    else if (e.key === "Escape") closeObsEditor_();
  });
}

function downloadListaPendientes_() {
  if (!_pendientesRows.length) {
    const s = document.getElementById("movStatus");
    if (s) s.textContent = "Sin datos para descargar.";
    return;
  }
  exportCsv_({
    filename: `pendientes_glp_${new Date().toISOString().slice(0, 10)}.csv`,
    headers: ["VIN", "FECHA", "UBICACION"],
    rows: _pendientesRows.map(r => [r.vin, r.fecha || "", r.ubicacion || ""]),
  });
}

function showPendienteConfirmRow_(vin) {
  const row = document.getElementById(`movPConfirm_${vin}`);
  const btn = document.querySelector(`#movPCard_${vin} .movBtnRegistrarPendiente`);
  if (row) row.style.display = "";
  if (btn) btn.style.display = "none";
  // Auto-cancel after 8 s if user doesn't act
  setTimeout(() => hidePendienteConfirmRow_(vin), 8000);
}

function hidePendienteConfirmRow_(vin) {
  const row = document.getElementById(`movPConfirm_${vin}`);
  const btn = document.querySelector(`#movPCard_${vin} .movBtnRegistrarPendiente`);
  if (row) row.style.display = "none";
  if (btn) btn.style.display = "";
}

async function confirmarIngresoPendiente_(vin) {
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;

  const btnConfirm = document.querySelector(`.movBtnConfirmarIngreso[data-vin="${CSS.escape(vinClean)}"]`);
  const statusEl = document.getElementById("movStatus");

  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = "Guardando…"; }

  if (!navigator.onLine) {
    addToOfflineQueue_(vinClean);
    hidePendienteConfirmRow_(vinClean);
    if (statusEl) statusEl.textContent = `📶 Sin conexión — ${vinClean} guardado localmente.`;
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "Sí, confirmar"; }
    return;
  }

  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin: vinClean,
      accion: "REGISTRAR_ENTRADA",
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");
    removeFromOfflineQueue_(vinClean);
    if (statusEl) statusEl.textContent = `✓ ${vinClean} registrado en GLP.`;
    await refreshAll_();
    // Preguntar zona al movilizador (dismissible)
    promptZonaForVin(vinClean, async () => {
      if (_zonasMapa) await _zonasMapa.refresh();
    });
  } catch (e) {
    // Network failure → save offline
    if (!navigator.onLine || /fetch|network|failed/i.test(e.message)) {
      addToOfflineQueue_(vinClean);
      hidePendienteConfirmRow_(vinClean);
      if (statusEl) statusEl.textContent = `📶 Sin conexión — ${vinClean} guardado localmente.`;
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "Sí, confirmar"; }
    } else {
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "Sí, confirmar"; }
      if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    }
  }
}

// QR for pendientes: show result card
function showPendientesQrCard_(vin) {
  const vinClean = String(vin || "").trim().toUpperCase();
  const card = document.getElementById("movPendientesQrCard");
  const vinEl = document.getElementById("movPendientesQrVin");
  const ubicEl = document.getElementById("movPendientesQrUbic");
  const msgEl = document.getElementById("movPendientesQrMsg");
  const confirmBtns = document.getElementById("movPendientesQrConfirmBtns");
  const confirmBtn = document.getElementById("btnMovPendientesConfirmarQr");
  if (!card) return;

  const found = _pendientesRows.find(r => r.vin === vinClean);

  if (vinEl) vinEl.textContent = vinClean;
  if (ubicEl) ubicEl.textContent = ubicCorta_(found?.ubicacion);
  if (msgEl) msgEl.textContent = found
    ? (found.observacion?.texto ? `Nota: ${found.observacion.texto}` : "")
    : "Este VIN no está en la lista de pendientes.";
  if (msgEl) msgEl.classList.toggle("movPendientesQrMsg--err", !found);
  if (confirmBtns) confirmBtns.style.display = found ? "" : "none";
  if (confirmBtn) confirmBtn.dataset.vin = vinClean;

  card.style.display = "";

  // Scroll to card
  setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
}

function hidePendientesQrCard_() {
  const card = document.getElementById("movPendientesQrCard");
  if (card) card.style.display = "none";
}

async function confirmarIngresoPendienteQr_() {
  const btn = document.getElementById("btnMovPendientesConfirmarQr");
  const vin = btn?.dataset?.vin;
  if (!vin) return;
  hidePendientesQrCard_();
  // Re-use the same confirm logic; pass a temporary button element
  const tmpBtn = { disabled: false, textContent: "" };
  await confirmarIngresoPendiente_(vin);
}

let _list2Rows = [];
let _calibFiltro = "";
let _list3Rows = [];

/**
 * renderList2_ — Pendientes de calibración: convertidos y sin calidad.
 *
 * Panel de solo lectura. El movilizador dejó de registrar el traslado a zona
 * de espera, así que aquí no hay nada que pulsar: el carro entra cuando su
 * conversión termina y sale cuando calidad le abre su OT.
 *
 * Dos relojes por carro. El de conversión es el que importa para calidad; el
 * de ingreso delata al que lleva semanas en el taller sin que nadie lo cierre.
 */
function renderList2_(rows) {
  _list2Rows = rows || [];
  // Los badges cuentan SIEMPRE el total, no lo que deja ver la búsqueda: son
  // el aviso de cuántos hay pendientes, no de cuántos se están mirando.
  setBadge_("movBadge2", _list2Rows.length);
  updateHubModuleBadge("MOVILIZADOR", _list2Rows.length);

  // Re-aplicar el filtro actual: el poll repinta cada pocos segundos y sin
  // esto la búsqueda del movilizador se borraría sola mientras escribe.
  applyCalibFiltro_(_calibFiltro);
}

function applyCalibFiltro_(q) {
  _calibFiltro = String(q || "").toUpperCase().trim();
  const filtered = _calibFiltro
    ? _list2Rows.filter(r => r.vin.toUpperCase().includes(_calibFiltro))
    : _list2Rows;
  renderList2Body_(filtered);
}

function renderList2Body_(filtered) {
  const box = document.getElementById("movPanel2Body");
  const subHdr = document.getElementById("movCalibSubHdr");

  const total = _list2Rows.length;
  if (subHdr) {
    if (!total) {
      subHdr.textContent = "";
    } else if (_calibFiltro && filtered.length !== total) {
      subHdr.textContent = `${filtered.length} de ${total} pendiente${total !== 1 ? "s" : ""}`;
    } else {
      subHdr.textContent = `${total} pendiente${total !== 1 ? "s" : ""} de calibración`;
    }
  }

  if (!box) return;

  if (!filtered.length) {
    box.innerHTML = `<div class="movEmpty">${
      total ? "Ningún VIN coincide con la búsqueda." : "Ningún vehículo pendiente de calibración."
    }</div>`;
    return;
  }

  // Ya vienen ordenados del backend: el que terminó su conversión hace más
  // tiempo primero — el que lleva más esperando calidad.

  box.innerHTML = `
    <div class="movCardList">
      ${filtered.map(r => {
        const diasConv = diasDesde_(r.fecha_conversion);
        const diasEnt  = diasDesde_(r.fecha_entrada);
        return `
        <div class="movCard">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            ${diasConv !== null ? badgeDias_(diasConv) : ""}
          </div>
          <div class="movTimeline">
            <div class="movTimelineRow">
              <span class="movTimelineIcon" aria-hidden="true">${icon("trayIn", 14)}</span>
              <span class="movTimelineLabel">Ingreso</span>
              ${diasEnt !== null
                ? `<span class="movFecha">${fmtDate_(r.fecha_entrada)}</span><span class="movPor">${plDias_(diasEnt)} en el taller</span>`
                : `<span class="movCardNoReg">Sin registro</span>`}
            </div>
            ${diasConv !== null ? `
            <div class="movTimelineRow">
              <span class="movTimelineIcon" aria-hidden="true">${icon("wrench", 14)}</span>
              <span class="movTimelineLabel">Conversión</span>
              <span class="movFecha">${fmtDate_(r.fecha_conversion)}</span>
            </div>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}

function renderList3_(rows) {
  _list3Rows = rows || [];
  // Actualizar el set de VINs sin OT para que el re-validador de 8 min los recoja
  _vinsSinOT_ = new Set((rows || []).filter(r => !r.tiene_ot).map(r => r.vin));
  const box = document.getElementById("movPanel3Body");
  if (!box) return;
  setBadge_("movBadge3", rows.length);

  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty">No hay vehículos con revisión técnica finalizada.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="movCardList">
      ${rows.map(r => `
        <div class="movCard">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            ${r.destino ? ubicHtml_(r.destino) : `<span class="movChip">Sin destino</span>`}
          </div>
          <div class="movCardMeta">
            <span class="movTimelineLabel">Calidad</span>
            <span class="movFecha">${fmtDate_(r.fecha_calidad)}</span>
          </div>
          ${!r.tiene_ot
            ? `<div class="movOtWarn">${icon("alertTriangle", 15)} Falta #OT — regístrelo en ASIGNACIONES (col E) antes de confirmar</div>`
            : ""}
          <button class="movBtnAction btnConfirmarSalida movBtnPrimary"
            data-vin="${escapeHtml(r.vin)}" type="button"
            ${!r.tiene_ot ? 'disabled title="Registre el #OT en ASIGNACIONES primero"' : ''}>
            ${r.tiene_ot ? `Confirmar salida ${icon("chevronRight", 16)}` : "Sin #OT"}
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Fetch ────────────────────────────────────────────────────────────

/**
 * refreshAll_ — recarga las cuatro listas.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.fresh]  saltar el cache del servidor. Lo usa el botón
 *   "↻ Actualizar": el refresco automático se sirve del cache (esta vista es la
 *   más cara del sistema y a 30 s se comía el egress del plan), pero cuando el
 *   movilizador duda de lo que ve tiene que poder exigir la lectura real.
 */
async function refreshAll_({ fresh = false } = {}) {
  const statusEl = document.getElementById("movStatus");
  const refreshBtn = document.getElementById("btnMovRefresh");
  try {
    if (statusEl) statusEl.textContent = "Actualizando…";
    if (refreshBtn) refreshBtn.disabled = true;

    // Drain offline queue first (if online)
    await drainOfflineQueue_();

    const q = fresh ? "?fresh=1" : "";
    const [j, jPend] = await Promise.all([
      getJSON(`/api/movilizador/status${q}`),
      getJSON(`/api/movilizador/pendientes${q}`),
    ]);
    if (!j?.ok) throw new Error(j?.error || "Error cargando estado");

    renderPendientesRegistrar_(jPend?.sin_registrar || []);
    saveListaCache_(jPend?.sin_registrar || []);
    hideCacheBanner_();
    updateGuardarBtn_(new Date().toISOString());
    renderList0_(j.list0 || []);
    renderList2_(j.list2 || []);
    renderList3_(j.list3 || []);
    renderOlvidados_(j.olvidados || []);

    if (statusEl) {
      const t = new Date();
      statusEl.textContent = `Actualizado ${t.toLocaleTimeString("es-PE")}`;
    }
  } catch (e) {
    // Si falla la red, cargar la lista desde caché
    const cache = loadListaCache_();
    if (cache?.rows) {
      renderPendientesRegistrar_(cache.rows);
      showCacheBanner_(cache.savedAt);
    }
    if (statusEl) statusEl.textContent = navigator.onLine ? (e.message || "Error") : "📶 Sin conexión";
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// ─── Actions ──────────────────────────────────────────────────────────

async function handleAction_(vin, accion, btn, onSuccess) {
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.textContent = "Guardando…";
  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin,
      accion,
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");
    if (onSuccess) onSuccess(vin);
    await refreshAll_();
    return true;
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    return false;
  }
}

// ─── Tab switching ────────────────────────────────────────────

function showMovHub_() {
  if (_obsEditVin) closeObsEditor_();
  document.getElementById("movHub").style.display = "";
  document.querySelectorAll("#viewMOVILIZADOR .movScreen")
    .forEach(s => { s.style.display = "none"; });
}

function showMovPanel_(screenId) {
  document.getElementById("movHub").style.display = "none";
  document.querySelectorAll("#viewMOVILIZADOR .movScreen").forEach(s => {
    s.style.display = s.id === screenId ? "" : "none";
  });
}

function initMovCards_() {
  const grid = document.getElementById("movCardGrid");
  if (!grid || grid.dataset.inited) return;
  grid.dataset.inited = "1";

  // Back buttons (delegated)
  document.addEventListener("click", e => {
    if (e.target.closest(".movBackBtn")) showMovHub_();
  });

  // Update greeting
  const greetEl = document.getElementById("movGreeting");
  if (greetEl) {
    const nombre = getMovNombre_();
    greetEl.textContent = nombre && nombre !== "Movilizador" ? `Hola, ${nombre.split(" ")[0]}` : "Bienvenido";
  }
  renderUserAvatar(document.getElementById("movAvatar"));

  const cards = [
    {
      key: "Lista", icon: "clipboardList", label: "Lista del día",
      desc: "Carros por traer y sus notas",
      tone: "var(--tone-slate)",
      badges: [{ id: "movBadgeLista", type: "Warn" }],
    },
    {
      key: "Ingreso", icon: "trayIn", label: "Ingreso",
      desc: "Registrar entrada de vehículos al taller",
      tone: "var(--tone-amber)",
      badges: [
        { id: "movBadge0",     type: "Warn", title: "En espera de conversión" },
        { id: "movBadge0conv", type: "Note", title: "En conversión" },
      ],
    },
    {
      key: "Espera", icon: "clock", label: "Calibración",
      desc: "Convertidos · falta calidad",
      tone: "var(--tone-blue)",
      badges: [{ id: "movBadge2", type: "Warn" }],
    },
    {
      key: "Salida", icon: "trayOut", label: "Salida",
      desc: "Confirmar salida y registrar en GPS",
      tone: "var(--tone-lime)",
      badges: [{ id: "movBadge3", type: "Ok" }],
    },
    {
      key: "Mapa", icon: "map", label: "Mapa de Zonas",
      desc: "Estado en tiempo real de las 15 zonas",
      tone: "var(--tone-violet)",
      badges: [{ id: "movBadgeMapa", type: "Ok", title: "Listos para sacar" }],
    },
  ];

  cards.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "hubCard";
    btn.dataset.movCard = c.key.toLowerCase();
    btn.style.setProperty("--tone", c.tone);

    // Envueltos en una fila: sueltos, cada uno caía en la misma esquina
    // absoluta y los dos números de Ingreso quedaban uno encima del otro.
    const badgesHTML = c.badges.length
      ? `<span class="hubCardBadges">${c.badges.map(b =>
          `<span id="${b.id}" class="movBadge movBadge${b.type}" title="${escapeHtml(b.title || "")}" style="display:none;"></span>`
        ).join("")}</span>`
      : "";

    btn.innerHTML = `
      <span class="hubCardIcon" aria-hidden="true">${icon(c.icon, 22)}</span>
      <div class="hubCardText">
        <div class="hubCardName">${c.label}</div>
        <div class="hubCardDesc">${c.desc}</div>
      </div>
      ${badgesHTML}
      <span class="hubCardArrow" aria-hidden="true">${icon("chevronRight", 18)}</span>
    `;

    btn.addEventListener("click", () => showMovPanel_(`movScreen${c.key}`));
    grid.appendChild(btn);
  });
}

// ─── Panel toggle ─────────────────────────────────────────────────────

function bindPanelToggles_() {
  document.querySelectorAll(".movPanel").forEach(panel => {
    const hdr = panel.querySelector(".movPanelHeader");
    const body = panel.querySelector(".movPanelBody");
    if (!hdr || !body) return;
    hdr.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      hdr.setAttribute("aria-expanded", String(open));
    });
  });
}


// ─── QR Scanner ────────────────────────────────────────────────────────

const movScanner_ = createScanner("movQrReader");
let movQrTarget_ = null; // "entrada" | "salida"
let _salidaQrDismiss = null;

function movQrModal_() { return document.getElementById("movQrModal"); }

async function openMovQr_(target) {
  movQrTarget_ = target;
  const modal = movQrModal_();
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("show");
  const msg = document.getElementById("movQrMsg");
  try {
    await movScanner_.start({
      mode: "QR",
      msgEl: msg,
      onDecoded: async (code) => {
        const tgt = movQrTarget_;
        await closeMovQr_();
        if (tgt === "salida") {
          const salidaInp = document.getElementById("movSalidaVinSearch");
          if (salidaInp) salidaInp.value = String(code || "").toUpperCase();
          showSalidaQrResult_(code);
        } else if (tgt === "pendientes") {
          showPendientesQrCard_(code);
        } else {
          // entrada
          const inp = document.getElementById("movVinEntrada");
          if (inp) {
            inp.value = code;
            inp.dispatchEvent(new Event("input"));
          }
          const btn = document.getElementById("btnMovRegistrarEntrada");
          if (btn) btn.disabled = code.length < 7;
        }
      },
    });
  } catch { /* mensaje ya mostrado en msgEl */ }
}

// ─── Salida QR result ───────────────────────────────────────────────────

// Cada escaneo se numera: si llega la respuesta de un VIN anterior cuando ya
// se escaneó otro, se descarta en vez de pintar encima.
let _salidaQrSeq = 0;

/** Pinta el resultado. `tono`: ok | wait | err | done. */
function paintSalidaQr_({ vin, destino, tono, meta = "", confirmar = false, gps = false }) {
  const panel = document.getElementById("movSalidaQrResult");
  if (!panel) return;
  panel.dataset.tono = tono;

  const vinEl = document.getElementById("movSalidaQrResultVin");
  if (vinEl) vinEl.textContent = vin;
  const destEl = document.getElementById("movSalidaQrResultDestino");
  if (destEl) {
    destEl.textContent = destino;
    destEl.className = `movSalidaQrResultDestino movSalidaQrDestino--${tono}`;
  }
  const metaEl = document.getElementById("movSalidaQrResultMeta");
  if (metaEl) metaEl.textContent = meta;

  const confirmBtn = document.getElementById("btnMovConfirmarSalidaQr");
  if (confirmBtn) {
    confirmBtn.dataset.vin = vin;
    confirmBtn.style.display = confirmar ? "" : "none";
    confirmBtn.disabled = false;
  }
  const gpsBtn = document.getElementById("btnMovGpsSalidaQr");
  if (gpsBtn) {
    gpsBtn.dataset.vin = vin;
    gpsBtn.style.display = gps ? "" : "none";
  }

  panel.style.display = "block";
  clearTimeout(_salidaQrDismiss);
  _salidaQrDismiss = setTimeout(() => closeSalidaQrResult_(), 30_000);
}

function showSalidaQrResult_(vin) {
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;
  const seq = ++_salidaQrSeq;

  const row = _list3Rows.find(r => r.vin === vinClean);
  if (row) {
    if (!row.tiene_ot) {
      paintSalidaQr_({ vin: vinClean, tono: "err", destino: "Falta #OT", meta: "Regístrelo en ASIGNACIONES (col E) antes de confirmar" });
    } else if (row.destino) {
      paintSalidaQr_({ vin: vinClean, tono: "ok", destino: `Sale a ${ubicCorta_(row.destino)}`, confirmar: true });
    } else {
      paintSalidaQr_({ vin: vinClean, tono: "wait", destino: "Destino pendiente", confirmar: true });
    }
    return;
  }

  // No está en la lista: puede que ya se haya entregado (por ejemplo, porque
  // alguien marcó la salida de este carro creyendo que era otro). Se pregunta
  // al servidor en vez de decir solo "no está".
  paintSalidaQr_({ vin: vinClean, tono: "wait", destino: "Buscando…" });
  getJSON(`/api/movilizador/vin-salida?vin=${encodeURIComponent(vinClean)}`)
    .then(j => {
      if (seq !== _salidaQrSeq) return;
      if (j?.ok && j.entregado) {
        const ubic = ubicCorta_(j.ubicacion);
        const meta = [
          j.entregado_por ? `Salida marcada por ${j.entregado_por}` : "Salida marcada",
          j.entregado_at ? fmtDate_(j.entregado_at) : "",
        ].filter(Boolean).join(" · ");
        paintSalidaQr_({
          vin: vinClean, tono: "done", gps: true, meta,
          destino: ubic ? `Vehículo entregado a ${ubic}` : "Vehículo entregado",
        });
      } else {
        paintSalidaQr_({
          vin: vinClean, tono: "err", destino: "No está en la lista de salida",
          meta: j?.ok && j.estado ? `Estado actual: ${String(j.estado).replace(/_/g, " ").toLowerCase()}` : "",
        });
      }
    })
    .catch(() => {
      if (seq !== _salidaQrSeq) return;
      paintSalidaQr_({ vin: vinClean, tono: "err", destino: "No está en la lista de salida", meta: navigator.onLine ? "" : "Sin conexión" });
    });
}

function closeSalidaQrResult_() {
  clearTimeout(_salidaQrDismiss);
  _salidaQrSeq++;
  const panel = document.getElementById("movSalidaQrResult");
  if (panel) panel.style.display = "none";
  const inp = document.getElementById("movSalidaVinSearch");
  if (inp) inp.value = "";
}

async function closeMovQr_() {
  await movScanner_.stop().catch(() => {});
  const modal = movQrModal_();
  if (!modal) return;
  modal.classList.remove("show");
  modal.style.display = "none";
}

// ─── GPS + Registro ────────────────────────────────────────────────────

function getGpsUrl_(vin) {
  return `${GPS_URL}?vin=${encodeURIComponent(vin)}`;
}

function copyVinToClipboard_(vin) {
  try {
    navigator.clipboard.writeText(vin).catch(() => {});
  } catch {}
}

// Siempre la MISMA pestaña para la app GPS, no una nueva por registro. La app
// GPS no es nuestra y prende la cámara (lector QR) al cargar y cada vez que su
// pestaña vuelve a verse; con `_blank` el celular acababa el turno con decenas
// de pestañas así, cada una reactivando la cámara al cruzarse con ella. Con un
// nombre fijo el navegador reutiliza la que ya existe.
const GPS_TAB = "glpGpsTab";

function prepareGpsWindow_(vin) {
  copyVinToClipboard_(vin);
  const popup = window.open("about:blank", GPS_TAB);
  if (!popup) return null;

  try {
    popup.opener = null;
    popup.document.title = "Registrando salida...";
    popup.document.body.innerHTML = "<p style=\"font-family:system-ui,sans-serif;padding:16px;\">Guardando salida...</p>";
  } catch {}

  return popup;
}

function openGpsWithVin_(vin, popup) {
  const url = getGpsUrl_(vin);
  copyVinToClipboard_(vin);

  if (popup && !popup.closed) {
    try {
      popup.location.replace(url);
      return;
    } catch {}
  }

  // Sin "noopener": con él el navegador ignora el nombre y abre otra pestaña.
  // El opener se corta a mano, que es lo que "noopener" protegía.
  const opened = window.open(url, GPS_TAB);
  if (opened) { try { opened.opener = null; } catch {} }
  else window.location.href = url;
}

async function handleConfirmarSalida_(vin, btn) {
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;

  // El popup se abre ANTES del await a propósito (ver prepareGpsWindow_). Si
  // el movilizador apagó la redirección no se abre nada: ni ventana en blanco.
  const redir = getRedir_();
  const popup = redir ? prepareGpsWindow_(vinClean) : null;
  const ok = await handleAction_(vinClean, "ENTREGAR_FINAL", btn, () => {
    if (redir) openGpsWithVin_(vinClean, popup);
  });

  if (!ok && popup && !popup.closed) {
    try { popup.close(); } catch {}
  }
}

async function handleRegistro_(vin, accion, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const inputId = accion === "REGISTRAR_ENTRADA" ? "movVinEntrada" : "movVinSalida";
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;

  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin: vinClean,
      accion,
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");

    // La app GPS solo si esta pantalla la tiene encendida. El aviso cambia con
    // ella: prometer "VIN copiado" sin haber copiado nada manda al movilizador
    // a pegar en una app que ni llegó a abrirse.
    const redir = getRedir_();
    if (redir) openGpsWithVin_(vinClean);

    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = redir
      ? `✓ ${vinClean} registrado. VIN copiado — pégalo en la app GPS.`
      : `✓ ${vinClean} registrado.`;

    // Clear input and disable button
    const inputEl = document.getElementById(inputId);
    if (inputEl) { inputEl.value = ""; inputEl.dispatchEvent(new Event("input")); }
    btn.disabled = true;
    btn.innerHTML = original;

    await refreshAll_();
    if (accion === "REGISTRAR_ENTRADA") {
      promptZonaForVin(vinClean, async () => {
        if (_zonasMapa) await _zonasMapa.refresh();
      });
    }
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = original;
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
  }
}

// ─── Poll ─────────────────────────────────────────────────────────────

// Re-valida solo los VINs que siguen con "falta OT" sin hacer un refresh completo.
// Si alguno ya tiene OT en la DB, dispara un refreshAll_ para actualizar el panel.
async function revalidarOTFaltante_() {
  if (!_vinsSinOT_.size) return;
  try {
    const vinsParam = [..._vinsSinOT_].join(",");
    const j = await getJSON(`/api/movilizador/revalidate-ot?vins=${encodeURIComponent(vinsParam)}`);
    if (j?.ok && j.vins_con_ot?.length) {
      // Al menos un VIN ya tiene OT — refrescar para que el panel lo muestre
      await refreshAll_();
    }
  } catch { /* silencioso, el próximo ciclo lo reintentará */ }
}

function startPoll_() {
  // Intervalos gobernados por /api/config; se pausan en background (core/poll.js)
  startPoll("POLL_MOVILIZADOR_MS", () => refreshAll_().catch(() => {}), { immediate: false });
  startPoll("POLL_OT_RECHECK_MS",  () => revalidarOTFaltante_().catch(() => {}), { immediate: false });
}

function stopPoll_() {
  stopPoll("POLL_MOVILIZADOR_MS");
  stopPoll("POLL_OT_RECHECK_MS");
}

// ─── Public API ───────────────────────────────────────────────────────

export function init() {
  document.getElementById("btnMovRefresh")?.addEventListener("click", () => {
    refreshAll_({ fresh: true }).catch(() => {});
  });

  // VIN Autocomplete for Entrada
  createVinSuggest_({
    input: "movVinEntrada", box: "movVinEntradaSuggest",
    min: 1, debounce: 220, limit: 12,
    onPick: item => {
      const inp = document.getElementById("movVinEntrada");
      if (inp) inp.value = item.vin;
      const btn = document.getElementById("btnMovRegistrarEntrada");
      if (btn) btn.disabled = item.vin.length < 7;
    },
  }).bind();
  document.getElementById("movVinEntrada")?.addEventListener("input", function () {
    const btn = document.getElementById("btnMovRegistrarEntrada");
    if (btn) btn.disabled = this.value.trim().length < 7;
  });

  // VIN Autocomplete for Salida
  createVinSuggest_({
    input: "movSalidaVinSearch", box: "movSalidaVinSuggest",
    min: 1, debounce: 220, limit: 12,
    onPick: item => {
      const inp = document.getElementById("movSalidaVinSearch");
      if (inp) inp.value = item.vin;
      showSalidaQrResult_(item.vin);
    },
  }).bind();
  // Auto-buscar cuando el input alcanza 17 chars (VIN completo) — cubre scanners Bluetooth
  // y Enter al final del código. Sin esto el usuario necesita seleccionar del dropdown.
  document.getElementById("movSalidaVinSearch")?.addEventListener("input", function () {
    const v = this.value.trim().toUpperCase();
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) showSalidaQrResult_(v);
  });
  document.getElementById("movSalidaVinSearch")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.defaultPrevented) {
      const v = this.value.trim().toUpperCase();
      if (v.length >= 7) showSalidaQrResult_(v);
    }
  });

  // Sí / No de la app GPS. Delegado en document: el mismo handler sirve a los
  // dos segmentados y setRedir_ repinta ambos, así que tocar el de Entrada
  // deja el de Salida ya movido cuando el movilizador llegue a esa pantalla.
  document.addEventListener("click", e => {
    const opt = e.target.closest?.(".movRedirOpt");
    if (opt) setRedir_(opt.dataset.val === "1");
  });

  // QR scanner buttons
  document.getElementById("btnMovQrEntrada")?.addEventListener("click",    () => openMovQr_("entrada").catch(() => {}));
  document.getElementById("btnMovQrSalida")?.addEventListener("click",     () => openMovQr_("salida").catch(() => {}));
  document.getElementById("btnMovQrPendientes")?.addEventListener("click", () => openMovQr_("pendientes").catch(() => {}));

  // Guardar lista en caché del celular
  document.getElementById("btnMovGuardarLista")?.addEventListener("click", () => {
    if (!_pendientesRows.length) {
      const s = document.getElementById("movStatus");
      if (s) s.textContent = "Sin datos para guardar.";
      return;
    }
    saveListaCache_(_pendientesRows);
    updateGuardarBtn_(new Date().toISOString());
    const s = document.getElementById("movStatus");
    if (s) s.textContent = `💾 Lista guardada (${_pendientesRows.length} VINs) — disponible sin conexión.`;
  });

  // Al abrir: cargar cache si existe
  const initCache = loadListaCache_();
  if (initCache?.rows?.length) {
    renderPendientesRegistrar_(initCache.rows);
    updateGuardarBtn_(initCache.savedAt);
  }
  document.getElementById("movPendientesSearch")?.addEventListener("input", e => {
    applyPendientesFiltro_(e.target.value);
  });

  // Búsqueda en Pendientes de Calibración. El autocompletado consulta todos
  // los VIN, no solo los de la lista: elegir uno que no esté pendiente deja la
  // lista vacía con el aviso, que ya responde la pregunta de si está ahí.
  createVinSuggest_({
    input: "movCalibSearch", box: "movCalibSuggest",
    min: 1, debounce: 220, limit: 12,
    onPick: item => {
      const inp = document.getElementById("movCalibSearch");
      if (inp) inp.value = item.vin;
      applyCalibFiltro_(item.vin);
    },
  }).bind();
  document.getElementById("movCalibSearch")?.addEventListener("input", e => {
    applyCalibFiltro_(e.target.value);
  });


  document.getElementById("btnMovCloseQr")?.addEventListener("click",   () => closeMovQr_().catch(() => {}));
  document.getElementById("movQrModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("movQrModal")) closeMovQr_().catch(() => {});
  });
  document.getElementById("btnMovCloseSalidaQr")?.addEventListener("click", () => closeSalidaQrResult_());

  // Confirmar salida desde resultado QR (delegado al handler existente)
  document.getElementById("btnMovConfirmarSalidaQr")?.addEventListener("click", function () {
    const vin = this.dataset.vin;
    if (!vin) return;
    closeSalidaQrResult_();
    handleConfirmarSalida_(vin, this).catch(() => {});
  });

  // VIN ya entregado: abrir la app GPS para registrar dónde quedó
  document.getElementById("btnMovGpsSalidaQr")?.addEventListener("click", function () {
    const vin = this.dataset.vin;
    if (!vin) return;
    openGpsWithVin_(vin);
    const s = document.getElementById("movStatus");
    if (s) s.textContent = `${vin} copiado — pégalo en la app GPS.`;
  });

  // Pendientes: QR confirm + cancel
  document.getElementById("btnMovPendientesConfirmarQr")?.addEventListener("click", () =>
    confirmarIngresoPendienteQr_().catch(() => {})
  );
  document.getElementById("btnMovPendientesCancelarQr")?.addEventListener("click", hidePendientesQrCard_);

  // Pendientes: delegación para botones en la lista
  document.getElementById("viewMOVILIZADOR")?.addEventListener("click", e => {
    const btn = e.target.closest(".movBtnRegistrarPendiente");
    if (btn) { showPendienteConfirmRow_(btn.dataset.vin); return; }
    const conf = e.target.closest(".movBtnConfirmarIngreso");
    if (conf) { confirmarIngresoPendiente_(conf.dataset.vin).catch(() => {}); return; }
    const canc = e.target.closest(".movBtnCancelarIngreso");
    if (canc) { hidePendienteConfirmRow_(canc.dataset.vin); return; }
  });

  // Auto-sync cuando recupera conexión
  window.addEventListener("online", () => {
    drainOfflineQueue_().then(() => refreshAll_()).catch(() => {});
  });

  updateOfflineBanner_();

  // Registro de Entrada button
  document.getElementById("btnMovRegistrarEntrada")?.addEventListener("click", () => {
    const vin = document.getElementById("movVinEntrada")?.value?.trim().toUpperCase() || "";
    if (vin.length >= 7) handleRegistro_(vin, "REGISTRAR_ENTRADA", "btnMovRegistrarEntrada").catch(() => {});
  });

  // Close autocomplete dropdown on outside click
  if (!document.body.dataset.movVinDocBound) {
    document.body.dataset.movVinDocBound = "1";
    document.addEventListener("click", e => {
      const wraps = document.querySelectorAll("#viewMOVILIZADOR .vinWrap");
      const inside = [...wraps].some(w => w.contains(e.target));
      if (!inside) {
        ["movVinEntradaSuggest", "movSalidaVinSuggest"].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
        });
      }
    });
  }

  // Delegación de eventos para botones de acción
  document.getElementById("viewMOVILIZADOR")?.addEventListener("click", e => {
    const btn = e.target.closest(".movBtnAction");
    if (!btn) return;
    const vin = btn.dataset.vin;
    if (!vin) return;
    if (btn.classList.contains("btnConfirmarSalida")) {
      // Confirmar salida: registra ENTREGAR_FINAL + abre app GPS de registro
      handleConfirmarSalida_(vin, btn).catch(() => {});
    }
  });

  initMovCards_();
  bindPanelToggles_();
  bindObs_();

  // Mapa de zonas — se inicializa en enter() para tener nombre correcto del usuario
}

export function enter() {
  // Al entrar y no en init(): init() corre en el bootstrap, cuando la pantalla
  // del movilizador todavía puede no estar en el DOM.
  paintRedir_();
  refreshAll_().catch(() => {});
  startPoll_();
  // Inicializar (o re-inicializar) el mapa de zonas con el nombre actualizado del usuario
  if (!_zonasMapa) {
    _zonasMapa = initZonasMapa("movZonasMapaContainer", {
      readOnly: false,
      onZoneAction: () => refreshAll_().catch(() => {}),
      // Los carros en verde de las 15 zonas en la cartilla del hub: es el
      // número que el movilizador busca para saber si hay algo que sacar sin
      // abrir el mapa. La zona libre no cuenta (llega como enZonaLibre).
      onCounts: ({ finalizados }) => setBadge_("movBadgeMapa", finalizados),
    });
  }
}

export function exit() {
  stopPoll_();
  closeMovQr_().catch(() => {});
  _zonasMapa?.destroy();
  _zonasMapa = null;
}
