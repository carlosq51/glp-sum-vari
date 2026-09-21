import { describe, it, expect } from "vitest";

const { uploaderView } = await import("../public/js/templates/views/uploader-view.js");

// Lo que estos tests fijan es UNA idea: una foto, una tarjeta, una subida.
//
// Antes, las cuatro tomas de compresión (y las cuatro de calidad) compartían
// una sola tarjeta con un botón para las cuatro: la foto caía en "el primer
// casillero libre". Cuando la cuarta fallaba, su casillero quedaba ocupado por
// la foto que no subió, el siguiente disparo iba a parar a otro cilindro, y la
// única salida limpia era "Borrar" — que borraba las cuatro. El técnico volvía
// a tomar cuatro fotos por una que falló.
//
// Si alguien vuelve a agrupar los slots bajo una tarjeta común, estos tests
// caen.

const html = uploaderView();

const COMPRESION = ["comp_1", "comp_2", "comp_3", "comp_4"];
const CALIDAD    = ["calidad_1", "calidad_2", "calidad_3", "calidad_4"];
const SUELTOS    = ["vin", "corr_pre", "corr_post", "voltaje", "scan_carro"];
const SOLDADURA  = [
  "sold_sensor_antes", "sold_sensor_post", "sold_cabina_antes", "sold_cabina_post",
];

const TODOS = [...COMPRESION, ...CALIDAD, ...SUELTOS, ...SOLDADURA];

describe("tarjetas de foto del uploader", () => {
  it("cada foto tiene SU tarjeta, con su propio estado", () => {
    for (const slot of TODOS) {
      expect(html, `falta la tarjeta de ${slot}`).toContain(`data-slot="${slot}"`);
    }
  });

  it("cada tarjeta trae sus cuatro acciones, reintentar incluida", () => {
    for (const slot of TODOS) {
      expect(html).toContain(`data-pick="cam" data-slot="${slot}"`);
      expect(html).toContain(`data-pick="file" data-slot="${slot}"`);
      expect(html).toContain(`data-retry="1" data-slot="${slot}"`);
      expect(html).toContain(`data-clear="1" data-slot="${slot}"`);
    }
  });

  it("cada foto tiene su propia miniatura y su propia línea de estado", () => {
    for (const slot of TODOS) {
      expect(html).toContain(`id="up_${slot}_previewBox"`);
      expect(html).toContain(`id="up_${slot}_meta"`);
    }
  });

  it("ya no queda ninguna tarjeta compartida por varias fotos", () => {
    // `comp` y `qc` eran los data-slot de las dos tarjetas de cuatro fotos.
    expect(html).not.toContain('data-slot="comp"');
    expect(html).not.toContain('data-slot="qc"');
    // Y sus cajas sueltas de miniatura, que no eran tarjetas.
    for (const id of ["up_comp_p1", "up_comp_p4", "up_qc_p1", "up_qc_p4"]) {
      expect(html).not.toContain(`id="${id}"`);
    }
  });

  it("los cilindros se nombran: 'falta el 3' tiene que querer decir algo", () => {
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`Cilindro ${n}`);
  });

  it("la compresión y la calidad siguen leyéndose como UN paso", () => {
    expect(html).toContain('data-grupo="comp"');
    expect(html).toContain('data-grupo="qc"');
    expect(html).toContain('id="up_comp_grupoMeta"');
    expect(html).toContain('id="up_qc_grupoMeta"');
  });

  it("calidad ya no tiene un envío en lote que repita lo ya subido", () => {
    expect(html).not.toContain("up_btnQcUpload");
    expect(html).toContain("up_btnQcListo");
  });

  it("ninguna tarjeta admite varios archivos a la vez: una foto, un slot", () => {
    // `multiple` solo tiene sentido en fallas, que sí es una tanda sin límite.
    const multiples = (html.match(/id="up_([a-z_0-9]+)_file" multiple/g) || [])
      .map((m) => m.replace(/^id="up_|_file" multiple$/g, ""));
    expect(multiples).toEqual(["falla"]);
    expect(html).toContain('id="up_falla_file" multiple');
  });
});
