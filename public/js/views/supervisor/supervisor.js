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

  // name input: fetch debounce
  document.getElementById("supName")?.addEventListener("input", () => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;
    supervisorDebounceFetch_();
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