import { describe, it, expect } from "vitest";

const {
  puedeColaborar_, notaApoyo_, notaDupla_, notaCierreAjeno_, combinarNotas_, horaPeru_,
} = await import("../lib/colaboracion.js");

// La regla por defecto del sistema es que cada OT tiene un dueño y solo él la
// mueve. Estos tests fijan las DOS excepciones, y sobre todo fijan que no se
// abran más de la cuenta: el día que alguien añada un tercer caso, que sea
// a propósito.

describe("puedeColaborar_", () => {
  it("el ayudante del carro extra puede, sin pedirle nada más", () => {
    // Lo mandó ahí el propio motor: negarle el cierre es negar el trabajo que
    // el sistema le asignó.
    expect(puedeColaborar_({ tipoOt: "CONVERSION", esApoyo: true }).permitido).toBe(true);
  });

  it("el ayudante puede aunque el titular no haya arrancado", () => {
    expect(puedeColaborar_({
      tipoOt: "CONVERSION", estadoTitular: "SIN_INICIAR", esApoyo: true,
    }).permitido).toBe(true);
  });

  it("CALIDAD: otro inspector puede si el titular YA empezó", () => {
    for (const est of ["TRABAJANDO", "PAUSADO", "FINALIZADO"]) {
      expect(puedeColaborar_({ tipoOt: "CALIDAD", estadoTitular: est }).permitido).toBe(true);
    }
  });

  it("CALIDAD: NO puede si el titular ni la ha tocado", () => {
    // Una OT sin empezar no es trabajo compartido: es trabajo que no existe, y
    // cerrarla sería cerrar una inspección que nadie hizo.
    const r = puedeColaborar_({ tipoOt: "CALIDAD", estadoTitular: "SIN_INICIAR" });
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe("CALIDAD_SIN_INICIAR");
  });

  it("CONVERSION sin ser ayudante: NO. El dueño del carro sigue siendo uno", () => {
    expect(puedeColaborar_({ tipoOt: "CONVERSION", estadoTitular: "TRABAJANDO" }).permitido).toBe(false);
  });

  it("RAMALERO no abre colaboración", () => {
    expect(puedeColaborar_({ tipoOt: "RAMALERO", estadoTitular: "TRABAJANDO" }).permitido).toBe(false);
  });

  it("sin argumentos no autoriza nada", () => {
    expect(puedeColaborar_().permitido).toBe(false);
    expect(puedeColaborar_({}).permitido).toBe(false);
  });
});

describe("notaApoyo_", () => {
  it("arma el texto que pidió el taller", () => {
    const nota = notaApoyo_({
      companero: "BAILON",
      desdeIso: "2026-09-05T21:00:00Z",   // 16:00 en Lima
      hastaIso: "2026-09-06T00:00:00Z",   // 19:00 en Lima
    });
    expect(nota).toBe("Trabajó con BAILON desde las 16:00 hasta las 19:00");
  });

  it("sin hora de inicio NO inventa una nota a medias", () => {
    // "desde las  hasta las 19:00" es peor que ninguna nota.
    expect(notaApoyo_({ companero: "BAILON", desdeIso: null })).toBe("");
    expect(notaApoyo_({ companero: "BAILON", desdeIso: "no es fecha" })).toBe("");
  });

  it("sin compañero tampoco", () => {
    expect(notaApoyo_({ companero: "", desdeIso: "2026-09-05T21:00:00Z" })).toBe("");
  });

  it("sin hora de fin usa la de ahora, no deja el texto colgando", () => {
    const nota = notaApoyo_({ companero: "BAILON", desdeIso: "2026-09-05T21:00:00Z" });
    expect(nota).toMatch(/^Trabajó con BAILON desde las 16:00 hasta las \d{2}:\d{2}$/);
  });
});

describe("horaPeru_", () => {
  it("convierte a hora de Lima, no a UTC", () => {
    // 21:00 UTC son las 16:00 en Lima (UTC-5, sin horario de verano).
    expect(horaPeru_("2026-09-05T21:00:00Z")).toBe("16:00");
  });

  it("una fecha inválida devuelve vacío, no 'Invalid Date'", () => {
    for (const v of [null, undefined, "", 0, "ayer"]) expect(horaPeru_(v)).toBe("");
  });
});

describe("notaCierreAjeno_ y combinarNotas_", () => {
  it("deja rastro de quién cerró lo que no era suyo", () => {
    expect(notaCierreAjeno_({ cerradoPor: "WILMER" })).toBe("Cerrada por WILMER");
  });

  it("sin nombre no ensucia la nota", () => {
    expect(notaCierreAjeno_({})).toBe("");
  });

  it("combina sin separadores sueltos ni repetidos", () => {
    expect(combinarNotas_("Nota del técnico", "", null, "Cerrada por WILMER"))
      .toBe("Nota del técnico · Cerrada por WILMER");
    expect(combinarNotas_("igual", "igual")).toBe("igual");
    expect(combinarNotas_("", null, undefined)).toBe("");
  });

  it("la nota del sistema se AÑADE a la del técnico, no la pisa", () => {
    const r = combinarNotas_("Fuga en el reductor", "Trabajó con BAILON desde las 16:00 hasta las 19:00");
    expect(r).toContain("Fuga en el reductor");
    expect(r).toContain("BAILON");
  });
});

describe("notaDupla_", () => {
  it("dice DUPLA, no 'trabajó con': no son lo mismo", () => {
    // En el apoyo el carro es del ancla; en la dupla el crédito se reparte por
    // alternancia. Confundirlos en el reporte es confundir quién hizo qué.
    const nota = notaDupla_({
      companero: "BAILON",
      desdeIso: "2026-09-05T21:00:00Z",
      hastaIso: "2026-09-06T00:00:00Z",
    });
    expect(nota).toBe("Trabajo en dupla con BAILON desde las 16:00 hasta las 19:00");
    expect(nota).not.toContain("Trabajó con");
  });

  it("sin hora SÍ escribe la nota: el hecho de la dupla vale por sí solo", () => {
    // A diferencia de notaApoyo_, aquí el dato importante es CON QUIÉN, no
    // cuándo. Perder la hora no debe borrar que el carro lo hicieron dos.
    expect(notaDupla_({ companero: "BAILON", desdeIso: null }))
      .toBe("Trabajo en dupla con BAILON");
  });

  it("sin compañero no escribe nada", () => {
    expect(notaDupla_({ companero: "", desdeIso: "2026-09-05T21:00:00Z" })).toBe("");
    expect(notaDupla_({})).toBe("");
  });
});
