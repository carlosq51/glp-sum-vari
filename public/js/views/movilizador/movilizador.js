// =========================
// public/js/views/movilizador/movilizador.js
// Vista MOVILIZADOR – flujo de 3 etapas
//
// Lista 1: Conversión finalizada → pendientes de traslado
// Lista 2: En zona de calidad   → trasladados / entregados a calidad
// Lista 3: Listos para salir    → calidad finalizada
// =========================

import { CORE, escapeHtml, fmtShort_, getJSON, getJSON_user, postJSON } from "../../core/core.js";
import { updateHubModuleBadge } from "../../core/ui-shell.js";

let pollTimer = null;
const POLL_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────

function getMovNombre_() {
  return CORE.state.currentProfile?.nombre || CORE.state.currentProfile?.email || "Movilizador";
}

function fmtDate_(iso) {
  return iso ? fmtShort_(iso) : "—";
}

function setBadge_(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count > 0 ? String(count) : "";
  el.style.display = count > 0 ? "inline-flex" : "none";
}

// ─── Render ───────────────────────────────────────────────────────────

function renderList1_(rows) {
  const box = document.getElementById("movPanel1Body");
  if (!box) return;
  setBadge_("movBadge1", rows.length);
  updateHubModuleBadge("MOVILIZADOR", rows.length);

  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">Sin conversiones finalizadas pendientes.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="movCardList">
      ${rows.map(r => `
        <div class="movCard">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            <span class="movCardDate">${fmtDate_(r.fecha)}</span>
          </div>
          <button class="movBtnAction btnTrasladar movBtnFull"
            data-vin="${escapeHtml(r.vin)}" type="button">
            Mover a zona de espera ▶
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderList2_(rows) {
  const box = document.getElementById("movPanel2Body");
  if (!box) return;
  setBadge_("movBadge2", rows.length);

  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">Ningún vehículo en zona de espera.</div>`;
    return;
  }

  // Ordenar: En zona de espera (TRASLADADO) primero, luego en proceso de revisión
  const sorted = [...rows].sort((a, b) => {
    const pa = a.estado === "TRASLADADO" ? 0 : 1;
    const pb = b.estado === "TRASLADADO" ? 0 : 1;
    return pa - pb;
  });

  box.innerHTML = `
    <div class="movCardList">
      ${sorted.map(r => `
        <div class="movCard">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            ${r.estado === "TRASLADADO"
              ? `<span class="badge badge-warn">En zona de espera</span>`
              : `<span class="badge badge-note">En proceso de revisión</span>`
            }
          </div>
          ${r.trasladado_at ? `<div class="movCardSub">Trasladado: ${fmtDate_(r.trasladado_at)}</div>` : ""}
          ${r.estado === "TRASLADADO" ? `
            <button class="movBtnAction btnEntregarCalidad movBtnFull"
              data-vin="${escapeHtml(r.vin)}" type="button">
              Mover a revisión técnica ▶
            </button>
          ` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderList3_(rows) {
  const box = document.getElementById("movPanel3Body");
  if (!box) return;
  setBadge_("movBadge3", rows.length);

  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">No hay vehículos listos para trasladar a otras áreas.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="movCardList">
      ${rows.map(r => `
        <div class="movCard">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            <span class="movCardDate">${fmtDate_(r.fecha_calidad)}</span>
          </div>
          <button class="movBtnAction btnEntregarFinal movBtnFull"
            data-vin="${escapeHtml(r.vin)}" type="button">
            Trasladar ▶
          </button>
        </div>
      `).join("")}
    </div>
  `;
}

// ─── Fetch ────────────────────────────────────────────────────────────

async function refreshAll_() {
  const statusEl = document.getElementById("movStatus");
  const refreshBtn = document.getElementById("btnMovRefresh");
  try {
    if (statusEl) statusEl.textContent = "Actualizando…";
    if (refreshBtn) refreshBtn.disabled = true;

    const j = await getJSON("/api/movilizador/status");
    if (!j?.ok) throw new Error(j?.error || "Error cargando estado");

    renderList1_(j.list1 || []);
    renderList2_(j.list2 || []);
    renderList3_(j.list3 || []);

    if (statusEl) {
      const t = new Date();
      statusEl.textContent = `Actualizado ${t.toLocaleTimeString("es-PE")}`;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = e.message || "Error";
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// ─── Actions ──────────────────────────────────────────────────────────

async function handleAction_(vin, accion, btn) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Guardando…";
  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin,
      accion,
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");
    await refreshAll_();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = originalText;
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
  }
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

// ─── Poll ─────────────────────────────────────────────────────────────

function startPoll_() {
  stopPoll_();
  pollTimer = setInterval(() => refreshAll_().catch(() => {}), POLL_MS);
}

function stopPoll_() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ─── Public API ───────────────────────────────────────────────────────

export function init() {
  document.getElementById("btnMovRefresh")?.addEventListener("click", () => {
    refreshAll_().catch(() => {});
  });

  // Delegación de eventos para botones de acción
  document.getElementById("viewMOVILIZADOR")?.addEventListener("click", e => {
    const btn = e.target.closest(".movBtnAction");
    if (!btn) return;
    const vin = btn.dataset.vin;
    if (!vin) return;
    if (btn.classList.contains("btnTrasladar")) {
      handleAction_(vin, "TRASLADAR", btn).catch(() => {});
    } else if (btn.classList.contains("btnEntregarCalidad")) {
      handleAction_(vin, "ENTREGAR_CALIDAD", btn).catch(() => {});
    } else if (btn.classList.contains("btnEntregarFinal")) {
      handleAction_(vin, "ENTREGAR_FINAL", btn).catch(() => {});
    }
  });

  bindPanelToggles_();
}

export function enter() {
  refreshAll_().catch(() => {});
  startPoll_();
}

export function exit() {
  stopPoll_();
}
