// =========================
// test/hoja-cc.test.js
// La hoja CONTROL FINAL del inspector de calidad (CC WILMER). Lo que vigila:
// que un carro sin hoja para su modelo no la pueda pedir, y que el X70
// salga con las mismas casillas que el Excel — 75 puntos, en blanco los que
// el original deja en blanco y "x" en los dos sensores de oxígeno.
// =========================

import { describe, it, expect } from "vitest";
import { CC_FILAS, CC_MODELOS, modeloCc_, hojaCcHtml } from "../public/js/templates/views/hoja-cc-view.js";
import { normalizeModelo_ } from "../lib/utils.js";

describe("modeloCc_", () => {
  it("encuentra el X70 por su canónico", () => {
    expect(modeloCc_(normalizeModelo_("JETOUR X70 1.5T DELUXE"))).toBe(CC_MODELOS.X70);
  });
  it("devuelve null para un modelo sin hoja", () => {
    expect(modeloCc_(normalizeModelo_("KYC NEW X5"))).toBeNull();
    expect(modeloCc_(null)).toBeNull();
  });
});

describe("hojaCcHtml · X70", () => {
  const html = hojaCcHtml({ cc: CC_MODELOS.X70, fecha: "27-10-2026", vin: "LVTDB21B8RD123456", tecnico: "WILMER VICENTE" });
  const casillas = [...html.matchAll(/<td class="ccOk(?: ccOkParam)?">([^<]*)<\/td>/g)].map(m => m[1]);

  it("tiene los 75 puntos numerados en orden", () => {
    const ns = CC_FILAS.filter(f => f.n).map(f => f.n);
    expect(ns).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
    expect(casillas).toHaveLength(75);
  });

  it("marca como el Excel", () => {
    const porNumero = Object.fromEntries(CC_FILAS.filter(f => f.n).map((f, i) => [f.n, casillas[i]]));
    for (const n of [22, 38, 40, 41, 53, 55, 68]) expect(porNumero[n]).toBe("");
    expect(porNumero[50]).toBe("x");
    expect(porNumero[51]).toBe("x");
    expect(casillas.filter(c => c === "ok")).toHaveLength(66);
  });

  it("lleva los datos del carro y de quien la pidió", () => {
    expect(html).toContain("CONTROL FINAL -JETOUR X70");
    expect(html).toContain("27-10-2026");
    expect(html).toContain("LVTDB21B8RD123456");
    expect(html).toContain("WILMER VICENTE");
  });
});
