import { describe, it, expect, vi } from "vitest";

// La tabla estado→acciones estaba escrita tres veces (servidor, validación de
// pantalla y botones) y la regla del cierre ajeno hubo que añadirla en las tres.
// Estos tests fijan que ahora hay una sola, y que los botones la obedecen en
// vez de tener su propia copia.

vi.mock("../public/js/core/state.js", () => ({
  CORE: { state: { currentModule: "CALIDAD" } },
}));
vi.mock("../public/js/core/format.js", () => ({
  escapeHtml: (s) => String(s ?? ""),
  cssEsc_: (s) => String(s ?? ""),
}));

const { accionesDe_, ACCIONES_POR_ESTADO } = await import("../lib/ot-estados.js");
const { buildBotonesByEstado_ } = await import("../public/js/work/work-templates.js");

describe("accionesDe_", () => {
  it("cada estado abre lo que le toca", () => {
    expect(accionesDe_("SIN_INICIAR")).toEqual(["INICIO", "NOTA"]);
    expect(accionesDe_("TRABAJANDO")).toEqual(["PAUSA", "FIN", "NOTA"]);
    expect(accionesDe_("PAUSADO")).toEqual(["REANUDAR", "FIN", "NOTA"]);
    expect(accionesDe_("FINALIZADO")).toEqual(["NOTA"]);
  });

  it("un estado desconocido se trata como sin empezar, no abre nada raro", () => {
    for (const v of [null, undefined, "", "ZOMBIE"]) {
      expect(accionesDe_(v)).toEqual(["INICIO", "NOTA"]);
    }
  });

  it("la OT ajena pierde el FIN y solo el FIN", () => {
    expect(accionesDe_("TRABAJANDO", { ajena: true })).toEqual(["PAUSA", "NOTA"]);
    expect(accionesDe_("PAUSADO", { ajena: true })).toEqual(["REANUDAR", "NOTA"]);
  });

  it("no devuelve la tabla, devuelve una copia: nadie puede vaciarla por accidente", () => {
    // La tabla la comparten el servidor y la pantalla: si alguien mutara el
    // array devuelto, se la llevaría por delante para todo el proceso.
    for (const opts of [{}, { ajena: true }]) {
      accionesDe_("TRABAJANDO", opts).push("BORRAR");
      accionesDe_("TRABAJANDO", opts).pop();
    }
    expect(ACCIONES_POR_ESTADO.TRABAJANDO).toEqual(["PAUSA", "FIN", "NOTA"]);
  });
});

describe("buildBotonesByEstado_", () => {
  const actos = (html) => [...html.matchAll(/data-act="([A-Z]+)"/g)].map(m => m[1]);

  it("pinta los botones del estado, sin NOTA (esa la saca el textarea)", () => {
    expect(actos(buildBotonesByEstado_("SIN_INICIAR"))).toEqual(["INICIO"]);
    expect(actos(buildBotonesByEstado_("TRABAJANDO"))).toEqual(["PAUSA", "FIN"]);
    expect(actos(buildBotonesByEstado_("PAUSADO"))).toEqual(["REANUDAR", "FIN"]);
  });

  it("en la OT cerrada NOTA es lo único que queda", () => {
    const html = buildBotonesByEstado_("FINALIZADO");
    expect(actos(html)).toEqual(["NOTA"]);
    expect(html).toContain("GUARDAR NOTA");
  });

  it("en la ajena no hay FIN y dice de quién es el cierre", () => {
    const html = buildBotonesByEstado_("TRABAJANDO", { ajena: true, titularNombre: "WILMER VICENTE" });
    expect(actos(html)).toEqual(["PAUSA"]);
    expect(html).not.toContain("btnFin");
    expect(html).toContain("WILMER VICENTE");
  });

  it("ajena sin nombre del titular no deja el aviso a medias", () => {
    const html = buildBotonesByEstado_("PAUSADO", { ajena: true });
    expect(html).toContain("su titular");
  });
});
