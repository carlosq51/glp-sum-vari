// =========================
// public/js/views/movilizador/movilizador.js
// Vista MOVILIZADOR – flujo de 3 etapas
//
// Lista 1: Conversión finalizada → pendientes de traslado
// Lista 2: En zona de calidad   → trasladados / entregados a calidad
// Lista 3: Listos para salir    → calidad finalizada
// =========================

import { CORE, escapeHtml, fmtShort_, getJSON_user, postJSON } from "../../core/core.js";
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
    <div class="tableWrap">
      <table class="table movTable">
        <thead>
          <tr>
            <th>VIN</th>
            <th>Fecha conv.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="movVin">${escapeHtml(r.vin)}</td>
              <td>${fmtDate_(r.fecha)}</td>
              <td>
                <button class="movBtnAction btnTrasladar"
                  data-vin="${escapeHtml(r.vin)}" type="button">
                  Mover a zona de espera ▶
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
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

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table movTable">
        <thead>
          <tr>
            <th>VIN</th>
            <th>Trasladado</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="movVin">${escapeHtml(r.vin)}</td>
              <td>${fmtDate_(r.trasladado_at)}</td>
              <td>
                ${r.estado === "ENTREGADO_CALIDAD"
                  ? `<span class="badge badge-note">En revisión técnica</span>`
                  : `<span class="badge badge-warn">En zona de espera</span>`
                }
              </td>
              <td>
                ${r.estado === "TRASLADADO" ? `
                  <button class="movBtnAction btnEntregarCalidad"
                    data-vin="${escapeHtml(r.vin)}" type="button">
                    Entregar a revisión técnica ▶
                  </button>
                ` : `<span class="muted small">—</span>`}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
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
    <div class="tableWrap">
      <table class="table movTable">
        <thead>
          <tr>
            <th>VIN</th>
            <th>Revisión técnica finalizada</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="movVin">${escapeHtml(r.vin)}</td>
              <td>${fmtDate_(r.fecha_calidad)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
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

    const j = await getJSON_user("/api/movilizador/status", "Cargando movilizador...");
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
