// public/js/views/conversion/ui/conversion-validar.js
// Panel "Validar VIN" en vista TECNICO — uso excepcional

import { escapeHtml, getJSON } from "../../../core/core.js";

async function fetchTecValidar_() {
  const vin = String(document.getElementById("tecValidarVin")?.value || "").trim().toUpperCase();
  const box = document.getElementById("tecValidarResult");
  if (!box) return;
  if (!vin) { box.innerHTML = `<div class="small muted">Ingresa un VIN para validar.</div>`; return; }
  box.innerHTML = `<div class="small muted">Buscando…</div>`;
  try {
    const j = await getJSON(`/api/vin-validar?vin=${encodeURIComponent(vin)}`);
    renderTecValidar_(box, j);
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function renderTecValidar_(box, j) {
  if (!j?.ok) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">⚠️ ${escapeHtml(j?.error || "Error")}</div>`;
    return;
  }

  if (!j.found) {
    box.innerHTML = `
      <div style="text-align:center;padding:14px 0;">
        <div style="font-size:2.2rem;">❌</div>
        <div style="font-weight:900;margin-top:6px;color:#f87171;">VIN NO REGISTRADO</div>
        <div class="small muted">No está en el sistema de conversión.</div>
      </div>`;
    return;
  }

  const v = j.vin;
  const wos = j.workOrders || [];

  const estadoPill = estado => {
    const s = String(estado || "").toUpperCase();
    const color = s === "FINALIZADO" ? "#4ade80" : s === "TRABAJANDO" ? "#60a5fa" : s === "PAUSADO" ? "#fbbf24" : "#94a3b8";
    return `<span style="font-size:.7em;font-weight:900;color:${color};">${escapeHtml(estado || "—")}</span>`;
  };

  const woHtml = wos.length
    ? wos.map(wo => {
        const asgs = (wo.asignaciones || []).filter(a => a.activo);
        return `
          <div style="margin-top:6px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:10px;border:1px solid rgba(255,255,255,.10);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
              <span style="font-weight:900;font-size:.82em;">${escapeHtml(wo.tipo_ot || "OT")}</span>
              <span class="small muted">${wo.fecha_creacion ? new Date(wo.fecha_creacion).toLocaleDateString("es-PE") : ""}</span>
            </div>
            ${asgs.length
              ? asgs.map(a => `<div class="small" style="padding:2px 0;opacity:.85;"><b>${escapeHtml(a.rol_trabajo || "")}</b> — ${escapeHtml(a.usuarios?.nombre || "?")} ${estadoPill(a.estado_actual)}</div>`).join("")
              : `<div class="small muted">Sin asignaciones activas.</div>`}
          </div>`;
      }).join("")
    : `<div class="small muted" style="margin-top:6px;">Sin órdenes de trabajo.</div>`;

  box.innerHTML = `
    <div style="background:rgba(74,222,128,.07);border:1px solid rgba(74,222,128,.25);border-radius:12px;padding:12px 14px;">
      <div style="font-family:monospace;font-weight:900;letter-spacing:.05em;">${escapeHtml(v.vin)}</div>
      ${v.modelo  ? `<div class="small" style="margin-top:4px;opacity:.75;">Modelo: <b>${escapeHtml(v.modelo)}</b></div>` : ""}
      ${v.cliente ? `<div class="small" style="opacity:.75;">Cliente: <b>${escapeHtml(v.cliente)}</b></div>` : ""}
    </div>
    <div style="margin-top:12px;font-weight:900;font-size:.74em;opacity:.5;letter-spacing:.6px;">ÓRDENES DE TRABAJO</div>
    ${woHtml}
  `;
}

export function initTecValidar_() {
  document.getElementById("btnTecValidar")?.addEventListener("click", fetchTecValidar_);
  document.getElementById("tecValidarVin")?.addEventListener("keydown", e => {
    if (e.key === "Enter") fetchTecValidar_();
  });
}
