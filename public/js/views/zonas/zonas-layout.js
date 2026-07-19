// =========================
// public/js/views/zonas/zonas-layout.js
// Layout físico del taller + esqueleto visual compartido del mapa de zonas.
//
// Única fuente del orden de zonas y del HTML de tarjeta/grid. Lo consumen:
//   - zonas-mapa.js (movilizador/supervisor: color por ESTADO)
//   - conversion/tec-mapa.js (técnico: color por sugerencia ML)
// Cada consumidor aporta solo su variante de color y sus atributos de click.
// =========================

import { escapeHtml } from "../../core/core.js";
import { fmtElapsedMin_ } from "../../core/format.js";

// ── Layout físico del taller ─────────────────────────────────────────────────
export const COL_IZQUIERDA = [15, 14, 13, 12, 11, 10];   // Z15 arriba → Z10 abajo
export const COL_DERECHA   = [9, 8, 7, 6, 5, 4, 3, 2, 1]; // Z9 arriba  → Z1 abajo

/**
 * Tarjeta de un spot (carro con técnicos/modelo/VIN/tiempo, o "P" si vacío).
 * @param {object} z zona ({ zona_id, vin, estado, tecnicos, modelo, registrado_at })
 * @param {object} o
 * @param {string}  o.variant    modificador CSS de color: "zonaCard--<variant>"
 * @param {boolean} o.clickable  false agrega .readOnly y role="presentation"
 * @param {string}  [o.attrs]    atributos extra del wrapper (data-estado, data-clickable…)
 */
export function zonaCardHTML_(z, { variant = "libre", clickable = true, attrs = "" } = {}) {
  const isOcupada = !!z.vin;
  const vinShort  = z.vin ? z.vin.slice(-8) : "";
  const delantero = z.tecnicos?.delantero || "";
  const tanquero  = z.tecnicos?.tanquero  || "";
  const modelo    = z.modelo || "";
  const tiempo    = isOcupada ? fmtElapsedMin_(z.registrado_at) : "";
  const roClass   = clickable ? "" : " readOnly";

  return `
    <div class="zonaCard zonaCard--${variant}${roClass}"
         data-zona="${z.zona_id}"
         data-vin="${escapeHtml(z.vin || "")}"
         ${attrs}
         role="${clickable ? "button" : "presentation"}" tabindex="${clickable ? "0" : "-1"}">
      <span class="zonaNum">Z${z.zona_id}</span>
      ${isOcupada ? `
        <div class="zonaCarOuter">
          <div class="zonaCarShape">
            <span class="zonaCarLabel">${escapeHtml(delantero)}</span>
            ${modelo ? `<span class="zonaCarModelo">${escapeHtml(modelo)}</span>` : ""}
            <span class="zonaCarLabel">${escapeHtml(tanquero)}</span>
          </div>
          <span class="zonaCarWheel zonaCarWheelFL"></span>
          <span class="zonaCarWheel zonaCarWheelFR"></span>
          <span class="zonaCarWheel zonaCarWheelBL"></span>
          <span class="zonaCarWheel zonaCarWheelBR"></span>
        </div>
        <span class="zonaVin">${escapeHtml(vinShort)}</span>
        ${tiempo ? `<span class="zonaTime">${tiempo}</span>` : ""}
      ` : `<span class="zonaEmptyP">P</span>`}
    </div>`;
}

/**
 * Grid completo: columna izquierda | pasillo con flechas | columna derecha.
 * @param {Array}    zonas   zonas del API (los spots faltantes se rellenan LIBRE)
 * @param {Function} cardFn  (zona) => html de la tarjeta (decide color/atributos)
 */
export function zonasGridHTML_(zonas, cardFn) {
  const byId = new Map(zonas.map(z => [z.zona_id, z]));
  const col = (nums) => nums
    .map(n => cardFn(byId.get(n) || { zona_id: n, vin: null, estado: "LIBRE" }))
    .join("");

  return `
    <div class="zonasGrid">
      <div class="zonasCol">${col(COL_IZQUIERDA)}</div>
      <div class="zonasPasillo">
        <span class="zonasPasilloArrowDown">▼</span>
        <div class="zonasPasilloLine"></div>
        <span class="zonasPasilloArrowUp">▲</span>
      </div>
      <div class="zonasCol">${col(COL_DERECHA)}</div>
    </div>`;
}
