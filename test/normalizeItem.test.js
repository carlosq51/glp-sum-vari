import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock core antes de importar el módulo bajo prueba
vi.mock("../public/js/core/core.js", () => ({
  CORE: { state: { currentModule: "TECNICO" } },
  getRolTecnico_: () => "MOTOR",
  vinCacheGet_: () => "",
  vinCacheSet_: () => {},
  ramalCacheGet_: () => "",
  ramalCacheSet_: () => {},
}));

const { normalizeItem_ } = await import("../public/js/work/work-normalize.js");

// ─────────────────────────────────────────────
// normalizeItem_
// ─────────────────────────────────────────────
describe("normalizeItem_", () => {
  it("normaliza campos snake_case de Supabase", () => {
    const raw = {
      work_order_id: "WO-001",
      vin: "ABC123",
      tipo_ramal: "TUBO",
      rol_trabajo: "MOTOR",
      estado_actual: "TRABAJANDO",
      tiempo_trab_ms: 5000,
      running_since: "2024-01-01T00:00:00Z",
      last_nota: "nota de prueba",
      updated_at: "2024-01-01T01:00:00Z",
    };

    const it = normalizeItem_(raw);

    expect(it.conversionId).toBe("WO-001");
    expect(it.vin).toBe("ABC123");
    expect(it.tipoRamal).toBe("TUBO");
    expect(it.rolTrabajo).toBe("MOTOR");
    expect(it.estado).toBe("TRABAJANDO");
    expect(it.tiempo_ms).toBe(5000);
    expect(it.running_since).toBe("2024-01-01T00:00:00Z");
    expect(it.last_nota).toBe("nota de prueba");
  });

  it("normaliza campos camelCase", () => {
    const raw = {
      conversionId: "WO-002",
      tipoRamal: "FLEXIBLE",
      rolTrabajo: "ramalero",
      estadoActual: "PAUSADO",
    };

    const it = normalizeItem_(raw);

    expect(it.conversionId).toBe("WO-002");
    expect(it.tipoRamal).toBe("FLEXIBLE");
    expect(it.rolTrabajo).toBe("RAMALERO");
    expect(it.estado).toBe("PAUSADO");
  });

  it("VIN queda en mayúsculas", () => {
    const it = normalizeItem_({ vin: "abc123def" });
    expect(it.vin).toBe("ABC123DEF");
  });

  it("estado por defecto es SIN_INICIAR cuando está vacío", () => {
    const it = normalizeItem_({ work_order_id: "WO-003" });
    expect(it.estado).toBe("SIN_INICIAR");
  });

  it("rolTrabajo se infiere como RAMALERO cuando tiene tipoRamal", () => {
    const it = normalizeItem_({ tipoRamal: "TUBO" });
    expect(it.rolTrabajo).toBe("RAMALERO");
  });

  it("tiempo_ms es 0 cuando falta el campo", () => {
    const it = normalizeItem_({});
    expect(it.tiempo_ms).toBe(0);
  });

  it("campos de incidencias son 0 por defecto", () => {
    const it = normalizeItem_({});
    expect(it.inc_leve).toBe(0);
    expect(it.inc_moderada).toBe(0);
    expect(it.inc_critica).toBe(0);
  });

  it("usa id como fallback para conversionId", () => {
    const it = normalizeItem_({ id: "FALLBACK-99" });
    expect(it.conversionId).toBe("FALLBACK-99");
  });

  it("pickFirst_ ignora vacíos y usa el primer valor real", () => {
    const it = normalizeItem_({
      tanque_asignado: "",
      tanqueAsignado: "T-05",
    });
    expect(it.tanque_asignado).toBe("T-05");
  });
});

// ─────────────────────────────────────────────
// Zona (plaza donde está aparcado el carro)
// ─────────────────────────────────────────────
describe("normalizeItem_ — zona", () => {
  it("acepta el nombre que llegue: zona, zona_id o zonaId", () => {
    expect(normalizeItem_({ vin: "A", zona: 10 }).zona).toBe(10);
    expect(normalizeItem_({ vin: "A", zona_id: 7 }).zona).toBe(7);
    expect(normalizeItem_({ vin: "A", zonaId: 3 }).zona).toBe(3);
  });

  it("un carro sin zona asignada da null, NO cero", () => {
    // Aquí estuvo el fallo al escribirlo: pasar el valor por el pickFirst_ del
    // módulo devuelve "" cuando no hay nada, y Number("") es 0. La tarjeta
    // habría anunciado una "ZONA 0" que no existe en el taller.
    expect(normalizeItem_({ vin: "A", zona: null }).zona).toBe(null);
    expect(normalizeItem_({ vin: "A", zona: "" }).zona).toBe(null);
  });

  it("un payload que NO habla de zonas da undefined, no null", () => {
    // La distinción no es cosmética: es lo que permite a mergePrevAndCache_
    // conservar la plaza cuando llega la respuesta de un evento, que trae la OT
    // sin ese campo. Con null, la zona parpadearía en cada botón que se toque.
    expect(normalizeItem_({ vin: "A" }).zona).toBe(undefined);
  });

  it("la zona en texto se convierte a número: viene así de la querystring", () => {
    expect(normalizeItem_({ vin: "A", zona: "12" }).zona).toBe(12);
  });

  it("una zona que no es número no se inventa", () => {
    expect(normalizeItem_({ vin: "A", zona: "patio" }).zona).toBe(null);
  });

  it("la zona 16 —la virtual de los carros sin plaza— pasa tal cual", () => {
    expect(normalizeItem_({ vin: "A", zona: 16 }).zona).toBe(16);
  });
});
