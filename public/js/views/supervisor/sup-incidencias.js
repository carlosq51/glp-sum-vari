// =========================
// public/js/views/supervisor/sup-incidencias.js
// INCIDENCIAS: modal histórico (QC ve todas) + popup de resolución para activas
// =========================

import { getIncidencias, resolverIncidencia, supabaseEnabled, getNombreByEmail } from "../../core/supabase-client.js";
import { INC_TITULOS } from "../../templates/modals/incidencias-modal.js";
import { formatElapsed_ } from "../../core/format.js";

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

  const TIPO_COLOR = { LEVE: "#f59e0b", MODERADA: "#f97316", CRITICA: "#ef4444" };
  const TIPO_EMOJI = { LEVE: "⚠️", MODERADA: "🔶", CRITICA: "🚨" };

  list.innerHTML = items.map((it) => {
    const tipo     = String(it.tipo || "").toUpperCase();
    const tecnico  = it.tecnico || "-";
    const rawNota  = it.nota || "";
    const fecha    = it.fecha_hora || it.fecha || "";
    const { titulo, extra } = parseNota_(rawNota);
    const resuelta = !!it.tiempo_fin;
    const color    = TIPO_COLOR[tipo] || "#f59e0b";
    const emoji    = TIPO_EMOJI[tipo] || "⚠️";

    const hasFoto   = !!(it.fotoThumbUrl || it.fotoUrl || it.fotoImgUrl);
    const isR2Photo = !!(it.fotoThumbUrl && !it.fotoThumbUrl.includes("drive.google"));
    const fotoHtml  = hasFoto ? `
      <div style="margin-top:10px;">
        ${isR2Photo ? `
          <img src="${escapeHtml(it.fotoThumbUrl || it.fotoImgUrl)}" alt="Foto incidencia"
               style="width:100%; max-width:280px; height:auto; border-radius:8px;
                      border:1px solid rgba(255,255,255,.15); display:block;" loading="lazy" />
        ` : `
          <a href="${escapeHtml(it.fotoUrl || it.fotoImgUrl)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(it.fotoThumbUrl || it.fotoImgUrl)}" alt="Foto incidencia"
                 style="width:140px; height:auto; border-radius:8px;
                        border:1px solid rgba(255,255,255,.15);" loading="lazy" />
          </a>
          <div class="small" style="opacity:.7; margin-top:4px;">(clic para abrir en Drive)</div>
        `}
      </div>
    ` : "";

    const fmtDurMin = (min) => {
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60), m = min % 60;
      return m > 0 ? `${h}h ${m}min` : `${h}h`;
    };

    const duracionHtml = it.duracion_min != null
      ? `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:10px;
                      background:${color}22;color:${color};border:1px solid ${color}44;
                      border-radius:20px;padding:3px 10px;font-size:.78rem;font-weight:700;">
           ⏱ ${fmtDurMin(it.duracion_min)}
         </span>`
      : "";

    const estadoBadge = resuelta
      ? `<span style="font-size:.7rem;background:#16a34a22;color:#4ade80;border:1px solid #16a34a44;
                      border-radius:20px;padding:2px 8px;font-weight:600;">✓ Resuelta</span>`
      : `<span style="font-size:.7rem;background:#dc262622;color:#f87171;border:1px solid #dc262644;
                      border-radius:20px;padding:2px 8px;font-weight:600;">● Activa</span>`;

    return `
      <div style="margin-top:10px;border-radius:var(--radius);border:1px solid rgba(255,255,255,.1);
                  border-left:3px solid ${color};padding:12px 14px;
                  background:var(--bg2,rgba(255,255,255,.04));opacity:${resuelta ? ".7" : "1"};">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <div style="display:flex;flex-direction:column;gap:5px;">
            <span style="background:${color}22;color:${color};border:1px solid ${color}55;
                         border-radius:6px;padding:4px 12px;font-weight:800;font-size:.85rem;
                         letter-spacing:.04em;">
              ${emoji} INCIDENCIA ${escapeHtml(tipo || "—")}
            </span>
            ${it.duracion_min != null
              ? `<span style="color:${color};font-size:.8rem;font-weight:700;padding-left:4px;">⏱ ${fmtDurMin(it.duracion_min)}</span>`
              : ""}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            ${estadoBadge}
            <span style="font-size:.7rem;opacity:.45;">${fmtIncFecha_(fecha, { escapeHtml, fmtShort_ })}</span>
          </div>
        </div>

        <div class="small" style="margin-bottom:3px;">
          <b>Técnico:</b> ${escapeHtml(tecnico)}
        </div>
        ${it.vin ? `<div class="small" style="margin-bottom:6px;opacity:.8;">
          <b>VIN:</b> <span class="mono">${escapeHtml(it.vin)}</span>
        </div>` : ""}

        ${titulo ? `<div class="small" style="margin-top:6px;padding:4px 8px;background:rgba(255,255,255,.06);
                        border-radius:4px;">📌 ${escapeHtml(titulo)}</div>` : ""}
        ${extra  ? `<div class="small" style="margin-top:6px;white-space:pre-wrap;opacity:.8;">
                        ${escapeHtml(extra)}</div>`
                 : (!titulo ? `<div class="small" style="margin-top:6px;opacity:.4;">Sin nota.</div>` : "")}

        ${fotoHtml}
      </div>
    `;
  }).join("");
}

// --------------------------
// Popup QC para incidencias activas (con X + resolver + navegación)
// --------------------------

const QC_POPUP_ID = "qcIncPopup";

let qcList_          = [];
let qcIdx_           = 0;
let qcOpen_          = false;
let qcEscapeHtml_    = null;
let qcUserEmail_     = "";
let qcElapsedTimer_  = null;
let qcResolveClose_  = null;

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

function buildQcHTML_(inc, idx, total, regDisplay) {
  const esc        = qcEscapeHtml_ || ((x) => x);
  const tipo       = String(inc.tipo || "").toUpperCase();
  const meta       = tipoMeta_[tipo] || tipoMeta_.LEVE;
  const em         = emojiChar_[tipo] || "⚠️";
  const vin        = String(inc.vin  || "—").toUpperCase();
  const nota       = String(inc.nota || "").trim();
  const reg        = String(regDisplay || inc.registrado_por || "Calidad").trim();
  const tec        = String(inc.tecnico || "—").trim();
  const foto       = buildQcFotoHtml_(inc);
  const elapsedStr = formatElapsed_(inc.tiempo_inicio);

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
        <div class="incAlertHead" style="background:${meta.color};border-radius:var(--radius) var(--radius) 0 0;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span style="color:#fff;font-weight:800;font-size:.95rem;letter-spacing:.04em;line-height:1.2;">
            ${em} INCIDENCIA ${esc(tipo)}${elapsedStr ? ` — <span id="qcIncElapsed">${esc(elapsedStr)}</span>` : ""}
          </span>
          <div style="display:flex;align-items:center;gap:8px;">
            ${navHtml}
            <button id="btnQcClose" class="incAlertClose" aria-label="Cerrar" style="color:#fff;opacity:.85;">&#10005;</button>
          </div>
        </div>
        ${nota || foto ? `
        <div class="incAlertBody">
          ${nota ? `<p style="margin:0 0 ${foto ? "12px" : "0"};white-space:pre-wrap;font-size:.9rem;opacity:.9;">${esc(nota)}</p>` : ""}
          ${foto}
        </div>` : ""}
        <div class="incAlertFooter">
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

  if (qcElapsedTimer_) { clearInterval(qcElapsedTimer_); qcElapsedTimer_ = null; }

  const regRaw  = String(inc.registrado_por || "").trim();
  const isEmail = regRaw.includes("@");

  const render_ = (regDisplay) => {
    qcPopup_()?.remove();
    document.body.insertAdjacentHTML("beforeend", buildQcHTML_(inc, qcIdx_, qcList_.length, regDisplay));

    const el = qcPopup_();
    if (!el) { qcOpen_ = false; return; }

    requestAnimationFrame(() => el.classList.add("incAlertVisible"));

    if (inc.tiempo_inicio) {
      qcElapsedTimer_ = setInterval(() => {
        const span = document.getElementById("qcIncElapsed");
        if (span) span.textContent = formatElapsed_(inc.tiempo_inicio) || "";
        else { clearInterval(qcElapsedTimer_); qcElapsedTimer_ = null; }
      }, 1000);
    }

    document.getElementById("btnQcClose")?.addEventListener("click", closeQcPopup_);
    el.addEventListener("click", (e) => { if (e.target === el) closeQcPopup_(); });

    document.getElementById("btnQcPrev")?.addEventListener("click", () => {
      if (qcIdx_ > 0) { qcIdx_--; renderQcCurrent_(); }
    });
    document.getElementById("btnQcNext")?.addEventListener("click", () => {
      if (qcIdx_ < qcList_.length - 1) { qcIdx_++; renderQcCurrent_(); }
    });

    document.getElementById("btnQcResolver")?.addEventListener("click", resolveQcCurrent_);
  };

  if (isEmail) {
    getNombreByEmail(regRaw)
      .then(nombre => render_(nombre || regRaw))
      .catch(() => render_(regRaw));
  } else {
    render_(regRaw || "Calidad");
  }
}

function closeQcPopup_() {
  if (qcElapsedTimer_) { clearInterval(qcElapsedTimer_); qcElapsedTimer_ = null; }
  const el = qcPopup_();
  const done = () => {
    qcOpen_ = false;
    if (qcResolveClose_) { qcResolveClose_(); qcResolveClose_ = null; }
  };
  if (el) {
    el.classList.remove("incAlertVisible");
    setTimeout(() => { el.remove(); done(); }, 280);
  } else {
    done();
  }
}

async function resolveQcCurrent_() {
  const inc = qcList_[qcIdx_];
  if (!inc) return;

  const btn = document.getElementById("btnQcResolver");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await resolverIncidencia(inc.id, qcUserEmail_);
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

async function fetchIncidenciasActivas_(vin, conversionId, { getJSON_user } = {}) {
  let activas = [];

  if (supabaseEnabled() && vin) {
    try {
      activas = await getIncidencias(vin, { soloActivas: true });
    } catch (err) {
      console.warn("[fetchIncidenciasActivas_] Supabase error:", err.message);
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
      console.warn("[fetchIncidenciasActivas_] fallback error:", err.message);
    }
  }

  return activas;
}

// Cuenta incidencias activas (tiempo_fin IS NULL) sin abrir ningún popup —
// usado para bloquear el cierre de OT (ej. FIN de CALIDAD) antes de mostrar UI.
export async function countIncidenciasActivas_(vin, conversionId, { getJSON_user } = {}) {
  const activas = await fetchIncidenciasActivas_(vin, conversionId, { getJSON_user });
  return activas.length;
}

export async function openQCIncPopup_(vin, conversionId, { getJSON_user, escapeHtml, userEmail = "" } = {}) {
  qcEscapeHtml_  = escapeHtml || ((x) => x);
  qcUserEmail_   = userEmail;

  const activas = await fetchIncidenciasActivas_(vin, conversionId, { getJSON_user });
  if (!activas.length) return false;

  qcList_ = activas;
  qcIdx_  = 0;
  qcOpen_ = true;
  return new Promise(resolve => {
    qcResolveClose_ = resolve;
    renderQcCurrent_();
  });
}

// --------------------------
// Bind eventos supervisor
// --------------------------
export function bindSupIncidencias_({
  CORE,
  getJSON_user,
  escapeHtml,
  fmtShort_,
  getEmail,
}) {
  document.getElementById("supTable")?.addEventListener("click", async (e) => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    const btn = e.target?.closest?.("button[data-sup-inc]");
    if (!btn) return;

    const vin          = String(btn.dataset.vin || "").trim().toUpperCase();
    const conversionId = String(btn.dataset.cid || "").trim();
    const who          = String(btn.dataset.who || "").trim();
    const email        = typeof getEmail === "function" ? getEmail() : "";

    // Primero intenta mostrar activas, luego siempre abre histórico
    await openQCIncPopup_(vin, conversionId, { getJSON_user, escapeHtml, userEmail: email });

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
