// =========================
// public/js/views/conversion/modals/incidencia-alert.js
// Popup de alerta cuando el tecnico recibe una incidencia a su nombre.
// - Tiempo real: se activa por el realtime de Supabase (mientras conectado).
// - Historico: al entrar al modulo, verifica incidencias no vistas de las
//   ultimas N horas (cubre el caso offline -> online).
// =========================

import { escapeHtml } from "../../../core/format.js";
import { getNombreByEmail, getIncidenciasByTecnico, supabaseEnabled } from "../../../core/supabase-client.js";

// --------------------------
// Cola y estado
// --------------------------
const alertQueue_ = [];
let alertOpen_ = false;

const POPUP_ID = "incAlertPopup";

// Nombre del técnico logueado (se cachea tras el primer lookup)
let cachedNombre_ = null;

// --------------------------
// localStorage "ya vistas"
// Las IDs se guardan al cerrar el popup para no mostrarlas de nuevo.
// --------------------------
const SEEN_KEY = "glp_inc_seen";
const SEEN_MAX = 300;

function getSeenIds_() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); }
  catch { return new Set(); }
}

function markSeen_(id) {
  if (!id) return;
  try {
    const arr = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    if (!arr.includes(id)) {
      arr.push(id);
      if (arr.length > SEEN_MAX) arr.splice(0, arr.length - SEEN_MAX);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    }
  } catch {}
}

// --------------------------
// Metadatos por tipo
// --------------------------
const tipoMeta_ = {
  LEVE:     { emoji: "26A0 FE0F", label: "Incidencia LEVE",     color: "#f59e0b" },
  MODERADA: { emoji: "1F536",     label: "Incidencia MODERADA", color: "#f97316" },
  CRITICA:  { emoji: "1F6A8",     label: "Incidencia CRITICA",  color: "#ef4444" },
};

const emojiChar_ = {
  LEVE:     "\u26A0\uFE0F",
  MODERADA: "\uD83D\uDD36",
  CRITICA:  "\uD83D\uDEA8",
};

// --------------------------
// HTML del popup
// --------------------------
function driveThumb_(fileId) {
  if (!fileId) return "";
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
}

function buildHTML_(inc) {
  const tipo    = String(inc.tipo || "").toUpperCase();
  const vin     = String(inc.vin  || "\u2014").toUpperCase();
  const nota    = String(inc.nota || "").trim();
  const reg     = String(inc._regDisplay || inc.registrado_por || inc.calidad_email || "Calidad").trim();
  const fileId  = String(inc.foto_file_id || inc.fotoFileId || "").trim();
  const meta    = tipoMeta_[tipo] || tipoMeta_.LEVE;
  const em      = emojiChar_[tipo] || emojiChar_.LEVE;
  const thumbUrl = driveThumb_(fileId);

  return `
    <div id="${POPUP_ID}" class="incAlertOverlay" role="alertdialog" aria-modal="true"
         aria-label="Alerta de incidencia">
      <div class="incAlertBox" style="--alert-color:${meta.color};">
        <div class="incAlertHead">
          <span class="incAlertBadge">${em} ${escapeHtml(meta.label)}</span>
          <button id="btnCloseIncAlert" class="incAlertClose" aria-label="Cerrar alerta">\u2715</button>
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
          ${nota ? `
          <div class="incAlertRow">
            <span class="incAlertLbl">Nota</span>
            <span class="incAlertVal">${escapeHtml(nota)}</span>
          </div>` : ""}
          ${thumbUrl ? `
          <div class="incAlertPhoto">
            <img src="${thumbUrl}" alt="Foto de la incidencia"
                 loading="lazy"
                 onerror="this.closest('.incAlertPhoto').style.display='none'" />
          </div>` : ""}
        </div>
        <div class="incAlertFooter">
          <div class="incAlertFooterNote">
            Revisa los detalles con tu supervisor.
          </div>
          <button id="btnCloseIncAlert2" class="incAlertBtn">
            Entendido \u2713
          </button>
        </div>
      </div>
    </div>
  `;
}

// --------------------------
// Core show/close
// --------------------------
function popup_() { return document.getElementById(POPUP_ID); }

function closeAlert_(inc) {
  if (inc && inc.id) markSeen_(inc.id);
  const el = popup_();
  if (el) {
    el.classList.remove("incAlertVisible");
    setTimeout(() => {
      el.remove();
      alertOpen_ = false;
      showNext_();
    }, 280);
  } else {
    alertOpen_ = false;
    showNext_();
  }
}

function showNext_() {
  if (alertOpen_ || !alertQueue_.length) return;
  const inc = alertQueue_.shift();
  showAlert_(inc);
}

function showAlert_(inc) {
  popup_()?.remove();
  alertOpen_ = true;

  // Resolver nombre del registrador si lo guardado parece un email
  const regRaw = String(inc.registrado_por || inc.calidad_email || "").trim();
  const isEmail = regRaw.includes("@");

  const render_ = (regDisplay) => {
    const incWithNombre = { ...inc, _regDisplay: regDisplay };
    document.body.insertAdjacentHTML("beforeend", buildHTML_(incWithNombre));

    const el = popup_();
    if (!el) { alertOpen_ = false; return; }

    requestAnimationFrame(() => el.classList.add("incAlertVisible"));

    el.querySelector("#btnCloseIncAlert")?.addEventListener("click",  () => closeAlert_(inc));
    el.querySelector("#btnCloseIncAlert2")?.addEventListener("click", () => closeAlert_(inc));
  };

  if (isEmail) {
    getNombreByEmail(regRaw)
      .then(nombre => render_(nombre || regRaw))
      .catch(() => render_(regRaw));
  } else {
    render_(regRaw || "Calidad");
  }
}

// --------------------------
// API publica
// --------------------------

/**
 * Muestra (o encola) una alerta de incidencia.
 * Llamado desde el realtime cuando llega un INSERT mientras el tecnico esta conectado.
 */
export function showIncidenciaAlert(inc) {
  if (!inc) return;
  if (inc.id && getSeenIds_().has(inc.id)) return; // ya la vio antes
  alertQueue_.push(inc);
  showNext_();
}

/**
 * Verifica incidencias historicas para el tecnico logueado y muestra
 * popups por las que todavia no haya cerrado.
 *
 * Llamar al entrar al modulo TECNICO (cubre caso offline -> reconexion).
 *
 * @param {string} email       - email del tecnico logueado
 * @param {number} lookbackHours - cuantas horas hacia atras revisar (default 12)
 */
export async function checkPendingAlerts_(email, lookbackHours = 12) {
  const em = String(email || "").trim().toLowerCase();
  if (!em || !supabaseEnabled()) return;

  try {
    // Obtener nombre del técnico (con cache para no repetir el lookup)
    if (!cachedNombre_) cachedNombre_ = await getNombreByEmail(em);
    if (!cachedNombre_) return;

    const sinceIso = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
    const rows = await getIncidenciasByTecnico(cachedNombre_, sinceIso);
    if (!Array.isArray(rows) || !rows.length) return;

    const seen = getSeenIds_();

    // Ordenar cronologicamente y filtrar las ya vistas
    rows
      .filter(r => r && r.id && !seen.has(r.id))
      .sort((a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0))
      .forEach(r => alertQueue_.push(r));

    showNext_();
  } catch (e) {
    console.warn("[incidencia-alert] checkPendingAlerts_ error:", e);
  }
}

/**
 * Devuelve el nombre cacheado del técnico logueado.
 * Útil para que otros módulos comparen sin hacer otro lookup.
 */
export async function getMyNombre_(email) {
  const em = String(email || "").trim().toLowerCase();
  if (!em || !supabaseEnabled()) return null;
  if (!cachedNombre_) cachedNombre_ = await getNombreByEmail(em);
  return cachedNombre_;
}
