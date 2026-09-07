// =========================
// public/js/views/supervisor/sup-tecnicos.js
// "¿Cómo va este técnico?" — cada uno frente al resto, a igualdad de trabajo.
//
// POR QUÉ NO ES EL GRÁFICO DE TENDENCIA
// ─────────────────────────────────────
// La tendencia contesta "¿estamos mejorando?", que es una pregunta sobre el
// tiempo. Esta es otra: "¿es rápido o lento comparado con sus compañeros?", y
// una serie temporal no la responde — para verla hay que mirar a la gente en
// paralelo, no al calendario.
//
// LO QUE HACE QUE ESTO SEA JUSTO
// El cuadro NO ordena por horas. Ordenar por horas mide qué carros le tocaron a
// cada uno: el que hace tanque tarda distinto que el de delante, y un modelo
// nuevo tarda más que uno conocido. Cada carro se compara solo contra el mismo
// modelo en el mismo puesto hecho por OTRA gente, y lo que se acumula es la
// razón contra ese listón (ver lib/desempeno.js). 0,85 es "un 15% más rápido
// que el resto en su mismo trabajo", y eso sí se puede decir en voz alta.
//
// SE PUEDE MIRAR A LA CARA DE LA PERSONA
// Tres reglas para que el cuadro no acuse a nadie por ruido:
//   · quien no llega al mínimo de carros no aparece con número, aparece aparte;
//   · el índice se encoge hacia 1 según cuántos carros lo sostienen, y ese es
//     el que ordena — nadie encabeza la lista por una buena semana;
//   · sin significancia (Mann–Whitney) la fila se pinta apagada y lo dice.
//
// USA TODO EL REPORTE, NO EL FILTRO DEL GRÁFICO
// El ajuste por modelo y puesto ya está dentro del cálculo, así que filtrar por
// modelo aquí solo tiraría datos — y datos es justo lo que falta.
// =========================

import { escapeHtml } from "../../core/format.js";
import { comparativaTecnicos_, celdaDe_ } from "../../../../lib/desempeno.js";
import { puntosDe_, puestoDe_ } from "./sup-trend-chart.js";

let _items = null;
let _visible = false;

// Ancho de la barra a cada lado del 1,00. Un técnico al 40% del listón y otro
// al 250% existen, pero pintarlos a escala dejaría a todos los demás en un
// milímetro; fuera de este rango la barra se apoya en el borde y el número
// sigue siendo exacto.
const DESVIO_MAX = 0.5;

const NOMBRE_PUESTO = { DELANTERO: "delantero", TANQUERO: "tanquero", OTRO: "otro" };

/** 0,853 → "−15%" · 1,21 → "+21%" */
function fmtIndice_(v) {
  const pct = (v - 1) * 100;
  const signo = pct < 0 ? "−" : "+";
  return `${signo}${Math.abs(pct).toFixed(0)}%`;
}

/**
 * Barra centrada en el listón: a la izquierda más rápido, a la derecha más
 * lento. El centro no es "cero carros", es "como el resto", que es contra lo
 * que de verdad se compara a una persona.
 */
function barra_(fila) {
  const desvio = Math.max(-DESVIO_MAX, Math.min(DESVIO_MAX, fila.indice - 1));
  const mitad = Math.abs(desvio) / DESVIO_MAX * 50;
  const color = fila.significativo
    ? (fila.mejor ? "var(--good,#0ca30c)" : "var(--danger,#f87171)")
    : "rgba(148,163,184,.55)";
  const izq = fila.mejor ? 50 - mitad : 50;

  return `
    <div style="position:relative; height:14px; background:rgba(148,163,184,.12); border-radius:7px;">
      <div style="position:absolute; left:50%; top:-2px; bottom:-2px; width:1px; background:rgba(148,163,184,.6);"></div>
      <div style="position:absolute; left:${izq}%; width:${mitad}%; top:2px; bottom:2px;
                  background:${color}; border-radius:5px;"></div>
    </div>`;
}

function filaHTML_(fila) {
  const apagado = fila.significativo ? "" : "opacity:.6;";
  const veredicto = fila.significativo
    ? (fila.mejor ? "más rápido que el resto" : "más lento que el resto")
    : "cabe dentro del azar";
  const p = fila.p == null ? "" : ` · p=${fila.p < 0.001 ? "&lt;0.001" : fila.p.toFixed(3)}`;

  return `
    <tr style="${apagado}">
      <td style="padding:7px 8px; font-weight:700;">${escapeHtml(fila.tecnico)}</td>
      <td style="padding:7px 8px; width:38%;">${barra_(fila)}</td>
      <td style="padding:7px 8px; text-align:right; font-weight:900; font-variant-numeric:tabular-nums;
                 color:${fila.significativo ? (fila.mejor ? "var(--good,#0ca30c)" : "var(--danger,#f87171)") : "inherit"};">
        ${fmtIndice_(fila.indice)}
      </td>
      <td class="small" style="padding:7px 8px; opacity:.75; white-space:nowrap;">
        ${fila.n} carros · ${fila.celdas} modelo(s)
      </td>
      <td class="small" style="padding:7px 8px; opacity:.75;">${veredicto}${p}</td>
    </tr>`;
}

/** Carros del reporte listos para comparar: uno por asignación cerrada. */
function carrosDe_(items) {
  return puntosDe_(items)
    .filter(p => p.tecnico && puestoDe_(p.rol) !== "OTRO")
    .map(p => ({
      tecnico: p.tecnico,
      celda: celdaDe_(puestoDe_(p.rol), p.modelo),
      y: p.y,
      puesto: puestoDe_(p.rol),
    }));
}

function pintar_() {
  const panel = document.getElementById("supTecnicosPanel");
  const btn = document.getElementById("btnComparaTecnicos");
  if (!panel) return;

  if (btn) btn.textContent = _visible ? "Ocultar comparación" : "👥 Comparar técnicos";
  panel.style.display = _visible ? "block" : "none";
  if (!_visible) return;

  const carros = carrosDe_(_items);
  const r = comparativaTecnicos_(carros);

  if (!r.filas.length) {
    // Decir POR QUÉ no hay cuadro. "No hay datos" a secas deja al supervisor
    // sin saber si es un fallo o el reparto de trabajo de este mes.
    const distintos = new Set(carros.map(c => c.tecnico)).size;
    const motivo = distintos <= 1
      ? "el reporte está filtrado a una sola persona, y una persona no se compara con nadie: quita el filtro de técnico"
      : `ningún técnico llega a 5 carros comparables (hay ${r.comparables} de ${r.total}). ` +
        "Suele pasar cuando cada uno hizo un modelo distinto: no hay dos personas sobre el mismo trabajo.";
    panel.innerHTML = `<div class="small" style="opacity:.8; padding:6px 2px;">No se puede comparar todavía: ${motivo}</div>`;
    return;
  }

  const porPuesto = [...new Set(carros.map(c => NOMBRE_PUESTO[c.puesto]))].join(" y ");

  const pie = [];
  if (r.sinComparar) {
    pie.push(`${r.sinComparar} carro(s) sin con quién compararse (modelo que solo tocó una persona): ` +
      `no entran, porque no hay listón que no sea ella misma.`);
  }
  if (r.pocos.length) {
    pie.push(`Con muy pocos carros para pronunciarse: ` +
      r.pocos.map(x => `${escapeHtml(x.tecnico)} (${x.n})`).join(" · "));
  }

  panel.innerHTML = `
    <div class="small" style="opacity:.85; margin-bottom:10px; line-height:1.5;">
      Cada carro comparado <b>solo contra el mismo modelo y el mismo puesto hecho por otra gente</b>,
      así que el mix no decide: <b>−20%</b> es "tarda un 20% menos que el resto en su mismo trabajo".
      <span style="opacity:.75;">${r.comparables} de ${r.total} carros · ${r.celdasUsadas} combinación(es)
      de modelo y puesto · ${porPuesto}</span>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; min-width:520px;">
        <thead>
          <tr class="small" style="opacity:.7; text-align:left;">
            <th style="padding:4px 8px;">Técnico</th>
            <th style="padding:4px 8px;">← más rápido · listón · más lento →</th>
            <th style="padding:4px 8px; text-align:right;">vs. resto</th>
            <th style="padding:4px 8px;">Sostenido por</th>
            <th style="padding:4px 8px;">Veredicto</th>
          </tr>
        </thead>
        <tbody>${r.filas.map(filaHTML_).join("")}</tbody>
      </table>
    </div>
    ${pie.length ? `<div class="small" style="opacity:.7; margin-top:10px; line-height:1.5;">${pie.join("<br>")}</div>` : ""}
    <div class="small" style="opacity:.6; margin-top:8px; line-height:1.5;">
      Las filas apagadas no son un empate: son diferencias que todavía caben dentro del azar.
      El orden usa el índice encogido hacia el listón según cuántos carros lo sostienen, para que
      una buena semana no adelante a un buen mes.
    </div>`;
}

/**
 * Punto de entrada desde el reporte.
 * @param {Array} items  items del reporte, ya filtrados
 */
export function renderComparativaTecnicos_(items) {
  const cont = document.getElementById("supTecnicosContainer");
  if (!cont) return;

  const hay = (items || []).length > 0;
  cont.style.display = hay ? "block" : "none";
  if (!hay) return;

  _items = items;

  const btn = document.getElementById("btnComparaTecnicos");
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => { _visible = !_visible; pintar_(); });
  }
  pintar_();
}
