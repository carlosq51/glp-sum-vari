import { describe, it, expect } from "vitest";
import { decidirVeredicto_ } from "../routes/invitado.js";

// Esta tabla es la que decide si PDI suelta un carro o lo frena. Un error
// aquí devuelve al problema que originó la vista: carros despachados al
// cliente sin GLP. Por eso cada rama tiene su caso, incluidos los que
// parecen obvios.
describe("invitado · veredicto", () => {
  describe("el carro no lleva GLP", () => {
    it("solicitud anulada → NO LLEVA", () => {
      expect(decidirVeredicto_(true, "ANULADO", null, null)).toBe("ANULADO");
    });

    it("delegado a otra sede → NO LLEVA AQUÍ", () => {
      expect(decidirVeredicto_(true, "DELEGADO", null, null)).toBe("DELEGADO");
    });

    it("el estado manda sobre una conversión a medias", () => {
      // Un carro se anula después de que alguien le abrió la OT. Si miráramos
      // las OTs primero lo frenaríamos sin motivo.
      expect(decidirVeredicto_(true, "ANULADO", "EN PROCESO", null)).toBe("ANULADO");
      expect(decidirVeredicto_(true, "DELEGADO", "PENDIENTE", null)).toBe("DELEGADO");
    });

    it("no distingue mayúsculas ni espacios del Sheet", () => {
      expect(decidirVeredicto_(true, " anulado ", null, null)).toBe("ANULADO");
    });

    it("un estado que no conocemos deja al carro en su flujo normal", () => {
      // PRESELECCIONADO y cualquier valor nuevo que aparezca en la columna AE
      // no pueden sacar un carro del flujo por sorpresa.
      expect(decidirVeredicto_(true, "PRESELECCIONADO", null, null)).toBe("FALTA_GLP");
      expect(decidirVeredicto_(true, "LO_QUE_SEA", "FINALIZADO", "FINALIZADO")).toBe("LISTO");
    });
  });

  describe("el carro lleva GLP", () => {
    it("conversión y calidad terminadas → puede salir", () => {
      expect(decidirVeredicto_(true, "", "FINALIZADO", "FINALIZADO")).toBe("LISTO");
    });

    it("convertido pero sin calidad → falta revisión técnica", () => {
      expect(decidirVeredicto_(true, "", "FINALIZADO", null)).toBe("FALTA_CALIDAD");
    });

    it("calidad abierta implica conversión hecha, aunque su OT siga sin cerrar", () => {
      expect(decidirVeredicto_(true, "", "EN PROCESO", "PENDIENTE")).toBe("FALTA_CALIDAD");
    });

    it("conversión en curso → no despachar", () => {
      expect(decidirVeredicto_(true, "", "EN PROCESO", null)).toBe("EN_PROCESO");
      expect(decidirVeredicto_(true, "", "TRABAJANDO", null)).toBe("EN_PROCESO");
    });

    it("sin OT de conversión → FALTA GLP", () => {
      expect(decidirVeredicto_(true, "", null, null)).toBe("FALTA_GLP");
    });

    it("OT creada pero nunca iniciada sigue siendo FALTA GLP", () => {
      // PENDIENTE es una OT abierta que nadie ha empezado: el carro no está
      // convertido y no puede salir.
      expect(decidirVeredicto_(true, "", "PENDIENTE", null)).toBe("FALTA_GLP");
    });
  });

  describe("el carro no está en el padrón", () => {
    it("se avisa como dudoso, no como 'no lleva'", () => {
      expect(decidirVeredicto_(false, "", null, null)).toBe("NO_FIGURA");
    });

    it("un anulado fuera del padrón sigue siendo anulado", () => {
      expect(decidirVeredicto_(false, "ANULADO", null, null)).toBe("ANULADO");
    });
  });
});
