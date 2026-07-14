// =========================
// public/js/views/ramalero/ramalero-solicitudes.js
// Cola de solicitudes de ramal — INLINE y EN VIVO en la vista del ramalero.
//
// - La cola es el trabajo principal del ramalero: vive al frente de la
//   vista (ya no escondida en un modal).
// - Se refresca sola: evento SSE "ramal" (core/live.js) + poll de respaldo
//   gobernado por config (POLL_RAMALERO_SOL_MS).
// - El primero de la cola se destaca como SIGUIENTE; la espera se muestra
//   en tiempo relativo auto-actualizado.
// =========================

import { getJSON, postJSON, escapeHtml, fmtShort_, requireEmailOrStop } from "../../core/core.js";
import { startPoll, stopPoll } from "../../core/poll.js";
import { relTimeText, startRelTimeTicker, skeletonHTML } from "../../core/ui-dynamics.js";

let _bound = false;
let _loading = false;

// ─── stats ───────────────────────────────────────────────────────────────────

function fmtWait_(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function renderStats_(pendientes, entregados) {
  const elP = document.getElementById("solStatPend");
  const elE = document.getElementById("solStatEntr");
  const elW = document.getElementById("solStatWait");
  if (elP) {
    elP.textContent = String(pendientes.length);
    elP.style.color = pendientes.length > 0 ? "var(--warn)" : "var(--ok)";
  }
  if (elE) elE.textContent = String(entregados.length);
  if (elW) {
    const waits = pendientes
      .map(s => Date.now() - new Date(s.created_at || 0).getTime())
      .filter(ms => Number.isFinite(ms) && ms >= 0);
    elW.textContent = waits.length
      ? fmtWait_(waits.reduce((a, b) => a + b, 0) / waits.length)
      : "—";
  }
}

// ─── cards ───────────────────────────────────────────────────────────────────

function renderPendingCard_(sol, idx) {
  const isNext = idx === 0;
  const yaNotificado = !!sol.notificado_at;
  const modelo = sol.modelo_normalizado
    ? `<span class="pill small" style="margin-left:6px;">${escapeHtml(sol.modelo_normalizado)}</span>`
    : "";
  const nota = sol.nota
    ? `<div class="small" style="color:var(--muted);margin-top:3px;">💬 ${escapeHtml(sol.nota)}</div>`
    : "";

  return `
    <div style="
      background:${isNext ? "var(--warnBgFade)" : "var(--surface)"};
      border:1px solid ${isNext ? "var(--warn)" : "var(--surfaceLine)"};
      border-left:4px solid ${isNext ? "var(--warn)" : "var(--surfaceLine)"};
      border-radius:var(--radiusSm);
      padding:12px;margin-bottom:8px;
      ${isNext ? "box-shadow:var(--elev-1);" : ""}
    ">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="
          flex-shrink:0;min-width:26px;height:26px;border-radius:50%;
          background:${isNext ? "var(--warn)" : "var(--pillBg)"};
          color:${isNext ? "var(--btnText)" : "var(--muted)"};
          display:flex;align-items:center;justify-content:center;
          font-size:.78em;font-weight:900;
        ">${idx + 1}</span>

        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:800;">${escapeHtml(sol.tecnico_nombre || sol.tecnico_email || "—")}</span>
            ${isNext ? `<span class="pill small" style="background:var(--warnBg);color:var(--warn);border-color:var(--warn);font-weight:900;">SIGUIENTE</span>` : ""}
          </div>
          <div class="small" style="color:var(--muted);margin-top:2px;">
            VIN: <code style="color:var(--note);">${escapeHtml(sol.vin || "—")}</code>${modelo}
          </div>
          ${nota}
          <div class="small" style="color:var(--warn);margin-top:4px;font-weight:700;">
            ⏳ solicitado <span data-reltime="${escapeHtml(sol.created_at || "")}">${relTimeText(sol.created_at)}</span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          <button data-notificar="${sol.id}" ${yaNotificado ? "disabled" : ""} style="
            white-space:nowrap;min-height:var(--h-btn-sm);
            background:${yaNotificado ? "var(--noteBg)" : "var(--note)"};
            color:${yaNotificado ? "var(--note)" : "var(--bg0)"};
            border:1px solid ${yaNotificado ? "var(--note)" : "transparent"};
            border-radius:var(--radiusSm);padding:6px 12px;
            font-size:.84em;font-weight:800;
            cursor:${yaNotificado ? "default" : "pointer"};
            opacity:${yaNotificado ? ".7" : "1"};
          ">${yaNotificado ? "🔔 Avisado" : "🔔 Notificar"}</button>
          <button data-entregar="${sol.id}" style="
            white-space:nowrap;min-height:var(--h-btn-sm);
            background:var(--ok);color:var(--bg0);
            border:none;border-radius:var(--radiusSm);
            padding:6px 12px;font-size:.84em;font-weight:800;cursor:pointer;
          ">✅ Entregar</button>
        </div>
      </div>
    </div>`;
}

function renderEntregadoCard_(sol) {
  return `
    <div style="
      background:var(--surface);border-radius:var(--radiusSm);
      padding:10px 12px;margin-bottom:6px;
      border-left:3px solid var(--ok);opacity:.85;
    ">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-weight:700;">${escapeHtml(sol.tecnico_nombre || sol.tecnico_email || "—")}</span>
        <code class="small" style="color:var(--note);">${escapeHtml(sol.vin || "—")}</code>
        <span class="small" style="margin-left:auto;color:var(--ok);">✅ ${fmtShort_(sol.entregado_at)}</span>
      </div>
      ${sol.entregado_por ? `<div class="small" style="color:var(--muted);margin-top:2px;">por ${escapeHtml(sol.entregado_por)}</div>` : ""}
    </div>`;
}

// ─── carga + render ──────────────────────────────────────────────────────────

async function loadAndRender_() {
  if (_loading) return;
  _loading = true;
  const elQueue = document.getElementById("solQueueBox");
  const elEntr  = document.getElementById("solEntregadosBox");
  try {
    const res = await getJSON("/api/solicitud-ramal/pendientes");
    if (!res?.ok) {
      if (elQueue) elQueue.innerHTML = `<p class="small" style="color:var(--danger);">⚠ ${escapeHtml(res?.error || "Error al cargar")}</p>`;
      return;
    }
    const items      = res.items || [];
    const pendientes = items.filter(s => s.estado === "PENDIENTE");
    const entregados = items.filter(s => s.estado === "ENTREGADO");

    renderStats_(pendientes, entregados);

    if (elQueue) {
      elQueue.innerHTML = pendientes.length
        ? pendientes.map(renderPendingCard_).join("")
        : `<div style="padding:18px;text-align:center;">
             <div style="font-size:2em;">🎉</div>
             <div class="small" style="color:var(--muted);margin-top:4px;">Cola vacía — sin solicitudes pendientes.</div>
           </div>`;
    }
    if (elEntr) {
      elEntr.innerHTML = entregados.length
        ? entregados.map(renderEntregadoCard_).join("")
        : `<p class="small" style="color:var(--muted);padding:4px 2px;">Ninguna entregada hoy aún.</p>`;
    }
    const cnt = document.getElementById("solEntregadosCount");
    if (cnt) cnt.textContent = String(entregados.length);
  } catch {
    if (elQueue) elQueue.innerHTML = `<p class="small" style="color:var(--danger);">Error de red</p>`;
  } finally {
    _loading = false;
  }
}

// ─── acciones (delegación única) ─────────────────────────────────────────────

async function onQueueClick_(e) {
  // Notificar (push al técnico: "tu ramal está listo")
  const btnNotif = e.target.closest("[data-notificar]");
  if (btnNotif && !btnNotif.disabled) {
    const id = btnNotif.dataset.notificar;
    btnNotif.disabled = true;
    btnNotif.textContent = "…";
    try {
      const r = await postJSON(`/api/solicitud-ramal/${id}/notificar`, {});
      if (!r?.ok) { btnNotif.disabled = false; btnNotif.textContent = "🔔 Notificar"; }
      await loadAndRender_();
    } catch {
      btnNotif.disabled = false;
      btnNotif.textContent = "🔔 Notificar";
    }
    return;
  }

  // Entregar
  const btn = e.target.closest("[data-entregar]");
  if (!btn || btn.disabled) return;
  let email;
  try { email = requireEmailOrStop(); } catch { return; }
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const r = await postJSON(`/api/solicitud-ramal/${btn.dataset.entregar}/entregar`, { email });
    if (!r?.ok) {
      btn.disabled = false;
      btn.textContent = "✅ Entregar";
      alert(r?.error || "Error al marcar como entregado");
      return;
    }
    await loadAndRender_();
  } catch {
    btn.disabled = false;
    btn.textContent = "✅ Entregar";
  }
}

// ─── ciclo de vida ───────────────────────────────────────────────────────────

export function initRamaleroSolicitudes_() {
  if (_bound) return;
  _bound = true;

  document.getElementById("solQueueBox")?.addEventListener("click", onQueueClick_);

  // Toggle "Entregados hoy"
  document.getElementById("solEntregadosToggle")?.addEventListener("click", () => {
    const box  = document.getElementById("solEntregadosBox");
    const chev = document.getElementById("solEntregadosChev");
    if (!box) return;
    const open = box.style.display === "none";
    box.style.display = open ? "" : "none";
    if (chev) chev.textContent = open ? "▼" : "▶";
  });

  // Toggle "Armado de ramales"
  document.getElementById("ramalArmadoToggle")?.addEventListener("click", () => {
    const body = document.getElementById("ramalArmadoBody");
    const chev = document.getElementById("ramalArmadoChev");
    if (!body) return;
    const open = body.style.display === "none";
    body.style.display = open ? "" : "none";
    if (chev) chev.textContent = open ? "▼" : "▶";
  });
}

export function enterSolicitudes_() {
  startRelTimeTicker(); // mantiene frescos los "hace X min" de la cola

  const elQueue = document.getElementById("solQueueBox");
  if (elQueue && !elQueue.children.length) elQueue.innerHTML = skeletonHTML(3, { height: 84 });

  loadAndRender_();
  // Poll de respaldo gobernado por config. El refresh instantáneo llega por
  // SSE: core/live.js mapea el topic "ramal" → pollNow de esta clave.
  startPoll("POLL_RAMALERO_SOL_MS", loadAndRender_, { immediate: false });
}

export function exitSolicitudes_() {
  stopPoll("POLL_RAMALERO_SOL_MS");
}
