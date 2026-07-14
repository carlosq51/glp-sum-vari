// =========================
// lib/image-optimize.js
// Normalización/compresión de imágenes en el servidor (sharp + heic-convert)
//
// Red de seguridad universal para R2: el frontend ya comprime con canvas
// (800px, q0.55), pero hay huecos que inflan el bucket:
//   - HEIC/HEIF de iPhone se sube SIN comprimir (2-8 MB) y el navegador
//     ni siquiera puede mostrarlo después.
//   - Si el canvas falla por cualquier razón, se sube el original completo.
// Aquí TODO lo que entra a R2 se re-encoda a JPEG mozjpeg ≤800px q60.
// =========================

import sharp from "sharp";

export const MAX_WIDTH = 800;
export const JPEG_QUALITY = 60;

/** Detecta HEIC/HEIF por magic bytes (ftypheic/heix/hevc/mif1...) */
function isHeicBuffer_(buf) {
  if (!buf || buf.length < 12) return false;
  const ftyp = buf.toString("ascii", 4, 8);
  if (ftyp !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)/.test(brand);
}

/**
 * normalizeImage — re-encoda cualquier imagen a JPEG optimizado (≤800px, mozjpeg q60).
 * Nunca lanza: si algo falla devuelve el buffer original intacto.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType hint del cliente (puede mentir)
 * @returns {Promise<{ buffer: Buffer, contentType: string, optimized: boolean }>}
 */
export async function normalizeImage(buffer, mimeType = "image/jpeg") {
  const original = { buffer, contentType: mimeType || "image/jpeg", optimized: false };
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return original;
    // No tocar contenido que no sea imagen (notas .txt, actas .json, etc.)
    if (mimeType && !/^image\//i.test(mimeType) && !isHeicBuffer_(buffer)) return original;

    let input = buffer;
    const heic = isHeicBuffer_(buffer) || /heic|heif/i.test(mimeType || "");

    if (heic) {
      // sharp precompilado no trae decoder HEIF (licencias) → heic-convert (JS puro)
      const { default: heicConvert } = await import("heic-convert");
      input = Buffer.from(await heicConvert({ buffer, format: "JPEG", quality: 0.8 }));
    }

    const out = await sharp(input)
      .rotate() // respeta orientación EXIF antes de descartar metadata
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    // Si la re-compresión no ahorra nada y ya era JPEG, dejar el original.
    // (HEIC/PNG siempre se convierten: el objetivo también es que se puedan VER.)
    const wasJpeg = !heic && /jpe?g/i.test(mimeType || "");
    if (wasJpeg && out.length >= buffer.length) return original;

    return { buffer: out, contentType: "image/jpeg", optimized: true };
  } catch (e) {
    console.warn("[image-optimize] fallo, subiendo original:", e?.message || e);
    return original;
  }
}
