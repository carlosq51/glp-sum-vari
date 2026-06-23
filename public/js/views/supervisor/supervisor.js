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

import { createScanner } from "../../core/qr-scanner.js";

let supTrack = "CONVERSION";
let supTimer = null;
let supActiveTab_ = "LIVE"; // "REPORTE" | "LIVE"
let _lastReportItems_ = [];

// ── Scanner exclusivo de VALIDAR (no comparte qrReader con sup/conv) ─────────
const supValidarScanner_ = createScanner("supValidarQrReader");

async function openSupValidarQr_() {
  const modal = document.getElementById("supValidarQrModal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("show");
  const msg = document.getElementById("supValidarQrMsg");
  try {
    await supValidarScanner_.start({
      mode: "QR",
      msgEl: msg,
      onDecoded: async (code) => {
        await closeSupValidarQr_();
        const inp = document.getElementById("supValidarVin");
        if (inp) inp.value = code;
        fetchVinValidar_();
      },
    });
  } catch { /* mensaje ya mostrado en msgEl */ }
}

async function closeSupValidarQr_() {
  await supValidarScanner_.stop().catch(() => {});
  const modal = document.getElementById("supValidarQrModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.style.display = "none";
}

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

  // -------- contadores rol (modo general vs técnico) --------
  const techName = rawTechName || "Técnico";
  let motorCount = 0;
  let tanqueCount = 0;
  let finalizedCount = 0;

  // ── Helpers de timezone Perú (UTC-5) ─────────────────────────────────
  const _fmtPeru_ = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" });
  const _peruOf_  = (iso) => (iso ? _fmtPeru_.format(new Date(iso)) : null);

  // Rango de búsqueda actual (en fechas Perú tal como el usuario las escribió)
  const fromInputVal = String(document.getElementById("supFrom")?.value || "").trim();
  const toInputVal   = String(document.getElementById("supTo")?.value || "").trim();

  if (!hasTechFilter && supTrack === "CONVERSION") {
    // MODO GENERAL: contar desde grupos (un carro = MOTOR Y TANQUE ambos listos)
    for (const grupo of uiList) {
      if (grupo._kind !== "group") continue;
      if (isFinalizado_(grupo.motor?.estado))  motorCount++;
      if (isFinalizado_(grupo.tanque?.estado)) tanqueCount++;
      if (grupo.estado === "FINALIZADO")       finalizedCount++;
    }
  } else {
    // MODO TÉCNICO: contar por ítem con regla de medio carro
    // Un ítem es "cross-day" cuando startPeru != endPeru (días Perú distintos).
    // Si el rango de búsqueda cubre AMBOS días → peso 1.0
    // Si cubre solo uno → peso 0.5 (½ carro) + badge
    const vinsFinalizados = new Map();

    for (const it of list) {
      const esFin = isFinalizado_(it.estado);
      // En modo técnico también contamos items activos/pausados que vienen
      // del backend como _crossDay:true (empezaron en el rango pero no
      // terminaron aún, o terminaron fuera del rango) → siempre ½
      if (!esFin && !it.crossDay) continue;

      const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();

      let peso = 1.0;
      if (esFin) {
        const startPeru = _peruOf_(it.fecha_asignacion || it.fecha_inicio);
        const endPeru   = _peruOf_(it.updated_at);
        if (startPeru && endPeru && startPeru !== endPeru) {
          // Cross-day FINALIZADO: ½ si el rango no cubre ambos días
          const coversStart = !fromInputVal || fromInputVal <= startPeru;
          const coversEnd   = !toInputVal   || toInputVal   >= endPeru;
          if (!(coversStart && coversEnd)) {
            peso = 0.5;
            it._esMedioCarro = true;
          }
        }
      } else {
        // No-FINALIZADO con crossDay flag: siempre ½
        peso = 0.5;
        it._esMedioCarro = true;
      }

      if (rol === "TANQUE" || rol === "TANQUERO")                          tanqueCount += peso;
      else if (rol === "MOTOR" || rol === "TECNICO" || rol === "CONVERSION") motorCount += peso;

      const vin = String(it.vin || "").trim();
      if (vin) {
        const prev = vinsFinalizados.get(vin) || 0;
        vinsFinalizados.set(vin, Math.min(1.0, prev + peso));
      }
    }
    finalizedCount = [...vinsFinalizados.values()].reduce((s, v) => s + v, 0);
  }

  const finalizedCountDisplay = Number.isInteger(finalizedCount)
    ? finalizedCount
    : finalizedCount.toFixed(1);

  // -------- VINs con motor + tanque ambos finalizados (producción sin calidad) --------
  let vinSinCalidad = 0;
  if (supTrack === "CONVERSION") {
    const vinStatus = new Map(); // vin → { motorFin, tanqueFin }
    for (const it of list) {
      const vin = String(it.vin || "").trim();
      if (!vin) continue;
      const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
      const est = String(it.estado || "").toUpperCase();
      if (!vinStatus.has(vin)) vinStatus.set(vin, { motorFin: false, tanqueFin: false });
      const s = vinStatus.get(vin);
      if ((rol === "MOTOR" || rol === "TECNICO" || rol === "CONVERSION") && est === "FINALIZADO") s.motorFin = true;
      if ((rol === "TANQUE" || rol === "TANQUERO") && est === "FINALIZADO") s.tanqueFin = true;
    }
    for (const [, s] of vinStatus) {
      if (s.motorFin && s.tanqueFin) vinSinCalidad++;
    }
  }

  renderAvgCard_(avgCard, {
    stats,
    techName,
    motorCount: Math.round(motorCount * 2) / 2,
    tanqueCount: Math.round(tanqueCount * 2) / 2,
    finalizedCount: finalizedCountDisplay,
    isHistorical,
    supTrack,
    vinSinCalidad,
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
      const panelValidar     = document.getElementById("supPanelValidar");
      if (panelReporte)     panelReporte.style.display     = tab === "REPORTE"     ? "" : "none";
      if (panelLive)        panelLive.style.display        = tab === "LIVE"        ? "" : "none";
      if (panelUbicaciones) panelUbicaciones.style.display = tab === "UBICACIONES" ? "" : "none";
      if (panelIncidencias) panelIncidencias.style.display = tab === "INCIDENCIAS" ? "" : "none";
      if (panelValidar)     panelValidar.style.display     = tab === "VALIDAR"     ? "" : "none";

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
      } else if (tab === "VALIDAR") {
        exitLive_();
        exitUbicaciones_();
        exitIncReport_();
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

  // ── VALIDAR VIN ──────────────────────────────────────────────────────
  const supValidarInp = document.getElementById("supValidarVin");
  const supValidarBox = document.getElementById("supValidarVinSuggest");

  supValidarInp?.addEventListener("input", async () => {
    const q = (supValidarInp.value || "").trim();
    if (q.length < 2) { supValidarBox?.classList.add("hidden"); if (supValidarBox) supValidarBox.innerHTML = ""; return; }
    try {
      const j = await getJSON_user(`/api/vin-suggest?q=${encodeURIComponent(q)}&limit=8`, "");
      if (!j?.ok || !j.items?.length) { supValidarBox?.classList.add("hidden"); return; }
      if (supValidarBox) {
        supValidarBox.innerHTML = j.items.map(it =>
          `<div class="vinSuggestItem" data-vin="${escapeHtml(it.vin)}">`
          + `<span class="vinSuggestVin">${escapeHtml(it.vin)}</span>`
          + (it.modelo ? `<span class="vinSuggestMod">${escapeHtml(it.modelo)}</span>` : "")
          + `</div>`
        ).join("");
        supValidarBox.classList.remove("hidden");
      }
    } catch { supValidarBox?.classList.add("hidden"); }
  });

  supValidarBox?.addEventListener("click", e => {
    const item = e.target.closest("[data-vin]");
    if (!item) return;
    if (supValidarInp) supValidarInp.value = item.dataset.vin;
    supValidarBox.classList.add("hidden");
    supValidarBox.innerHTML = "";
    fetchVinValidar_();
  });

  supValidarInp?.addEventListener("keydown", e => {
    if (e.key === "Enter") { supValidarBox?.classList.add("hidden"); fetchVinValidar_(); }
    if (e.key === "Escape") { supValidarBox?.classList.add("hidden"); if (supValidarBox) supValidarBox.innerHTML = ""; }
  });

  document.getElementById("btnSupValidarBuscar")?.addEventListener("click", fetchVinValidar_);

  document.getElementById("btnSupValidarQr")?.addEventListener("click", () =>
    openSupValidarQr_().catch(() => {})
  );
  document.getElementById("btnSupValidarCloseQr")?.addEventListener("click", () =>
    closeSupValidarQr_().catch(() => {})
  );
  document.getElementById("supValidarQrModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("supValidarQrModal"))
      closeSupValidarQr_().catch(() => {});
  });
}

// ── VALIDAR VIN ──────────────────────────────────────────────────────────────

async function fetchVinValidar_() {
  const vin = String(document.getElementById("supValidarVin")?.value || "").trim().toUpperCase();
  const box = document.getElementById("supValidarResult");
  if (!box) return;
  if (!vin) { box.innerHTML = `<div class="small muted">Ingresa un VIN para validar.</div>`; return; }
  box.innerHTML = `<div class="small muted">Buscando…</div>`;
  try {
    const j = await getJSON_user(`/api/vin-validar?vin=${encodeURIComponent(vin)}`, "Validando VIN…");
    renderVinValidar_(j);
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function renderVinValidar_(j) {
  const box = document.getElementById("supValidarResult");
  if (!box) return;

  if (!j?.ok) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">⚠️ ${escapeHtml(j?.error || "Error")}</div>`;
    return;
  }

  if (!j.found) {
    box.innerHTML = `
      <div style="text-align:center; padding:28px 0;">
        <div style="font-size:2.6rem;">❌</div>
        <div style="font-weight:900; margin-top:10px; color:#f87171; font-size:1.05em;">VIN NO REGISTRADO</div>
        <div class="small muted" style="margin-top:6px;">Este vehículo no está en el sistema de conversión.</div>
      </div>`;
    return;
  }

  const v = j.vin;
  const wos = j.workOrders || [];

  const woHtml = wos.length
    ? wos.map(wo => {
        const asgs = (wo.asignaciones || []).filter(a => a.activo);
        const estadoPill = estado => {
          const s = String(estado || "").toUpperCase();
          const color = s === "FINALIZADO" ? "#4ade80" : s === "TRABAJANDO" ? "#60a5fa" : s === "PAUSADO" ? "#fbbf24" : "#94a3b8";
          return `<span style="font-size:.72em;font-weight:900;color:${color};">${escapeHtml(estado || "—")}</span>`;
        };
        return `
          <div style="margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:10px;border:1px solid rgba(255,255,255,.10);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <span style="font-weight:900;font-size:.85em;">${escapeHtml(wo.tipo_ot || "OT")}</span>
              <span class="small muted">${wo.fecha_creacion ? new Date(wo.fecha_creacion).toLocaleDateString("es-PE") : ""}</span>
            </div>
            ${asgs.length
              ? asgs.map(a => `
                  <div class="small" style="padding:2px 0;opacity:.85;">
                    <b>${escapeHtml(a.rol_trabajo || "")}</b> — ${escapeHtml(a.usuarios?.nombre || "?")} ${estadoPill(a.estado_actual)}
                  </div>`).join("")
              : `<div class="small muted">Sin asignaciones activas.</div>`}
          </div>`;
      }).join("")
    : `<div class="small muted" style="margin-top:8px;">Sin órdenes de trabajo.</div>`;

  box.innerHTML = `
    <div style="text-align:center;padding:14px 0 8px;">
      <div style="font-size:2.6rem;">✅</div>
      <div style="font-weight:900;margin-top:6px;color:#4ade80;font-size:1.05em;">VIN REGISTRADO</div>
    </div>
    <div style="background:rgba(74,222,128,.07);border:1px solid rgba(74,222,128,.25);border-radius:14px;padding:14px 16px;margin-top:4px;">
      <div style="font-family:monospace;font-size:1.1em;font-weight:900;letter-spacing:.05em;">${escapeHtml(v.vin)}</div>
      ${v.modelo   ? `<div class="small" style="margin-top:5px;opacity:.75;">Modelo: <b>${escapeHtml(v.modelo)}</b></div>` : ""}
      ${v.cliente  ? `<div class="small" style="opacity:.75;">Cliente: <b>${escapeHtml(v.cliente)}</b></div>` : ""}
      ${v.reductor_asignado ? `<div class="small" style="opacity:.75;">Reductor: <b>${escapeHtml(v.reductor_asignado)}</b></div>` : ""}
      ${v.tanque_asignado   ? `<div class="small" style="opacity:.75;">Tanque: <b>${escapeHtml(v.tanque_asignado)}</b></div>` : ""}
    </div>
    <div style="margin-top:14px;font-weight:900;font-size:.76em;opacity:.55;letter-spacing:.6px;">ÓRDENES DE TRABAJO</div>
    ${woHtml}
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
  const panelValidar     = document.getElementById("supPanelValidar");
  if (panelReporte)     panelReporte.style.display     = "none";
  if (panelLive)        panelLive.style.display        = "";
  if (panelIncidencias) panelIncidencias.style.display = "none";
  if (panelValidar)     panelValidar.style.display     = "none";
  enterLive_();
}

export function exit() {
  clearTimeout(supTimer);
  destroyTrendChart_();
  exitLive_();
  exitUbicaciones_();
  exitIncReport_();
}