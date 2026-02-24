// =========================
// public/js/views/supervisor/supervisor.js
// Vista SUPERVISOR (resumen + filtros + QR SUP_VIN + name suggest)
// (versión funcional “compacta”)
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */
import { CORE, $, getJSON_user, escapeHtml, fmtShort_, setOut, withLock } from "../../core/core.js";

let supTrack = "CONVERSION";
let supTimer = null;

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

  const items = Array.isArray(j.items) ? j.items : [];
  if (!box) return;

  if (!items.length) {
    if (sum) sum.textContent = "Resultados: 0";
    box.innerHTML = `<div class="small">No hay resultados con esos filtros.</div>`;
    return;
  }

  if (sum) sum.textContent = `Resultados: ${items.length}`;

  box.innerHTML = items.map((it) => {
    const who = it.userName || it.userEmail || it.userId || "-";
    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase() || "-";
    const isRamal = rol === "RAMALERO" || rol === "RAMAL";
    const vinOrTipo = isRamal ? `RAMAL: ${it.tipoRamal || "-"}` : (it.vin || "-");

    return `
      <div class="card" style="margin-top:10px;">
        <div style="font-weight:900;">
          ${escapeHtml(who)} <span class="small">(${escapeHtml(rol)})</span>
        </div>
        <div class="row space-between" style="margin-top:8px;">
          <div class="small"><b>Trabajo:</b> ${escapeHtml(vinOrTipo)}</div>
          <div class="pill small"><b>${escapeHtml(it.estado || "")}</b></div>
        </div>
        <div class="small" style="margin-top:6px;">
          <b>Inicio:</b> ${escapeHtml(fmtShort_(it.fecha_inicio || it.inicio_at || it.created_at || it.fecha_creacion))}
          &nbsp;|&nbsp;
          <b>Fin:</b> ${escapeHtml(fmtShort_(it.updated_at))}
        </div>
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

export function init() {
  document.querySelectorAll("[data-suptrack]").forEach((btn) => btn.addEventListener("click", () => setSupTrack_(btn.dataset.suptrack)));
  document.getElementById("btnSupApply")?.addEventListener("click", () => fetchSupervisorReport_().catch(() => {}));
  document.getElementById("btnSupClear")?.addEventListener("click", () => {
    ["supName","supVin","supFrom","supTo","supMonth"].forEach((id) => { const el = document.getElementById(id); if (el) el.value=""; });
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