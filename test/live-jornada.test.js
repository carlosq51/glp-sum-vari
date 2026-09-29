// Lo que aquí se prueba es lo que el LIVE muestra como verdad operativa:
// el objetivo del mes y el nombre de un ramal. Son los dos sitios donde un
// error no se ve — un número plausible y una etiqueta plausible — y donde el
// supervisor toma decisiones igual.
import { describe, it, expect } from "vitest";
import { jornadasDelMes_ } from "../routes/supervisor.js";
import { slugMarca_ } from "../lib/utils.js";
import { GRUPOS_OFICIO, grupoDeRol_ } from "../public/js/core/domain-meta.js";
import {
  etiquetaTrabajo_, hhmmAMin_, minAHhmm_, minutosPE_,
  bloquesJornada_, indiceBloque_,
} from "../public/js/core/format.js";

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

// Los cortes del taller (05:00–10:00 … 23:00–01:00) tienen dos trampas que un
// "agrupar por hora" no ve: caen en :20 y el último cruza la medianoche.
const CORTES = "05:00,10:00,13:00,16:20,19:20,23:00,01:00";

describe("hhmmAMin_ / minAHhmm_", () => {
  it("van y vuelven", () => {
    expect(hhmmAMin_("05:30")).toBe(330);
    expect(minAHhmm_(330)).toBe("05:30");
    expect(hhmmAMin_("00:00")).toBe(0);
    expect(minAHhmm_(0)).toBe("00:00");
  });

  it("una hora imposible es null, no un número raro", () => {
    // Estos valores salen de app_config, que edita una persona a mano.
    expect(hhmmAMin_("25:00")).toBe(null);
    expect(hhmmAMin_("10:75")).toBe(null);
    expect(hhmmAMin_("manana")).toBe(null);
    expect(hhmmAMin_("")).toBe(null);
  });
});

describe("bloquesJornada_", () => {
  it("N+1 límites dan N bloques, con su etiqueta", () => {
    const b = bloquesJornada_(CORTES);
    expect(b).toHaveLength(6);
    expect(b.map(x => x.label)).toEqual([
      "05:00–10:00", "10:00–13:00", "13:00–16:20",
      "16:20–19:20", "19:20–23:00", "23:00–01:00",
    ]);
  });

  it("el bloque que cruza la medianoche se linealiza, no se invierte", () => {
    const ultimo = bloquesJornada_(CORTES).at(-1);
    expect(ultimo.ini).toBe(23 * 60);        // 23:00 del día
    expect(ultimo.fin).toBe(24 * 60 + 60);   // 01:00 del siguiente
    expect(ultimo.fin).toBeGreaterThan(ultimo.ini);
  });

  it("sin al menos dos límites no hay bloques que dibujar", () => {
    expect(bloquesJornada_("05:00")).toEqual([]);
    expect(bloquesJornada_("")).toEqual([]);
    expect(bloquesJornada_(null)).toEqual([]);
  });

  it("ignora la basura entre límites válidos en vez de romper la tabla", () => {
    expect(bloquesJornada_("05:00,xx,13:00").map(x => x.label))
      .toEqual(["05:00–13:00"]);
  });
});

describe("indiceBloque_", () => {
  const b = bloquesJornada_(CORTES);
  const en = (hhmm) => indiceBloque_(hhmmAMin_(hhmm), b);

  it("cada corte abre su bloque y cierra el anterior", () => {
    expect(en("05:00")).toBe(0);
    expect(en("09:59")).toBe(0);
    expect(en("10:00")).toBe(1);
  });

  it("respeta un corte en :20, que es donde falla agrupar por hora", () => {
    // Las 16:19 y las 16:20 son la misma HORA y turnos distintos.
    expect(en("16:19")).toBe(2);
    expect(en("16:20")).toBe(3);
  });

  it("lo cerrado de madrugada cae en el turno noche, no fuera", () => {
    expect(en("23:00")).toBe(5);
    expect(en("00:30")).toBe(5);
  });

  it("fuera de la jornada devuelve -1 en vez de colarse en un turno", () => {
    // Entre el fin (01:00) y el inicio (05:00) el taller no corta nada.
    expect(en("01:00")).toBe(-1);
    expect(en("03:00")).toBe(-1);
    expect(en("04:59")).toBe(-1);
  });

  it("sin bloques no revienta", () => {
    expect(indiceBloque_(600, [])).toBe(-1);
    expect(indiceBloque_(NaN, b)).toBe(-1);
  });
});

describe("minutosPE_", () => {
  it("mide en hora Perú, no en la del navegador ni UTC", () => {
    // 2026-09-29T02:30:00Z = 21:30 del 28 en Lima (UTC-5).
    expect(minutosPE_(new Date("2026-09-29T02:30:00Z"))).toBe(21 * 60 + 30);
  });

  it("un cierre de las 23:40 de Lima cae en el turno noche", () => {
    // Su fecha UTC ya es del día siguiente; medido en UTC se iría a las 04:40
    // y caería FUERA de la jornada, perdiendo el cierre de la tabla.
    const d = new Date("2026-09-30T04:40:00Z");
    const b = bloquesJornada_(CORTES);
    expect(indiceBloque_(minutosPE_(d), b)).toBe(5);
  });
});

// Mezclar oficios en una sola lista ordenada por total hacía que el ramalero
// que armó 8 ramales saliera encima del motorista que cerró 3 medios carros,
// como si hubiera producido más. No miden lo mismo.
describe('grupoDeRol_', () => {
  it('las dos mitades del carro caen en el mismo oficio', () => {
    expect(grupoDeRol_('MOTOR').id).toBe('CONVERSION');
    expect(grupoDeRol_('TANQUE').id).toBe('CONVERSION');
  });

  it('calidad y ramales van por su cuenta', () => {
    expect(grupoDeRol_('CALIDAD').id).toBe('CALIDAD');
    expect(grupoDeRol_('RAMALERO').id).toBe('RAMALES');
  });

  it('no inventa grupo para un rol que no conoce', () => {
    // La tabla lo manda a "Otros" en vez de colarlo en Conversión y falsear
    // el subtotal de carros.
    expect(grupoDeRol_('MOVILIZADOR')).toBe(null);
    expect(grupoDeRol_('')).toBe(null);
    expect(grupoDeRol_(null)).toBe(null);
  });

  it('cada oficio dice en qué unidad cuenta', () => {
    // Sin esto la tabla enseña tres columnas TOT que parecen comparables.
    for (const g of GRUPOS_OFICIO) expect(g.unidad).toBeTruthy();
    expect(GRUPOS_OFICIO.map(g => g.id)).toEqual(['CONVERSION', 'CALIDAD', 'RAMALES']);
  });

  it('ningún rol pertenece a dos oficios a la vez', () => {
    const todos = GRUPOS_OFICIO.flatMap(g => g.roles);
    expect(new Set(todos).size).toBe(todos.length);
  });
});
