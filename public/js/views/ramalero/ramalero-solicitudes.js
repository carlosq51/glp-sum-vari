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

  // Qué tipo de ramal sale. Es el único momento en que alguien lo tiene
  // en la mano y lo sabe, y es lo que permite descontarlo del stock
  // (ver supabase/ramales.sql). Se puede saltar: la entrega no se bloquea
  // por esto, solo queda sin descontar. `null` = canceló la entrega.
  const tipoRamal = await pedirTipoRamal_();
  if (tipoRamal === null) return;

  btn.disabled = true;
  btn.textContent = "…";
  try {
    const r = await postJSON(`/api/solicitud-ramal/${btn.dataset.entregar}/entregar`, {
      email,
      ...(tipoRamal ? { tipo_ramal: tipoRamal } : {}),
    });
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

// Tipos que maneja el taller (espejo del enum `tipo_ramal` en schema.sql).
const TIPOS_RAMAL_ = ["JETOUR", "VOLKSWAGEN", "KYC V3", "KYC V5", "KYC V7", "KYC X5"];

/**
 * Pregunta qué tipo de ramal sale, para descontarlo del stock.
 *
 * Resuelve con "" si el ramalero lo salta, y con null si cancela.
 * Saltarlo NO bloquea la entrega: el trabajo del taller manda sobre el
 * inventario. Un ramal entregado sin registrar el tipo es un dato menos;
 * un técnico esperando porque la app no le deja recibirlo es un carro
 * parado.
 */
function pedirTipoRamal_() {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "modal show";
    m.innerHTML = `
      <div class="modalBox rmModalBox" style="width:min(420px,94vw);">
        <div class="modalHead"><span class="modalTitle">¿Qué ramal le entregas?</span></div>
        <div class="modalBody">
          <div class="rmForm">
            <div class="rmField">
              <label for="rmEntTipo">Tipo de ramal</label>
              <select id="rmEntTipo">
                ${TIPOS_RAMAL_.map(t => `<option value="${t}">${t}</option>`).join("")}
              </select>
              <span class="rmField__hint">
                Con esto se descuenta del stock de ramales armados.
              </span>
            </div>
          </div>
        </div>
        <div class="rmModalFoot">
          <button type="button" class="btn3" data-ent="skip">Entregar sin registrar</button>
          <button type="button" class="btn3 rmBtn--primary" data-ent="ok">Entregar</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    document.body.classList.add("modal-open");

    const cerrar = (valor) => {
      m.remove();
      if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
      resolve(valor);
    };
    m.querySelector('[data-ent="ok"]').addEventListener("click",
      () => cerrar(m.querySelector("#rmEntTipo").value));
    m.querySelector('[data-ent="skip"]').addEventListener("click", () => cerrar(""));
    // Clic fuera o Escape = cancelar la entrega entera, no entregar a ciegas.
    m.addEventListener("click", (e) => { if (e.target === m) cerrar(null); });
    setTimeout(() => m.querySelector("#rmEntTipo")?.focus(), 80);
  });
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

  // El armado de ramales ya no es una sección colapsable: abre la vista.
  // Su toggle vivía aquí y se fue con él (ver ramalero-view.js).
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
