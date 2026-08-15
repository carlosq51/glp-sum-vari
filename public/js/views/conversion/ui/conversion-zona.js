// public/js/views/conversion/ui/conversion-zona.js
// Panel 📍 "Registrar carro en zona" (vista TECNICO).
//
// De noche no hay movilizador en el taller: el técnico que llega y encuentra
// un carro estacionado necesita poder dejarlo registrado a su nombre, igual
// que lo haría el movilizador de día. Esto reemplaza al viejo modal de
// Buscar/Validar, que solo consultaba y no dejaba rastro de quién ubicó qué.

import { CORE, escapeHtml, getJSON, createVinSuggest_ } from "../../../core/core.js";
import { createScanner } from "../../../core/qr-scanner.js";
import { promptZonaForVin } from "../../zonas/zonas-mapa.js";

const zonaScanner_ = createScanner("tecZonaQrReader");

let sug_       = null;
let inited_    = false;
let qrActive_  = false;

// ── Helpers DOM ───────────────────────────────────────────────────────────
const $id = (id) => document.getElementById(id);

function currentVin_() {
  return String($id("tecZonaVin")?.value || "").trim().toUpperCase();
}

function miNombre_() {
  return String(CORE.state.currentProfile?.nombre || "").trim();
}

function setMsg_(html, tone = "muted") {
  const el = $id("tecZonaMsg");
  if (!el) return;
  const color = tone === "error" ? "var(--danger)"
              : tone === "ok"    ? "var(--ok, #4ade80)"
              : "var(--muted)";
  el.innerHTML = html ? `<span style="color:${color};">${html}</span>` : "";
}

function syncConfirmBtn_() {
  const btn = $id("btnTecZonaElegir");
  if (btn) btn.disabled = currentVin_().length < 5;
}

// ── Estado actual del VIN (¿ya tiene zona?) ──────────────────────────────
async function showZonaActual_(vin) {
  const box = $id("tecZonaActual");
  if (!box) return;
  if (!vin || vin.length < 5) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="small muted">Consultando…</div>`;
  try {
    const j = await getJSON(`/api/zonas/vin/${encodeURIComponent(vin)}`);
    if (!j?.ok) throw new Error(j?.error || "Error");
    box.innerHTML = j.zona_id
      ? `<div class="small">Ahora mismo está en <b>Zona ${j.zona_id}</b>. Si lo asignas de nuevo, se moverá.</div>`
      : `<div class="small muted">Todavía no tiene zona asignada.</div>`;
  } catch {
    box.innerHTML = "";
  }
}

// ── Abrir el picker de zonas ─────────────────────────────────────────────
function elegirZona_() {
  const vin = currentVin_();
  if (vin.length < 5) return;
  const nombre = miNombre_();
  setMsg_("");
  promptZonaForVin(vin, nombre, (zonaId) => {
    const dondeTxt = zonaId === 16 ? "Zona Libre" : `Zona ${zonaId}`;
    setMsg_(`✅ <b>${escapeHtml(vin)}</b> registrado en <b>${dondeTxt}</b>${nombre ? ` a nombre de ${escapeHtml(nombre)}` : ""}.`, "ok");
    const inp = $id("tecZonaVin");
    if (inp) inp.value = "";
    const box = $id("tecZonaActual");
    if (box) box.innerHTML = "";
    syncConfirmBtn_();
  });
}

// ── Cámara QR ─────────────────────────────────────────────────────────────
async function stopQr_() {
  await zonaScanner_.stop().catch(() => {});
  const area = $id("tecZonaQrArea");
  if (area) area.style.display = "none";
  const btn = $id("btnTecZonaQr");
  if (btn) btn.textContent = "📷";
  qrActive_ = false;
}

async function toggleQr_() {
  if (qrActive_) { await stopQr_(); return; }
  const area = $id("tecZonaQrArea");
  const btn  = $id("btnTecZonaQr");
  if (area) area.style.display = "block";
  if (btn)  btn.textContent = "⏹";
  qrActive_ = true;
  try {
    await zonaScanner_.start({
      mode: "QR",
      msgEl: $id("tecZonaQrMsg"),
      onDecoded: async (code) => {
        await stopQr_();
        const inp = $id("tecZonaVin");
        if (inp) inp.value = String(code || "").trim().toUpperCase();
        sug_?.hide();
        syncConfirmBtn_();
        showZonaActual_(currentVin_());
      },
    });
  } catch {
    await stopQr_();
  }
}

// ── Ciclo de vida del panel ───────────────────────────────────────────────
export function loadTecZona_() {
  const inp = $id("tecZonaVin");
  if (inp) { inp.value = ""; inp.focus(); }
  sug_?.hide();
  setMsg_("");
  const box = $id("tecZonaActual");
  if (box) box.innerHTML = "";
  syncConfirmBtn_();
}

export function stopTecZona_() {
  stopQr_().catch(() => {});
  sug_?.hide();
}

export function initTecZona_() {
  if (inited_) return;
  inited_ = true;

  sug_ = createVinSuggest_({
    input: "tecZonaVin",
    box:   "tecZonaSuggest",
    min: 2, debounce: 220, limit: 10,
    onPick: (item) => {
      const inp = $id("tecZonaVin");
      if (inp) inp.value = item.vin;
      syncConfirmBtn_();
      showZonaActual_(item.vin);
    },
  });
  sug_.bind();

  $id("tecZonaVin")?.addEventListener("input", syncConfirmBtn_);
  $id("tecZonaVin")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.defaultPrevented) {
      e.preventDefault();
      sug_?.hide();
      showZonaActual_(currentVin_());
      elegirZona_();
    }
  });

  $id("btnTecZonaQr")?.addEventListener("click", () => { toggleQr_().catch(() => {}); });
  $id("btnTecZonaElegir")?.addEventListener("click", elegirZona_);
}
