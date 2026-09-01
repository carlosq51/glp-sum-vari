import { describe, it, expect, beforeEach } from "vitest";
import { cachedByTopics_, invalidateByTopic_, clearPollCache_ } from "../lib/poll-cache.js";

describe("poll-cache", () => {
  beforeEach(() => clearPollCache_());

  it("sirve del cache dentro del TTL sin volver a producir", async () => {
    let veces = 0;
    const producer = async () => ({ n: ++veces });

    const a = await cachedByTopics_("k", ["movilizador"], 60_000, producer);
    const b = await cachedByTopics_("k", ["movilizador"], 60_000, producer);

    expect(veces).toBe(1);
    expect(b).toBe(a); // misma referencia: no se rehizo nada
  });

  it("una mutación del topic obliga a releer, aunque el TTL siga vivo", async () => {
    let veces = 0;
    const producer = async () => ({ n: ++veces });

    await cachedByTopics_("k", ["movilizador"], 60_000, producer);
    invalidateByTopic_("movilizador");
    const b = await cachedByTopics_("k", ["movilizador"], 60_000, producer);

    expect(veces).toBe(2);
    expect(b.n).toBe(2);
  });

  it("un topic ajeno no invalida la entrada", async () => {
    let veces = 0;
    const producer = async () => ({ n: ++veces });

    await cachedByTopics_("k", ["movilizador"], 60_000, producer);
    invalidateByTopic_("ramal");
    await cachedByTopics_("k", ["movilizador"], 60_000, producer);

    expect(veces).toBe(1);
  });

  it("el TTL vencido relee aunque nadie haya emitido evento", async () => {
    let veces = 0;
    const producer = async () => ({ n: ++veces });

    await cachedByTopics_("k", ["movilizador"], 0, producer);
    await cachedByTopics_("k", ["movilizador"], 0, producer);

    expect(veces).toBe(2);
  });

  it("bypass ignora el cache y deja guardado el resultado nuevo", async () => {
    let veces = 0;
    const producer = async () => ({ n: ++veces });

    await cachedByTopics_("k", ["movilizador"], 60_000, producer);
    const forzado = await cachedByTopics_("k", ["movilizador"], 60_000, producer, { bypass: true });
    const siguiente = await cachedByTopics_("k", ["movilizador"], 60_000, producer);

    expect(veces).toBe(2);
    expect(forzado.n).toBe(2);
    expect(siguiente).toBe(forzado); // el bypass refrescó la entrada, no la borró
  });

  it("cada clave es independiente, aunque compartan topic", async () => {
    let veces = 0;
    const producer = async () => ({ n: ++veces });

    await cachedByTopics_("a", ["work_orders"], 60_000, producer);
    await cachedByTopics_("b", ["work_orders"], 60_000, producer);
    expect(veces).toBe(2);

    invalidateByTopic_("work_orders");
    await cachedByTopics_("a", ["work_orders"], 60_000, producer);
    await cachedByTopics_("b", ["work_orders"], 60_000, producer);
    expect(veces).toBe(4);
  });
});

describe("poll-cache · concurrencia", () => {
  beforeEach(() => clearPollCache_());

  const diferido = () => {
    let resolver;
    const promise = new Promise(r => { resolver = r; });
    return { promise, resolver };
  };

  it("N pantallas que refrescan a la vez producen UNA sola lectura", async () => {
    let veces = 0;
    const d = diferido();
    const producer = async () => { veces++; return d.promise; };

    const peticiones = [1, 2, 3, 4, 5].map(() =>
      cachedByTopics_("k", ["movilizador"], 60_000, producer));
    d.resolver({ ok: true });
    const res = await Promise.all(peticiones);

    expect(veces).toBe(1);
    expect(res.every(r => r === res[0])).toBe(true);
  });

  it("una mutación durante la lectura no deja el valor viejo cacheado", async () => {
    let veces = 0;
    const d1 = diferido(), d2 = diferido();
    const colas = [d1.promise, d2.promise];
    const producer = async () => colas[veces++];

    const enVuelo = cachedByTopics_("k", ["movilizador"], 60_000, producer);
    invalidateByTopic_("movilizador");   // el traslado ocurre a mitad de lectura
    d1.resolver({ n: 1 });
    expect(await enVuelo).toEqual({ n: 1 }); // quien preguntó recibe respuesta

    // …pero el siguiente cliente NO se queda con ese valor: relee.
    const siguiente = cachedByTopics_("k", ["movilizador"], 60_000, producer);
    d2.resolver({ n: 2 });
    expect(await siguiente).toEqual({ n: 2 });
    expect(veces).toBe(2);
  });

  it("quien llega tras la invalidación no se engancha a la lectura vieja", async () => {
    let veces = 0;
    const d1 = diferido(), d2 = diferido();
    const colas = [d1.promise, d2.promise];
    const producer = async () => colas[veces++];

    const vieja = cachedByTopics_("k", ["work_orders"], 60_000, producer);
    invalidateByTopic_("work_orders");
    const nueva = cachedByTopics_("k", ["work_orders"], 60_000, producer);

    d1.resolver({ n: 1 });
    d2.resolver({ n: 2 });
    expect(await vieja).toEqual({ n: 1 });
    expect(await nueva).toEqual({ n: 2 }); // lectura propia, no la del vuelo viejo
  });

  it("si el producer falla, no queda una lectura fantasma bloqueando la clave", async () => {
    let veces = 0;
    const producer = async () => {
      veces++;
      if (veces === 1) throw new Error("Supabase 500");
      return { ok: true };
    };

    await expect(cachedByTopics_("k", ["ramal"], 60_000, producer)).rejects.toThrow("Supabase 500");
    await expect(cachedByTopics_("k", ["ramal"], 60_000, producer)).resolves.toEqual({ ok: true });
    expect(veces).toBe(2);
  });
});
