// =========================
// public/js/views/zonas/zonas-mapa.js
// Componente compartido: mapa visual de las 15 zonas de conversión.
// Layout: 9 zonas izquierda | carretera | 6 zonas derecha | Zona Libre
// =========================

import { escapeHtml, postJSON } from "../../core/core.js";
import { getVinSuggest } from "../../core/supabase-client.js";
import { createScanner } from "../../core/qr-scanner.js";

// ── Layout físico del taller ─────────────────────────────────────────────────
const COL_IZQUIERDA = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const COL_DERECHA   = [10, 11, 12, 13, 14, 15];

const ESTADO_LABEL = {
  LIBRE:          "Libre",
  ESPERANDO:      "En Espera",
  EN_CONVERSION:  "En Conversión",
  FINALIZADO:     "Listo",
};

const ESTADO_CSS = {
  LIBRE:          "libre",
  ESPERANDO:      "esperando",
  EN_CONVERSION:  "en_conversion",
  FINALIZADO:     "finalizado",
};

// ── Render de cada spot ──────────────────────────────────────────────────────

function renderZonaCard_(z, readOnly) {
  const css     = ESTADO_CSS[z.estado] || "libre";
  const roClass = readOnly ? " readOnly" : "";
  const isOcupada = !!z.vin;

  // VIN: últimos 8 caracteres para que quepa en el spot
  const vinShort = z.vin
    ? (z.vin.length > 8 ? z.vin.slice(-8) : z.vin)
    : "";

  const delantero = z.tecnicos?.delantero || "";
  const tanquero  = z.tecnicos?.tanquero  || "";

  return `
    <div class="zonaCard zonaCard--${css}${roClass}"
         data-zona="${z.zona_id}"
         data-vin="${escapeHtml(z.vin || "")}"
         data-estado="${z.estado}"
         role="${readOnly ? "presentation" : "button"}"
         tabindex="${readOnly ? "-1" : "0"}">
      <span class="zonaNum">Z${z.zona_id}</span>
      ${isOcupada
        ? `<div class="zonaCarShape">
             <span class="zonaCarMirrorL"></span>
             <span class="zonaCarMirrorR"></span>
             <span class="zonaCarLabel">${escapeHtml(delantero)}</span>
             <span class="zonaCarLabel">${escapeHtml(tanquero)}</span>
           </div>
           <span class="zonaVin">${escapeHtml(vinShort)}</span>`
        : `<span class="zonaEmptyP">P</span>`
      }
    </div>`;
}

function renderMapa_(container, zonas, sinZona, readOnly) {
  const byId = new Map(zonas.map(z => [z.zona_id, z]));

  const colIzqHTML = COL_IZQUIERDA.map(n =>
    renderZonaCard_(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }, readOnly)
  ).join("");

  const colDerHTML = COL_DERECHA.map(n =>
    renderZonaCard_(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }, readOnly)
  ).join("");

  // Zona Libre (zona 16)
  const sinZonaCount = sinZona.length;
  let zonaLibreBody;
  if (!sinZona.length) {
    zonaLibreBody = `<span class="zonaLibreEmpty">Sin vehículos en zona libre</span>`;
  } else {
    zonaLibreBody = sinZona.map(v => {
      const css     = ESTADO_CSS[v.estado] || "en_conversion";
      const roClass = readOnly ? " readOnly" : "";
      return `<span class="zonaLibreVin zonaLibreVin--${css}${roClass}"
                data-vin="${escapeHtml(v.vin)}"
                data-zona="16"
                data-estado="${v.estado}">
        ${escapeHtml(v.vin)}
        <span class="zonaLibreVinEstado">${v.estado === "FINALIZADO" ? "✅" : "🔧"}</span>
      </span>`;
    }).join("");
  }

  container.innerHTML = `
    <div class="zonasMapaWrap">
      <div class="zonasGrid">

        <!-- Izquierda: zonas 1-9 -->
        <div class="zonasCol" id="zonasColIzq">${colIzqHTML}</div>

        <!-- Carretera / Pasillo -->
        <div class="zonasPasillo">
          <span class="zonasPasilloArrowDown">▼</span>
          <div class="zonasPasilloLine"></div>
          <span class="zonasPasilloArrowUp">▲</span>
        </div>

        <!-- Derecha: zonas 10-15 -->
        <div class="zonasCol" id="zonasColDer">${colDerHTML}</div>

      </div>

      <!-- Zona Libre (zona 16) -->
      <div class="zonaLibreSection">
        <div class="zonaLibreHeader">
          <div class="zonaLibreHeaderLeft">
            <div class="zonaLibreTitle">ZONA LIBRE</div>
            <div class="zonaLibreSub">Área de desborde · sin espacio asignado</div>
          </div>
          ${sinZonaCount ? `<span class="zonaLibreBadge">${sinZonaCount} carro${sinZonaCount !== 1 ? "s" : ""}</span>` : ""}
        </div>
        <div class="zonaLibreBody">${zonaLibreBody}</div>
      </div>

      <div class="zonasLeyenda">
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--libre"></span>Libre</span>
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--esperando"></span>Esperando</span>
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--en_conversion"></span>En Conversión</span>
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--finalizado"></span>Listo</span>
      </div>
    </div>`;
}

// ── Action sheet (movilizador) ───────────────────────────────────────────────

let _actionSheetEl = null;
let _pickerEl = null;

function removeEl_(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function openActionSheet_(zona, onRefresh) {
  removeEl_(_actionSheetEl);
  const css     = ESTADO_CSS[zona.estado] || "libre";
  const label   = ESTADO_LABEL[zona.estado] || "Libre";
  const hasVin  = !!zona.vin;
  const zonaNom = zona.zona_id === 16 ? "Zona Libre" : `Zona ${zona.zona_id}`;

  const sheet = document.createElement("div");
  sheet.className = "zonasActionSheet";
  sheet.innerHTML = `
    <div class="zonasActionBox">
      <div class="zonasActionHead">
        <div>
          <div class="zonasActionTitle">${zonaNom}</div>
          ${hasVin ? `<div class="zonasActionVin">${escapeHtml(zona.vin)}</div>` : ""}
        </div>
        <button class="zonasPickerClose" id="zonasActionCloseBtn" type="button">✕</button>
      </div>
      <span class="zonasActionEstado zonasActionEstado--${css}">${label}</span>
      <div class="zonasActionBtns">
        <button class="zonasActionBtn" id="zonasActionAsignarBtn" type="button">
          Asignar carro a esta zona
        </button>
        ${hasVin ? `
          <button class="zonasActionBtn zonasActionBtn--danger" id="zonasActionLiberarBtn" type="button">
            Liberar zona
          </button>
        ` : ""}
      </div>
    </div>`;

  document.body.appendChild(sheet);
  _actionSheetEl = sheet;

  sheet.addEventListener("click", e => { if (e.target === sheet) closeActionSheet_(); });
  sheet.querySelector("#zonasActionCloseBtn").addEventListener("click", closeActionSheet_);

  sheet.querySelector("#zonasActionAsignarBtn").addEventListener("click", () => {
    closeActionSheet_();
    openPickerForZone_(zona.zona_id, onRefresh);
  });

  const liberarBtn = sheet.querySelector("#zonasActionLiberarBtn");
  if (liberarBtn) {
    liberarBtn.addEventListener("click", async () => {
      liberarBtn.disabled = true;
      liberarBtn.textContent = "Liberando…";
      try {
        const j = await postJSON("/api/zonas/liberar", { zona_id: zona.zona_id });
        if (!j?.ok) throw new Error(j?.error || "Error");
        closeActionSheet_();
        if (onRefresh) await onRefresh();
      } catch (e) {
        liberarBtn.disabled = false;
        liberarBtn.textContent = `Error: ${e.message}`;
      }
    });
  }
}

function closeActionSheet_() { removeEl_(_actionSheetEl); _actionSheetEl = null; }

// Mini form para asignar un VIN a una zona específica (desde click en spot)
function openPickerForZone_(zonaId, onRefresh) {
  const zonaNom = zonaId === 16 ? "Zona Libre" : `Zona ${zonaId}`;

  const sheet = document.createElement("div");
  sheet.className = "zonasActionSheet";
  sheet.innerHTML = `
    <div class="zonasActionBox" style="gap:14px;">
      <div class="zonasActionHead">
        <div class="zonasActionTitle">Asignar a ${zonaNom}</div>
        <button class="zonasPickerClose" id="zpForZoneClose" type="button">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <!-- VIN input + QR button -->
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <div style="flex:1;position:relative;">
            <input id="zpForZoneVin" type="text"
              placeholder="Ingresa el VIN…"
              style="background:var(--inputBg);border:1.5px solid var(--inputLine);border-radius:var(--radiusSm);padding:12px 14px;color:var(--text);font-size:var(--fs-md);font-family:var(--font-mono);outline:none;width:100%;box-sizing:border-box;"
              autocomplete="off" autocapitalize="characters" spellcheck="false" />
            <div id="zpForZoneVinSuggest" class="vinSuggest hidden" role="listbox"></div>
          </div>
          <button id="zpForZoneQrBtn" type="button"
            title="Escanear QR"
            style="flex-shrink:0;width:48px;height:48px;border-radius:var(--radiusSm);border:1.5px solid var(--inputLine);background:var(--bgAccent);color:var(--text);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
            📷
          </button>
        </div>
        <!-- QR reader area (hidden until activated) -->
        <div id="zpForZoneQrArea" style="display:none;border-radius:var(--radiusSm);overflow:hidden;">
          <div id="zpForZoneQrReader"></div>
          <div id="zpForZoneQrMsg" class="small" style="color:var(--muted);padding:6px 0;min-height:18px;"></div>
        </div>
        <button class="zonasActionBtn" id="zpForZoneConfirm" type="button" disabled>
          Confirmar asignación
        </button>
        <div id="zpForZoneStatus" style="font-size:var(--fs-xs);color:var(--muted);min-height:16px;"></div>
      </div>
    </div>`;

  document.body.appendChild(sheet);

  const zpScanner  = createScanner("zpForZoneQrReader");
  const vinInput   = sheet.querySelector("#zpForZoneVin");
  const suggestBox = sheet.querySelector("#zpForZoneVinSuggest");
  const qrBtn      = sheet.querySelector("#zpForZoneQrBtn");
  const qrArea     = sheet.querySelector("#zpForZoneQrArea");
  const qrMsg      = sheet.querySelector("#zpForZoneQrMsg");
  const confirmBtn = sheet.querySelector("#zpForZoneConfirm");
  const statusEl   = sheet.querySelector("#zpForZoneStatus");

  const closeMe = async () => {
    await zpScanner.stop().catch(() => {});
    removeEl_(sheet);
  };

  sheet.addEventListener("click", e => { if (e.target === sheet) closeMe(); });
  sheet.querySelector("#zpForZoneClose").addEventListener("click", closeMe);

  // ── VIN Suggest ──────────────────────────────────────────────────────
  const MIN = 1, LIMIT = 10, DEBOUNCE = 220;
  let acTimer = null, acItems = [], acIdx = -1, acLastQ = "";

  function acHide_() {
    acItems = []; acIdx = -1;
    suggestBox.classList.add("hidden");
    suggestBox.innerHTML = "";
  }

  function acRender_() {
    if (!acItems.length) { acHide_(); return; }
    suggestBox.innerHTML = acItems.map((vin, i) => `
      <div class="vsItem ${i === acIdx ? "active" : ""}" data-idx="${i}" role="option">
        <div class="vsVin">${escapeHtml(vin)}</div>
      </div>`).join("");
    suggestBox.classList.remove("hidden");
  }

  function acPick_(vin) {
    vinInput.value = String(vin || "").toUpperCase();
    acHide_();
    confirmBtn.disabled = vinInput.value.length < 5;
  }

  vinInput.addEventListener("input", () => {
    const q = vinInput.value.trim().toUpperCase();
    acLastQ = q;
    confirmBtn.disabled = q.length < 5;
    if (!q || q.length < MIN) { acHide_(); return; }
    clearTimeout(acTimer);
    acTimer = setTimeout(async () => {
      try {
        const res = await getVinSuggest(q, LIMIT);
        if (acLastQ !== q) return;
        acItems = (res || [])
          .map(it => (typeof it === "object" && it?.vin) ? String(it.vin).toUpperCase() : String(it || "").toUpperCase())
          .filter(Boolean);
        acIdx = acItems.length ? 0 : -1;
        acRender_();
      } catch { acHide_(); }
    }, DEBOUNCE);
  });

  vinInput.addEventListener("keydown", e => {
    if (!acItems.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); acIdx = Math.min(acIdx + 1, acItems.length - 1); acRender_(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acIdx = Math.max(acIdx - 1, 0); acRender_(); }
    else if (e.key === "Enter" && acIdx >= 0 && acItems[acIdx]) { e.preventDefault(); acPick_(acItems[acIdx]); }
    else if (e.key === "Escape") { acHide_(); }
  });

  suggestBox.addEventListener("mousedown", e => {
    const row = e.target.closest(".vsItem[data-idx]");
    if (!row) return;
    e.preventDefault();
    acPick_(acItems[Number(row.dataset.idx)]);
  });

  // ── QR Scanner ───────────────────────────────────────────────────────
  let qrActive = false;

  qrBtn.addEventListener("click", async () => {
    if (qrActive) {
      await zpScanner.stop().catch(() => {});
      qrArea.style.display = "none";
      qrBtn.textContent = "📷";
      qrActive = false;
      return;
    }
    qrArea.style.display = "block";
    qrBtn.textContent = "⏹";
    qrActive = true;
    try {
      await zpScanner.start({
        mode: "QR",
        msgEl: qrMsg,
        onDecoded: async (code) => {
          await zpScanner.stop().catch(() => {});
          qrArea.style.display = "none";
          qrBtn.textContent = "📷";
          qrActive = false;
          vinInput.value = code;
          vinInput.dispatchEvent(new Event("input"));
          confirmBtn.disabled = code.length < 5;
        },
      });
    } catch {
      qrArea.style.display = "none";
      qrBtn.textContent = "📷";
      qrActive = false;
    }
  });

  // ── Confirmar ────────────────────────────────────────────────────────
  confirmBtn.addEventListener("click", async () => {
    const vin = vinInput.value.trim().toUpperCase();
    if (!vin) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Guardando…";
    try {
      const j = await postJSON("/api/zonas/asignar", { zona_id: zonaId, vin, usuario: "" });
      if (!j?.ok) throw new Error(j?.error || "Error");
      await closeMe();
      if (onRefresh) await onRefresh();
    } catch (e) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirmar asignación";
      if (statusEl) statusEl.textContent = `Error: ${e.message}`;
    }
  });

  vinInput.focus();
}

// ── Picker de zona para un VIN específico ────────────────────────────────────

/**
 * Abre el picker de zonas para asignar un VIN.
 * @param {string} vin
 * @param {string} usuario
 * @param {{ zonas, sin_zona }} zonaData
 * @param {function|null} onDone - callback(zona_id) tras asignar
 * @param {boolean} dismissible
 */
export function openZonaPicker(vin, usuario, zonaData, onDone, dismissible = true) {
  removeEl_(_pickerEl);
  const { zonas = [], sin_zona = [] } = zonaData || {};
  const byId = new Map(zonas.map(z => [z.zona_id, z]));

  function pickerCard_(n) {
    const z       = byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" };
    const css     = ESTADO_CSS[z.estado] || "libre";
    const esMismo = z.vin === vin;
    const vinLabel = z.vin ? (esMismo ? "(actual)" : "…" + z.vin.slice(-6)) : "";
    const isOcupada = !!z.vin;

    return `
      <div class="zonasPickerZona zonasPickerZona--${css}" data-zona="${n}" role="button">
        <span class="zpZonaNum">Z${n}</span>
        ${isOcupada ? `<div class="zpCarShape"></div>` : ""}
        ${vinLabel ? `<span class="zpZonaVin">${escapeHtml(vinLabel)}</span>` : ""}
        ${esMismo ? `<span class="zpZonaEstado">★ Actual</span>` : ""}
      </div>`;
  }

  const allCards = [...COL_IZQUIERDA, ...COL_DERECHA].map(pickerCard_).join("");

  const picker = document.createElement("div");
  picker.className = "zonasPickerModal";
  picker.innerHTML = `
    <div class="zonasPickerBox">
      <div class="zonasPickerHead">
        <div>
          <div class="zonasPickerTitle">¿En qué zona está<br><span class="zonasPickerVin">${escapeHtml(vin)}</span>?</div>
        </div>
        ${dismissible ? `<button class="zonasPickerClose" id="zonasPickerCloseBtn" type="button">✕</button>` : ""}
      </div>
      <div class="zonasPickerHint">Toca una zona para asignar este carro</div>
      <div class="zonasPickerGrid">
        ${allCards}
        <div class="zonasPickerZona zonasPickerZona--librezona" data-zona="16" role="button">
          <span class="zpLibreLabel">ZONA LIBRE</span>
        </div>
      </div>
      <div id="zonasPickerStatus" style="font-size:var(--fs-sm);color:var(--muted);min-height:18px;"></div>
    </div>`;

  document.body.appendChild(picker);
  _pickerEl = picker;

  if (dismissible) {
    picker.addEventListener("click", e => { if (e.target === picker) closePicker_(); });
    picker.querySelector("#zonasPickerCloseBtn")?.addEventListener("click", closePicker_);
  }

  picker.querySelectorAll(".zonasPickerZona").forEach(btn => {
    btn.addEventListener("click", async () => {
      const zonaId  = Number(btn.dataset.zona);
      const statusEl = picker.querySelector("#zonasPickerStatus");

      picker.querySelectorAll(".zonasPickerZona").forEach(b => b.style.opacity = "0.4");
      btn.style.opacity = "1";
      if (statusEl) statusEl.textContent = "Guardando…";

      try {
        const j = await postJSON("/api/zonas/asignar", { zona_id: zonaId, vin, usuario });
        if (!j?.ok) throw new Error(j?.error || "Error");
        closePicker_();
        if (onDone) onDone(j.zona_id);
      } catch (e) {
        picker.querySelectorAll(".zonasPickerZona").forEach(b => b.style.opacity = "");
        if (statusEl) statusEl.textContent = `Error: ${e.message}`;
      }
    });
  });
}

function closePicker_() { removeEl_(_pickerEl); _pickerEl = null; }

// ── Inicialización del mapa ──────────────────────────────────────────────────

let _zonaData = { zonas: [], sin_zona: [] };

/**
 * Inicializa el mapa de zonas en un contenedor DOM.
 * @param {string} containerId
 * @param {{ readOnly, usuario, onZoneAction }} opts
 * @returns {{ refresh: function }}
 */
export function initZonasMapa(containerId, opts = {}) {
  const { readOnly = false, usuario = "", onZoneAction = null } = opts;
  const container = document.getElementById(containerId);
  if (!container) return null;

  async function refresh_() {
    try {
      const res = await fetch("/api/zonas");
      const j   = res.ok ? await res.json() : null;
      if (!j?.ok) return;
      _zonaData = j;
      renderMapa_(container, j.zonas, j.sin_zona, readOnly);

      const ts = document.getElementById(`${containerId}Ts`);
      if (ts) {
        const d = new Date();
        ts.textContent = `Act. ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
      }

      if (!readOnly) bindMapaClicks_(container, usuario, onZoneAction);
    } catch {}
  }

  const refreshBtn = document.getElementById(`${containerId}RefreshBtn`);
  if (refreshBtn) refreshBtn.addEventListener("click", () => refresh_().catch(() => {}));

  refresh_().catch(() => {});
  return { refresh: refresh_ };
}

function bindMapaClicks_(container, usuario, onZoneAction) {
  const old = container._zonaClickHandler;
  if (old) container.removeEventListener("click", old);

  const doRefresh_ = async () => {
    const res = await fetch("/api/zonas");
    const j   = res.ok ? await res.json() : null;
    if (!j?.ok) return;
    _zonaData = j;
    renderMapa_(container, j.zonas, j.sin_zona, false);
    bindMapaClicks_(container, usuario, onZoneAction);
    if (onZoneAction) onZoneAction();
  };

  const handler = (e) => {
    const card   = e.target.closest(".zonaCard[data-zona]");
    const libVin = e.target.closest(".zonaLibreVin[data-vin]");

    if (card) {
      const zonaId = Number(card.dataset.zona);
      const z = _zonaData.zonas.find(z => z.zona_id === zonaId)
             || { zona_id: zonaId, vin: null, estado: "LIBRE" };
      openActionSheet_(z, doRefresh_);
      return;
    }

    if (libVin) {
      const vin = libVin.dataset.vin;
      if (!vin) return;
      openZonaPicker(vin, usuario, _zonaData, doRefresh_);
    }
  };

  container._zonaClickHandler = handler;
  container.addEventListener("click", handler);
}

/**
 * Consulta si un VIN tiene zona asignada y abre el picker si no la tiene.
 * @param {string} vin
 * @param {string} usuario
 * @param {function|null} onDone
 * @param {boolean} dismissible
 */
export async function promptZonaForVin(vin, usuario, onDone, dismissible = true) {
  try {
    const res  = await fetch("/api/zonas");
    const j    = res.ok ? await res.json() : null;
    const data = j?.ok ? j : { zonas: [], sin_zona: [] };
    openZonaPicker(vin, usuario, data, onDone, dismissible);
  } catch {
    openZonaPicker(vin, usuario, { zonas: [], sin_zona: [] }, onDone, dismissible);
  }
}
