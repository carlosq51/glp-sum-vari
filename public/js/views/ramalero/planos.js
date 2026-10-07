// =========================
// public/js/views/ramalero/planos.js
// Planos de armado de ramales, para quien recién empieza o duda de una
// medida. Digitalizados del dibujo en papel que hicieron los técnicos.
//
// POR QUÉ UNA «LÍNEA DE METRO» Y NO UNA COPIA DEL DIBUJO
// ─────────────────────────────────────────────────────
// En el papel las ramas salen en diagonal y las medidas se cruzan con las
// líneas; en un celular eso obliga a hacer zoom y arrastrar. Aquí el tronco
// va en vertical, de arriba (conector) hacia abajo, y cada parada es un
// punto donde salen cables. A la izquierda va cuánto llevas desde el
// conector, que es lo que el ramalero mide con la mano; a la derecha qué
// sale y de qué color son los cables.
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

// tramo: lo que se mide sobre el tronco ANTES de llegar a la parada.
// salidas[].largo: lo que mide la rama desde el tronco.
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
        salidas: [{ nombre: "Interface" }],
      },
      {
        tramo: { medida: "2/4 + 1 pulgar", cm: 35 },
        salidas: [
          {
            nombre: "Conmutador",
            largo: { medida: "6/4 + 1 puño", cm: 129 },
            cables: ["negro", "blancoVerde", "rojo"],
            sub: [
              {
                nombre: "1 solo cable con chapa",
                detalle: "Sale del mismo tramo de 1.29 m que va al conmutador.",
                cables: ["rojo", "negro"],
              },
            ],
          },
        ],
      },
      {
        tramo: { medida: "1/4 + 1 puño", cm: 29 },
        nota: "Aquí sale un haz de 1/4 (26 cm). INY y MAP terminan ahí; RPM y EMUL. siguen 20 cm más.",
        salidas: [
          { nombre: "INY", detalle: "Inyectores de la bobina", largo: { medida: "1/4", cm: 26 } },
          { nombre: "MAP", largo: { medida: "1/4", cm: 26 } },
          { nombre: "RPM", largo: { medida: "26 + 20", cm: 46 }, cables: ["marron"] },
          { nombre: "EMUL.", largo: { medida: "26 + 20", cm: 46 }, cables: ["multicolor"] },
        ],
      },
      {
        tramo: { medida: "1/4", cm: 20 },
        nota: "Sale una rama de 1/4 (20 cm) que al final se abre en dos.",
        salidas: [
          { nombre: "Electroválvula", largo: { medida: "1/4", cm: 20 }, cables: ["azul", "negro"] },
          { nombre: "Temperatura", largo: { medida: "1/4", cm: 20 }, cables: ["anaranjado", "negro"] },
        ],
      },
      {
        tramo: { medida: "1/4", cm: 20 },
        salidas: [{ nombre: "Alimentación", cables: ["rojo", "negro"] }],
      },
      {
        tramo: { medida: "1/4", cm: 20 },
        fin: true,
        salidas: [{ nombre: "Cables de tanque", cables: ["azul", "verde", "marron"] }],
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

function salidaHTML_(s) {
  const largo = s.largo
    ? `<span class="plano__largo">${esc_(s.largo.medida)} · <b>${cm_(s.largo.cm)}</b></span>`
    : "";
  const sub = (s.sub || [])
    .map(
      (x) => `
      <div class="plano__sub">
        <div class="plano__salidaNom">+ ${esc_(x.nombre)}</div>
        ${x.detalle ? `<div class="plano__det">${esc_(x.detalle)}</div>` : ""}
        ${cablesHTML_(x.cables)}
      </div>`
    )
    .join("");
  return `
    <div class="plano__salida">
      <div class="plano__salidaHead">
        <span class="plano__salidaNom">${esc_(s.nombre)}</span>
        ${largo}
      </div>
      ${s.detalle ? `<div class="plano__det">${esc_(s.detalle)}</div>` : ""}
      ${cablesHTML_(s.cables)}
      ${sub}
    </div>`;
}

export function planoHTML_(p) {
  let acum = 0;
  const filas = p.paradas
    .map((st) => {
      acum += st.tramo.cm;
      return `
      <div class="plano__tramo">
        <div class="plano__eje"></div>
        <div class="plano__tramoTxt">${esc_(st.tramo.medida)} · ${cm_(st.tramo.cm)}</div>
      </div>
      <div class="plano__parada${st.fin ? " is-fin" : ""}">
        <div class="plano__acum">${cm_(acum)}</div>
        <div class="plano__nodo"></div>
        <div class="plano__salidas">
          ${st.nota ? `<div class="plano__nota">${esc_(st.nota)}</div>` : ""}
          ${st.salidas.map(salidaHTML_).join("")}
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="plano">
      ${p.notas?.length ? `<ul class="plano__notas">${p.notas.map((n) => `<li>${esc_(n)}</li>`).join("")}</ul>` : ""}
      <div class="plano__ley">
        <span><b>1/4</b> = una cuarta (palmo)</span>
        <span>Izquierda: distancia desde el conector</span>
      </div>
      <div class="plano__parada is-ini">
        <div class="plano__acum">0</div>
        <div class="plano__nodo plano__nodo--con"></div>
        <div class="plano__salidas"><div class="plano__salida plano__salida--con">
          <span class="plano__salidaNom">Conector</span>
          <span class="plano__det">invertido · puntos abajo</span>
        </div></div>
      </div>
      ${filas}
      <div class="plano__total">Tronco total: <b>${cm_(acum)}</b></div>
    </div>`;
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
    if (ev.target === modal_ || ev.target.closest("[data-plano-cerrar]")) cerrarPlano_();
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
