// public/js/views/conversion/ui/conversion-qr.js
// Usa el módulo compartido qr-scanner.js

import {
  CORE,
  $,
  el_,
  getRolTrabajoCurrent_,
  withLock,
} from "../../../core/core.js";

import { createScanner } from "../../../core/qr-scanner.js";
import { refreshEstadoForVinRole } from "../data/conversion-estado.js";
import { autoStartFromScan_ } from "../data/conversion-eventos.js";
import { syncNow } from "../data/conversion-sync.js";

// --------------------------
// QR WORK_VIN
// --------------------------
const scanner = createScanner("qrReader");
let scanMode = "QR"; // "QR" | "BAR"

export function setScanMode_(mode) {
  scanMode = mode === "BAR" ? "BAR" : "QR";
}

export async function openQRModal() {
  if (!(CORE.state.currentModule === "TECNICO" || CORE.state.currentModule === "CALIDAD")) return;

  const modal = $("qrModal");
  modal?.classList?.add("show");
  await startQR();
}

export async function closeQRModal() {
  $("qrModal")?.classList?.remove("show");
  await scanner.stop();
}

async function startQR() {
  const msg = $("qrMsg");

  try {
    await scanner.start({
      mode: scanMode,
      msgEl: msg,
      onDecoded: async (code) => {
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
      },
    });
  } catch {
    /* error ya mostrado por el scanner */
  }
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
      await scanner.stop();
      await startQR();
    }, "Cambiando a QR...");
  });

  $("btnScanBar")?.addEventListener("click", async () => {
    setScanMode_("BAR");
    await withLock(async () => {
      await scanner.stop();
      await startQR();
    }, "Cambiando a CÓDIGO DE BARRAS...");
  });
}