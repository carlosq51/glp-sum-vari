import { describe, it, expect } from "vitest";

const { mannWhitney_, comparativaTecnicos_, celdaDe_ } =
  await import("../lib/desempeno.js");

// Lo que estos tests fijan es UNA idea: que el cuadro mida al técnico y no al
// reparto del despacho. Un técnico al que solo le tocan modelos difíciles no
// puede salir peor por eso, y uno con ocho carros afortunados no puede
// encabezar el ranking.

describe("mannWhitney_", () => {
  it("dos muestras separadas de verdad se detectan", () => {
    const rapido = [0.6, 0.65, 0.7, 0.72, 0.75, 0.8];
    const lento = [1.2, 1.25, 1.3, 1.35, 1.4, 1.5];
    const r = mannWhitney_(rapido, lento);
    expect(r.ok).toBe(true);
    expect(r.exacto).toBe(true);
    expect(r.significativa).toBe(true);
  });

  it("dos muestras entremezcladas NO se declaran distintas", () => {
    const a = [0.9, 1.1, 0.95, 1.05, 1.0, 1.2];
    const b = [1.0, 0.92, 1.15, 0.98, 1.08, 1.02];
    expect(mannWhitney_(a, b).significativa).toBe(false);
  });

  it("solo mira el ORDEN: la OT de 947 h no vuelve significativo lo que no lo es", () => {
    const a = [0.9, 1.1, 0.95, 1.05, 1.0, 947];
    const b = [1.0, 0.92, 1.15, 0.98, 1.08, 1.02];
    // Con medias, ese 947 haría "ganar" al grupo b por goleada.
    expect(mannWhitney_(a, b).significativa).toBe(false);
  });

  it("con menos de 3 contra 3 no se pronuncia", () => {
    expect(mannWhitney_([1, 2], [5, 6, 7]).ok).toBe(false);
  });

  it("separación total de 3 contra 3 da el p exacto de la tabla", () => {
    // 1 de cada 20 repartos posibles; bilateral, 0,1: no alcanza y lo dice.
    const r = mannWhitney_([1, 2, 3], [4, 5, 6]);
    expect(r.p).toBeCloseTo(0.1, 10);
    expect(r.significativa).toBe(false);
  });

  it("con empates cae a la normal en vez de fingir un exacto", () => {
    const a = Array(12).fill(1).concat([1.1, 1.2]);
    const b = Array(12).fill(1).concat([0.9, 0.8]);
    const r = mannWhitney_(a, b);
    expect(r.ok).toBe(true);
    expect(r.exacto).toBe(false);
  });
});

describe("comparativaTecnicos_", () => {
  /**
   * Taller de mentira: `perfil` da el multiplicador de cada técnico y `mix`
   * cuántos carros de cada celda le tocan.
   */
  const armar_ = (perfil, mix, basePorCelda) => {
    const out = [];
    for (const [tecnico, factor] of Object.entries(perfil)) {
      for (const [celda, cuantos] of Object.entries(mix[tecnico] || {})) {
        for (let i = 0; i < cuantos; i++) {
          const ruido = ((i * 37) % 9) / 100 - 0.04;    // ±4%, determinista
          out.push({ tecnico, celda, y: basePorCelda[celda] * factor * (1 + ruido) });
        }
      }
    }
    return out;
  };

  const BASE = { "MOTOR|FACIL": 2, "MOTOR|DIFICIL": 5 };

  it("el que solo hace el modelo DIFÍCIL no sale penalizado por eso", () => {
    // Los tres trabajan igual de bien (factor 1). Lo único que cambia es qué
    // carros les tocaron. Sin celdas, "Ana" tendría el doble de horas y
    // encabezaría la lista de lentos sin haber hecho nada mal.
    const carros = armar_(
      { Ana: 1, Beto: 1, Caro: 1 },
      {
        Ana:  { "MOTOR|DIFICIL": 10 },
        Beto: { "MOTOR|FACIL": 10, "MOTOR|DIFICIL": 6 },
        Caro: { "MOTOR|FACIL": 10, "MOTOR|DIFICIL": 6 },
      }, BASE);

    const { filas } = comparativaTecnicos_(carros);
    const ana = filas.find(f => f.tecnico === "Ana");
    expect(ana.indice).toBeGreaterThan(0.9);
    expect(ana.indice).toBeLessThan(1.1);
    expect(ana.significativo).toBe(false);
  });

  it("un técnico realmente más rápido sale marcado y con el signo correcto", () => {
    const carros = armar_(
      { Ana: 0.7, Beto: 1, Caro: 1, Dani: 1 },
      {
        Ana:  { "MOTOR|FACIL": 12, "MOTOR|DIFICIL": 8 },
        Beto: { "MOTOR|FACIL": 12, "MOTOR|DIFICIL": 8 },
        Caro: { "MOTOR|FACIL": 12, "MOTOR|DIFICIL": 8 },
        Dani: { "MOTOR|FACIL": 12, "MOTOR|DIFICIL": 8 },
      }, BASE);

    const { filas } = comparativaTecnicos_(carros);
    expect(filas[0].tecnico).toBe("Ana");
    expect(filas[0].indice).toBeLessThan(0.8);
    expect(filas[0].mejor).toBe(true);
    expect(filas[0].significativo).toBe(true);
  });

  it("el encogimiento impide que 5 carros con suerte encabecen el cuadro", () => {
    // Suertudo tiene CINCO carros y todos le salieron redondos (0,70 del
    // listón). Firme sostiene 0,80 a lo largo de cuarenta. En crudo gana el de
    // cinco; ordenar por ahí sería premiar la racha, y el lunes siguiente el
    // cuadro diría otra cosa.
    const rep_ = (tecnico, cuantos, y) =>
      Array.from({ length: cuantos }, (_, i) => ({ tecnico, celda: "MOTOR|X", y: y + (i % 5) * 0.001 }));
    const carros = [
      ...rep_("Suertudo", 5, 1.4),
      ...rep_("Firme", 40, 1.6),
      ...rep_("Beto", 30, 2.0),
      ...rep_("Caro", 30, 2.0),
    ];

    const { filas } = comparativaTecnicos_(carros);
    const suertudo = filas.find(f => f.tecnico === "Suertudo");
    const firme = filas.find(f => f.tecnico === "Firme");

    // En crudo el de 5 carros parece el mejor…
    expect(suertudo.indice).toBeLessThan(firme.indice);
    // …pero el cuadro se ordena por lo que se puede defender delante de la
    // persona, y ahí manda quien lo sostiene con cuarenta.
    expect(filas[0].tecnico).toBe("Firme");
    expect(suertudo.indiceAjustado).toBeGreaterThan(firme.indiceAjustado);
  });

  it("nadie se compara consigo mismo: el dueño de la celda no fija su propio listón", () => {
    // Ana hace casi todos los carros del modelo y es lenta. Si el listón la
    // incluyera, su índice daría ~1 y el problema quedaría invisible.
    const carros = [
      ...Array.from({ length: 14 }, (_, i) => ({ tecnico: "Ana", celda: "MOTOR|X", y: 5 + (i % 3) * 0.1 })),
      ...Array.from({ length: 6 }, (_, i) => ({ tecnico: "Beto", celda: "MOTOR|X", y: 3 + (i % 3) * 0.1 })),
    ];
    const { filas } = comparativaTecnicos_(carros);
    const ana = filas.find(f => f.tecnico === "Ana");
    expect(ana.indice).toBeGreaterThan(1.5);
  });

  it("los carros sin con quién compararse se cuentan, no se cuelan", () => {
    // Un modelo que solo tocó una persona: no hay pares y no hay comparación
    // posible. Es un hecho del reparto, y se informa en vez de inventarlo.
    const carros = [
      ...Array.from({ length: 8 }, () => ({ tecnico: "Ana", celda: "MOTOR|RARO", y: 4 })),
      ...Array.from({ length: 8 }, (_, i) => ({ tecnico: "Ana", celda: "MOTOR|X", y: 2 + i * 0.01 })),
      ...Array.from({ length: 8 }, (_, i) => ({ tecnico: "Beto", celda: "MOTOR|X", y: 2 + i * 0.01 })),
    ];
    const r = comparativaTecnicos_(carros);
    expect(r.sinComparar).toBe(8);
    expect(r.comparables).toBe(16);
    expect(r.celdasUsadas).toBe(1);
  });

  it("quien tiene pocos carros queda aparte en vez de aparecer con un número inventado", () => {
    const carros = [
      ...Array.from({ length: 10 }, (_, i) => ({ tecnico: "Ana", celda: "MOTOR|X", y: 2 + i * 0.01 })),
      ...Array.from({ length: 10 }, (_, i) => ({ tecnico: "Beto", celda: "MOTOR|X", y: 2 + i * 0.01 })),
      { tecnico: "Nuevo", celda: "MOTOR|X", y: 1.2 },
      { tecnico: "Nuevo", celda: "MOTOR|X", y: 1.3 },
    ];
    const { filas, pocos } = comparativaTecnicos_(carros);
    expect(filas.some(f => f.tecnico === "Nuevo")).toBe(false);
    expect(pocos).toEqual([{ tecnico: "Nuevo", n: 2 }]);
  });

  it("sin datos devuelve un cuadro vacío y no revienta", () => {
    const r = comparativaTecnicos_([]);
    expect(r.filas).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("celdaDe_ separa puesto y modelo, y normaliza mayúsculas", () => {
    expect(celdaDe_("motor", " Jetour X70 ")).toBe("MOTOR|JETOUR X70");
    expect(celdaDe_("MOTOR", "X70")).not.toBe(celdaDe_("TANQUE", "X70"));
  });
});
