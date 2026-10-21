// =========================
// scripts/fotos-huella-backfill.js
// Calcula la huella de las fotos YA subidas y la guarda en fotos_huella
// (migración 008), para que el visor marque también las repetidas viejas.
// Las nuevas la guardan solas al subirse (r2UploadOne).
//
// Uso (Node 22: sharp no carga en Node 20.9):
//   npx -y node@22 scripts/fotos-huella-backfill.js                 → DRY RUN: cuenta y muestra repetidas
//   npx -y node@22 scripts/fotos-huella-backfill.js --apply         → además las guarda en Supabase
//   npx -y node@22 scripts/fotos-huella-backfill.js --prefix registro/2026-10/
//
// Idempotente: la fila se identifica por la clave de R2.
// =========================

import dotenv from "dotenv";
dotenv.config();

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { huellaImagen } from "../lib/image-optimize.js";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { UMBRAL_REPETIDA } from "../lib/fotos-huella.js";

const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--prefix");
const PREFIJOS = i !== -1 && process.argv[i + 1] ? [process.argv[i + 1]] : ["registro/", "calidad/"];
const CONCURRENCIA = 8;
const LOTE = 200;

const BUCKET = process.env.R2_BUCKET || "glp-fotos";
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// registro/AAAA-MM/VIN/slot.jpg
const CLAVE = /^(registro|calidad)\/\d{4}-\d{2}\/([^/]+)\/([a-z0-9_]+)\.jpg$/i;

const objetos = [];
for (const prefijo of PREFIJOS) {
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefijo, ContinuationToken: token }));
    objetos.push(...(r.Contents || []).filter(o => CLAVE.test(o.Key)));
    token = r.NextContinuationToken;
  } while (token);
}
console.log(`${objetos.length} fotos en ${PREFIJOS.join(", ")}`);

const filas = [];
let sig = 0, fallas = 0;
async function trabajador() {
  while (sig < objetos.length) {
    const o = objetos[sig++];
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: o.Key }));
      const buf = Buffer.from(await r.Body.transformToByteArray());
      const [, , vin, slot] = o.Key.match(CLAVE);
      filas.push({
        clave: o.Key,
        vin: vin.toUpperCase(),
        slot,
        huella: await huellaImagen(buf),
        subido_por: r.Metadata?.["subido-por"] || null,
        created_at: o.LastModified.toISOString(),
      });
    } catch (e) {
      fallas++;
      console.warn("✗", o.Key, e.message);
    }
    if ((filas.length + fallas) % 200 === 0) console.log(`  ${filas.length + fallas}/${objetos.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
console.log(`huellas: ${filas.length} · fallas: ${fallas}`);

// Resumen: cuántas fotos son copia de otra anterior (misma regla que glp_fotos_repetidas).
const dist = (a, b) => { let n = 0; for (let k = 0; k < 256; k++) if (a[k] !== b[k]) n++; return n; };
filas.sort((a, b) => a.created_at.localeCompare(b.created_at));
const porAutor = {};
let copias = 0;
for (let a = 1; a < filas.length; a++) {
  for (let b = 0; b < a; b++) {
    const x = filas[a], y = filas[b];
    if (x.vin === y.vin && x.slot === y.slot) continue;
    if (dist(x.huella, y.huella) <= UMBRAL_REPETIDA) {
      copias++;
      const q = x.subido_por || "(sin dato)";
      porAutor[q] = (porAutor[q] || 0) + 1;
      break;
    }
  }
}
console.log(`fotos que repiten una anterior: ${copias}`);
console.table(Object.entries(porAutor).sort((a, b) => b[1] - a[1]).map(([quien, fotos]) => ({ quien, fotos })));

if (!APPLY) {
  console.log("DRY RUN — no se guardó nada. Usa --apply para guardar las huellas.");
  process.exit(0);
}

const h = supabaseServiceHeaders_();
if (!h) throw new Error("Falta SUPABASE_URL / SUPABASE_SERVICE_KEY");
for (let k = 0; k < filas.length; k += LOTE) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/fotos_huella?on_conflict=clave`, {
    method: "POST",
    headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(filas.slice(k, k + LOTE)),
  });
  if (!res.ok) throw new Error(`fotos_huella ${res.status} ${(await res.text()).slice(0, 300)}`);
  console.log(`  guardadas ${Math.min(k + LOTE, filas.length)}/${filas.length}`);
}
console.log("Listo.");
