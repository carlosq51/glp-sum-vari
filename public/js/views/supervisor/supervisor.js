// =========================
// public/js/views/supervisor/supervisor.js
// Vista SUPERVISOR (entry): init/enter/exit + fetch + pipeline render
// =========================

import { CORE, getJSON_user, escapeHtml, fmtShort_ } from "../../core/core.js";

import {
  avgRobustWithContextPrior_,
  buildContextStats_,
  getContextPrior_,
  normalizeTrack_,
  normalizeRol_,
  normalizeMarca_,
} from "./sup-stats.js";
import { isFinalizado_, matchMarca_, durationMsFromItem_ } from "./sup-filters.js";
import { groupByVinForUI_ } from "./sup-grouping.js";
import { renderAvgCard_, renderTable_ } from "./sup-render.js";
import { renderTrendChart_, destroyTrendChart_ } from "./sup-trend-chart.js";
import { calculateKPIs_ } from "./sup-kpis.js";
import { renderKPIsPanel_ } from "./sup-kpis-render.js";

import { bindSupIncidencias_ } from "./sup-incidencias.js";
import { bindSupQR_ } from "./sup-qr.js";
import { bindSupNameSuggest_ } from "./sup-name-suggest.js";
import { bindSupVinSuggest_ } from "./sup-vin-suggest.js";
import { bindSupQuickDates_ } from "./sup-quick-dates.js";
import { bindSupPausaIndefinida_ } from "./sup-pausa-indefinida.js";
import { bindSupLive_, enterLive_, exitLive_ } from "./sup-live.js";
import { bindSupUbicaciones_, enterUbicaciones_, exitUbicaciones_ } from "./sup-ubicaciones.js";
import { bindSupIncidenciasReport_, enterIncReport_, exitIncReport_ } from "./sup-incidencias-report.js";

let supTrack = "CONVERSION";
let supTimer = null;
let supActiveTab_ = "LIVE"; // "REPORTE" | "LIVE"
let _lastReportItems_ = [];

function setSupTrack_(t) {
  supTrack = (t === "CALIDAD" || t === "RAMAL") ? t : "CONVERSION";
  document.querySelectorAll("[data-suptrack]").forEach((b) => b.classList.toggle("active", b.dataset.suptrack === supTrack));
  const pill = document.getElementById("supTrackPill");
  if (pill) pill.textContent = supTrack === "CONVERSION" ? "CONVERSIÓN (MOTOR + TANQUE)" : supTrack === "CALIDAD" ? "CALIDAD" : "RAMAL";
  fetchSupervisorReport_().catch(() => {});
}

function supervisorDebounceFetch_() {
  clearTimeout(supTimer);
  supTimer = setTimeout(() => fetchSupervisorReport_().catch(() => {}), 250);
}

async function fetchSupervisorReport_() {
  const name = String(document.getElementById("supName")?.value || "").trim();
  const vin = String(document.getElementById("supVin")?.value || "").trim().toUpperCase();
  const from = String(document.getElementById("supFrom")?.value || "").trim();
  const to = String(document.getElementById("supTo")?.value || "").trim();
  const month = String(document.getElementById("supMonth")?.value || "").trim();
  const q = [name, vin].filter(Boolean).join(" ").trim();

  const url =
    `/api/supervisor/report` +
    `?name=${encodeURIComponent(name)}` +
    `&vin=${encodeURIComponent(vin)}` +
    `&q=${encodeURIComponent(q)}` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&month=${encodeURIComponent(month)}` +
    `&track=${encodeURIComponent(supTrack)}`;

  const j = await getJSON_user(url, "Cargando reporte...");
  if (!j?.ok) {
    const s = document.getElementById("supSummary");
    if (s) s.textContent = j?.error || "Error cargando reporte.";
    const box = document.getElementById("supTable");
    if (box) box.innerHTML = "";
    const avgCard = document.getElementById("supAvgCard");
    if (avgCard) avgCard.innerHTML = "";
    return;
  }
  renderSupervisor_(j);
}

function renderSupervisor_(j) {
  const sum = document.getElementById("supSummary");
  const box = document.getElementById("supTable");
  const avgCard = document.getElementById("supAvgCard");

  const items = Array.isArray(j.items) ? j.items : [];
  // j.isHistorical = true  → backend ya envió solo FINALIZADO (fecha de cierre)
  // j.isHistorical = false → modo hoy/LIVE, incluye en proceso + cross-day
  const isHistorical = !!j.isHistorical;

  const marcaSel = String(document.getElementById("supMarca")?.value || "ALL").toUpperCase();
  const filtered = items.filter((it) => matchMarca_(it, marcaSel));
  const list = filtered;
  _lastReportItems_ = list;

  const rawTechName = String(document.getElementById("supName")?.value || "").trim();
  const hasTechFilter = !!rawTechName;

  const uiList = (!hasTechFilter && supTrack === "CONVERSION")
    ? groupByVinForUI_(list)
    : list;

  // -------- promedio robusto (solo FINALIZADOS, no RAMAL) --------
  // -------- promedio robusto con prior contextual --------

  // 1) Históricos válidos para construir referencia contextual
  const historyItems = items.filter((it) => {
    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
    const isRamal = rol === "RAMALERO" || rol === "RAMAL";
    if (isRamal) return false;
    if (!isFinalizado_(it.estado)) return false;
    return durationMsFromItem_(it) > 0;
  });

  // 2) Enriquecemos items para que el builder entienda track
  const historyForStats = historyItems.map((it) => ({
    ...it,
    _track: supTrack,
  }));

  // 3) Construimos mapa de medianas por contexto
  const statsMap = buildContextStats_(historyForStats, durationMsFromItem_);

  // 4) Duraciones del filtro actual
  const durMs = [];
  const rolesInCurrentList = new Set();

  for (const it of list) {
    const rolRaw = String(it.rol || it.rolTrabajo || "").toUpperCase();
    const isRamal = rolRaw === "RAMALERO" || rolRaw === "RAMAL";
    if (isRamal) continue;

    if (!isFinalizado_(it.estado)) continue;

    const d = durationMsFromItem_(it);
    if (d > 0) {
      durMs.push(d);
      rolesInCurrentList.add(rolRaw);
    }
  }

  // 5) Determinar contexto actual
  // Si hay un solo rol dominante/único en la lista, lo usamos.
  // Si hay mezcla, usamos rol "ALL" implícito cayendo a track+marca o track.
  let currentRol = "";
  if (rolesInCurrentList.size === 1) {
    currentRol = [...rolesInCurrentList][0];
  }

  const contextPrior = getContextPrior_(statsMap, {
    track: supTrack,
    rol: currentRol,
    marca: marcaSel,
  }, 4);

  // 6) Estimación final
  const stats = avgRobustWithContextPrior_(durMs, contextPrior, {
    priorWeight: 6,
    k: 2.1,
  });

  // Debug opcional
  // console.log("SUP context stats", {
  //   supTrack,
  //   marcaSel,
  //   currentRol,
  //   contextPrior,
  //   stats,
  //   durMs,
  // });

  // -------- contadores rol (solo FINALIZADOS) --------
  const techName = rawTechName || "Técnico";
  let motorCount = 0;
  let tanqueCount = 0;

  // Contar VINs únicos finalizados con peso:
  // - crossDay = true  → 0.5 (empezó día anterior)
  // - crossDay = false → 1.0
  const vinsFinalizados = new Map(); // vin → peso acumulado (max 1.0)

  for (const it of list) {
    if (!isFinalizado_(it.estado)) continue;

    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
    const peso = it.crossDay ? 0.5 : 1.0;

    if (rol === "TANQUE" || rol === "TANQUERO") tanqueCount += peso;
    else if (rol === "MOTOR") motorCount += peso;
    else if (rol === "TECNICO" || rol === "CONVERSION") motorCount += peso;

    // Acumular peso por VIN (tope en 1.0 para no exceder)
    const vin = String(it.vin || "").trim();
    if (vin) {
      const prev = vinsFinalizados.get(vin) || 0;
      vinsFinalizados.set(vin, Math.min(1.0, prev + peso));
    }
  }

  // Suma ponderada de VINs (puede ser decimal, ej: 4.5)
  // - Histórico: crossDay siempre false → todos peso 1.0 → total = nº VINs exacto
  // - Hoy: cross-day items cuentan 0.5 (½ carro del día anterior)
  const finalizedCount = [...vinsFinalizados.values()].reduce((s, v) => s + v, 0);
  const finalizedCountDisplay = Number.isInteger(finalizedCount)
    ? finalizedCount
    : finalizedCount.toFixed(1);

  renderAvgCard_(avgCard, {
    stats,
    techName,
    motorCount: Math.round(motorCount * 2) / 2,
    tanqueCount: Math.round(tanqueCount * 2) / 2,
    finalizedCount: finalizedCountDisplay,
    isHistorical,
    escapeHtml,
  });

  // Calcular y renderizar KPIs
  const kpisPanel = document.getElementById("supKPIsPanel");
  const btnVerKPIs = document.getElementById("btnVerKPIs");
  if (kpisPanel) {
    const kpis = calculateKPIs_(list, supTrack, hasTechFilter);
    const kpisInner = renderKPIsPanel_(kpis, hasTechFilter ? techName : "", supTrack);
    kpisPanel.innerHTML = kpisInner;
    if (kpisInner) {
      kpisPanel.className = "sup-kpis-panel";
      kpisPanel.style.display = "none"; // colapsado por defecto
      if (btnVerKPIs) {
        btnVerKPIs.style.display = "";
        btnVerKPIs.textContent = "📊 VER KPIS";
      }
    } else {
      kpisPanel.className = "";
      kpisPanel.style.display = "none";
      if (btnVerKPIs) btnVerKPIs.style.display = "none";
    }
  }

  // Renderizar gráfico de tendencias (solo si hay técnico seleccionado)
  const canvasEl = document.getElementById("supTrendChart");
  if (canvasEl) {
    renderTrendChart_(canvasEl, list, hasTechFilter ? techName : "");
  }

  if (!box) return;

  if (!list.length) {
    if (sum) sum.textContent = "Resultados: 0";
    if (avgCard) avgCard.innerHTML = "";
    box.innerHTML = `<div class="small">No hay resultados con esos filtros.</div>`;
    return;
  }

  if (sum) sum.textContent = `Resultados: ${uiList.length}`;

  renderTable_(box, { uiList, escapeHtml, fmtShort_ });
}

function exportReportCsv_() {
  if (!_lastReportItems_.length) return;
  const hdrs = ["Fecha Inicio","Fecha Fin","VIN","Modelo","Tecnico","Rol","Estado","Tiempo (h)","Cross-day"];
  const esc  = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [hdrs.map(esc).join(",")];
  for (const it of _lastReportItems_) {
    const horas = it.tiempo_ms > 0 ? (it.tiempo_ms / 3600000).toFixed(2) : "";
    const fIni  = it.fecha_asignacion ? new Date(it.fecha_asignacion).toLocaleDateString("es-PE") : "";
    const fFin  = it.updated_at       ? new Date(it.updated_at).toLocaleDateString("es-PE")       : "";
    rows.push([fIni, fFin, it.vin||"", it.modelo||"", it.userName||"", it.rolTrabajo||it.rol||"", it.estado||"", horas, it.crossDay?"SI":"NO"].map(esc).join(","));
  }
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: "reporte_" + new Date().toISOString().slice(0,10) + ".csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export function init() {
  // ── Pestañas REPORTE / LIVE / UBICACIONES / INCIDENCIAS ─────────────
  document.querySelectorAll(".sup-tab[data-suptab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.suptab;
      supActiveTab_ = tab;
      document.querySelectorAll(".sup-tab[data-suptab]").forEach((b) =>
        b.classList.toggle("active", b.dataset.suptab === tab)
      );
      const panelReporte     = document.getElementById("supPanelReporte");
      const panelLive        = document.getElementById("supPanelLive");
      const panelUbicaciones = document.getElementById("supPanelUbicaciones");
      const panelIncidencias = document.getElementById("supPanelIncidencias");
      const panelLista       = document.getElementById("supPanelLista");
      if (panelReporte)     panelReporte.style.display     = tab === "REPORTE"     ? "" : "none";
      if (panelLive)        panelLive.style.display        = tab === "LIVE"        ? "" : "none";
      if (panelUbicaciones) panelUbicaciones.style.display = tab === "UBICACIONES" ? "" : "none";
      if (panelIncidencias) panelIncidencias.style.display = tab === "INCIDENCIAS" ? "" : "none";
      if (panelLista)       panelLista.style.display       = tab === "LISTA"       ? "" : "none";

      if (tab === "LIVE") {
        exitUbicaciones_();
        exitIncReport_();
        enterLive_();
      } else if (tab === "UBICACIONES") {
        exitLive_();
        exitIncReport_();
        enterUbicaciones_();
      } else if (tab === "INCIDENCIAS") {
        exitLive_();
        exitUbicaciones_();
        enterIncReport_();
      } else if (tab === "LISTA") {
        exitLive_();
        exitUbicaciones_();
        exitIncReport_();
        fetchListaPendientes_().catch(() => {});
      } else {
        exitLive_();
        exitUbicaciones_();
        exitIncReport_();
        fetchSupervisorReport_().catch(() => {});
      }
    });
  });

  document.querySelectorAll("[data-suptrack]").forEach((btn) =>
    btn.addEventListener("click", () => setSupTrack_(btn.dataset.suptrack))
  );

  document.getElementById("btnSupApply")?.addEventListener("click", () => fetchSupervisorReport_().catch(() => {}));

  document.getElementById("btnVerKPIs")?.addEventListener("click", () => {
    const panel = document.getElementById("supKPIsPanel");
    const btn = document.getElementById("btnVerKPIs");
    if (!panel || !btn) return;
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "block" : "none";
    btn.textContent = isHidden ? "📉 OCULTAR KPIS" : "📊 VER KPIS";
  });

  document.getElementById("supMarca")?.addEventListener("change", () => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;
    fetchSupervisorReport_().catch(() => {});
  });

  document.getElementById("btnSupClear")?.addEventListener("click", () => {
    ["supName","supVin","supFrom","supTo","supMonth"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    destroyTrendChart_();
    fetchSupervisorReport_().catch(() => {});
  });

  document.getElementById("btnSupExportCsv")?.addEventListener("click", exportReportCsv_);

  // features
  bindSupIncidencias_({ CORE, getJSON_user, escapeHtml, fmtShort_ });
  bindSupQuickDates_({ onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupQR_({ CORE, onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupNameSuggest_({ CORE, escapeHtml, onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupVinSuggest_({ CORE, escapeHtml, onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupPausaIndefinida_({ getJSON_user });
  bindSupLive_();
  bindSupUbicaciones_();
  bindSupIncidenciasReport_({ getJSON_user, escapeHtml });

  document.getElementById("btnListaRefresh")?.addEventListener("click", () =>
    fetchListaPendientes_().catch(() => {})
  );
}

// ── LISTA PENDIENTES ────────────────────────────────────────────────────

async function fetchListaPendientes_() {
  const box = document.getElementById("supPanelListaBox");
  if (!box) return;
  box.innerHTML = '<div class="small muted" style="margin-top:12px;">Cargando...</div>';
  try {
    const j = await getJSON_user("/api/supervisor/lista-pendientes", "Cargando lista...");
    if (!j?.ok) {
      box.innerHTML = `<div class="small muted">Error: ${escapeHtml(j?.error || "?")}</div>`;
      return;
    }
    renderListaPendientes_(j, box);
  } catch (e) {
    box.innerHTML = `<div class="small muted">Error al cargar: ${escapeHtml(e.message)}</div>`;
  }
}

function renderListaPendientes_(data, box) {
  const { sin_ot = [], en_proceso = [], pendiente_entrega = [] } = data;

  const cardsHtml = (items, emptyMsg) => {
    if (!items.length)
      return `<div class="small muted" style="padding:6px 4px;">${emptyMsg}</div>`;
    return items.map(r => `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 4px; border-bottom:1px solid rgba(255,255,255,.07);">
        <span style="font-weight:700; font-size:.9rem; flex:0 0 auto;">${escapeHtml(r.vin)}</span>
        ${r.ubicacion
          ? `<span class="small" style="opacity:.7; flex:1;">${escapeHtml(r.ubicacion)}</span>`
          : `<span style="flex:1;"></span>`}
        ${r.numero_ot
          ? `<span class="small" style="opacity:.6;">#${escapeHtml(r.numero_ot)}</span>`
          : ''}
      </div>
    `).join("");
  };

  const section = (color, icon, label, count, items, emptyMsg) => `
    <div style="margin-bottom:14px;">
      <div style="padding:6px 10px; border-radius:8px; background:${color}; font-weight:700; font-size:.85rem; margin-bottom:4px;">
        ${icon} ${label} <span style="opacity:.7;">(${count})</span>
      </div>
      ${cardsHtml(items, emptyMsg)}
    </div>
  `;

  box.innerHTML = `
    <div style="margin-top:10px;">
      ${section("rgba(0,175,255,.18)",  "🔵", "Pendiente entrega — movilizador",  pendiente_entrega.length, pendiente_entrega, "Sin pendientes para movilizador.")}
      ${section("rgba(0,220,80,.15)",   "🟢", "En conversión — técnico",           en_proceso.length,        en_proceso,        "Sin conversiones activas.")}
      ${section("rgba(255,200,0,.13)",  "🟡", "Sin OT / Zona de espera",           sin_ot.length,            sin_ot,            "Sin vehículos en espera.")}
    </div>
  `;
}

export function enter() {
  CORE.state.currentModule = "SUPERVISOR";

  if (!window.__nameSuggestWarmed) {
    window.__nameSuggestWarmed = true;
    fetch("/api/name-suggest?q=.&limit=200").catch(() => {});
  }

  // Activar pestaña LIVE al entrar
  supActiveTab_ = "LIVE";
  document.querySelectorAll(".sup-tab[data-suptab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.suptab === "LIVE")
  );
  const panelReporte     = document.getElementById("supPanelReporte");
  const panelLive        = document.getElementById("supPanelLive");
  const panelIncidencias = document.getElementById("supPanelIncidencias");
  const panelLista       = document.getElementById("supPanelLista");
  if (panelReporte)     panelReporte.style.display     = "none";
  if (panelLive)        panelLive.style.display        = "";
  if (panelIncidencias) panelIncidencias.style.display = "none";
  if (panelLista)       panelLista.style.display       = "none";
  enterLive_();
}

export function exit() {
  clearTimeout(supTimer);
  destroyTrendChart_();
  exitLive_();
  exitUbicaciones_();
  exitIncReport_();
}