// =========================
// public/js/views/ramalero/planos.js
// Planos de armado de ramales, para quien recién empieza o duda de una
// medida. Digitalizados del dibujo en papel que hicieron los técnicos.
//
// Los planos son datos (planos-datos.js) envueltos en el modelo Ramal →
// Tronco → Sección → Rama (planos-modelo.js). Este archivo solo los pinta.
//
// TRES PARTES DEL MISMO PLANO
// ───────────────────────────
// 1. El DIBUJO: con la forma del boceto del taller y los largos reales.
//    Los conectores se dibujan como la pieza (de fotos del taller). Tocar
//    una rama muestra su ficha.
// 2. La REFERENCIA DE MEDIDAS: las medidas que usa ESTE plano y al lado
//    cómo se miden en el taller («1/4», «6/4 + 1 puño»…). Viene con lo que
//    dice el papel y cada uno anota lo suyo.
// 3. El RECORRIDO PASO A PASO: sección por sección, con la distancia desde
//    el conector y los colores de cable. Sirve para armar midiendo.
//
// LA REFERENCIA VIVE EN EL CELULAR
// ────────────────────────────────
// Se mide con la mano y la cuarta de cada uno es distinta, así que lo que
// se anota es de cada persona: localStorage, una entrada por plano. Lo que
// no se toca se queda con lo que dice el papel.
// =========================

import { Ramal } from "./planos-modelo.js";
import { RAMALES } from "./planos-datos.js";

const PLANOS = RAMALES.map((j) => new Ramal(j));

// Colores reales del cable (no son colores de tema: un cable rojo es rojo
// de día y de noche). «multicolor» y los bicolores se pintan con gradiente.
const CABLE = {
  negro:      { n: "negro",      c: "#1a1a1a" },
  rojo:       { n: "rojo",       c: "#dc2626" },
  azul:       { n: "azul",       c: "#2563eb" },
  verde:      { n: "verde",      c: "#16a34a" },
  marron:     { n: "marrón",     c: "#7c4a1e" },
  anaranjado: { n: "anaranjado", c: "#f97316" },
  blancoVerde:{ n: "blanco/verde", g: "linear-gradient(135deg,#f5f5f5 0 50%,#16a34a 50% 100%)" },
  multicolor: { n: "multicolor", g: "conic-gradient(#dc2626,#f97316,#facc15,#16a34a,#2563eb,#7c3aed,#dc2626)" },
  rojoNegro:  { n: "rojo con línea negra", g: "linear-gradient(90deg,#dc2626 0 38%,#1a1a1a 38% 62%,#dc2626 62%)" },
};

// Tipos de cinta para la leyenda. La muestra imita la textura: la aislante
// es lisa y brillante, la de tela tiene trama.
const CINTAS = {
  aislante: { n: "Cinta aislante simple", clase: "is-aislante" },
  tela: { n: "Cinta de tela", clase: "is-tela" },
};

const esc_ = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function cm_(cm) {
  return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm} cm`;
}

const obs_ = (lista) => lista.map((o) => `<div class="plano__det">${esc_(o)}</div>`).join("");

function cintaHTML_(p) {
  if (!p.cinta.length) return "";
  const filas = p.cinta
    .map((c) => {
      const t = CINTAS[c.tipo] || { n: c.tipo, clase: "" };
      return `<div class="plano__cintaFila"><i class="plano__cintaMuestra ${t.clase}"></i><b>${esc_(t.n)}</b><span>${esc_(c.donde || "")}</span></div>`;
    })
    .join("");
  return `<div class="plano__cinta"><div class="plano__secT">Cinta</div>${filas}</div>`;
}

// ── Referencia de medidas (por plano, guardada en el celular) ──────────
const refKey_ = (p) => `glp.planos.ref.${p.id}`;

function refCargar_(p) {
  const ref = {};
  for (const e of p.medidas()) ref[e.cm] = e.medida;
  try {
    const mias = JSON.parse(localStorage.getItem(refKey_(p)) || "null");
    if (mias && typeof mias === "object") {
      for (const [cm, txt] of Object.entries(mias)) if (cm in ref) ref[cm] = String(txt ?? "");
    }
  } catch { /* sin almacenamiento: queda lo del papel */ }
  return ref;
}

function refGuardar_(p, cm, txt) {
  try {
    const mias = JSON.parse(localStorage.getItem(refKey_(p)) || "{}") || {};
    mias[cm] = txt;
    localStorage.setItem(refKey_(p), JSON.stringify(mias));
    return true;
  } catch {
    return false;
  }
}

function refBorrar_(p) {
  try { localStorage.removeItem(refKey_(p)); } catch { /* nada que borrar */ }
}

// «35 cm (2/4 + 1 pulgar)», con la referencia resaltada. `tramos` son las
// partes que forman un largo total (RPM: [26, 20]).
// Lo que manda es la medida del taller («2/4 + 1 pulgar»); los cm van
// de aclaración. Si esa medida todavía no tiene estándar, los cm son la
// principal. `tramos`: las partes que forman un largo (chapa: [129]).
function medidaPartes_(cm, ref, tramos = [cm]) {
  const notas = tramos.map((s) => ref?.[s]).filter(Boolean);
  const std = notas.length === tramos.length ? notas.join(" + ") : "";
  return std ? { principal: std, aclaracion: cm_(cm) } : { principal: cm_(cm), aclaracion: "" };
}

function medidaHTML_(cm, ref, tramos = [cm]) {
  const { principal, aclaracion } = medidaPartes_(cm, ref, tramos);
  return aclaracion
    ? `<b class="plano__std">${esc_(principal)}</b> <span class="plano__acl">(${esc_(aclaracion)})</span>`
    : `<b class="plano__std">${esc_(principal)}</b>`;
}

// Toda rama nace en el conector: el largo al que se cortan sus cables es
// la distancia del nodo de salida más lo que mide la rama.
function desdeConectorHTML_(r) {
  const txt = r.hastaPunta != null ? cm_(r.hastaPunta) : r.sale != null ? `${cm_(r.sale)} + punta` : "";
  return txt ? `<div class="plano__desdeCon">Desde el conector: <b>${txt}</b></div>` : "";
}

// Lo que hay que hacerle a la rama (dobleces y demás), en orden.
function pasosHTML_(r) {
  if (!r.pasos.length) return "";
  return `<ol class="plano__pasos">${r.pasos
    .map((p) => `<li><b>${esc_(p.tipo)}</b>${p.cm != null ? ` a ${cm_(p.cm)}` : ""}: ${esc_(p.texto)}</li>`)
    .join("")}</ol>`;
}

function largoHTML_(r, ref) {
  if (!r.largo) return "largo no indicado";
  const partes = r.tramos.length > 1 ? ` <span class="plano__papel">= ${r.tramos.map(cm_).join(" + ")}</span>` : "";
  return medidaHTML_(r.largo, ref, r.tramos) + partes;
}

function referenciaHTML_(p, ref) {
  const filas = p
    .medidas()
    .map(
      (e) => `
      <div class="plano__refFila">
        <span class="plano__refCm">${cm_(e.cm)}</span>
        <input type="text" class="plano__refIn" data-ref-cm="${e.cm}" value="${esc_(ref[e.cm] ?? "")}"
               placeholder="${esc_(e.medida || "anota cómo la mides")}" autocomplete="off" enterkeyhint="done"
               aria-label="Cómo se mide ${esc_(cm_(e.cm))}">
        <span class="plano__refUso">${e.usos.length === 1 ? esc_(e.usos[0]) : `${e.usos.length} veces en el plano`}</span>
      </div>`
    )
    .join("");
  return `
    <div class="plano__ref">
      <div class="plano__secHead">
        <span class="plano__secT">📏 Medidas del taller</span>
        <button type="button" class="plano__zoom plano__zoom--nw" data-ref-papel>↺ Papel</button>
      </div>
      <p class="plano__det">La medida del taller (1/4, 6/4 + 1 puño…) es la que manda en todo el plano;
        los cm quedan de aclaración. Anota o corrige cada una. Se guarda en este celular.</p>
      <div class="plano__refLista">${filas}</div>
      <div class="plano__refMsg plano__det" aria-live="polite"></div>
    </div>`;
}

function cablesHTML_(keys) {
  if (!keys?.length) return "";
  return `<div class="plano__cables">${keys
    .map((k) => {
      const c = CABLE[k];
      if (!c) return "";
      const bg = c.g || c.c;
      return `<span class="plano__cable"><span class="plano__dot" style="background:${bg}"></span>${esc_(c.n)}</span>`;
    })
    .join("")}</div>`;
}

// ── Conectores dibujados como la pieza (de las fotos del taller) ────────
// Coordenadas locales: el cable entra por la izquierda en (0,0) y la pieza
// crece hacia +x. Se colocan con translate+rotate según hacia dónde apunta
// la rama. `caja` es su contorno, para que el dibujo no los corte.
//
//   iny        tipo Superseal: funda negra, sello amarillo con aros,
//              cuerpo negro con traba arriba y frente rojo.
//   map        cuerpo negro con seguro rosado del lado del cable, pestaña
//              y frente gris de 4 vías.
//   interface  redondo: funda, aro amarillo, cilindro negro y brida.
const COL = { amarillo: "#facc15", rojo: "#dc2626", rosado: "#f05a78", gris: "#c8cacc", negro: "#1f2124", naranja: "#f97316" };

const PIEZAS = {
  iny: {
    caja: [0, -18, 36, 13],
    svg: () =>
      `<rect x="0" y="-6" width="9" height="12" rx="2" class="pz-negro"/>` +
      `<rect x="8" y="-12" width="12" height="24" rx="3" fill="${COL.amarillo}"/>` +
      `<path d="M11.5 -11v22M14.5 -11v22M17.5 -11v22" class="pz-aros"/>` +
      `<rect x="18" y="-10" width="13" height="20" rx="2" class="pz-negro"/>` +
      `<path d="M19 -10v-7h12v5" class="pz-traba"/>` +
      `<rect x="30" y="-8" width="6" height="16" rx="1.5" fill="${COL.rojo}"/>`,
  },
  map: {
    caja: [0, -16, 38, 16],
    svg: () =>
      `<rect x="0" y="-5" width="7" height="10" rx="2" class="pz-negro"/>` +
      `<rect x="6" y="-16" width="4" height="32" rx="1" class="pz-negro"/>` +
      `<rect x="9" y="-12" width="17" height="24" rx="2" class="pz-negro"/>` +
      `<rect x="3" y="-9" width="13" height="10" rx="1.5" fill="${COL.rosado}"/>` +
      `<path d="M6 -6h7M6 -2h7" stroke="${COL.negro}" stroke-width="1.4"/>` +
      `<rect x="25" y="-10" width="13" height="20" rx="1.5" fill="${COL.gris}"/>` +
      `<rect x="32" y="3" width="2.6" height="4" fill="${COL.negro}"/><rect x="35" y="3" width="2.6" height="4" fill="${COL.negro}"/>`,
  },
  interface: {
    caja: [0, -17, 38, 17],
    svg: () =>
      `<rect x="0" y="-7" width="8" height="14" rx="2" class="pz-negro"/>` +
      `<path d="M2.5 -7v14M5 -7v14" class="pz-aros pz-aros--gris"/>` +
      `<rect x="7" y="-13" width="3" height="26" rx="1" fill="${COL.amarillo}"/>` +
      `<rect x="10" y="-14" width="23" height="28" rx="6" class="pz-negro"/>` +
      `<rect x="32" y="-17" width="6" height="34" rx="2.5" class="pz-negro"/>`,
  },
};

// Conector principal (ECU), con el cable saliendo por abajo en (0,0).
// Bloque de pines más grande a la izquierda, sello naranja/rojo a su
// derecha, carcasa con palanca encima del cable. Los 4 puntos en el borde
// de abajo: es lo que en el taller llaman «invertido».
// `puntosArriba`: el conector en posición normal (antes de invertirlo).
// Cuerpo: el cuadrado (con la palanca) centrado sobre la salida del cable,
// la franja naranja a su izquierda y el bloque de pines más a la izquierda.
const PRINCIPAL = {
  caja: [-98, -64, 24, 0],
  svg: (puntosArriba = false) =>
    `<rect x="-98" y="-52" width="66" height="48" rx="4" class="pz-negro"/>` +
    `<path d="M-92 -44h54M-92 -34h54M-92 -24h54" class="pz-ranura"/>` +
    [-86, -74, -62, -50].map((x) => `<circle cx="${x}" cy="${puntosArriba ? -45 : -11}" r="3.2" fill="${COL.amarillo}"/>`).join("") +
    `<rect x="-31" y="-54" width="8" height="52" rx="2" fill="${COL.naranja}"/>` +
    `<rect x="-22" y="-50" width="44" height="46" rx="3" class="pz-negro"/>` +
    `<path d="M-17 -50c4 -14 30 -16 34 0" class="pz-palanca"/>` +
    `<circle cx="0" cy="-27" r="6" class="pz-eje"/>` +
    `<rect x="-8" y="-4" width="16" height="6" rx="1.5" class="pz-negro"/>`,
};

// Mini dibujo suelto para las fichas de la sección «Conectores».
function miniPiezaSVG_(tipo) {
  if (tipo === "principal") {
    return `<svg class="pl-mini pl-mini--grande" viewBox="-106 -72 136 106" aria-hidden="true">
      <line x1="0" y1="0" x2="0" y2="30" class="pl-rama"/>${PRINCIPAL.svg()}</svg>`;
  }
  const [x0, y0, x1, y1] = PIEZAS[tipo].caja;
  return `<svg class="pl-mini" viewBox="${x0 - 30} ${y0 - 4} ${x1 - x0 + 34} ${y1 - y0 + 8}" aria-hidden="true">
    <line x1="-28" y1="0" x2="0" y2="0" class="pl-rama"/>${PIEZAS[tipo].svg()}</svg>`;
}

// ── Dibujo (SVG) ───────────────────────────────────────────────────────
// Con la forma del boceto del taller (las ramas salen con sus ángulos),
// el haz en línea gruesa, los conectores como la pieza y las puntas
// abiertas en sus cables de color. Largos reales, salvo los tramos más
// largos que `dibujo.tramoMax` del ramal: esos se dibujan cortados (⫽).
const S = 4;        // px de dibujo por cm
// Ampliado (como abre): el dibujo a un tamaño en que la letra se lee
// (~14 px) y se arrastra con el dedo. «Ver todo» lo ajusta al ancho.
const ZOOM = 0.7;
const FS = 20;      // tamaño de letra en unidades del dibujo
const TXT_W = 0.6;  // ancho medio de un carácter, en FS
const COLA = 26;    // largo de dibujo de cada cable suelto en la punta
const MEDIO_TRONCO = 7; // medio grosor del tronco (14): las cotas van pasado él
// Varias piezas iguales en una punta (INY ×4): cada una a la mitad de
// tamaño (un cuarto del área: las cuatro ocupan lo que ocupaba una), en
// peine, separadas PEINE_PASO y a PEINE del final de la rama.
const ESC_VARIAS = 0.5;
const PEINE = 20;
const PEINE_PASO = 18;

// Cables de dos o más colores. `rayas`: tramos alternados (blanco/verde).
// `linea`: color base con una línea fina a lo largo (rojo con línea negra).
// En SVG no sirve un gradiente sobre una línea recta: su caja mide 0.
const RAYAS = {
  blancoVerde: { rayas: ["#f5f5f5", "#16a34a"] },
  multicolor: { rayas: ["#dc2626", "#facc15", "#16a34a", "#2563eb"] },
  rojoNegro: { linea: ["#dc2626", "#1a1a1a"] },
};

function dibujoSVG_(p, ref) {
  const out = { tronco: [], caminos: [], trazos: [], marcas: [], textos: [] };
  const caja = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const crece = (x, y) => {
    caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x);
    caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y);
  };
  const dir = (ang) => [Math.cos((ang * Math.PI) / 180), Math.sin((ang * Math.PI) / 180)];
  const f = (n) => Math.round(n * 10) / 10;
  const anchoTxt = (s, fs = FS) => s.length * fs * TXT_W;
  const tramoMax = p.dibujo.tramoMax || Infinity;
  let hayCortes = false;

  // Texto con su caja aproximada, para que el viewBox no lo corte.
  // `extra` es un segundo texto más tenue en la misma línea (el largo).
  const texto = (x, y, s, cls, anchor = "middle", fs = FS, extra = "", extraCls = "pl-cota") => {
    const full = extra ? `${s}  ${extra}` : s;
    const w = anchoTxt(full, fs);
    const xa = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    crece(xa, y - fs); crece(xa + w, y + fs * 0.3);
    const tamExtra = extraCls === "pl-acl" ? ` font-size="${fs - 5}"` : "";
    const tsp = extra ? `<tspan class="${extraCls}" dx="6"${tamExtra}>${esc_(extra)}</tspan>` : "";
    return `<text x="${f(x)}" y="${f(y)}" class="${cls}" text-anchor="${anchor}" font-size="${fs}">${esc_(s)}${tsp}</text>`;
  };

  // Un cable de color, con rayas o línea si es de dos colores.
  const cable = (x1, y1, x2, y2, key) => {
    const at = `x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"`;
    // Contorno debajo: sin él, el cable negro desaparece en el tema noche.
    const fondo = `<line ${at} class="pl-cable-fondo"/>`;
    const esp = RAYAS[key];
    if (!esp) return fondo + `<line ${at} class="pl-cable" stroke="${CABLE[key]?.c || "currentColor"}"/>`;
    if (esp.linea) {
      return fondo +
        `<line ${at} class="pl-cable pl-cable--ancho" stroke="${esp.linea[0]}"/>` +
        `<line ${at} class="pl-cable pl-cable--linea" stroke="${esp.linea[1]}"/>`;
    }
    const n = esp.rayas.length, paso = 4;
    return fondo + esp.rayas
      .map((c, i) =>
        i === 0
          ? `<line ${at} class="pl-cable" stroke="${c}"/>`
          : `<line ${at} class="pl-cable pl-cable--raya" stroke="${c}" stroke-dasharray="${paso} ${paso * (n - 1)}" stroke-dashoffset="${-paso * i}"/>`
      )
      .join("");
  };

  // Las puntas de la rama: los cables abiertos en abanico hacia donde
  // apunta el último tramo.
  const abanico = (x, y, d, keys) => {
    const n = keys.length;
    const abre = n === 1 ? [0] : keys.map((_, i) => -22 + (44 * i) / (n - 1));
    const base = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    let svg = "";
    for (let i = 0; i < n; i++) {
      const dc = dir(base + abre[i]);
      const cx = x + dc[0] * COLA, cy = y + dc[1] * COLA;
      crece(cx, cy);
      svg += cable(x, y, cx, cy, keys[i]);
    }
    return svg;
  };

  // La pieza al final de la rama, girada hacia donde apunta el cable. Si
  // son varias iguales (INY ×4), un peine: cables cortos que se abren y una
  // pieza chica en cada punta.
  const pieza = (x, y, d, tipo, cantidad = 1) => {
    const pz = PIEZAS[tipo];
    if (!pz) return "";
    const ang = Math.round((Math.atan2(d[1], d[0]) * 180) / Math.PI);
    const [x0, y0, x1, y1] = pz.caja;
    const c = Math.cos((ang * Math.PI) / 180), s = Math.sin((ang * Math.PI) / 180);
    const una = (px0, py0, esc) => {
      for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
        crece(px0 + (px * c - py * s) * esc, py0 + (px * s + py * c) * esc);
      }
      return `<g transform="translate(${f(px0)} ${f(py0)}) rotate(${ang}) scale(${esc})">${pz.svg()}</g>`;
    };
    if (cantidad <= 1) return una(x, y, 1);
    const nrm = [-d[1], d[0]];
    let svg = "";
    for (let i = 0; i < cantidad; i++) {
      const off = (i - (cantidad - 1) / 2) * PEINE_PASO;
      const tx = x + d[0] * PEINE + nrm[0] * off, ty = y + d[1] * PEINE + nrm[1] * off;
      svg += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(tx)}" y2="${f(ty)}" class="pl-rama pl-rama--fina"/>` + una(tx, ty, ESC_VARIAS);
    }
    return svg;
  };

  // Continuación («···») a media línea: el tramo es más largo de lo que
  // se dibuja. Un hueco del color del fondo con tres puntos.
  const corte = (x, y, d) => {
    const punto = (o) => `<circle cx="${f(x + d[0] * o)}" cy="${f(y + d[1] * o)}" r="3" class="pl-corte"/>`;
    return `<line x1="${f(x - d[0] * 14)}" y1="${f(y - d[1] * 14)}" x2="${f(x + d[0] * 14)}" y2="${f(y + d[1] * 14)}" class="pl-corteHueco"/>` +
      punto(-8) + punto(0) + punto(8);
  };

  // Nombre (y largo total, si se conoce) junto a la punta.
  const rotulo = (x, y, d, r) => {
    const dib = r.dibujo;
    // Solo el nombre: la medida de la rama va sobre su línea (cotaEnLinea).
    const largo = "";
    const largoPz = !r.conector ? 0
      : r.cantidad > 1 ? PEINE + (PIEZAS[r.conector]?.caja[2] || 0) * ESC_VARIAS
      : PIEZAS[r.conector]?.caja[2] || 0;
    const lejos = r.cables.length ? COLA + 6 : largoPz + 10;
    let lado = dib.lado;
    if (!lado) lado = d[0] > 0.5 ? "der" : d[0] < -0.5 ? "izq" : d[1] < 0 ? "arriba" : "abajo";
    // En el dibujo manda el nombre corto (Conm, Elctr…); sin él, el nombre
    // y la cantidad (las 4 piezas ya se ven en el peine).
    const nom = r.corto || `${r.nombre}${r.cantidad > 1 ? ` ×${r.cantidad}` : ""}`;
    // Pieza con el nombre al costado de su cuerpo (no en la punta): a media
    // pieza, pegado a ella.
    if (largoPz && lado === "der" && Math.abs(d[1]) > 0.5) {
      return texto(x + 22, y + d[1] * (largoPz / 2) + 7, nom, "pl-nom", "start", FS, largo, "pl-medida");
    }
    if (largoPz && (lado === "arriba" || lado === "abajo") && Math.abs(d[0]) > 0.5) {
      const cx = x + d[0] * (largoPz / 2);
      return texto(cx, lado === "arriba" ? y - 24 : y + 24 + FS, nom, "pl-nom", "middle", FS, largo, "pl-medida");
    }
    if (lado === "der") return texto(x + lejos, y + 6, nom, "pl-nom", "start", FS, largo, "pl-medida");
    if (lado === "izq") return texto(x - lejos, y + 6, nom, "pl-nom", "end", FS, largo, "pl-medida");
    if (lado === "arriba") return texto(x + d[0] * lejos * 0.6, y - lejos + 2, nom, "pl-nom", "middle", FS, largo, "pl-medida");
    return texto(x, y + lejos + FS, nom, "pl-nom", "middle", FS, largo, "pl-medida");
  };

  // Largo de un tramo: los cm y, debajo y resaltado, la referencia. Solo en
  // los verticales (tronco), que tienen aire al costado; en las ramas
  // diagonales no entra junto a las piezas: ahí la referencia sale en la
  // ficha al tocar la rama y en el paso a paso.
  // Largo de un tramo: arriba la medida del taller (la principal) y debajo,
  // más chica, los cm de aclaración. Sin estándar todavía, solo los cm.
  const cota = (ax, ay, bx, by, cm, cls = "pl-cota", lado = "der", t = 0.62) => {
    const m = medidaPartes_(cm, ref);
    let principal = m.principal;
    if (principal.length > 16) principal = `${principal.slice(0, 15)}…`;
    // La medida principal siempre resaltada, tenga estándar o sea en cm.
    const clsP = "pl-std";
    const acl = m.aclaracion ? `(${m.aclaracion})` : "";
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (Math.abs(bx - ax) < Math.abs(by - ay)) {
      const dx = lado === "izq" ? -10 : 10, an = lado === "izq" ? "end" : "start";
      const y0 = acl ? my - 3 : my + 6;
      return texto(mx + dx, y0, principal, clsP, an, FS - 1) +
        (acl ? texto(mx + dx, y0 + FS - 2, acl, "pl-acl", an, FS - 5) : "");
    }
    // Diagonal u horizontal: la principal encima de la línea y la aclaración
    // debajo, corridas hacia el final del tramo (al inicio están las piezas).
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    // Horizontal: todo en una línea encima, empezando pasado el tronco
    // (debajo o centrada chocaría con las cotas del tronco).
    if (Math.abs(by - ay) * 3 < Math.abs(bx - ax)) {
      const der = bx > ax;
      return texto(ax + (der ? 14 : -14), py - 9, principal, clsP, der ? "start" : "end", FS - 1, acl, "pl-acl");
    }
    return texto(px, py - 9, principal, clsP, "middle", FS - 1) +
      (acl ? texto(px, py + FS + 1, acl, "pl-acl", "middle", FS - 5) : "");
  };

  // Medida escrita a lo largo de la línea de la rama, como una cota de
  // plano: la del taller (resaltada) y los cm entre paréntesis. El texto
  // siempre se lee de izquierda a derecha y va del lado de arriba.
  const cotaEnLinea = ([ax, ay], [bx, by], r) => {
    const m = medidaPartes_(r.largo, ref, r.tramos);
    let a = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    if (a > 90 || a < -90) a += 180;
    const u = dir(a), arriba = [u[1], -u[0]];
    const t = r.dibujo.cotaT ?? 0.55;
    const px = ax + (bx - ax) * t + arriba[0] * 8, py = ay + (by - ay) * t + arriba[1] * 8;
    const w = anchoTxt(`${m.principal}  ${m.aclaracion ? `(${m.aclaracion})` : ""}`, FS - 2);
    crece(px - u[0] * w / 2, py - u[1] * w / 2 - FS); crece(px + u[0] * w / 2, py + u[1] * w / 2 + FS);
    const acl = m.aclaracion ? `<tspan class="pl-acl" dx="5" font-size="${FS - 6}">(${esc_(m.aclaracion)})</tspan>` : "";
    return `<text x="${f(px)}" y="${f(py)}" transform="rotate(${f(a)} ${f(px)} ${f(py)})" text-anchor="middle" font-size="${FS - 2}" class="pl-std">${esc_(m.principal)}${acl}</text>`;
  };

  const rama = (x, y, r) => {
    const dib = r.dibujo;
    // Largo dibujado: el real; recortado (con «···») si pasa de tramoMax o
    // si la rama pide uno más corto en `dibujo.largo`; o el de dibujo si
    // el papel no da el largo.
    const real = r.cm || dib.largo || 0;
    const dibujado = !r.cm ? real : Math.min(r.cm, tramoMax, dib.largo || Infinity);
    const cortada = dibujado < real;
    const k = real ? dibujado / real : 1;
    const legs = (dib.codo || [[dib.ang ?? 0, real]]).map(([a, c]) => [dir(a), c * k * S]);
    const largo = dibujado * S;
    const pts = [[x, y]];
    for (const [dl, l] of legs) {
      const [px, py] = pts[pts.length - 1];
      pts.push([px + dl[0] * l, py + dl[1] * l]);
    }
    const [ex, ey] = pts[pts.length - 1];
    const d = legs[legs.length - 1][0];
    pts.forEach(([px, py]) => crece(px, py));
    // Punto a una fracción t del largo dibujado (hijos que salen a mitad).
    const enT = (t) => {
      let falta = largo * t;
      for (let i = 0; i < legs.length; i++) {
        const [dl, l] = legs[i];
        if (falta <= l || i === legs.length - 1) return [pts[i][0] + dl[0] * falta, pts[i][1] + dl[1] * falta];
        falta -= l;
      }
      return [ex, ey];
    };

    let g = "";
    if (largo > 0) {
      const poly = pts.map(([px, py]) => `${f(px)},${f(py)}`).join(" ");
      g += `<polyline points="${poly}" class="pl-rama${r.cm ? "" : " is-dib"}"/>`;
      g += `<polyline points="${poly}" class="pl-toque"/>`;
      if (cortada) {
        hayCortes = true;
        const [cx, cy] = enT(0.32);
        g += corte(cx, cy, legs[0][0]);
      }
      // Una rama que termina en algo lleva su medida sobre la línea.
      if (r.cm && !r.esEmpalme) g += cotaEnLinea(pts[0], pts[pts.length - 1], r);
      // Cota de los empalmes (ramas comunes); va en el tramo más largo.
      if (r.cm && r.esEmpalme) {
        let i = 0;
        legs.forEach(([, l], j) => { if (l > legs[i][1]) i = j; });
        // En una rama cortada la cota va hacia la punta, lejos de los «···».
        g += cota(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r.cm, "pl-cota", "der", cortada ? 0.72 : 0.62);
      }
    }
    if (r.esEmpalme) {
      g += `<circle cx="${f(ex)}" cy="${f(ey)}" r="5" class="pl-union"/>`;
    } else if (r.cables.length) {
      g += abanico(ex, ey, d, r.cables);
      g += rotulo(ex, ey, d, r);
    } else {
      g += pieza(ex, ey, d, r.conector, r.cantidad);
      g += rotulo(ex, ey, d, r);
    }
    out.trazos.push(`<g class="pl-g" data-rama="${esc_(r.id)}">${g}</g>`);

    // Las ramas que lleva se separan en su nodo, al final.
    for (const h of r.nodo?.ramas || []) rama(ex, ey, h);
  };

  // Conector principal, con la marca INVERTIDO encima: es el error que
  // más cuesta (el ramal entero queda al revés).
  const con = `<g class="pl-g" data-rama="conector">${PRINCIPAL.svg()}</g>`;
  crece(PRINCIPAL.caja[0], PRINCIPAL.caja[1]); crece(PRINCIPAL.caja[2], PRINCIPAL.caja[3]);
  let conTxt = texto(PRINCIPAL.caja[2] + 10, -24, "Conector", "pl-nom", "start");
  if (p.conector.invertido) {
    const avisoTxt = "INVERTIDO · 4 puntos abajo";
    const aw = anchoTxt(avisoTxt, FS - 3) + 22, acx = -37, ay = -102;
    crece(acx - aw / 2, ay); crece(acx + aw / 2, ay + 28);
    conTxt +=
      `<rect x="${f(acx - aw / 2)}" y="${ay}" width="${f(aw)}" height="28" rx="14" class="pl-aviso"/>` +
      `<text x="${acx}" y="${ay + 19}" text-anchor="middle" font-size="${FS - 3}" class="pl-avisoT">${avisoTxt}</text>` +
      `<path d="M${acx} ${ay + 28}v${PRINCIPAL.caja[1] - ay - 28}" class="pl-avisoL"/>`;
  }

  // ── Tronco: una sola línea gruesa (3–4 veces una rama), porque lleva a
  // todas las ramas juntas desde el conector. Al tocar una rama se pinta,
  // por dentro del tronco, una línea delgada de su color desde el conector
  // hasta su nodo: así se ve que esa rama es una fracción del tronco.
  //
  // Centro del tronco: un punto por nodo. Cada sección puede llevar su
  // ángulo (`dibujo.ang`, 90 = abajo) y todas se estiran `escalaTronco`
  // para dar aire entre nodos.
  const escT = p.dibujo.escalaTronco || 1;
  const secs = p.tronco.secciones;
  const P = [[0, 0]];
  const D = [];
  for (const sec of secs) {
    const dd = dir(sec.dibujo.ang ?? 90);
    const l = (sec.dibujo.largo ?? sec.cm) * S * escT;
    const [px, py] = P[P.length - 1];
    P.push([px + dd[0] * l, py + dd[1] * l]);
    D.push(dd);
    crece(px + dd[0] * l, py + dd[1] * l);
  }
  // Puntos del tronco desde el conector hasta el nodo de la sección k.
  const hastaNodo = (k) => P.slice(0, k + 2).map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
  out.tronco.push(`<polyline points="${hastaNodo(secs.length - 1)}" class="pl-tronco"/>`);

  secs.forEach((sec, k) => {
    const [x0, y0] = P[k], [x1, y1] = P[k + 1];
    // Medida de la sección a la derecha del tronco (pasado su grosor). En
    // un tramo en diagonal, hacia afuera de la curva, también pasado el grosor.
    if (Math.abs(D[k][1]) > 0.9) {
      out.textos.push(cota(x0 + MEDIO_TRONCO, y0, x1 + MEDIO_TRONCO, y1, sec.cm, "pl-cota pl-cota--tronco", "der"));
    } else {
      const m = medidaPartes_(sec.cm, ref);
      const fuera = [D[k][1], -D[k][0]]; // perpendicular, hacia arriba/derecha
      const qx = (x0 + x1) / 2 + fuera[0] * (MEDIO_TRONCO + 12), qy = (y0 + y1) / 2 + fuera[1] * (MEDIO_TRONCO + 12);
      out.textos.push(texto(qx, qy - 2, m.principal, "pl-std", "start", FS - 1));
      if (m.aclaracion) out.textos.push(texto(qx, qy + FS - 4, `(${m.aclaracion})`, "pl-acl", "start", FS - 5));
    }
    // El nodo va con el tronco, debajo del camino resaltado (no lo corta).
    if (!sec.esUltima) out.tronco.push(`<circle cx="${f(x1)}" cy="${f(y1)}" r="7" class="pl-nodo"/>`);
    for (const r of sec.nodo.ramas) {
      out.caminos.push(`<polyline points="${hastaNodo(k)}" class="pl-camino" data-carril="${esc_(r.id)}"/>`);
      rama(x1, y1, r);
    }
  });

  const pad = 8;
  const vb = [caja.x0 - pad, caja.y0 - pad, caja.x1 - caja.x0 + pad * 2, caja.y1 - caja.y0 + pad * 2].map(f);

  const svg = `
    <svg class="pl-svg" viewBox="${vb.join(" ")}" width="${vb[2]}" role="img"
         style="--plw:${f(vb[2] * ZOOM)}px" data-x0="${vb[0]}" data-w="${vb[2]}"
         aria-label="Dibujo del ramal ${esc_(p.modelo)}">
      ${out.tronco.join("")}
      ${out.caminos.join("")}
      ${out.trazos.join("")}
      ${con}${conTxt}
      ${out.marcas.join("")}
      ${out.textos.join("")}
    </svg>`;
  return { svg, hayCortes };
}

// ── Posición de tendido: todos los cables juntos, colgando del conector ──
// Es la posición 0: nada armado todavía. Cada rama ya cortada a su largo
// desde el conector y todas juntas, en un manojo vertical. Sin medidas ni
// nodos (eso llega en las posiciones siguientes): solo dónde termina cada
// cable y qué lleva en la punta. Tocar un cable abre su ficha.
const S_TENDIDO = 3;      // px de dibujo por cm
const PASO_TENDIDO = 15;  // separación entre cables del manojo
const ABANICO_T = 28;     // alto en que los cables salen del conector y se juntan
const ESC_PUNTA_T = 0.55; // piezas de la punta chicas: el manojo es angosto
const SEP_NOMBRES = 24;   // separación mínima entre nombres del mismo lado

function tendidoSVG_(p, ref, paso) {
  const ramas = paso.ramasTendidas;
  const n = ramas.length;
  const f = (v) => Math.round(v * 10) / 10;
  const caja = { x0: PRINCIPAL.caja[0], y0: PRINCIPAL.caja[1], x1: PRINCIPAL.caja[2] + 150, y1: 0 };
  const crece = (x, y) => {
    caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x);
    caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y);
  };
  const ancho = ((n - 1) / 2) * PASO_TENDIDO;

  const cables = ramas.map((r, i) => {
    const x = (i - (n - 1) / 2) * PASO_TENDIDO;
    // Largo conocido desde el conector; si el papel no da la punta, va punteada.
    const conocido = r.hastaPunta ?? r.sale ?? 0;
    const resto = r.hastaPunta == null ? r.dibujo.largo || 8 : 0;
    const y1 = ABANICO_T + conocido * S_TENDIDO, y2 = y1 + resto * S_TENDIDO;
    let g = `<polyline points="${f(x * 0.25)},2 ${f(x)},${ABANICO_T} ${f(x)},${f(y1)}" class="pl-cableT"/>`;
    if (resto) g += `<line x1="${f(x)}" y1="${f(y1)}" x2="${f(x)}" y2="${f(y2)}" class="pl-cableT is-dib"/>`;
    g += `<polyline points="${f(x * 0.25)},2 ${f(x)},${ABANICO_T} ${f(x)},${f(y2)}" class="pl-toque"/>`;
    let fin = y2;
    if (r.conector && PIEZAS[r.conector]) {
      g += `<g transform="translate(${f(x)} ${f(y2)}) rotate(90) scale(${ESC_PUNTA_T})">${PIEZAS[r.conector].svg()}</g>`;
      fin += PIEZAS[r.conector].caja[2] * ESC_PUNTA_T;
    } else if (r.cables.length) {
      const k = r.cables.length;
      r.cables.forEach((c, j) => {
        const dx = k === 1 ? 0 : (j - (k - 1) / 2) * 4;
        const col = CABLE[c]?.c || RAYAS[c]?.rayas?.[1] || RAYAS[c]?.linea?.[0] || "#888";
        g += `<line x1="${f(x)}" y1="${f(y2)}" x2="${f(x + dx)}" y2="${f(y2 + 14)}" class="pl-cable" stroke="${col}"/>`;
      });
      fin += 14;
    }
    crece(x - 12, fin + 4);
    return { r, x, g, y: (y2 + fin) / 2 };
  });

  // Nombres a los costados del manojo, del mismo lado al que sale la rama
  // en el ramal armado, con una guía fina hasta su punta y sin pisarse.
  const ladoDe = (r) => {
    let top = r;
    while (top.padre) top = top.padre;
    return Math.cos(((top.dibujo.ang ?? 90) * Math.PI) / 180) < -0.1 ? "izq" : "der";
  };
  for (const lado of ["izq", "der"]) {
    const deLado = cables.filter((c) => ladoDe(c.r) === lado).sort((a, b) => a.y - b.y);
    let antes = -Infinity;
    for (const c of deLado) {
      const y = Math.max(c.y, antes + SEP_NOMBRES);
      antes = y;
      const xl = lado === "izq" ? -ancho - 26 : ancho + 26;
      const nom = `${c.r.corto || c.r.nombre}${c.r.cantidad > 1 ? ` ×${c.r.cantidad}` : ""}`;
      c.g += `<path d="M${f(c.x)} ${f(c.y)} L${f(xl + (lado === "izq" ? 4 : -4))} ${f(y)}" class="pl-guiaT"/>`;
      c.g += `<text x="${f(xl)}" y="${f(y + 6)}" text-anchor="${lado === "izq" ? "end" : "start"}" font-size="18" class="pl-nom">${esc_(nom)}</text>`;
      const w = nom.length * 18 * TXT_W;
      crece(lado === "izq" ? xl - w : xl + w, y + 8);
    }
  }

  const con = `<g class="pl-g" data-rama="conector">${PRINCIPAL.svg(!paso.conectorInvertido)}</g>` +
    `<text x="${PRINCIPAL.caja[2] + 10}" y="-26" font-size="${FS}" class="pl-nom">Conector</text>` +
    `<text x="${PRINCIPAL.caja[2] + 10}" y="-4" font-size="${FS - 5}" class="pl-acl">${paso.conectorInvertido ? "invertido · puntos abajo" : "normal · puntos arriba"}</text>`;
  const pad = 10;
  const vb = [caja.x0 - pad, caja.y0 - pad, caja.x1 - caja.x0 + pad * 2, caja.y1 - caja.y0 + pad * 2].map(f);
  return `
    <svg class="pl-svg" viewBox="${vb.join(" ")}" width="${vb[2]}" role="img"
         style="--plw:${f(vb[2] * ZOOM)}px" data-x0="${vb[0]}" data-w="${vb[2]}"
         aria-label="Ramal ${esc_(p.modelo)}: ${esc_(paso.titulo)}">
      ${cables.map((c) => `<g class="pl-g" data-rama="${esc_(c.r.id)}">${c.g}</g>`).join("")}${con}
    </svg>`;
}


// Selector de pasos de la guía: ‹ Posición 0 … Final ›.
function guiaHTML_(p, paso) {
  const total = p.guia.pasos.length;
  if (total < 2) return "";
  const puntos = p.guia.pasos
    .map((x) => `<button type="button" class="plano__guiaPunto${x === paso ? " is-on" : ""}" data-guia-ir="${x.n}" aria-label="${esc_(x.titulo)}"></button>`)
    .join("");
  return `
    <div class="plano__guia">
      <button type="button" class="plano__guiaBtn" data-guia-ir="${paso.n - 1}" ${paso.n === 0 ? "disabled" : ""} aria-label="Paso anterior">‹</button>
      <div class="plano__guiaTxt">
        <b>${esc_(paso.titulo)}</b>
        <div class="plano__guiaPuntos">${puntos}</div>
      </div>
      <button type="button" class="plano__guiaBtn" data-guia-ir="${paso.n + 1}" ${paso.esUltimo ? "disabled" : ""} aria-label="Paso siguiente">›</button>
    </div>
    ${paso.texto ? `<p class="plano__guiaDesc">${esc_(paso.texto)}</p>` : ""}`;
}

// ── Sección «Conectores»: cada pieza en grande, con cómo va ────────────
function conectoresHTML_(p) {
  const fichas = [];
  const c = p.conector;
  fichas.push(`
    <div class="plano__con plano__con--principal" data-rama="conector">
      ${miniPiezaSVG_("principal")}
      <div>
        <div class="plano__conNom">Conector principal${c.invertido ? ` <span class="plano__conTag">INVERTIDO</span>` : ""}</div>
        ${obs_(c.observaciones)}
        <div class="plano__det">Bloque grande a la izquierda y el sello rojo a su derecha.</div>
      </div>
    </div>`);
  for (const r of p.ramas()) {
    if (!r.conector) continue;
    fichas.push(`
      <div class="plano__con" data-rama="${esc_(r.id)}">
        ${miniPiezaSVG_(r.conector)}
        <div class="plano__conNom">${esc_(r.nombre)}${r.cantidad > 1 ? ` ×${r.cantidad}` : ""}</div>
        ${obs_(r.observaciones)}
      </div>`);
  }
  return `
      <div class="plano__secHead plano__secHead--lista">
        <span class="plano__secT">Conectores</span>
      </div>
      <div class="plano__cons">${fichas.join("")}</div>`;
}

// ── Lista paso a paso ──────────────────────────────────────────────────
function tarjeta_(r, ref) {
  return `
    <div class="plano__salida" data-rama="${esc_(r.id)}">
      <div class="plano__salidaHead">
        <span class="plano__salidaNom">${esc_(r.nombre)}</span>
      </div>
      ${r.largo ? `<div class="plano__largo">${largoHTML_(r, ref)}</div>` : ""}
      ${desdeConectorHTML_(r)}
      ${obs_(r.observaciones)}
      ${pasosHTML_(r)}
      ${cablesHTML_(r.cables)}
    </div>`;
}

function listaHTML_(p, ref) {
  // Los empalmes no son destino: se listan sus puntas (aunque estén
  // anidados, como RPM/EMUL dentro del haz) y su explicación como nota.
  const notasDe = (r) =>
    r.esEmpalme
      ? [`<b>${esc_(r.nombre)}</b> (${medidaHTML_(r.cm, ref)}). ${r.observaciones.map(esc_).join(" ")}`, ...r.nodo.ramas.flatMap(notasDe)]
      : [];
  const filas = p.tronco.secciones
    .map(
      (sec) => `
      <div class="plano__tramo">
        <div class="plano__eje"></div>
        <div class="plano__tramoTxt">${medidaHTML_(sec.cm, ref)}${obs_(sec.observaciones)}</div>
      </div>
      <div class="plano__parada${sec.esUltima ? " is-fin" : ""}">
        <div class="plano__acum">${cm_(sec.hasta)}</div>
        <div class="plano__nodo"></div>
        <div class="plano__salidas">
          ${sec.nodo.observaciones.map((o) => `<div class="plano__nota">${esc_(o)}</div>`).join("")}
          ${sec.nodo.ramas.flatMap(notasDe).map((n) => `<div class="plano__nota">${n}</div>`).join("")}
          ${sec.nodo.ramas.flatMap((r) => r.puntas).map((r) => tarjeta_(r, ref)).join("")}
        </div>
      </div>`
    )
    .join("");

  return `
      <div class="plano__parada is-ini">
        <div class="plano__acum">0</div>
        <div class="plano__nodo plano__nodo--con"></div>
        <div class="plano__salidas"><div class="plano__salida plano__salida--con" data-rama="conector">
          <span class="plano__salidaNom">Conector principal</span>
          ${p.conector.invertido ? `<span class="plano__det"><b>invertido</b> · ${p.conector.observaciones.map(esc_).join(" ")}</span>` : ""}
        </div></div>
      </div>
      ${filas}
      <div class="plano__total">Tronco total: <b>${cm_(p.tronco.largo)}</b></div>`;
}

export function planoHTML_(p, ref = refCargar_(p), paso = p.guia.final) {
  const tendido = paso.vista === "tendido";
  const { svg, hayCortes } = tendido ? { svg: tendidoSVG_(p, ref, paso), hayCortes: false } : dibujoSVG_(p, ref);
  // La nota del conector invertido es del ramal armado: en la posición 0
  // el conector va normal y la nota confundiría.
  const notas = tendido ? p.observaciones : [
    ...(p.conector.invertido ? [`Conector INVERTIDO: ${p.conector.observaciones.join(" ")}`] : []),
    ...p.observaciones,
  ];
  return `
    <div class="plano" data-plano-id="${esc_(p.id)}">
      ${notas.length ? `<ul class="plano__notas">${notas.map((n) => `<li>${esc_(n)}</li>`).join("")}</ul>` : ""}
      ${cintaHTML_(p)}

      <div class="plano__secHead">
        <span class="plano__secT">Dibujo</span>
        <button type="button" class="plano__zoom" data-plano-zoom aria-pressed="true">Ver todo</button>
      </div>
      ${guiaHTML_(p, paso)}
      <div class="plano__lienzo is-zoom" id="planoLienzo">${svg}</div>
      <div class="plano__ley">
        ${tendido ? `<span>Cada cable cortado a su largo desde el conector. Toca uno para ver su medida.</span>` : `<span><i class="plano__leyL"></i> largo medido</span>`}
        <span><i class="plano__leyL is-dib"></i> largo no indicado en el plano</span>
        ${hayCortes ? `<span><b class="plano__leyCorte">···</b> sigue: tramo largo dibujado más corto (vale su cota)</span>` : ""}
        ${tendido ? "" : `<span><b class="plano__std">1/4</b> medida del taller · <span class="plano__acl">(20 cm)</span> aclaración</span>`}
      </div>

      <div class="plano__ficha" id="planoFicha" aria-live="polite">
        <span class="plano__fichaVacia">Toca una rama o un conector para ver su medida y sus cables.</span>
      </div>

      ${referenciaHTML_(p, ref)}

      ${conectoresHTML_(p)}

      <div class="plano__secHead plano__secHead--lista">
        <span class="plano__secT">Recorrido paso a paso</span>
      </div>
      <div class="plano__ley">
        <span>Izquierda: distancia desde el conector</span>
      </div>
      ${listaHTML_(p, ref)}
    </div>`;
}

// ── Selección: tocar el dibujo, una ficha o la lista marca lo mismo ────
function seleccionar_(root, id, desdeAbajo) {
  const p = PLANOS.find((x) => x.id === root.dataset.planoId);
  if (!p) return;
  const ref = refCargar_(p);

  const svg = root.querySelector(".pl-svg");
  svg?.classList.add("has-sel");
  svg?.querySelectorAll(".pl-g").forEach((g) => g.classList.toggle("is-sel", g.dataset.rama === id));

  // El camino de sus cables hasta el conector: toda rama nace ahí. Se
  // resaltan las ramas que la llevan (la chapa va dentro de la de 1.29 m)
  // y, por dentro del tronco, su camino hasta el conector.
  const camino = new Set(["conector"]);
  let carril = null;
  const r0 = id === "conector" ? null : p.buscar(id);
  if (r0) {
    let top = r0;
    for (let a = r0.padre; a; a = a.padre) { camino.add(a.id); top = a; }
    carril = top.id;
  }
  svg?.querySelectorAll(".pl-g").forEach((g) => g.classList.toggle("is-camino", g.dataset.rama !== id && camino.has(g.dataset.rama)));
  svg?.querySelectorAll(".pl-camino").forEach((l) => l.classList.toggle("is-camino", l.dataset.carril === carril));

  const ficha = root.querySelector("#planoFicha");
  if (id === "conector") {
    const c = p.conector;
    ficha.innerHTML = `
      <div class="plano__salidaHead"><span class="plano__salidaNom">Conector principal</span></div>
      ${c.invertido ? `<div class="plano__det"><b>Va invertido:</b> ${c.observaciones.map(esc_).join(" ")}</div>` : obs_(c.observaciones)}
      <div class="plano__det">De aquí se mide todo el tronco.</div>`;
  } else {
    const r = p.buscar(id);
    if (!r) return;
    const desde = r.padre
      ? `Sale del nodo de la ${r.padre.nombre.toLowerCase()}`
      : `Sale del tronco a ${cm_(r.sale)} del conector`;
    ficha.innerHTML = `
      <div class="plano__salidaHead">
        <span class="plano__salidaNom">${esc_(r.nombre)}</span>
      </div>
      <div class="plano__largo">${largoHTML_(r, ref)}</div>
      ${desdeConectorHTML_(r)}
      <div class="plano__det">${esc_(desde)}</div>
      ${pasosHTML_(r)}
      ${obs_(r.observaciones)}
      ${cablesHTML_(r.cables)}`;
  }
  ficha.classList.add("is-on");

  if (desdeAbajo) root.querySelector("#planoLienzo")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Modal ──────────────────────────────────────────────────────────────
let modal_ = null;
let abierto_ = null;
let pasoActual_ = 0; // índice del paso de la guía que se está viendo

function planoAbierto_() {
  return PLANOS.find((x) => x.id === abierto_);
}

function ensureModal_() {
  if (modal_) return modal_;
  modal_ = document.createElement("div");
  modal_.id = "planoModal";
  modal_.className = "modal planoModal";
  modal_.setAttribute("aria-hidden", "true");
  modal_.innerHTML = `
    <div class="modalBox" role="dialog" aria-modal="true" aria-labelledby="planoModalTitle">
      <div class="modalHead">
        <div class="modalTitle" id="planoModalTitle"></div>
        <button type="button" data-plano-cerrar title="Cerrar">✕</button>
      </div>
      <div class="modalBody" id="planoModalBody"></div>
    </div>`;
  document.body.appendChild(modal_);

  modal_.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t === modal_ || t.closest("[data-plano-cerrar]")) return cerrarPlano_();
    const root = t.closest(".plano");
    if (!root) return;

    const ir = t.closest("[data-guia-ir]");
    if (ir && !ir.disabled) {
      const p = planoAbierto_();
      const n = Number(ir.dataset.guiaIr);
      if (p && n >= 0 && n < p.guia.pasos.length) {
        pasoActual_ = n;
        // Otro paso es otro dibujo: se vuelve a centrar.
        const body = modal_.querySelector("#planoModalBody");
        body.querySelector("#planoLienzo")?.remove();
        pintarPlano_();
      }
      return;
    }
    if (t.closest("[data-ref-papel]")) {
      refBorrar_(planoAbierto_());
      return pintarPlano_("Volvieron las medidas del papel.");
    }
    const zoom = t.closest("[data-plano-zoom]");
    if (zoom) {
      const on = root.querySelector("#planoLienzo").classList.toggle("is-zoom");
      marcarZoom_(root, on);
      if (on) centrarLienzo_(root);
      return;
    }
    const sel = t.closest("[data-rama]");
    if (sel) seleccionar_(root, sel.dataset.rama, !sel.closest(".pl-svg"));
  });

  // La referencia se guarda sola al salir del campo (o con «listo» en el
  // teclado del celular): no hay botón que olvidar.
  modal_.addEventListener("change", (ev) => {
    const inp = ev.target.closest?.("[data-ref-cm]");
    if (!inp) return;
    const ok = refGuardar_(planoAbierto_(), inp.dataset.refCm, inp.value.trim());
    pintarPlano_(ok ? `Guardado: ${cm_(Number(inp.dataset.refCm))} = ${inp.value.trim() || "(vacío)"}` : "Este celular no deja guardar. Revisa que no estés en modo incógnito.");
  });
  modal_.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.matches?.("[data-ref-cm]")) ev.target.blur();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal_.classList.contains("show")) cerrarPlano_();
  });
  return modal_;
}

function marcarZoom_(root, on) {
  const b = root.querySelector("[data-plano-zoom]");
  if (!b) return;
  b.textContent = on ? "Ver todo" : "Ampliar";
  b.setAttribute("aria-pressed", String(on));
}

// Ampliado, deja a la vista el tronco y lo que sale a su izquierda (el
// conmutador y el haz de sensores), que es donde está lo enredado.
function centrarLienzo_(root) {
  const lz = root.querySelector("#planoLienzo");
  const svg = lz?.querySelector(".pl-svg");
  if (!svg || !lz.clientWidth) return;
  const x0 = Number(svg.dataset.x0), w = Number(svg.dataset.w);
  const tronco = ((0 - x0) / w) * svg.clientWidth;
  lz.scrollLeft = Math.max(0, tronco - lz.clientWidth * 0.55);
}

// Repinta el plano abierto sin moverlo de donde estaba leyendo (ni el
// scroll de la página ni el del dibujo, ni si estaba ampliado).
function pintarPlano_(msg = "", arriba = false) {
  const p = planoAbierto_();
  if (!p) return;
  const body = ensureModal_().querySelector("#planoModalBody");
  const scroll = body.scrollTop;
  const viejo = body.querySelector("#planoLienzo");
  const zoom = viejo ? viejo.classList.contains("is-zoom") : true;
  const sl = viejo?.scrollLeft;
  body.innerHTML = planoHTML_(p, refCargar_(p), p.guia.pasos[pasoActual_] || p.guia.final);
  body.scrollTop = arriba ? 0 : scroll;
  const root = body.querySelector(".plano");
  const lz = body.querySelector("#planoLienzo");
  lz.classList.toggle("is-zoom", zoom);
  marcarZoom_(root, zoom);
  if (viejo) lz.scrollLeft = sl;
  else requestAnimationFrame(() => centrarLienzo_(root));
  if (msg) body.querySelector(".plano__refMsg").textContent = msg;
}

function abrirPlano_(id) {
  const p = PLANOS.find((x) => x.id === id);
  if (!p) return;
  abierto_ = id;
  pasoActual_ = p.guia.pasos.length - 1; // abre en el ramal armado
  const m = ensureModal_();
  m.querySelector("#planoModalTitle").textContent = `Plano · ${p.modelo}`;
  m.querySelector("#planoModalBody").innerHTML = "";
  pintarPlano_("", true);
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => centrarLienzo_(m.querySelector(".plano")));
}

function cerrarPlano_() {
  if (!modal_) return;
  modal_.classList.remove("show");
  modal_.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function planosListaHTML() {
  return PLANOS.map(
    (p) => `
    <button type="button" class="planoBtn" data-plano="${esc_(p.id)}">
      <span class="planoBtn__t">${esc_(p.modelo)}</span>
      <span class="planoBtn__a">Ver plano ›</span>
    </button>`
  ).join("");
}

let bound_ = false;
export function initPlanos_() {
  const box = document.getElementById("planosBoxR");
  if (box && !box.childElementCount) box.innerHTML = planosListaHTML();
  if (bound_) return;
  bound_ = true;
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest?.("[data-plano]");
    if (b) abrirPlano_(b.dataset.plano);
  });
}
