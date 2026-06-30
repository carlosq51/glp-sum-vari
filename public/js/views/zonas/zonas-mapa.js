// =========================
// public/js/views/zonas/zonas-mapa.js
// Componente compartido: mapa visual de las 15 zonas de conversión.
// Usado en movilizador (interactivo) y supervisor (read-only).
// =========================

import { escapeHtml, postJSON } from "../../core/core.js";

// ── Configuración de layout ──────────────────────────────────────────────────
// Derecha: zonas 1-9 (9 spots) | Izquierda: zonas 10-15 (6 spots)
const COL_DERECHA  = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const COL_IZQUIERDA = [10, 11, 12, 13, 14, 15];

const ESTADO_LABEL = {
  LIBRE:          "Libre",
  ESPERANDO:      "⏳ En Espera",
  EN_CONVERSION:  "🔧 En Conversión",
  FINALIZADO:     "✅ Listo",
};

const ESTADO_CSS = {
  LIBRE:          "libre",
  ESPERANDO:      "esperando",
  EN_CONVERSION:  "en_conversion",
  FINALIZADO:     "finalizado",
};

// ── Render del mapa ──────────────────────────────────────────────────────────

function renderZonaCard_(z, readOnly) {
  const css  = ESTADO_CSS[z.estado] || "libre";
  const label = ESTADO_LABEL[z.estado] || "Libre";
  const roClass = readOnly ? " readOnly" : "";
  const vinDisplay = z.vin
    ? escapeHtml(z.vin.length > 12 ? z.vin.slice(-10) : z.vin)
    : "—";
  return `
    <div class="zonaCard zonaCard--${css}${roClass}"
         data-zona="${z.zona_id}"
         data-vin="${escapeHtml(z.vin || "")}"
         data-estado="${z.estado}"
         role="${readOnly ? "presentation" : "button"}"
         tabindex="${readOnly ? "-1" : "0"}">
      <span class="zonaNum">ZONA ${z.zona_id}</span>
      <span class="zonaVin">${vinDisplay}</span>
      <span class="zonaEstadoChip">${label}</span>
    </div>`;
}

function renderMapa_(container, zonas, sinZona, readOnly) {
  const byId = new Map(zonas.map(z => [z.zona_id, z]));

  const colDerHTML  = COL_DERECHA.map(n => renderZonaCard_(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }, readOnly)).join("");
  const colIzqHTML  = COL_IZQUIERDA.map(n => renderZonaCard_(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }, readOnly)).join("");

  // Zona 16: sin ubicación
  let sinZonaBody;
  if (!sinZona.length) {
    sinZonaBody = `<span class="zonaSinUbicacionEmpty">Ningún vehículo sin zona asignada</span>`;
  } else {
    sinZonaBody = sinZona.map(v => {
      const css = ESTADO_CSS[v.estado] || "en_conversion";
      const roClass = readOnly ? " readOnly" : "";
      return `<span class="zonaSuVin zonaSuVin--${css}${roClass}"
                data-vin="${escapeHtml(v.vin)}"
                data-zona="16"
                data-estado="${v.estado}">
        ${escapeHtml(v.vin)}
        <span class="zonaSuVinEstado">${v.estado === "FINALIZADO" ? "✅" : "🔧"}</span>
      </span>`;
    }).join("");
  }

  container.innerHTML = `
    <div class="zonasMapaWrap">
      <div class="zonasGrid">
        <div class="zonasCol" id="zonasColIzq">${colIzqHTML}</div>
        <div class="zonasPasillo">
          <span class="zonasPasilloLabel">PASILLO</span>
          <div class="zonasPasilloLine"></div>
        </div>
        <div class="zonasCol" id="zonasColDer">${colDerHTML}</div>
      </div>

      <div class="zonaSinUbicacion">
        <div class="zonaSinUbicacionHeader">
          <span>📍 Sin ubicación</span>
          <span style="font-size:var(--fs-2xs);font-weight:normal;opacity:.6;">Zona 16</span>
        </div>
        <div class="zonaSinUbicacionBody">${sinZonaBody}</div>
      </div>

      <div class="zonasLeyenda">
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--libre"></span>Libre</span>
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--esperando"></span>En Espera</span>
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--en_conversion"></span>En Conversión</span>
        <span class="zonasLeyendaItem"><span class="zonasLeyendaDot zonasLeyendaDot--finalizado"></span>Listo para mover</span>
      </div>
    </div>`;
}

// ── Action sheet (movilizador) ───────────────────────────────────────────────

let _actionSheetEl = null;
let _pickerEl = null;

function removeSheet_(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function openActionSheet_(zona, onRefresh) {
  removeSheet_(_actionSheetEl);
  const css    = ESTADO_CSS[zona.estado] || "libre";
  const label  = ESTADO_LABEL[zona.estado] || "Libre";
  const hasVin = !!zona.vin;

  const sheet = document.createElement("div");
  sheet.className = "zonasActionSheet";
  sheet.innerHTML = `
    <div class="zonasActionBox">
      <div class="zonasActionHead">
        <div>
          <div class="zonasActionTitle">Zona ${zona.zona_id}</div>
          ${hasVin ? `<div class="zonasActionVin">${escapeHtml(zona.vin)}</div>` : ""}
        </div>
        <button class="zonasPickerClose" id="zonasActionCloseBtn" type="button">✕</button>
      </div>
      <span class="zonasActionEstado zonasActionEstado--${css}">${label}</span>
      <div class="zonasActionBtns">
        <button class="zonasActionBtn" id="zonasActionAsignarBtn" type="button">
          🚗 Asignar carro a esta zona
        </button>
        ${hasVin ? `
          <button class="zonasActionBtn zonasActionBtn--danger" id="zonasActionLiberarBtn" type="button">
            🔓 Liberar zona (sacar carro)
          </button>
        ` : ""}
      </div>
    </div>`;

  document.body.appendChild(sheet);
  _actionSheetEl = sheet;

  sheet.addEventListener("click", e => {
    if (e.target === sheet) closeActionSheet_();
  });
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

function closeActionSheet_() { removeSheet_(_actionSheetEl); _actionSheetEl = null; }

// ── Picker: seleccionar zona para un VIN ─────────────────────────────────────

/**
 * Abre el picker de zonas para asignar un VIN.
 * @param {string} vin - VIN a asignar
 * @param {string} usuario - nombre del usuario
 * @param {{ zonas, sin_zona }} zonaData - datos actuales del mapa
 * @param {function} onDone - callback tras asignar zona (zona_id: number | null)
 * @param {boolean} dismissible - si se puede cerrar sin elegir
 */
export function openZonaPicker(vin, usuario, zonaData, onDone, dismissible = true) {
  removeSheet_(_pickerEl);
  const { zonas = [], sin_zona = [] } = zonaData || {};
  const byId = new Map(zonas.map(z => [z.zona_id, z]));

  function zonaPickerCard_(n) {
    const z = byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" };
    const css = ESTADO_CSS[z.estado] || "libre";
    const esMismoVin = z.vin === vin;
    return `
      <div class="zonasPickerZona zonasPickerZona--${css}" data-zona="${n}" role="button">
        <span class="zpZonaNum">Zona ${n}</span>
        ${z.vin ? `<span class="zpZonaVin">${escapeHtml(esMismoVin ? "(actual)" : z.vin.slice(-8))}</span>` : ""}
        <span class="zpZonaEstado">${esMismoVin ? "★ Actual" : ESTADO_LABEL[z.estado] || "Libre"}</span>
      </div>`;
  }

  const allCards = [...COL_DERECHA, ...COL_IZQUIERDA].sort((a,b) => a-b).map(zonaPickerCard_).join("");

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
        <div class="zonasPickerZona zonasPickerZona--sinubic" data-zona="16" role="button">
          <span class="zpSinUbicLabel">📍 Sin ubicación (Zona 16)</span>
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
      const zonaId = Number(btn.dataset.zona);
      const statusEl = picker.querySelector("#zonasPickerStatus");

      picker.querySelectorAll(".zonasPickerZona").forEach(b => b.style.opacity = "0.5");
      btn.style.opacity = "1";
      if (statusEl) statusEl.textContent = "Guardando…";

      try {
        const j = await postJSON("/api/zonas/asignar", {
          zona_id: zonaId,
          vin,
          usuario,
        });
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

function closePicker_() { removeSheet_(_pickerEl); _pickerEl = null; }

// ── Inicialización del mapa ──────────────────────────────────────────────────

let _zonaData = { zonas: [], sin_zona: [] };

/**
 * Inicializa el mapa de zonas en un contenedor.
 * @param {string} containerId - ID del elemento contenedor
 * @param {{ readOnly, usuario, onZoneAction }} opts
 *   readOnly: true = solo visualización (supervisor)
 *   usuario: nombre del usuario activo (movilizador)
 *   onZoneAction: callback tras cualquier acción (para refrescar datos externos)
 */
export function initZonasMapa(containerId, opts = {}) {
  const { readOnly = false, usuario = "", onZoneAction = null } = opts;
  const container = document.getElementById(containerId);
  if (!container) return;

  async function refresh_() {
    try {
      const res = await fetch("/api/zonas");
      const j = res.ok ? await res.json() : null;
      if (!j?.ok) return;
      _zonaData = j;
      renderMapa_(container, j.zonas, j.sin_zona, readOnly);

      // Timestamp
      const ts = document.getElementById(`${containerId}Ts`);
      if (ts) {
        const d = new Date();
        ts.textContent = `Actualizado ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
      }

      // Bind clicks si no es read-only
      if (!readOnly) bindMapaClicks_(container, usuario, onZoneAction);
    } catch {}
  }

  // Botón refresh externo (si existe)
  const refreshBtn = document.getElementById(`${containerId}RefreshBtn`);
  if (refreshBtn) refreshBtn.addEventListener("click", () => refresh_().catch(() => {}));

  refresh_().catch(() => {});
  return { refresh: refresh_ };
}

function bindMapaClicks_(container, usuario, onZoneAction) {
  // Remover listener anterior para evitar duplicados
  const old = container._zonaClickHandler;
  if (old) container.removeEventListener("click", old);

  const handler = async (e) => {
    const card = e.target.closest(".zonaCard[data-zona]");
    const suVin = e.target.closest(".zonaSuVin[data-vin]");

    if (card) {
      const zonaId = Number(card.dataset.zona);
      const z = _zonaData.zonas.find(z => z.zona_id === zonaId)
             || { zona_id: zonaId, vin: null, estado: "LIBRE" };
      openActionSheet_(z, async () => {
        // Refresh del mapa tras acción
        const res = await fetch("/api/zonas");
        const j = res.ok ? await res.json() : null;
        if (!j?.ok) return;
        _zonaData = j;
        renderMapa_(container, j.zonas, j.sin_zona, false);
        bindMapaClicks_(container, usuario, onZoneAction);
        if (onZoneAction) onZoneAction();
      });
      return;
    }

    if (suVin) {
      const vin = suVin.dataset.vin;
      if (!vin) return;
      // VIN sin zona → abrir picker directamente para asignarlo
      openZonaPicker(vin, usuario, _zonaData, async (zonaId) => {
        const res = await fetch("/api/zonas");
        const j = res.ok ? await res.json() : null;
        if (!j?.ok) return;
        _zonaData = j;
        renderMapa_(container, j.zonas, j.sin_zona, false);
        bindMapaClicks_(container, usuario, onZoneAction);
        if (onZoneAction) onZoneAction();
      });
    }
  };

  container._zonaClickHandler = handler;
  container.addEventListener("click", handler);
}

/**
 * Abre el picker para asignar zona a un VIN específico.
 * Primero hace fetch del estado actual del mapa para mostrar disponibilidad.
 * @param {string} vin
 * @param {string} usuario
 * @param {function} onDone - callback(zona_id)
 * @param {boolean} dismissible
 */
export async function promptZonaForVin(vin, usuario, onDone, dismissible = true) {
  try {
    const res = await fetch("/api/zonas");
    const j = res.ok ? await res.json() : null;
    const data = j?.ok ? j : { zonas: [], sin_zona: [] };
    openZonaPicker(vin, usuario, data, onDone, dismissible);
  } catch {
    openZonaPicker(vin, usuario, { zonas: [], sin_zona: [] }, onDone, dismissible);
  }
}
