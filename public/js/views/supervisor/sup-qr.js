// =========================
// public/js/views/supervisor/sup-qr.js
// QR SUP_VIN: open/close/start + bind
// Usa el módulo compartido qr-scanner.js
// =========================

import { createScanner } from "../../core/qr-scanner.js";

const scanner = createScanner("qrReader");

export async function openSupQR_({ onDecodedDone }) {
  const modal = document.getElementById("qrModal");
  modal?.classList?.add("show");
  await startSupQR_({ onDecodedDone });
}

export async function closeSupQR_() {
  document.getElementById("qrModal")?.classList?.remove("show");
  await scanner.stop();
}

export async function startSupQR_({ onDecodedDone }) {
  const msg = document.getElementById("qrMsg");

  try {
    await scanner.start({
      mode: "QR",
      msgEl: msg,
      onDecoded: async (code) => {
        const supVinEl = document.getElementById("supVin");
        if (supVinEl) supVinEl.value = code;

        if (msg) msg.textContent = `VIN detectado: ${code}`;
        await closeSupQR_();
        try { await onDecodedDone?.(code); } catch {}
      },
    });
  } catch {
    /* error ya mostrado por el scanner */
  }
}

export function bindSupQR_({ CORE, onApply }) {
  document.getElementById("btnSupQR")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "SUPERVISOR") return;
    openSupQR_({ onDecodedDone: () => onApply?.() }).catch(() => {});
  });

  document.getElementById("btnCloseQR")?.addEventListener("click", () => closeSupQR_());
  document.getElementById("qrModal")?.addEventListener("click", async (e) => {
    if (e.target === document.getElementById("qrModal")) await closeSupQR_();
  });
}