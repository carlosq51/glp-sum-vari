// Fallas de Calidad → grupo de WhatsApp (routes/whatsapp.js).
// La cola vive en R2; aquí se reemplaza por un Map para ver qué se guarda.
import { describe, it, expect, vi, beforeEach } from "vitest";

const guardados = new Map();
vi.mock("../r2-uploads.js", () => ({
  r2GuardarJson_: vi.fn(async (key, obj) => { guardados.set(key, obj); }),
  r2ListarJson_: vi.fn(async (prefix) =>
    [...guardados.entries()].filter(([k]) => k.startsWith(prefix)).sort().map(([key, data]) => ({ key, data }))),
  r2BorrarKey_: vi.fn(async (key) => { guardados.delete(key); }),
}));
vi.mock("../lib/authz.js", () => ({
  getUsuarioByEmail_: vi.fn(async (e) => (e === "wilmer@x.com" ? { nombre: "Wilmer Q.", rol: "CALIDAD" } : null)),
  requireRol_: () => (_req, _res, next) => next(),
}));
vi.mock("../lib/supabase.js", () => ({
  supabaseGet_: vi.fn(async () => [{ vin: "LVTDB21B5PD123456", modelo: "JETOUR X70" }]),
}));
const avisos = [];
vi.mock("../lib/events.js", () => ({ emitEvent_: (topic, data) => avisos.push({ topic, data }) }));

const { encolarFallaCalidad_, textoFalla_ } = await import("../routes/whatsapp.js");

beforeEach(() => { guardados.clear(); avisos.length = 0; });

describe("textoFalla_", () => {
  it("lleva modelo, VIN, comentario y quién la vio", () => {
    const t = textoFalla_({ vin: "LVTDB21B5PD123456", modelo: "JETOUR X70", nota: "Fuga en el reductor", autor: "Wilmer Q.", hora: "10/11 15:42" });
    expect(t).toBe([
      "❌ *Falla de Calidad*",
      "🚗 JETOUR X70 · VIN LVTDB21B5PD123456",
      "📝 Fuga en el reductor",
      "👤 Wilmer Q. · 10/11 15:42",
    ].join("\n"));
  });

  it("sin comentario ni modelo no deja líneas vacías", () => {
    const t = textoFalla_({ vin: "ABC", modelo: "", nota: "", autor: "", hora: "x" });
    expect(t.split("\n")).toEqual(["❌ *Falla de Calidad*", "🚗 VIN ABC", "👤 Calidad · x"]);
  });
});

describe("encolarFallaCalidad_", () => {
  it("deja un aviso en la cola con las fotos y avisa al agente", async () => {
    const ok = await encolarFallaCalidad_({
      vin: "lvtdb21b5pd123456", nota: "  Fuga  ", email: "wilmer@x.com",
      fotoUrls: ["https://r2/1.jpg", "https://r2/2.jpg"],
    });
    expect(ok).toBe(true);
    const [[key, aviso]] = [...guardados.entries()];
    expect(key).toMatch(/^avisos-wsp\/\d+_PD123456_\w+\.json$/);
    expect(aviso).toMatchObject({
      vin: "LVTDB21B5PD123456", modelo: "JETOUR X70", nota: "Fuga", autor: "Wilmer Q.",
      fotos: ["https://r2/1.jpg", "https://r2/2.jpg"],
    });
    expect(aviso.texto).toContain("📝 Fuga");
    expect(avisos).toEqual([{ topic: "whatsapp", data: { id: aviso.id } }]);
  });

  it("no manda más de 6 fotos", async () => {
    await encolarFallaCalidad_({ vin: "X1", email: "wilmer@x.com", fotoUrls: Array.from({ length: 10 }, (_, i) => `u${i}`) });
    const [aviso] = guardados.values();
    expect(aviso.fotos).toHaveLength(6);
  });

  it("si R2 falla no rompe el registro de la falla", async () => {
    const r2 = await import("../r2-uploads.js");
    r2.r2GuardarJson_.mockRejectedValueOnce(new Error("R2 caído"));
    await expect(encolarFallaCalidad_({ vin: "X1", email: "wilmer@x.com" })).resolves.toBe(false);
  });

  it("sin VIN no encola", async () => {
    expect(await encolarFallaCalidad_({ vin: " ", email: "wilmer@x.com" })).toBe(false);
    expect(guardados.size).toBe(0);
  });
});
