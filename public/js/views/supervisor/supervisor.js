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

let supTrack = "CONVERSION";
let supTimer = null;

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

  const marcaSel = String(document.getElementById("supMarca")?.value || "ALL").toUpperCase();
  const filtered = items.filter((it) => matchMarca_(it, marcaSel));
  const list = filtered;

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

  // Contar VINs únicos finalizados
  const vinsFinalizados = new Set();

  for (const it of list) {
    if (!isFinalizado_(it.estado)) continue;

    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
    if (rol === "TANQUE" || rol === "TANQUERO") tanqueCount++;
    else if (rol === "MOTOR") motorCount++;
    else if (rol === "TECNICO" || rol === "CONVERSION") motorCount++;

    // Agregar VIN al set si está finalizado
    const vin = String(it.vin || "").trim();
    if (vin) vinsFinalizados.add(vin);
  }

  const finalizedCount = vinsFinalizados.size;

  renderAvgCard_(avgCard, { stats, techName, motorCount, tanqueCount, finalizedCount, escapeHtml });

  // Calcular y renderizar KPIs
  const kpisContainer = document.getElementById("supKPIsPanel");
  if (kpisContainer) {
    const kpis = calculateKPIs_(list, supTrack);
    const kpisHTML = renderKPIsPanel_(kpis, hasTechFilter ? techName : "", supTrack);
    kpisContainer.outerHTML = kpisHTML;
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

export function init() {
  document.querySelectorAll("[data-suptrack]").forEach((btn) =>
    btn.addEventListener("click", () => setSupTrack_(btn.dataset.suptrack))
  );

  document.getElementById("btnSupApply")?.addEventListener("click", () => fetchSupervisorReport_().catch(() => {}));

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

  // features
  bindSupIncidencias_({ CORE, getJSON_user, escapeHtml, fmtShort_ });
  bindSupQuickDates_({ onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupQR_({ CORE, onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupNameSuggest_({ CORE, escapeHtml, onApply: () => fetchSupervisorReport_().catch(() => {}) });
  bindSupVinSuggest_({ CORE, escapeHtml, onApply: () => fetchSupervisorReport_().catch(() => {}) });
}

export function enter() {
  CORE.state.currentModule = "SUPERVISOR";

  if (!window.__nameSuggestWarmed) {
    window.__nameSuggestWarmed = true;
    fetch("/api/name-suggest?q=.&limit=200").catch(() => {});
  }

  fetchSupervisorReport_().catch(() => {});
}

export function exit() {
  clearTimeout(supTimer);
  destroyTrendChart_();
}