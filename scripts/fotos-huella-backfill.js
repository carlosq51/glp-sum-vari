// =========================
// scripts/fotos-huella-backfill.js
// Calcula la huella de las fotos YA subidas y la guarda en fotos_huella
// (migración 008), para que el visor marque también las repetidas viejas.
// Las nuevas la guardan solas al subirse (r2UploadOne).
//
// Uso (Node 22: sharp no carga en Node 20.9):
//   npx -y node@22 scripts/fotos-huella-backfill.js --apply         → guarda las que falten y resume
//   npx -y node@22 scripts/fotos-huella-backfill.js                 → solo cuenta cuántas faltan
//   npx -y node@22 scripts/fotos-huella-backfill.js --apply --prefix registro/2026-10/
//
// Son ~40 000 fotos y tarda más de una hora: guarda por tandas mientras avanza
// y salta las que ya están en la tabla. Si se corta (la red de la laptop se
// cayó a la mitad la primera vez), se vuelve a correr y sigue donde quedó.
// =========================

import dotenv from "dotenv";
dotenv.config();

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { huellaImagen } from "../lib/image-optimize.js";
import { supabaseServiceHeaders_, supabaseFetchAll_ } from "../lib/supabase.js";
import { UMBRAL_REPETIDA } from "../lib/fotos-huella.js";

const APPLY = process.argv.includes("--apply");
const i = process.argv.indexOf("--prefix");
const PREFIJOS = i !== -1 && process.argv[i + 1] ? [process.argv[i + 1]] : ["registro/", "calidad/"];
const CONCURRENCIA = 8;
const LOTE = 200;
const REINTENTOS = 4;

const BUCKET = process.env.R2_BUCKET || "glp-fotos";
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const H = supabaseServiceHeaders_();
if (!H) throw new Error("Falta SUPABASE_URL / SUPABASE_SERVICE_KEY");
const SB = process.env.SUPABASE_URL;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// registro/AAAA-MM/VIN/slot.jpg
const CLAVE = /^(registro|calidad)\/\d{4}-\d{2}\/([^/]+)\/([a-z0-9_]+)\.jpg$/i;

async function guardadas() {
  const r = await supabaseFetchAll_(
    `${SB}/rest/v1/fotos_huella?select=clave,vin,slot,huella,subido_por,created_at,copia_de&order=clave`,
    H, { pageSize: 1000, maxRows: 500_000 }
  );
  if (!r.ok) throw new Error(`fotos_huella ${r.status} ${r.error}`);
  return r.rows;
}

async function subirLote(filas) {
  const res = await fetch(`${SB}/rest/v1/fotos_huella?on_conflict=clave`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`fotos_huella ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// ── 1. Qué falta ─────────────────────────────────────────────────────────
const objetos = [];
for (const prefijo of PREFIJOS) {
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefijo, ContinuationToken: token }));
    objetos.push(...(r.Contents || []).filter(o => CLAVE.test(o.Key)));
    token = r.NextContinuationToken;
  } while (token);
}
const yaEstan = new Set((await guardadas()).map(f => f.clave));
const faltan = objetos.filter(o => !yaEstan.has(o.Key));
console.log(`${objetos.length} fotos en ${PREFIJOS.join(", ")} · ya guardadas ${objetos.length - faltan.length} · faltan ${faltan.length}`);

// Huellas de fotos que ya no están en R2 (las borraron antes de que deleteSlot
// borrara también la huella): contarían un carro "con copia" por una foto que
// ya no tiene.
const enR2 = new Set(objetos.map(o => o.Key));
const huerfanas = [...yaEstan].filter(k => PREFIJOS.some(p => k.startsWith(p)) && !enR2.has(k));
console.log(`huellas de fotos borradas: ${huerfanas.length}`);
if (APPLY) {
  for (let k = 0; k < huerfanas.length; k += 80) {
    const lista = huerfanas.slice(k, k + 80).map(c => `"${c.replace(/"/g, "")}"`).join(",");
    const res = await fetch(`${SB}/rest/v1/fotos_huella?clave=in.(${encodeURIComponent(lista)})`, {
      method: "DELETE", headers: { ...H, Prefer: "return=minimal" },
    });
    if (!res.ok) throw new Error(`borrar huérfanas ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

if (!APPLY) {
  console.log("Sin --apply no se calcula ni se guarda nada.");
  process.exit(0);
}

// ── 2. Huella de las que faltan, guardando por tandas ───────────────────
let pendientes = [];
let hechas = 0, fallas = 0, sig = 0;
let guardando = Promise.resolve();

function vaciar(forzar = false) {
  if (!pendientes.length || (!forzar && pendientes.length < LOTE)) return guardando;
  const lote = pendientes;
  pendientes = [];
  guardando = guardando.then(() => subirLote(lote));
  return guardando;
}

async function huellaDe(o) {
  for (let intento = 1; ; intento++) {
    try {
      // Con la red caída una descarga puede quedar colgada para siempre (la
      // primera corrida terminó con un await que nunca se resolvió).
      const buf = await Promise.race([
        client.send(new GetObjectCommand({ Bucket: BUCKET, Key: o.Key }))
          .then(async (r) => Object.assign(Buffer.from(await r.Body.transformToByteArray()), { meta: r.Metadata })),
        esperar(60_000).then(() => { throw new Error("tiempo agotado"); }),
      ]);
      const [, , vin, slot] = o.Key.match(CLAVE);
      return {
        clave: o.Key,
        vin: vin.toUpperCase(),
        slot,
        huella: await huellaImagen(buf),
        subido_por: buf.meta?.["subido-por"] || null,
        created_at: o.LastModified.toISOString(),
      };
    } catch (e) {
      // Formato que sharp no abre (HEIC viejos): reintentar daría lo mismo.
      const deRed = !/Input buffer|unsupported image|heif/i.test(e.message);
      if (!deRed || intento > REINTENTOS) throw e;
      await esperar(5000 * intento);
    }
  }
}

async function trabajador() {
  while (sig < faltan.length) {
    const o = faltan[sig++];
    try {
      // En dos pasos: `pendientes.push(await …)` toma el arreglo ANTES del
      // await, y si vaciar() lo cambió mientras tanto la fila se pierde.
      const fila = await huellaDe(o);
      pendientes.push(fila);
      hechas++;
      vaciar();
    } catch (e) {
      fallas++;
      console.warn("✗", o.Key, e.message);
    }
    if ((hechas + fallas) % 500 === 0) console.log(`  ${hechas + fallas}/${faltan.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
await vaciar(true);
console.log(`nuevas: ${hechas} · fallas: ${fallas}`);

// ── 3. Resumen sobre TODO lo guardado ────────────────────────────────────
// Cuántas fotos son copia de otra anterior (misma regla que
// glp_fotos_repetidas). La huella pasa a 8 enteros de 32 bits: comparar
// texto carácter por carácter era inviable con decenas de miles de fotos.
const filas = (await guardadas()).sort((a, b) => a.created_at.localeCompare(b.created_at));
const popcount = (v) => {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
const n = filas.length;
const palabras = new Uint32Array(n * 8);
filas.forEach((f, a) => {
  for (let w = 0; w < 8; w++) palabras[a * 8 + w] = parseInt(f.huella.slice(w * 32, w * 32 + 32), 2) >>> 0;
});
const porAutor = {};
const porMes = {};
let copias = 0;
for (let a = 1; a < n; a++) {
  const x = filas[a];
  for (let b = 0; b < a; b++) {
    let d = 0;
    for (let w = 0; w < 8 && d <= UMBRAL_REPETIDA; w++) d += popcount(palabras[a * 8 + w] ^ palabras[b * 8 + w]);
    if (d > UMBRAL_REPETIDA) continue;
    const y = filas[b];
    if (x.vin === y.vin && x.slot === y.slot) continue;
    copias++;
    x.copiaCalculada = y.clave;
    const q = x.subido_por || "(sin dato)";
    porAutor[q] = (porAutor[q] || 0) + 1;
    const mes = x.clave.split("/")[1];
    porMes[mes] = (porMes[mes] || 0) + 1;
    break;
  }
}
console.log(`fotos que repiten una anterior: ${copias} de ${n}`);
console.table(Object.entries(porMes).sort().map(([mes, copias]) => ({ mes, copias })));
console.table(Object.entries(porAutor).sort((a, b) => b[1] - a[1]).map(([quien, fotos]) => ({ quien, fotos })));

// ── 4. copia_de (migración 009): de qué foto anterior es copia cada una ─────
// Lo mismo que hace r2UploadOne al subir, para lo que ya estaba.
if (APPLY) {
  const cambian = filas.filter(f => (f.copiaCalculada || null) !== (f.copia_de || null));
  for (let k = 0; k < cambian.length; k += LOTE) {
    await subirLote(cambian.slice(k, k + LOTE).map(f => ({
      clave: f.clave, vin: f.vin, slot: f.slot, huella: f.huella, copia_de: f.copiaCalculada || null,
    })));
  }
  console.log(`copia_de actualizado en ${cambian.length} fotos`);
}
