// =========================
// r2-uploads.js
// Cloudflare R2 upload helpers (S3-compatible)
// Reemplaza Google Apps Script / Drive para almacenamiento de fotos

// Requiere en .env:
//   R2_ACCOUNT_ID=xxxx
//   R2_ACCESS_KEY_ID=xxxx
//   R2_SECRET_ACCESS_KEY=xxxx
//   R2_BUCKET=glp-fotos
//   R2_PUBLIC_URL=https://pub-c7d6e000a03d4913b0694c761ea901d2.r2.dev
// =========================

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { normalizeImage } from "./lib/image-optimize.js";

let _client = null;

function getClient() {
  if (_client) return _client;
  const accountId  = process.env.R2_ACCOUNT_ID;
  const accessKey  = process.env.R2_ACCESS_KEY_ID;
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKey || !secretKey) {
    throw new Error("R2 no configurado. Agrega R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY al .env");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
  return _client;
}

function R2_BUCKET()     { return process.env.R2_BUCKET || "glp-fotos"; }
function R2_PUBLIC_URL() { return (process.env.R2_PUBLIC_URL || "").replace(/\/$/, ""); }

// ─── helpers ────────────────────────────────────────────────────────────────

export function r2Url(key) {
  const pub = R2_PUBLIC_URL();
  if (!pub) throw new Error("R2_PUBLIC_URL no configurado");
  return `${pub}/${key}`;
}

/** Si foto_file_id contiene "/" es una clave R2, sino es un Drive file ID (legacy) */
export function photoUrls(fotoFileId) {
  if (!fotoFileId) return { url: "", thumbUrl: "", imgUrl: "" };
  if (fotoFileId.includes("/")) {
    const url = r2Url(fotoFileId);
    return { url, thumbUrl: url, imgUrl: url };
  }
  // Legacy Drive
  return {
    url:      `https://drive.google.com/file/d/${fotoFileId}/view`,
    thumbUrl: `https://drive.google.com/thumbnail?id=${fotoFileId}&sz=w400`,
    imgUrl:   `https://drive.google.com/uc?export=view&id=${fotoFileId}`,
  };
}

function currentYYYYMM(dateStr) {
  if (dateStr && dateStr.length >= 7) return dateStr.substring(0, 7);
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function batchId() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "_",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
}

async function put(key, b64OrBuffer, contentType = "image/jpeg") {
  const client = getClient();
  const raw = Buffer.isBuffer(b64OrBuffer)
    ? b64OrBuffer
    : Buffer.from(b64OrBuffer, "base64");

  // Red de seguridad: re-comprime TODO (atrapa HEIC de iPhone y originales sin
  // comprimir cuando el canvas del cliente falló). Nunca lanza — fallback al original.
  const { buffer: body, contentType: finalType, optimized } = await normalizeImage(raw, contentType);
  if (optimized && raw.length > body.length * 1.5) {
    console.log(`[R2] optimizada ${key}: ${(raw.length / 1024).toFixed(0)}KB → ${(body.length / 1024).toFixed(0)}KB`);
  }

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET(),
    Key: key,
    Body: body,
    ContentType: finalType,
  }));
  return r2Url(key);
}

// ─── slot maps (mirror of gas/00_config_core.js) ────────────────────────────

const SLOT_NAMES = {
  vin:        "vin.jpg",
  comp_1:     "comp_1.jpg",
  comp_2:     "comp_2.jpg",
  comp_3:     "comp_3.jpg",
  comp_4:     "comp_4.jpg",
  corr_pre:   "corr_pre.jpg",
  corr_post:  "corr_post.jpg",
  voltaje:    "voltaje.jpg",
  scan_carro: "scan_carro.jpg",
  // Soldadura
  sold_sensor_antes: "sold_sensor_antes.jpg",
  sold_sensor_post:  "sold_sensor_post.jpg",
  sold_cabina_antes: "sold_cabina_antes.jpg",
  sold_cabina_post:  "sold_cabina_post.jpg",
};

const CALIDAD_SLOT_NAMES = {
  calidad_1: "calidad_1.jpg",
  calidad_2: "calidad_2.jpg",
  calidad_3: "calidad_3.jpg",
  calidad_4: "calidad_4.jpg",
};

// ─── upload functions ────────────────────────────────────────────────────────

/**
 * uploadOne — 1 foto a REGISTRO o CALIDAD (según slot)
 * Ruta R2: registro/{YYYY-MM}/{VIN}/{slot}.jpg
 *          calidad/{YYYY-MM}/{VIN}/{slot}.jpg
 */
export async function r2UploadOne({ vin, dateStr, slot, b64, mimeType = "image/jpeg" }) {
  if (!vin || !slot || !b64) throw new Error("Faltan parámetros: vin, slot, b64");

  const isCalidad  = !!CALIDAD_SLOT_NAMES[slot];
  const isRegistro = !!SLOT_NAMES[slot];
  if (!isCalidad && !isRegistro) throw new Error(`Slot desconocido: ${slot}`);

  const month    = currentYYYYMM(dateStr);
  const fileName = isCalidad ? CALIDAD_SLOT_NAMES[slot] : SLOT_NAMES[slot];
  const category = isCalidad ? "calidad" : "registro";
  const key      = `${category}/${month}/${vin}/${fileName}`;

  const url = await put(key, b64, mimeType);

  return {
    ok: true,
    vin,
    slot,
    folderKind: isCalidad ? "CALIDAD" : "REGISTRO",
    saved: { slot, key, url },
    preview: { key, url, thumbUrl: url, imgUrl: url },
  };
}

/**
 * uploadFalla — N fotos + nota
 * Ruta R2: fallas/{YYYY-MM}/{VIN}/{batchId}/001.jpg, nota.txt
 */
export async function r2UploadFalla({ vin, dateStr, note, files = [] }) {
  if (!vin) throw new Error("Falta VIN");
  if (!files.length && !note) throw new Error("No hay fotos ni nota");

  const month = currentYYYYMM(dateStr);
  const bid   = batchId();
  const saved = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f?.b64) continue;
    const idx = String(i + 1).padStart(3, "0");
    const key = `fallas/${month}/${vin}/${bid}/${idx}.jpg`;
    const url = await put(key, f.b64, f.mimeType || "image/jpeg");
    saved.push({ kind: "foto", key, url, index: i + 1 });
  }

  if (note) {
    const key = `fallas/${month}/${vin}/${bid}/nota.txt`;
    await getClient().send(new PutObjectCommand({
      Bucket: R2_BUCKET(),
      Key: key,
      Body: note,
      ContentType: "text/plain; charset=utf-8",
    }));
    saved.push({ kind: "nota", key });
  }

  return {
    ok: true,
    vin,
    batchId: bid,
    savedCount: saved.length,
    saved,
    fotoUrls: saved.filter(s => s.kind === "foto").map(s => s.url),
  };
}

/**
 * uploadCalidad — 3-4 fotos de calidad
 * Ruta R2: calidad/{YYYY-MM}/{VIN}/calidad_1.jpg, ...
 */
export async function r2UploadCalidad({ vin, dateStr, files = [] }) {
  if (!vin) throw new Error("Falta VIN");
  const valid = files.filter(x => x?.slot && CALIDAD_SLOT_NAMES[x.slot] && x.b64);
  if (valid.length < 3) throw new Error("Calidad requiere mínimo 3 fotos");

  const month = currentYYYYMM(dateStr);
  const saved = [];

  for (const f of valid) {
    const fileName = CALIDAD_SLOT_NAMES[f.slot];
    const key      = `calidad/${month}/${vin}/${fileName}`;
    const url      = await put(key, f.b64, f.mimeType || "image/jpeg");
    saved.push({ slot: f.slot, key, url });
  }

  return {
    ok: true,
    vin,
    savedCount: saved.length,
    saved,
  };
}

/**
 * uploadConformidad — foto + checklist JSON
 * Ruta R2: conformidad/{YYYY-MM}/{VIN}/{TIPO}/{batchId}.jpg
 *          conformidad/{YYYY-MM}/{VIN}/{TIPO}/{batchId}_acta.json
 */
export async function r2UploadConformidad({ tipo, vin, dateStr, tecnico, checklist, file }) {
  if (!vin || !file?.b64) throw new Error("Falta VIN o foto");

  const tipoKey = String(tipo || "CONF").trim().toUpperCase();
  if (!["TANQUE", "REDUCTOR"].includes(tipoKey)) throw new Error("Tipo inválido. Usa TANQUE o REDUCTOR");

  const checklist_ = checklist || {};
  if (!checklist_.revisadoConTiempo || !checklist_.responsablePerdida || !checklist_.todoConforme) {
    throw new Error("Debes marcar los 3 checks de conformidad");
  }

  const month  = currentYYYYMM(dateStr);
  const bid    = batchId();
  const keyImg = `conformidad/${month}/${vin}/${tipoKey}/${bid}.jpg`;

  const url = await put(keyImg, file.b64, file.mimeType || "image/jpeg");

  // Save acta JSON
  const keyAct = `conformidad/${month}/${vin}/${tipoKey}/${bid}_acta.json`;
  await getClient().send(new PutObjectCommand({
    Bucket: R2_BUCKET(),
    Key: keyAct,
    Body: JSON.stringify({ vin, tipo: tipoKey, tecnico, checklist: checklist_, dateStr, batchId: bid, createdAt: new Date().toISOString() }, null, 2),
    ContentType: "application/json",
  }));

  return {
    ok: true,
    vin,
    tipo: tipoKey,
    batchId: bid,
    photoId: keyImg,
    key: keyImg,
    url,
    fotoUrl: url,
    actaKey: keyAct,
  };
}

/**
 * uploadIncidencia — 1 foto de incidencia
 * Ruta R2: incidencias/{YYYY-MM}/{VIN}/{batchId}_{TIPO}.jpg
 * Devuelve `photoId = key` para guardar en Supabase como foto_file_id
 */
export async function r2UploadIncidencia({ vin, tipo, file }) {
  if (!file?.b64) throw new Error("Falta foto (b64)");

  const month   = currentYYYYMM();
  const bid     = batchId();
  const tipoKey = String(tipo || "INC").trim().toUpperCase();
  const vinKey  = String(vin || "SIN_VIN").trim().toUpperCase();
  const key     = `incidencias/${month}/${vinKey}/${bid}_${tipoKey}.jpg`;

  const url = await put(key, file.b64, file.mimeType || "image/jpeg");

  return {
    ok: true,
    vin: vinKey,
    tipo: tipoKey,
    batchId: bid,
    photoId: key,   // clave R2 — se guarda en supabase como foto_file_id
    key,
    url,
    photoUrl:      url,
    photoThumbUrl: url,
    photoImgUrl:   url,
  };
}

/**
 * getStatus — lista qué slots existen en R2 para un VIN
 * (equivalente al getStatus de Apps Script, sin crear nada)
 */
export async function r2GetStatus({ vin, dateStr }) {
  if (!vin) throw new Error("Falta VIN");
  const month  = currentYYYYMM(dateStr);
  const client = getClient();

  const [regRes, calRes, falRes] = await Promise.all([
    client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET(), Prefix: `registro/${month}/${vin}/` }))
      .catch(() => ({ Contents: [] })),
    client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET(), Prefix: `calidad/${month}/${vin}/` }))
      .catch(() => ({ Contents: [] })),
    client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET(), Prefix: `fallas/${month}/${vin}/` }))
      .catch(() => ({ Contents: [] })),
  ]);

  // ── REGISTRO ─────────────────────────────────────────────────────────────
  const status   = {};
  const previews = {};
  Object.keys(SLOT_NAMES).forEach(s => { status[s] = false; });

  const regByName = {};
  for (const obj of (regRes.Contents || [])) {
    regByName[obj.Key.split("/").pop()] = obj.Key;
  }
  for (const slot of Object.keys(SLOT_NAMES)) {
    const name = SLOT_NAMES[slot];
    if (regByName[name]) {
      status[slot] = true;
      const url = r2Url(regByName[name]);
      previews[slot] = { key: regByName[name], url, thumbUrl: url, imgUrl: url };
    }
  }

  // ── CALIDAD ───────────────────────────────────────────────────────────────
  const calidadStatus   = {};
  const calidadPreviews = {};
  Object.keys(CALIDAD_SLOT_NAMES).forEach(s => { calidadStatus[s] = false; });

  const calByName = {};
  for (const obj of (calRes.Contents || [])) {
    calByName[obj.Key.split("/").pop()] = obj.Key;
  }
  for (const slot of Object.keys(CALIDAD_SLOT_NAMES)) {
    const name = CALIDAD_SLOT_NAMES[slot];
    if (calByName[name]) {
      calidadStatus[slot] = true;
      const url = r2Url(calByName[name]);
      calidadPreviews[slot] = { key: calByName[name], url, thumbUrl: url, imgUrl: url };
    }
  }

  // ── FALLAS ────────────────────────────────────────────────────────────────
  const fallaCount = (falRes.Contents || []).filter(o => o.Key.endsWith(".jpg")).length;

  const hasAny = Object.values(status).some(Boolean) || Object.values(calidadStatus).some(Boolean);

  return {
    ok: true,
    vin,
    dateStr: dateStr || new Date().toISOString().substring(0, 10),
    monthYYYYMM: month,
    exists: {
      month:    hasAny,
      car:      hasAny,
      registro: Object.values(status).some(Boolean),
    },
    status,
    previews,
    calidad: {
      exists:   Object.values(calidadStatus).some(Boolean),
      status:   calidadStatus,
      previews: calidadPreviews,
    },
    fallas: {
      exists: fallaCount > 0,
      count:  fallaCount,
    },
  };
}

/**
 * deleteSlot — elimina una foto de R2 para un VIN/slot dado
 */
export async function r2DeleteSlot({ vin, dateStr, slot }) {
  if (!vin || !slot) throw new Error("Faltan parámetros: vin, slot");

  const isCalidad  = !!CALIDAD_SLOT_NAMES[slot];
  const isRegistro = !!SLOT_NAMES[slot];
  if (!isCalidad && !isRegistro) throw new Error(`Slot desconocido: ${slot}`);

  const month    = currentYYYYMM(dateStr);
  const fileName = isCalidad ? CALIDAD_SLOT_NAMES[slot] : SLOT_NAMES[slot];
  const category = isCalidad ? "calidad" : "registro";
  const key      = `${category}/${month}/${vin}/${fileName}`;

  await getClient().send(new DeleteObjectCommand({
    Bucket: R2_BUCKET(),
    Key:    key,
  }));

  return { ok: true, vin, slot, deleted: key };
}

/**
 * uploadAvatar — sube la foto de perfil de un usuario
 * Ruta R2: avatares/{email_sanitizado}.jpg
 * Devuelve la URL pública para guardar en usuario.avatar_url
 */
export async function r2UploadAvatar({ email, b64, mimeType = "image/jpeg" }) {
  if (!email || !b64) throw new Error("Faltan parámetros: email, b64");

  const emailSanitized = String(email || "").toLowerCase().replace(/[^a-z0-9.+_-]/g, "_");
  const key = `avatares/${emailSanitized}.jpg`;

  const url = await put(key, b64, mimeType);

  return {
    ok: true,
    email,
    key,
    url,
    avatarUrl: url,
  };
}
