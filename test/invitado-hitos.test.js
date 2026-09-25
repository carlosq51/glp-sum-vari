import { describe, it, expect } from "vitest";
import { hitos_, otDesdeFila_ } from "../routes/invitado.js";

// Las fechas que la ficha pone debajo del veredicto: cuándo terminó la
// conversión y cuándo la revisión técnica. Se apuntan en el acta del carro,
// así que una fecha inventada es peor que ninguna — de ahí que casi todos
// los casos de abajo comprueben que el resultado es `null`.

const trabajo = (estado, actualizado, extra = {}) =>
  ({ rol: "MOTOR", estado, actualizado, tiempo_ms: 0, usuario: "X", anulada: false, ...extra });

const ot = (tipo, estado, fin, trabajos = []) =>
  ({ tipo, numero: "", estado, fecha: "2026-09-01T08:00:00Z", fin, nota: "", trabajos });

describe("invitado · hitos de cierre", () => {
  describe("conversión", () => {
    it("usa fecha_sin_calidad cuando la OT la tiene", () => {
      const h = hitos_([ot("CONVERSION", "FINALIZADO", "2026-09-20T16:10:00Z")]);
      expect(h.conversion_fin).toBe("2026-09-20T16:10:00Z");
    });

    it("sin fecha_sin_calidad cae al último técnico en terminar", () => {
      // Las OTs cerradas antes de la migración v4b tienen el campo a null.
      // El último FINALIZADO es la mejor prueba que queda de cuándo acabó.
      const h = hitos_([ot("CONVERSION", "FINALIZADO", null, [
        trabajo("FINALIZADO", "2026-09-20T14:00:00Z"),
        trabajo("FINALIZADO", "2026-09-20T16:30:00Z"),
      ])]);
      expect(h.conversion_fin).toBe("2026-09-20T16:30:00.000Z");
    });

    it("no cuenta las asignaciones anuladas", () => {
      // A quien le quitaron el carro no le cierra la conversión: si su marca
      // contara, el acta llevaría una fecha anterior al trabajo real.
      const h = hitos_([ot("CONVERSION", "FINALIZADO", null, [
        trabajo("FINALIZADO", "2026-09-20T14:00:00Z"),
        trabajo("FINALIZADO", "2026-09-22T09:00:00Z", { anulada: true }),
      ])]);
      expect(h.conversion_fin).toBe("2026-09-20T14:00:00.000Z");
    });

    it("una OT abierta no tiene fecha de cierre", () => {
      const h = hitos_([ot("CONVERSION", "EN PROCESO", null, [
        trabajo("TRABAJANDO", "2026-09-20T14:00:00Z"),
      ])]);
      expect(h.conversion_fin).toBeNull();
    });

    it("una OT FINALIZADO sin rastro de cuándo devuelve null, no la fecha de creación", () => {
      expect(hitos_([ot("CONVERSION", "FINALIZADO", null, [])]).conversion_fin).toBeNull();
    });
  });

  describe("calidad", () => {
    it("sale del último técnico: nadie escribe fecha_sin_calidad en una OT de CALIDAD", () => {
      const h = hitos_([ot("CALIDAD", "FINALIZADO", null, [
        trabajo("FINALIZADO", "2026-09-25T09:05:00Z", { rol: "CALIDAD" }),
      ])]);
      expect(h.calidad_fin).toBe("2026-09-25T09:05:00.000Z");
    });

    it("calidad abierta no cierra el carro", () => {
      const h = hitos_([ot("CALIDAD", "TRABAJANDO", null, [
        trabajo("TRABAJANDO", "2026-09-25T09:05:00Z", { rol: "CALIDAD" }),
      ])]);
      expect(h.calidad_fin).toBeNull();
    });
  });

  describe("carros re-trabajados", () => {
    it("manda la OT más reciente, que viene primero", () => {
      // El endpoint pide las OTs por fecha_creacion.desc. Un carro con una
      // conversión vieja cerrada y otra nueva abierta está abierto: dar la
      // fecha de la vieja diría que terminó algo que se está rehaciendo.
      const h = hitos_([
        ot("CONVERSION", "EN PROCESO", null, [trabajo("TRABAJANDO", "2026-09-24T10:00:00Z")]),
        ot("CONVERSION", "FINALIZADO", "2026-08-01T12:00:00Z"),
      ]);
      expect(h.conversion_fin).toBeNull();
    });
  });

  describe("sin OTs", () => {
    it("un carro sin nada registrado no tiene hitos", () => {
      expect(hitos_([])).toEqual({ conversion_fin: null, calidad_fin: null });
    });

    it("aguanta un undefined sin romper la ficha entera", () => {
      expect(hitos_(undefined)).toEqual({ conversion_fin: null, calidad_fin: null });
    });
  });
});

// El puente entre la lista y hitos_(). La lista baja las OTs crudas de
// PostgREST con las asignaciones embebidas; la ficha las arma ya masticadas.
// hitos_() solo entiende una forma, y este adaptador es el que la produce.
describe("invitado · fila cruda → hitos", () => {
  it("traduce una OT de conversión cerrada tal como viene de PostgREST", () => {
    const h = hitos_([otDesdeFila_({
      vin: "X", tipo_ot: "CONVERSION", estado_general: "FINALIZADO",
      fecha_creacion: "2026-09-20T08:00:00Z",
      fecha_sin_calidad: "2026-09-20T16:10:00Z",
      asignaciones: [{ estado_actual: "FINALIZADO", updated_at: "2026-09-20T16:09:00Z", activo: true }],
    })]);
    expect(h.conversion_fin).toBe("2026-09-20T16:10:00Z");
  });

  it("traduce activo:false a anulada, que es como hitos_ lo entiende", () => {
    // Si esta traducción se pierde, una asignación retirada cerraría la
    // conversión con la fecha del técnico al que le quitaron el carro.
    const h = hitos_([otDesdeFila_({
      vin: "X", tipo_ot: "CONVERSION", estado_general: "FINALIZADO",
      fecha_sin_calidad: null,
      asignaciones: [
        { estado_actual: "FINALIZADO", updated_at: "2026-09-20T14:00:00Z", activo: true },
        { estado_actual: "FINALIZADO", updated_at: "2026-09-22T09:00:00Z", activo: false },
      ],
    })]);
    expect(h.conversion_fin).toBe("2026-09-20T14:00:00.000Z");
  });

  it("una OT sin embed de asignaciones no revienta", () => {
    // El modo NO detallado no pide el embed. Si alguien reusa el adaptador
    // con esas filas, tiene que salir null, no una excepción.
    expect(otDesdeFila_({ tipo_ot: "CALIDAD", estado_general: "FINALIZADO" }).trabajos).toEqual([]);
  });

  it("null entra y null sale", () => {
    expect(otDesdeFila_(null)).toBeNull();
  });
});
