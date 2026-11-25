import { describe, it, expect } from "vitest";
import * as srv from "../lib/zonas-nombre.js";
import * as cli from "../public/js/core/zona-nombre.js";
import { distanciaZonas_ } from "../lib/despacho-motor.js";

describe("zonas de emergencia E16-E18", () => {
  it("se guardan como 116-118 y se muestran con E", () => {
    expect(srv.codigoZona_(116)).toBe("E16");
    expect(srv.nombreZona_(118)).toBe("Zona E18");
    expect(srv.etiquetaZona_(117)).toBe("E17");
    expect(srv.codigoZona_(7)).toBe("Z7");
    expect(srv.nombreZona_(16)).toBe("Zona Libre");
  });

  it("son plazas; el 16 (Zona Libre) no", () => {
    for (const n of [1, 15, 116, 117, 118]) expect(srv.esPlaza_(n)).toBe(true);
    for (const n of [0, 16, 17, 18, 115, 119]) expect(srv.esPlaza_(n)).toBe(false);
  });

  it("la copia del navegador dice lo mismo que la del servidor", () => {
    for (const n of [1, 7, 15, 16, 116, 117, 118, null]) {
      expect(cli.codigoZona_(n)).toBe(srv.codigoZona_(n));
      expect(cli.nombreZona_(n)).toBe(srv.nombreZona_(n));
      expect(cli.etiquetaZona_(n)).toBe(srv.etiquetaZona_(n));
      expect(cli.esPlaza_(n)).toBe(srv.esPlaza_(n));
    }
  });

  it("el motor las ubica encima de la Z15, de frente a Z7-Z9", () => {
    expect(distanciaZonas_(15, 116)).toBe(1);
    expect(distanciaZonas_(116, 7)).toBe(1);
    expect(distanciaZonas_(118, 9)).toBe(1);
    expect(distanciaZonas_(118, 1)).toBe(8);
  });
});
