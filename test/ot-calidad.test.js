import { describe, it, expect } from "vitest";
import { limpiarOt_ } from "../routes/ot-calidad.js";

// La OT que Calidad escribe va a ASIGNACIONES col E, y de ahí Apps Script
// solo acepta dígitos con o sin "#" (isValidOT_GAS_). Lo que no pase esa
// regla no se tiene que poder aprobar.
describe("limpiarOt_", () => {
  it("acepta números con y sin #", () => {
    expect(limpiarOt_("9801")).toBe("9801");
    expect(limpiarOt_(" #9801 ")).toBe("#9801");
    expect(limpiarOt_("98 01")).toBe("9801");
  });
  it("rechaza fechas, placeholders y texto", () => {
    for (const v of ["", "#", "####", "02-06", "OT9801", "9801A", null, undefined]) {
      expect(limpiarOt_(v)).toBe("");
    }
  });
});
