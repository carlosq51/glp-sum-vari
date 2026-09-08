// =========================
// views/uploader/uploader-api.js
// API + helpers (APS / compresión / uploads)
// =========================

import { postJSON } from "../../core/api.js";
import {
  comprimirImagen,
  comprimirVarias,
  bytesLegibles,
} from "../../core/image-compress.js";

export const APS_URL = "/api/uploader/proxy";

export const CONTROL_URL = "https://glp-control.onrender.com/";

export function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Re-export: media vista del uploader ya lo importaba desde aquí. */
export const humanBytes = bytesLegibles;

// Delegación en core/api.js:postJSON. A diferencia del resto de la app,
// los callers del uploader esperan EXCEPCIÓN en error HTTP (no {ok:false}),
// así que aquí el _statusCode se convierte en throw.
export async function callAPS(payload, apsUrl = APS_URL) {
  const url = apsUrl || APS_URL;   // si apsUrl es null => usa default
  const j = await postJSON(url, payload);
  if (j?._statusCode) {
    throw new Error(`HTTP ${j._statusCode} ${j.error || j.message || ""}`.trim());
  }
  return j;
}

/**
 * fileToB64Compressed — compatibilidad con los callers viejos que solo querían
 * el base64. Lo nuevo debería usar `comprimirImagen` directamente, que además
 * devuelve el mimeType real y cuánto se ahorró.
 */
export async function fileToB64Compressed(file) {
  if (!file) return "";
  const { b64 } = await comprimirImagen(file);
  return b64;
}

export async function getStatus({ vin, dateStr, apsUrl = APS_URL }) {
  return callAPS({ action: "getStatus", vin, dateStr }, apsUrl);
}

export async function uploadOne({ vin, dateStr, slot, file, onProgress, apsUrl = APS_URL }) {
  // El mimeType se toma de lo que REALMENTE se comprimió. Antes se mandaba
  // "image/jpeg" siempre, incluso cuando el archivo subía crudo por ser HEIC:
  // el servidor lo salvaba mirando los magic bytes, pero la mentira no ayudaba
  // a nadie a entender qué estaba pasando.
  const foto = await comprimirImagen(file, {
    onEtapa: (etapa) => onProgress?.({ phase: etapa }),
  });

  onProgress?.({ phase: "upload", bytes: foto.bytes });

  const j = await callAPS(
    { action: "uploadOne", vin, dateStr, slot, mimeType: foto.mimeType, b64: foto.b64 },
    apsUrl
  );
  return { ...j, foto };
}

export async function uploadFalla({
  vin,
  dateStr,
  note,
  files = [],
  onProgress,
  apsUrl = APS_URL,
}) {
  const fotos = await comprimirVarias(files, {
    onProgreso: ({ listas, total }) =>
      onProgress?.({ phase: "prepare", index: listas, total }),
  });

  const payloadFiles = fotos.map((f) => ({
    slot: "falla",
    mimeType: f.mimeType,
    b64: f.b64,
  }));

  const bytes = fotos.reduce((a, f) => a + (f.bytes || 0), 0);
  onProgress?.({ phase: "upload", total: payloadFiles.length, bytes });

  const j = await callAPS(
    { action: "uploadFalla", vin, dateStr, note, files: payloadFiles },
    apsUrl
  );
  return { ...j, fotos };
}

export async function uploadCalidadBatch({
  vin,
  dateStr,
  items = [], // [{ slot, file }]
  onProgress,
  apsUrl = APS_URL,
}) {
  const validos = items.filter((it) => it?.file && it?.slot);

  const fotos = await comprimirVarias(validos.map((it) => it.file), {
    // Sin `slot` a propósito: con dos compresiones en vuelo, la que termina
    // no tiene por qué ser la que le toca al contador, y nombrar la foto
    // equivocada confunde más de lo que informa. La cuenta sí es exacta.
    onProgreso: ({ listas, total }) =>
      onProgress?.({ phase: "prepare", index: listas, total }),
  });

  const files = fotos.map((f, i) => ({
    slot: validos[i].slot,
    mimeType: f.mimeType,
    b64: f.b64,
  }));

  const bytes = fotos.reduce((a, f) => a + (f.bytes || 0), 0);
  onProgress?.({ phase: "upload", total: files.length, bytes });

  const j = await callAPS({ action: "uploadCalidad", vin, dateStr, files }, apsUrl);
  return { ...j, fotos };
}

export async function uploadConformidad({
  tipo,
  vin,
  dateStr,
  tecnico,
  checklist,
  file,
  onProgress,
  apsUrl = APS_URL,
}) {
  const foto = await comprimirImagen(file, {
    onEtapa: (etapa) => onProgress?.({ phase: etapa }),
  });

  onProgress?.({ phase: "upload", bytes: foto.bytes });

  const j = await callAPS(
    {
      action: "uploadConformidad",
      tipo,
      vin,
      dateStr,
      tecnico,
      checklist,
      file: { mimeType: foto.mimeType, b64: foto.b64 },
    },
    apsUrl
  );
  return { ...j, foto };
}

export async function deleteSlot({ vin, dateStr, slot, apsUrl = APS_URL }) {
  return callAPS({ action: "deleteSlot", vin, dateStr, slot }, apsUrl);
}
