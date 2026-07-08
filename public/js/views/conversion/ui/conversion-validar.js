// public/js/views/conversion/ui/conversion-validar.js
// Modal 🔍 Buscar VIN en vista TECNICO — vinSuggest + cámara QR

import { createVinSuggest_ } from "../../../core/core.js";
import { createScanner } from "../../../core/qr-scanner.js";
import { refreshEstadoForVinRole } from "../data/conversion-estado.js";

// ── Scanner exclusivo del modal ───────────────────────────────────────────
const tecBuscarScanner_ = createScanner("tecBuscarQrReader");

// ── VIN suggest del modal ────────────────────────────────────────────────
const bSugAC_ = createVinSuggest_({
  input:   "tecBuscarVin",
  box:     "tecBuscarSuggest",
  min:     3,
  debounce: 220,
  onPick: item => {
    const inp = document.getElementById("tecBuscarVin");
    if (inp) inp.value = item.vin;
    bSugFetchResult_(item.vin);
  },
});

// ── Open / Close modal ────────────────────────────────────────────────────
export async function openTecBuscarModal_() {
  const modal = document.getElementById("tecBuscarModal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("show");
  const inp = document.getElementById("tecBuscarVin");
  if (inp) { inp.value = ""; inp.focus(); }
  bSugAC_.hide();
  const msg = document.getElementById("tecBuscarMsg");
  if (msg) msg.innerHTML = "";
  const res = document.getElementById("tecBuscarResult");
  if (res) res.innerHTML = "";
}

async function closeTecBuscarModal_() {
  await tecBuscarScanner_.stop().catch(() => {});
  const modal = document.getElementById("tecBuscarModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.style.display = "none";
  bSugAC_.hide();
}

// ── Fetch + render resultado ──────────────────────────────────────────────
async function bSugFetchResult_(vin) {
  const box = document.getElementById("tecBuscarResult");
  if (!box || !vin) return;
  box.innerHTML = `<div class="small muted">Buscando…</div>`;
  try {
    const j = await getJSON(`/api/vin-validar?vin=${encodeURIComponent(vin)}`);
    renderTecBuscar_(box, vin, j);
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function renderTecBuscar_(box, vinCode, j) {
  if (!j?.ok || !j.found) {
    box.innerHTML = `
      <div style="text-align:center;padding:14px 0;">
        <div style="font-size:2.2rem;">❌</div>
        <div style="font-weight:900;margin-top:6px;color:#f87171;">VIN NO ENCONTRADO</div>
        <div class="small muted">No está registrado en el sistema.</div>
      </div>`;
    return;
  }

  const v   = j.vin;
  const wos = (j.workOrders || []).filter(wo => wo.tipo_ot === "CONVERSION");
  const isConv = wos.length > 0;

  const estadoPill = estado => {
    const s = String(estado || "").toUpperCase();
    const c = s === "FINALIZADO" ? "#4ade80"
            : s === "TRABAJANDO" ? "#60a5fa"
            : s === "PAUSADO"    ? "#fbbf24"
            : "#94a3b8";
    return `<span style="font-size:.7em;font-weight:900;color:${c};">${escapeHtml(estado || "—")}</span>`;
  };

  const woHtml = isConv
    ? wos.map(wo => {
        const asgs = (wo.asignaciones || []).filter(a => a.activo);
        return `
          <div style="margin-top:6px;padding:8px;background:rgba(255,255,255,.04);
                      border-radius:10px;border:1px solid rgba(255,255,255,.10);">
            ${asgs.length
              ? asgs.map(a => `<div class="small" style="padding:2px 0;">
                  <b>${escapeHtml(a.rol_trabajo || "")}</b> — ${escapeHtml(a.usuarios?.nombre || "?")}
                  ${estadoPill(a.estado_actual)}
                </div>`).join("")
              : `<div class="small muted">Sin asignaciones activas.</div>`}
          </div>`;
      }).join("")
    : `<div class="small" style="color:#fbbf24;margin-top:6px;">⚠️ Este VIN no tiene OT de conversión activa.</div>`;

  box.innerHTML = `
    <div style="background:rgba(74,222,128,.07);border:1px solid rgba(74,222,128,.25);
                border-radius:12px;padding:12px 14px;">
      <div style="font-family:monospace;font-weight:900;letter-spacing:.05em;">${escapeHtml(v.vin)}</div>
      ${v.modelo  ? `<div class="small" style="margin-top:4px;opacity:.75;">Modelo: <b>${escapeHtml(v.modelo)}</b></div>` : ""}
      ${v.cliente ? `<div class="small" style="opacity:.75;">Cliente: <b>${escapeHtml(v.cliente)}</b></div>` : ""}
    </div>
    <div style="margin-top:10px;font-weight:900;font-size:.74em;opacity:.5;letter-spacing:.6px;">ÓRDENES DE CONVERSIÓN</div>
    ${woHtml}
    ${isConv ? `
    <button id="btnTecBuscarSelect" type="button" class="btn"
      style="width:100%;margin-top:14px;background:var(--primary);">
      ✅ Usar este VIN
    </button>` : ""}
  `;

  document.getElementById("btnTecBuscarSelect")?.addEventListener("click", () => {
    const mainInp = document.getElementById("vin");
    if (mainInp) {
      mainInp.value = vinCode;
      mainInp.dispatchEvent(new Event("input", { bubbles: true }));
    }
    closeTecBuscarModal_();
    refreshEstadoForVinRole();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
export function initTecValidar_() {
  // Abrir modal con lupita
  document.getElementById("btnTecBuscar")?.addEventListener("click", openTecBuscarModal_);

  // Cerrar: botón X y clic en backdrop
  document.getElementById("btnTecBuscarClose")?.addEventListener("click", closeTecBuscarModal_);
  document.getElementById("tecBuscarModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeTecBuscarModal_();
  });

  // VIN suggest
  bSugAC_.bind();
  document.getElementById("tecBuscarVin")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.defaultPrevented) {
      e.preventDefault();
      const vin = String(document.getElementById("tecBuscarVin")?.value || "").trim().toUpperCase();
      if (vin) bSugFetchResult_(vin);
    } else if (e.key === "Escape" && !e.defaultPrevented) {
      closeTecBuscarModal_();
    }
  });

  // Cámara QR
  document.getElementById("btnTecBuscarQr")?.addEventListener("click", async () => {
    const msg = document.getElementById("tecBuscarMsg");
    try {
      await tecBuscarScanner_.start({
        mode: "QR",
        msgEl: msg,
        onDecoded: async code => {
          await tecBuscarScanner_.stop().catch(() => {});
          const inp = document.getElementById("tecBuscarVin");
          if (inp) inp.value = code;
          bSugAC_.hide();
          bSugFetchResult_(code);
        },
      });
    } catch { /* mensaje se muestra en msgEl */ }
  });
}
