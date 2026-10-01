// La fecha que pide el panel LIVE entra en la CLAVE DEL CACHE y en la ventana
// de las consultas. Por eso se valida antes de usarse y por eso se prueba:
//
//   · una variante basura ("2026-9-1", "../../x") ensucia el cache con una
//     entrada por cada forma de escribir el mismo día
//   · el futuro no tiene cortes que mirar
//   · un tope atrás evita que cualquiera con la sesión abierta pida 2019 y
//     dispare el escaneo de una jornada entera por técnico
//
// Devolver null significa "la jornada en curso", que es el modo en vivo.
import { describe, it, expect } from "vitest";
import { jornadaPedida_ } from "../routes/supervisor.js";

const HOY = "2026-10-01";
const pedir = (fecha) => jornadaPedida_({ query: { fecha } }, HOY);

describe("jornadaPedida_", () => {
  it("sin fecha es la jornada en curso", () => {
    expect(pedir(undefined)).toBe(null);
    expect(pedir("")).toBe(null);
  });

  it("la jornada de hoy también es modo en vivo, no histórico", () => {
    // Si devolviera "2026-10-01" el panel se quedaría sin polling mirando hoy.
    expect(pedir(HOY)).toBe(null);
  });

  it("acepta una jornada pasada tal cual", () => {
    expect(pedir("2026-09-28")).toBe("2026-09-28");
    expect(pedir("2026-06-03")).toBe("2026-06-03");
  });

  it("rechaza el futuro", () => {
    expect(pedir("2026-10-02")).toBe(null);
    expect(pedir("2027-01-01")).toBe(null);
  });

  it("rechaza lo que no es una fecha de verdad", () => {
    expect(pedir("2026-9-1")).toBe(null);        // sin cero: otra clave de cache
    expect(pedir("ayer")).toBe(null);
    expect(pedir("2026-02-31")).toBe(null);      // se normalizaría a marzo
    expect(pedir("../../etc/passwd")).toBe(null);
    expect(pedir("2026-09-28; drop")).toBe(null);
  });

  it("rechaza lo que queda más atrás del tope", () => {
    expect(pedir("2026-06-03")).toBe("2026-06-03");  // 120 días justos
    expect(pedir("2026-06-02")).toBe(null);          // 121: fuera
    expect(pedir("2019-01-01")).toBe(null);
  });
});
