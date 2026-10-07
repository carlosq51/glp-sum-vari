// =========================
// test/informe-imprimible.test.js
// Las hojas que salen solas por la impresora, sin pasar por el formulario
// de la oficina. Lo que vigila: que un informe a medias ("imprimir ya")
// salga con lo que hay y deje en blanco lo del compañero, y que las horas
// vayan en hora de Lima aunque el servidor corra en UTC.
// =========================

import { describe, it, expect } from "vitest";
import { datosHojas_, hojasInformeHtml } from "../public/js/templates/views/informe-imprimible.js";
import { aplanarInforme_, fusionarInforme_ } from "../lib/informes.js";

// 2026-10-07 16:30 en Lima (UTC-5).
const AHORA = Date.parse("2026-10-07T21:30:00Z");

function aMedias_() {
  const datos = fusionarInforme_(null, "TANQUE", {
    nombre: "ANTHONY RAMOS",
    marcados: [21, 22, 23],
    etapas: { tanque: true },
  });
  datos.comun.ot = "4512";
  datos.comun.vin = "lvvdb21b8rd123456";
  datos.personas = [
    { rol: "MOTOR", nombre: "GROBERT JOEL", inicio: "2026-10-07T13:05:00Z", fin: null, fotos: {} },
    { rol: "TANQUE", nombre: "ANTHONY RAMOS", inicio: "2026-10-07T14:10:00Z", fin: "2026-10-07T20:45:00Z", fotos: {} },
  ];
  return aplanarInforme_(datos);
}

describe("informe a medias (imprimir ya)", () => {
  it("lleva los puntos de quien mandó y nada más", () => {
    const d = datosHojas_(aMedias_(), AHORA);
    expect(d.chequeo.marcados).toEqual([21, 22, 23]);
    expect(d.chequeo.bateria).toEqual({ v: "", ai: "", af: "" });
  });

  it("firma los dos, el tanquero al final y una sola vez", () => {
    const d = datosHojas_(aMedias_(), AHORA);
    expect(d.informe.tecnicos).toEqual(["GROBERT JOEL", "ANTHONY RAMOS"]);
    expect(d.chequeo.tanquero).toBe("ANTHONY RAMOS");
  });

  it("horas en Lima; quien no cerró termina a la hora de imprimir", () => {
    const [motor, tanque] = datosHojas_(aMedias_(), AHORA).produccion.filas;
    expect(motor).toMatchObject({ fecha: "07-10-26", inicio: "08:05", fin: "16:30" });
    expect(tanque).toMatchObject({ inicio: "09:10", fin: "15:45", marcas: { tanque: true } });
  });

  it("el VIN va en la línea de placa, en mayúsculas", () => {
    const d = datosHojas_(aMedias_(), AHORA);
    expect(d.informe.placa).toBe("LVVDB21B8RD123456");
    expect(d.chequeo.fecha).toBe("07-10-2026");
  });

  it("salen las tres hojas", () => {
    const html = hojasInformeHtml(aMedias_(), AHORA);
    expect(html).toContain("itHoja");
    expect(html).toContain("cjHoja");
    expect(html).toContain("pdHoja");
  });
});
