// =========================
// public/js/views/supervisor/sup-ubicaciones.js
// Panel UBICACIONES en Supervisor — lectura pura del estado del movilizador
// =========================

import { getJSON } from "../../core/api.js";
import { escapeHtml } from "../../core/format.js";
import { initZonasMapa } from "../zonas/zonas-mapa.js";

let ubTimer_     = null;
let ubActive_    = false;
let _supZonasMapa = null;
const REFRESH_MS = 300_000; // 5 min

// ── Helpers ───────────────────────────────────────────────────────────

function fmtDate_(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function setUbTimestamp_() {
  const ts = document.getElementById("ubLastUpdate");
  if (ts) {
    const d = new Date();
    ts.textContent = `Actualizado: ${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(d)}`;
  }
}

// ── Render ────────────────────────────────────────────────────────────

function renderUbPanel0_(rows) {
  const box   = document.getElementById("ubPanel0Body");
  const badge = document.getElementById("ubBadge0");
  if (!box) return;
  if (badge) {
    badge.textContent = rows.length > 0 ? String(rows.length) : "";
    badge.style.display = rows.length > 0 ? "inline-flex" : "none";
  }
  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">Sin vehículos en espera de conversión.</div>`;
    return;
  }
  box.innerHTML = `<div class="movCardList">${rows.map(r => `
    <div class="movCard ub-card-readonly">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        ${r.en_conversion
          ? `<span class="badge badge-note">🔧 En Conversión</span>`
          : `<span class="badge badge-warn">⏳ En Espera</span>`
        }
      </div>
      <div class="movCardSub small muted">
        Entrada: ${fmtDate_(r.fecha_entrada)}
        ${r.registrado_por ? ` · por ${escapeHtml(r.registrado_por)}` : ""}
      </div>
    </div>`).join("")}</div>`;
}

function renderUbPanel1_(rows) {
  const box = document.getElementById("ubPanel1Body");
  const badge = document.getElementById("ubBadge1");
  if (!box) return;
  if (badge) {
    badge.textContent = rows.length > 0 ? String(rows.length) : "";
    badge.style.display = rows.length > 0 ? "inline-flex" : "none";
  }
  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">Sin conversiones finalizadas pendientes.</div>`;
    return;
  }
  box.innerHTML = `<div class="movCardList">${rows.map(r => `
    <div class="movCard ub-card-readonly">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        <span class="movCardDate">${fmtDate_(r.fecha)}</span>
      </div>
      <div class="ub-card-status small muted">Pendiente de traslado</div>
    </div>`).join("")}</div>`;
}

function renderUbPanel2_(rows) {
  const box = document.getElementById("ubPanel2Body");
  const badge = document.getElementById("ubBadge2");
  if (!box) return;
  if (badge) {
    badge.textContent = rows.length > 0 ? String(rows.length) : "";
    badge.style.display = rows.length > 0 ? "inline-flex" : "none";
  }
  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">Ningún vehículo en zona de espera.</div>`;
    return;
  }
  const sorted = [...rows].sort((a, b) => (a.estado === "TRASLADADO" ? 0 : 1) - (b.estado === "TRASLADADO" ? 0 : 1));
  box.innerHTML = `<div class="movCardList">${sorted.map(r => `
    <div class="movCard ub-card-readonly">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        ${r.estado === "TRASLADADO"
          ? `<span class="badge badge-warn">En zona de espera</span>`
          : `<span class="badge badge-note">En revisión técnica</span>`}
      </div>
      ${r.trasladado_at ? `<div class="movCardSub small muted">Trasladado: ${fmtDate_(r.trasladado_at)}</div>` : ""}
    </div>`).join("")}</div>`;
}

function renderUbPanel3_(rows) {
  const box = document.getElementById("ubPanel3Body");
  const badge = document.getElementById("ubBadge3");
  if (!box) return;
  if (badge) {
    badge.textContent = rows.length > 0 ? String(rows.length) : "";
    badge.style.display = rows.length > 0 ? "inline-flex" : "none";
  }
  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">No hay vehículos listos para trasladar.</div>`;
    return;
  }
  box.innerHTML = `<div class="movCardList">${rows.map(r => `
    <div class="movCard ub-card-readonly">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        <span class="movCardDate">${fmtDate_(r.fecha_calidad)}</span>
      </div>
      <div class="ub-card-status small muted">Listo para traslado</div>
    </div>`).join("")}</div>`;
}

// ── Fetch + refresh ───────────────────────────────────────────────────

async function refreshUb_() {
  if (!ubActive_) return;
  const btn = document.getElementById("btnUbRefresh");
  if (btn) btn.disabled = true;
  try {
    const j = await getJSON("/api/movilizador/status").catch(() => null);
    if (!j?.ok) throw new Error(j?.error || "Error");
    renderUbPanel0_(j.list0 || []);
    renderUbPanel1_(j.list1 || []);
    renderUbPanel2_(j.list2 || []);
    renderUbPanel3_(j.list3 || []);
    setUbTimestamp_();
  } catch (e) {
    const err = document.getElementById("ubError");
    if (err) err.textContent = `⚠️ ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Panel toggles ─────────────────────────────────────────────────────

function bindPanelToggles_() {
  document.querySelectorAll("#supPanelUbicaciones .movPanel").forEach(panel => {
    const hdr  = panel.querySelector(".movPanelHeader");
    const body = panel.querySelector(".movPanelBody");
    if (!hdr || !body) return;
    if (!hdr.dataset.ubBound) {
      hdr.dataset.ubBound = "1";
      hdr.addEventListener("click", () => {
        const open = panel.classList.toggle("open");
        hdr.setAttribute("aria-expanded", String(open));
      });
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────

export function bindSupUbicaciones_() {
  document.getElementById("btnUbRefresh")?.addEventListener("click", () => refreshUb_().catch(() => {}));
}

export async function enterUbicaciones_() {
  ubActive_ = true;
  bindPanelToggles_();
  await refreshUb_();
  clearInterval(ubTimer_);
  ubTimer_ = setInterval(() => refreshUb_().catch(() => {}), REFRESH_MS);

  // Inicializar mapa de zonas read-only (solo una vez)
  if (!_supZonasMapa) {
    _supZonasMapa = initZonasMapa("supZonasMapaContainer", { readOnly: true });
  } else {
    await _supZonasMapa.refresh();
  }
}

export function exitUbicaciones_() {
  ubActive_ = false;
  clearInterval(ubTimer_);
  ubTimer_ = null;
  _supZonasMapa?.destroy();
  _supZonasMapa = null;
}
