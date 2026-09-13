// =========================
// public/js/views/ramales/comportamiento.js
// MÉTRICAS DE LOS RAMALEROS — producción por persona y por día dentro de
// un rango de fechas, y el detalle que se abre al tocar un nombre.
//
// LAS TRES CIFRAS QUE SE MIRAN
// ────────────────────────────
//   · ARMADOS  lo que devolvió a oficina y pasó (devueltos − rechazados).
//              Es la producción: lo que entró al stock.
//   · TIEMPO   minutos por ramal: el tiempo de reloj de sus repartos
//              cerrados (de que se le repartió a que devolvió) entre lo
//              que devolvió. Por ramal y no por reparto porque a uno le
//              tocan 20 y a otro 2 — comparar horas crudas premiaría al que
//              recibe menos.
//   · RECHAZO  % de lo devuelto que no pasó. Va siempre al lado del tiempo:
//              medir solo velocidad consigue velocidad, y peores ramales.
//
// El tiempo es TOTAL ENTRE TOTAL (Σ minutos / Σ devueltos), en la lista, en
// el detalle y en el promedio del taller: así el que armó 200 pesa más que
// el que armó 2, y las tres cifras cuadran entre sí.
//
// Todo cuenta por el DÍA DEL LOTE, el que anotó el supervisor, que es como
// se habla en el taller: «lo del 13». Un reparto del 13 devuelto el 14 es
// producción del 13.
//
// Es tiempo de reloj, no de mesa: un reparto que pasa la noche suma la
// noche. Por eso el detalle muestra cada reparto con su duración, para que
// un número raro se explique mirando su fila.
// =========================

import { escapeHtml } from "../../core/core.js";

const esc = escapeHtml;

// Slot categórico del sistema (00-token.css): pasa CVD en día y noche,
// cosa que el trío verde/ámbar/rojo de estado no hace.
const C1 = "var(--dv-1)";

// ─── Formatos (los usa también ramales.js, mi-turno.js y el historial) ──

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
  const n = Math.round(num_(v) * 10) / 10;
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

/** Primer nombre — en la cabecera de una tabla «Juan Carlos» no cabe. */
export function corto(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "—";
}

// ─── Fechas del filtro ───────────────────────────────────────────────

/** "YYYY-MM-DD" de una fecha local. El taller y sus celulares están en Lima. */
function iso_(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoy, como lo quiere un <input type="date">. */
export function hoyISO() {
  return iso_(new Date());
}

/** Días entre dos fechas "YYYY-MM-DD", contando las dos. */
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
}

/**
 * Los atajos del filtro. `semana` son los últimos `dias` contando hoy (el
 * número viene de RAMALES_RANGO_DIAS); `mes` arranca el día 1.
 */
export function rangoPreset(preset, dias) {
  const hoy = new Date();
  if (preset === "hoy") return { desde: iso_(hoy), hasta: iso_(hoy) };
  if (preset === "mes") return { desde: iso_(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso_(hoy) };
  const ini = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (Math.max(1, dias) - 1));
  return { desde: iso_(ini), hasta: iso_(hoy) };
}

/** «hoy», «sáb 13 sep» o «7 sep – 13 sep». */
export function fmtRango(desde, hasta) {
  if (desde === hasta) return desde === hoyISO() ? "hoy" : fmtDia(desde);
  return `${fmtDia(desde, false)} – ${fmtDia(hasta, false)}`;
}

// ─── Cuentas ─────────────────────────────────────────────────────────

/** Minutos que tardó un reparto, o null si sigue abierto. */
function duracionMin_(r) {
  if (!r.devuelto_at || !r.asignado_at) return null;
  return (new Date(r.devuelto_at) - new Date(r.asignado_at)) / 60000;
}

/** Lo que pasó de un reparto cerrado. */
function buenos_(r) {
  return r.devuelto_at ? Math.max(0, (r.cantidad_devuelta || 0) - (r.cantidad_rechazada || 0)) : 0;
}

/** Minutos por ramal de un conjunto de repartos: su tiempo total entre lo que devolvieron. */
export function minPorRamal(repartos) {
  let min = 0, n = 0;
  for (const r of repartos || []) {
    const d = duracionMin_(r);
    if (d == null || !(r.cantidad_devuelta > 0)) continue;
    min += d;
    n += r.cantidad_devuelta;
  }
  return n ? min / n : null;
}

/**
 * Las cifras de un conjunto de repartos (de una persona, de un día, del
 * taller entero): armados, devueltos, rechazados, días con producción y
 * tiempo por ramal.
 */
export function resumen(repartos) {
  const out = { armados: 0, devueltos: 0, rechazados: 0, dias: new Set() };
  for (const r of repartos || []) {
    if (!r.devuelto_at) continue;
    out.devueltos += r.cantidad_devuelta || 0;
    out.rechazados += r.cantidad_rechazada || 0;
    out.armados += buenos_(r);
    if (r.fecha) out.dias.add(r.fecha);
  }
  out.tiempo = minPorRamal(repartos);
  out.pctRechazo = out.devueltos ? (100 * out.rechazados) / out.devueltos : 0;
  return out;
}

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

function porUser_(repartos) {
  const m = new Map();
  for (const r of repartos || []) {
    const arr = m.get(r.user_id) || [];
    arr.push(r);
    m.set(r.user_id, arr);
  }
  return m;
}

// ─── Producción por ramalero ─────────────────────────────────────────

/**
 * Una fila por ramalero, tocable, ordenada por lo que armó en el rango. El
 * número grande es su producción, con una barra contra el que más armó
 * para que la comparación se lea sin cuentas; al lado su tiempo y su
 * rechazo.
 *
 * @param {object}   o
 * @param {object[]} o.ramaleros  [{ user_id, nombre }] ya filtrados por nombre
 * @param {object[]} o.repartos   los del rango
 * @param {Map}      o.enMano     user_id → ramales en la mano ahora
 * @param {boolean}  o.filtrado   hay un filtro de nombre puesto
 */
export function ramalerosHTML({ ramaleros, repartos, enMano, filtrado }) {
  if (!ramaleros.length) {
    return filtrado
      ? `<div class="rmEmpty"><span class="rmEmpty__icon">🔎</span>Ningún ramalero coincide con ese nombre.</div>`
      : `<div class="rmEmpty">
           <span class="rmEmpty__icon">👷</span>
           <strong>No hay ramaleros</strong>
           Dale el módulo RAMALERO a alguien y aparecerá aquí.
         </div>`;
  }

  const reps = porUser_(repartos);
  const filas = ramaleros.map(p => ({
    p,
    s: resumen(reps.get(p.user_id)),
    mano: enMano.get(p.user_id) || 0,
  }));
  const max = Math.max(1, ...filas.map(f => f.s.armados));
  filas.sort((a, b) => b.s.armados - a.s.armados
    || b.mano - a.mano
    || String(a.p.nombre).localeCompare(String(b.p.nombre)));

  return `
    <div class="rmGente">
      ${filas.map(({ p, s, mano }) => {
        const sub = [
          s.dias.size ? `${s.dias.size} ${s.dias.size === 1 ? "día" : "días"}` : "sin devoluciones",
          mano ? `${mano} en la mano` : "",
        ].filter(Boolean).join(" · ");

        return `
          <button type="button" class="rmGente__row" data-rm="ramalero" data-id="${esc(p.user_id)}">
            <span class="rmInicial rmInicial--sm">${esc(String(p.nombre || "?").trim().charAt(0).toUpperCase())}</span>
            <span class="rmGente__quien">
              <b>${esc(p.nombre)}</b>
              <small>${esc(sub)}</small>
            </span>
            <span class="rmGente__prod">
              <b>${s.armados}</b><small>armados</small>
              <span class="rmGente__bar" aria-hidden="true"><i style="width:${(s.armados / max) * 100}%;background:${C1}"></i></span>
            </span>
            <span class="rmGente__tiempo">
              <b>${fmtMinRamal(s.tiempo)}</b>
              <small>por ramal</small>
            </span>
            <span class="rmGente__rech ${s.pctRechazo >= 10 ? "is-alto" : ""}">
              ${s.devueltos ? fmtPct_(s.pctRechazo) : "—"}<small>rechazo</small>
            </span>
            <span class="rmGente__ir" aria-hidden="true">›</span>
          </button>`;
      }).join("")}
    </div>`;
}

// ─── Producción por día ──────────────────────────────────────────────

/**
 * Días en filas, ramaleros en columnas, armados en cada celda. Es la tabla
 * con que se contesta «¿cuánto sacó Andy el martes?» sin abrir a nadie. Lo
 * que ese día se repartió y todavía no vuelve va al lado en pequeño, para
 * que un cero no parezca un día sin trabajo.
 */
export function produccionDiariaHTML({ ramaleros, repartos }) {
  const ids = new Set(ramaleros.map(r => r.user_id));
  const reps = (repartos || []).filter(r => ids.has(r.user_id) && r.fecha);
  if (!reps.length) {
    return `<div class="rmEmpty"><span class="rmEmpty__icon">📅</span>No se repartió nada en estas fechas.</div>`;
  }

  // Solo las columnas de quien tuvo algo en el rango: una columna de ceros
  // ocupa sitio y no dice nada.
  const conAlgo = new Set(reps.map(r => r.user_id));
  const gente = ramaleros.filter(r => conAlgo.has(r.user_id));
  const dias = [...new Set(reps.map(r => r.fecha))].sort().reverse();

  const celda = new Map();   // "fecha|uid" → { armados, abiertos }
  for (const r of reps) {
    const k = `${r.fecha}|${r.user_id}`;
    const c = celda.get(k) || { armados: 0, abiertos: 0 };
    c.armados += buenos_(r);
    if (!r.devuelto_at) c.abiertos += (r.cantidad_asignada || 0) - (r.cantidad_devuelta || 0);
    celda.set(k, c);
  }
  const txt = (c) => !c ? `<span class="rmDia__cero">—</span>`
    : `${c.armados || (c.abiertos ? 0 : "—")}${c.abiertos ? ` <small class="rmDia__mano">+${c.abiertos}</small>` : ""}`;
  const totDia = (f) => gente.reduce((a, g) => a + (celda.get(`${f}|${g.user_id}`)?.armados || 0), 0);
  const totUser = (uid) => dias.reduce((a, f) => a + (celda.get(`${f}|${uid}`)?.armados || 0), 0);

  return `
    <div class="rmTableWrap">
      <table class="rmTable rmDia">
        <thead><tr>
          <th>Día</th>
          ${gente.map(g => `<th class="num" title="${esc(g.nombre)}">${esc(corto(g.nombre))}</th>`).join("")}
          <th class="num">Total</th>
        </tr></thead>
        <tbody>
          ${dias.map(f => `
            <tr>
              <td><b>${esc(fmtDia(f))}</b></td>
              ${gente.map(g => `<td class="num">${txt(celda.get(`${f}|${g.user_id}`))}</td>`).join("")}
              <td class="num"><b>${totDia(f)}</b></td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <th>Total</th>
          ${gente.map(g => `<td class="num"><b>${totUser(g.user_id)}</b></td>`).join("")}
          <td class="num"><b>${dias.reduce((a, f) => a + totDia(f), 0)}</b></td>
        </tr></tfoot>
      </table>
    </div>
    <span class="rmField__hint">
      Cada celda son los armados de ese día (lo devuelto que pasó).
      <small class="rmDia__mano">+n</small> es lo que se le repartió ese día y todavía no devuelve.
    </span>`;
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
 * El detalle que se abre al tocar un nombre: cuatro cifras del rango, el
 * tiempo por marca (un Jetour y un VW no se arman igual, y mezclarlos
 * esconde eso) y cada reparto con lo que tardó.
 *
 * @param {object} j        respuesta de /api/ramales/ramalero/:id
 * @param {number} enMano   lo que tiene en la mano ahora, de cualquier día
 */
export function detalleRamaleroHTML(j, enMano = 0) {
  const reps = j?.repartos || [];
  if (!reps.length) {
    return `<div class="rmEmpty">
      <span class="rmEmpty__icon">📭</span>
      <strong>No se le repartió nada en estas fechas</strong>
      Cambia el rango arriba para ver otros días.
    </div>`;
  }

  const s = resumen(reps);

  // Por marca, con la misma cuenta que el total.
  const porMarca = new Map();
  for (const r of reps.filter(x => x.devuelto_at)) {
    const k = r.tipo_ramal || "Sin marca";
    const arr = porMarca.get(k) || [];
    arr.push(r);
    porMarca.set(k, arr);
  }
  const marcas = [...porMarca]
    .map(([k, arr]) => [k, arr, resumen(arr)])
    .sort((a, b) => b[2].armados - a[2].armados);

  const tiempos = reps.map(r => minPorRamal([r])).filter(v => v != null);
  const maxT = Math.max(1, ...tiempos);
  const ahora = Date.now();

  return `
    <div class="dashGrid">
      ${tile_("🔩 Armados", s.armados)}
      ${tile_("⏱ Tiempo por ramal", fmtMinRamal(s.tiempo))}
      ${tile_("↩️ Rechazo", s.devueltos ? fmtPct_(s.pctRechazo) : "—",
              s.pctRechazo >= 10 ? "color:var(--bad,#ef4444)" : "")}
      ${tile_("🛠 En la mano ahora", enMano, enMano > 0 ? "color:var(--warn)" : "")}
    </div>

    ${marcas.length ? `
      <div class="rmField">
        <label>Por marca</label>
        <div class="rmTableWrap">
          <table class="rmTable">
            <thead><tr>
              <th>Marca</th><th class="num">Repartos</th><th class="num">Armados</th>
              <th class="num">Rechazados</th><th class="num">Tiempo por ramal</th>
            </tr></thead>
            <tbody>
              ${marcas.map(([k, arr, m]) => `
                <tr>
                  <td><b>${esc(k)}</b></td>
                  <td class="num">${arr.length}</td>
                  <td class="num">${m.armados}</td>
                  <td class="num">${m.rechazados || "—"}</td>
                  <td class="num">${fmtMinRamal(m.tiempo)}</td>
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
              const t = minPorRamal([r]);
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
