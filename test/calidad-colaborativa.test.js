import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// La colaboración de CALIDAD se rompía justo en el caso que la justifica: el
// inspector que llega sin nada propio abierto. La lista propia volvía vacía,
// getMisActivas cortaba ahí y nunca pedía las del compañero, así que la
// pantalla salía en blanco. Este test fija que la lista ajena NO depende de
// que tengas carros tuyos.

const { getMisActivas, limpiarCacheUsuario_ } =
  await import("../public/js/core/supabase-client.js");

const JESUS  = "jesus-id";
const WILMER = "wilmer-id";

/** Enruta por URL y deja contar qué se pidió. */
function stubFetch_({ propias = [] } = {}) {
  const pedidos = [];
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    pedidos.push(u);
    const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => "" });

    if (u.includes("/usuarios?")) return json([{ id: JESUS, email: "jf@x.com", nombre: "JESUS FLORES" }]);

    if (u.includes("/asignaciones?") && u.includes(`user_id=neq.${JESUS}`)) {
      return json([{
        id: "asg-wilmer", work_order_id: "wo-1", tipo_ot: "CALIDAD", rol_trabajo: "CALIDAD",
        estado_actual: "PAUSADO", tiempo_trab_ms: 1000, updated_at: "2026-10-06T00:36:55Z",
        user_id: WILMER,
        usuarios: { id: WILMER, nombre: "WILMER VICENTE", email: "wv@x.com" },
        work_orders: { id: "wo-1", vin: "LVTDB11B6VH514539" },
      }]);
    }

    if (u.includes("/asignaciones?")) return json(propias);
    if (u.includes("conversion_zonas")) return json([]);
    return json([]);
  });
  return pedidos;
}

describe("getMisActivas — CALIDAD colaborativa", () => {
  beforeEach(() => {
    limpiarCacheUsuario_();
    // La sesión del inspector: es lo que viaja en x-user-email a /api/db.
    globalThis.localStorage = { getItem: () => "jf@x.com" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.localStorage;
  });

  it("sin carros propios SÍ trae los del compañero", async () => {
    const pedidos = stubFetch_({ propias: [] });
    const items = await getMisActivas("jf@x.com", { calidadColaborativa: true });

    expect(pedidos.some(u => u.includes(`user_id=neq.${JESUS}`))).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].vin).toBe("LVTDB11B6VH514539");
    expect(items[0].ajena).toBe(true);
    expect(items[0].titular_nombre).toBe("WILMER VICENTE");
  });

  it("con carros propios trae las dos: las suyas y las del compañero", async () => {
    stubFetch_({ propias: [{
      id: "asg-jesus", work_order_id: "wo-2", tipo_ot: "CALIDAD", rol_trabajo: "CALIDAD",
      estado_actual: "TRABAJANDO", tiempo_trab_ms: 500, updated_at: "2026-10-06T01:00:00Z",
      work_orders: { id: "wo-2", vin: "PROPIO000000000" },
    }] });

    const items = await getMisActivas("jf@x.com", { calidadColaborativa: true });
    expect(items.map(i => i.vin).sort()).toEqual(["LVTDB11B6VH514539", "PROPIO000000000"]);
    expect(items.find(i => i.vin === "PROPIO000000000").ajena).toBeFalsy();
  });

  it("fuera de CALIDAD no se pide la lista ajena: sería una consulta por ciclo para nada", async () => {
    const pedidos = stubFetch_({ propias: [] });
    const items = await getMisActivas("jf@x.com");
    expect(items).toEqual([]);
    expect(pedidos.some(u => u.includes(`user_id=neq.${JESUS}`))).toBe(false);
  });
});
