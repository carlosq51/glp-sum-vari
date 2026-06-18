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
let otRecheckTimer = null;
const POLL_MS = 30_000;
const OT_RECHECK_MS = 8 * 60 * 1000; // 8 min — re-valida VINs que siguen sin OT

// VINs del panel salida que aún no tienen OT según el último render
let _vinsSinOT_ = new Set();
const GPS_URL = "https://gps-ubicaciones-app.vercel.app/";
const OFFLINE_KEY = "glp_mov_offline_q";
const LISTA_CACHE_KEY = "glp_mov_lista_cache";

let _pendientesRows = [];
let _pendientesFiltro = "";

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

// ─── Lista cache (localStorage) ─────────────────────────────────────

function saveListaCache_(rows) {
  try {
    localStorage.setItem(LISTA_CACHE_KEY, JSON.stringify({ rows, savedAt: new Date().toISOString() }));
  } catch {}
}

function loadListaCache_() {
  try { return JSON.parse(localStorage.getItem(LISTA_CACHE_KEY) || "null"); } catch { return null; }
}

function showCacheBanner_(savedAt) {
  const banner = document.getElementById("movCacheBanner");
  if (!banner) return;
  const d = savedAt ? new Date(savedAt) : null;
  const label = d ? d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "?";
  banner.style.display = "";
  banner.textContent = `📶 Sin conexión — mostrando lista guardada el ${label}`;
}

function hideCacheBanner_() {
  const banner = document.getElementById("movCacheBanner");
  if (banner) banner.style.display = "none";
}

function updateGuardarBtn_(savedAt) {
  const btn = document.getElementById("btnMovGuardarLista");
  if (!btn) return;
  if (savedAt) {
    const d = new Date(savedAt);
    const t = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    btn.title = `Lista guardada a las ${t}`;
    btn.classList.add("movDownloadBtnSaved");
  } else {
    btn.title = "Guardar lista en el celular";
    btn.classList.remove("movDownloadBtnSaved");
  }
}

// ─── Offline queue ─────────────────────────────────────

function getOfflineQueue_() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]"); } catch { return []; }
}
function saveOfflineQueue_(q) {
  try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); } catch {}
}
function addToOfflineQueue_(vin) {
  const q = getOfflineQueue_();
  if (!q.find(i => i.vin === vin))
    q.push({ vin, accion: "REGISTRAR_ENTRADA", usuario: getMovNombre_(), ts: Date.now() });
  saveOfflineQueue_(q);
  updateOfflineBanner_();
}
function removeFromOfflineQueue_(vin) {
  saveOfflineQueue_(getOfflineQueue_().filter(i => i.vin !== vin));
  updateOfflineBanner_();
}
function updateOfflineBanner_() {
  const q = getOfflineQueue_();
  const banner = document.getElementById("movOfflineBanner");
  const countEl = document.getElementById("movOfflineCount");
  if (!banner) return;
  banner.style.display = q.length ? "" : "none";
  if (countEl) countEl.textContent = String(q.length);
}
async function drainOfflineQueue_() {
  const q = getOfflineQueue_();
  if (!q.length || !navigator.onLine) return;
  const synced = [];
  for (const item of q) {
    try {
      const j = await postJSON("/api/movilizador/traslado", { vin: item.vin, accion: item.accion, usuario: item.usuario });
      if (j?.ok) synced.push(item.vin);
    } catch { /* keep for next retry */ }
  }
  if (synced.length) {
    saveOfflineQueue_(getOfflineQueue_().filter(i => !synced.includes(i.vin)));
    updateOfflineBanner_();
  }
}

// ─── Pendientes por registrar ────────────────────────────────────────

function renderPendientesRegistrar_(rows) {
  _pendientesRows = rows || [];
  updateOfflineBanner_();

  // Badge en la tab Lista
  setBadge_("movBadgeLista", _pendientesRows.length);
  setBadge_("movBadgePendientes", _pendientesRows.length);

  // Re-aplicar filtro de búsqueda actual
  applyPendientesFiltro_(_pendientesFiltro);
}

function renderPendientesBody_(filtered) {
  const box = document.getElementById("movPendientesBody");
  const subHdr = document.getElementById("movPendientesSubHdr");

  const total = _pendientesRows.length;
  const showing = filtered.length;

  if (subHdr) {
    if (!total) {
      subHdr.textContent = "";
    } else if (_pendientesFiltro && showing !== total) {
      subHdr.textContent = `${showing} resultado${showing !== 1 ? "s" : ""} de ${total} pendiente${total !== 1 ? "s" : ""}`;
    } else {
      subHdr.textContent = `${total} vehículo${total !== 1 ? "s" : ""} por registrar`;
    }
  }

  if (!box) return;

  if (!filtered.length) {
    box.innerHTML = `<div class="movEmpty small muted" style="padding:14px 0;">${
      total ? "⚠️ Ningún VIN coincide con la búsqueda." : "✅ Todos los carros ya están registrados."
    }</div>`;
    return;
  }

  box.innerHTML = filtered.map(r => `
    <div class="movPendienteCard" id="movPCard_${escapeHtml(r.vin)}">
      <div class="movPendienteTop">
        <span class="movVin" style="font-family:monospace;">${escapeHtml(r.vin)}</span>
        ${r.ubicacion ? `<span class="small" style="opacity:.6;flex:1;">${escapeHtml(r.ubicacion)}</span>` : ""}
        <span class="small" style="opacity:.38;">${r.fecha || ""}</span>
      </div>
      <div class="movPendienteConfirmRow" id="movPConfirm_${escapeHtml(r.vin)}" style="display:none;">
        <span class="small" style="opacity:.75;">¿Confirmar ingreso a GLP?</span>
        <div style="display:flex;gap:6px;margin-top:5px;">
          <button class="movBtnFull movBtnEntrada movBtnConfirmarIngreso" data-vin="${escapeHtml(r.vin)}" type="button" style="flex:1;">✅ Sí, confirmar</button>
          <button class="movBtnCancelSm movBtnCancelarIngreso" data-vin="${escapeHtml(r.vin)}" type="button">✕</button>
        </div>
      </div>
      <button class="movBtnRegistrarPendiente movBtnFull" data-vin="${escapeHtml(r.vin)}" type="button">
        📥 Registrar ingreso ▶
      </button>
    </div>
  `).join("");
}

function applyPendientesFiltro_(q) {
  _pendientesFiltro = String(q || "").toUpperCase().trim();
  const filtered = _pendientesFiltro
    ? _pendientesRows.filter(r =>
        r.vin.includes(_pendientesFiltro) ||
        (r.ubicacion || "").toUpperCase().includes(_pendientesFiltro)
      )
    : _pendientesRows;
  renderPendientesBody_(filtered);
}

function downloadListaPendientes_() {
  if (!_pendientesRows.length) {
    const s = document.getElementById("movStatus");
    if (s) s.textContent = "Sin datos para descargar.";
    return;
  }
  const lines = ["VIN,FECHA,UBICACION"];
  for (const r of _pendientesRows) {
    lines.push(`${r.vin},${r.fecha || ""},"${(r.ubicacion || "").replace(/"/g, "'")}"`);
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: `pendientes_glp_${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

function showPendienteConfirmRow_(vin) {
  const row = document.getElementById(`movPConfirm_${vin}`);
  const btn = document.querySelector(`#movPCard_${vin} .movBtnRegistrarPendiente`);
  if (row) row.style.display = "";
  if (btn) btn.style.display = "none";
  // Auto-cancel after 8 s if user doesn't act
  setTimeout(() => hidePendienteConfirmRow_(vin), 8000);
}

function hidePendienteConfirmRow_(vin) {
  const row = document.getElementById(`movPConfirm_${vin}`);
  const btn = document.querySelector(`#movPCard_${vin} .movBtnRegistrarPendiente`);
  if (row) row.style.display = "none";
  if (btn) btn.style.display = "";
}

async function confirmarIngresoPendiente_(vin) {
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;

  const btnConfirm = document.querySelector(`.movBtnConfirmarIngreso[data-vin="${CSS.escape(vinClean)}"]`);
  const statusEl = document.getElementById("movStatus");

  if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = "Guardando…"; }

  if (!navigator.onLine) {
    addToOfflineQueue_(vinClean);
    hidePendienteConfirmRow_(vinClean);
    if (statusEl) statusEl.textContent = `📶 Sin conexión — ${vinClean} guardado localmente.`;
    if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "✅ Sí, confirmar"; }
    return;
  }

  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin: vinClean,
      accion: "REGISTRAR_ENTRADA",
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");
    removeFromOfflineQueue_(vinClean);
    if (statusEl) statusEl.textContent = `✓ ${vinClean} registrado en GLP.`;
    await refreshAll_();
  } catch (e) {
    // Network failure → save offline
    if (!navigator.onLine || /fetch|network|failed/i.test(e.message)) {
      addToOfflineQueue_(vinClean);
      hidePendienteConfirmRow_(vinClean);
      if (statusEl) statusEl.textContent = `📶 Sin conexión — ${vinClean} guardado localmente.`;
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "✅ Sí, confirmar"; }
    } else {
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = "✅ Sí, confirmar"; }
      if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    }
  }
}

// QR for pendientes: show result card
function showPendientesQrCard_(vin) {
  const vinClean = String(vin || "").trim().toUpperCase();
  const card = document.getElementById("movPendientesQrCard");
  const vinEl = document.getElementById("movPendientesQrVin");
  const ubicEl = document.getElementById("movPendientesQrUbic");
  const msgEl = document.getElementById("movPendientesQrMsg");
  const confirmBtns = document.getElementById("movPendientesQrConfirmBtns");
  const confirmBtn = document.getElementById("btnMovPendientesConfirmarQr");
  if (!card) return;

  const found = _pendientesRows.find(r => r.vin === vinClean);

  if (vinEl) vinEl.textContent = vinClean;
  if (ubicEl) ubicEl.textContent = found?.ubicacion || "";
  if (msgEl) msgEl.textContent = found ? "" : "⚠️ Este VIN no está en la lista de pendientes.";
  if (confirmBtns) confirmBtns.style.display = found ? "" : "none";
  if (confirmBtn) confirmBtn.dataset.vin = vinClean;

  card.style.display = "";

  // Scroll to card
  setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
}

function hidePendientesQrCard_() {
  const card = document.getElementById("movPendientesQrCard");
  if (card) card.style.display = "none";
}

async function confirmarIngresoPendienteQr_() {
  const btn = document.getElementById("btnMovPendientesConfirmarQr");
  const vin = btn?.dataset?.vin;
  if (!vin) return;
  hidePendientesQrCard_();
  // Re-use the same confirm logic; pass a temporary button element
  const tmpBtn = { disabled: false, textContent: "" };
  await confirmarIngresoPendiente_(vin);
}

// ─── Flow status config ──────────────────────────────────────────────

const FLOW_CONFIG = {
  PENDIENTE_ENTRADA: { label: "Sin ingresar",        cls: "flowPendiente",  icon: "⏳" },
  EN_ESPERA:         { label: "En Espera Conversión", cls: "flowEspera",    icon: "🚗" },
  EN_CONVERSION:     { label: "En Conversión",        cls: "flowConversion", icon: "🔧" },
  CONVERSION_DONE:   { label: "Conversión Lista",     cls: "flowDone",      icon: "✅" },
  EN_ZONA:           { label: "En Zona de Espera",    cls: "flowZona",      icon: "🕐" },
  EN_REVISION:       { label: "En Revisión Técnica",  cls: "flowRevision",  icon: "🔍" },
  LISTA_SALIDA:      { label: "Lista para Salir",     cls: "flowSalida",    icon: "🚀" },
};

let _listaDiariaRows = [];
let _list3Rows = [];
let _filtroActivo = "todos";

function renderListDiaria_(rows) {
  _listaDiariaRows = rows || [];

  // Badge en la pestaña: solo PENDIENTE_ENTRADA
  const pending = rows.filter(r => r.flow_status === "PENDIENTE_ENTRADA").length;
  setBadge_("movBadgeLista", pending);

  // Contador total
  const countEl = document.getElementById("movListaDiariaCount");
  if (countEl) countEl.textContent = rows.length ? `${rows.length} vehículo${rows.length !== 1 ? "s" : ""}` : "";

  applyFiltroLista_(_filtroActivo);
}

function applyFiltroLista_(filtro) {
  _filtroActivo = filtro;
  const box = document.getElementById("movListaDiariaBody");
  if (!box) return;

  // Update filter button active state
  document.querySelectorAll("#movListaFiltros .movFiltroBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filtro === filtro);
  });

  const rows = _listaDiariaRows;
  let filtered;
  if (filtro === "todos") {
    filtered = rows;
  } else if (filtro === "avanzados") {
    filtered = rows.filter(r => ["EN_ZONA","EN_REVISION","LISTA_SALIDA","CONVERSION_DONE"].includes(r.flow_status));
  } else {
    filtered = rows.filter(r => r.flow_status === filtro);
  }

  if (!filtered.length) {
    box.innerHTML = `<div class="movEmpty small muted">${
      rows.length ? "Ningún vehículo en este filtro." : "No hay vehículos en la lista diaria."
    }</div>`;
    return;
  }

  box.innerHTML = `<div class="movCardList">
    ${filtered.map(r => {
      const cfg = FLOW_CONFIG[r.flow_status] || { label: r.flow_status, cls: "flowPendiente", icon: "?" };
      const canRegister = r.flow_status === "PENDIENTE_ENTRADA";
      return `
        <div class="movCard movCardLista">
          <div class="movCardTop">
            <span class="movVin">${escapeHtml(r.vin)}</span>
            <span class="movFlowChip ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
          </div>
          ${r.fecha_entrada
            ? `<div class="movCardSub small">Ingreso: ${fmtDate_(r.fecha_entrada)}</div>`
            : r.fecha_ot
              ? `<div class="movCardSub small muted">OT: ${fmtDate_(r.fecha_ot)}</div>`
              : ""}
          ${canRegister ? `
            <button class="movBtnAction btnRegistrarDesde movBtnFull"
              data-vin="${escapeHtml(r.vin)}" type="button">
              📥 Registrar Ingreso ▶
            </button>` : ""}
        </div>`;
    }).join("")}
  </div>`;
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
  _list3Rows = rows || [];
  // Actualizar el set de VINs sin OT para que el re-validador de 8 min los recoja
  _vinsSinOT_ = new Set((rows || []).filter(r => !r.tiene_ot).map(r => r.vin));
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
          ${!r.tiene_ot
            ? `<div class="movOtWarn small">⚠️ Falta #OT — registre en ASIGNACIONES (col E) antes de confirmar</div>`
            : r.destino
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
            data-vin="${escapeHtml(r.vin)}" type="button"
            ${!r.tiene_ot ? 'disabled title="Registre el #OT en ASIGNACIONES primero"' : ''}>
            ${r.tiene_ot ? 'Confirmar Salida ▶' : '🔒 Sin #OT'}
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

    // Drain offline queue first (if online)
    await drainOfflineQueue_();

    const [j, jPend] = await Promise.all([
      getJSON("/api/movilizador/status"),
      getJSON("/api/movilizador/pendientes"),
    ]);
    if (!j?.ok) throw new Error(j?.error || "Error cargando estado");

    renderPendientesRegistrar_(jPend?.sin_registrar || []);
    saveListaCache_(jPend?.sin_registrar || []);
    hideCacheBanner_();
    updateGuardarBtn_(new Date().toISOString());
    renderList0_(j.list0 || []);
    renderList1_(j.list1 || []);
    renderList2_(j.list2 || []);
    renderList3_(j.list3 || []);

    if (statusEl) {
      const t = new Date();
      statusEl.textContent = `Actualizado ${t.toLocaleTimeString("es-PE")}`;
    }
  } catch (e) {
    // Si falla la red, cargar la lista desde caché
    const cache = loadListaCache_();
    if (cache?.rows) {
      renderPendientesRegistrar_(cache.rows);
      showCacheBanner_(cache.savedAt);
    }
    if (statusEl) statusEl.textContent = navigator.onLine ? (e.message || "Error") : "📶 Sin conexión";
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
    return true;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = originalText;
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    return false;
  }
}

// ─── Tab switching ────────────────────────────────────────────

function bindTabs_() {
  const tabs   = document.querySelectorAll("#viewMOVILIZADOR .movTab");
  const panels = document.querySelectorAll("#viewMOVILIZADOR .movTabPanel");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", String(t === tab)); });
      panels.forEach(p => { p.style.display = p.dataset.panel === target ? "flex" : "none"; });
    });
  });
}

// ─── Lista diaria filtros ─────────────────────────────────────

function bindFiltros_() {
  document.getElementById("movListaFiltros")?.addEventListener("click", e => {
    const btn = e.target.closest(".movFiltroBtn");
    if (!btn) return;
    applyFiltroLista_(btn.dataset.filtro || "todos");
  });
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
let _salidaQrDismiss = null;

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
        const tgt = movQrTarget_;
        await closeMovQr_();
        if (tgt === "salida") {
          const salidaInp = document.getElementById("movSalidaVinSearch");
          if (salidaInp) salidaInp.value = String(code || "").toUpperCase();
          showSalidaQrResult_(code);
        } else if (tgt === "pendientes") {
          showPendientesQrCard_(code);
        } else {
          // entrada
          const inp = document.getElementById("movVinEntrada");
          if (inp) {
            inp.value = code;
            inp.dispatchEvent(new Event("input"));
          }
          const btn = document.getElementById("btnMovRegistrarEntrada");
          if (btn) btn.disabled = code.length < 7;
        }
      },
    });
  } catch { /* mensaje ya mostrado en msgEl */ }
}

// ─── Salida QR result ───────────────────────────────────────────────────

function showSalidaQrResult_(vin) {
  const vinClean = String(vin || "").trim().toUpperCase();
  const panel = document.getElementById("movSalidaQrResult");
  if (!panel) return;

  const row = _list3Rows.find(r => r.vin === vinClean);

  const vinEl = document.getElementById("movSalidaQrResultVin");
  if (vinEl) vinEl.textContent = vinClean;

  const destEl = document.getElementById("movSalidaQrResultDestino");
  if (destEl) {
    if (row?.destino) {
      destEl.textContent = `📍 Sale a: ${row.destino}`;
      destEl.className = "movSalidaQrResultDestino movSalidaQrDestinoOk";
    } else if (row) {
      destEl.textContent = "⏳ Destino pendiente de asignación";
      destEl.className = "movSalidaQrResultDestino movSalidaQrDestinoWait";
    } else {
      destEl.textContent = "❌ VIN no encontrado en la lista de salida";
      destEl.className = "movSalidaQrResultDestino movSalidaQrDestinoErr";
    }
  }

  const confirmBtn = document.getElementById("btnMovConfirmarSalidaQr");
  if (confirmBtn) {
    confirmBtn.dataset.vin = vinClean;
    if (!row) {
      confirmBtn.style.display = "none";
    } else {
      confirmBtn.style.display = "";
      confirmBtn.disabled = !row.tiene_ot;
      confirmBtn.textContent = row.tiene_ot ? "Confirmar Salida ▶" : "🔒 Sin #OT — regístralo en ASIGNACIONES (col E)";
    }
  }

  panel.style.display = "block";

  // Auto-dismiss after 15 s
  clearTimeout(_salidaQrDismiss);
  _salidaQrDismiss = setTimeout(() => closeSalidaQrResult_(), 15_000);
}

function closeSalidaQrResult_() {
  clearTimeout(_salidaQrDismiss);
  const panel = document.getElementById("movSalidaQrResult");
  if (panel) panel.style.display = "none";
  const inp = document.getElementById("movSalidaVinSearch");
  if (inp) inp.value = "";
}

async function closeMovQr_() {
  await movScanner_.stop().catch(() => {});
  const modal = movQrModal_();
  if (!modal) return;
  modal.classList.remove("show");
  modal.style.display = "none";
}

// ─── GPS + Registro ────────────────────────────────────────────────────

function getGpsUrl_(vin) {
  return `${GPS_URL}?vin=${encodeURIComponent(vin)}`;
}

function copyVinToClipboard_(vin) {
  try {
    navigator.clipboard.writeText(vin).catch(() => {});
  } catch {}
}

function prepareGpsWindow_(vin) {
  copyVinToClipboard_(vin);
  const popup = window.open("about:blank", "_blank");
  if (!popup) return null;

  try {
    popup.opener = null;
    popup.document.title = "Registrando salida...";
    popup.document.body.innerHTML = "<p style=\"font-family:system-ui,sans-serif;padding:16px;\">Guardando salida...</p>";
  } catch {}

  return popup;
}

function openGpsWithVin_(vin, popup) {
  const url = getGpsUrl_(vin);
  copyVinToClipboard_(vin);

  if (popup && !popup.closed) {
    try {
      popup.location.replace(url);
      return;
    } catch {}
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

async function handleConfirmarSalida_(vin, btn) {
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;

  const popup = prepareGpsWindow_(vinClean);
  const ok = await handleAction_(vinClean, "ENTREGAR_FINAL", btn, () => {
    openGpsWithVin_(vinClean, popup);
  });

  if (!ok && popup && !popup.closed) {
    try { popup.close(); } catch {}
  }
}

async function handleRegistroDesde_(vin, btn) {
  const vinClean = String(vin || "").trim().toUpperCase();
  if (!vinClean) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const j = await postJSON("/api/movilizador/traslado", {
      vin: vinClean,
      accion: "REGISTRAR_ENTRADA",
      usuario: getMovNombre_(),
    });
    if (!j?.ok) throw new Error(j?.error || "Error al guardar");
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `✓ ${vinClean} ingresado.`;
    await refreshAll_();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = original;
    const statusEl = document.getElementById("movStatus");
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
  }
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

// Re-valida solo los VINs que siguen con "falta OT" sin hacer un refresh completo.
// Si alguno ya tiene OT en la DB, dispara un refreshAll_ para actualizar el panel.
async function revalidarOTFaltante_() {
  if (!_vinsSinOT_.size) return;
  try {
    const vinsParam = [..._vinsSinOT_].join(",");
    const j = await getJSON(`/api/movilizador/revalidate-ot?vins=${encodeURIComponent(vinsParam)}`);
    if (j?.ok && j.vins_con_ot?.length) {
      // Al menos un VIN ya tiene OT — refrescar para que el panel lo muestre
      await refreshAll_();
    }
  } catch { /* silencioso, el próximo ciclo lo reintentará */ }
}

function startPoll_() {
  stopPoll_();
  pollTimer      = setInterval(() => refreshAll_().catch(() => {}), POLL_MS);
  otRecheckTimer = setInterval(() => revalidarOTFaltante_().catch(() => {}), OT_RECHECK_MS);
}

function stopPoll_() {
  if (pollTimer)      { clearInterval(pollTimer);      pollTimer      = null; }
  if (otRecheckTimer) { clearInterval(otRecheckTimer); otRecheckTimer = null; }
}

// ─── Public API ───────────────────────────────────────────────────────

export function init() {
  document.getElementById("btnMovRefresh")?.addEventListener("click", () => {
    refreshAll_().catch(() => {});
  });

  // VIN Autocomplete for Entrada
  createVinAc_("movVinEntrada", "movVinEntradaSuggest", () => {});

  // VIN Autocomplete for Salida
  createVinAc_("movSalidaVinSearch", "movSalidaVinSuggest", (vin) => showSalidaQrResult_(vin));

  // QR scanner buttons
  document.getElementById("btnMovQrEntrada")?.addEventListener("click",    () => openMovQr_("entrada").catch(() => {}));
  document.getElementById("btnMovQrSalida")?.addEventListener("click",     () => openMovQr_("salida").catch(() => {}));
  document.getElementById("btnMovQrPendientes")?.addEventListener("click", () => openMovQr_("pendientes").catch(() => {}));

  // Guardar lista en caché del celular
  document.getElementById("btnMovGuardarLista")?.addEventListener("click", () => {
    if (!_pendientesRows.length) {
      const s = document.getElementById("movStatus");
      if (s) s.textContent = "Sin datos para guardar.";
      return;
    }
    saveListaCache_(_pendientesRows);
    updateGuardarBtn_(new Date().toISOString());
    const s = document.getElementById("movStatus");
    if (s) s.textContent = `💾 Lista guardada (${_pendientesRows.length} VINs) — disponible sin conexión.`;
  });

  // Al abrir: cargar cache si existe
  const initCache = loadListaCache_();
  if (initCache?.rows?.length) {
    renderPendientesRegistrar_(initCache.rows);
    updateGuardarBtn_(initCache.savedAt);
  }
  document.getElementById("movPendientesSearch")?.addEventListener("input", e => {
    applyPendientesFiltro_(e.target.value);
  });


  document.getElementById("btnMovCloseQr")?.addEventListener("click",   () => closeMovQr_().catch(() => {}));
  document.getElementById("movQrModal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("movQrModal")) closeMovQr_().catch(() => {});
  });
  document.getElementById("btnMovCloseSalidaQr")?.addEventListener("click", () => closeSalidaQrResult_());

  // Confirmar salida desde resultado QR (delegado al handler existente)
  document.getElementById("btnMovConfirmarSalidaQr")?.addEventListener("click", function () {
    const vin = this.dataset.vin;
    if (!vin) return;
    closeSalidaQrResult_();
    handleConfirmarSalida_(vin, this).catch(() => {});
  });

  // Pendientes: QR confirm + cancel
  document.getElementById("btnMovPendientesConfirmarQr")?.addEventListener("click", () =>
    confirmarIngresoPendienteQr_().catch(() => {})
  );
  document.getElementById("btnMovPendientesCancelarQr")?.addEventListener("click", hidePendientesQrCard_);

  // Pendientes: delegación para botones en la lista
  document.getElementById("viewMOVILIZADOR")?.addEventListener("click", e => {
    const btn = e.target.closest(".movBtnRegistrarPendiente");
    if (btn) { showPendienteConfirmRow_(btn.dataset.vin); return; }
    const conf = e.target.closest(".movBtnConfirmarIngreso");
    if (conf) { confirmarIngresoPendiente_(conf.dataset.vin).catch(() => {}); return; }
    const canc = e.target.closest(".movBtnCancelarIngreso");
    if (canc) { hidePendienteConfirmRow_(canc.dataset.vin); return; }
  });

  // Auto-sync cuando recupera conexión
  window.addEventListener("online", () => {
    drainOfflineQueue_().then(() => refreshAll_()).catch(() => {});
  });

  updateOfflineBanner_();

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
        ["movVinEntradaSuggest", "movSalidaVinSuggest"].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
        });
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
      handleConfirmarSalida_(vin, btn).catch(() => {});
    } else if (btn.classList.contains("btnRegistrarDesde")) {
      // Registrar ingreso desde la lista diaria
      handleRegistroDesde_(vin, btn).catch(() => {});
    }
  });

  bindTabs_();
  bindFiltros_();
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
