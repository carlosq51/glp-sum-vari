// =========================
// public/js/views/supervisor/sup-incidencias.js
// INCIDENCIAS: modal + fetch + render + bind
// =========================

import { getIncidencias, supabaseEnabled } from "../../core/supabase-client.js";
import { INC_TITULOS } from "../../templates/modals/incidencias-modal.js";

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
    // 🚀 LECTURA DIRECTA DE SUPABASE (Sin Node proxy)
    try {
      const items = await getIncidencias(vin);
      return { ok: true, items };
    } catch (err) {
      console.warn("[fetchIncidencias_] Supabase error:", err.message);
      // Fallback a Node API
    }
  }

  // Fallback: Node API
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

    const hasFoto = !!(it.fotoThumbUrl || it.fotoUrl || it.fotoImgUrl);

    // R2: URLs contienen el dominio r2.dev; Drive legacy no
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

    return `
      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="row space-between" style="gap:10px;">
          <div style="font-weight:900;">
            ${escapeHtml(tipo || "INCIDENCIA")}
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

        ${fotoHtml}
      </div>
    `;
  }).join("");
}

export function bindSupIncidencias_({
  CORE,
  getJSON_user,
  escapeHtml,
  fmtShort_
}) {
  document.getElementById("supTable")?.addEventListener("click", async (e) => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    const btn = e.target?.closest?.("button[data-sup-inc]");
    if (!btn) return;

    const vin = String(btn.dataset.vin || "").trim().toUpperCase();
    const conversionId = String(btn.dataset.cid || "").trim();
    const who = String(btn.dataset.who || "").trim();

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