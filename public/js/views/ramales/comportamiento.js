// =========================
// public/js/views/ramales/comportamiento.js
// MÉTRICAS DE LOS RAMALEROS — la lista con el tiempo promedio de cada uno
// y el detalle que se abre al tocar un nombre.
//
// QUÉ ES «TIEMPO PROMEDIO»
// ────────────────────────
// Minutos por ramal: de que el supervisor le repartió a que devolvió,
// dividido entre los ramales que devolvió. Se mide por ramal y no por
// reparto porque a uno le tocan 20 y a otro 2 — comparar horas crudas
// premiaría al que recibe menos.
//
// Es tiempo de reloj, no de mesa: un reparto que pasa la noche sin
// devolverse suma la noche. Por eso el detalle muestra cada reparto con
// su duración, para que un número raro se explique mirando su fila.
//
// La cuenta es la misma que hace `v_ramal_desempeno` (promedio de los
// minutos por ramal de cada reparto cerrado), así que la cifra de la
// lista y la del detalle coinciden.
//
// Va siempre al lado del % de rechazo: medir solo velocidad consigue
// velocidad, y peores ramales.
// =========================

import { escapeHtml } from "../../core/core.js";

const esc = escapeHtml;

// Slot categórico del sistema (00-token.css): pasa CVD en día y noche,
// cosa que el trío verde/ámbar/rojo de estado no hace.
const C1 = "var(--dv-1)";

// ─── Formatos (los usa también ramales.js y mi-turno.js) ─────────────

function num_(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * «sáb 13 sep». Una fecha sin hora ("2026-09-13") se arma en hora local:
 * `new Date("2026-09-13")` la toma como medianoche UTC y en Lima sale el 12.
 */
export function fmtDia(f, conSemana = true) {
  if (!f) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(f);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", conSemana
    ? { weekday: "short", day: "numeric", month: "short" }
    : { day: "numeric", month: "short" });
}

/** Una duración en minutos: «45 min», «6h 10m». */
export function fmtDuracion(min) {
  if (min == null || !Number.isFinite(Number(min))) return "—";
  const n = Math.max(0, Number(min));
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Minutos por ramal: con un decimal si es poco, porque 4 y 4.8 no son lo mismo. */
export function fmtMinRamal(min) {
  if (min == null || !Number.isFinite(Number(min))) return "—";
  const n = Number(min);
  if (n < 10) return `${n.toFixed(1)} min`;
  return fmtDuracion(n);
}

function fmtPct_(v) {
  const n = num_(v);
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

/** Minutos que tardó un reparto, o null si sigue abierto. */
function duracionMin_(r) {
  if (!r.devuelto_at || !r.asignado_at) return null;
  return (new Date(r.devuelto_at) - new Date(r.asignado_at)) / 60000;
}

/** Minutos por ramal de un reparto cerrado; null si no hay qué dividir. */
function minPorRamal_(r) {
  const d = duracionMin_(r);
  return d != null && r.cantidad_devuelta > 0 ? d / r.cantidad_devuelta : null;
}

function promedio_(arr) {
  return arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null;
}

// ─── Lo que tiene cada uno en la mano ahora ──────────────────────────

/** user_id → ramales repartidos y todavía sin devolver. */
export function trabajandoPorUser(repartos) {
  const m = new Map();
  for (const r of repartos || []) {
    if (r.devuelto_at) continue;
    const n = (r.cantidad_asignada || 0) - (r.cantidad_devuelta || 0);
    if (n > 0) m.set(r.user_id, (m.get(r.user_id) || 0) + n);
  }
  return m;
}

/**
 * Tiempo promedio del grupo, pesado por lo que devolvió cada uno: el que
 * armó 200 pesa más que el que armó 2, que es lo que se espera de un
 * «promedio del taller».
 */
export function tiempoPromedioGrupo(desempeno) {
  let suma = 0, peso = 0;
  for (const d of desempeno || []) {
    if (d.armado_min_por_ramal == null) continue;
    const w = num_(d.ramales_devueltos);
    if (w <= 0) continue;
    suma += num_(d.armado_min_por_ramal) * w;
    peso += w;
  }
  return peso ? suma / peso : null;
}

// ─── Lista de ramaleros ──────────────────────────────────────────────

/**
 * Una fila por ramalero, tocable. El número grande es su tiempo promedio;
 * la barra lo pone contra el más lento del grupo para que la comparación
 * se lea sin hacer cuentas. Al lado, el rechazo.
 *
 * @param {object} raw respuesta de /api/ramales/panel
 */
export function ramalerosHTML(raw) {
  const filas = raw?.desempeno || [];
  if (!filas.length) {
    return `<div class="rmEmpty">
      <span class="rmEmpty__icon">👷</span>
      <strong>No hay ramaleros</strong>
      Dale el módulo RAMALERO a alguien y aparecerá aquí.
    </div>`;
  }

  const trab = trabajandoPorUser(raw?.repartos);
  const tiempos = filas.map(f => f.armado_min_por_ramal).filter(v => v != null).map(Number);
  const max = Math.max(1, ...tiempos);

  // Primero los que ya tienen tiempo medido, por lo que han armado; los
  // que todavía no devolvieron nada van al final, por nombre.
  const orden = [...filas].sort((a, b) => {
    const ta = a.armado_min_por_ramal != null, tb = b.armado_min_por_ramal != null;
    if (ta !== tb) return ta ? -1 : 1;
    return num_(b.ramales_devueltos) - num_(a.ramales_devueltos)
      || String(a.nombre).localeCompare(String(b.nombre));
  });

  return `
    <div class="rmGente">
      ${orden.map(d => {
        const t = d.armado_min_por_ramal;
        const enMano = trab.get(d.user_id) || 0;
        const rech = num_(d.pct_rechazo);
        const sub = [
          `${num_(d.ramales_devueltos)} armados`,
          enMano ? `${enMano} trabajando` : "",
        ].filter(Boolean).join(" · ");

        return `
          <button type="button" class="rmGente__row" data-rm="ramalero" data-id="${esc(d.user_id)}">
            <span class="rmInicial rmInicial--sm">${esc(String(d.nombre || "?").trim().charAt(0).toUpperCase())}</span>
            <span class="rmGente__quien">
              <b>${esc(d.nombre)}</b>
              <small>${esc(sub)}</small>
            </span>
            <span class="rmGente__tiempo">
              <b>${t == null ? "—" : fmtMinRamal(t)}</b>
              <small>${t == null ? "sin devoluciones" : "por ramal"}</small>
              <span class="rmGente__bar" aria-hidden="true">${
                t == null ? "" : `<i style="width:${(num_(t) / max) * 100}%;background:${C1}"></i>`}</span>
            </span>
            <span class="rmGente__rech ${rech >= 10 ? "is-alto" : ""}">
              ${fmtPct_(rech)}<small>rechazo</small>
            </span>
            <span class="rmGente__ir" aria-hidden="true">›</span>
          </button>`;
      }).join("")}
    </div>`;
}

// ─── Detalle de un ramalero ──────────────────────────────────────────

function tile_(label, valor, estilo = "") {
  return `
    <div class="statTile">
      <div class="statTile__label">${label}</div>
      <div class="statTile__value" style="${estilo}">${valor}</div>
    </div>`;
}

/**
 * El detalle que se abre al tocar un nombre: cuatro cifras, el tiempo
 * por marca (un Jetour y un VW no se arman igual, y mezclarlos esconde
 * eso) y cada reparto con lo que tardó.
 *
 * @param {object} j respuesta de /api/ramales/ramalero/:id
 */
export function detalleRamaleroHTML(j) {
  const reps = j?.repartos || [];
  if (!reps.length) {
    return `<div class="rmEmpty">
      <span class="rmEmpty__icon">📭</span>
      <strong>Todavía no se le ha repartido nada</strong>
      Su tiempo aparece cuando devuelva su primer reparto.
    </div>`;
  }

  const cerrados = reps.filter(r => r.devuelto_at);
  const conTiempo = cerrados.map(minPorRamal_).filter(v => v != null);
  const prom = promedio_(conTiempo);
  const armados = cerrados.reduce((a, r) => a + (r.cantidad_devuelta || 0), 0);
  const rechazados = cerrados.reduce((a, r) => a + (r.cantidad_rechazada || 0), 0);
  const pctRech = armados ? (100 * rechazados) / armados : 0;
  const enMano = reps
    .filter(r => !r.devuelto_at)
    .reduce((a, r) => a + (r.cantidad_asignada || 0) - (r.cantidad_devuelta || 0), 0);

  // Por marca, con la misma cuenta que el promedio general.
  const porMarca = new Map();
  for (const r of cerrados) {
    const k = r.tipo_ramal || "Sin marca";
    const g = porMarca.get(k) || { armados: 0, tiempos: [], repartos: 0 };
    g.armados += r.cantidad_devuelta || 0;
    g.repartos += 1;
    const t = minPorRamal_(r);
    if (t != null) g.tiempos.push(t);
    porMarca.set(k, g);
  }
  const marcas = [...porMarca].sort((a, b) => b[1].armados - a[1].armados);

  const maxT = Math.max(1, ...conTiempo);
  const ahora = Date.now();

  return `
    <div class="dashGrid">
      ${tile_("⏱ Tiempo promedio", prom == null ? "—" : fmtMinRamal(prom))}
      ${tile_("🔩 Armados", armados)}
      ${tile_("🛠 Trabajando ahora", enMano, enMano > 0 ? "color:var(--warn)" : "")}
      ${tile_("↩️ Rechazo", fmtPct_(Math.round(pctRech * 10) / 10),
              pctRech >= 10 ? "color:var(--bad,#ef4444)" : "")}
    </div>

    ${marcas.length ? `
      <div class="rmField">
        <label>Por marca</label>
        <div class="rmTableWrap">
          <table class="rmTable">
            <thead><tr>
              <th>Marca</th><th class="num">Repartos</th>
              <th class="num">Armados</th><th class="num">Tiempo por ramal</th>
            </tr></thead>
            <tbody>
              ${marcas.map(([k, g]) => `
                <tr>
                  <td><b>${esc(k)}</b></td>
                  <td class="num">${g.repartos}</td>
                  <td class="num">${g.armados}</td>
                  <td class="num">${fmtMinRamal(promedio_(g.tiempos))}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}

    <div class="rmField">
      <label>Cada reparto</label>
      <div class="rmTableWrap">
        <table class="rmTable rmHist">
          <thead><tr>
            <th>Día</th><th>Marca</th><th class="num">Le dieron</th>
            <th class="num">Devolvió</th><th class="num">Tardó</th><th>Por ramal</th>
          </tr></thead>
          <tbody>
            ${reps.map(r => {
              const abierto = !r.devuelto_at;
              const t = minPorRamal_(r);
              const dur = abierto
                ? (ahora - new Date(r.asignado_at)) / 60000
                : duracionMin_(r);
              return `
                <tr class="${abierto ? "is-abierto" : ""}">
                  <td>${esc(fmtDia(r.fecha || r.asignado_at))}</td>
                  <td>${esc(r.tipo_ramal || "Sin marca")}</td>
                  <td class="num">${r.cantidad_asignada}</td>
                  <td class="num">${abierto ? "—" : `${r.cantidad_devuelta}${
                    r.cantidad_rechazada ? ` <span class="rmRechazo is-alto">(${r.cantidad_rechazada} ✕)</span>` : ""}`}</td>
                  <td class="num">${abierto
                    ? `<span class="rmChip warn">lleva ${esc(fmtDuracion(dur))}</span>`
                    : esc(fmtDuracion(dur))}</td>
                  <td class="rmHist__t">${t == null ? "" : `
                    <span class="rmHist__bar"><i style="width:${(t / maxT) * 100}%;background:${C1}"></i></span>
                    <span class="rmHist__v">${esc(fmtMinRamal(t))}</span>`}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <span class="rmField__hint">
        El tiempo corre de que se le reparte a que devuelve, y es de reloj:
        si un reparto pasó la noche, la noche cuenta. Por ramal es ese tiempo
        dividido entre lo que devolvió.
      </span>
    </div>`;
}
