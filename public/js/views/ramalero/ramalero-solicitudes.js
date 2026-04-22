// =========================
// public/js/views/ramalero/ramalero-solicitudes.js
// Panel de solicitudes de ramal para el ramalero
// =========================

import { CORE, getJSON, postJSON, escapeHtml, fmtShort_, requireEmailOrStop } from "../../core/core.js";

const OVERLAY_ID = "solRamalOverlay";

// ─── helpers ────────────────────────────────────────────────────────────────

function createOverlay_() {
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.style.cssText = [
    "position:fixed;inset:0;z-index:9000;",
    "background:rgba(0,0,0,.65);",
    "display:flex;align-items:center;justify-content:center;",
    "padding:16px;",
  ].join("");

  el.innerHTML = `
    <div style="
      background:var(--card-bg,#1e1e2e);
      color:var(--text-primary,#cdd6f4);
      border-radius:12px;
      padding:20px;
      width:100%;
      max-width:480px;
      max-height:80vh;
      overflow-y:auto;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <strong style="font-size:1.1rem;">🔩 Solicitudes de ramal</strong>
        <button id="solRamalClose" style="
          background:none;border:none;cursor:pointer;
          font-size:1.4rem;color:var(--text-primary,#cdd6f4);
          line-height:1;padding:2px 6px;
        ">×</button>
      </div>
      <div id="solRamalList" style="display:flex;flex-direction:column;gap:10px;">
        <p style="opacity:.6;font-size:.9rem;">Cargando...</p>
      </div>
    </div>
  `;

  el.addEventListener("click", (e) => {
    if (e.target === el) closePanel_();
  });
  document.body.appendChild(el);
  return el;
}

function closePanel_() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function renderItem_(sol) {
  const when = fmtShort_(sol.created_at);
  const nota = sol.nota ? `<div style="font-size:.8rem;opacity:.7;margin-top:4px;">${escapeHtml(sol.nota)}</div>` : "";
  const isEntregado = sol.estado === "ENTREGADO";

  return `
    <div data-sol-id="${sol.id}" style="
      background:var(--surface,rgba(255,255,255,.06));
      border-radius:8px;
      padding:12px;
      border-left:3px solid ${isEntregado ? "#a6e3a1" : "#f38ba8"};
    ">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-weight:600;">${escapeHtml(sol.tecnico_nombre || sol.tecnico_email || "—")}</div>
          <div style="font-size:.85rem;opacity:.8;">VIN: <code>${escapeHtml(sol.vin || "—")}</code></div>
          ${nota}
          <div style="font-size:.75rem;opacity:.55;margin-top:4px;">${when}</div>
        </div>
        ${isEntregado
          ? `<span style="font-size:.8rem;color:#a6e3a1;white-space:nowrap;">✅ Entregado</span>`
          : `<button data-entregar="${sol.id}" style="
              white-space:nowrap;
              background:#a6e3a1;color:#1e1e2e;
              border:none;border-radius:6px;
              padding:6px 10px;font-size:.8rem;font-weight:700;
              cursor:pointer;flex-shrink:0;
            ">✅ Entregar</button>`
        }
      </div>
    </div>
  `;
}

async function loadAndRender_() {
  const list = document.getElementById("solRamalList");
  if (!list) return;

  list.innerHTML = `<p style="opacity:.6;font-size:.9rem;">Cargando...</p>`;

  try {
    const res = await getJSON("/api/solicitud-ramal/pendientes");
    if (!res?.ok) {
      list.innerHTML = `<p style="color:#f38ba8;">${escapeHtml(res?.error || "Error al cargar")}</p>`;
      return;
    }

    const items = res.items || [];
    if (items.length === 0) {
      list.innerHTML = `<p style="opacity:.6;font-size:.9rem;">No hay solicitudes pendientes.</p>`;
      return;
    }

    list.innerHTML = items.map(renderItem_).join("");

    // bind "Entregar" buttons
    list.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-entregar]");
      if (!btn) return;
      e.stopPropagation();
      const id = btn.dataset.entregar;
          let email;
          try { email = requireEmailOrStop(); } catch { return; }
      try {
        const r = await postJSON(`/api/solicitud-ramal/${id}/entregar`, { email });
        if (r?.ok) {
          // refresh list
          await loadAndRender_();
          updateBadge_();
        } else {
          btn.disabled = false;
          btn.textContent = "✅ Entregar";
          alert(r?.error || "Error al marcar como entregado");
        }
      } catch {
        btn.disabled = false;
        btn.textContent = "✅ Entregar";
      }
    }, { once: false });
  } catch (err) {
    list.innerHTML = `<p style="color:#f38ba8;">Error de red</p>`;
  }
}

// ─── badge (counter on the button) ──────────────────────────────────────────

export async function updateBadge_() {
  const badge = document.getElementById("solRamalBadge");
  if (!badge) return;
  try {
    const res = await getJSON("/api/solicitud-ramal/pendientes");
    const count = (res?.items || []).filter(s => s.estado === "PENDIENTE").length;
    badge.textContent = count > 0 ? String(count) : "";
    badge.style.display = count > 0 ? "inline-flex" : "none";
  } catch { /* ignore */ }
}

// ─── public API ─────────────────────────────────────────────────────────────

export function initRamaleroSolicitudes_() {
  const btn = document.getElementById("btnVerSolicitudesR");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (CORE.state.currentModule !== "RAMALERO") return;
    openSolicitudesPanel_();
  });

  // initial badge load
  updateBadge_();
}

export function openSolicitudesPanel_() {
  closePanel_();
  const overlay = createOverlay_();
  document.getElementById("solRamalClose")?.addEventListener("click", closePanel_);
  loadAndRender_();
}
