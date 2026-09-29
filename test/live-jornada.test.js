// Lo que aquí se prueba es lo que el LIVE muestra como verdad operativa:
// el objetivo del mes y el nombre de un ramal. Son los dos sitios donde un
// error no se ve — un número plausible y una etiqueta plausible — y donde el
// supervisor toma decisiones igual.
import { describe, it, expect } from "vitest";
import { jornadasDelMes_ } from "../routes/supervisor.js";
import { slugMarca_ } from "../lib/utils.js";
import { etiquetaTrabajo_ } from "../public/js/core/format.js";

describe("jornadasDelMes_", () => {
  it("reproduce la forma del mes que lleva el taller (sept 2026: 24 jornadas)", () => {
    // Septiembre 2026: 30 días, 4 domingos (6, 13, 20, 27) y 4 sábados
    // (5, 12, 19, 26). 30 − 4 domingos − 4 sábados = 22 días enteros,
    // más 4 medios sábados = 24 jornadas. Es el número de la hoja.
    const { totales } = jornadasDelMes_("2026-09", 30, 0.5);
    expect(totales).toBe(24);
  });

  it("el acumulado a media mes solo cuenta lo transcurrido", () => {
    // Hasta el 15 inclusive: domingos 6 y 13 (0), sábados 5 y 12 (½ c/u),
    // y 11 días enteros → 12.
    const { transcurridas } = jornadasDelMes_("2026-09", 15, 0.5);
    expect(transcurridas).toBe(12);
  });

  it("el sábado pesa medio y el domingo nada", () => {
    expect(jornadasDelMes_("2026-09", 5,  0.5).pesoHoy).toBe(0.5); // sábado
    expect(jornadasDelMes_("2026-09", 6,  0.5).pesoHoy).toBe(0);   // domingo
    expect(jornadasDelMes_("2026-09", 7,  0.5).pesoHoy).toBe(1);   // lunes
  });

  it("factor 0 saca los sábados del objetivo sin tocar los demás días", () => {
    expect(jornadasDelMes_("2026-09", 30, 0).totales).toBe(22);
    expect(jornadasDelMes_("2026-09", 30, 1).totales).toBe(26);
  });

  it("cuenta bien un febrero bisiesto", () => {
    // 2028: febrero tiene 29 días y empieza en martes.
    const { totales } = jornadasDelMes_("2028-02", 29, 0.5);
    // 29 días: 4 domingos (6,13,20,27) y 4 sábados (5,12,19,26) → 21 + 2.
    expect(totales).toBe(23);
  });
});

describe("slugMarca_", () => {
  it("deja la marca lista para viajar dentro de un código", () => {
    expect(slugMarca_("JETOUR")).toBe("JETOUR");
    expect(slugMarca_("KYC V3")).toBe("KYCV3");
    expect(slugMarca_("volkswagen")).toBe("VOLKSWAGEN");
  });

  it("no deja tildes ni símbolos en una clave que después va en una URL", () => {
    expect(slugMarca_("Camión Ñ-2")).toBe("CAMIONN2");
  });

  it("sin marca devuelve algo legible, no una cadena vacía", () => {
    // Un código que acabara en "--01" no se podría ni leer ni buscar.
    expect(slugMarca_("")).toBe("SINMARCA");
    expect(slugMarca_(null)).toBe("SINMARCA");
  });
});

describe("etiquetaTrabajo_", () => {
  it("un VIN se muestra tal cual", () => {
    const e = etiquetaTrabajo_("LVTDB21B9RD123456", "");
    expect(e).toEqual({ texto: "LVTDB21B9RD123456", titulo: "LVTDB21B9RD123456", esRamal: false });
  });

  it("del código nuevo saca marca y correlativo, sin el cero de relleno", () => {
    const e = etiquetaTrabajo_("RAMAL-260929-JETOUR-07", "JETOUR");
    expect(e.texto).toBe("JETOUR · #7");
    expect(e.esRamal).toBe(true);
    // El código crudo sigue disponible para buscarlo en la base.
    expect(e.titulo).toBe("RAMAL-260929-JETOUR-07");
  });

  it("el código nuevo se lee aunque tipo_ramal venga vacío", () => {
    expect(etiquetaTrabajo_("RAMAL-260929-KYCV3-12", "").texto).toBe("KYCV3 · #12");
  });

  it("un código VIEJO se nombra con tipo_ramal — era el caso roto", () => {
    // El fallback anterior (`a.vin || …`) nunca se disparaba porque un ramal
    // también trae vin, así que en pantalla salía el epoch pelado.
    const e = etiquetaTrabajo_("RAMAL-1790686306788-46NX", "JETOUR");
    expect(e.texto).toBe("JETOUR");
    expect(e.titulo).toBe("RAMAL-1790686306788-46NX");
  });

  it("un código viejo sin marca no se rinde al epoch", () => {
    expect(etiquetaTrabajo_("RAMAL-1790686306788-46NX", "").texto).toBe("RAMAL");
  });

  it("sin nada que mostrar devuelve vacío, no la palabra RAMAL", () => {
    expect(etiquetaTrabajo_("", "JETOUR").texto).toBe("");
  });
});
