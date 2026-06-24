/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import { initIncidenciasUI_ } from "./modals/incidencias.js";
import { initRFModalUI_ } from "./modals/rf-modal.js";
import { initRFTecModalUI_ } from "./modals/rf-tecnico-modal.js";
import { initConfirmFinishUI_ } from "./modals/confirm-finish.js";
import { initErrorModal } from "./modals/error-modal.js";
import {
  initConformidadUI_,
  setConformidadAfterSaveRefresh_,
} from "./modals/conformidad.js";

import {
  CORE,
  $,
  el_,
  ctx_,
  isWorkModule_,
  getVin,
  getRolTrabajoCurrent_,
  requireEmailOrStop,
  setEstadoText,
  msToHMS_,
  withLock,
  getJSON,
} from "../../core/core.js";

import { computeLiveMs_, renderFinalizados_, rebuildListsFromStore_ } from "../../work/index.js";
import { startLoopsFor_, stopLoopsFor_, clearModuleUI_ } from "../../core/loops.js";

import { syncNow, fetchFinalizados_, initializeRealtime_, destroyRealtime_ } from "./data/conversion-sync.js";
import {
  refreshEstadoForVinRole,
  initEstadoUI_,
} from "./data/conversion-estado.js";
import { PAUSA_AUTO_RESUME_MS, autoResumingKeys_, enviarEvento, SCHEDULED_PAUSES, isInfinitePauseWindow_ } from "./data/conversion-eventos.js";
import { initConversionDelegation_ } from "./ui/conversion-delegation.js";
import { initVinAutocomplete_ } from "./ui/conversion-vin-autocomplete.js";
import { checkPendingAlerts_, getMyNombre_ } from "./modals/incidencia-alert.js";
import { requestNotifPermission } from "./modals/ramal-alert.js";
import { initConversionQR_ } from "./ui/conversion-qr.js";
import { initTecValidar_, openTecBuscarModal_ } from "./ui/conversion-validar.js";
import { escapeHtml, fmtShort_ } from "../../core/format.js";

// --------------------------
// TEC CARD NAVIGATION
// --------------------------

const TEC_PANELS = ["tecPanelMiOT", "tecPanelCola", "tecPanelRendimiento", "tecPanelIncidencias"];
let tecCardsInited_ = false;

function showTecCards_() {
  const hub = document.getElementById("tecCards");
  if (hub) hub.style.display = "block";
  TEC_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  // Update greeting
  const nombre = String(CORE.state.currentProfile?.nombre || "").split(" ")[0];
  const esp    = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
  const greet  = document.getElementById("tecGreeting");
  if (greet) greet.textContent = nombre ? `Hola, ${nombre} 👋` : "Bienvenido";
  // Badge on Mi OT if there's an active OT
  updateTecMiOTBadge_();
}

function showTecPanel_(panelId, loader) {
  const hub = document.getElementById("tecCards");
  if (hub) hub.style.display = "none";
  TEC_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === panelId ? "block" : "none";
  });
  if (loader) loader();
}

function updateTecMiOTBadge_() {
  const btn = document.querySelector("#tecCardGrid [data-tec-card='miOT']");
  if (!btn) return;
  btn.querySelector(".hubBadge")?.remove();
  const c = ctx_();
  const active = [...(c?.itemsByKey?.values() || [])].filter(
    it => ["TRABAJANDO", "PAUSADO"].includes(String(it.estado || "").toUpperCase())
  );
  if (active.length > 0) {
    const badge = document.createElement("span");
    badge.className = "hubBadge";
    badge.textContent = String(active.length);
    btn.appendChild(badge);
  }
}

function initTecCards_() {
  if (tecCardsInited_) return;
  tecCardsInited_ = true;

  // Back buttons (class shared across all panels)
  document.addEventListener("click", e => {
    if (e.target.closest(".tecBackBtn")) showTecCards_();
  });

  const grid = document.getElementById("tecCardGrid");
  if (!grid) return;

  const cards = [
    { key: "miOT",        emoji: "🔧", label: "Mi OT",           desc: "Tu VIN activo y orden de trabajo"    },
    { key: "cola",        emoji: "📋", label: "Cola pendiente",   desc: "VINs disponibles y compañeros libres" },
    { key: "validar",     emoji: "🔍", label: "Buscar / Validar", desc: "Verificar un VIN por código o QR"    },
    { key: "rendimiento", emoji: "📊", label: "Mi rendimiento",   desc: "Historial, estadísticas y meta"      },
    { key: "incidencias", emoji: "⚠️", label: "Mis incidencias",  desc: "Registrar y ver fallas detectadas"   },
  ];

  cards.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "hubCard";
    btn.dataset.tecCard = c.key;
    btn.innerHTML = `
      <div class="hubCardEmoji">${c.emoji}</div>
      <div class="hubCardText">
        <div class="hubCardName">${c.label}</div>
        <div class="hubCardDesc">${c.desc}</div>
      </div>
    `;
    btn.addEventListener("click", () => {
      if (c.key === "validar")      { openTecBuscarModal_(); return; }
      if (c.key === "miOT")         showTecPanel_("tecPanelMiOT", null);
      if (c.key === "cola")         showTecPanel_("tecPanelCola", loadTecCola_);
      if (c.key === "rendimiento")  showTecPanel_("tecPanelRendimiento", loadTecRendimiento_);
      if (c.key === "incidencias")  showTecPanel_("tecPanelIncidencias", loadTecIncidencias_);
    });
    grid.appendChild(btn);
  });
}

async function loadTecCola_() {
  const box = document.getElementById("tecColaContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando…</div>`;
  try {
    const esp  = String(CORE.state.currentProfile?.especialidad || "").toUpperCase();
    const pair = esp === "MOTOR" ? "TANQUE" : esp === "TANQUE" ? "MOTOR" : "";
    const j    = await getJSON(`/api/tecnico/cola?especialidad=${encodeURIComponent(esp)}`);
    if (!j?.ok) throw new Error(j?.error || "Error");

    let html = "";

    // Compañeros libres
    if (pair && j.companeros?.length) {
      html += `
        <div class="tecColaSection">
          <div class="tecColaSectionTitle">🤝 ${pair} libres ahora (${j.companeros.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${j.companeros.map(c => `<div class="tecColaChip">👤 ${escapeHtml(c.nombre)}</div>`).join("")}
          </div>
        </div>`;
    }

    // VINs table
    const rows = j.vins?.length ? j.vins : (j.vinsFallback || []);
    const title = j.fallbackUsed
      ? `🚘 VINs en cola de ingreso`
      : `🚘 En proceso de ${pair} — disponibles para ${esp}`;

    html += `<div class="tecColaSection"><div class="tecColaSectionTitle">${title}</div>`;

    if (!rows.length) {
      html += `<div class="small muted tecColaEmpty">No hay VINs disponibles ahora.</div>`;
    } else {
      html += `<div class="tecColaTable">
        <div class="tecColaTableHead">
          <span>VIN</span><span>Técnico</span><span>Estado</span>
        </div>
        ${rows.map(v => {
          const est = String(v.estado || "").toUpperCase();
          const estClass = est === "TRABAJANDO" ? "tecEst--trab"
                         : est === "PAUSADO"   ? "tecEst--paus"
                         : "tecEst--pend";
          return `<div class="tecColaTableRow">
            <span class="tecColaVin">${escapeHtml(v.vin)}</span>
            <span class="small tecColaTecnico">${escapeHtml(v.tecnico || "—")}</span>
            <span class="tecColaEst ${estClass}">${escapeHtml(v.estado || "—")}</span>
          </div>`;
        }).join("")}
      </div>`;
    }
    html += `</div>`;
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

async function loadTecRendimiento_() {
  const box = document.getElementById("tecRendContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando…</div>`;
  try {
    const emailEl = document.getElementById("email");
    const email   = String(emailEl?.value || "").trim().toLowerCase();
    if (!email) throw new Error("No hay sesión activa");

    const [jRend, jCfg] = await Promise.all([
      getJSON(`/api/mis-finalizadas?email=${encodeURIComponent(email)}`),
      getJSON("/api/admin/config"),
    ]);
    if (!jRend?.ok) throw new Error(jRend?.error || "Error al cargar rendimiento");

    const meta  = Number(jCfg?.config?.META_CONVERSION || 25);
    const items = Array.isArray(jRend.items) ? jRend.items : [];

    const msDay  = 86400000;
    const hoy    = new Date().toDateString();
    const cutSem = Date.now() - 7  * msDay;
    const cutMes = Date.now() - 30 * msDay;

    const hoyItems = items.filter(it => new Date(it.updated_at || 0).toDateString() === hoy);
    const semItems = items.filter(it => +new Date(it.updated_at || 0) >= cutSem);
    const fmtTime  = ms => { const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000); return h ? `${h}h ${m}m` : `${m}m`; };
    const fmtHora  = ts => ts ? new Date(ts).toLocaleTimeString("es-PE", {hour:"2-digit", minute:"2-digit"}) : "—";
    const avgMs    = items.length ? items.reduce((s, it) => s + (Number(it.tiempo_trab_ms) || 0), 0) / items.length : 0;

    // SVG circle progress
    const pct   = Math.min((hoyItems.length / meta) * 100, 100);
    const r = 44, cx = 54, cy = 54, circ = 2 * Math.PI * r;
    const fill  = circ * (pct / 100);
    const color = pct >= 100 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#60a5fa";

    function renderList(filtered) {
      if (!filtered.length) return `<div class="small muted" style="padding:8px 0;">Sin registros en este período.</div>`;
      return filtered.map(it => `
        <div class="tecRendRow">
          <span class="tecRendVin">${escapeHtml(it.vin || "")}</span>
          <span class="tecRendRole small">${escapeHtml(it.rol_trabajo || it.rolTrabajo || "")}</span>
          <span class="small muted">${fmtShort_(it.updated_at)}</span>
          <span class="tecRendHora small" title="Hora de fin">${fmtHora(it.updated_at)}</span>
          ${it.tiempo_trab_ms ? `<span class="small muted" style="margin-left:auto;">${fmtTime(Number(it.tiempo_trab_ms))}</span>` : ""}
        </div>`).join("");
    }

    let activePill = "hoy";
    let activeVin  = "";
    let activeDate = "";

    function getBase() {
      if (activePill === "hoy")    return hoyItems;
      if (activePill === "semana") return semItems;
      if (activePill === "mes")    return items.filter(it => +new Date(it.updated_at || 0) >= cutMes);
      return items;
    }

    function applyRendFilters() {
      let f = getBase();
      if (activeVin)  f = f.filter(it => String(it.vin || "").toUpperCase().includes(activeVin.toUpperCase()));
      if (activeDate) f = f.filter(it => it.updated_at?.startsWith(activeDate));
      box.querySelector("#tecRendList").innerHTML = renderList(f);
      box.querySelector("#tecRendCount").textContent = `${f.length} registros`;
    }

    box.innerHTML = `
      <!-- KPI hero -->
      <div class="sup-kpis-panel" style="margin-bottom:16px;">
        <div class="sup-kpis-title">📊 Mi rendimiento</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;">
          <div style="text-align:center;">
            <svg viewBox="0 0 108 108" width="108" height="108">
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="12"/>
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
                stroke-dasharray="${fill.toFixed(1)} ${(circ-fill).toFixed(1)}" stroke-linecap="round"
                transform="rotate(-90 ${cx} ${cy})"/>
              <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">${hoyItems.length}</text>
              <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="rgba(255,255,255,.7)" font-size="10">de ${meta}</text>
            </svg>
            <div style="color:rgba(255,255,255,.8);font-size:12px;margin-top:4px;">Meta del día</div>
          </div>
          <div class="sup-kpis-grid" style="flex:1;min-width:200px;">
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">☀️</span><span class="kpi-label">Hoy</span></div>
              <div class="kpi-value">${hoyItems.length}</div>
              <div class="kpi-bar"><div class="kpi-bar-fill ${pct>=100?"positive":pct>=60?"warning":"negative"}" style="width:${pct.toFixed(0)}%"></div></div>
            </div>
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">📅</span><span class="kpi-label">Semana</span></div>
              <div class="kpi-value">${semItems.length}</div>
            </div>
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">🏆</span><span class="kpi-label">Total</span></div>
              <div class="kpi-value">${items.length}</div>
            </div>
            <div class="sup-kpi-card">
              <div class="kpi-header"><span class="kpi-icon">⏱</span><span class="kpi-label">Prom.</span></div>
              <div class="kpi-value-small">${avgMs ? fmtTime(avgMs) : "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filtros historial -->
      <div class="tecRendHistTitle" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span>Historial</span>
        <span id="tecRendCount" class="small muted">${hoyItems.length} registros</span>
      </div>
      <div class="tecRendSearchRow">
        <div class="tecFilterPills" id="tecRendFilters">
          <button class="tecFilterPill active" data-filter="hoy">Hoy</button>
          <button class="tecFilterPill" data-filter="semana">Semana</button>
          <button class="tecFilterPill" data-filter="mes">Mes</button>
          <button class="tecFilterPill" data-filter="todo">Todo</button>
        </div>
      </div>
      <div class="tecRendSearchRow" style="margin-top:8px;margin-bottom:10px;">
        <input id="tecRendVinSearch" class="tecHistSearch" placeholder="🔍 Buscar VIN…" type="text" autocomplete="off">
        <input id="tecRendDatePick"  class="tecHistDate"   type="date" title="Filtrar por fecha específica">
      </div>
      <div id="tecRendList">${renderList(hoyItems)}</div>
    `;

    box.querySelector("#tecRendFilters")?.addEventListener("click", e => {
      const btn = e.target.closest(".tecFilterPill");
      if (!btn) return;
      box.querySelectorAll("#tecRendFilters .tecFilterPill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activePill = btn.dataset.filter;
      activeDate = "";
      box.querySelector("#tecRendDatePick").value = "";
      applyRendFilters();
    });

    box.querySelector("#tecRendVinSearch")?.addEventListener("input", e => {
      activeVin = e.target.value.trim();
      applyRendFilters();
    });

    box.querySelector("#tecRendDatePick")?.addEventListener("change", e => {
      activeDate = e.target.value; // "YYYY-MM-DD"
      if (activeDate) {
        box.querySelectorAll("#tecRendFilters .tecFilterPill").forEach(b => b.classList.remove("active"));
        activePill = "todo";
      }
      applyRendFilters();
    });

  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

async function loadTecIncidencias_() {
  const box = document.getElementById("tecIncContent");
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando…</div>`;
  try {
    const emailEl = document.getElementById("email");
    const email   = String(emailEl?.value || "").trim().toLowerCase();
    if (!email) throw new Error("No hay sesión activa");

    const j = await getJSON(`/api/incidencias/by-tecnico?email=${encodeURIComponent(email)}&days=365`);
    if (!j?.ok) throw new Error(j?.error || "Error");

    const all   = Array.isArray(j.items) ? j.items : [];
    const msDay = 86400000;
    const hoy   = new Date().toDateString();
    const cutSem = Date.now() - 7  * msDay;
    const cutMes = Date.now() - 30 * msDay;

    if (!all.length) {
      box.innerHTML = `<div class="small muted">Sin incidencias registradas.</div>`;
      return;
    }

    function renderIncCard(it) {
      const thumb = it.fotoThumbUrl || it.fotoImgUrl || it.fotoUrl || "";
      const full  = it.fotoUrl || it.fotoImgUrl || "";
      return `<div class="tecIncCard">
        <div class="tecIncCardTop">
          <span class="tecIncVin">${escapeHtml(it.vin || "")}</span>
          <span class="small muted">${fmtShort_(it.fecha_hora)} ${new Date(it.fecha_hora).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}</span>
        </div>
        ${it.nota ? `<div class="tecIncNota small">${escapeHtml(it.nota)}</div>` : ""}
        ${thumb ? `<a href="${full || thumb}" target="_blank" rel="noopener" class="tecIncPhotoWrap">
          <img src="${thumb}" class="tecIncThumb" alt="Foto incidencia" loading="lazy">
          <span class="tecIncPhotoLabel small">📷 Ver foto</span>
        </a>` : ""}
      </div>`;
    }

    function renderDashboard(filtered) {
      if (!filtered.length) return `<div class="small muted" style="padding:8px 0;">Sin incidencias en este período.</div>`;
      // Group by tipo
      const byTipo = {};
      filtered.forEach(it => {
        const t = it.tipo || "Sin tipo";
        if (!byTipo[t]) byTipo[t] = [];
        byTipo[t].push(it);
      });
      const sorted = Object.entries(byTipo).sort((a,b) => b[1].length - a[1].length);
      const maxCount = sorted[0][1].length;

      // Bars chart
      const bars = sorted.map(([tipo, incs]) => {
        const pct = (incs.length / maxCount * 100).toFixed(0);
        return `<div class="tecIncTypeLine">
          <span class="tecIncTypeName" title="${escapeHtml(tipo)}">${escapeHtml(tipo)}</span>
          <div class="tecIncTypeTrack"><div class="tecIncTypeFill" style="width:${pct}%"></div></div>
          <span class="tecIncTypeCount">${incs.length}</span>
        </div>`;
      }).join("");

      // Expandable groups
      const groups = sorted.map(([tipo, incs]) => `
        <div class="tecIncGroup">
          <button class="tecIncGroupHead" type="button">
            <span class="tecIncGroupName">${escapeHtml(tipo)}</span>
            <span class="tecIncGroupCount">${incs.length} caso${incs.length!==1?"s":""}</span>
            <span class="tecIncGroupChevron">▾</span>
          </button>
          <div class="tecIncGroupBody">
            ${incs.map(renderIncCard).join("")}
          </div>
        </div>`).join("");

      return `
        <div class="tecIncDashboard">
          <div class="tecIncDashTitle">Distribución por tipo (${filtered.length} total)</div>
          <div class="tecIncTypeChart">${bars}</div>
        </div>
        <div class="tecIncGroupsTitle">Detalle por tipo</div>
        <div class="tecIncGroups">${groups}</div>
      `;
    }

    // Default: este mes
    const mesFilt = all.filter(it => +new Date(it.fecha_hora) >= cutMes);

    box.innerHTML = `
      <div class="tecFilterRow" style="margin-bottom:12px;">
        <div class="tecFilterPills" id="tecIncDateFilters">
          <button class="tecFilterPill" data-filter="hoy">Hoy</button>
          <button class="tecFilterPill" data-filter="semana">Semana</button>
          <button class="tecFilterPill active" data-filter="mes">Este mes</button>
          <button class="tecFilterPill" data-filter="todo">Todo</button>
        </div>
      </div>
      <div id="tecIncDash">${renderDashboard(mesFilt)}</div>
    `;

    let activeDateFilter = "mes";

    function applyFilters() {
      let filtered = [...all];
      if (activeDateFilter === "hoy")    filtered = filtered.filter(it => new Date(it.fecha_hora).toDateString() === hoy);
      if (activeDateFilter === "semana") filtered = filtered.filter(it => +new Date(it.fecha_hora) >= cutSem);
      if (activeDateFilter === "mes")    filtered = filtered.filter(it => +new Date(it.fecha_hora) >= cutMes);
      box.querySelector("#tecIncDash").innerHTML = renderDashboard(filtered);
      bindGroups_();
    }

    function bindGroups_() {
      box.querySelectorAll(".tecIncGroupHead").forEach(btn => {
        btn.addEventListener("click", () => btn.closest(".tecIncGroup").classList.toggle("open"));
      });
    }
    bindGroups_();

    box.querySelector("#tecIncDateFilters")?.addEventListener("click", e => {
      const btn = e.target.closest(".tecFilterPill");
      if (!btn) return;
      box.querySelectorAll("#tecIncDateFilters .tecFilterPill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeDateFilter = btn.dataset.filter;
      applyFilters();
    });

  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

// --------------------------
// TICK CLOCK
// --------------------------

// Rastrea qué pausas programadas ya se dispararon hoy ("YYYY-MM-DD_HH:MM")
const scheduledPauseFired_ = new Set();

export function tickClocksUI_() {
  if (!isWorkModule_()) return;

  const c = ctx_();
  const nowMs = Date.now();

  // ── Pausas programadas (almuerzo 13:00, fin tarde 16:30) ────────────────
  {
    const now = new Date(nowMs);
    for (const [ph, pm] of SCHEDULED_PAUSES) {
      if (now.getHours() === ph && now.getMinutes() === pm) {
        const fireKey = `${now.toDateString()}_${ph}:${String(pm).padStart(2, "0")}`;
        if (!scheduledPauseFired_.has(fireKey)) {
          scheduledPauseFired_.add(fireKey);
          for (const it of c.itemsByKey.values()) {
            if (String(it.estado || "").toUpperCase() === "TRABAJANDO") {
              enviarEvento("PAUSA", { vin: it.vin, rolTrabajo: it.rolTrabajo })
                .catch(e => console.warn("[PAUSA-PROGRAMADA] Error:", e));
            }
          }
        }
      }
    }
  }

  el_("activasBox")
    ?.querySelectorAll(".jobCard[data-key] .js-tiempo")
    ?.forEach((elTime) => {
      const card = elTime.closest(".jobCard");
      if (!card) return;

      const k = card.dataset.key || "";
      const it = c.itemsByKey.get(k);
      if (!it) return;

      elTime.textContent = `⏱ ${msToHMS_(computeLiveMs_(it, nowMs))}`;

      // Countdown de pausa automática basado en it.updated_at (servidor)
      if (String(it.estado || "").toUpperCase() === "PAUSADO") {
        const cdEl = card.querySelector(".js-pausa-countdown");
        if (cdEl) {
          const pausedAt = it.updated_at ? Date.parse(it.updated_at) : NaN;
          const pausedMs = isNaN(pausedAt) ? Infinity : nowMs - pausedAt;

          // En ventana de pausa infinita, pausa muy larga, o pausa impuesta por supervisor
          // → no mostrar countdown ni auto-reanudar
          const esSupervisor = String(it.last_nota || "").startsWith("__SUP") ||
                                String(it.last_nota || "").startsWith("__ADMIN");
          isInfinitePauseWindow_().then(isInfinite => {
            if (isInfinite || pausedMs > PAUSA_AUTO_RESUME_MS * 2 || esSupervisor) {
              cdEl.textContent = esSupervisor ? "⏸ Pausado por supervisor" : "";
              return;
            }

            if (!isNaN(pausedAt)) {
              const remainMs = PAUSA_AUTO_RESUME_MS - pausedMs;
              if (remainMs > 0) {
                const mins = Math.floor(remainMs / 60000);
                const secs = Math.floor((remainMs % 60000) / 1000);
                cdEl.textContent = `⏳ Auto-reanuda en ${mins}:${String(secs).padStart(2, "0")}`;
              } else if (!autoResumingKeys_.has(k)) {
                cdEl.textContent = "⏳ Reanudando...";
                autoResumingKeys_.add(k);
                enviarEvento("REANUDAR", { vin: it.vin, rolTrabajo: it.rolTrabajo, clearKey: k })
                  .catch((e) => console.warn("[AUTO-PAUSA] Error al reanudar:", e))
                  .finally(() => autoResumingKeys_.delete(k));
              }
            } else {
              cdEl.textContent = "";
            }
          }).catch(() => {});
        }
      }
    });

  if (CORE.state.currentModule === "RAMALERO") return;

  const vin = getVin();
  const rol = getRolTrabajoCurrent_();

  if (vin && rol) {
    const it = [...c.itemsByKey.values()].find(
      (x) =>
        String(x.vin || "").toUpperCase() === vin &&
        String(x.rolTrabajo || "").toUpperCase() === rol
    );

    if (it) {
      setEstadoText(`Estado: ${it.estado} | Tiempo: ${msToHMS_(computeLiveMs_(it, nowMs))}`);
    }
  }
}

// --------------------------
// VIEW LIFECYCLE
// --------------------------
export function init() {
  initTecCards_();  // card hub navigation (TECNICO)
  initEstadoUI_();
  initVinAutocomplete_();
  initConversionQR_();
  initTecValidar_();

  initIncidenciasUI_();
  initConformidadUI_();
  initConfirmFinishUI_();
  initErrorModal();

  setConformidadAfterSaveRefresh_(async () => {
    await syncNow({ forceFull: true, showOut: false });
  });

  initRFModalUI_();
  initRFTecModalUI_();

  initConversionDelegation_();

  $("btnActivas")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });
  $('btnVerMisInc')?.addEventListener('click', async () => {
    if (CORE.state.currentModule !== 'TECNICO') return;
    const emailEl = document.getElementById('email');
    const email   = String(emailEl?.value || '').trim().toLowerCase();
    if (!email) return;

    // Abrir modal y mostrar loading
    const modal = document.getElementById('supIncModal');
    if (modal) { modal.classList.add('show'); }
    const infoEl = document.getElementById('supIncInfo');
    const listEl = document.getElementById('supIncList');
    const msgEl  = document.getElementById('supIncMsg');
    if (infoEl) infoEl.textContent = 'Cargando...';
    if (listEl) listEl.innerHTML  = '';
    if (msgEl)  msgEl.textContent  = '';

    try {
      const r = await getJSON(`/api/incidencias/by-tecnico?email=${encodeURIComponent(email)}&days=90`);
      if (!r?.ok) throw new Error(r?.error || 'Error al cargar incidencias');

      const nombre = r.nombre || email;
      if (infoEl) infoEl.textContent = `${nombre} — últimos 90 días`;

      const { renderIncidencias_ } = await import('../supervisor/sup-incidencias.js');
      const { escapeHtml: esc, fmtShort_: fmt } = await import('../../core/format.js');
      renderIncidencias_(
        { ok: true, items: r.items },
        { who: nombre, vin: '', conversionId: '' },
        { escapeHtml: esc, fmtShort_: fmt },
      );
    } catch (err) {
      if (infoEl) infoEl.textContent = '';
      if (msgEl)  msgEl.textContent  = `Error: ${err.message}`;
    }
  });
  $("btnFinalizados")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "TECNICO") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizados").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await fetchFinalizados_(email);
        if (j?.ok && Array.isArray(j.items)) {
          const { normalizeItem_ } = await import("./state/conversion-store.js");
          for (const raw of j.items) {
            const it = normalizeItem_(raw);
            const k = `${it.conversionId}|${it.rolTrabajo}`;
            c.itemsByKey.set(k, it);
          }
          rebuildListsFromStore_();
          c._finalizadosLoaded = true;
        }
      }
      renderFinalizados_();
    }, "Cargando finalizados...");
  });

  $("btnActivasQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => syncNow({ forceFull: true, showOut: true, _fromLock: true }), "Refrescando...");
  });

  // ─── Modal sugerencias calidad: 3 VINs más antiguos sin revisión iniciada ───
  $("btnSugQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    const modal = document.getElementById("calSugModal");
    const body  = document.getElementById("calSugBody");
    if (!modal || !body) return;

    body.innerHTML = `<div class="small muted">Cargando…</div>`;
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("show");

    try {
      const { escapeHtml, fmtShort_ } = await import("../../core/format.js");
      const j = await getJSON("/api/movilizador/status");
      if (!j?.ok) throw new Error(j?.error || "Error al cargar");

      // list2 tiene los VINs en zona de espera; filtrar los que NO están en EN_REVISION
      const pending = (j.list2 || [])
        .filter(r => r.estado !== "EN_REVISION")
        .sort((a, b) => new Date(a.trasladado_at || 0) - new Date(b.trasladado_at || 0))
        .slice(0, 3);

      if (!pending.length) {
        body.innerHTML = `<div class="small muted" style="padding:8px 0;">✅ No hay carros en espera sin revisión.</div>`;
        return;
      }

      body.innerHTML = pending.map((r, i) => `
        <div class="calSugCard">
          <span class="calSugNum">${i + 1}</span>
          <div class="calSugInfo">
            <span class="calSugVin">${escapeHtml(r.vin)}</span>
            <span class="calSugDate small muted">Traslado: ${fmtShort_(r.trasladado_at)}</span>
          </div>
        </div>
      `).join("");
    } catch (e) {
      body.innerHTML = `<div class="small" style="color:var(--danger);">Error: ${e.message}</div>`;
    }
  });

  document.getElementById("btnCalSugClose")?.addEventListener("click", () => {
    const modal = document.getElementById("calSugModal");
    if (modal) { modal.classList.remove("show"); modal.setAttribute("aria-hidden", "true"); }
  });
  document.getElementById("calSugModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove("show");
      e.currentTarget.setAttribute("aria-hidden", "true");
    }
  });

  $("btnFinalizadosQ")?.addEventListener("click", async () => {
    if (CORE.state.currentModule !== "CALIDAD") return;
    await withLock(async () => {
      const c = ctx_();
      c.showFinalizados = !c.showFinalizados;
      el_("btnFinalizadosQ").textContent = c.showFinalizados ? "Ocultar finalizados" : "Ver finalizados";
      if (c.showFinalizados && !c._finalizadosLoaded) {
        let email;
        try { email = requireEmailOrStop(); } catch { return; }
        const j = await fetchFinalizados_(email);
        if (j?.ok && Array.isArray(j.items)) {
          const { normalizeItem_, ensureNombresCache_ } = await import("./state/conversion-store.js");
          for (const raw of j.items) {
            const it = normalizeItem_(raw);
            const k = `${it.conversionId}|${it.rolTrabajo}`;
            c.itemsByKey.set(k, it);
          }
          // Enriquecer finalizados con nombres MOTOR/TANQUERO
          const byVin = await ensureNombresCache_();
          for (const [, it] of c.itemsByKey) {
            if (it && it.vin && !it.motorNombre && !it.tanqueroNombre) {
              const nombres = byVin.get(it.vin.toUpperCase().trim()) || {};
              it.motorNombre = nombres.motorNombre || "";
              it.tanqueroNombre = nombres.tanqueroNombre || "";
            }
          }
          rebuildListsFromStore_();
          c._finalizadosLoaded = true;
        }
      }
      renderFinalizados_();
    }, "Cargando finalizados...");
  });
}

export function enter(mod) {
  CORE.state.currentModule = mod;

  // 🚀 Inicializar Realtime subscriptions
  initializeRealtime_()
    .catch(e => console.warn("[enter] Realtime init error:", e.message));

  // Verificar incidencias no vistas (offline -> online / primer login)
  if (mod === "TECNICO") {
    showTecCards_();  // Mostrar cartillas al entrar

    const emailEl = document.getElementById("email");
    const email = String(emailEl?.value || "").trim().toLowerCase();
    if (email) {
      checkPendingAlerts_(email, 12).catch(() => {});
    }
    requestNotifPermission();
  }

  startLoopsFor_(mod, {
    syncNow,
    tickClocksUI: tickClocksUI_,
    refreshEstadoForVinRole,
  });
}

export function exit(mod) {
  stopLoopsFor_(mod);
  clearModuleUI_(mod);
  
  // 🚀 Limpiar Realtime subscriptions
  destroyRealtime_();
}

export { syncNow } from "./data/conversion-sync.js";