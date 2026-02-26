// =========================
// public/js/views/supervisor/sup-qr.js
// QR SUP_VIN: open/close/start + bind
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

let qr = null;

export async function openSupQR_({ onDecodedDone }) {
  const modal = document.getElementById("qrModal");
  modal?.classList?.add("show");
  await startSupQR_({ onDecodedDone });
}

export async function closeSupQR_() {
  document.getElementById("qrModal")?.classList?.remove("show");
  try { if (qr && qr.isScanning) await qr.stop(); } catch {}
}

export async function startSupQR_({ onDecodedDone }) {
  const msg = document.getElementById("qrMsg");
  try {
    if (!window.Html5Qrcode) { if (msg) msg.textContent = "No se pudo cargar la librería QR."; return; }
    if (!qr) qr = new Html5Qrcode("qrReader");

    const config = { fps: 10, qrbox: { width: 250, height: 250 }, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] };

    const onDecoded = async (decodedText) => {
      const code = String(decodedText || "").trim().toUpperCase();
      if (!code) return;

      const supVinEl = document.getElementById("supVin");
      if (supVinEl) supVinEl.value = code;

      if (msg) msg.textContent = `VIN detectado: ${code}`;
      await closeSupQR_();
      try { await onDecodedDone?.(code); } catch {}
    };

    try { await qr.start({ facingMode: { exact: "environment" } }, config, onDecoded, () => {}); return; } catch {}
    await qr.start({ facingMode: "environment" }, config, onDecoded, () => {});
  } catch {
    if (msg) msg.textContent = "No se pudo abrir la cámara. Revisa permisos.";
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