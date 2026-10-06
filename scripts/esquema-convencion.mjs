// =========================
// scripts/esquema-convencion.mjs
// ¿Lo NUEVO de la base sigue la convención de supabase/migrations/README.md?
//
// Solo hacia adelante: lo que existe hasta la migración BASE_HASTA (005) no
// se revisa ni se renombra — renombrar rompería ~40 archivos y no arregla
// nada que el usuario vea. Se revisan las tablas y columnas que aparecen
// DESPUÉS, en un Postgres vacío en memoria (PGlite). No toca producción.
//
// Uso:
//   node scripts/esquema-convencion.mjs     (también corre en npm test)
// =========================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";

const DIR = "supabase/migrations";
export const BASE_HASTA = 5;

// Lo que en Supabase ya existe antes de la primera migración: los roles de
// la API y la publicación de realtime.
export const PRELUDIO = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE PUBLICATION supabase_realtime;
`;

export const archivosMigracion = () =>
  fs.readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();

const SNAKE = /^[a-z][a-z0-9_]*$/;
// Personas guardadas como texto: necesitan su *_user_id al lado.
const PERSONA_TEXTO = /(_email|_por|_nombre)$|^(email|tecnico|responsable|usuario|supervisor)$/;

async function foto(db) {
  const q = async (sql) => (await db.query(sql)).rows;
  const columnas = await q(`
    SELECT c.relname AS tabla, a.attname AS col, a.attnum,
           format_type(a.atttypid, a.atttypmod) AS tipo, t.typtype
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`);
  const tablas = await q(`
    SELECT c.relname AS tabla, c.relrowsecurity AS rls,
           obj_description(c.oid, 'pg_class') AS comentario,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'`);
  const restricciones = await q(`
    SELECT k.conrelid::regclass::text AS tabla, k.contype AS tipo,
           k.confrelid::regclass::text AS ref, a.attname AS col
    FROM pg_constraint k
    JOIN pg_namespace n ON n.oid = k.connamespace
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
    WHERE n.nspname = 'public' AND k.contype IN ('p', 'f', 'c')`);
  const defaults = await q(`
    SELECT c.relname AS tabla, a.attname AS col, pg_get_expr(d.adbin, d.adrelid) AS def
    FROM pg_attrdef d
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum`);
  return { columnas, tablas, restricciones, defaults };
}

/**
 * Aplica las migraciones y devuelve la lista de faltas de lo nuevo.
 * `extraSql` se aplica al final (lo usa el test para probar el revisor).
 */
export async function revisarConvencion({ extraSql = "" } = {}) {
  const db = new PGlite();
  await db.exec(PRELUDIO);
  const archivos = archivosMigracion();
  for (const f of archivos.filter((f) => Number(f.slice(0, 3)) <= BASE_HASTA)) {
    await db.exec(fs.readFileSync(path.join(DIR, f), "utf8"));
  }
  const antes = await foto(db);
  for (const f of archivos.filter((f) => Number(f.slice(0, 3)) > BASE_HASTA)) {
    await db.exec(fs.readFileSync(path.join(DIR, f), "utf8"));
  }
  if (extraSql) await db.exec(extraSql);
  const ahora = await foto(db);
  await db.close();

  const viejaTabla = new Set(antes.tablas.map((t) => t.tabla));
  const viejaCol = new Set(antes.columnas.map((c) => `${c.tabla}.${c.col}`));
  const r = ahora.restricciones;
  const tiene = (tabla, col, tipo, ref) =>
    r.some((k) => k.tabla === tabla && k.col === col && k.tipo === tipo && (!ref || k.ref === ref));
  const faltas = [];
  const falta = (donde, msg) => faltas.push(`${donde}: ${msg}`);

  for (const t of ahora.tablas.filter((t) => !viejaTabla.has(t.tabla))) {
    if (!SNAKE.test(t.tabla)) falta(t.tabla, "nombre en snake_case, en español");
    if (!t.rls) falta(t.tabla, "falta ENABLE ROW LEVEL SECURITY");
    if (t.politicas) falta(t.tabla, "sin políticas: solo entra la service key");
    if (!t.comentario) falta(t.tabla, "falta COMMENT ON TABLE (qué guarda y quién la escribe)");
    if (!r.some((k) => k.tabla === t.tabla && k.tipo === "p")) falta(t.tabla, "falta PRIMARY KEY");
    const id = ahora.columnas.find((c) => c.tabla === t.tabla && c.col === "id");
    const defId = ahora.defaults.find((d) => d.tabla === t.tabla && d.col === "id")?.def || "";
    if (id && (id.tipo !== "uuid" || !/gen_random_uuid/.test(defId))) {
      falta(`${t.tabla}.id`, "uuid DEFAULT gen_random_uuid()");
    }
  }

  for (const c of ahora.columnas.filter((c) => !viejaCol.has(`${c.tabla}.${c.col}`))) {
    const donde = `${c.tabla}.${c.col}`;
    const hermanas = new Set(ahora.columnas.filter((x) => x.tabla === c.tabla).map((x) => x.col));
    if (!SNAKE.test(c.col)) falta(donde, "nombre en snake_case, en español");
    if (c.tipo === "timestamp without time zone") falta(donde, "usar timestamptz, no timestamp");
    if (c.tipo === "timestamp with time zone" && !c.col.endsWith("_at")) falta(donde, "un momento se llama *_at");
    if (c.col.endsWith("_at") && c.tipo !== "timestamp with time zone") falta(donde, "*_at debe ser timestamptz");
    if (c.tipo === "date" && c.col !== "jornada_fecha" && !c.col.startsWith("fecha_")) {
      falta(donde, "un día se llama jornada_fecha (día de turno) o fecha_*");
    }
    if (c.col.endsWith("_user_id")) {
      if (c.tipo !== "uuid") falta(donde, "*_user_id debe ser uuid");
      if (!tiene(c.tabla, c.col, "f", "usuarios")) falta(donde, "*_user_id lleva REFERENCES usuarios(id)");
    }
    if (c.tipo === "text" && PERSONA_TEXTO.test(c.col)) {
      const base = c.col.replace(/_(email|nombre)$/, "");
      if (!hermanas.has(`${base}_user_id`) && !hermanas.has(`${c.col}_user_id`)) {
        falta(donde, `persona como texto: guardar ${base}_user_id uuid REFERENCES usuarios(id)`);
      }
    }
    if (/^(estado|tipo)(_|$)/.test(c.col) && c.typtype !== "e" && !tiene(c.tabla, c.col, "c")) {
      falta(donde, "valores fijos: usar un enum");
    }
  }
  return faltas;
}

// Ejecutado directo (no importado por el test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const faltas = await revisarConvencion();
  const nuevas = archivosMigracion().filter((f) => Number(f.slice(0, 3)) > BASE_HASTA);
  console.log(`Revisadas ${nuevas.length} migraciones posteriores a la ${String(BASE_HASTA).padStart(3, "0")}.`);
  if (!faltas.length) {
    console.log("Todo lo nuevo sigue la convención.");
  } else {
    console.log(`\nFaltas (${faltas.length}) — ver supabase/migrations/README.md:\n` + faltas.map((f) => "  · " + f).join("\n"));
    process.exit(1);
  }
}
