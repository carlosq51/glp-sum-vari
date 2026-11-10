// POST /api/incidencia: lo que se inserta en `incidencias` tiene que ser
// columnas de verdad. El 2026-11-10 se coló `tecnicoEmail` (solo era para
// WhatsApp) y Supabase rechazaba TODAS las incidencias con PGRST204.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import express from "express";

const insertados = [];
const encolados = [];
vi.mock("../lib/supabase.js", () => ({
  supabaseHeaders_: () => ({}),
  supabaseGet_: vi.fn(async () => []),
  supabasePost_: vi.fn(async (tabla, data) => { insertados.push({ tabla, data }); return [{ id: "inc-1", ...data }]; }),
  supabasePatch_: vi.fn(async () => []),
}));
vi.mock("../lib/authz.js", () => ({ getUsuarioByEmail_: vi.fn(async () => null) }));
vi.mock("../lib/timing.js", () => ({ addServerTiming_: () => {} }));
vi.mock("../lib/config.js", () => ({ getConfig_: async () => ({}) }));
vi.mock("../r2-uploads.js", () => ({ r2UploadIncidencia: vi.fn(), photoUrls: vi.fn() }));
vi.mock("../lib/events.js", () => ({ emitEvent_: () => {} }));
vi.mock("../lib/push.js", () => ({ sendPushToEmails_: vi.fn(async () => ({})), getTecnicoEmailsByVin_: vi.fn(async () => []) }));
vi.mock("../routes/whatsapp.js", () => ({ encolarIncidencia_: vi.fn(async (x) => { encolados.push(x); return true; }) }));

// Las columnas de la tabla, leídas de la migración base.
const sql = readFileSync(new URL("../supabase/migrations/000_base.sql", import.meta.url), "utf8");
const bloque = sql.match(/CREATE TABLE incidencias \(([\s\S]*?)\n\);/)[1];
const COLUMNAS = new Set(bloque.split("\n").map(l => l.trim().split(/\s+/)[0]).filter(c => c && c !== "CONSTRAINT"));

let server, base;
beforeAll(async () => {
  const { default: router } = await import("../routes/incidencias.js");
  const app = express();
  app.use(express.json());
  app.use(router);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server?.close());

describe("POST /api/incidencia", () => {
  it("inserta solo columnas que existen y manda el email del técnico solo a WhatsApp", async () => {
    const r = await fetch(`${base}/api/incidencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "wilmer@x.com", conversionId: "ot-1", vin: "LVTDB21B5PD123456", rolTrabajo: "CALIDAD",
        tecnicoUserId: "u-1", tecnicoEmail: "contreras@x.com", tecnicoNombre: "CONTRERAS BERNALDO",
        tipo: "MODERADA", nota: "FUGA DE GAS\nAcople de cañería 6mm", foto: null,
      }),
    });
    expect((await r.json()).ok).toBe(true);
    const fila = insertados.find(x => x.tabla === "incidencias").data;
    const ajenas = Object.keys(fila).filter(k => !COLUMNAS.has(k));
    expect(ajenas).toEqual([]);
    await new Promise(r => setTimeout(r, 20));
    expect(encolados[0]).toMatchObject({ tecnicoEmail: "contreras@x.com", tecnico: "CONTRERAS BERNALDO", gravedad: "MODERADA" });
  });
});
