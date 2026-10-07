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
// MI MEDIDA
// ─────────
// En el taller se mide con la mano: cuartas, dedos, pulgadas. Pero la cuarta
// de cada uno es distinta, así que el «2/4 + 1 pulgar» del papel es la mano
// de quien lo dibujó. Cada técnico guarda en SU celular cuánto mide su
// cuarta, su dedo y su pulgada, y cada medida se muestra en cm con, entre
// paréntesis y resaltado, cuánto es con su mano. Vive en localStorage: es
// una preferencia de la persona, no un dato del taller.
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
  rojoNegro:  { n: "rojo con línea negra", g: "linear-gradient(90deg,#dc2626 0 38%,#1a1a1a 38% 62%,#dc2626 62%)" },
};

// Franjas de los conectores (colores reales, como el cable).
const FRANJA = { rojo: "#dc2626", amarillo: "#facc15" };

// Una parada es un punto del tronco. `tramo` es lo que se mide sobre el
// tronco ANTES de llegar a ella.
//
// Una rama:
//   id, nombre, corto?, detalle?, cables?
//   ang            dirección en grados (ver GEOMETRÍA)
//   codo           tramos [[ang, cm], …] cuando el trazo dobla (el largo
//                  total es el mismo; el codo solo evita cruces)
//   cm, medida     largo real y cómo lo dicen en el papel
//   dib            largo solo de dibujo cuando el papel no lo da
//   grupo: true    rama común que al final se abre en `hijos`; no es un
//                  destino, es el haz que se separa después
//   hijos          ramas que salen de esta; `en` (0–1) dice en qué punto
//                  del largo salen (1 = al final, que es lo normal)
//   franja         color de la franja del conector, del lado del cable
//   lado           dónde va el nombre si el automático estorba
//   sinLargo       no repetir el largo junto al nombre (ya lo dice la cota)
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
        ramas: [{ id: "interface", nombre: "Interface", ang: 0, dib: 14, franja: "amarillo" }],
      },
      {
        tramo: { medida: "2/4 + 1 pulgar", cm: 35 },
        ramas: [
          {
            id: "rama-conmutador",
            nombre: "Rama de 1.29 m",
            detalle: "Rama de 6/4 + 1 puño (1.29 m). Al final salen juntos el conmutador y el cable con chapa.",
            grupo: true,
            // Sale a la izquierda y baja en paralelo al tronco.
            codo: [[180, 35], [90, 94]],
            cm: 129,
            medida: "6/4 + 1 puño",
            hijos: [
              { id: "conmutador", nombre: "Conmutador", ang: 90, dib: 3, sinLargo: true, cables: ["negro", "blancoVerde", "rojo"] },
              {
                id: "chapa",
                nombre: "Cable con chapa",
                corto: "Chapa",
                detalle: "Un solo cable, rojo con una línea negra.",
                ang: 180,
                dib: 6,
                lado: "arriba",
                sinLargo: true,
                cables: ["rojoNegro"],
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
            detalle: "Sale un haz de 1/4 (26 cm). Ahí terminan INY y MAP; 20 cm más allá salen RPM y EMUL.",
            grupo: true,
            ang: 0,
            cm: 26,
            medida: "1/4",
            hijos: [
              { id: "iny", nombre: "INY", detalle: "Inyectores de la bobina", ang: -90, dib: 4, franja: "amarillo", sinLargo: true },
              { id: "map", nombre: "MAP", ang: 90, dib: 4, franja: "amarillo", sinLargo: true },
              {
                id: "haz-rpm-emul",
                nombre: "Tramo de 20 cm",
                detalle: "Desde INY y MAP, 20 cm más hasta donde salen RPM y EMUL.",
                grupo: true,
                ang: 0,
                cm: 20,
                hijos: [
                  { id: "rpm", nombre: "RPM", codo: [[-90, 4], [0, 6]], dib: 10, sinLargo: true, cables: ["marron"] },
                  { id: "emul", nombre: "EMUL.", codo: [[90, 4], [0, 6]], dib: 10, sinLargo: true, cables: ["multicolor"] },
                ],
              },
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
              { id: "electrovalvula", nombre: "Electroválvula", ang: 0, dib: 8, sinLargo: true, cables: ["azul", "negro"] },
              { id: "temperatura", nombre: "Temperatura", codo: [[90, 9], [0, 6]], dib: 15, sinLargo: true, cables: ["anaranjado", "negro"] },
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

// ── Mi medida (la mano de cada uno, guardada en su celular) ────────────
const MANO_KEY = "glp.planos.mano";
const MANO_LIM = { cuarta: [10, 35], dedo: [0.5, 6], pulgada: [0.5, 6] };

function manoCargar_() {
  try {
    const m = JSON.parse(localStorage.getItem(MANO_KEY) || "null");
    if (m && m.cuarta > 0 && (m.dedo > 0 || m.pulgada > 0)) return m;
  } catch { /* sin almacenamiento: se muestra solo en cm */ }
  return null;
}

function manoGuardar_(m) {
  try {
    if (m) localStorage.setItem(MANO_KEY, JSON.stringify(m));
    else localStorage.removeItem(MANO_KEY);
    return true;
  } catch {
    return false;
  }
}

// cm → «1 cuarta + 3 dedos» con la mano de la persona, redondeado al dedo
// (nadie mide medio dedo). Si a la cuarta siguiente le sobran 1 o 2 dedos
// se dice así, «1 cuarta − 1 dedo», que es como se mide en el taller (una
// cuarta y se recoge un dedo) y no «11 dedos». Si sobra más, se suma.
function miMedida_(cm, mano, corto = false) {
  if (!mano || !cm) return "";
  const chica = mano.chica === "pulgada" && mano.pulgada > 0 ? "pulgada" : "dedo";
  const u = mano[chica];
  const q = mano.cuarta;
  const n0 = Math.floor(cm / q), k0 = Math.round((cm - n0 * q) / u);
  const k1 = Math.round((cm - (n0 + 1) * q) / u);
  const resta = -k1 <= 2 && -k1 < k0;
  const n = resta ? n0 + 1 : n0;
  const k = resta ? k1 : k0;
  const signo = k < 0 ? "−" : "+";
  const ka = Math.abs(k);
  if (corto) {
    const ab = chica === "pulgada" ? "p" : "d";
    if (!n) return `${ka}${ab}`;
    return ka ? `${n}c ${signo}${ka}${ab}` : `${n}c`;
  }
  const pl = (x, s, p) => `${x} ${x === 1 ? s : p}`;
  const chicaTxt = pl(ka, chica, chica === "pulgada" ? "pulgadas" : "dedos");
  if (!n) return chicaTxt;
  return ka ? `${pl(n, "cuarta", "cuartas")} ${signo} ${chicaTxt}` : pl(n, "cuarta", "cuartas");
}

// «35 cm (1 cuarta + 7 dedos)», con la parte de la mano resaltada.
function medidaHTML_(cm, mano) {
  const mia = miMedida_(cm, mano);
  return `${cm_(cm)}${mia ? ` <mark class="plano__mia">(${esc_(mia)})</mark>` : ""}`;
}

function manoHTML_(mano) {
  const v = (k, d) => (mano?.[k] ?? d);
  const chica = mano?.chica === "pulgada" ? "pulgada" : "dedo";
  const resumen = mano
    ? `cuarta ${v("cuarta")} cm · ${chica === "pulgada" ? `pulgada ${v("pulgada")}` : `dedo ${v("dedo")}`} cm`
    : "sin configurar";
  return `
    <details class="plano__mano"${mano ? "" : " open"}>
      <summary><span class="plano__manoT">✋ Mi medida</span> <span class="plano__manoRes">${esc_(resumen)}</span></summary>
      <div class="plano__manoBody">
        <p class="plano__det">Mide una vez con la wincha y guarda. Cada medida del plano te
          saldrá en cm y, <mark class="plano__mia">resaltado</mark>, con tu mano.</p>
        <div class="plano__manoGrid">
          <label>Mi cuarta <span><input type="text" inputmode="decimal" autocomplete="off" data-mano="cuarta" value="${esc_(v("cuarta", ""))}" placeholder="20"> cm</span></label>
          <label>Mi dedo <span><input type="text" inputmode="decimal" autocomplete="off" data-mano="dedo" value="${esc_(v("dedo", ""))}" placeholder="2"> cm</span></label>
          <label>Mi pulgada <span><input type="text" inputmode="decimal" autocomplete="off" data-mano="pulgada" value="${esc_(v("pulgada", ""))}" placeholder="2.5"> cm</span></label>
        </div>
        <div class="plano__manoChica" role="radiogroup" aria-label="Completar con">
          <span class="plano__det">Lo que falta para la cuarta, en:</span>
          <button type="button" class="plano__chip${chica === "dedo" ? " is-on" : ""}" data-mano-chica="dedo">dedos</button>
          <button type="button" class="plano__chip${chica === "pulgada" ? " is-on" : ""}" data-mano-chica="pulgada">pulgadas</button>
        </div>
        <div class="plano__manoAcc">
          <button type="button" class="planoBtn plano__manoOk" data-mano-guardar>Guardar</button>
          ${mano ? `<button type="button" class="plano__zoom" data-mano-borrar>Borrar</button>` : ""}
        </div>
        <div class="plano__manoMsg plano__det" aria-live="polite"></div>
      </div>
    </details>`;
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

function largoHTML_(it, mano) {
  if (!it.total) return "largo no indicado";
  const papel = it.medida.length > 1 ? it.medida.join(" + ") : it.medida[0] || "";
  return `${medidaHTML_(it.total, mano)}${
    papel && papel !== cm_(it.total) ? ` <span class="plano__papel">· papel: ${esc_(papel)}</span>` : ""
  }`;
}

// ── Dibujo a escala (SVG) ──────────────────────────────────────────────
// Estilo de plano de arnés, como lo bocetó el taller: tramos rectos con
// codos a 90°, el haz en línea gruesa, los conectores como cajitas y las
// puntas abiertas en sus cables de color.
const S = 4;        // px de dibujo por cm
const FS = 20;      // tamaño de letra en unidades del dibujo
const TXT_W = 0.6;  // ancho medio de un carácter, en FS
const COLA = 26;    // largo de dibujo de cada cable suelto en la punta

// Cables de dos o más colores. `rayas`: tramos alternados (blanco/verde).
// `linea`: color base con una línea fina a lo largo (rojo con línea negra).
// En SVG no sirve un gradiente sobre una línea recta: su caja mide 0.
const RAYAS = {
  blancoVerde: { rayas: ["#f5f5f5", "#16a34a"] },
  multicolor: { rayas: ["#dc2626", "#facc15", "#16a34a", "#2563eb"] },
  rojoNegro: { linea: ["#dc2626", "#1a1a1a"] },
};

function dibujoSVG_(p, idx, mano) {
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

  // Conector: cajita al final de la rama. La franja va pegada al lado por
  // donde entra el cable, como la marca el taller.
  const conector = (x, y, d, franja) => {
    const horiz = Math.abs(d[0]) >= Math.abs(d[1]);
    const largo = 14, ancho = 24; // largo: en la dirección del cable
    const w = horiz ? largo : ancho, h = horiz ? ancho : largo;
    const cx = x + d[0] * (largo / 2), cy = y + d[1] * (largo / 2);
    crece(cx - w / 2, cy - h / 2); crece(cx + w / 2, cy + h / 2);
    let svg = `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${w}" height="${h}" rx="2" class="pl-caja"/>`;
    if (franja) {
      const g = 4; // grosor de la franja
      const fx = horiz ? (d[0] > 0 ? cx - w / 2 + 2 : cx + w / 2 - 2 - g) : cx - w / 2 + 2;
      const fy = horiz ? cy - h / 2 + 2 : d[1] > 0 ? cy - h / 2 + 2 : cy + h / 2 - 2 - g;
      svg += `<rect x="${f(fx)}" y="${f(fy)}" width="${horiz ? g : w - 4}" height="${horiz ? h - 4 : g}" fill="${FRANJA[franja] || franja}"/>`;
    }
    return svg;
  };

  // Nombre (y largo total, si se conoce) junto a la punta.
  const rotulo = (x, y, d, r, conCables) => {
    const it = idx.get(r.id);
    const largo = it && it.total && !r.sinLargo ? cm_(it.total) : "";
    const lejos = conCables ? COLA + 6 : 20;
    let lado = r.lado;
    if (!lado) lado = d[0] > 0.5 ? "der" : d[0] < -0.5 ? "izq" : d[1] < 0 ? "arriba" : "abajo";
    const nom = r.corto || r.nombre;
    if (lado === "der") return texto(x + lejos, y + 6, nom, "pl-nom", "start", FS, largo);
    if (lado === "izq") return texto(x - lejos, y + 6, nom, "pl-nom", "end", FS, largo);
    if (lado === "arriba") return texto(x + d[0] * lejos * 0.6, y - lejos + 2, nom, "pl-nom", "middle", FS, largo);
    return texto(x, y + lejos + FS, nom, "pl-nom", "middle", FS, largo);
  };

  // Largo de un tramo: los cm y, debajo y resaltado, la medida de la mano.
  // Solo en tramos verticales (tronco, rama del conmutador), que tienen aire
  // al costado. En los horizontales del haz no entra junto a INY/MAP: ahí
  // la mano sale en la ficha al tocar la rama y en el paso a paso.
  const cota = (ax, ay, bx, by, cm, cls = "pl-cota", lado = "der") => {
    const mia = miMedida_(cm, mano, true);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (Math.abs(bx - ax) < Math.abs(by - ay)) {
      const dx = lado === "izq" ? -10 : 10, an = lado === "izq" ? "end" : "start";
      const y0 = mia ? my - 3 : my + 6;
      return texto(mx + dx, y0, cm_(cm), cls, an, FS - 1) +
        (mia ? texto(mx + dx, y0 + FS, `(${mia})`, "pl-mia", an, FS - 2) : "");
    }
    // Corrida hacia el final del tramo: al inicio suelen estar las cajitas.
    return texto(ax + (bx - ax) * 0.62, my - 9, cm_(cm), cls, "middle", FS - 1);
  };

  const rama = (x, y, r) => {
    const largo = (r.cm ?? r.dib ?? 0) * S;
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
      // Cota solo en las ramas comunes; los destinos llevan su largo total
      // junto al nombre. Va en el tramo más largo del trazo.
      if (r.cm && r.grupo) {
        let i = 0;
        legs.forEach(([, l], k) => { if (l > legs[i][1]) i = k; });
        g += cota(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r.cm);
      }
    }
    if (r.grupo) {
      g += `<circle cx="${f(ex)}" cy="${f(ey)}" r="5" class="pl-union"/>`;
    } else if (r.cables?.length) {
      g += abanico(ex, ey, d, r.cables);
      g += rotulo(ex, ey, d, r, true);
    } else {
      g += conector(ex, ey, d, r.franja);
      g += rotulo(ex, ey, d, r, false);
    }
    out.trazos.push(`<g class="pl-g" data-rama="${esc_(r.id)}">${g}</g>`);

    for (const h of r.hijos || []) {
      const t = h.en ?? 1;
      const [hx, hy] = enT(t);
      if (t < 1) out.marcas.push(`<circle cx="${f(hx)}" cy="${f(hy)}" r="5" class="pl-union"/>`);
      rama(hx, hy, h);
    }
  };

  // Conector principal: el cuerpo se alarga a la izquierda del cable y
  // lleva la franja roja a la derecha, como el de verdad.
  const CON = { x0: -66, x1: 20, h: 28 };
  const con =
    `<rect x="${CON.x0}" y="${-CON.h}" width="${CON.x1 - CON.x0}" height="${CON.h}" rx="3" class="pl-caja pl-caja--con"/>` +
    `<rect x="${CON.x1 - 11}" y="${-CON.h + 3}" width="5" height="${CON.h - 6}" fill="${FRANJA.rojo}"/>`;
  crece(CON.x0, -CON.h); crece(CON.x1, 0);
  const conTxt = texto(CON.x1 + 10, -9, "Conector", "pl-nom", "start");

  let y = 0;
  for (const st of p.paradas) {
    const y0 = y;
    y += st.tramo.cm * S;
    out.trazos.unshift(`<line x1="0" y1="${f(y0)}" x2="0" y2="${f(y)}" class="pl-tronco"/>`);
    out.textos.push(cota(0, y0, 0, y, st.tramo.cm, "pl-cota pl-cota--tronco", "izq"));
    for (const r of st.ramas) rama(0, y, r);
    if (!st.fin) out.marcas.push(`<circle cx="0" cy="${f(y)}" r="5.5" class="pl-union"/>`);
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
function tarjeta_(it, mano) {
  const r = it.r;
  return `
    <div class="plano__salida" data-rama="${esc_(r.id)}">
      <div class="plano__salidaHead">
        <span class="plano__salidaNom">${esc_(r.nombre)}</span>
      </div>
      ${it.total ? `<div class="plano__largo">${largoHTML_(it, mano)}</div>` : ""}
      ${r.detalle ? `<div class="plano__det">${esc_(r.detalle)}</div>` : ""}
      ${cablesHTML_(r.cables)}
    </div>`;
}

function listaHTML_(p, idx, mano) {
  let acum = 0;
  // Las ramas comunes no son destino: se listan sus puntas (aunque estén
  // anidadas, como RPM/EMUL dentro del haz) y su explicación como nota.
  const destinos = (r) => (r.grupo ? r.hijos.flatMap(destinos) : [idx.get(r.id)]);
  const notasDe = (r) => (r.grupo ? [r.detalle, ...r.hijos.flatMap(notasDe)].filter(Boolean) : []);
  const filas = p.paradas
    .map((st) => {
      acum += st.tramo.cm;
      return `
      <div class="plano__tramo">
        <div class="plano__eje"></div>
        <div class="plano__tramoTxt">${medidaHTML_(st.tramo.cm, mano)}
          <span class="plano__papel">· papel: ${esc_(st.tramo.medida)}</span></div>
      </div>
      <div class="plano__parada${st.fin ? " is-fin" : ""}">
        <div class="plano__acum">${cm_(acum)}</div>
        <div class="plano__nodo"></div>
        <div class="plano__salidas">
          ${st.ramas.flatMap(notasDe).map((n) => `<div class="plano__nota">${esc_(n)}</div>`).join("")}
          ${st.ramas.flatMap(destinos).map((it) => tarjeta_(it, mano)).join("")}
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
          <span class="plano__det">invertido · puntos abajo · franja roja a la derecha</span>
        </div></div>
      </div>
      ${filas}
      <div class="plano__total">Tronco total: <b>${medidaHTML_(acum, mano)}</b></div>`;
}

export function planoHTML_(p, mano = manoCargar_()) {
  const idx = indexar_(p);
  return `
    <div class="plano" data-plano-id="${esc_(p.id)}">
      ${p.notas?.length ? `<ul class="plano__notas">${p.notas.map((n) => `<li>${esc_(n)}</li>`).join("")}</ul>` : ""}

      ${manoHTML_(mano)}

      <div class="plano__secHead">
        <span class="plano__secT">Dibujo a escala</span>
        <button type="button" class="plano__zoom" data-plano-zoom aria-pressed="false">Ampliar</button>
      </div>
      <div class="plano__lienzo" id="planoLienzo">${dibujoSVG_(p, idx, mano)}</div>
      <div class="plano__ley">
        <span><i class="plano__leyL"></i> largo medido</span>
        <span><i class="plano__leyL is-dib"></i> largo no indicado en el plano</span>
        ${mano ? `<span><mark class="plano__mia">(1c +3${mano.chica === "pulgada" ? "p" : "d"})</mark> = tu mano: c cuarta, ${mano.chica === "pulgada" ? "p pulgada" : "d dedo"}</span>` : ""}
      </div>

      <div class="plano__ficha" id="planoFicha" aria-live="polite">
        <span class="plano__fichaVacia">Toca una rama del dibujo para ver su medida y sus cables.</span>
      </div>

      <div class="plano__secHead plano__secHead--lista">
        <span class="plano__secT">Recorrido paso a paso</span>
      </div>
      <div class="plano__ley">
        <span>Izquierda: distancia desde el conector</span>
        <span>«papel»: como lo midió quien hizo el dibujo (1/4 = una cuarta)</span>
      </div>
      ${listaHTML_(p, idx, mano)}
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
  const desde = it.padre
    ? `Sale de: ${it.padre.grupo ? it.padre.nombre.toLowerCase() : it.padre.nombre}`
    : `Sale del tronco a ${cm_(it.desde)} del conector`;
  ficha.innerHTML = `
    <div class="plano__salidaHead">
      <span class="plano__salidaNom">${esc_(it.r.nombre)}</span>
    </div>
    <div class="plano__largo">${largoHTML_(it, manoCargar_())}</div>
    <div class="plano__det">${esc_(desde)}</div>
    ${it.r.detalle ? `<div class="plano__det">${esc_(it.r.detalle)}</div>` : ""}
    ${cablesHTML_(it.r.cables)}`;
  ficha.classList.add("is-on");

  if (desdeLista) root.querySelector("#planoLienzo")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Lee el formulario de «Mi medida». Devuelve la mano o un texto de error.
function leerMano_(root) {
  const m = { chica: root.querySelector("[data-mano-chica].is-on")?.dataset.manoChica || "dedo" };
  for (const k of ["cuarta", "dedo", "pulgada"]) {
    const raw = String(root.querySelector(`[data-mano="${k}"]`)?.value || "").replace(",", ".").trim();
    if (!raw) continue;
    const n = Number(raw);
    const [lo, hi] = MANO_LIM[k];
    if (!Number.isFinite(n) || n < lo || n > hi) return `Tu ${k} debe estar entre ${lo} y ${hi} cm.`;
    m[k] = n;
  }
  if (!m.cuarta) return "Escribe cuánto mide tu cuarta.";
  if (!m[m.chica]) return `Escribe cuánto mide tu ${m.chica}, o elige la otra unidad.`;
  return m;
}

// ── Modal ──────────────────────────────────────────────────────────────
let modal_ = null;
let abierto_ = null;

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

    const chica = t.closest("[data-mano-chica]");
    if (chica) {
      root.querySelectorAll("[data-mano-chica]").forEach((b) => b.classList.toggle("is-on", b === chica));
      return;
    }
    if (t.closest("[data-mano-guardar]")) {
      const m = leerMano_(root);
      const msg = root.querySelector(".plano__manoMsg");
      if (typeof m === "string") { msg.textContent = m; return; }
      if (!manoGuardar_(m)) { msg.textContent = "Este celular no deja guardar. Revisa que no estés en modo incógnito."; return; }
      return pintarPlano_(abierto_);
    }
    if (t.closest("[data-mano-borrar]")) {
      manoGuardar_(null);
      return pintarPlano_(abierto_);
    }

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

function pintarPlano_(id, arriba = false) {
  const p = PLANOS.find((x) => x.id === id);
  if (!p) return;
  const body = ensureModal_().querySelector("#planoModalBody");
  body.innerHTML = planoHTML_(p);
  if (arriba) body.scrollTop = 0;
}

function abrirPlano_(id) {
  const p = PLANOS.find((x) => x.id === id);
  if (!p) return;
  abierto_ = id;
  const m = ensureModal_();
  m.querySelector("#planoModalTitle").textContent = `Plano · ${p.titulo}`;
  pintarPlano_(id, true);
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
