import { describe, it, expect } from "vitest";
import { fechaPeruMenosDias_ } from "../lib/utils.js";

describe("fechaPeruMenosDias_", () => {
  it("resta días sobre la fecha civil peruana", () => {
    // 2026-09-01T15:00Z = 10:00 en Lima, mismo día civil
    expect(fechaPeruMenosDias_(20, new Date("2026-09-01T15:00:00Z"))).toBe("2026-08-12");
  });

  it("a las 21:00 de Lima sigue contando desde el día peruano, no el UTC", () => {
    // 2026-09-01T02:30Z = 2026-08-31 21:30 en Lima.
    // Restar sobre UTC daría 2026-08-12; sobre la fecha peruana, 2026-08-11.
    expect(fechaPeruMenosDias_(20, new Date("2026-09-01T02:30:00Z"))).toBe("2026-08-11");
  });

  it("cruza el cambio de mes", () => {
    expect(fechaPeruMenosDias_(20, new Date("2026-09-10T15:00:00Z"))).toBe("2026-08-21");
  });

  it("cruza el cambio de año", () => {
    expect(fechaPeruMenosDias_(20, new Date("2027-01-05T15:00:00Z"))).toBe("2026-12-16");
  });

  it("respeta los años bisiestos", () => {
    // 2028 es bisiesto: 2028-03-10 menos 20 días cae en febrero contando el 29.
    expect(fechaPeruMenosDias_(20, new Date("2028-03-10T15:00:00Z"))).toBe("2028-02-19");
  });

  it("0 días es hoy en Perú, no un desplazamiento", () => {
    expect(fechaPeruMenosDias_(0, new Date("2026-09-01T15:00:00Z"))).toBe("2026-09-01");
  });

  it("una entrada basura no corre la ventana hacia el futuro", () => {
    const hoy = "2026-09-01";
    expect(fechaPeruMenosDias_(NaN, new Date("2026-09-01T15:00:00Z"))).toBe(hoy);
    expect(fechaPeruMenosDias_(-5,  new Date("2026-09-01T15:00:00Z"))).toBe(hoy);
    expect(fechaPeruMenosDias_(undefined, new Date("2026-09-01T15:00:00Z"))).toBe(hoy);
  });
});
