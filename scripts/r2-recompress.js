// =========================
// scripts/r2-recompress.js
// Re-comprime las fotos YA subidas en R2 (una sola vez, idempotente).
//
// Uso:
//   node scripts/r2-recompress.js               → DRY RUN: solo reporta cuánto ahorraría
//   node scripts/r2-recompress.js --apply       → re-comprime y sobrescribe en R2
//   node scripts/r2-recompress.js --apply --min-kb 100   → solo objetos > 100 KB
//   node scripts/r2-recompress.js --prefix fallas/       → limita a un prefijo
//
// Estrategia: baja todo objeto imagen que pese más de --min-kb (default 150 KB),
// lo re-encoda a JPEG mozjpeg ≤800px q60 (mismo pipeline que las subidas nuevas)
// y lo sobrescribe SOLO si ahorra >10%. Las claves no cambian, así que ninguna
// referencia en Supabase (foto_file_id) se rompe.
// =========================

import dotenv from "dotenv";
dotenv.config();

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { normalizeImage } from "../lib/image-optimize.js";

const APPLY   = process.argv.includes("--apply");
const argVal  = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const MIN_KB  = Number(argVal("--min-kb", "150"));
const PREFIX  = argVal("--prefix", "");
const CONCURRENCY = 5;

const BUCKET = process.env.R2_BUCKET || "glp-fotos";
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const isImageKey = (k) => /\.(jpe?g|png|webp|heic|heif)$/i.test(k);

async function listAll(prefix) {
  const keys = [];
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: prefix || undefined, ContinuationToken: token,
    }));
    for (const o of (r.Contents || [])) keys.push({ key: o.Key, size: o.Size });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function processOne(obj, stats) {
  try {
    const get = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: obj.key }));
    const raw = await streamToBuffer(get.Body);
    const { buffer: out, contentType, optimized } = await normalizeImage(raw, get.ContentType || "image/jpeg");

    // Solo sobrescribir si de verdad ahorra >10%
    if (!optimized || out.length >= raw.length * 0.9) {
      stats.skipped++;
      return;
    }

    if (APPLY) {
      await client.send(new PutObjectCommand({
        Bucket: BUCKET, Key: obj.key, Body: out, ContentType: contentType,
      }));
    }
    stats.done++;
    stats.before += raw.length;
    stats.after  += out.length;
    console.log(`${APPLY ? "✓" : "· (dry)"} ${obj.key}  ${(raw.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    stats.errors++;
    console.error(`✗ ${obj.key}: ${e?.message || e}`);
  }
}

async function main() {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
    console.error("Faltan credenciales R2 en .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
    process.exit(1);
  }

  console.log(`Bucket: ${BUCKET}  ${PREFIX ? `prefix: ${PREFIX}` : "(todo el bucket)"}`);
  console.log(`Modo: ${APPLY ? "APPLY (sobrescribe)" : "DRY RUN (solo reporta — usa --apply para ejecutar)"}\n`);

  const all = await listAll(PREFIX);
  const candidates = all.filter(o => isImageKey(o.key) && o.size > MIN_KB * 1024);
  const totalSize = all.reduce((s, o) => s + o.size, 0);
  console.log(`Objetos totales: ${all.length} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Candidatos (> ${MIN_KB} KB): ${candidates.length} (${(candidates.reduce((s, o) => s + o.size, 0) / 1024 / 1024).toFixed(1)} MB)\n`);

  const stats = { done: 0, skipped: 0, errors: 0, before: 0, after: 0 };
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    await Promise.all(candidates.slice(i, i + CONCURRENCY).map(o => processOne(o, stats)));
  }

  console.log("\n──────── Resumen ────────");
  console.log(`Re-comprimidas: ${stats.done}   Sin cambio: ${stats.skipped}   Errores: ${stats.errors}`);
  if (stats.done) {
    const savedMB = (stats.before - stats.after) / 1024 / 1024;
    console.log(`Ahorro: ${(stats.before / 1024 / 1024).toFixed(1)} MB → ${(stats.after / 1024 / 1024).toFixed(1)} MB  (−${savedMB.toFixed(1)} MB, ${(100 * (1 - stats.after / stats.before)).toFixed(0)}%)`);
    if (!APPLY) console.log("\n⚠ DRY RUN: nada se modificó. Ejecuta con --apply para aplicar.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
