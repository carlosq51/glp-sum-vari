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
import { getVinSuggest } from "../../core/supabase-client.js";
import { createScanner } from "../../core/qr-scanner.js";

let pollTimer = null;
const POLL_MS = 30_000;
const GPS_URL = "https://gps-ubicaciones-app.vercel.app/";

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

function renderList0_(rows) {
  const box = document.getElementById("movPanel0Body");
  if (!box) return;

  const countEspera     = rows.filter(r => !r.en_conversion).length;
  const countConversion = rows.filter(r =>  r.en_conversion).length;

  // Badge naranja = en espera, badge azul = en conversión
  setBadge_("movBadge0",      countEspera);
  setBadge_("movBadge0conv",  countConversion);

  if (!rows.length) {
    box.innerHTML = `<div class="movEmpty small muted">Sin vehículos en espera de conversión.</div>`;
    return;
  }

  // Separar los dos grupos (ya vienen ordenados del backend)
  const espera     = rows.filter(r => !r.en_conversion);
  const conversion = rows.filter(r =>  r.en_conversion);

  const cardHtml = (r) => `
    <div class="movCard">
      <div class="movCardTop">
        <span class="movVin">${escapeHtml(r.vin)}</span>
        ${r.en_conversion
          ? `<span class="badge badge-note">🔧 En Conversión</span>`
          : `<span class="badge badge-warn">⏳ En Espera</span>`
        }
      </div>
      <div class="movCardSub small muted">
        ${r.fecha_entrada
          ? `Entrada: ${fmtDate_(r.fecha_entrada)}${r.registrado_por ? ` · por ${escapeHtml(r.registrado_por)}` : ""}`
          : `<span class="movCardNoReg">⚠️ Sin registro de entrada</span>`
        }
      </div>
    </div>`;

  let html = `<div class="movCardList">`;

  if (espera.length) {
    html += espera.map(cardHtml).join("");
  }

  if (conversion.length) {
    if (espera.length) {
      html += `<div class="movList0Separator small muted">🔧 En Conversión</div>`;
    }
    html += conversion.map(cardHtml).join("");
  }

  html += `</div>`;
  box.innerHTML = html;
}

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
    box.innerHTML = `<div class="movEmpty small muted">No hay vehículos con revisión técnica finalizada.</div>`;
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
          ${r.destino
            ? `<div class="movDestino">
                <span class="movDestinoLabel">Salida a:</span>
                <span class="movDestinoValue">${escapeHtml(r.destino)}</span>
              </div>`
            : `<div class="movDestino movDestinoVacio">
                <span class="movDestinoLabel">Destino:</span>
                <span class="muted small">pendiente de asignación</span>
              </div>`
          }
          <button class="movBtnAction btnConfirmarSalida movBtnFull"
            data-vin="${escapeHtml(r.vin)}" type="button">
            Confirmar Salida ▶
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

    renderList0_(j.list0 || []);
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

async function handleAction_(vin, accion, btn, onSuccess) {
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
    if (onSuccess) onSuccess(vin);
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

// ─── VIN Autocomplete (genérico para Entrada / Salida) ─────────────────

function createVinAc_(inputId, suggestId, onPick) {
  const MIN = 1, LIMIT = 12, DEBOUNCE = 220;
  let timer = null, items = [], open = false, idx = -1, lastQ = "";

  const input_ = () => document.getElementById(inputId);
  const box_ = () => document.getElementById(suggestId);

  function hide_() {
    open = false; idx = -1; items = [];
    const b = box_();
    if (b) { b.classList.add("hidden"); b.innerHTML = ""; }
  }

  function render_() {
    const b = box_();
    if (!b) return;
    if (!items.length) { hide_(); return; }
    b.innerHTML = items.map((vin, i) => `
      <div class="vsItem ${i === idx ? "active" : ""}" data-idx="${i}" role="option">
        <div class="vsVin">${escapeHtml(vin)}</div>
      </div>
    `).join("");
    b.classList.remove("hidden");
    open = true;
  }

  async function fetch_(q) {
    try {
      const res = await getVinSuggest(q, LIMIT);
      return (res || [])
        .map(item => (typeof item === "object" && item?.vin) ? String(item.vin).toUpperCase() : String(item || "").toUpperCase())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function onInput_() {
    const q = String(input_()?.value || "").trim().toUpperCase();
    lastQ = q;
    // enable/disable button based on input length
    const btn = document.getElementById(inputId === "movVinEntrada" ? "btnMovRegistrarEntrada" : "btnMovRegistrarSalida");
    if (btn) btn.disabled = q.length < 7;
    if (!q || q.length < MIN) { hide_(); return; }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const res = await fetch_(q);
        if (lastQ !== q) return;
        items = res;
        idx = items.length ? 0 : -1;
        render_();
      } catch { hide_(); }
    }, DEBOUNCE);
  }

  function pick_(vin) {
    const inp = input_();
    if (inp) inp.value = String(vin || "").toUpperCase();
    hide_();
    const btn = document.getElementById(inputId === "movVinEntrada" ? "btnMovRegistrarEntrada" : "btnMovRegistrarSalida");
    if (btn) btn.disabled = !vin || vin.length < 7;
    onPick(String(vin || "").toUpperCase());
  }

  function onKeyDown_(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
      render_();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      render_();
    } else if (e.key === "Enter" && idx >= 0 && items[idx]) {
      e.preventDefault();
      pick_(items[idx]);
    } else if (e.key === "Escape") {
      hide_();
    }
  }

  // Bind events
  const inp = input_();
  if (inp) {
    inp.addEventListener("input", onInput_);
    inp.addEventListener("keydown", onKeyDown_);
  }

  const b = box_();
  if (b && !b.dataset.bound) {
    b.dataset.bound = "1";
    b.addEventListener("mousedown", e => {
      const row = e.target.closest(".vsItem[data-idx]");
      if (!row) return;
      e.preventDefault();
      pick_(items[Number(row.dataset.idx)]);
    });
  }
}

// ─── QR Scanner ────────────────────────────────────────────────────────

const movScanner_ = createScanner("movQrReader");
let movQrTarget_ = null; // "entrada" | "salida"

function movQrModal_() { return document.getElementById("movQrModal"); }

async function openMovQr_(target) {
  movQrTarget_ = target;
  const modal = movQrModal_();
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("show");
  const msg = document.getElementById("movQrMsg");
  try {
    await movScanner_.start({
      mode: "QR",
      msgEl: msg,
      onDecoded: async (code) => {
        await closeMovQr_();
        // Only entrada target is used now
        const inp = document.getElementById("movVinEntrada");
        if (inp) {
          inp.value = code;
          inp.dispatchEvent(new Event("input"));
        }
        const btn = document.getElementById("btnMovRegistrarEntrada");
        if (btn) btn.disabled = code.length < 7;
      },
    });
  } catch { /* mensaje ya mostrado en msgEl */ }
}

async function closeMovQr_() {
  await movScanner_.stop().catch(() => {});
  const modal = movQrModal_();
  if (!modal) return;
  modal.classList.remove("show");
  modal.style.display = "none";
}

// ─── GPS + Registro ────────────────────────────────────────────────────

function openGpsWithVin_(vin) {
  // Try passing VIN via query param (GPS app may support it)
  window.open(`${GPS_URL}?vin=${encodeURIComponent(vin)}`, "_blank", "noopener,noreferrer");
  // Also copy VIN to clipboard for manual paste
  try {
    navigator.clipboard.writeText(vin).catch(() => {});
  } catch {}
}

async function handleRegistro_(vin, accion, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const inputId = accion === "REGISTRAR_ENTRADA" ? "movVinEntrada" : "movVinSalida";
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin: vinClean,
      accion,
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");

    // Open GPS app in new tab with VIN as query param + copy to clipboard
    openGpsWithVin_(vinClean);

    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `✓ ${vinClean} registrado. VIN copiado — pégalo en la app GPS.`;

    // Clear input and disable button
    const inputEl = document.getElementById(inputId);
    if (inputEl) { inputEl.value = ""; inputEl.dispatchEvent(new Event("input")); }
    btn.disabled = true;
    btn.textContent = original;

    await refreshAll_();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = original;
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
  }
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

  // VIN Autocomplete for Entrada
  createVinAc_("movVinEntrada", "movVinEntradaSuggest", () => {});

  // QR scanner buttons
  document.getElementById("btnMovQrEntrada")?.addEventListener("click", () => openMovQr_("entrada").catch(() => {}));
  document.getElementById("btnMovCloseQr")?.addEventListener("click",   () => closeMovQr_().catch(() => {}));
  document.getElementById("movQrModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("movQrModal")) closeMovQr_().catch(() => {});
  });

  // Registro de Entrada button
  document.getElementById("btnMovRegistrarEntrada")?.addEventListener("click", () => {
    const vin = document.getElementById("movVinEntrada")?.value?.trim().toUpperCase() || "";
    if (vin.length >= 7) handleRegistro_(vin, "REGISTRAR_ENTRADA", "btnMovRegistrarEntrada").catch(() => {});
  });

  // Close autocomplete dropdown on outside click
  if (!document.body.dataset.movVinDocBound) {
    document.body.dataset.movVinDocBound = "1";
    document.addEventListener("click", e => {
      const wraps = document.querySelectorAll("#viewMOVILIZADOR .vinWrap");
      const inside = [...wraps].some(w => w.contains(e.target));
      if (!inside) {
        const el = document.getElementById("movVinEntradaSuggest");
        if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
      }
    });
  }

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
    } else if (btn.classList.contains("btnConfirmarSalida")) {
      // Confirmar salida: registra ENTREGAR_FINAL + abre app GPS de registro
      handleAction_(vin, "ENTREGAR_FINAL", btn, openGpsWithVin_).catch(() => {});
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
  closeMovQr_().catch(() => {});
}
