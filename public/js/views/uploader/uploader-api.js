// =========================
// views/uploader/uploader-api.js
// API + helpers (APS / compresión / uploads)
// =========================

export const APS_URL = "/api/uploader/proxy";

export const CONTROL_URL = "https://glp-control.onrender.com/";

export function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function humanBytes(n) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = Number(n || 0);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export async function callAPS(payload, apsUrl = APS_URL) {
  const res = await fetch(apsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const txt = await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} ${txt || ""}`.trim());
  }

  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`Respuesta no-JSON desde backend: ${txt.slice(0, 300)}`);
  }
}

export async function fileToB64Compressed(file) {
  if (!file) return "";

  // Si no es imagen, sube tal cual (dataURL -> b64)
  if (!/^image\//i.test(file.type || "")) {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  const imgURL = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = imgURL;
    });

    const maxW = 1280;
    const quality = 0.75;

    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;

    if (w > maxW) {
      const scale = maxW / w;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.split(",")[1] || "";
  } finally {
    URL.revokeObjectURL(imgURL);
  }
}

export async function getStatus({ vin, dateStr, apsUrl = APS_URL }) {
  return callAPS({ action: "getStatus", vin, dateStr }, apsUrl);
}

export async function uploadOne({ vin, dateStr, slot, file, apsUrl = APS_URL }) {
  const b64 = await fileToB64Compressed(file);
  return callAPS(
    { action: "uploadOne", vin, dateStr, slot, mimeType: "image/jpeg", b64 },
    apsUrl
  );
}

export async function uploadFalla({
  vin,
  dateStr,
  note,
  files = [],
  onProgress,
  apsUrl = APS_URL,
}) {
  const payloadFiles = [];

  for (let i = 0; i < files.length; i++) {
    if (typeof onProgress === "function") {
      onProgress({ phase: "prepare", index: i + 1, total: files.length });
    }
    const b64 = await fileToB64Compressed(files[i]);
    payloadFiles.push({ slot: "falla", mimeType: "image/jpeg", b64 });
  }

  if (typeof onProgress === "function") {
    onProgress({ phase: "upload", total: payloadFiles.length });
  }

  return callAPS({ action: "uploadFalla", vin, dateStr, note, files: payloadFiles }, apsUrl);
}

export async function uploadCalidadBatch({
  vin,
  dateStr,
  items = [], // [{ slot, file }]
  onProgress,
  apsUrl = APS_URL,
}) {
  const files = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it?.file || !it?.slot) continue;

    if (typeof onProgress === "function") {
      onProgress({ phase: "prepare", slot: it.slot, index: i + 1, total: items.length });
    }

    const b64 = await fileToB64Compressed(it.file);
    files.push({ slot: it.slot, mimeType: "image/jpeg", b64 });
  }

  if (typeof onProgress === "function") {
    onProgress({ phase: "upload", total: files.length });
  }

  return callAPS({ action: "uploadCalidad", vin, dateStr, files }, apsUrl);
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
  if (typeof onProgress === "function") onProgress({ phase: "prepare" });
  const b64 = await fileToB64Compressed(file);

  if (typeof onProgress === "function") onProgress({ phase: "upload" });
  return callAPS(
    {
      action: "uploadConformidad",
      tipo,
      vin,
      dateStr,
      tecnico,
      checklist,
      file: { mimeType: "image/jpeg", b64 },
    },
    apsUrl
  );
}