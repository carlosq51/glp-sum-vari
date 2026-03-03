// =========================
// public/js/views/movilizador/movilizador.js
// Vista MOVILIZADOR
// - Muestra VIN + fecha de conversión
// - Solo unidades FINALIZADAS en CONVERSION
// - Excluye VIN que ya tienen registro en CALIDAD
// - Si CALIDAD falla, no rompe la vista
// =========================

import { CORE, getJSON_user, escapeHtml, fmtShort_ } from "../../core/core.js";
import { isFinalizado_ } from "../supervisor/sup-filters.js";

let movTimer = null;

function norm_(v) {
  return String(v || "").trim().toUpperCase();
}

function getVin_(it) {
  return norm_(it?.vin || it?.chasis_id || it?.chasisId || it?.VIN || it?.CHASIS_ID);
}

function parseDateSafe_(v) {
  if (!v) return NaN;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

function getConversionDateMs_(it) {
  return (
    parseDateSafe_(it?.fecha_fin) ||
    parseDateSafe_(it?.updated_at) ||
    parseDateSafe_(it?.fechaFin) ||
    parseDateSafe_(it?.fecha_inicio) ||
    parseDateSafe_(it?.created_at) ||
    parseDateSafe_(it?.fecha_creacion) ||
    NaN
  );
}

function getConversionDateLabel_(it) {
  const raw =
    it?.fecha_fin ||
    it?.updated_at ||
    it?.fechaFin ||
    it?.fecha_inicio ||
    it?.created_at ||
    it?.fecha_creacion ||
    "";

  return raw ? fmtShort_(raw) : "—";
}

async function fetchTrack_(track) {
  const url =
    `/api/supervisor/report` +
    `?name=` +
    `&vin=` +
    `&q=` +
    `&from=` +
    `&to=` +
    `&month=` +
    `&track=${encodeURIComponent(track)}`;

  const j = await getJSON_user(url, `Cargando ${track}...`);
  if (!j?.ok) throw new Error(j?.error || `No se pudo cargar ${track}`);
  return Array.isArray(j.items) ? j.items : [];
}

function buildMovilizadorList_(convItems, calidadItems = []) {
  const calidadVinSet = new Set();

  for (const it of calidadItems) {
    const vin = getVin_(it);
    if (vin) calidadVinSet.add(vin);
  }

  const byVin = new Map();

  for (const it of convItems) {
    const vin = getVin_(it);
    if (!vin) continue;
    if (!isFinalizado_(it?.estado)) continue;

    const ms = getConversionDateMs_(it);
    const prev = byVin.get(vin);

    if (!prev || ms > prev._sortMs) {
      byVin.set(vin, {
        vin,
        fechaLabel: getConversionDateLabel_(it),
        _sortMs: Number.isFinite(ms) ? ms : 0,
      });
    }
  }

  const pending = [];
  for (const row of byVin.values()) {
    if (calidadVinSet.has(row.vin)) continue;
    pending.push(row);
  }

  // Más antiguos primero = mayor prioridad
  pending.sort((a, b) => a._sortMs - b._sortMs);

  return pending;
}

function renderMovilizador_(rows, meta = {}) {
  const sum = document.getElementById("movSummary");
  const box = document.getElementById("movTable");

  if (!box) return;

  const warn = meta?.warn ? `
    <div class="small" style="margin-bottom:10px; color:#ffd166;">
      ${escapeHtml(meta.warn)}
    </div>
  ` : "";

  if (!rows.length) {
    if (sum) sum.textContent = "Pendientes para calidad: 0";
    box.innerHTML = `
      ${warn}
      <div class="small">No hay unidades pendientes por llevar a calidad.</div>
    `;
    return;
  }

  if (sum) sum.textContent = `Pendientes para calidad: ${rows.length}`;

  box.innerHTML = `
    ${warn}
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>VIN</th>
            <th>Fecha conversión</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td style="font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight:800;">
                ${escapeHtml(r.vin)}
              </td>
              <td>${escapeHtml(r.fechaLabel)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function fetchMovilizadorReport_() {
  const sum = document.getElementById("movSummary");
  const box = document.getElementById("movTable");

  try {
    if (sum) sum.textContent = "Cargando pendientes...";
    if (box) box.innerHTML = "";

    // CONVERSION es obligatoria
    const convItems = await fetchTrack_("CONVERSION");

    // CALIDAD es opcional: si falla, no tumbamos la vista
    let calidadItems = [];
    let warn = "";

    try {
      calidadItems = await fetchTrack_("CALIDAD");
    } catch (err) {
      console.warn("MOVILIZADOR: no se pudo cargar CALIDAD", err);
      warn = "No se pudo validar CALIDAD. Se muestran conversiones finalizadas sin excluir registros de calidad.";
    }

    const rows = buildMovilizadorList_(convItems, calidadItems);
    renderMovilizador_(rows, { warn });

  } catch (err) {
    if (sum) sum.textContent = err?.message || "Error cargando vista MOVILIZADOR.";
    if (box) box.innerHTML = "";
  }
}

function debounceFetchMov_() {
  clearTimeout(movTimer);
  movTimer = setTimeout(() => {
    fetchMovilizadorReport_().catch(() => {});
  }, 250);
}

export function init() {
  document.getElementById("btnMovRefresh")?.addEventListener("click", () => {
    fetchMovilizadorReport_().catch(() => {});
  });
}

export function enter() {
  CORE.state.currentModule = "MOVILIZADOR";
  fetchMovilizadorReport_().catch(() => {});
}

export function exit() {
  clearTimeout(movTimer);
}