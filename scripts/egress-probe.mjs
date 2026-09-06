// =========================
// scripts/egress-probe.mjs
// Mide los BYTES FACTURADOS por Supabase de un endpoint (no los que salen de
// Render, que es otra cosa y no es lo que se paga).
//
// Uso:
//   node scripts/egress-probe.mjs /api/despacho/tv /api/zonas
//   node scripts/egress-probe.mjs "/api/supervisor/report?email=tu@email"
//
// Llama cada endpoint DOS veces: la 2a revela si el cache sirvio (0 KB y ~1ms)
// o si el endpoint cobra siempre. Requiere .env con las credenciales reales,
// asi que pega contra la Supabase de PRODUCCION: solo lecturas, pero ojo.
// =========================
import dotenv from "dotenv";
dotenv.config();

let label = "(init)";
const stats = new Map();          // label -> { calls, bytes, urls: Map }
const bucket = () => {
  if (!stats.has(label)) stats.set(label, { calls: 0, bytes: 0, urls: new Map() });
  return stats.get(label);
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input?.url || String(input));
  const res = await realFetch(input, init);
  if (!/supabase\.co/i.test(url)) return res;

  const clone = res.clone();
  const body  = await clone.arrayBuffer();
  const b = bucket();
  b.calls++;
  b.bytes += body.byteLength;
  // agrupa por tabla + columnas, sin los valores de los filtros
  const u = new URL(url);
  const tag = `${u.pathname.replace("/rest/v1/", "")}?${(u.searchParams.get("select") || "").slice(0, 60)}`;
  const prev = b.urls.get(tag) || { n: 0, bytes: 0 };
  b.urls.set(tag, { n: prev.n + 1, bytes: prev.bytes + body.byteLength });
  return res;
};

const express = (await import("express")).default;
const app = express();
app.use(express.json({ limit: "25mb" }));
for (const m of ["despacho", "supervisor", "tecnico", "movilizador", "zonas", "ots", "ramales", "ml"]) {
  const mod = await import(`../routes/${m}.js`);
  app.use(mod.default);
}
const server = app.listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const ENDPOINTS = process.argv.slice(2);
for (const ep of ENDPOINTS) {
  for (const pass of [1, 2]) {           // 2ª llamada revela el cache-hit
    label = `${ep}  [llamada ${pass}]`;
    bucket();
    const t0 = Date.now();
    let status = "?";
    try { const r = await realFetch(base + ep); status = r.status; await r.arrayBuffer(); }
    catch (e) { status = "ERR " + e.message; }
    stats.get(label).ms = Date.now() - t0;
    stats.get(label).status = status;
  }
}

console.log("\n════════ BYTES FACTURADOS POR SUPABASE ════════");
for (const [k, v] of stats) {
  if (k === "(init)" && v.calls === 0) continue;
  console.log(`\n${k}   → HTTP ${v.status}, ${v.ms}ms`);
  console.log(`   ${v.calls} queries · ${(v.bytes / 1024).toFixed(1)} KB facturados`);
  for (const [tag, s] of [...v.urls].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 6)) {
    console.log(`     ${(s.bytes / 1024).toFixed(1).padStart(8)} KB  x${s.n}  ${tag}`);
  }
}
server.close();
process.exit(0);
