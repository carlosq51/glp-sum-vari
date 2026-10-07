// =========================
// public/js/views/ramalero/planos.js
// Planos de armado de ramales, para quien recién empieza o duda de una
// medida. Digitalizados del dibujo en papel que hicieron los técnicos.
//
// DOS LECTURAS DEL MISMO PLANO
// ────────────────────────────
// 1. El DIBUJO A ESCALA: como el papel. Tronco vertical desde el conector y
//    cada rama saliendo con su largo real y hacia su lado. Sirve para ver la
//    forma del ramal de un vistazo. Tocar una rama muestra su ficha.
// 2. El RECORRIDO PASO A PASO: la lista parada por parada, con la distancia
//    desde el conector y los colores de cable. Sirve para armar midiendo.
//
// Todo sale de los mismos datos (PLANOS), así que no se pueden contradecir.
//
// GEOMETRÍA
// ─────────
// Coordenadas en centímetros: el conector en (0,0) y el tronco bajando por
// y. Cada rama dice su ángulo (0 = derecha, 90 = abajo, 180 = izquierda) y
// su largo. Si el papel no da el largo, la rama lleva `dib` (largo solo de
// dibujo) y se pinta punteada: así nadie toma por medida lo que no lo es.
//
// Las medidas se dejan como las dicen en el taller («1/4» = una cuarta, un
// palmo) y al lado los centímetros, para el nuevo que todavía no tiene la
// mano calibrada.
//
// Agregar un modelo = agregar un objeto a PLANOS. No hay nada en la base.
// =========================

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
};

// Una parada es un punto del tronco. `tramo` es lo que se mide sobre el
// tronco ANTES de llegar a ella.
//
// Una rama:
//   id, nombre, detalle?, cables?
//   ang            dirección en grados (ver GEOMETRÍA)
//   cm, medida     largo real y cómo lo dicen en el taller
//   dib            largo solo de dibujo cuando el papel no lo da
//   grupo: true    rama común que al final se abre en `hijos`; no es un
//                  destino, es el haz que se separa después
//   hijos          ramas que salen de esta; `en` (0–1) dice en qué punto
//                  del largo salen (1 = al final, que es lo normal)
//   abanico        ángulos de los cables sueltos al final (cables de tanque)
const PLANOS = [
  {
    id: "kyc-x3-x5",
    titulo: "KYC X3 / X5",
    notas: [
      "Conector invertido: los 4 puntos van hacia la parte inferior.",
      "Forrar con cinta plástica.",
    ],
    paradas: [
      {
        tramo: { medida: "1/4", cm: 20 },
        ramas: [{ id: "interface", nombre: "Interface", ang: 0, dib: 14 }],
      },
      {
        tramo: { medida: "2/4 + 1 pulgar", cm: 35 },
        ramas: [
          {
            id: "conmutador",
            nombre: "Conmutador",
            // 1.29 m: sale a la izquierda y baja en paralelo al tronco.
            codo: [[180, 35], [90, 94]],
            cota: true,
            cm: 129,
            medida: "6/4 + 1 puño",
            cables: ["negro", "blancoVerde", "rojo"],
            hijos: [
              {
                id: "chapa",
                nombre: "Cable con chapa",
                corto: "Chapa",
                detalle: "Un solo cable. Sale del mismo tramo de 1.29 m que va al conmutador.",
                ang: 180,
                dib: 6,
                en: 0.4,
                lado: "arriba",
                cables: ["rojo", "negro"],
              },
            ],
          },
        ],
      },
      {
        tramo: { medida: "1/4 + 1 puño", cm: 29 },
        ramas: [
          {
            id: "haz-sensores",
            nombre: "Haz de 26 cm",
            detalle: "Sale un haz de 1/4 (26 cm). INY y MAP terminan ahí; RPM y EMUL. siguen 20 cm más.",
            grupo: true,
            ang: 0,
            cm: 26,
            medida: "1/4",
            hijos: [
              { id: "iny", nombre: "INY", detalle: "Inyectores de la bobina", ang: -90, dib: 4 },
              { id: "map", nombre: "MAP", ang: 90, dib: 4 },
              { id: "rpm", nombre: "RPM", codo: [[0, 4], [-90, 4], [0, 12]], cm: 20, cables: ["marron"] },
              { id: "emul", nombre: "EMUL.", codo: [[0, 4], [90, 4], [0, 12]], cm: 20, cables: ["multicolor"] },
            ],
          },
        ],
      },
      {
        tramo: { medida: "1/4", cm: 20 },
        ramas: [
          {
            id: "rama-ev-temp",
            nombre: "Rama de 20 cm",
            detalle: "Sale una rama de 1/4 (20 cm) que al final se abre en dos.",
            grupo: true,
            ang: 0,
            cm: 20,
            medida: "1/4",
            hijos: [
              { id: "electrovalvula", nombre: "Electroválvula", ang: 0, dib: 8, cables: ["azul", "negro"] },
              { id: "temperatura", nombre: "Temperatura", codo: [[90, 9], [0, 6]], dib: 15, cables: ["anaranjado", "negro"] },
            ],
          },
        ],
      },
      {
        tramo: { medida: "1/4", cm: 20 },
        ramas: [{ id: "alimentacion", nombre: "Alimentación", ang: 0, dib: 12, cables: ["rojo", "negro"] }],
      },
      {
        tramo: { medida: "1/4", cm: 20 },
        fin: true,
        ramas: [
          {
            id: "tanque",
            nombre: "Cables de tanque",
            ang: 90,
            dib: 3,
            lado: "der",
            cables: ["azul", "verde", "marron"],
          },
        ],
      },
    ],
  },
];

const esc_ = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function cm_(cm) {
  return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm} cm`;
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

// ── Índice: cada rama con su largo total desde el tronco ───────────────
// Lo usan la lista y la ficha que se abre al tocar el dibujo, para que las
// dos digan exactamente lo mismo.
function indexar_(p) {
  const idx = new Map();
  let acum = 0;
  for (const st of p.paradas) {
    acum += st.tramo.cm;
    const walk = (r, base, padre) => {
      const total = base.cm + (r.cm || 0);
      const medida = [...base.medidas, r.medida || (r.cm ? cm_(r.cm) : "")].filter(Boolean);
      idx.set(r.id, { r, desde: acum, total, medida, padre, parcial: !r.cm && total > 0 });
      for (const h of r.hijos || []) {
        // Un hijo que sale a mitad de la rama (en < 1) no hereda su largo.
        const sigue = (h.en ?? 1) >= 1 && r.cm;
        walk(h, sigue ? { cm: total, medidas: medida } : { cm: 0, medidas: [] }, r);
      }
    };
    for (const r of st.ramas) walk(r, { cm: 0, medidas: [] }, null);
  }
  return idx;
}

function largoTxt_(it) {
  if (!it.total) return "largo no indicado";
  const cuartas = it.medida.length > 1 ? it.medida.join(" + ") : it.medida[0] || "";
  return `${cuartas ? `${cuartas} · ` : ""}${cm_(it.total)}${it.parcial ? " + punta" : ""}`;
}

// ── Dibujo a escala (SVG) ──────────────────────────────────────────────
// Estilo de plano de arnés, como lo bocetó el taller: tramos rectos con
// codos a 90°, el haz en línea gruesa, los conectores como cajitas y las
// puntas abiertas en sus cables de color.
const S = 4;        // px de dibujo por cm
const FS = 20;      // tamaño de letra en unidades del dibujo
const TXT_W = 0.6;  // ancho medio de un carácter, en FS
const COLA = 26;    // largo de dibujo de cada cable suelto en la punta

// Rayas de los cables bicolor / multicolor (en SVG no sirve un gradiente
// sobre una línea recta: su caja mide 0 de ancho).
const RAYAS = {
  blancoVerde: ["#f5f5f5", "#16a34a"],
  multicolor: ["#dc2626", "#facc15", "#16a34a", "#2563eb"],
};

function dibujoSVG_(p, idx) {
  const out = { trazos: [], marcas: [], textos: [] };
  const caja = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const crece = (x, y) => {
    caja.x0 = Math.min(caja.x0, x); caja.x1 = Math.max(caja.x1, x);
    caja.y0 = Math.min(caja.y0, y); caja.y1 = Math.max(caja.y1, y);
  };
  const dir = (ang) => [Math.cos((ang * Math.PI) / 180), Math.sin((ang * Math.PI) / 180)];
  const f = (n) => Math.round(n * 10) / 10;
  const anchoTxt = (s, fs = FS) => s.length * fs * TXT_W;

  // Texto con su caja aproximada, para que el viewBox no lo corte.
  // `extra` es un segundo texto más tenue en la misma línea (el largo).
  const texto = (x, y, s, cls, anchor = "middle", fs = FS, extra = "") => {
    const full = extra ? `${s}  ${extra}` : s;
    const w = anchoTxt(full, fs);
    const xa = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    crece(xa, y - fs); crece(xa + w, y + fs * 0.3);
    const tsp = extra ? `<tspan class="pl-cota" dx="6">${esc_(extra)}</tspan>` : "";
    return `<text x="${f(x)}" y="${f(y)}" class="${cls}" text-anchor="${anchor}" font-size="${fs}">${esc_(s)}${tsp}</text>`;
  };

  // Un cable de color, con rayas si es bicolor.
  const cable = (x1, y1, x2, y2, key) => {
    const at = `x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"`;
    // Contorno debajo: sin él, el cable negro desaparece en el tema noche.
    const fondo = `<line ${at} class="pl-cable-fondo"/>`;
    const rayas = RAYAS[key];
    if (!rayas) return fondo + `<line ${at} class="pl-cable" stroke="${CABLE[key]?.c || "currentColor"}"/>`;
    const n = rayas.length, paso = 4;
    return fondo + rayas
      .map((c, i) =>
        i === 0
          ? `<line ${at} class="pl-cable" stroke="${c}"/>`
          : `<line ${at} class="pl-cable pl-cable--raya" stroke="${c}" stroke-dasharray="${paso} ${paso * (n - 1)}" stroke-dashoffset="${-paso * i}"/>`
      )
      .join("");
  };

  // Las puntas de la rama: los cables abiertos en abanico hacia donde
  // apunta el último tramo. Devuelve el SVG y hasta dónde llegan.
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

  // Conector: cajita perpendicular a la punta.
  const conector = (x, y, d) => {
    const horiz = Math.abs(d[0]) >= Math.abs(d[1]);
    const w = horiz ? 10 : 16, h = horiz ? 16 : 10;
    const cx = x + d[0] * (horiz ? w / 2 : h / 2), cy = y + d[1] * (horiz ? w / 2 : h / 2);
    crece(cx - w / 2, cy - h / 2); crece(cx + w / 2, cy + h / 2);
    return `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${w}" height="${h}" rx="2" class="pl-caja"/>`;
  };

  // Nombre (y largo total, si se conoce) junto a la punta.
  const rotulo = (x, y, d, r, conCables) => {
    const it = idx.get(r.id);
    const largo = it && it.total && !it.parcial && !r.cota ? cm_(it.total) : "";
    const lejos = conCables ? COLA + 6 : 16;
    let lado = r.lado;
    if (!lado) lado = d[0] > 0.5 ? "der" : d[0] < -0.5 ? "izq" : d[1] < 0 ? "arriba" : "abajo";
    const nom = r.corto || r.nombre;
    if (lado === "der") return texto(x + lejos, y + 4, nom, "pl-nom", "start", FS, largo);
    if (lado === "izq") return texto(x - lejos, y + 4, nom, "pl-nom", "end", FS, largo);
    if (lado === "arriba") return texto(x + d[0] * lejos * 0.6, y - lejos + 2, nom, "pl-nom", "middle", FS, largo);
    return texto(x, y + lejos + FS, nom, "pl-nom", "middle", FS, largo);
  };

  // Largo escrito a media rama: encima si el tramo es horizontal, al lado
  // si es vertical.
  const cota = (ax, ay, bx, by, s) => {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (Math.abs(bx - ax) < Math.abs(by - ay)) return texto(mx + 8, my + 4, s, "pl-cota", "start", FS - 1);
    return texto(mx, my - 8, s, "pl-cota", "middle", FS - 1);
  };

  const rama = (x, y, r) => {
    const largo = (r.cm ?? r.dib ?? 0) * S;
    // Tramos del trazo: uno recto, o los de `codo` (el largo total es el
    // mismo; el codo solo evita que las ramas se crucen).
    const legs = (r.codo || [[r.ang, r.cm ?? r.dib ?? 0]]).map(([a, c]) => [dir(a), c * S]);
    const pts = [[x, y]];
    for (const [dl, l] of legs) {
      const [px, py] = pts[pts.length - 1];
      pts.push([px + dl[0] * l, py + dl[1] * l]);
    }
    const [ex, ey] = pts[pts.length - 1];
    const d = legs[legs.length - 1][0];
    pts.forEach(([px, py]) => crece(px, py));
    // Punto a una fracción t del largo total (para hijos que salen a mitad).
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
      // Cota solo en las ramas comunes (el haz, la rama que se abre en dos)
      // y en las que la piden (`cota`); los demás destinos llevan su largo
      // total junto al nombre.
      if (r.cm && (r.grupo || r.cota)) {
        let i = 0;
        legs.forEach(([, l], k) => { if (l > legs[i][1]) i = k; });
        g += cota(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], cm_(r.cm));
      }
    }
    if (r.grupo) {
      g += `<circle cx="${f(ex)}" cy="${f(ey)}" r="4" class="pl-union"/>`;
    } else if (r.cables?.length) {
      g += abanico(ex, ey, d, r.cables);
      g += rotulo(ex, ey, d, r, true);
    } else {
      g += conector(ex, ey, d);
      g += rotulo(ex, ey, d, r, false);
    }
    out.trazos.push(`<g class="pl-g" data-rama="${esc_(r.id)}">${g}</g>`);

    for (const h of r.hijos || []) {
      const t = h.en ?? 1;
      const [hx, hy] = enT(t);
      if (t < 1) out.marcas.push(`<circle cx="${f(hx)}" cy="${f(hy)}" r="4" class="pl-union"/>`);
      rama(hx, hy, h);
    }
  };

  // Tronco
  let y = 0;
  const con = `<rect x="-22" y="-24" width="44" height="24" rx="3" class="pl-caja pl-caja--con"/>`;
  crece(-22, -24);
  const conTxt = texto(30, -8, "Conector", "pl-nom", "start");
  for (const st of p.paradas) {
    const y0 = y;
    y += st.tramo.cm * S;
    out.trazos.unshift(`<line x1="0" y1="${f(y0)}" x2="0" y2="${f(y)}" class="pl-tronco"/>`);
    out.textos.push(texto(-10, (y0 + y) / 2 + 4, cm_(st.tramo.cm), "pl-cota pl-cota--tronco", "end", FS - 1));
    for (const r of st.ramas) rama(0, y, r);
    if (!st.fin) out.marcas.push(`<circle cx="0" cy="${f(y)}" r="4.5" class="pl-union"/>`);
  }
  crece(0, y);

  const pad = 8;
  const vb = [caja.x0 - pad, caja.y0 - pad, caja.x1 - caja.x0 + pad * 2, caja.y1 - caja.y0 + pad * 2].map(f);

  return `
    <svg class="pl-svg" viewBox="${vb.join(" ")}" width="${vb[2]}" role="img"
         aria-label="Dibujo del ramal ${esc_(p.titulo)} a escala">
      ${out.trazos.join("")}
      ${con}${conTxt}
      ${out.marcas.join("")}
      ${out.textos.join("")}
    </svg>`;
}

// ── Lista paso a paso ──────────────────────────────────────────────────
function tarjeta_(it) {
  const r = it.r;
  const subs = (r.hijos || []).filter((h) => (h.en ?? 1) < 1);
  return `
    <div class="plano__salida" data-rama="${esc_(r.id)}">
      <div class="plano__salidaHead">
        <span class="plano__salidaNom">${esc_(r.nombre)}</span>
        ${it.total ? `<span class="plano__largo">${esc_(largoTxt_(it))}</span>` : ""}
      </div>
      ${r.detalle && !subs.length ? `<div class="plano__det">${esc_(r.detalle)}</div>` : ""}
      ${cablesHTML_(r.cables)}
      ${subs
        .map(
          (h) => `
        <div class="plano__sub" data-rama="${esc_(h.id)}">
          <div class="plano__salidaNom">+ ${esc_(h.nombre)}</div>
          ${h.detalle ? `<div class="plano__det">${esc_(h.detalle)}</div>` : ""}
          ${cablesHTML_(h.cables)}
        </div>`
        )
        .join("")}
    </div>`;
}

function listaHTML_(p, idx) {
  let acum = 0;
  const destinos = (r) => (r.grupo ? r.hijos.map((h) => idx.get(h.id)) : [idx.get(r.id)]);
  const filas = p.paradas
    .map((st) => {
      acum += st.tramo.cm;
      const notas = st.ramas.filter((r) => r.grupo && r.detalle).map((r) => r.detalle);
      return `
      <div class="plano__tramo">
        <div class="plano__eje"></div>
        <div class="plano__tramoTxt">${esc_(st.tramo.medida)} · ${cm_(st.tramo.cm)}</div>
      </div>
      <div class="plano__parada${st.fin ? " is-fin" : ""}">
        <div class="plano__acum">${cm_(acum)}</div>
        <div class="plano__nodo"></div>
        <div class="plano__salidas">
          ${notas.map((n) => `<div class="plano__nota">${esc_(n)}</div>`).join("")}
          ${st.ramas.flatMap(destinos).map(tarjeta_).join("")}
        </div>
      </div>`;
    })
    .join("");

  return `
      <div class="plano__parada is-ini">
        <div class="plano__acum">0</div>
        <div class="plano__nodo plano__nodo--con"></div>
        <div class="plano__salidas"><div class="plano__salida plano__salida--con">
          <span class="plano__salidaNom">Conector</span>
          <span class="plano__det">invertido · puntos abajo</span>
        </div></div>
      </div>
      ${filas}
      <div class="plano__total">Tronco total: <b>${cm_(acum)}</b></div>`;
}

export function planoHTML_(p) {
  const idx = indexar_(p);
  return `
    <div class="plano" data-plano-id="${esc_(p.id)}">
      ${p.notas?.length ? `<ul class="plano__notas">${p.notas.map((n) => `<li>${esc_(n)}</li>`).join("")}</ul>` : ""}

      <div class="plano__secHead">
        <span class="plano__secT">Dibujo a escala</span>
        <button type="button" class="plano__zoom" data-plano-zoom aria-pressed="false">Ampliar</button>
      </div>
      <div class="plano__lienzo" id="planoLienzo">${dibujoSVG_(p, idx)}</div>
      <div class="plano__ley">
        <span><i class="plano__leyL"></i> largo medido</span>
        <span><i class="plano__leyL is-dib"></i> largo no indicado en el plano</span>
      </div>

      <div class="plano__ficha" id="planoFicha" aria-live="polite">
        <span class="plano__fichaVacia">Toca una rama del dibujo para ver su medida y sus cables.</span>
      </div>

      <div class="plano__secHead plano__secHead--lista">
        <span class="plano__secT">Recorrido paso a paso</span>
      </div>
      <div class="plano__ley">
        <span><b>1/4</b> = una cuarta (palmo)</span>
        <span>Izquierda: distancia desde el conector</span>
      </div>
      ${listaHTML_(p, idx)}
    </div>`;
}

// ── Selección: tocar el dibujo o la lista marca la misma rama ──────────
function seleccionar_(root, id, desdeLista) {
  const p = PLANOS.find((x) => x.id === root.dataset.planoId);
  const it = p && indexar_(p).get(id);
  if (!it) return;

  const svg = root.querySelector(".pl-svg");
  svg?.classList.add("has-sel");
  svg?.querySelectorAll(".pl-g").forEach((g) => g.classList.toggle("is-sel", g.dataset.rama === id));

  const ficha = root.querySelector("#planoFicha");
  const desde = it.padre ? `Sale de: ${it.padre.grupo ? it.padre.nombre.toLowerCase() : it.padre.nombre}` : `Sale del tronco a ${cm_(it.desde)} del conector`;
  ficha.innerHTML = `
    <div class="plano__salidaHead">
      <span class="plano__salidaNom">${esc_(it.r.nombre)}</span>
      <span class="plano__largo">${esc_(largoTxt_(it))}</span>
    </div>
    <div class="plano__det">${esc_(desde)}</div>
    ${it.r.detalle ? `<div class="plano__det">${esc_(it.r.detalle)}</div>` : ""}
    ${cablesHTML_(it.r.cables)}`;
  ficha.classList.add("is-on");

  if (desdeLista) root.querySelector("#planoLienzo")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Modal ──────────────────────────────────────────────────────────────
let modal_ = null;

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
    const zoom = t.closest("[data-plano-zoom]");
    if (zoom) {
      const on = root.querySelector("#planoLienzo").classList.toggle("is-zoom");
      zoom.textContent = on ? "Ajustar" : "Ampliar";
      zoom.setAttribute("aria-pressed", String(on));
      return;
    }
    const sel = t.closest("[data-rama]");
    if (sel) seleccionar_(root, sel.dataset.rama, !sel.closest(".pl-svg"));
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal_.classList.contains("show")) cerrarPlano_();
  });
  return modal_;
}

function abrirPlano_(id) {
  const p = PLANOS.find((x) => x.id === id);
  if (!p) return;
  const m = ensureModal_();
  m.querySelector("#planoModalTitle").textContent = `Plano · ${p.titulo}`;
  const body = m.querySelector("#planoModalBody");
  body.innerHTML = planoHTML_(p);
  body.scrollTop = 0;
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
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
      <span class="planoBtn__t">${esc_(p.titulo)}</span>
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
