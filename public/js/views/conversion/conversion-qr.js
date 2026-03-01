/* global Html5Qrcode, Html5QrcodeSupportedFormats */

import {
  CORE,
  $,
  el_,
  getRolTrabajoCurrent_,
  withLock,
} from "../../core/core.js";

import { refreshEstadoForVinRole } from "./conversion-estado.js";
import { autoStartFromScan_ } from "./conversion-eventos.js";
import { syncNow } from "./conversion-sync.js";

// --------------------------
// QR WORK_VIN
// --------------------------
let qr = null;
let scanMode = "QR"; // "QR" | "BAR"
let qrTarget = "WORK_VIN";

export function setScanMode_(mode) {
  scanMode = mode === "BAR" ? "BAR" : "QR";
}

export async function openQRModal() {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  qrTarget = "WORK_VIN";
  const modal = $("qrModal");
  modal?.classList?.add("show");
  await startQR();
}

export async function closeQRModal() {
  $("qrModal")?.classList?.remove("show");
  await stopQR();
}

async function startQR() {
  const msg = $("qrMsg");

  try {
    if (!window.Html5Qrcode) {
      if (msg) msg.textContent = "No se pudo cargar la librería QR.";
      return;
    }

    if (!qr) qr = new Html5Qrcode("qrReader");

    const isBar = scanMode === "BAR";
    const config = {
      fps: isBar ? 8 : 10,
      qrbox: isBar ? { width: 160, height: 320 } : { width: 250, height: 250 },
      formatsToSupport: isBar
        ? [Html5QrcodeSupportedFormats.CODE_128]
        : [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    const onDecoded = async (decodedText) => {
      const code = String(decodedText || "").trim().toUpperCase();
      if (!code) return;

      const vinEl = CORE.state.currentModule === "CALIDAD" ? el_("vinQ") : el_("vin");
      if (vinEl) vinEl.value = code;

      if (msg) msg.textContent = `VIN detectado: ${code}`;
      await closeQRModal();

      await withLock(async () => {
        await refreshEstadoForVinRole({ showOut: false });
        await autoStartFromScan_(code, getRolTrabajoCurrent_());
        await syncNow({ forceFull: true, showOut: false });
        await refreshEstadoForVinRole({ showOut: false });
      }, "Iniciando automáticamente...");
    };

    try {
      await qr.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {});
      return;
    } catch {}

    try {
      await qr.start({ facingMode: "environment" }, config, onDecoded, () => {});
      return;
    } catch {}

    const devices = await Html5Qrcode.getCameras();
    let cameraId = devices?.[0]?.id || null;
    const env = devices?.find((d) => /back|rear|environment/i.test(d.label || ""));
    if (env?.id) cameraId = env.id;

    await qr.start(cameraId ?? { facingMode: "environment" }, config, onDecoded, () => {});
  } catch {
    if (msg) msg.textContent = "No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost).";
  }
}

async function stopQR() {
  try {
    if (qr && qr.isScanning) await qr.stop();
  } catch {}
}

export function initConversionQR_() {
  $("btnQR")?.addEventListener("click", openQRModal);
  $("btnQRQ")?.addEventListener("click", openQRModal);
  $("btnCloseQR")?.addEventListener("click", closeQRModal);

  $("qrModal")?.addEventListener("click", async (e) => {
    if (e.target === $("qrModal")) await closeQRModal();
  });

  $("btnScanQR")?.addEventListener("click", async () => {
    setScanMode_("QR");
    await withLock(async () => {
      await stopQR();
      await startQR();
    }, "Cambiando a QR...");
  });

  $("btnScanBar")?.addEventListener("click", async () => {
    setScanMode_("BAR");
    await withLock(async () => {
      await stopQR();
      await startQR();
    }, "Cambiando a CÓDIGO DE BARRAS...");
  });
}