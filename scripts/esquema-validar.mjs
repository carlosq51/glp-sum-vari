// =========================
// scripts/esquema-validar.mjs
// ¿Las migraciones del repo reconstruyen la base de producción?
//
// Levanta un Postgres vacío en memoria (PGlite), le aplica en orden todo
// supabase/migrations/*.sql, vuelca su esquema con el mismo código que
// vuelca producción (scripts/esquema-dump.mjs) y compara los dos textos.
//
//   · Si una migración no corre en una base vacía → falla aquí, no en
//     producción.
//   · Si producción tiene algo que las migraciones no → alguien tocó la
//     base a mano (drift). La diferencia sale línea por línea.
//
// Uso:
//   node scripts/esquema-validar.mjs
//
// Solo LEE producción (sesión READ ONLY). Requiere SUPABASE_DB_URL en .env.
// =========================
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { generarEsquema, conectarProduccion } from "./esquema-dump.mjs";

const DIR = "supabase/migrations";

// Lo que en Supabase ya existe antes de la primera migración: los roles de
// la API y la publicación de realtime.
const PRELUDIO = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE PUBLICATION supabase_realtime;
`;

// Las extensiones las maneja Supabase y PGlite no las tiene: esas líneas
// (solo informativas) no entran en la comparación.
const sinExtensiones = (sql) => sql.split("\n").filter((l) => !/^-- {3}\S+ \(schema \S+\)$/.test(l)).join("\n");

const local = new PGlite();
await local.exec(PRELUDIO);

const archivos = fs.readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
for (const f of archivos) {
  try {
    await local.exec(fs.readFileSync(path.join(DIR, f), "utf8"));
    console.log(`  ok  ${f}`);
  } catch (e) {
    console.error(`  ✗   ${f}: ${e.message}`);
    process.exit(1);
  }
}

const deLocal = await generarEsquema(async (sql) => (await local.query(sql)).rows);
const prod = await conectarProduccion();
const deProd = await generarEsquema(prod.q);
await prod.cerrar();

const a = sinExtensiones(deLocal.sql).split("\n");
const b = sinExtensiones(deProd.sql).split("\n");
const enA = new Set(a), enB = new Set(b);
const soloProd = b.filter((l) => l.trim() && !enA.has(l));
const soloRepo = a.filter((l) => l.trim() && !enB.has(l));

console.log(`\nRepo:       ${deLocal.resumen}`);
console.log(`Producción: ${deProd.resumen}`);
if (!soloProd.length && !soloRepo.length) {
  console.log("\nIguales: las migraciones reconstruyen producción.");
} else {
  if (soloProd.length) console.log(`\nSolo en producción (${soloProd.length}):\n` + soloProd.map((l) => "  + " + l).join("\n"));
  if (soloRepo.length) console.log(`\nSolo en el repo (${soloRepo.length}):\n` + soloRepo.map((l) => "  - " + l).join("\n"));
  process.exit(1);
}
