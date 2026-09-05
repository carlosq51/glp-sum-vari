import { describe, it, expect } from "vitest";

const {
  esOtDeUnSoloRol_, estadoGeneralDeAsignacion_, OT_DE_UN_SOLO_ROL,
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
