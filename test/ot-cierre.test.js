import { describe, it, expect } from "vitest";

const {
  esOtDeUnSoloRol_, estadoGeneralDeAsignacion_, estadoGeneralDeConversion_, OT_DE_UN_SOLO_ROL,
} = await import("../lib/utils.js");

// Estos tests existen por un bug concreto: la rama que cierra las OTs solo
// contemplaba CONVERSION y CALIDAD. RAMALERO no caía en ninguna, así que sus
// work_orders se quedaban con el "PENDIENTE" del alta aunque el ramalero
// hubiera terminado. Se acumularon 695 OTs dadas por vivas con el trabajo
// hecho, algunas de más de tres meses, ensuciando justo la consola donde el
// supervisor mira qué falta.

describe("esOtDeUnSoloRol_", () => {
  it("RAMALERO decide el estado de su propia OT (el caso que faltaba)", () => {
    expect(esOtDeUnSoloRol_("RAMALERO", "RAMALERO")).toBe(true);
  });

  it("CALIDAD sigue decidiendo el estado de su OT", () => {
    expect(esOtDeUnSoloRol_("CALIDAD", "CALIDAD")).toBe(true);
  });

  it("CONVERSION NO entra: espera a MOTOR y TANQUE, y esa regla vive aparte", () => {
    expect(esOtDeUnSoloRol_("CONVERSION", "MOTOR")).toBe(false);
    expect(esOtDeUnSoloRol_("CONVERSION", "TANQUE")).toBe(false);
  });

  it("el rol tiene que coincidir con el tipo de OT", () => {
    // Una asignación de CALIDAD sobre una OT de RAMALERO no cierra esa OT.
    expect(esOtDeUnSoloRol_("RAMALERO", "CALIDAD")).toBe(false);
    expect(esOtDeUnSoloRol_("CALIDAD", "RAMALERO")).toBe(false);
  });

  it("tolera minúsculas, nulos y vacíos sin romper", () => {
    expect(esOtDeUnSoloRol_("ramalero", "ramalero")).toBe(true);
    expect(esOtDeUnSoloRol_(null, null)).toBe(false);
    expect(esOtDeUnSoloRol_("", "")).toBe(false);
    expect(esOtDeUnSoloRol_(undefined, "RAMALERO")).toBe(false);
  });

  it("la lista de tipos de un solo rol no incluye CONVERSION", () => {
    expect(OT_DE_UN_SOLO_ROL).not.toContain("CONVERSION");
  });
});

describe("estadoGeneralDeAsignacion_", () => {
  it("FINALIZADO cierra la OT — sin esto quedaba viva para siempre", () => {
    expect(estadoGeneralDeAsignacion_("FINALIZADO")).toBe("FINALIZADO");
  });

  it("TRABAJANDO cuenta como EN PROCESO", () => {
    // Es el estado que emiten de verdad las asignaciones. La versión anterior
    // solo miraba el literal "EN PROCESO", que no lo escribe nadie, y una OT
    // en curso figuraba PENDIENTE.
    expect(estadoGeneralDeAsignacion_("TRABAJANDO")).toBe("EN PROCESO");
  });

  it("PAUSADO sigue siendo EN PROCESO: la OT está tomada, no libre", () => {
    expect(estadoGeneralDeAsignacion_("PAUSADO")).toBe("EN PROCESO");
  });

  it("SIN_INICIAR queda PENDIENTE", () => {
    expect(estadoGeneralDeAsignacion_("SIN_INICIAR")).toBe("PENDIENTE");
  });

  it("un estado desconocido cae a PENDIENTE, nunca a FINALIZADO", () => {
    // Errar hacia PENDIENTE deja trabajo visible de más; errar hacia
    // FINALIZADO lo haría desaparecer de la consola del supervisor.
    for (const raro of ["", null, undefined, "CUALQUIERA", 0]) {
      expect(estadoGeneralDeAsignacion_(raro)).toBe("PENDIENTE");
    }
  });

  it("no distingue mayúsculas", () => {
    expect(estadoGeneralDeAsignacion_("finalizado")).toBe("FINALIZADO");
    expect(estadoGeneralDeAsignacion_("trabajando")).toBe("EN PROCESO");
  });
});

// Una conversión la hacen DOS. Esta regla existía escrita a mano dentro del
// handler que registra eventos, así que solo se aplicaba cuando un técnico
// finalizaba su parte: al QUITARLE un puesto a un carro ya cerrado, nadie la
// volvía a evaluar y la OT se quedaba en FINALIZADO con medio trabajo sin
// hacer. Pasó de verdad, y solo se vio contando a mano.
describe("estadoGeneralDeConversion_", () => {
  const m = (estado) => ({ rol_trabajo: "MOTOR",  estado_actual: estado });
  const t = (estado) => ({ rol_trabajo: "TANQUE", estado_actual: estado });

  it("FINALIZADO solo con LOS DOS puestos terminados", () => {
    expect(estadoGeneralDeConversion_([m("FINALIZADO"), t("FINALIZADO")])).toBe("FINALIZADO");
  });

  it("un puesto terminado y el otro vacío NO es una conversión terminada", () => {
    expect(estadoGeneralDeConversion_([m("FINALIZADO")])).toBe("EN PROCESO");
    expect(estadoGeneralDeConversion_([t("FINALIZADO")])).toBe("EN PROCESO");
  });

  it("uno terminado y el otro trabajando: EN PROCESO", () => {
    expect(estadoGeneralDeConversion_([m("FINALIZADO"), t("TRABAJANDO")])).toBe("EN PROCESO");
  });

  it("sin asignaciones, PENDIENTE", () => {
    expect(estadoGeneralDeConversion_([])).toBe("PENDIENTE");
    expect(estadoGeneralDeConversion_()).toBe("PENDIENTE");
  });

  it("la anulada no cuenta: es justo el caso que trajo esta función", () => {
    const anulada = { ...t("FINALIZADO"), activo: false };
    expect(estadoGeneralDeConversion_([m("FINALIZADO"), anulada])).toBe("EN PROCESO");
  });

  it("ignora roles que no son de conversión", () => {
    const calidad = { rol_trabajo: "CALIDAD", estado_actual: "FINALIZADO" };
    expect(estadoGeneralDeConversion_([m("FINALIZADO"), calidad])).toBe("EN PROCESO");
  });

  it("no distingue mayúsculas", () => {
    expect(estadoGeneralDeConversion_([
      { rol_trabajo: "motor", estado_actual: "finalizado" },
      { rol_trabajo: "tanque", estado_actual: "finalizado" },
    ])).toBe("FINALIZADO");
  });
});
