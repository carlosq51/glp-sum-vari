// =========================
// public/js/views/ramalero/planos-datos.js
// Los planos de ramal, como datos (ver el modelo en planos-modelo.js).
//
// Es JSON a propósito: es la forma en que un día vivirán en la base. Para
// agregar un modelo se copia uno y se cambian sus secciones, nodos y ramas.
//
// `dibujo` es solo forma: los ángulos copian el boceto del taller
// (0 = derecha, 90 = abajo, 180 = izquierda), `largo` es cuánto se dibuja
// una rama que no tiene cm en el papel (y va punteada). A nivel del ramal,
// `tramoMax`: un tramo más largo que eso se dibuja cortado («···») para
// que no estire todo el plano; su cota sigue diciendo el largo real. Una
// rama puede pedir uno más corto con `dibujo.largo` (también con «···»).
//
// `pasos` de una rama: lo que hay que hacerle (dobleces, etc.). Ejemplo:
//   pasos: [{ tipo: "doblez", cm: 10, texto: "Doblar hacia atrás" }]
// =========================

export const RAMALES = [
  {
    id: "kyc-x3-x5",
    modelo: "KYC X3 / X5",
    conector: {
      tipo: "principal",
      invertido: true,
      observaciones: ["Los 4 puntos van hacia la parte inferior."],
    },
    cinta: [{ tipo: "aislante", donde: "Todo el ramal" }],
    observaciones: [],
    dibujo: { tramoMax: 60 },
    tronco: {
      secciones: [
        {
          cm: 20,
          medida: "1/4",
          nodo: {
            ramas: [{ id: "interface", nombre: "Interface", conector: "interface", dibujo: { ang: -22, largo: 16 } }],
          },
        },
        {
          cm: 35,
          medida: "2/4 + 1 pulgar",
          // Más corta en el dibujo para que la rama de 1.29 m salga más arriba.
          dibujo: { largo: 20 },
          nodo: {
            ramas: [
              {
                id: "rama-conmutador",
                nombre: "Rama de 1.29 m",
                cm: 129,
                medida: "6/4 + 1 puño",
                observaciones: ["Conmutador y chapa van juntos 1.29 m; ahí sale la chapa y el conmutador sigue."],
                // Se dibuja corta (con «···») para no tapar las ramas del nodo
                // siguiente.
                dibujo: { ang: 141, largo: 32 },
                nodo: {
                  ramas: [
                    {
                      id: "conmutador",
                      nombre: "Conmutador",
                      cables: ["negro", "blancoVerde", "rojo"],
                      dibujo: { ang: 160, largo: 10, lado: "izq", sinLargo: true },
                    },
                    {
                      id: "chapa",
                      nombre: "Cable con chapa",
                      corto: "Chapa",
                      cables: ["rojoNegro"],
                      observaciones: ["Un solo cable, rojo con una línea negra."],
                      dibujo: { ang: 215, largo: 14, lado: "arriba", sinLargo: true },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          cm: 29,
          medida: "1/4 + 1 puño",
          // Del mismo nodo salen las cuatro: INY y MAP de 26 cm, RPM y EMUL
          // 20 cm más largas.
          nodo: {
            ramas: [
              {
                id: "iny",
                nombre: "INY",
                cm: 26,
                medida: "1/4",
                conector: "iny",
                cantidad: 4,
                observaciones: ["Los 4 inyectores de la bobina."],
                dibujo: { ang: 165, lado: "izq" },
              },
              { id: "map", nombre: "MAP", cm: 26, medida: "1/4", conector: "map", dibujo: { ang: 140, lado: "abajo" } },
              {
                id: "rpm",
                nombre: "RPM",
                cm: 46,
                cables: ["marron"],
                observaciones: ["20 cm más larga que INY y MAP."],
                dibujo: { ang: 125, lado: "izq" },
              },
              {
                id: "emul",
                nombre: "EMUL.",
                cm: 46,
                cables: ["multicolor"],
                observaciones: ["20 cm más larga que INY y MAP."],
                dibujo: { ang: 108, lado: "izq" },
              },
            ],
          },
        },
        {
          cm: 20,
          medida: "1/4",
          nodo: {
            ramas: [
              {
                id: "rama-ev-temp",
                nombre: "Rama de 20 cm",
                cm: 20,
                medida: "1/4",
                observaciones: ["Electroválvula y temperatura van juntas 20 cm y ahí se abren."],
                dibujo: { ang: 0 },
                nodo: {
                  ramas: [
                    { id: "electrovalvula", nombre: "Electroválvula", cables: ["azul", "negro"], dibujo: { ang: -10, largo: 14, sinLargo: true } },
                    { id: "temperatura", nombre: "Temperatura", cables: ["anaranjado", "negro"], dibujo: { ang: 18, largo: 14, sinLargo: true } },
                  ],
                },
              },
            ],
          },
        },
        {
          cm: 20,
          medida: "1/4",
          nodo: {
            ramas: [
              { id: "alimentacion", nombre: "Alimentación", cables: ["rojo", "negro"], dibujo: { ang: 120, largo: 18, lado: "izq" } },
            ],
          },
        },
        {
          cm: 20,
          medida: "1/4",
          nodo: {
            ramas: [
              { id: "tanque", nombre: "Cables de tanque", cables: ["azul", "verde", "marron"], dibujo: { ang: 90, largo: 3, lado: "der" } },
            ],
          },
        },
      ],
    },
  },
];
