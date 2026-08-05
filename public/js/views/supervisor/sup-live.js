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
import { escapeHtml, fmtTiempo_ } from "../../core/format.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { rolMeta, estadoMeta } from "../../core/domain-meta.js";
import { cfg } from "../../core/config.js";
import { relTimeText, startRelTimeTicker, countUp, skeletonHTML } from "../../core/ui-dynamics.js";
import { clasificarDuplas_, renderDuplasPanel_, cumplioMeta_, ROLES_DUPLA } from "./sup-duplas.js";

let liveActive_   = false;
let liveLastData_ = null;   // último fetch, para re-abrir detalle actualizado
let estadoFilter_ = null;   // "TRABAJANDO"|"PAUSADO"|"SIN_INICIAR"|"STALLED"|"META_OK"|null
let rolFilter_    = null;   // "MOTOR"|"TANQUE"|"CALIDAD"|"RAMALERO"|null
let offOpen_      = false;  // bloque "sin actividad hoy" desplegado (sobrevive al polling)

let _prevKpi = { conv: null, cal: null }; // para animar los números al cambiar

const ORDEN_ROLES = ["MOTOR", "TANQUE", "CALIDAD", "RAMALERO"];

// Umbrales de "sin movimiento" (ms)
const STALL_PAUSADO_MS = 40 * 60_000;
const STALL_SIN_INI_MS = 60 * 60_000;

// ── API ───────────────────────────────────────────────────────────────
async function fetchLive_() {
  return getJSON("/api/supervisor/live").catch(() => null);
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
    ${metasHTML_(data)}
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

// ── 1. Meta del día: conversión y calidad ─────────────────────────────
function metasHTML_(data) {
  const v = data.vinsSummary || {};
  const tiles = [
    { id: "liveKpiConv", label: "Conversión", icon: "🔧", done: v.convDone || 0,
      meta: v.metaConv || cfg("META_DIARIA"), curso: v.convActive || 0, track: "var(--track-motor)" },
    { id: "liveKpiCal",  label: "Calidad",    icon: "✅", done: v.calDone || 0,
      meta: v.metaCal || cfg("META_CALIDAD"), curso: v.calActive || 0, track: "var(--track-calidad)" },
  ];

  return `<div class="lvGoals">${tiles.map(t => {
    const meta = Number(t.meta) || 0;
    const pct  = meta > 0 ? Math.min(Math.round(t.done / meta * 100), 100) : 0;
    const done = pct >= 100;
    return `
    <div class="lvGoal${done ? " is-done" : ""}" style="--goalTone:${done ? "var(--dv-good)" : t.track};">
      <div class="lvGoal__head">
        <span class="lvGoal__label">${t.icon} ${escapeHtml(t.label)}</span>
        ${done ? `<span class="lvGoal__flag">META</span>` : `<span class="lvGoal__pct">${pct}%</span>`}
      </div>
      <div class="lvGoal__num">
        <b id="${t.id}">${t.done}</b><span class="lvGoal__of">/ ${meta}</span>
      </div>
      <div class="lvGoal__track"><i style="width:${pct}%;"></i></div>
      <div class="lvGoal__foot">${t.curso > 0 ? `⚙️ ${t.curso} en curso` : "&nbsp;"}</div>
    </div>`;
  }).join("")}</div>`;
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
  const libre   = enMeta && enCurso === 0;

  const asgActual = (t.asignacionesHoy || []).find(a => a.vin === t.vinActivo && a.estado !== "FINALIZADO");
  const tiempo = asgActual?.running_since ? fmtTiempo_(asgActual.tiempo_ms, asgActual.running_since) : "";

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
        ? `<span class="lvVin">${escapeHtml(t.vinActivo)}</span>${t.vinArrastre ? `<span class="lvVin__old" title="Trabajo abierto un día anterior — no suma a la producción de hoy">ayer</span>` : ""}`
        : `<span class="lvVin lvVin--none">sin VIN activo</span>`}
      ${tiempo ? `<span class="lvCard__time">⏱ ${escapeHtml(tiempo)}</span>` : ""}
    </div>

    <div class="lvCard__row lvCard__row--prod">
      ${esConv
        ? `${goalDotsHTML_(cars, metaTec)}<span class="lvCard__cars">${cars}<em>/${metaTec}</em></span>`
        : `<span class="lvCard__cars">🚗 ${cars}<em> hoy</em></span>`}
      ${enCurso > 0 ? `<span class="lvCard__curso">⚙️ ${enCurso}</span>` : ""}
      ${libre ? `<span class="lvCard__free">LIBRE</span>` : enMeta ? `<span class="lvCard__free is-extra">EXTRA</span>` : ""}
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

  if (!asgList.length) {
    body.innerHTML = `<div class="small">Sin asignaciones hoy.</div>`;
  } else {
    // Cerrados hoy primero, luego lo abierto, y el arrastre al final
    const orden = a => (a.estado === "FINALIZADO" ? 0 : a.arrastre ? 2 : 1);
    const filas = [...asgList].sort((a, b) => orden(a) - orden(b));
    const summary = `<div class="lvDetail__sum">
      <span><b>${cars}</b> carro${cars !== 1 ? "s" : ""} cerrado${cars !== 1 ? "s" : ""} hoy</span>
      ${enCurso > 0 ? `<span>⚙️ <b>${enCurso}</b> en curso</span>` : ""}
    </div>`;
    body.innerHTML = summary + filas.map(renderDetailRow_).join("");
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("show");
}

function renderDetailRow_(a) {
  const em  = estadoMeta(a.estado);
  const vin = a.vin || (a.tipo_ramal ? `RAMAL: ${a.tipo_ramal}` : "–");
  const tiempoTotal = fmtTiempo_(a.tiempo_ms, a.estado === "TRABAJANDO" ? a.running_since : null);
  const inicioStr = a.fecha_asignacion ? fmtFechaHora_(a.fecha_asignacion) : null;
  const finStr    = a.estado === "FINALIZADO" && a.updated_at ? fmtFechaHora_(a.updated_at) : null;

  return `
  <div class="lvDetail__row${a.arrastre ? " is-old" : ""}">
    <div class="lvDetail__top">
      <span class="lvDetail__vin">${escapeHtml(vin)}</span>
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

// Formatea ISO → "DD/MM HH:MM" (omite la fecha si es hoy)
function fmtFechaHora_(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayStr   = d.toISOString().slice(0, 10);
  const hhmm     = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(d);
  if (dayStr === todayStr) return hhmm;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
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
