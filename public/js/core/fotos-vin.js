// =========================
// public/js/core/fotos-vin.js
// Visor de las fotos que el técnico sube de un VIN.
//
// Existía uno, pero vivía dentro del modal de CALIDAD y solo enseñaba las 4 de
// soldadura — aunque la respuesta del servidor ya traía TODAS. Las compresiones
// se subían y no las miraba nadie: ni calidad al inspeccionar, ni el supervisor
// al revisar el reporte.
//
// Aquí se saca a un módulo propio para que lo usen las dos vistas. Un visor por
// pantalla acabaría divergiendo, y la pregunta que responde —"¿qué fotos tiene
// este carro?"— es la misma en las dos.
// =========================

import { postJSON } from "./api.js";

/**
 * Grupos de fotos, en el orden en que tiene sentido revisarlas.
 *
 * `comp_1..4` son las cuatro tomas de la prueba de compresión (un cilindro
 * cada una); van juntas porque una sola no dice nada — lo que se compara es el
 * conjunto.
 */
export const GRUPOS_FOTOS = [
  {
    id: "comp",
    titulo: "Compresión",
    icono: "🔧",
    slots: {
      comp_1: "Cilindro 1",
      comp_2: "Cilindro 2",
      comp_3: "Cilindro 3",
      comp_4: "Cilindro 4",
    },
  },
  {
    id: "soldadura",
    titulo: "Soldadura",
    icono: "🔩",
    slots: {
      sold_sensor_antes: "Sensor nivel · ANTES",
      sold_sensor_post:  "Sensor nivel · DESPUÉS",
      sold_cabina_antes: "Cabina · ANTES",
      sold_cabina_post:  "Cabina · DESPUÉS",
    },
  },
  {
    id: "electrico",
    titulo: "Eléctrico",
    icono: "⚡",
    slots: {
      corr_pre:  "Amperaje ANTES",
      corr_post: "Amperaje DESPUÉS",
      voltaje:   "Voltaje",
    },
  },
  {
    id: "identificacion",
    titulo: "Identificación",
    icono: "🚗",
    slots: {
      vin:        "Foto del VIN",
      scan_carro: "Scan del carro",
    },
  },
];

function esc_(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * cargarFotosVin_ — trae el estado de fotos de un VIN.
 *
 * Busca en el mes actual y, si no encuentra nada, en el anterior: las fotos se
 * guardan en R2 bajo `registro/{YYYY-MM}/{VIN}/`, y un carro que se registró a
 * fin de mes y se inspecciona a principios del siguiente caería en el mes
 * equivocado. (Este rebusque venía del visor de soldadura; se conserva porque
 * el problema es el mismo.)
 *
 * @param {string} vin
 * @returns {Promise<{status:object, previews:object}>}
 */
export async function cargarFotosVin_(vin) {
  const hoy = new Date().toISOString().slice(0, 10);
  let res = await postJSON("/api/uploader/proxy", { action: "getStatus", vin, dateStr: hoy });

  if (!Object.values(res?.status || {}).some(Boolean)) {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const res2 = await postJSON("/api/uploader/proxy", {
      action: "getStatus", vin, dateStr: prev.toISOString().slice(0, 10),
    });
    if (Object.values(res2?.status || {}).some(Boolean)) res = res2;
  }
  return { status: res?.status || {}, previews: res?.previews || {} };
}

/**
 * htmlFotosVin_ — pinta los grupos pedidos.
 *
 * Un grupo sin NINGUNA foto no se dibuja: una pantalla llena de recuadros
 * "Sin foto" no informa, solo obliga a recorrerla. Pero dentro de un grupo que
 * sí tiene fotos, los huecos SÍ se muestran — ahí el hueco es la información:
 * dice qué le falta al carro.
 *
 * @param {object}   datos    lo que devuelve cargarFotosVin_
 * @param {string[]} [ids]    grupos a mostrar (por defecto, todos)
 */
export function htmlFotosVin_({ status, previews }, ids = null) {
  const grupos = ids
    ? GRUPOS_FOTOS.filter(g => ids.includes(g.id))
    : GRUPOS_FOTOS;

  const partes = [];
  for (const g of grupos) {
    const slots = Object.keys(g.slots);
    if (!slots.some(s => status[s])) continue;

    const celdas = slots.map(slot => {
      const url = previews[slot]?.imgUrl || "";
      const lbl = esc_(g.slots[slot]);
      return `
        <div class="fvCell">
          <div class="fvLabel">${lbl}</div>
          ${status[slot] && url
            ? `<a href="${esc_(url)}" target="_blank" rel="noopener noreferrer">
                 <img src="${esc_(url)}" alt="${lbl}" loading="lazy" class="fvImg">
               </a>`
            : `<div class="fvEmpty">Sin foto</div>`}
        </div>`;
    }).join("");

    partes.push(`
      <div class="fvGroup">
        <div class="fvGroupTitle">${g.icono} ${esc_(g.titulo)}</div>
        <div class="fvGrid">${celdas}</div>
      </div>`);
  }

  if (!partes.length) {
    return `<div class="fvNone">Este VIN todavía no tiene fotos registradas.</div>`;
  }
  return partes.join("");
}

/** Estilos del visor. Se inyectan una sola vez, la use quien la use. */
export function asegurarEstilosFotos_() {
  if (document.getElementById("fotosVinCss")) return;
  const st = document.createElement("style");
  st.id = "fotosVinCss";
  st.textContent = `
    .fvGroup { margin-bottom: 14px; }
    .fvGroupTitle { font-weight: 900; font-size: 13px; margin-bottom: 8px; opacity: .95; }
    .fvGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .fvCell { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.15);
              border-radius: 10px; padding: 8px; text-align: center; }
    .fvLabel { font-size: 11px; font-weight: 700; margin-bottom: 6px; opacity: .85; }
    .fvImg { width: 100%; max-height: 150px; object-fit: cover; border-radius: 8px; cursor: zoom-in; display: block; }
    .fvEmpty { height: 90px; display: flex; align-items: center; justify-content: center;
               background: rgba(0,0,0,.2); border-radius: 8px; color: rgba(255,255,255,.4); font-size: 11px; }
    .fvNone { padding: 18px; text-align: center; opacity: .6; font-size: 13px; }
  `;
  document.head.appendChild(st);
}
