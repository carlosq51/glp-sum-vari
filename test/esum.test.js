import { describe, it, expect } from "vitest";
import { parsearListaAutos_, esZonaIngreso } from "../lib/esum.js";

// Fragmento con la misma forma que devuelve eSUM (lista de autos del taller).
const auto_ = (id, vin, zonaSel) => `
  <div class="lista_autoslista celdarotacionauto_${id} ">
    <span class="imagen_auto_vin">${vin}</span>
    <select id="S_Cambio_FlujoTrabajo_${id}">
      <option value="0">--</option>
      <option value="ZONA DE INGRESO"${zonaSel === "ZONA DE INGRESO" ? " selected" : ""}>ZONA DE INGRESO</option>
      <option value="LISTOS"${zonaSel === "LISTOS" ? " selected" : ""}>LISTOS</option>
      <option value="GLP"${zonaSel === "GLP" ? " selected" : ""}>GLP</option>
    </select>
  </div>`;

describe("eSUM: lista de autos", () => {
  it("saca la zona seleccionada de cada VIN", () => {
    const html = auto_("101", "LGXCE4CB0S0000001", "ZONA DE INGRESO")
               + auto_("102", "LGXCE4CB0S0000002", "GLP")
               + auto_("103", "LGXCE4CB0S0000003", "LISTOS");
    const map = parsearListaAutos_(html);
    expect(map.get("LGXCE4CB0S0000001")).toBe("ZONA DE INGRESO");
    expect(map.get("LGXCE4CB0S0000002")).toBe("GLP");
    expect(map.get("LGXCE4CB0S0000003")).toBe("LISTOS");
    expect(map.size).toBe(3);
  });

  it("solo la zona de ingreso cuenta como ingreso", () => {
    expect(esZonaIngreso("ZONA DE INGRESO")).toBe(true);
    for (const z of ["GLP", "ZONA DE ESPERA GLP", "LISTOS", "RECEPCIÓN", "", null]) {
      expect(esZonaIngreso(z)).toBe(false);
    }
  });
});
