// =========================
// scripts/esquema-dump.mjs
// Saca el esquema REAL de producción (schema public) como SQL ejecutable:
// enums, funciones, tablas, llaves, índices, vistas, triggers, RLS y
// políticas. Es lo que produjo supabase/migrations/000_base.sql, y sirve
// después para detectar drift: si la salida difiere de lo que dicen las
// migraciones, alguien tocó la base a mano.
//
// Uso:
//   node scripts/esquema-dump.mjs                 # imprime en pantalla
//   node scripts/esquema-dump.mjs archivo.sql     # lo escribe ahí
//
// Requiere SUPABASE_DB_URL en .env (Supabase → Connect → Session pooler).
// Abre la sesión en modo READ ONLY: este script no puede escribir aunque
// quisiera.
// =========================
import dotenv from "dotenv";
import fs from "fs";
import pg from "pg";
import { fileURLToPath } from "url";

/**
 * Genera el SQL del schema public. `q` es cualquier función (sql) => filas,
 * así el mismo código vuelca producción y la copia de validación
 * (scripts/esquema-validar.mjs) y las dos salidas se pueden comparar.
 */
export async function generarEsquema(q) {
  const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const out = [];
  const sec = (titulo) => out.push("", `-- ${"─".repeat(60)}`, `--  ${titulo}`, `-- ${"─".repeat(60)}`);

  // Objetos que pertenecen a una extensión no se vuelcan: los crea la extensión.
  const NO_EXT = `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = x.oid AND d.deptype = 'e')`;

  // ── Extensiones (informativo) ──
  const exts = await q(`SELECT e.extname, n.nspname FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname <> 'plpgsql' ORDER BY 1`);
  sec("Extensiones activas (las gestiona Supabase; aquí solo como referencia)");
  for (const e of exts) out.push(`--   ${e.extname} (schema ${e.nspname})`);

  // ── Enums ──
  const enums = await q(`SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS vals
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname`);
  sec(`Tipos enumerados (${enums.length})`);
  for (const e of enums) out.push(`CREATE TYPE ${ident(e.typname)} AS ENUM (${e.vals.map(lit).join(", ")});`);

  // ── Funciones ──
  const funcs = await q(`SELECT x.proname, pg_get_functiondef(x.oid) AS def
    FROM pg_proc x JOIN pg_namespace n ON n.oid = x.pronamespace
    WHERE n.nspname = 'public' AND x.prokind IN ('f','p') AND ${NO_EXT}
    ORDER BY x.proname, x.oid`);
  sec(`Funciones (${funcs.length})`);
  for (const f of funcs) out.push(f.def.trimEnd() + ";", "");

  // ── Tablas ──
  const tablas = await q(`SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity,
      obj_description(c.oid, 'pg_class') AS comentario
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY c.relname`);
  const cols = await q(`SELECT a.attrelid AS oid, a.attname, a.attnotnull, a.attidentity, a.attgenerated,
      format_type(a.atttypid, a.atttypmod) AS tipo, pg_get_expr(d.adbin, d.adrelid) AS def,
      col_description(a.attrelid, a.attnum) AS comentario
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped
      AND a.attrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relkind IN ('r','p'))
    ORDER BY a.attrelid, a.attnum`);
  const cons = await q(`SELECT co.conrelid AS oid, co.conname, co.contype, pg_get_constraintdef(co.oid) AS def,
      cl.relname
    FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' ORDER BY cl.relname, co.contype, co.conname`);

  sec(`Tablas (${tablas.length})`);
  const comentarios = [];
  for (const t of tablas) {
    const lineas = [];
    for (const c of cols.filter((c) => c.oid === t.oid)) {
      let tipo = c.tipo;
      let def = c.def;
      // serial / bigserial: la secuencia la crea el propio tipo.
      if (def && /^nextval\('.*_seq'::regclass\)$/.test(def)) {
        tipo = { integer: "serial", bigint: "bigserial", smallint: "smallserial" }[tipo] || tipo;
        def = null;
      }
      let l = `  ${ident(c.attname)} ${tipo}`;
      if (c.attidentity) l += ` GENERATED ${c.attidentity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`;
      if (c.attgenerated === "s") l += ` GENERATED ALWAYS AS (${def}) STORED`;
      else if (def) l += ` DEFAULT ${def}`;
      if (c.attnotnull) l += " NOT NULL";
      lineas.push(l);
      if (c.comentario) comentarios.push(`COMMENT ON COLUMN ${ident(t.relname)}.${ident(c.attname)} IS ${lit(c.comentario)};`);
    }
    for (const k of cons.filter((k) => k.oid === t.oid && "puc".includes(k.contype))) {
      lineas.push(`  CONSTRAINT ${ident(k.conname)} ${k.def}`);
    }
    out.push(`CREATE TABLE ${ident(t.relname)} (`, lineas.join(",\n"), ");", "");
    if (t.comentario) comentarios.push(`COMMENT ON TABLE ${ident(t.relname)} IS ${lit(t.comentario)};`);
  }

  const fks = cons.filter((k) => k.contype === "f");
  sec(`Llaves foráneas (${fks.length})`);
  for (const k of fks) out.push(`ALTER TABLE ${ident(k.relname)} ADD CONSTRAINT ${ident(k.conname)} ${k.def};`);

  // ── Índices que no respaldan una constraint ──
  const idx = await q(`SELECT pg_get_indexdef(i.indexrelid) AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class ic ON ic.oid = i.indexrelid
    WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = i.indexrelid)
    ORDER BY c.relname, ic.relname`);
  sec(`Índices (${idx.length})`);
  for (const i of idx) out.push(i.def.replace(/ ON public\./, " ON ") + ";");

  // ── Vistas, en orden de dependencia ──
  const vistas = await q(`SELECT c.oid::text AS oid, c.relname, c.relkind, pg_get_viewdef(c.oid, true) AS def,
      obj_description(c.oid, 'pg_class') AS comentario,
      COALESCE((SELECT array_agg(DISTINCT d.refobjid::text) FROM pg_rewrite r JOIN pg_depend d ON d.objid = r.oid
                WHERE r.ev_class = c.oid AND d.refobjid <> c.oid), ARRAY[]::text[]) AS deps,
      c.reloptions
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY c.relname`);
  const pendientes = new Map(vistas.map((v) => [v.oid, v]));
  sec(`Vistas (${vistas.length})`);
  while (pendientes.size) {
    const lista = [...pendientes.values()].filter((v) => v.deps.every((d) => !pendientes.has(d) || d === v.oid));
    if (!lista.length) throw new Error("Ciclo entre vistas: " + [...pendientes.values()].map((v) => v.relname));
    for (const v of lista) {
      const opts = v.reloptions?.length ? ` WITH (${v.reloptions.join(", ")})` : "";
      const tipo = v.relkind === "m" ? "MATERIALIZED VIEW" : "VIEW";
      out.push(`CREATE ${tipo} ${ident(v.relname)}${opts} AS`, v.def.trimEnd().replace(/;$/, "") + ";", "");
      if (v.comentario) comentarios.push(`COMMENT ON VIEW ${ident(v.relname)} IS ${lit(v.comentario)};`);
      pendientes.delete(v.oid);
    }
  }

  // ── Triggers ──
  const trg = await q(`SELECT pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname`);
  sec(`Triggers (${trg.length})`);
  for (const t of trg) out.push(t.def.replace(/ ON public\./, " ON ") + ";");

  // ── RLS y políticas ──
  const pols = await q(`SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`);
  sec(`Seguridad por fila (RLS) y políticas (${pols.length})`);
  for (const t of tablas) {
    if (t.relrowsecurity) out.push(`ALTER TABLE ${ident(t.relname)} ENABLE ROW LEVEL SECURITY;`);
    if (t.relforcerowsecurity) out.push(`ALTER TABLE ${ident(t.relname)} FORCE ROW LEVEL SECURITY;`);
  }
  out.push("");
  for (const p of pols) {
    const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, "").split(","));
    let l = `CREATE POLICY ${ident(p.policyname)} ON ${ident(p.tablename)} AS ${p.permissive} FOR ${p.cmd}`;
    l += ` TO ${roles.map((r) => (r === "public" ? "public" : ident(r))).join(", ")}`;
    if (p.qual) l += ` USING (${p.qual})`;
    if (p.with_check) l += ` WITH CHECK (${p.with_check})`;
    out.push(l + ";");
  }

  // ── Realtime ──
  const pub = await q(`SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' ORDER BY 1`);
  if (pub.length) {
    sec("Realtime");
    for (const p of pub) out.push(`ALTER PUBLICATION supabase_realtime ADD TABLE ${ident(p.tablename)};`);
  }

  if (comentarios.length) {
    sec("Comentarios");
    out.push(...comentarios);
  }

  // ── Tareas programadas (pg_cron), si la extensión existe ──
  if (exts.some((e) => e.extname === "pg_cron")) {
    const jobs = await q(`SELECT jobname, schedule, command FROM cron.job ORDER BY jobid`);
    sec(`Tareas pg_cron (${jobs.length}) — informativo`);
    for (const j of jobs) out.push(`--   ${j.jobname || "(sin nombre)"} · ${j.schedule} · ${j.command.replace(/\s+/g, " ")}`);
  }

  const sql = out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const resumen = `${tablas.length} tablas, ${vistas.length} vistas, ${enums.length} enums, ` +
    `${funcs.length} funciones, ${fks.length} FKs, ${idx.length} índices, ` +
    `${trg.length} triggers, ${pols.length} políticas`;
  return { sql, resumen };
}

export async function conectarProduccion() {
  dotenv.config({ quiet: true });
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Falta SUPABASE_DB_URL en .env");
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  return { q: async (sql) => (await db.query(sql)).rows, cerrar: () => db.end() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await conectarProduccion();
  const { sql, resumen } = await generarEsquema(db.q);
  await db.cerrar();
  if (process.argv[2]) {
    fs.writeFileSync(process.argv[2], sql);
    console.error(`Escrito ${process.argv[2]}: ${resumen}.`);
  } else {
    process.stdout.write(sql);
  }
}
