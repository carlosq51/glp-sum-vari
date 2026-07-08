// =========================
// public/js/views/supervisor/sup-incidencias.js
// INCIDENCIAS: modal histórico (QC ve todas) + popup de resolución para activas
// =========================

import { getIncidencias, resolverIncidencia, supabaseEnabled } from "../../core/supabase-client.js";
import { getEmail } from "../../core/auth.js";
import { INC_TITULOS } from "../../templates/modals/incidencias-modal.js";

// --------------------------
// Modal historico (sin cambios)
// --------------------------
export function openSupIncModal_() {
  const m = document.getElementById("supIncModal");
  m?.classList?.add("show");
}

export function closeSupIncModal_() {
  document.getElementById("supIncModal")?.classList?.remove("show");
}

export function fmtIncFecha_(x, { escapeHtml, fmtShort_ }) {
  try { return escapeHtml(fmtShort_(x)); } catch { return escapeHtml(String(x || "")); }
}

export async function fetchIncidencias_(vin, conversionId, { getJSON_user }) {
  if (supabaseEnabled() && vin) {
    try {
      const items = await getIncidencias(vin);
      return { ok: true, items };
    } catch (err) {
      console.warn("[fetchIncidencias_] Supabase error:", err.message);
    }
  }

  const url =
    `/api/incidencias/list` +
    `?vin=${encodeURIComponent(vin || "")}` +
    `&conversionId=${encodeURIComponent(conversionId || "")}` +
    `&limit=${encodeURIComponent(200)}`;

  const r = await getJSON_user(url, "Cargando incidencias...");
  return r;
}

const INC_TITULOS_CONOCIDOS = new Set(INC_TITULOS);

function parseNota_(raw) {
  const s = String(raw || "").trim();
  const nl = s.indexOf("\n");
  if (nl === -1) {
    return INC_TITULOS_CONOCIDOS.has(s.toUpperCase())
      ? { titulo: s, extra: "" }
      : { titulo: "", extra: s };
  }
  const first = s.slice(0, nl).trim();
  const rest  = s.slice(nl + 1).trim();
  return INC_TITULOS_CONOCIDOS.has(first.toUpperCase())
    ? { titulo: first, extra: rest }
    : { titulo: "", extra: s };
}

export function renderIncidencias_(j, ctx, { escapeHtml, fmtShort_ }) {
  const info = document.getElementById("supIncInfo");
  const list = document.getElementById("supIncList");
  const msg  = document.getElementById("supIncMsg");

  if (msg) msg.textContent = "";
  if (list) list.innerHTML = "";

  const who = ctx?.who || "-";
  const vin = ctx?.vin || "-";
  const cid = ctx?.conversionId || "";

  if (info) info.textContent = `${who} — VIN: ${vin}${cid ? ` — CID: ${cid}` : ""}`;

  if (!j?.ok) {
    if (msg) msg.textContent = j?.error || "Error cargando incidencias.";
    return;
  }

  const items = Array.isArray(j.items) ? j.items : [];
  if (!items.length) {
    if (list) list.innerHTML = `<div class="small">No hay incidencias registradas.</div>`;
    return;
  }

  if (!list) return;

  list.innerHTML = items.map((it) => {
    const tipo = String(it.tipo || "").toUpperCase();
    const tecnico = it.tecnico || "-";
    const rawNota = it.nota || "";
    const fecha = it.fecha_hora || it.fecha || "";
    const { titulo, extra } = parseNota_(rawNota);
    const resuelta = !!it.tiempo_fin;

    const hasFoto = !!(it.fotoThumbUrl || it.fotoUrl || it.fotoImgUrl);
    const isR2Photo = !!(it.fotoThumbUrl && !it.fotoThumbUrl.includes("drive.google"));
    const fotoHtml = hasFoto ? `
      <div style="margin-top:10px;">
        ${isR2Photo ? `
          <img
            src="${escapeHtml(it.fotoThumbUrl || it.fotoImgUrl)}"
            alt="Foto incidencia"
            style="width:100%; max-width:280px; height:auto; border-radius:10px;
                   border:1px solid rgba(255,255,255,.18); display:block;"
            loading="lazy"
          />
        ` : `
          <a href="${escapeHtml(it.fotoUrl || it.fotoImgUrl)}" target="_blank" rel="noopener">
            <img
              src="${escapeHtml(it.fotoThumbUrl || it.fotoImgUrl)}"
              alt="Foto incidencia"
              style="width:140px; height:auto; border-radius:10px;
                     border:1px solid rgba(255,255,255,.18);"
              loading="lazy"
            />
          </a>
          <div class="small" style="opacity:.85; margin-top:6px;">(clic para abrir en Drive)</div>
        `}
      </div>
    ` : "";

    const duracionHtml = it.duracion_min != null
      ? `<div class="small" style="margin-top:4px; opacity:.7;">⏱ Duración: ${it.duracion_min} min</div>`
      : (resuelta ? `<div class="small" style="margin-top:4px; opacity:.7;">⏱ Tiempo no disponible</div>` : "");

    const estadoBadge = resuelta
      ? `<span style="font-size:.7rem; background:#16a34a; color:#fff; border-radius:4px; padding:2px 6px; margin-left:6px;">Resuelta</span>`
      : `<span style="font-size:.7rem; background:#dc2626; color:#fff; border-radius:4px; padding:2px 6px; margin-left:6px;">Pendiente</span>`;

    return `
      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14); opacity:${resuelta ? ".65" : "1"};">
        <div class="row space-between" style="gap:10px;">
          <div style="font-weight:900;">
            ${escapeHtml(tipo || "INCIDENCIA")}${estadoBadge}
          </div>
          <div class="small" style="opacity:.9;">
            ${fmtIncFecha_(fecha, { escapeHtml, fmtShort_ })}
          </div>
        </div>

        <div class="small" style="margin-top:8px;">
          <b>Técnico:</b> ${escapeHtml(tecnico)}
        </div>

        ${it.vin ? `
          <div class="small" style="margin-top:4px;">
            <b>VIN:</b> <span class="mono">${escapeHtml(it.vin)}</span>
          </div>
        ` : ""}

        ${titulo ? `
          <div class="small incTituloChip" style="margin-top:8px;">
            📌 ${escapeHtml(titulo)}
          </div>
        ` : ""}

        ${extra ? `
          <div class="small" style="margin-top:6px; white-space:pre-wrap; opacity:.85;">
            ${escapeHtml(extra)}
          </div>
        ` : (!titulo ? `<div class="small" style="margin-top:8px; opacity:.6;">Sin nota.</div>` : "")}

        ${duracionHtml}
        ${fotoHtml}
      </div>
    `;
  }).join("");
}

// --------------------------
// Popup QC para incidencias activas (con X + resolver + navegación)
// --------------------------

const QC_POPUP_ID = "qcIncPopup";

let qcList_    = [];
let qcIdx_     = 0;
let qcOpen_    = false;
let qcEscapeHtml_ = null;

const tipoMeta_ = {
  LEVE:     { label: "Incidencia LEVE",     color: "#f59e0b" },
  MODERADA: { label: "Incidencia MODERADA", color: "#f97316" },
  CRITICA:  { label: "Incidencia CRITICA",  color: "#ef4444" },
};

const emojiChar_ = {
  LEVE: "⚠️", MODERADA: "🔶", CRITICA: "🚨",
};

function buildQcFotoHtml_(inc) {
  const thumbUrl = inc.fotoThumbUrl || inc.fotoImgUrl || "";
  if (!thumbUrl) return "";
  const isR2 = !thumbUrl.includes("drive.google");
  const fotoUrl = inc.fotoUrl || thumbUrl;
  const esc = qcEscapeHtml_ || ((x) => x);
  return `
    <div class="incAlertPhoto">
      ${isR2
        ? `<img src="${esc(thumbUrl)}" alt="Foto" loading="lazy"
               style="width:100%; max-width:280px; height:auto; border-radius:10px;
                      border:1px solid rgba(255,255,255,.18); display:block;"
               onerror="this.closest('.incAlertPhoto').style.display='none'" />`
        : `<a href="${esc(fotoUrl)}" target="_blank" rel="noopener">
             <img src="${esc(thumbUrl)}" alt="Foto" loading="lazy"
                  style="width:140px; height:auto; border-radius:10px;
                         border:1px solid rgba(255,255,255,.18);"
                  onerror="this.closest('.incAlertPhoto').style.display='none'" />
           </a>
           <div class="small" style="opacity:.75; margin-top:4px;">(clic para abrir en Drive)</div>`
      }
    </div>
  `;
}

function buildQcHTML_(inc, idx, total) {
  const esc  = qcEscapeHtml_ || ((x) => x);
  const tipo = String(inc.tipo || "").toUpperCase();
  const meta = tipoMeta_[tipo] || tipoMeta_.LEVE;
  const em   = emojiChar_[tipo] || "⚠️";
  const vin  = String(inc.vin  || "—").toUpperCase();
  const nota = String(inc.nota || "").trim();
  const reg  = String(inc.registrado_por || "Calidad").trim();
  const tec  = String(inc.tecnico || "—").trim();
  const foto = buildQcFotoHtml_(inc);

  const navHtml = total > 1 ? `
    <div class="incAlertNav">
      <button class="incAlertNavBtn" id="btnQcPrev" ${idx === 0 ? "disabled" : ""}>&#8592;</button>
      <span class="incAlertNavCount">${idx + 1} de ${total}</span>
      <button class="incAlertNavBtn" id="btnQcNext" ${idx === total - 1 ? "disabled" : ""}>&#8594;</button>
    </div>
  ` : "";

  return `
    <div id="${QC_POPUP_ID}" class="incAlertOverlay" role="dialog" aria-modal="true">
      <div class="incAlertBox" style="--alert-color:${meta.color};">
        <div class="incAlertHead">
          <span class="incAlertBadge">${em} ${esc(meta.label)}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            ${navHtml}
            <button id="btnQcClose" class="incAlertClose" aria-label="Cerrar">&#10005;</button>
          </div>
        </div>
        <div class="incAlertBody">
          <div class="incAlertRow">
            <span class="incAlertLbl">Registrado por</span>
            <span class="incAlertVal">${esc(reg)}</span>
          </div>
          <div class="incAlertRow">
            <span class="incAlertLbl">Técnico</span>
            <span class="incAlertVal">${esc(tec)}</span>
          </div>
          <div class="incAlertRow">
            <span class="incAlertLbl">VIN</span>
            <span class="incAlertVal mono">${esc(vin)}</span>
          </div>
          ${nota ? `
          <div class="incAlertRow">
            <span class="incAlertLbl">Nota</span>
            <span class="incAlertVal">${esc(nota)}</span>
          </div>` : ""}
          ${foto}
        </div>
        <div class="incAlertFooter">
          <div class="incAlertFooterNote">Control de calidad — puede cerrar sin resolver.</div>
          <button id="btnQcResolver" class="incAlertBtnResolve">
            Registrar como Solucionada &#10003;
          </button>
        </div>
      </div>
    </div>
  `;
}

function qcPopup_() { return document.getElementById(QC_POPUP_ID); }

function renderQcCurrent_() {
  if (!qcList_.length) return;
  const inc = qcList_[qcIdx_];

  qcPopup_()?.remove();
  document.body.insertAdjacentHTML("beforeend", buildQcHTML_(inc, qcIdx_, qcList_.length));

  const el = qcPopup_();
  if (!el) { qcOpen_ = false; return; }

  requestAnimationFrame(() => el.classList.add("incAlertVisible"));

  document.getElementById("btnQcClose")?.addEventListener("click", closeQcPopup_);
  el.addEventListener("click", (e) => { if (e.target === el) closeQcPopup_(); });

  document.getElementById("btnQcPrev")?.addEventListener("click", () => {
    if (qcIdx_ > 0) { qcIdx_--; renderQcCurrent_(); }
  });
  document.getElementById("btnQcNext")?.addEventListener("click", () => {
    if (qcIdx_ < qcList_.length - 1) { qcIdx_++; renderQcCurrent_(); }
  });

  document.getElementById("btnQcResolver")?.addEventListener("click", resolveQcCurrent_);
}

function closeQcPopup_() {
  const el = qcPopup_();
  if (el) {
    el.classList.remove("incAlertVisible");
    setTimeout(() => { el.remove(); qcOpen_ = false; }, 280);
  } else {
    qcOpen_ = false;
  }
}

async function resolveQcCurrent_() {
  const inc = qcList_[qcIdx_];
  if (!inc) return;

  const btn = document.getElementById("btnQcResolver");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    const email = getEmail();
    await resolverIncidencia(inc.id, email);
  } catch (e) {
    console.warn("[sup-incidencias] error resolviendo:", e.message);
    if (btn) { btn.disabled = false; btn.textContent = "Registrar como Solucionada ✓"; }
    return;
  }

  qcList_.splice(qcIdx_, 1);
  if (qcIdx_ >= qcList_.length) qcIdx_ = Math.max(0, qcList_.length - 1);

  if (!qcList_.length) {
    closeQcPopup_();
  } else {
    renderQcCurrent_();
  }
}

export async function openQCIncPopup_(vin, conversionId, { getJSON_user, escapeHtml } = {}) {
  qcEscapeHtml_ = escapeHtml || ((x) => x);

  let activas = [];

  if (supabaseEnabled() && vin) {
    try {
      activas = await getIncidencias(vin, { soloActivas: true });
    } catch (err) {
      console.warn("[openQCIncPopup_] Supabase error:", err.message);
    }
  }

  // Fallback: usar backend con ?activas=true
  if (!activas.length && (vin || conversionId)) {
    try {
      const url =
        `/api/incidencias/list` +
        `?vin=${encodeURIComponent(vin || "")}` +
        `&conversionId=${encodeURIComponent(conversionId || "")}` +
        `&activas=true&limit=200`;
      const r = getJSON_user ? await getJSON_user(url) : await fetch(url).then(x => x.json());
      if (r?.ok && Array.isArray(r.items)) activas = r.items;
    } catch (err) {
      console.warn("[openQCIncPopup_] fallback error:", err.message);
    }
  }

  if (!activas.length) {
    alert("No hay incidencias activas para esta OT.");
    return;
  }

  qcList_ = activas;
  qcIdx_  = 0;
  qcOpen_ = true;
  renderQcCurrent_();
}

// --------------------------
// Bind eventos supervisor
// --------------------------
export function bindSupIncidencias_({
  CORE,
  getJSON_user,
  escapeHtml,
  fmtShort_
}) {
  // Click en badge de incidencias activas → abre popup QC
  document.getElementById("supTable")?.addEventListener("click", async (e) => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    // Botón para popup de resolución QC (incidencias activas)
    const btnQC = e.target?.closest?.("button[data-qc-inc]");
    if (btnQC) {
      const vin = String(btnQC.dataset.vin || "").trim().toUpperCase();
      const cid = String(btnQC.dataset.cid || "").trim();
      await openQCIncPopup_(vin, cid, { getJSON_user, escapeHtml });
      return;
    }

    // Botón para modal histórico (todas las incidencias)
    const btnHist = e.target?.closest?.("button[data-sup-inc]");
    if (!btnHist) return;

    const vin = String(btnHist.dataset.vin || "").trim().toUpperCase();
    const conversionId = String(btnHist.dataset.cid || "").trim();
    const who = String(btnHist.dataset.who || "").trim();

    openSupIncModal_();

    const msg = document.getElementById("supIncMsg");
    if (msg) msg.textContent = "Cargando...";

    try {
      const j = await fetchIncidencias_(vin, conversionId, { getJSON_user });
      renderIncidencias_(j, { vin, conversionId, who }, { escapeHtml, fmtShort_ });
    } catch (err) {
      renderIncidencias_({ ok:false, error:String(err?.message || err) }, { vin, conversionId, who }, { escapeHtml, fmtShort_ });
    }
  });

  document.getElementById("btnCloseSupInc")?.addEventListener("click", () => closeSupIncModal_());
  document.getElementById("supIncModal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("supIncModal")) closeSupIncModal_();
  });
}
