import { describe, it, expect } from "vitest";

const { dimensionesDestino, bytesLegibles, ahorroLegible, LADO_MAX } =
  await import("../public/js/core/image-compress.js");

// Lo que estos tests fijan es una sola idea: que una foto encoja por su lado
// mayor. La versión anterior escalaba mirando solo el ancho, y por eso las
// fotos verticales del celular —que son la mayoría de las que toma un técnico—
// llegaban al servidor casi sin comprimir.

describe("dimensionesDestino", () => {
  it("una foto horizontal grande baja al lado máximo", () => {
    expect(dimensionesDestino(4000, 3000, 800)).toEqual({ ancho: 800, alto: 600 });
  });

  it("una foto VERTICAL grande también baja: manda el lado mayor", () => {
    expect(dimensionesDestino(3000, 4000, 800)).toEqual({ ancho: 600, alto: 800 });
  });

  it("un panorama angosto y larguísimo no se escapa por tener poco ancho", () => {
    // 900 px de ancho: con la regla vieja (solo ancho > máximo) encogía apenas
    // un 11 % y seguía teniendo 3556 px de alto.
    const r = dimensionesDestino(900, 4000, 800);
    expect(r.alto).toBe(800);
    expect(r.ancho).toBe(180);
  });

  it("lo que ya cabe se queda igual: agrandar solo inventa píxeles", () => {
    expect(dimensionesDestino(640, 480, 800)).toEqual({ ancho: 640, alto: 480 });
    expect(dimensionesDestino(800, 800, 800)).toEqual({ ancho: 800, alto: 800 });
  });

  it("conserva la proporción, que es lo que evita fotos estiradas", () => {
    const original = 4032 / 3024;
    const r = dimensionesDestino(4032, 3024, 800);
    expect(r.ancho / r.alto).toBeCloseTo(original, 2);
  });

  it("nunca devuelve cero: un lado degenerado seguiría siendo dibujable", () => {
    const r = dimensionesDestino(10000, 3, 800);
    expect(r.ancho).toBe(800);
    expect(r.alto).toBeGreaterThanOrEqual(1);
  });

  it("dimensiones vacías no revientan ni inventan tamaño", () => {
    expect(dimensionesDestino(0, 0, 800)).toEqual({ ancho: 0, alto: 0 });
  });

  it("el lado máximo por defecto es el mismo que aplica el servidor", () => {
    expect(dimensionesDestino(4000, 3000)).toEqual(dimensionesDestino(4000, 3000, LADO_MAX));
  });
});

describe("bytesLegibles", () => {
  it("escala de unidad en unidad", () => {
    expect(bytesLegibles(512)).toBe("512 B");
    expect(bytesLegibles(2048)).toBe("2.0 KB");
    expect(bytesLegibles(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("nada y cero se leen igual, no como 'undefined'", () => {
    expect(bytesLegibles(0)).toBe("0 B");
    expect(bytesLegibles(undefined)).toBe("0 B");
  });
});

describe("ahorroLegible", () => {
  it("muestra el antes, el después y el porcentaje", () => {
    const t = ahorroLegible({ bytes: 100 * 1024, bytesOriginales: 4 * 1024 * 1024, comprimida: true });
    expect(t).toContain("4.0 MB");
    expect(t).toContain("100.0 KB");
    expect(t).toContain("−98 %");
  });

  it("si la foto subió sin comprimir, no presume de un ahorro que no hubo", () => {
    const t = ahorroLegible({ bytes: 0, bytesOriginales: 3 * 1024 * 1024, comprimida: false });
    expect(t).toBe("3.0 MB");
    expect(t).not.toContain("→");
  });

  it("si comprimir no ahorró nada, tampoco anuncia un ahorro negativo", () => {
    const t = ahorroLegible({ bytes: 200 * 1024, bytesOriginales: 150 * 1024, comprimida: true });
    expect(t).not.toContain("−");
  });

  it("sin argumentos devuelve algo mostrable en vez de romper la tarjeta", () => {
    expect(ahorroLegible()).toBe("0 B");
  });
});
