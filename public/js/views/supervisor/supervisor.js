// =========================
// public/js/views/supervisor/supervisor.js
// Vista SUPERVISOR (resumen + filtros + QR SUP_VIN + name suggest)
// (versión funcional “compacta”)
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */
import { CORE, $, getJSON_user, escapeHtml, fmtShort_, setOut, withLock } from "../../core/core.js";

let supTrack = "CONVERSION";
let supTimer = null;

// ==========================================================
// PROMEDIO REALISTA (MEDIANA + MAD) SIN ELIMINAR OUTLIERS
// - todos cuentan, outliers pesan menos
// ==========================================================

function median_(arr) {
  const v = [...arr].sort((a, b) => a - b);
  const n = v.length;
  if (!n) return 0;
  const m = Math.floor(n / 2);
  return n % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function mad_(arr, med) {
  const devs = arr.map((x) => Math.abs(x - med));
  return median_(devs);
}

// Peso suave: 1 cerca de la mediana, cae gradual en outliers (sin cortar)
function weightByMad_(x, med, mad, k = 3.5) {
  // z = distancia robusta
  const z = Math.abs(x - med) / (mad || 1);

  // dentro de k*MAD => peso 1
  if (z <= k) return 1;

  // fuera => baja suave (sin eliminar)
  // caída tipo 1/(1+((z-k))^2)
  const t = (z - k);
  return 1 / (1 + t * t);
}

/**
 * Promedio ponderado robusto usando Mediana+MAD (NO elimina outliers)
 * @param {number[]} arrMs - tiempos en ms
 * @param {number} k - umbral robusto (3.0–4.0 recomendado)
 */
function avgWeightedByMedianMad_(arrMs, k = 3.5) {
  const vals = arrMs.filter((x) => Number.isFinite(x) && x > 0);

  if (!vals.length) {
    return { avgMs: 0, medianMs: 0, madMs: 0, used: 0, total: 0 };
  }

  // si hay pocos, promedio simple
  if (vals.length < 3) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { avgMs: avg, medianMs: median_(vals), madMs: 0, used: vals.length, total: vals.length };
  }

  const med = median_(vals);
  const mad = mad_(vals, med) || 1;

  let sumW = 0;
  let sumWX = 0;
  let minW = 1, maxW = 0;

  for (const x of vals) {
    const w = weightByMad_(x, med, mad, k);
    sumW += w;
    sumWX += w * x;
    if (w < minW) minW = w;
    if (w > maxW) maxW = w;
  }

  const avgMs = sumW > 0 ? (sumWX / sumW) : med;

  return {
    avgMs,
    medianMs: med,
    madMs: mad,
    used: vals.length,
    total: vals.length,
    sumW,
    minW,
    maxW
  };
}

function parseTimeMs_(x) {
  // acepta Date ISO o vacío
  const t = Date.parse(String(x || ""));
  return Number.isFinite(t) ? t : 0;
}

function durationMsFromItem_(it) {
  // inicio: fecha_inicio || inicio_at || created_at || fecha_creacion
  // fin: updated_at (tu render ya lo usa como fin)
  const t0 = parseTimeMs_(it.fecha_inicio || it.inicio_at || it.created_at || it.fecha_creacion);
  const t1 = parseTimeMs_(it.updated_at);
  const d = (t0 && t1) ? (t1 - t0) : 0;
  return d > 0 ? d : 0;
}

function fmtDur_(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${hh}h ${pad(mm)}m ${pad(ss)}s`;
}

function isFinalizado_(estadoRaw) {
  const e = String(estadoRaw || "").trim().toUpperCase();
  // ajusta si tus estados son distintos:
  // "FINALIZADO", "FIN", "COMPLETADO", etc.
  return e === "FINALIZADO" || e === "FIN" || e === "COMPLETADO";
}

function setSupTrack_(t) {
  supTrack = (t === "CALIDAD" || t === "RAMAL") ? t : "CONVERSION";
  document.querySelectorAll("[data-suptrack]").forEach((b) => b.classList.toggle("active", b.dataset.suptrack === supTrack));
  const pill = document.getElementById("supTrackPill");
  if (pill) pill.textContent = supTrack === "CONVERSION" ? "CONVERSIÓN (MOTOR + TANQUE)" : supTrack === "CALIDAD" ? "CALIDAD" : "RAMAL";
  fetchSupervisorReport_().catch(() => {});
}

function supervisorDebounceFetch_() {
  clearTimeout(supTimer);
  supTimer = setTimeout(() => fetchSupervisorReport_().catch(() => {}), 250);
}

async function fetchSupervisorReport_() {
  const name = String(document.getElementById("supName")?.value || "").trim();
  const vin = String(document.getElementById("supVin")?.value || "").trim().toUpperCase();
  const from = String(document.getElementById("supFrom")?.value || "").trim();
  const to = String(document.getElementById("supTo")?.value || "").trim();
  const month = String(document.getElementById("supMonth")?.value || "").trim();
  const q = [name, vin].filter(Boolean).join(" ").trim();

  const url =
    `/api/supervisor/report` +
    `?name=${encodeURIComponent(name)}` +
    `&vin=${encodeURIComponent(vin)}` +
    `&q=${encodeURIComponent(q)}` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&month=${encodeURIComponent(month)}` +
    `&track=${encodeURIComponent(supTrack)}`;

  const j = await getJSON_user(url, "Cargando reporte...");
  if (!j?.ok) {
    const s = document.getElementById("supSummary");
    if (s) s.textContent = j?.error || "Error cargando reporte.";
    return;
  }
  renderSupervisor_(j);
}

function renderSupervisor_(j) {
  const sum = document.getElementById("supSummary");
  const box = document.getElementById("supTable");
  const avgCard = document.getElementById("supAvgCard");

  const items = Array.isArray(j.items) ? j.items : [];

    // -----------------------------------------
  // Promedio de tiempo (solo FINALIZADOS)
  // - usa los items que ya trajo el filtro (ej: 20)
  // - NO elimina outliers: solo baja su peso
  // -----------------------------------------
  const durMs = [];

  for (const it of items) {
    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
    const isRamal = rol === "RAMALERO" || rol === "RAMAL";
    if (isRamal) continue; // conversión: ignora ramal

    if (!isFinalizado_(it.estado)) continue;

    const d = durationMsFromItem_(it);
    if (d > 0) durMs.push(d);
  }

  const stats = avgWeightedByMedianMad_(durMs, 3.5); // k: 3.0–4.0

    // -----------------------------------------
  // CARTILLA: Promedio de conversión (técnico)
  // -----------------------------------------
  const techName = String(document.getElementById("supName")?.value || "").trim() || "Técnico";

  // contadores por rol (MOTOR / TANQUE) solo FINALIZADOS
  let motorCount = 0;
  let tanqueCount = 0;

  for (const it of items) {
    if (!isFinalizado_(it.estado)) continue;

    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();
    if (rol === "TANQUE" || rol === "TANQUERO") tanqueCount++;
    else if (rol === "MOTOR") motorCount++;
    else if (rol === "TECNICO" || rol === "CONVERSION") motorCount++; // fallback seguro
  }

  if (avgCard) {
    if (stats.used > 0) {
      const nameUp = String(techName || "TÉCNICO").toUpperCase();

      avgCard.innerHTML = `
        <div class="card" style="
          border:1px solid rgba(255,255,255,.18);
          border-radius:22px;
          padding:18px 18px;
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.08));
          box-shadow: 0 10px 24px rgba(0,0,0,.22);
        ">
          <!-- HEADER -->
          <div class="row space-between" style="gap:12px; align-items:flex-start;">
            <div>
              <div class="small" style="opacity:.8; letter-spacing:.5px;">TIEMPO PROMEDIO DE CONVERSIÓN</div>
              <div style="font-weight:1000; font-size:20px; letter-spacing:1px; margin-top:4px;">
                ${escapeHtml(nameUp)}
              </div>
            </div>

            <div class="pill small" style="opacity:.95;">
              FINALIZADOS: <b>${stats.used}</b>
            </div>
          </div>

          <!-- BIG TIME -->
          <div class="row" style="gap:12px; align-items:center; margin-top:14px;">
            <div style="
              width:44px; height:44px;
              display:flex; align-items:center; justify-content:center;
              border-radius:14px;
              background: rgba(255,255,255,.08);
              border:1px solid rgba(255,255,255,.14);
            ">⏱</div>

            <div>
              <div style="font-weight:1000; font-size:40px; letter-spacing:.8px; line-height:1;">
                ${escapeHtml(fmtDur_(stats.avgMs))}
              </div>
              <div class="small" style="opacity:.78; margin-top:6px;">
                Promedio robusto (outliers pesan menos)
              </div>
            </div>
          </div>

          <!-- STATS LINE -->
          <div class="row" style="gap:10px; margin-top:14px; flex-wrap:wrap;">
            <div class="pill small" style="opacity:.9;">
              MOTOR: <b>${motorCount}</b>
            </div>
            <div class="pill small" style="opacity:.9;">
              TANQUE: <b>${tanqueCount}</b>
            </div>
          </div>

          <!-- FOOTNOTE -->
          <div class="small" style="margin-top:12px; opacity:.75;">
            (Solo se consideran trabajos en estado <b>FINALIZADO</b>)
          </div>
        </div>
      `;
    } else {
      avgCard.innerHTML = `
        <div class="card" style="border:1px solid rgba(255,255,255,.14); border-radius:18px; padding:14px;">
          <div class="small">Sin FINALIZADOS con tiempo válido.</div>
        </div>
      `;
    }
  }

  if (!box) return;

  if (!items.length) {
    if (sum) sum.textContent = "Resultados: 0";
    box.innerHTML = `<div class="small">No hay resultados con esos filtros.</div>`;
    return;
  }

  if (sum) {
    const base = `Resultados: ${items.length}`;
    if (stats.used > 0) {
      sum.textContent =
        `${base} — FINALIZADOS: ${stats.used}` +
        ` — Promedio (robusto): ${fmtDur_(stats.avgMs)}` +
        ` — Mediana: ${fmtDur_(stats.medianMs)}`;
    } else {
      sum.textContent = `${base} — FINALIZADOS: 0 (sin datos de tiempo)`;
    }
  }

  box.innerHTML = items.map((it) => {
    const who = it.userName || it.userEmail || it.userId || "-";
    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase() || "-";
    const isRamal = rol === "RAMALERO" || rol === "RAMAL";
    const vinOrTipo = isRamal ? `RAMAL: ${it.tipoRamal || "-"}` : (it.vin || "-");

    const vinCard = String(it.vin || "").trim().toUpperCase();
    const conversionIdCard = String(it.conversionId || it.conversion_id || "").trim();

    return `
      <div class="card" style="margin-top:10px;">
        <div style="font-weight:900;">
          ${escapeHtml(who)} <span class="small">(${escapeHtml(rol)})</span>
        </div>

        <div class="row space-between" style="margin-top:8px; gap:10px;">
          <div class="small"><b>Trabajo:</b> ${escapeHtml(vinOrTipo)}</div>
          <div class="pill small"><b>${escapeHtml(it.estado || "")}</b></div>
        </div>

        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${escapeHtml(fmtShort_(it.fecha_inicio || it.inicio_at || it.created_at || it.fecha_creacion))}
          &nbsp;|&nbsp;
          <b>Fin:</b> ${escapeHtml(fmtShort_(it.updated_at))}
        </div>

        ${
          (!isRamal && (vinCard || conversionIdCard))
            ? `
              <div class="row" style="margin-top:10px; gap:10px;">
                <button
                  type="button"
                  class="btn3"
                  data-sup-inc="1"
                  data-vin="${escapeHtml(vinCard)}"
                  data-cid="${escapeHtml(conversionIdCard)}"
                  data-who="${escapeHtml(who)}"
                >
                  📋 Incidencias
                </button>
              </div>
            `
            : ""
        }
      </div>
    `;
  }).join("");
}

// QR SUP_VIN (simple)
let qr = null;

async function openSupQR() {
  const modal = document.getElementById("qrModal");
  modal?.classList?.add("show");
  await startSupQR();
}

async function closeSupQR() {
  document.getElementById("qrModal")?.classList?.remove("show");
  try { if (qr && qr.isScanning) await qr.stop(); } catch {}
}

async function startSupQR() {
  const msg = document.getElementById("qrMsg");
  try {
    if (!window.Html5Qrcode) { if (msg) msg.textContent = "No se pudo cargar la librería QR."; return; }
    if (!qr) qr = new Html5Qrcode("qrReader");

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };

    const onDecoded = async (decodedText) => {
      const code = String(decodedText || "").trim().toUpperCase();
      if (!code) return;

      const supVinEl = document.getElementById("supVin");
      if (supVinEl) supVinEl.value = code;

      if (msg) msg.textContent = `VIN detectado: ${code}`;
      await closeSupQR();
      fetchSupervisorReport_().catch(() => {});
    };

    try { await qr.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {}); return; } catch {}
    await qr.start({ facingMode: "environment" }, config, onDecoded, () => {});
  } catch {
    if (msg) msg.textContent = "No se pudo abrir la cámara. Revisa permisos.";
  }
}
function openSupIncModal_() {
  const m = document.getElementById("supIncModal");
  m?.classList?.add("show");
}

function closeSupIncModal_() {
  document.getElementById("supIncModal")?.classList?.remove("show");
}

function fmtIncFecha_(x) {
  try { return escapeHtml(fmtShort_(x)); } catch { return escapeHtml(String(x || "")); }
}

async function fetchIncidencias_(vin, conversionId) {
  const url =
    `/api/incidencias/list` +
    `?vin=${encodeURIComponent(vin || "")}` +
    `&conversionId=${encodeURIComponent(conversionId || "")}` +
    `&limit=${encodeURIComponent(200)}`;

  const r = await getJSON_user(url, "Cargando incidencias...");
  return r;
}

function renderIncidencias_(j, ctx) {
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
    const nota = it.nota || "";
    const fecha = it.fecha || "";

    const hasFoto = !!(it.fotoThumbUrl || it.fotoUrl || it.fotoImgUrl);

    const fotoHtml = hasFoto ? `
      <div style="margin-top:10px;">
        <a href="${escapeHtml(it.fotoUrl || it.fotoImgUrl)}" target="_blank" rel="noopener">
          <img
            src="${escapeHtml(it.fotoThumbUrl || it.fotoImgUrl)}"
            alt="Foto incidencia"
            style="width:140px; height:auto; border-radius:10px; border:1px solid rgba(255,255,255,.18);"
          />
        </a>
        <div class="small" style="opacity:.85; margin-top:6px;">
          (clic para abrir)
        </div>
      </div>
    ` : "";

    return `
      <div class="card" style="margin-top:10px; border:1px solid rgba(255,255,255,.14);">
        <div class="row space-between" style="gap:10px;">
          <div style="font-weight:900;">
            ${escapeHtml(tipo || "INCIDENCIA")}
          </div>
          <div class="small" style="opacity:.9;">
            ${fmtIncFecha_(fecha)}
          </div>
        </div>

        <div class="small" style="margin-top:8px;">
          <b>Técnico:</b> ${escapeHtml(tecnico)}
        </div>

        ${nota ? `
          <div class="small" style="margin-top:8px; white-space:pre-wrap;">
            <b>Nota:</b> ${escapeHtml(nota)}
          </div>
        ` : `<div class="small" style="margin-top:8px; opacity:.8;">Sin nota.</div>`}

        ${fotoHtml}
      </div>
    `;
  }).join("");
}

export function init() {
  document.querySelectorAll("[data-suptrack]").forEach((btn) => btn.addEventListener("click", () => setSupTrack_(btn.dataset.suptrack)));
  document.getElementById("btnSupApply")?.addEventListener("click", () => fetchSupervisorReport_().catch(() => {}));
    // --------------------------
  // CLICK: botón "Incidencias" dentro de cards
  // --------------------------
  document.getElementById("supTable")?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("button[data-sup-inc]");
    if (!btn) return;

    const vin = String(btn.dataset.vin || "").trim().toUpperCase();
    const conversionId = String(btn.dataset.cid || "").trim();
    const who = String(btn.dataset.who || "").trim();

    openSupIncModal_();

    const msg = document.getElementById("supIncMsg");
    if (msg) msg.textContent = "Cargando...";

    try {
      const j = await fetchIncidencias_(vin, conversionId);
      renderIncidencias_(j, { vin, conversionId, who });
    } catch (err) {
      renderIncidencias_({ ok:false, error:String(err?.message || err) }, { vin, conversionId, who });
    }
  });
  document.getElementById("btnCloseSupInc")?.addEventListener("click", () => closeSupIncModal_());
  document.getElementById("supIncModal")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("supIncModal")) closeSupIncModal_();
  });
  document.getElementById("btnSupClear")?.addEventListener("click", () => {
    ["supName","supVin","supFrom","supTo","supMonth"].forEach((id) => { const el = document.getElementById(id); if (el) el.value=""; });
    fetchSupervisorReport_().catch(() => {});
  });

  // --------------------------
// FECHAS RÁPIDAS: AYER / HOY / ESTE MES
// --------------------------
function pad2_(n) { return String(n).padStart(2, "0"); }
function toDateInput_(d) {
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  const day = pad2_(d.getDate());
  return `${y}-${m}-${day}`;
}
function toMonthInput_(d) {
  const y = d.getFullYear();
  const m = pad2_(d.getMonth() + 1);
  return `${y}-${m}`;
}

document.getElementById("btnSupHoy")?.addEventListener("click", () => {
  const now = new Date();
  const s = toDateInput_(now);

  const fromEl = document.getElementById("supFrom");
  const toEl   = document.getElementById("supTo");
  if (fromEl) fromEl.value = s;
  if (toEl)   toEl.value = s;

  // opcional: limpiar mes para que no "confunda"
  const mEl = document.getElementById("supMonth");
  if (mEl) mEl.value = "";

  fetchSupervisorReport_().catch(() => {});
});

document.getElementById("btnSupAyer")?.addEventListener("click", () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = toDateInput_(d);

  const fromEl = document.getElementById("supFrom");
  const toEl   = document.getElementById("supTo");
  if (fromEl) fromEl.value = s;
  if (toEl)   toEl.value = s;

  const mEl = document.getElementById("supMonth");
  if (mEl) mEl.value = "";

  fetchSupervisorReport_().catch(() => {});
});

document.getElementById("btnSupEsteMes")?.addEventListener("click", () => {
  const now = new Date();
  const m = toMonthInput_(now);

  const mEl = document.getElementById("supMonth");
  if (mEl) mEl.value = m;

  // opcional: limpiar rango de fechas para que no "confunda"
  const fromEl = document.getElementById("supFrom");
  const toEl   = document.getElementById("supTo");
  if (fromEl) fromEl.value = "";
  if (toEl)   toEl.value = "";

  fetchSupervisorReport_().catch(() => {});
});

  document.getElementById("btnSupQR")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;
    openSupQR().catch(() => {});
  });

  document.getElementById("btnCloseQR")?.addEventListener("click", () => closeSupQR());
  document.getElementById("qrModal")?.addEventListener("click", async (e) => {
    if (e.target === document.getElementById("qrModal")) await closeSupQR();
  });

  // --------------------------
  // NAME SUGGEST (ligero) + REPORTE bajo demanda
  // --------------------------
  const NAME_AC = { MIN_CHARS: 3, DEBOUNCE_MS: 750, LIMIT: 12 };
  let nameTimer = null;
  let nameAbort = null;
  let nameItems = [];
  let nameOpen = false;
  let nameIndex = -1;
  let lastNameQ = "";

  function nameBox_() { return document.getElementById("supNameSuggest"); }

  function nameHide_() {
    const box = nameBox_();
    if (!box) return;
    nameOpen = false;
    nameIndex = -1;
    nameItems = [];
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  function nameRender_() {
    const box = nameBox_();
    if (!box) return;
    if (!nameItems.length) return nameHide_();

    box.innerHTML = nameItems.map((it, i) => {
      const active = i === nameIndex ? "active" : "";
      const label = it.name || it.email || it.id || "";
      const hint = it.email ? it.email : "";
      return `
        <div class="vsItem ${active}" data-idx="${i}" role="option" aria-selected="${i === nameIndex}">
          <div class="vsVin">${escapeHtml(label)}</div>
          <div class="vsHint">${escapeHtml(hint)}</div>
        </div>
      `;
    }).join("");

    box.classList.remove("hidden");
    nameOpen = true;
  }

  function nameSetIndex_(i) {
    nameIndex = Math.max(0, Math.min(i, nameItems.length - 1));
    nameRender_();
    const box = nameBox_();
    const el = box?.querySelector(`.vsItem[data-idx="${nameIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  async function nameFetch_(q) {
    try { nameAbort?.abort?.(); } catch {}
    nameAbort = new AbortController();

    const url = `/api/name-suggest?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(NAME_AC.LIMIT)}`;
    const r = await fetch(url, { signal: nameAbort.signal });
    const j = await r.json();
    if (!j?.ok) return [];
    // esperado: [{name,email,id}, ...] o strings
    const arr = Array.isArray(j.items) ? j.items : [];
    return arr.map((x) => (typeof x === "string" ? ({ name: x }) : x)).filter(Boolean);
  }

  function namePick_(it) {
    const input = document.getElementById("supName");
    if (!input) return;

    const label = String(it?.name || it?.email || it?.id || "").trim();
    input.value = label;
    nameHide_();

    // 👉 aquí SÍ disparamos el reporte, pero solo cuando eliges un nombre
    fetchSupervisorReport_().catch(() => {});
  }

  function nameOnInput_() {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    const input = document.getElementById("supName");
    if (!input) return;

    const q = String(input.value || "").trim();
    lastNameQ = q;

    // no pedir nada hasta tener 3 letras
    if (!q || q.length < NAME_AC.MIN_CHARS) {
      nameHide_();
      return;
    }

    clearTimeout(nameTimer);
    nameTimer = setTimeout(async () => {
      try {
        const items = await nameFetch_(q);
        if (lastNameQ !== q) return;
        nameItems = items;
        nameIndex = nameItems.length ? 0 : -1;
        nameRender_();
      } catch {
        nameHide_();
      }
    }, NAME_AC.DEBOUNCE_MS);
  }

  function nameOnKeyDown_(e) {
    if (CORE.state.currentModule !== "SUPERVISOR") return;

    if (e.key === "Enter") {
      // Enter = aplicar filtros (reporte)
      e.preventDefault();
      nameHide_();
      fetchSupervisorReport_().catch(() => {});
      return;
    }

    if (!nameOpen) return;

    if (e.key === "ArrowDown") { e.preventDefault(); return nameSetIndex_(nameIndex + 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); return nameSetIndex_(nameIndex - 1); }
    if (e.key === "Escape") { e.preventDefault(); return nameHide_(); }

    if (e.key === "Tab") {
      // Tab: completa el seleccionado
      if (nameIndex >= 0 && nameItems[nameIndex]) {
        e.preventDefault();
        namePick_(nameItems[nameIndex]);
      }
    }
  }

  const supNameEl = document.getElementById("supName");
  const supNameSuggestEl = document.getElementById("supNameSuggest");

  supNameEl?.addEventListener("input", nameOnInput_);
  supNameEl?.addEventListener("keydown", nameOnKeyDown_);

  // click en sugerencia
  supNameSuggestEl?.addEventListener("mousedown", (e) => {
    const row = e.target.closest(".vsItem[data-idx]");
    if (!row) return;
    e.preventDefault();
    const idx = Number(row.dataset.idx);
    const it = nameItems[idx];
    if (it) namePick_(it);
  });

  // cerrar sugerencias al click fuera
  document.addEventListener("click", (e) => {
    if (!nameOpen) return;
    const wrap = document.querySelector(".supNameWrap");
    if (wrap && wrap.contains(e.target)) return;
    nameHide_();
  });
}

export function enter() {
  CORE.state.currentModule = "SUPERVISOR";
  // warmup sugerencias
  if (!window.__nameSuggestWarmed) {
    window.__nameSuggestWarmed = true;
    fetch("/api/name-suggest?q=.&limit=200").catch(() => {});
  }
  fetchSupervisorReport_().catch(() => {});
}

export function exit() {
  clearTimeout(supTimer);
}