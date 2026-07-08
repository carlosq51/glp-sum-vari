// =========================
// public/js/views/conversion/modals/incidencia-alert.js
// Popup de alerta cuando el tecnico recibe una incidencia a su nombre.
// - Tiempo real: se activa por el realtime de Supabase (mientras conectado).
// - Historico: al entrar al modulo, verifica incidencias SIN RESOLVER (tiempo_fin IS NULL).
// - Sin X para el tecnico: debe marcar como solucionada (click para armar, 2do click confirma).
// =========================

import { escapeHtml } from "../../../core/format.js";
import { getNombreByEmail, getIncidenciasByTecnico, resolverIncidencia, supabaseEnabled } from "../../../core/supabase-client.js";

// --------------------------
// Estado del popup
// --------------------------
let incList_   = [];   // lista de incidencias pendientes (navegables)
let incIdx_    = 0;    // índice actual
let popupOpen_ = false;
let userEmail_ = "";   // email del técnico logueado (seteado en checkPendingAlerts_)

// estado del botón de confirmar
let confirmArmed_  = false;
let confirmTimer_  = null;
let elapsedTimer_  = null;

const POPUP_ID = "incAlertPopup";

let cachedNombre_ = null;

// --------------------------
// Metadatos por tipo
// --------------------------
const tipoMeta_ = {
  LEVE:     { emoji: "26A0 FE0F", label: "Incidencia LEVE",     color: "#f59e0b" },
  MODERADA: { emoji: "1F536",     label: "Incidencia MODERADA", color: "#f97316" },
  CRITICA:  { emoji: "1F6A8",     label: "Incidencia CRITICA",  color: "#ef4444" },
};

const emojiChar_ = {
  LEVE:     "⚠️",
  MODERADA: "🔶",
  CRITICA:  "🚨",
};

// --------------------------
// Helpers
// --------------------------
function formatElapsed_(tiempoInicio) {
  if (!tiempoInicio) return null;
  const ms = Date.now() - new Date(tiempoInicio).getTime();
  if (ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "< 1 min";
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// --------------------------
// HTML del popup
// --------------------------
function buildFotoHtml_(inc) {
  const thumbUrl = inc.fotoThumbUrl || inc.fotoImgUrl || (() => {
    const fileId = String(inc.foto_file_id || inc.fotoFileId || "").trim();
    if (!fileId) return "";
    if (fileId.includes("/")) {
      const base = (window.__ENV__?.R2_PUBLIC_URL || "").replace(/\/$/, "");
      return base ? `${base}/${fileId}` : "";
    }
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
  })();

  if (!thumbUrl) return "";

  const isR2 = !thumbUrl.includes("drive.google");
  const fotoUrl = inc.fotoUrl || thumbUrl;

  return `
    <div class="incAlertPhoto">
      ${isR2
        ? `<img src="${escapeHtml(thumbUrl)}" alt="Foto de la incidencia"
               loading="lazy"
               style="width:100%; max-width:280px; height:auto; border-radius:10px;
                      border:1px solid rgba(255,255,255,.18); display:block;"
               onerror="this.closest('.incAlertPhoto').style.display='none'" />`
        : `<a href="${escapeHtml(fotoUrl)}" target="_blank" rel="noopener">
             <img src="${escapeHtml(thumbUrl)}" alt="Foto de la incidencia"
                  loading="lazy"
                  style="width:140px; height:auto; border-radius:10px;
                         border:1px solid rgba(255,255,255,.18);"
                  onerror="this.closest('.incAlertPhoto').style.display='none'" />
           </a>
           <div class="small" style="opacity:.75; margin-top:4px;">(clic para abrir en Drive)</div>`
      }
    </div>
  `;
}

function buildHTML_(inc, idx, total) {
  const tipo       = String(inc.tipo || "").toUpperCase();
  const vin        = String(inc.vin  || "—").toUpperCase();
  const nota       = String(inc.nota || "").trim();
  const reg        = String(inc._regDisplay || inc.registrado_por || inc.calidad_email || "Calidad").trim();
  const meta       = tipoMeta_[tipo] || tipoMeta_.LEVE;
  const em         = emojiChar_[tipo] || emojiChar_.LEVE;
  const fotoHtml   = buildFotoHtml_(inc);
  const elapsedStr = formatElapsed_(inc.tiempo_inicio);

  const navHtml = total > 1 ? `
    <div class="incAlertNav">
      <button class="incAlertNavBtn" id="btnIncPrev" ${idx === 0 ? "disabled" : ""} aria-label="Anterior">&#8592;</button>
      <span class="incAlertNavCount">${idx + 1} de ${total}</span>
      <button class="incAlertNavBtn" id="btnIncNext" ${idx === total - 1 ? "disabled" : ""} aria-label="Siguiente">&#8594;</button>
    </div>
  ` : "";

  return `
    <div id="${POPUP_ID}" class="incAlertOverlay" role="alertdialog" aria-modal="true"
         aria-label="Alerta de incidencia">
      <div class="incAlertBox" style="--alert-color:${meta.color};">
        <div class="incAlertHead">
          <span class="incAlertBadge">${em} ${escapeHtml(meta.label)}</span>
          ${navHtml}
        </div>
        <div class="incAlertBody">
          <div class="incAlertRow">
            <span class="incAlertLbl">Registrado por</span>
            <span class="incAlertVal">${escapeHtml(reg)}</span>
          </div>
          <div class="incAlertRow">
            <span class="incAlertLbl">VIN</span>
            <span class="incAlertVal mono">${escapeHtml(vin)}</span>
          </div>
          ${elapsedStr ? `
          <div class="incAlertRow">
            <span class="incAlertLbl">⏱ Tiempo activa</span>
            <span class="incAlertVal" id="incAlertElapsed" style="font-weight:700;color:var(--alert-color);">${escapeHtml(elapsedStr)}</span>
          </div>` : ""}
          ${nota ? `
          <div class="incAlertRow">
            <span class="incAlertLbl">Nota</span>
            <span class="incAlertVal">${escapeHtml(nota)}</span>
          </div>` : ""}
          ${fotoHtml}
        </div>
        <div class="incAlertFooter">
          <div class="incAlertFooterNote">
            Corrige el problema antes de continuar.
          </div>
          <button id="btnSolucionada" class="incAlertBtnResolve">
            Incidencia Solucionada &#10003;
          </button>
        </div>
      </div>
    </div>
  `;
}

// --------------------------
// Core show/navigate/resolve
// --------------------------
function popup_() { return document.getElementById(POPUP_ID); }

function renderCurrent_() {
  if (!incList_.length) return;
  const inc = incList_[incIdx_];

  if (elapsedTimer_) { clearInterval(elapsedTimer_); elapsedTimer_ = null; }

  const regRaw = String(inc.registrado_por || inc.calidad_email || "").trim();
  const isEmail = regRaw.includes("@");

  const render_ = (regDisplay) => {
    const incWithNombre = { ...inc, _regDisplay: regDisplay };
    popup_()?.remove();
    document.body.insertAdjacentHTML("beforeend", buildHTML_(incWithNombre, incIdx_, incList_.length));

    const el = popup_();
    if (!el) { popupOpen_ = false; return; }

    requestAnimationFrame(() => el.classList.add("incAlertVisible"));
    resetConfirm_();
    bindPopupEvents_(inc);

    if (inc.tiempo_inicio) {
      elapsedTimer_ = setInterval(() => {
        const span = document.getElementById("incAlertElapsed");
        if (span) span.textContent = formatElapsed_(inc.tiempo_inicio) || "";
        else { clearInterval(elapsedTimer_); elapsedTimer_ = null; }
      }, 30000);
    }
  };

  if (isEmail) {
    getNombreByEmail(regRaw)
      .then(nombre => render_(nombre || regRaw))
      .catch(() => render_(regRaw));
  } else {
    render_(regRaw || "Calidad");
  }
}

function bindPopupEvents_(inc) {
  document.getElementById("btnIncPrev")?.addEventListener("click", () => {
    if (incIdx_ > 0) { incIdx_--; renderCurrent_(); }
  });
  document.getElementById("btnIncNext")?.addEventListener("click", () => {
    if (incIdx_ < incList_.length - 1) { incIdx_++; renderCurrent_(); }
  });

  const btnSol = document.getElementById("btnSolucionada");
  if (!btnSol) return;

  btnSol.addEventListener("click", () => {
    if (!confirmArmed_) {
      // Primer clic: armar confirmación
      confirmArmed_ = true;
      btnSol.textContent = "⚠️ ¿Confirmar solución? Clic de nuevo";
      btnSol.classList.add("armed");
      confirmTimer_ = setTimeout(() => resetConfirm_(), 4000);
    } else {
      // Segundo clic: resolver
      clearTimeout(confirmTimer_);
      confirmArmed_ = false;
      resolveCurrentInc_();
    }
  });
}

function resetConfirm_() {
  confirmArmed_ = false;
  clearTimeout(confirmTimer_);
  const btn = document.getElementById("btnSolucionada");
  if (btn) {
    btn.textContent = "Incidencia Solucionada ✓";
    btn.classList.remove("armed");
  }
}

async function resolveCurrentInc_() {
  const inc = incList_[incIdx_];
  if (!inc) return;

  const btn = document.getElementById("btnSolucionada");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await resolverIncidencia(inc.id, userEmail_);
  } catch (e) {
    console.warn("[incidencia-alert] error al resolver:", e.message);
  }

  // Quitar de la lista y mostrar siguiente (o cerrar si no quedan)
  incList_.splice(incIdx_, 1);
  if (incIdx_ >= incList_.length) incIdx_ = Math.max(0, incList_.length - 1);

  if (!incList_.length) {
    closePopup_();
  } else {
    renderCurrent_();
  }
}

function closePopup_() {
  if (elapsedTimer_) { clearInterval(elapsedTimer_); elapsedTimer_ = null; }
  const el = popup_();
  if (el) {
    el.classList.remove("incAlertVisible");
    setTimeout(() => { el.remove(); popupOpen_ = false; }, 280);
  } else {
    popupOpen_ = false;
  }
}

// --------------------------
// API publica
// --------------------------

/**
 * Muestra (o encola) una alerta de incidencia (via realtime INSERT).
 */
export function showIncidenciaAlert(inc) {
  if (!inc || !inc.id) return;
  // Evitar duplicados
  if (incList_.some(i => i.id === inc.id)) return;
  incList_.push(inc);

  if (!popupOpen_) {
    popupOpen_ = true;
    incIdx_ = incList_.length - 1;
    renderCurrent_();
  }
}

/**
 * Verifica incidencias SIN RESOLVER para el técnico logueado y abre el popup.
 * Solo muestra las que tienen tiempo_fin IS NULL (pendientes en BD).
 *
 * @param {string} email         - email del técnico logueado
 * @param {number} lookbackHours - cuántas horas hacia atrás revisar (default 12)
 */
export async function checkPendingAlerts_(email, lookbackHours = 12) {
  const em = String(email || "").trim().toLowerCase();
  if (!em || !supabaseEnabled()) return;

  userEmail_ = em;

  try {
    if (!cachedNombre_) cachedNombre_ = await getNombreByEmail(em);
    if (!cachedNombre_) return;

    const sinceIso = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
    // getIncidenciasByTecnico ya filtra tiempo_fin IS NULL
    const rows = await getIncidenciasByTecnico(cachedNombre_, sinceIso);
    if (!Array.isArray(rows) || !rows.length) return;

    // Agregar las que no están ya en la lista
    const existingIds = new Set(incList_.map(i => i.id));
    const nuevas = rows
      .filter(r => r && r.id && !existingIds.has(r.id))
      .sort((a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0));

    if (!nuevas.length) return;

    nuevas.forEach(r => incList_.push(r));

    if (!popupOpen_) {
      popupOpen_ = true;
      incIdx_ = 0;
      renderCurrent_();
    }
  } catch (e) {
    console.warn("[incidencia-alert] checkPendingAlerts_ error:", e);
  }
}

/**
 * Devuelve el nombre cacheado del técnico logueado.
 */
export async function getMyNombre_(email) {
  const em = String(email || "").trim().toLowerCase();
  if (!em || !supabaseEnabled()) return null;
  if (!cachedNombre_) cachedNombre_ = await getNombreByEmail(em);
  return cachedNombre_;
}
