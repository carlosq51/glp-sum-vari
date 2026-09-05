// =========================
// public/js/views/ramales/comportamiento.js
// Panel de COMPORTAMIENTO — los gráficos con los que se mide al ramalero.
//
// Es la parte que Carlos pidió mirar de verdad: «el desempeño es el
// parámetro que quiero medir». Así que no es un adorno al pie del panel,
// es una sección propia con cuatro lecturas y una tabla.
//
// QUÉ SE DIBUJA Y POR QUÉ ESA FORMA
// ─────────────────────────────────
//   1. Producción por ramalero    barras · comparar magnitud → un solo tono
//   2. Velocidad contra calidad   dispersión · es EL gráfico del módulo
//   3. En qué acabó lo repartido  barra apilada · parte-de-un-todo
//   4. Tiempo por caja            línea · evolución de una sola serie
//
// LA REGLA QUE NO SE ROMPE: NUNCA DOS EJES
// ────────────────────────────────────────
// La tentación era pintar «ramales/hora» y «% de rechazo» en el mismo
// gráfico con dos escalas. Eso deja que la forma de la curva la decida
// quien elige los rangos, no los datos. En su lugar van como DISPERSIÓN:
// velocidad en X, rechazo en Y. Cada ramalero es un punto y el cuadrante
// donde cae dice lo que hay que saber — rápido y limpio abajo-izquierda,
// rápido y sucio arriba-izquierda. Eso es lo que un promedio esconde.
//
// COLOR
// ─────
// Los tres tramos de la barra apilada usan `--dv-1/2/3` (los slots
// categóricos del sistema), NO el trío verde/ámbar/rojo de estado: ese
// trío falla la separación por daltonismo (--dv-good contra --dv-bad da
// ΔE 4.1 en deuteranopia, el clásico rojo-verde). Los slots 1-3 pasan
// all-pairs en día y noche. Además cada tramo va con leyenda y con su
// número escrito encima, así que la identidad nunca depende del color.
//
// Todo es SVG en línea con var() de los tokens: cambia de tema solo, sin
// re-render y sin dependencias externas.
// =========================

import { escapeHtml } from "../../core/core.js";

const esc = escapeHtml;

// Slots categóricos del sistema (00-token.css). Se asignan EN ORDEN y no
// se ciclan: si algún día hicieran falta más de tres tramos, se agrupa el
// resto en «otros», no se inventa un cuarto color.
const C1 = "var(--dv-1)";
const C2 = "var(--dv-2)";
const C3 = "var(--dv-3)";

// ─── Utilidades de dibujo ────────────────────────────────────────────

function num_(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function fmt1_(n) {
  const v = num_(n, null);
  if (v === null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Primer nombre — en un eje, «Juan Carlos Pérez» no cabe nunca. */
function corto_(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "—";
}

/**
 * Escala «bonita» para el eje: sube al siguiente 1/2/5×10ⁿ por encima del
 * máximo, para que las marcas caigan en números redondos y no en 37.4.
 */
function techo_(max) {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const pot = Math.pow(10, exp);
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (max <= m * pot) return m * pot;
  }
  return 10 * pot;
}

function ticks_(techo, n = 4) {
  return Array.from({ length: n + 1 }, (_, i) => (techo / n) * i);
}

/** Envoltorio común: título, subtítulo y el SVG con su descripción. */
function figura_(titulo, sub, svg, pie = "") {
  return `
    <figure class="rmFig">
      <figcaption class="rmFig__cap">
        <span class="rmFig__title">${esc(titulo)}</span>
        ${sub ? `<span class="rmFig__sub">${esc(sub)}</span>` : ""}
      </figcaption>
      <div class="rmFig__plot">${svg}</div>
      ${pie ? `<p class="rmFig__foot">${pie}</p>` : ""}
    </figure>`;
}

function vacio_(msg) {
  return `<div class="rmEmpty"><span class="rmEmpty__icon">📊</span>${esc(msg)}</div>`;
}

// ─── 1. Producción por ramalero ──────────────────────────────────────
//  Comparar magnitud entre nombres: barras horizontales (los nombres se
//  leen sin girar la cabeza) y UN SOLO tono. Colorear cada barra distinto
//  gastaría el canal de identidad en repetir lo que ya dice el largo.

function chartProduccion_(filas) {
  const datos = filas
    .map(d => ({ n: corto_(d.nombre), v: num_(d.ramales_devueltos) }))
    .filter(d => d.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 10);

  if (!datos.length) return vacio_("Nadie ha devuelto ramales todavía.");

  const alto = datos.length * 34 + 34;
  const izq = 92, der = 46;
  const ancho = 560;
  const util = ancho - izq - der;
  const max = techo_(Math.max(...datos.map(d => d.v)));

  const barras = datos.map((d, i) => {
    const y = 26 + i * 34;
    const w = Math.max(2, (d.v / max) * util);
    return `
      <text x="${izq - 10}" y="${y + 13}" class="rmAxLbl" text-anchor="end">${esc(d.n)}</text>
      <rect x="${izq}" y="${y}" width="${w}" height="18" rx="4" fill="${C1}">
        <title>${esc(d.n)}: ${d.v} ramales devueltos</title>
      </rect>
      <text x="${izq + w + 7}" y="${y + 13}" class="rmAxVal">${d.v}</text>`;
  }).join("");

  const rejilla = ticks_(max).map(t => {
    const x = izq + (t / max) * util;
    return `<line x1="${x}" y1="18" x2="${x}" y2="${alto - 16}" class="rmGrid" />
            <text x="${x}" y="${alto - 3}" class="rmAxTick" text-anchor="middle">${fmt1_(t)}</text>`;
  }).join("");

  return figura_(
    "Producción por ramalero",
    "Ramales devueltos a oficina",
    `<svg viewBox="0 0 ${ancho} ${alto}" class="rmSvg" role="img"
          aria-label="Ramales devueltos por cada ramalero, de mayor a menor">
       ${rejilla}${barras}
     </svg>`,
  );
}

// ─── 2. Velocidad contra calidad ─────────────────────────────────────
//  EL gráfico del módulo. Dos medidas de escalas distintas nunca van en
//  dos ejes Y del mismo gráfico: van como dispersión, una por eje. El
//  cuadrante donde cae cada punto es la lectura completa.

function chartVelocidadCalidad_(filas) {
  const datos = filas
    .map(d => ({
      n: corto_(d.nombre),
      x: num_(d.armado_min_por_ramal, null),
      y: num_(d.pct_rechazo),
      peso: num_(d.ramales_devueltos),
    }))
    .filter(d => d.x !== null && d.peso > 0);

  if (!datos.length) {
    return vacio_("Hace falta al menos un reparto cerrado para cruzar velocidad con calidad.");
  }

  const ancho = 560, alto = 300;
  const izq = 48, der = 22, arr = 18, aba = 44;
  const uw = ancho - izq - der;
  const uh = alto - arr - aba;

  const maxX = techo_(Math.max(...datos.map(d => d.x), 1));
  const maxY = techo_(Math.max(...datos.map(d => d.y), 10));
  const px = (v) => izq + (v / maxX) * uw;
  const py = (v) => arr + uh - (v / maxY) * uh;

  // Medianas: parten el plano en los cuatro cuadrantes de la lectura.
  const med = (arr_) => {
    const s = [...arr_].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const mx = med(datos.map(d => d.x));
  const my = med(datos.map(d => d.y));

  const rejilla = [
    ...ticks_(maxX).map(t =>
      `<line x1="${px(t)}" y1="${arr}" x2="${px(t)}" y2="${arr + uh}" class="rmGrid" />
       <text x="${px(t)}" y="${alto - 24}" class="rmAxTick" text-anchor="middle">${fmt1_(t)}</text>`),
    ...ticks_(maxY).map(t =>
      `<line x1="${izq}" y1="${py(t)}" x2="${izq + uw}" y2="${py(t)}" class="rmGrid" />
       <text x="${izq - 8}" y="${py(t) + 4}" class="rmAxTick" text-anchor="end">${fmt1_(t)}%</text>`),
  ].join("");

  const medianas = `
    <line x1="${px(mx)}" y1="${arr}" x2="${px(mx)}" y2="${arr + uh}" class="rmMedian" />
    <line x1="${izq}" y1="${py(my)}" x2="${izq + uw}" y2="${py(my)}" class="rmMedian" />`;

  // Anillo de superficie de 2px en cada punto: dos ramaleros con números
  // parecidos se solapan y sin el anillo se leen como uno solo.
  const puntos = datos.map(d => `
    <g>
      <circle cx="${px(d.x)}" cy="${py(d.y)}" r="7"
              fill="${C1}" stroke="var(--dv-surface)" stroke-width="2">
        <title>${esc(d.n)}: ${fmt1_(d.x)} min por ramal · ${fmt1_(d.y)}% de rechazo · ${d.peso} devueltos</title>
      </circle>
      <text x="${px(d.x)}" y="${py(d.y) - 12}" class="rmAxVal" text-anchor="middle">${esc(d.n)}</text>
    </g>`).join("");

  return figura_(
    "Velocidad contra calidad",
    "Cada punto es un ramalero",
    `<svg viewBox="0 0 ${ancho} ${alto}" class="rmSvg" role="img"
          aria-label="Dispersión de minutos por ramal contra porcentaje de rechazo, un punto por ramalero">
       ${rejilla}${medianas}${puntos}
       <text x="${izq + uw / 2}" y="${alto - 6}" class="rmAxName" text-anchor="middle">minutos por ramal →</text>
       <text x="12" y="${arr + uh / 2}" class="rmAxName" text-anchor="middle"
             transform="rotate(-90 12 ${arr + uh / 2})">% rechazo →</text>
     </svg>`,
    `Las líneas punteadas son las medianas del grupo. <strong>Abajo a la izquierda</strong>
     está lo que se busca: rápido y sin retrabajo. <strong>Arriba a la izquierda</strong>
     es el que corre a costa de la calidad — y es exactamente lo que un ranking
     de ramales por hora premiaría sin querer.`,
  );
}

// ─── 3. En qué acabó lo repartido ────────────────────────────────────
//  Parte-de-un-todo por persona: barra apilada horizontal. Los tres
//  tramos llevan leyenda y número escrito, así que el color no es el
//  único portador de identidad (y en tema claro dos de los slots quedan
//  por debajo de 3:1 contra el blanco, lo que obliga a etiquetar).

function chartReparto_(filas) {
  const datos = filas
    .map(d => {
      const asignados = num_(d.ramales_asignados);
      const devueltos = num_(d.ramales_devueltos);
      const rechazados = num_(d.ramales_rechazados);
      return {
        n: corto_(d.nombre),
        buenos: Math.max(0, devueltos - rechazados),
        rechazados,
        calle: Math.max(0, asignados - devueltos),
        total: asignados,
      };
    })
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (!datos.length) return vacio_("Todavía no se ha repartido nada.");

  const ancho = 560;
  const alto = datos.length * 34 + 30;
  const izq = 92, der = 40;
  const util = ancho - izq - der;
  const max = Math.max(...datos.map(d => d.total));

  const filasSvg = datos.map((d, i) => {
    const y = 14 + i * 34;
    const w = (v) => (v / max) * util;
    // Separación de 2px del color de fondo entre tramos: sin ella dos
    // tramos contiguos se leen como una sola mancha.
    const gap = 2;
    let x = izq;
    const tramos = [];
    for (const [valor, color] of [[d.buenos, C1], [d.rechazados, C2], [d.calle, C3]]) {
      if (valor <= 0) continue;
      const ancho_ = Math.max(2, w(valor) - gap);
      tramos.push(`
        <rect x="${x}" y="${y}" width="${ancho_}" height="18" rx="4" fill="${color}">
          <title>${esc(d.n)}: ${valor}</title>
        </rect>
        ${ancho_ > 22 ? `<text x="${x + ancho_ / 2}" y="${y + 13}" class="rmSegVal"
                               text-anchor="middle">${valor}</text>` : ""}`);
      x += w(valor);
    }
    return `
      <text x="${izq - 10}" y="${y + 13}" class="rmAxLbl" text-anchor="end">${esc(d.n)}</text>
      ${tramos.join("")}
      <text x="${izq + w(d.total) + 7}" y="${y + 13}" class="rmAxVal">${d.total}</text>`;
  }).join("");

  const leyenda = `
    <div class="rmLeg">
      <span class="rmLeg__i"><i style="background:${C1}"></i>Devueltos buenos</span>
      <span class="rmLeg__i"><i style="background:${C2}"></i>Rechazados</span>
      <span class="rmLeg__i"><i style="background:${C3}"></i>Todavía trabajando</span>
    </div>`;

  return figura_(
    "En qué acabó lo repartido",
    "Por cada ramalero, de lo que se le firmó",
    leyenda + `<svg viewBox="0 0 ${ancho} ${alto}" class="rmSvg" role="img"
          aria-label="Barra apilada por ramalero: devueltos buenos, rechazados y todavía trabajando">
       ${filasSvg}
     </svg>`,
  );
}

// ─── 4. Tiempo de desembalaje por caja ───────────────────────────────
//  Una sola serie a lo largo del tiempo → línea, sin leyenda (el título
//  la nombra). Se dibuja también la media para tener contra qué leer
//  cada punto.

function chartDesembalaje_(lotes) {
  const datos = lotes
    .filter(l => l.desembalaje_min != null && Number(l.desembalaje_min) > 0)
    .slice(0, 14)
    .reverse()
    .map(l => ({
      cod: String(l.codigo || "").replace(/^L-/, ""),
      v: num_(l.desembalaje_min),
      quien: corto_(l.encargado),
      eq: num_(l.cantidad_equipos),
    }));

  if (datos.length < 2) {
    return vacio_("Se necesitan al menos dos cajas cerradas para ver la evolución.");
  }

  const ancho = 560, alto = 240;
  const izq = 46, der = 18, arr = 16, aba = 42;
  const uw = ancho - izq - der;
  const uh = alto - arr - aba;
  const max = techo_(Math.max(...datos.map(d => d.v)));
  const media = datos.reduce((a, d) => a + d.v, 0) / datos.length;

  const px = (i) => izq + (datos.length === 1 ? uw / 2 : (i / (datos.length - 1)) * uw);
  const py = (v) => arr + uh - (v / max) * uh;

  const rejilla = ticks_(max).map(t =>
    `<line x1="${izq}" y1="${py(t)}" x2="${izq + uw}" y2="${py(t)}" class="rmGrid" />
     <text x="${izq - 8}" y="${py(t) + 4}" class="rmAxTick" text-anchor="end">${fmt1_(t)}</text>`,
  ).join("");

  const linea = datos.map((d, i) => `${i ? "L" : "M"}${px(i)},${py(d.v)}`).join(" ");

  const puntos = datos.map((d, i) => `
    <circle cx="${px(i)}" cy="${py(d.v)}" r="4.5"
            fill="${C1}" stroke="var(--dv-surface)" stroke-width="2">
      <title>${esc(d.cod)} · ${esc(d.quien)} · ${d.eq} vehículos · ${fmt1_(d.v)} min</title>
    </circle>`).join("");

  // Solo se etiquetan los extremos: un número sobre cada punto convierte
  // la línea en una tabla mal maquetada.
  const iMax = datos.reduce((b, d, i) => (d.v > datos[b].v ? i : b), 0);
  const iMin = datos.reduce((b, d, i) => (d.v < datos[b].v ? i : b), 0);
  const etiquetas = [iMax, iMin].map(i =>
    `<text x="${px(i)}" y="${py(datos[i].v) - 11}" class="rmAxVal"
           text-anchor="middle">${fmt1_(datos[i].v)}m</text>`,
  ).join("");

  const ejeX = datos.map((d, i) =>
    (datos.length <= 8 || i % 2 === 0)
      ? `<text x="${px(i)}" y="${alto - 24}" class="rmAxTick" text-anchor="middle">${esc(d.cod)}</text>`
      : "",
  ).join("");

  return figura_(
    "Cuánto se demora una caja",
    "Tiempo oficial: de que llegó a que el supervisor recibió los cables",
    `<svg viewBox="0 0 ${ancho} ${alto}" class="rmSvg" role="img"
          aria-label="Minutos de desembalaje de las últimas cajas cerradas, en orden">
       ${rejilla}
       <line x1="${izq}" y1="${py(media)}" x2="${izq + uw}" y2="${py(media)}" class="rmMedian" />
       <text x="${izq + uw}" y="${py(media) - 6}" class="rmAxTick" text-anchor="end">media ${fmt1_(media)}m</text>
       <path d="${linea}" fill="none" stroke="${C1}" stroke-width="2"
             stroke-linejoin="round" stroke-linecap="round" />
       ${puntos}${etiquetas}${ejeX}
       <text x="${izq + uw / 2}" y="${alto - 6}" class="rmAxName" text-anchor="middle">caja →</text>
     </svg>`,
  );
}

// ─── Cabecera de cifras ──────────────────────────────────────────────

function kpis_(filas, lotes) {
  const devueltos = filas.reduce((a, d) => a + num_(d.ramales_devueltos), 0);
  const rechazados = filas.reduce((a, d) => a + num_(d.ramales_rechazados), 0);
  const pctRech = devueltos > 0 ? (100 * rechazados) / devueltos : 0;

  const conTiempo = filas.filter(d => d.armado_min_por_ramal != null);
  const minRamal = conTiempo.length
    ? conTiempo.reduce((a, d) => a + num_(d.armado_min_por_ramal), 0) / conTiempo.length
    : null;

  const cerradas = lotes.filter(l => l.estado === "CERRADO").length;

  return `
    <div class="dashGrid" style="margin-bottom:16px;">
      <div class="statTile">
        <div class="statTile__label">🔩 Ramales terminados</div>
        <div class="statTile__value">${devueltos}</div>
      </div>
      <div class="statTile">
        <div class="statTile__label">⏱ Minutos por ramal</div>
        <div class="statTile__value">${minRamal === null ? "—" : fmt1_(minRamal)}</div>
      </div>
      <div class="statTile">
        <div class="statTile__label">↩️ Rechazo</div>
        <div class="statTile__value" style="${pctRech >= 10 ? "color:var(--bad,#ef4444)" : ""}">${fmt1_(pctRech)}%</div>
      </div>
      <div class="statTile">
        <div class="statTile__label">📦 Cajas cerradas</div>
        <div class="statTile__value">${cerradas}</div>
      </div>
    </div>`;
}

// ─── Tabla ───────────────────────────────────────────────────────────
//  Obligatoria, no opcional: en tema claro dos de los slots quedan por
//  debajo de 3:1 contra el blanco, y la vista de tabla es la salida que
//  el sistema de color exige cuando eso pasa. Además hay quien prefiere
//  el número al dibujo, y no hay razón para obligarle a elegir.

function tabla_(filas) {
  const orden = [...filas].sort(
    (a, b) => num_(b.ramales_devueltos) - num_(a.ramales_devueltos),
  );
  if (!orden.length) return "";

  return `
    <details class="rmDetails">
      <summary>Ver los mismos datos en tabla</summary>
      <div class="rmTableWrap" style="margin-top:10px;">
        <table class="rmTable">
          <thead>
            <tr>
              <th>Ramalero</th><th class="num">Asignados</th><th class="num">Devueltos</th>
              <th class="num">Rechazados</th><th class="num">% rechazo</th>
              <th class="num">Min/ramal</th><th class="num">Cajas</th>
              <th class="num">Desembalaje</th><th class="num">Entregas</th>
            </tr>
          </thead>
          <tbody>
            ${orden.map(d => `
              <tr>
                <td>${esc(d.nombre)}</td>
                <td class="num">${num_(d.ramales_asignados)}</td>
                <td class="num">${num_(d.ramales_devueltos)}</td>
                <td class="num">${num_(d.ramales_rechazados)}</td>
                <td class="num"><span class="rmRechazo ${num_(d.pct_rechazo) >= 10 ? "is-alto" : ""}">${fmt1_(d.pct_rechazo)}%</span></td>
                <td class="num">${d.armado_min_por_ramal ?? "—"}</td>
                <td class="num">${num_(d.lotes_desembalados)}</td>
                <td class="num">${d.desembalaje_min_prom ?? "—"}</td>
                <td class="num">${num_(d.entregas_a_tecnicos)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </details>`;
}

// ─── API pública ─────────────────────────────────────────────────────

/**
 * Devuelve el HTML del panel de comportamiento.
 * Es una función pura: no toca el DOM ni guarda estado, así que el poll
 * del panel puede re-pintarla entera sin desmontar nada.
 *
 * @param {object} raw respuesta de /api/ramales/panel
 */
export function comportamientoHTML(raw) {
  const filas = raw?.desempeno || [];
  const lotes = raw?.lotes || [];

  if (!filas.length) {
    return `<div class="rmEmpty">
      <span class="rmEmpty__icon">📊</span>
      <strong>Todavía no hay nada que medir</strong>
      Los gráficos aparecen cuando se cierre el primer reparto.
    </div>`;
  }

  return `
    ${kpis_(filas, lotes)}
    <div class="rmFigGrid">
      ${chartVelocidadCalidad_(filas)}
      ${chartProduccion_(filas)}
      ${chartReparto_(filas)}
      ${chartDesembalaje_(lotes)}
    </div>
    ${tabla_(filas)}`;
}
