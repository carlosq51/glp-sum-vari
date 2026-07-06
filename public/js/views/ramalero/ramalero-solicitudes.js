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
    "background:var(--backdrop);",
    "display:flex;align-items:center;justify-content:center;",
    "padding:16px;",
  ].join("");

  el.innerHTML = `
    <div id="solRamalBox" style="
      background:var(--bg1);
      color:var(--text);
      border-radius:var(--radius);
      padding:20px;
      width:100%;
      max-width:480px;
      max-height:82vh;
      overflow-y:auto;
      box-shadow:var(--shadow);
      display:flex;
      flex-direction:column;
      gap:14px;
      border:1px solid var(--surfaceLine);
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="font-size:1.1rem;">🔩 Solicitudes de ramal</strong>
        <button id="solRamalClose" style="
          background:none;border:none;cursor:pointer;
          font-size:1.4rem;color:var(--text);
          line-height:1;padding:2px 6px;opacity:.7;
        ">×</button>
      </div>

      <div>
        <div style="
          font-weight:700;font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;
          color:var(--danger);margin-bottom:8px;
          border-bottom:1px solid var(--dangerBg);padding-bottom:4px;
        ">⏳ Por entregar</div>
        <div id="solRamalPendientes" style="display:flex;flex-direction:column;gap:8px;">
          <p style="opacity:.5;font-size:.85rem;">Cargando...</p>
        </div>
      </div>

      <div>
        <div style="
          font-weight:700;font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;
          color:var(--ok);margin-bottom:8px;
          border-bottom:1px solid var(--okBg);padding-bottom:4px;
        ">✅ Entregados hoy</div>
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
    // Botón Notificar
    const btnNotif = e.target.closest("[data-notificar]");
    if (btnNotif && !btnNotif.disabled) {
      e.stopPropagation();
      const id = btnNotif.dataset.notificar;
      btnNotif.disabled = true;
      btnNotif.textContent = "...";
      try {
        const r = await postJSON(`/api/solicitud-ramal/${id}/notificar`, {});
        if (r?.ok) {
          await loadAndRender_();
        } else {
          btnNotif.disabled = false;
          btnNotif.textContent = "🔔 Notificar";
        }
      } catch {
        btnNotif.disabled = false;
        btnNotif.textContent = "🔔 Notificar";
      }
      return;
    }

    // Botón Entregar
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

function tiempoEspera_(created_at) {
  if (!created_at) return "";
  const ms = Date.now() - new Date(created_at).getTime();
  if (ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1)  return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `hace ${h}h ${m}min` : `hace ${h}h`;
}

function renderCard_(sol) {
  const when = fmtShort_(sol.created_at);
  const nota = sol.nota
    ? `<div style="font-size:.8rem;color:var(--muted);margin-top:3px;">${escapeHtml(sol.nota)}</div>`
    : "";
  const isEntregado = sol.estado === "ENTREGADO";
  const yaNotificado = !!sol.notificado_at;

  const modelo = sol.modelo_normalizado
    ? `<span style="color:var(--note);font-size:.78rem;margin-left:6px;">${escapeHtml(sol.modelo_normalizado)}</span>`
    : "";

  const espera = !isEntregado
    ? `<span style="font-size:.72rem;color:var(--warn);margin-left:4px;">(${tiempoEspera_(sol.created_at)})</span>`
    : "";

  const accion = isEntregado
    ? `<div style="text-align:right;flex-shrink:0;">
        <span style="font-size:.8rem;color:var(--ok);white-space:nowrap;">✅ Entregado</span><br>
        <span style="font-size:.72rem;color:var(--muted);">${fmtShort_(sol.entregado_at)}</span>
        ${sol.entregado_por ? `<br><span style="font-size:.72rem;color:var(--muted);">por ${escapeHtml(sol.entregado_por)}</span>` : ""}
       </div>`
    : `<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
        <button data-notificar="${sol.id}" ${yaNotificado ? "disabled" : ""} style="
          white-space:nowrap;
          background:${yaNotificado ? "var(--noteBg)" : "var(--note)"};
          color:${yaNotificado ? "var(--note)" : "var(--bg0)"};
          border:1px solid ${yaNotificado ? "var(--note)" : "transparent"};
          border-radius:var(--radiusSm);padding:6px 10px;
          font-size:.82rem;font-weight:700;
          cursor:${yaNotificado ? "default" : "pointer"};
          opacity:${yaNotificado ? ".75" : "1"};
        ">${yaNotificado ? "🔔 Notificado" : "🔔 Notificar"}</button>
        <button data-entregar="${sol.id}" style="
          white-space:nowrap;
          background:var(--ok);color:var(--bg0);
          border:none;border-radius:var(--radiusSm);
          padding:6px 10px;font-size:.82rem;font-weight:700;cursor:pointer;
        ">✅ Entregar</button>
       </div>`;

  return `
    <div style="
      background:var(--surface);
      border-radius:var(--radiusSm);
      padding:12px;
      border-left:3px solid ${isEntregado ? "var(--ok)" : "var(--danger)"};
    ">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:600;color:var(--text);">${escapeHtml(sol.tecnico_nombre || sol.tecnico_email || "—")}</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:2px;">
            VIN: <code style="color:var(--note);">${escapeHtml(sol.vin || "—")}</code>${modelo}
          </div>
          ${nota}
          <div style="font-size:.72rem;color:var(--muted);margin-top:4px;">${when}${espera}</div>
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
      elPend.innerHTML = `<p style="color:var(--danger);">${escapeHtml(res?.error || "Error al cargar")}</p>`;
      elEntr.innerHTML = "";
      return;
    }
    items = res.items || [];
  } catch {
    elPend.innerHTML = `<p style="color:var(--danger);">Error de red</p>`;
    elEntr.innerHTML = "";
    return;
  }

  const pendientes = items.filter(s => s.estado === "PENDIENTE");
  const entregados = items.filter(s => s.estado === "ENTREGADO");

  elPend.innerHTML = pendientes.length
    ? pendientes.map(renderCard_).join("")
    : `<p style="color:var(--muted);font-size:.85rem;">Sin solicitudes pendientes 🎉</p>`;

  elEntr.innerHTML = entregados.length
    ? entregados.map(renderCard_).join("")
    : `<p style="color:var(--muted);font-size:.85rem;">Ninguna entregada hoy aún.</p>`;
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
