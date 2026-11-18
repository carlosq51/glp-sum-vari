// =========================
// public/js/views/admin/calibraciones.js
// Admin → Calibraciones: cuánto tarda una calibración STAG, en qué se va el
// tiempo y cuánto pasa la laptop parada entre carros.
//
// Los datos los manda la laptop (stag-auto/glp_puente.py) al terminar cada
// calibración, más su historial (ejecuciones.jsonl) la primera vez. Los
// números se calculan en lib/calibracion-stats.js; esto solo los pinta.
// =========================

import { getEmail } from "../../core/auth.js";
import { escapeHtml } from "../../core/format.js";
import { BOLSAS, calcularStats_, fmtSeg_, mapaCorto_, diaPe_, esCompleta_, duracion_ } from "../../../../lib/calibracion-stats.js";

const RANGOS = [
  { k: "hoy", label: "Hoy", dias: 1 },
  { k: "7",   label: "7 días", dias: 7 },
  { k: "30",  label: "30 días", dias: 30 },
  { k: "todo", label: "Todo", dias: null },
];
const ESTADO_TXT = { TERMINADA: "Terminada", DETENIDA: "Detenida", ERROR: "Error", CANCELADA: "Cancelada" };
const ORIGEN_TXT = { null: "App", laptop: "Laptop", historial: "Laptop (historial)" };
// Técnico en ámbar (es lo que más se puede bajar); el resto en tonos que no se confunden entre sí.
const BOLSA_COLOR = ["var(--dv-3)", "var(--dv-1)", "var(--dv-5)", "var(--dv-2)"];

let rango_ = "7";
let datos_ = null;
let seq_ = 0;

const diaHoy_ = () => diaPe_(new Date().toISOString());
function diaMenos_(n) {
  return diaPe_(new Date(Date.now() - n * 86400_000).toISOString());
}

const hora_ = (iso) => iso ? new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "";
const fechaCorta_ = (dia) => { const [, m, d] = String(dia).split("-"); return d && m ? `${d}/${m}` : dia; };
const pct_ = (x) => x == null ? "—" : `${Math.round(x * 100)}%`;

function tile_(label, valor, foot = "", extra = "") {
  return `<div class="statTile ${extra}">
    <div class="statTile__label">${label}</div>
    <div class="statTile__value">${valor}</div>
    ${foot ? `<div class="statTile__foot">${foot}</div>` : ""}
  </div>`;
}

function laptop_(a) {
  if (!a) return "";
  const tono = a.enLinea ? "ok" : "muted";
  const txt = a.enLinea ? "Laptop en línea" : a.vistoHaceS != null ? `Laptop sin señal hace ${fmtSeg_(a.vistoHaceS)}` : "Laptop sin señal";
  const ver = a.commit ? ` · versión <code>${escapeHtml(a.commit)}</code>` : a.enLinea ? " · versión anterior (sin vigilante)" : "";
  return `<span class="calStLaptop" data-tono="${tono}"><i></i>${txt}${ver}</span>`;
}

function bolsas_(s) {
  const total = s.bolsas.reduce((a, b) => a + (b.prom || 0), 0);
  if (!s.conBolsas || !total) return `<div class="small muted">Todavía no hay calibraciones completas con el detalle de tiempos.</div>`;
  const segs = s.bolsas.map((b, i) =>
    `<div class="meter__seg" style="width:${(b.prom / total) * 100}%;background:${BOLSA_COLOR[i]}" title="${escapeHtml(b.label)}"></div>`).join("");
  const leyenda = s.bolsas.map((b, i) => `
    <div class="calStBolsa">
      <span class="meter__dot" style="background:${BOLSA_COLOR[i]}"></span>
      <div><b>${escapeHtml(b.label)}</b><small>${escapeHtml(b.det)}</small></div>
      <span class="calStBolsaNum">${fmtSeg_(b.prom)}<small>${Math.round((b.prom / total) * 100)}%</small></span>
    </div>`).join("");
  return `<div class="meter"><div class="meter__track">${segs}</div></div><div class="calStBolsas">${leyenda}</div>`;
}

function pasos_(s) {
  if (!s.pasos.length) return `<div class="small muted">Sin datos por paso todavía.</div>`;
  const max = Math.max(...s.pasos.map(p => p.prom || 0)) || 1;
  // Lo que más se aleja de su mejor marca es donde hay tiempo por ganar.
  const margen = [...s.pasos].map(p => p.prom - p.mejor).sort((a, b) => b - a)[2] ?? Infinity;
  return `<table class="dataTable calStTabla">
    <thead><tr><th>Paso</th><th class="num">Promedio</th><th class="num">Mejor</th><th class="num">Se pierde</th></tr></thead>
    <tbody>${s.pasos.map(p => {
      const pierde = p.prom - p.mejor;
      const alto = pierde >= margen && pierde >= 10;
      return `<tr${alto ? ` class="is-alto"` : ""}>
        <td><div class="calStPaso">${escapeHtml(p.paso)}</div><div class="rankBar"><div class="rankBar__fill" style="width:${(p.prom / max) * 100}%"></div></div></td>
        <td class="num">${fmtSeg_(p.prom)}</td><td class="num muted">${fmtSeg_(p.mejor)}</td>
        <td class="num">${pierde >= 1 ? `+${fmtSeg_(pierde)}` : "—"}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function dias_(s) {
  if (!s.porDia.length) return "";
  return `<table class="dataTable calStTabla">
    <thead><tr><th>Día</th><th class="num">Carros</th><th class="num">Promedio</th><th class="num">Parada</th><th class="num">Ocupada</th></tr></thead>
    <tbody>${[...s.porDia].reverse().map(d => `<tr>
      <td>${fechaCorta_(d.dia)} <span class="muted small">${hora_(d.primera)}–${hora_(d.ultima)}</span></td>
      <td class="num">${d.completas}${d.n > d.completas ? `<span class="muted small"> /${d.n}</span>` : ""}</td>
      <td class="num">${fmtSeg_(d.prom)}</td>
      <td class="num">${d.huecos ? fmtSeg_(d.parada_s) : "—"}</td>
      <td class="num">${pct_(d.uso)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function mapas_(s) {
  if (!s.mapas.length) return "";
  return `<table class="dataTable calStTabla">
    <thead><tr><th>Mapa</th><th class="num">Carros</th><th class="num">Promedio</th><th class="num">Mejor</th></tr></thead>
    <tbody>${s.mapas.map(m => `<tr>
      <td class="calStMapa">${escapeHtml(m.mapa.replace(/\.set$/i, ""))}</td>
      <td class="num">${m.n}</td><td class="num">${fmtSeg_(m.prom)}</td><td class="num muted">${fmtSeg_(m.mejor)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function lista_(filas) {
  const ult = [...filas].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 150);
  if (!ult.length) return "";
  return `<table class="dataTable calStTabla calStLista">
    <thead><tr><th>Cuándo</th><th>Carro</th><th class="num">Total</th><th class="num">Técnico</th><th>Estado</th></tr></thead>
    <tbody>${ult.map(f => {
      const d = duracion_(f);
      const motivo = f.error ? ` title="${escapeHtml(f.error)}"` : "";
      return `<tr>
        <td>${fechaCorta_(diaPe_(f.iniciada_at || f.created_at))} <span class="muted small">${hora_(f.iniciada_at || f.created_at)}</span></td>
        <td><b class="calStVin">${escapeHtml(String(f.vin || "").slice(-8))}</b><div class="muted small">${escapeHtml(mapaCorto_(f.mapa).replace(/\.set$/i, ""))}</div></td>
        <td class="num">${d != null ? fmtSeg_(d) : "—"}${esCompleta_(f) || f.estado !== "TERMINADA" ? "" : `<div class="muted small">retomada</div>`}</td>
        <td class="num">${f.esperas ? fmtSeg_(f.esperas.operario) : "—"}</td>
        <td><span class="calStEstado" data-estado="${escapeHtml(f.estado)}"${motivo}>${ESTADO_TXT[f.estado] || escapeHtml(f.estado)}</span>
          <div class="muted small">${ORIGEN_TXT[f.origen ?? null] || ""}</div></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function pintar_(host) {
  const d = datos_;
  const s = calcularStats_(d.filas);
  const ocup = (() => {
    const cal = s.porDia.reduce((a, x) => a + x.calibrando_s, 0), par = s.porDia.reduce((a, x) => a + x.parada_s, 0);
    return cal + par > 0 ? cal / (cal + par) : null;
  })();
  const fallidas = (s.porEstado.DETENIDA || 0) + (s.porEstado.ERROR || 0);

  host.querySelector(".calStCuerpo").innerHTML = !d.filas.length
    ? `<div class="calStVacio">No hay calibraciones en este rango.<br><span class="small muted">Las calibraciones aparecen aquí cuando la laptop las manda, al terminar cada una. El historial anterior se sube solo la primera vez que la laptop se conecta con la versión nueva.</span></div>`
    : `
    <div class="dashGrid calStKpis">
      ${tile_("Tiempo promedio", fmtSeg_(s.promedio), s.completas ? `mediana ${fmtSeg_(s.mediana)} · mejor ${fmtSeg_(s.mejor)}` : "sin calibraciones completas", "statTile--accent")}
      ${tile_("Calibraciones", `${s.completas}<span class="unit"> completas</span>`, fallidas ? `${s.porEstado.DETENIDA || 0} detenidas · ${s.porEstado.ERROR || 0} con error` : "ninguna detenida ni con error")}
      ${tile_("Tiempo muerto entre carros", fmtSeg_(s.muerto.prom), s.muerto.n ? `promedio por hueco · total ${fmtSeg_(s.muerto.total)} en ${s.muerto.n}` : "sin carros seguidos")}
      ${tile_("Laptop ocupada", pct_(ocup), `del tiempo con carros (sin pausas de más de ${s.muerto.pausaLargaMin} min)`)}
      ${tile_("Del pedido al arranque", fmtSeg_(s.esperaInicio.prom), s.esperaInicio.n ? `pedidas desde el celular (${s.esperaInicio.n})` : "solo cuenta lo pedido desde la app")}
    </div>

    <section class="calStSec">
      <h4>En qué se va el tiempo <span class="muted small">promedio por calibración completa</span></h4>
      ${bolsas_(s)}
    </section>

    <div class="calStDos">
      <section class="calStSec">
        <h4>Por paso <span class="muted small">en rojo, donde más se pierde contra la mejor marca</span></h4>
        ${pasos_(s)}
      </section>
      <section class="calStSec">
        <h4>Por día</h4>
        ${dias_(s)}
        <p class="small muted calStNota">"Parada" suma los huecos entre carros seguidos de hasta ${s.muerto.pausaLargaMin} min.
          ${s.muerto.pausas ? `Hubo además ${s.muerto.pausas} pausa${s.muerto.pausas > 1 ? "s" : ""} más larga${s.muerto.pausas > 1 ? "s" : ""} (${fmtSeg_(s.muerto.pausasS)}), que no se cuentan: almuerzo o no había carros.` : ""}</p>
        <h4 style="margin-top:16px">Por mapa</h4>
        ${mapas_(s)}
      </section>
    </div>

    <section class="calStSec">
      <h4>Calibraciones <span class="muted small">las últimas ${Math.min(150, d.filas.length)}</span></h4>
      <div class="calStScroll">${lista_(d.filas)}</div>
    </section>
    ${d.limite ? `<p class="small muted">Se muestran las primeras 5000 del rango.</p>` : ""}`;
}

async function cargar_(host) {
  const r = RANGOS.find(x => x.k === rango_) || RANGOS[1];
  const hasta = diaHoy_();
  const desde = r.dias ? diaMenos_(r.dias - 1) : "2020-01-01";
  const mio = ++seq_;
  host.querySelector(".calStCuerpo").innerHTML = `<div class="small muted" style="padding:16px">Cargando…</div>`;
  try {
    const res = await fetch(`/api/calibracion/estadisticas?desde=${desde}&hasta=${hasta}`, { headers: { "x-user-email": getEmail() || "" } });
    const j = await res.json();
    if (mio !== seq_) return;
    if (!j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    datos_ = j;
    host.querySelector(".calStLaptopSlot").innerHTML = laptop_(j.agente);
    pintar_(host);
  } catch (e) {
    if (mio !== seq_) return;
    host.querySelector(".calStCuerpo").innerHTML = `<div class="small" style="color:var(--danger);padding:16px">No se pudo cargar: ${escapeHtml(e.message || e)}</div>`;
  }
}

/** Todo el rango en un CSV que Excel abre bien (punto y coma, BOM, coma decimal). */
function descargarCsv_() {
  if (!datos_?.filas?.length) return;
  const cab = ["inicio", "fin", "vin", "modelo", "mapa", "estado", "origen", "completa", "total_s",
    ...BOLSAS.map(b => `${b.k}_s`), "fotos", "presion_final", "error"];
  const cel = (v) => {
    const t = v == null ? "" : typeof v === "number" ? String(Math.round(v * 10) / 10).replace(".", ",") : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const fecha = (iso) => iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "";
  const filas = datos_.filas.map(f => [
    fecha(f.iniciada_at || f.created_at), fecha(f.terminada_at), f.vin, f.modelo, mapaCorto_(f.mapa), f.estado,
    ORIGEN_TXT[f.origen ?? null] || f.origen, esCompleta_(f) ? "sí" : "no", duracion_(f),
    ...BOLSAS.map(b => f.esperas ? Number(f.esperas[b.k]) || 0 : null), f.fotos, f.presion, f.error,
  ].map(cel).join(";"));
  const blob = new Blob(["﻿" + [cab.join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `calibraciones_${datos_.desde}_${datos_.hasta}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function renderCalibracionesTab(wrap) {
  wrap.innerHTML = `
    <div class="calSt">
      <div class="calStBarra">
        <div class="calStRangos" role="tablist">
          ${RANGOS.map(r => `<button type="button" class="calStRango${r.k === rango_ ? " is-on" : ""}" data-rango="${r.k}">${r.label}</button>`).join("")}
        </div>
        <div class="calStLaptopSlot"></div>
        <button type="button" class="adminBtnGhost calStCsv">⬇ Excel</button>
      </div>
      <div class="calStCuerpo"></div>
    </div>`;
  const host = wrap.querySelector(".calSt");
  host.querySelector(".calStRangos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rango]");
    if (!b || b.dataset.rango === rango_) return;
    rango_ = b.dataset.rango;
    host.querySelectorAll(".calStRango").forEach(x => x.classList.toggle("is-on", x === b));
    cargar_(host);
  });
  host.querySelector(".calStCsv").addEventListener("click", descargarCsv_);
  await cargar_(host);
}
