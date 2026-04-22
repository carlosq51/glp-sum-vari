// =========================
// public/js/views/ramalero/ramalero-solicitudes.js
// Panel de solicitudes de ramal para el ramalero
// =========================

import { getJSON, postJSON, escapeHtml, fmtShort_, requireEmailOrStop } from "../../core/core.js";

const OVERLAY_ID = "solRamalOverlay";

// ─── overlay ─────────────────────────────────────────────────────────────────

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
    <div id="solRamalBox" style="
      background:var(--card-bg,#1e1e2e);
      color:var(--text-primary,#cdd6f4);
      border-radius:12px;
      padding:20px;
      width:100%;
      max-width:480px;
      max-height:82vh;
      overflow-y:auto;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      display:flex;
      flex-direction:column;
      gap:14px;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="font-size:1.1rem;">🔩 Solicitudes de ramal</strong>
        <button id="solRamalClose" style="
          background:none;border:none;cursor:pointer;
          font-size:1.4rem;color:var(--text-primary,#cdd6f4);
          line-height:1;padding:2px 6px;
        ">×</button>
      </div>

      <div>
        <div style="font-weight:700;font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;
                    color:#f38ba8;margin-bottom:8px;border-bottom:1px solid rgba(243,139,168,.25);padding-bottom:4px;">
          ⏳ Por entregar
        </div>
        <div id="solRamalPendientes" style="display:flex;flex-direction:column;gap:8px;">
          <p style="opacity:.5;font-size:.85rem;">Cargando...</p>
        </div>
      </div>

      <div>
        <div style="font-weight:700;font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;
                    color:#a6e3a1;margin-bottom:8px;border-bottom:1px solid rgba(166,227,161,.25);padding-bottom:4px;">
          ✅ Entregados hoy
        </div>
        <div id="solRamalEntregados" style="display:flex;flex-direction:column;gap:8px;">
          <p style="opacity:.5;font-size:.85rem;">Cargando...</p>
        </div>
      </div>
    </div>
  `;

  el.addEventListener("click", (e) => {
    if (e.target === el) closePanel_();
  });

  document.body.appendChild(el);

  document.getElementById("solRamalClose")?.addEventListener("click", closePanel_);

  // ── delegación ÚNICA en el box — sin acumulación de listeners ──────────
  document.getElementById("solRamalBox")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-entregar]");
    if (!btn) return;
    e.stopPropagation();

    const id = btn.dataset.entregar;
    let email;
    try { email = requireEmailOrStop(); } catch { return; }

    btn.disabled = true;
    btn.textContent = "...";

    try {
      const r = await postJSON(`/api/solicitud-ramal/${id}/entregar`, { email });
      if (r?.ok) {
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
  });

  return el;
}

function closePanel_() {
  document.getElementById(OVERLAY_ID)?.remove();
}

// ─── render ──────────────────────────────────────────────────────────────────

function renderCard_(sol) {
  const when = fmtShort_(sol.created_at);
  const nota = sol.nota
    ? `<div style="font-size:.8rem;opacity:.7;margin-top:3px;">${escapeHtml(sol.nota)}</div>`
    : "";
  const isEntregado = sol.estado === "ENTREGADO";

  const accion = isEntregado
    ? `<div style="text-align:right;flex-shrink:0;">
        <span style="font-size:.8rem;color:#a6e3a1;white-space:nowrap;">✅ Entregado</span><br>
        <span style="opacity:.55;font-size:.72rem;">${fmtShort_(sol.entregado_at)}</span>
       </div>`
    : `<button data-entregar="${sol.id}" style="
        white-space:nowrap;align-self:flex-start;flex-shrink:0;
        background:#a6e3a1;color:#1e1e2e;
        border:none;border-radius:6px;
        padding:8px 12px;font-size:.85rem;font-weight:700;
        cursor:pointer;
      ">✅ Entregar</button>`;

  return `
    <div style="
      background:var(--surface,rgba(255,255,255,.06));
      border-radius:8px;padding:12px;
      border-left:3px solid ${isEntregado ? "#a6e3a1" : "#f38ba8"};
    ">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:600;">${escapeHtml(sol.tecnico_nombre || sol.tecnico_email || "—")}</div>
          <div style="font-size:.82rem;opacity:.8;margin-top:2px;">
            VIN: <code style="color:#89b4fa;">${escapeHtml(sol.vin || "—")}</code>
          </div>
          ${nota}
          <div style="font-size:.72rem;opacity:.5;margin-top:4px;">${when}</div>
        </div>
        ${accion}
      </div>
    </div>
  `;
}

async function loadAndRender_() {
  const elPend = document.getElementById("solRamalPendientes");
  const elEntr = document.getElementById("solRamalEntregados");
  if (!elPend || !elEntr) return;

  elPend.innerHTML = `<p style="opacity:.5;font-size:.85rem;">Cargando...</p>`;
  elEntr.innerHTML = `<p style="opacity:.5;font-size:.85rem;">Cargando...</p>`;

  let items = [];
  try {
    const res = await getJSON("/api/solicitud-ramal/pendientes");
    if (!res?.ok) {
      elPend.innerHTML = `<p style="color:#f38ba8;">${escapeHtml(res?.error || "Error al cargar")}</p>`;
      elEntr.innerHTML = "";
      return;
    }
    items = res.items || [];
  } catch {
    elPend.innerHTML = `<p style="color:#f38ba8;">Error de red</p>`;
    elEntr.innerHTML = "";
    return;
  }

  const pendientes = items.filter(s => s.estado === "PENDIENTE");
  const entregados = items.filter(s => s.estado === "ENTREGADO");

  elPend.innerHTML = pendientes.length
    ? pendientes.map(renderCard_).join("")
    : `<p style="opacity:.5;font-size:.85rem;">Sin solicitudes pendientes 🎉</p>`;

  elEntr.innerHTML = entregados.length
    ? entregados.map(renderCard_).join("")
    : `<p style="opacity:.5;font-size:.85rem;">Ninguna entregada hoy aún.</p>`;
}

// ─── badge ───────────────────────────────────────────────────────────────────

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

// ─── init ────────────────────────────────────────────────────────────────────

export function initRamaleroSolicitudes_() {
  const btn = document.getElementById("btnVerSolicitudesR");
  if (!btn) return;

  btn.addEventListener("click", openSolicitudesPanel_);

  updateBadge_();
}

export function openSolicitudesPanel_() {
  closePanel_();
  createOverlay_();
  loadAndRender_();
}
