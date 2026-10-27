// =========================
// test/hoja-cc.test.js
// La hoja CONTROL FINAL del inspector de calidad (CC WILMER). Lo que vigila:
// que un carro sin hoja para su modelo no la pueda pedir, y que el X70
// salga con las mismas casillas que el Excel — 75 puntos, en blanco los que
// el original deja en blanco y "x" en los dos sensores de oxígeno.
// =========================

import { describe, it, expect } from "vitest";
import { CC_FILAS, CC_MODELOS, modeloCc_, hojaCcHtml, limpiarMarcasCc_ } from "../public/js/templates/views/hoja-cc-view.js";
import { normalizeModelo_ } from "../lib/utils.js";

describe("modeloCc_", () => {
  it("encuentra el X70 por su canónico", () => {
    expect(modeloCc_(normalizeModelo_("JETOUR X70 1.5T DELUXE"))).toBe(CC_MODELOS.X70);
  });
  it("devuelve null para un modelo sin hoja", () => {
    expect(modeloCc_(normalizeModelo_("KYC NEW V7"))).toBeNull();
    expect(modeloCc_(null)).toBeNull();
  });
});

describe("hojaCcHtml · X70", () => {
  const html = hojaCcHtml({ cc: CC_MODELOS.X70, fecha: "27-10-2026", vin: "LVTDB21B8RD123456", tecnico: "WILMER VICENTE" });
  const casillas = [...html.matchAll(/<td class="ccOk[^"]*">([^<]*)<\/td>/g)].map(m => m[1]);

  it("tiene los 75 puntos numerados en orden", () => {
    const ns = CC_FILAS.filter(f => f.n).map(f => f.n);
    expect(ns).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
    expect(casillas).toHaveLength(75);
  });

  it("marca como el Excel", () => {
    const porNumero = Object.fromEntries(CC_FILAS.filter(f => f.n).map((f, i) => [f.n, casillas[i]]));
    for (const n of [22, 38, 53, 55, 68]) expect(porNumero[n]).toBe("");
    expect(porNumero[40]).toBe("ok");
    expect(porNumero[41]).toBe("ok");
    expect(porNumero[50]).toBe("x");
    expect(porNumero[51]).toBe("x");
    expect(casillas.filter(c => c === "ok")).toHaveLength(68);
  });

  it("lleva los datos del carro y de quien la pidió", () => {
    expect(html).toContain("CONTROL FINAL -JETOUR X70");
    expect(html).toContain("27-10-2026");
    expect(html).toContain("LVTDB21B8RD123456");
    expect(html).toContain("WILMER VICENTE");
  });
});

describe("hojaCcHtml · parámetros del X70", () => {
  const html = hojaCcHtml({ cc: CC_MODELOS.X70 });
  it("raya V7 y V5 V3, deja el del X70", () => {
    const rayas = [...html.matchAll(/<s class="ccRaya">([^<]*)<\/s>/g)].map(m => m[1]);
    expect(rayas).toEqual(["(14,13,13,14 ) V7", "(12.5,11.5,11.5,12.5) V5 V3", "1.28 BAR V7", "1.25bar                       V5 V3"]);
    expect(html).toContain("( 13,11,11,13 ) X70");
    expect(html).not.toMatch(/<s class="ccRaya">[^<]*X70/);
  });
});

describe("marcas del inspector", () => {
  const cc = CC_MODELOS.X70;

  it("guarda solo lo que cambia respecto del modelo, y solo valores válidos", () => {
    expect(limpiarMarcasCc_(cc, { 22: "ok", 1: "ok", 50: "x", 51: "ok", 2: "", 99: "ok", 3: "si" }))
      .toEqual({ 22: "ok", 51: "ok", 2: "" });
    expect(limpiarMarcasCc_(cc, null)).toEqual({});
  });

  it("lo que marcó pisa al modelo en el papel", () => {
    const html = hojaCcHtml({ cc, marcas: { 22: "ok", 2: "" } });
    const casillas = [...html.matchAll(/<td class="ccOk[^"]*">([^<]*)<\/td>/g)].map(m => m[1]);
    const porNumero = Object.fromEntries(CC_FILAS.filter(f => f.n).map((f, i) => [f.n, casillas[i]]));
    expect(porNumero[22]).toBe("ok");
    expect(porNumero[2]).toBe("");
    expect(porNumero[38]).toBe("");
  });
});

describe("hojas KYC", () => {
  const rayas = (cc) => [...hojaCcHtml({ cc }).matchAll(/<s class="ccRaya">([^<]*)<\/s>/g)].map(m => m[1].trim());

  it("V3 y V5 se encuentran por su canónico", () => {
    expect(modeloCc_(normalizeModelo_("KYC NEW V3"))).toBe(CC_MODELOS.V3);
    expect(modeloCc_(normalizeModelo_("V5 CARGO"))).toBe(CC_MODELOS.V5);
    expect(modeloCc_(normalizeModelo_("KYC NEW X5"))).toBe(CC_MODELOS.X5);
  });

  it("V3/V5 rayan V7 y X70 y dejan V5 V3", () => {
    for (const cc of [CC_MODELOS.V3, CC_MODELOS.V5]) {
      expect(rayas(cc)).toEqual(["(14,13,13,14 ) V7", "( 13,11,11,13 ) X70", "1.28 BAR V7", "1.25bar             X70"]);
    }
  });

  it("X5 raya las tres familias y la casilla va con ok", () => {
    expect(rayas(CC_MODELOS.X5)).toHaveLength(6);
    const casillas = [...hojaCcHtml({ cc: CC_MODELOS.X5 }).matchAll(/<td class="ccOk[^"]*">([^<]*)<\/td>/g)].map(m => m[1]);
    const porNumero = Object.fromEntries(CC_FILAS.filter(f => f.n).map((f, i) => [f.n, casillas[i]]));
    expect([porNumero[40], porNumero[41], porNumero[38], porNumero[55]]).toEqual(["ok", "ok", "-", "-"]);
    expect(hojaCcHtml({ cc: CC_MODELOS.X5 }).match(/class="ccTxt ccRoja"/g)).toHaveLength(2);
    expect(hojaCcHtml({ cc: CC_MODELOS.X70 })).not.toContain("ccRoja");
  });
});
