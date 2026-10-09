// =========================
// public/js/views/ramalero/planos-datos.js
// Los planos de ramal, como datos (ver el modelo en planos-modelo.js).
//
// Es JSON a propósito: es la forma en que un día vivirán en la base. Para
// agregar un modelo se copia uno y se cambian sus secciones y ramas.
//
// `dibujo` es solo forma: los ángulos copian el boceto del taller
// (0 = derecha, 90 = abajo, 180 = izquierda), `largo` es cuánto se dibuja
// una rama que no tiene cm en el papel (y va punteada). A nivel del ramal,
// `tramoMax`: un tramo más largo que eso se dibuja cortado (⫽) para que
// no estire todo el plano; su cota sigue diciendo el largo real.
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
    dibujo: { tramoMax: 45 },
    tronco: {
      secciones: [
        {
          cm: 20,
          medida: "1/4",
          salidas: [{ id: "interface", nombre: "Interface", conector: "interface", dibujo: { ang: -22, largo: 16 } }],
        },
        {
          cm: 35,
          medida: "2/4 + 1 pulgar",
          // Más corta en el dibujo para que la rama de 1.29 m salga más arriba.
          dibujo: { largo: 20 },
          salidas: [
            {
              id: "rama-conmutador",
              nombre: "Rama de 1.29 m",
              cm: 129,
              medida: "6/4 + 1 puño",
              observaciones: ["1.29 m hasta donde sale el cable con chapa; desde ahí sigue hasta el conmutador."],
              dibujo: { ang: 141 },
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
          ],
        },
        {
          cm: 29,
          medida: "1/4 + 1 puño",
          salidas: [
            {
              id: "haz-sensores",
              nombre: "Haz de 26 cm",
              cm: 26,
              medida: "1/4",
              observaciones: ["Ahí terminan INY y MAP; 20 cm más allá salen RPM y EMUL."],
              dibujo: { ang: 150 },
              ramas: [
                {
                  id: "iny",
                  nombre: "INY",
                  conector: "iny",
                  cantidad: 4,
                  observaciones: ["Los 4 inyectores de la bobina."],
                  dibujo: { ang: 200, largo: 4, lado: "izq", sinLargo: true },
                },
                { id: "map", nombre: "MAP", conector: "map", dibujo: { ang: 135, largo: 8, lado: "izq", sinLargo: true } },
                {
                  id: "haz-rpm-emul",
                  nombre: "Tramo de 20 cm",
                  cm: 20,
                  observaciones: ["Desde INY y MAP, 20 cm más hasta donde salen RPM y EMUL."],
                  dibujo: { ang: 90 },
                  ramas: [
                    { id: "rpm", nombre: "RPM", cables: ["marron"], dibujo: { ang: 180, largo: 8, lado: "izq", sinLargo: true } },
                    { id: "emul", nombre: "EMUL.", cables: ["multicolor"], dibujo: { ang: 130, largo: 8, lado: "izq", sinLargo: true } },
                  ],
                },
              ],
            },
          ],
        },
        {
          cm: 20,
          medida: "1/4",
          salidas: [
            {
              id: "rama-ev-temp",
              nombre: "Rama de 20 cm",
              cm: 20,
              medida: "1/4",
              observaciones: ["Al final se abre en dos."],
              dibujo: { ang: 0 },
              ramas: [
                { id: "electrovalvula", nombre: "Electroválvula", cables: ["azul", "negro"], dibujo: { ang: -10, largo: 14, sinLargo: true } },
                { id: "temperatura", nombre: "Temperatura", cables: ["anaranjado", "negro"], dibujo: { ang: 18, largo: 14, sinLargo: true } },
              ],
            },
          ],
        },
        {
          cm: 20,
          medida: "1/4",
          salidas: [
            { id: "alimentacion", nombre: "Alimentación", cables: ["rojo", "negro"], dibujo: { ang: 140, largo: 18, lado: "izq" } },
          ],
        },
        {
          cm: 20,
          medida: "1/4",
          salidas: [
            { id: "tanque", nombre: "Cables de tanque", cables: ["azul", "verde", "marron"], dibujo: { ang: 90, largo: 3, lado: "der" } },
          ],
        },
      ],
    },
  },
];
