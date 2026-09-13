// =========================
// public/js/views/ramalero/ramalero-historial.js
// «Mi producción y finalizados» del ramalero — lo que ya terminó,
// filtrable por FECHAS y por marca, con el resumen de su producción arriba.
//
// PARA QUÉ ES EL FILTRO DE FECHAS
// ───────────────────────────────
// El ramalero tiene que poder justificar lo que produjo: «esta semana
// entregué 45 Jetour». Antes veía una lista de tarjetas sin poder elegir
// días. Ahora abre en los últimos RAMALES_RANGO_DIAS días y se puede pedir
// hoy, el mes o cualquier rango.
//
// Su producción sale de DOS sitios, y el resumen los pone juntos:
//   · entregados a oficina — lo que el supervisor le repartió y él devolvió
//     y pasó (/api/ramales/mi-produccion, por día del lote). Es la misma
//     cuenta que ve el supervisor en su panel, para que no discutan dos
//     números distintos.
//   · armados en la app — los que cronometró con EMPEZAR RAMAL
//     (/api/mis-finalizadas con el mismo rango, por día de término).
//
// POR QUÉ MARCA Y FECHA SE FILTRAN EN EL CLIENTE
// ──────────────────────────────────────────────
// Las tarjetas las pinta el renderer compartido (work/work-render.js), que
// sirve a técnico, calidad y ramalero. Ese renderer marca cada tarjeta con
// `data-tipo` y `data-fin` (día de término en Perú) y aquí se esconden las
// que no tocan: el store puede traer también tarjetas de otros rangos o del
// sync, y así nunca se cuelan en la cuenta.
// =========================

import { getJSON, getEmail, escapeHtml } from "../../core/core.js";
import { cfg } from "../../core/config.js";
import { rangoPreset, fmtRango, fmtDia, diasEntre, resumen } from "../ramales/comportamiento.js";

const esc = escapeHtml;
const BOX = "finalizadosBoxR";
const $ = (id) => document.getElementById(id);

let _bound = false;
let _marca = "";          // "" = todas
let _preset = "semana";   // atajo encendido; null = fechas a mano
let _desde = "";          // "" = todavía no se abrió
let _hasta = "";
let _produccion = [];     // repartos del rango (mi-produccion)
let _cargar = null;       // trae los finalizados de un rango
let _pedido = 0;          // descarta respuestas de un rango que ya no está puesto

function enRango_(f) {
  return !_desde || (!!f && f >= _desde && f <= _hasta);
}

/** Aplica marca y fechas sobre las tarjetas ya pintadas, y rehace el resumen. */
export function aplicarFiltroHistorial_() {
  const box = $(BOX);
  if (!box) return;

  const cards = [...box.querySelectorAll("[data-tipo]")];
  const visibles = cards.filter(c => {
    const ok = (!_marca || c.dataset.tipo === _marca) && enRango_(c.dataset.fin);
    c.style.display = ok ? "" : "none";
    return ok;
  });

  const cuenta = $("ramalHistCuenta");
  if (cuenta && _desde) {
    const n = visibles.length;
    cuenta.textContent = `${n} ${n === 1 ? "ramal armado" : "ramales armados"} en la app` +
      (_marca ? ` · ${_marca}` : "");
  }

  pintarResumen_(visibles);
}

/**
 * Las cifras del rango y un renglón por día. El filtro de marca también
 * cuenta aquí: «¿cuántos Jetour entregué este mes?» es la pregunta real.
 */
function pintarResumen_(cards) {
  const el = $("ramalHistResumen");
  if (!el) return;
  if (!_desde) { el.innerHTML = ""; return; }

  const reps = _produccion.filter(r => !_marca || r.tipo_ramal === _marca);
  const s = resumen(reps);
  const enMano = reps
    .filter(r => !r.devuelto_at)
    .reduce((a, r) => a + (r.cantidad_asignada || 0) - (r.cantidad_devuelta || 0), 0);

  const dias = new Map();
  const dia = (f) => {
    if (!dias.has(f)) dias.set(f, { entregados: 0, rechazados: 0, armados: 0 });
    return dias.get(f);
  };
  for (const r of reps) {
    if (!r.devuelto_at || !r.fecha) continue;
    const d = dia(r.fecha);
    d.entregados += Math.max(0, (r.cantidad_devuelta || 0) - (r.cantidad_rechazada || 0));
    d.rechazados += r.cantidad_rechazada || 0;
  }
  for (const c of cards) if (c.dataset.fin) dia(c.dataset.fin).armados += 1;
  const filas = [...dias].sort((a, b) => b[0].localeCompare(a[0]));

  const cifra = (n, t, cls = "") => `<span class="ramProd__c ${cls}"><b>${n}</b>${t}</span>`;

  el.innerHTML = `
    <div class="ramProd">
      <div class="ramProd__titulo">
        Tu producción · ${esc(fmtRango(_desde, _hasta))}${_marca ? ` · ${esc(_marca)}` : ""}
      </div>
      <div class="ramProd__cifras">
        ${cifra(s.armados, "entregados a oficina")}
        ${cifra(cards.length, "armados en la app")}
        ${s.rechazados ? cifra(s.rechazados, "rechazados", "is-mal") : ""}
        ${enMano ? cifra(enMano, "en la mano", "is-warn") : ""}
      </div>
      ${filas.length ? `
        <div class="rmTableWrap">
          <table class="rmTable">
            <thead><tr>
              <th>Día</th><th class="num">Entregados</th>
              <th class="num">Rechazados</th><th class="num">Armados en la app</th>
            </tr></thead>
            <tbody>
              ${filas.map(([f, d]) => `
                <tr>
                  <td><b>${esc(fmtDia(f))}</b></td>
                  <td class="num">${d.entregados || "—"}</td>
                  <td class="num">${d.rechazados || "—"}</td>
                  <td class="num">${d.armados || "—"}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`
        : `<div class="rmMio__vacio">No hay producción en estas fechas.</div>`}
    </div>`;
}

/** Trae los finalizados y la producción del rango puesto, y repinta. */
async function recargar_() {
  const pedido = ++_pedido;
  const rango = { desde: _desde, hasta: _hasta };
  const email = String(getEmail() || "").trim().toLowerCase();

  const [, prod] = await Promise.all([
    Promise.resolve(_cargar?.(rango)).catch(() => {}),
    // Si el módulo de ramales no está instalado, sin producción de repartos:
    // el resto del historial tiene que seguir funcionando.
    email
      ? getJSON(`/api/ramales/mi-produccion?email=${encodeURIComponent(email)}` +
                `&desde=${_desde}&hasta=${_hasta}`).catch(() => null)
      : null,
  ]);
  if (pedido !== _pedido) return;

  _produccion = prod?.ok ? (prod.repartos || []) : [];
  aplicarFiltroHistorial_();
}

function syncFechas_() {
  const d = $("ramalHistDesde");
  const h = $("ramalHistHasta");
  if (d) d.value = _desde;
  if (h) h.value = _hasta;
  for (const b of document.querySelectorAll("#ramalHistFechas [data-hist-preset]")) {
    b.classList.toggle("is-on", b.dataset.histPreset === _preset);
  }
}

/** Un rango más largo que RAMALES_RANGO_MAX_DIAS no se pide: el servidor lo rechazaría. */
function ponerRango_(desde, hasta, preset) {
  if (!desde || !hasta) return;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const max = cfg("RAMALES_RANGO_MAX_DIAS");
  if (diasEntre(desde, hasta) > max) {
    syncFechas_();
    const cuenta = $("ramalHistCuenta");
    if (cuenta) cuenta.textContent = `Elige un rango de hasta ${max} días.`;
    return;
  }
  _desde = desde;
  _hasta = hasta;
  _preset = preset;
  syncFechas_();
  recargar_();
}

function porPreset_(preset) {
  const r = rangoPreset(preset, cfg("RAMALES_RANGO_DIAS"));
  ponerRango_(r.desde, r.hasta, preset);
}

/**
 * Engancha el desplegable, las fechas y los botones de marca.
 * @param {(rango:{desde:string,hasta:string}) => Promise<void>} cargarFinalizados
 *        trae y pinta los finalizados de ese rango
 */
export function initRamaleroHistorial_(cargarFinalizados) {
  if (_bound) return;
  _bound = true;
  _cargar = cargarFinalizados;

  const toggle = $("ramalHistToggle");
  const body   = $("ramalHistBody");
  const chev   = $("ramalHistChev");

  toggle?.addEventListener("click", () => {
    if (!body) return;
    const abrir = body.style.display === "none";
    body.style.display = abrir ? "block" : "none";
    if (chev) chev.textContent = abrir ? "▲" : "▼";
    // Se carga al abrir, no al entrar a la vista: la mayoría de los días
    // el ramalero no lo mira, y son consultas que no hacen falta.
    if (!abrir) return;
    const semana = document.querySelector('#ramalHistFechas [data-hist-preset="semana"]');
    if (semana) semana.textContent = `Últimos ${cfg("RAMALES_RANGO_DIAS")} días`;
    if (_desde) recargar_();
    else porPreset_(_preset || "semana");
  });

  const fechas = $("ramalHistFechas");
  fechas?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hist-preset]");
    if (b) porPreset_(b.dataset.histPreset);
  });
  fechas?.addEventListener("change", (e) => {
    if (e.target.type !== "date") return;
    ponerRango_($("ramalHistDesde")?.value, $("ramalHistHasta")?.value, null);
  });

  $("ramalHistFiltro")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-marca]");
    if (!b) return;
    _marca = b.dataset.marca || "";
    for (const otro of document.querySelectorAll("#ramalHistFiltro [data-marca]")) {
      otro.classList.toggle("is-on", otro === b);
    }
    aplicarFiltroHistorial_();
  });
}

/** Al salir del módulo: ni el filtro ni el rango sobreviven a la siguiente sesión. */
export function resetHistorial_() {
  _marca = "";
  _preset = "semana";
  _desde = "";
  _hasta = "";
  _produccion = [];
  _pedido++;
  const body = $("ramalHistBody");
  if (body) body.style.display = "none";
  const chev = $("ramalHistChev");
  if (chev) chev.textContent = "▼";
  for (const b of document.querySelectorAll("#ramalHistFiltro [data-marca]")) {
    b.classList.toggle("is-on", !b.dataset.marca);
  }
  syncFechas_();
  const resumenEl = $("ramalHistResumen");
  if (resumenEl) resumenEl.innerHTML = "";
  const cuenta = $("ramalHistCuenta");
  if (cuenta) cuenta.textContent = "";
}
