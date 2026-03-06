// =========================
// public/js/core/qr-scanner.js
// Módulo reutilizable de escaneo QR / Código de Barras
// Basado en la implementación de conversion-qr.js
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

/**
 * Normaliza el texto escaneado: elimina espacios y convierte a mayúsculas.
 * @param {string} text
 * @returns {string}
 */
export function normalizeScanText(text) {
  return String(text || "").replace(/\s+/g, "").trim().toUpperCase();
}

/**
 * Configuraciones de escaneo predeterminadas por modo.
 * @param {"QR"|"BAR"} mode
 * @returns {{ fps: number, qrbox: object, formatsToSupport: number[] }}
 */
export function getScanConfig(mode) {
  const isBar = mode === "BAR";
  return {
    fps: isBar ? 8 : 10,
    qrbox: isBar ? { width: 160, height: 320 } : { width: 250, height: 250 },
    formatsToSupport: isBar
      ? [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ]
      : [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  };
}

/**
 * Intenta abrir la cámara con fallback progresivo (3 intentos):
 *   1. facingMode: { exact: "environment" }
 *   2. facingMode: "environment"
 *   3. Lista de dispositivos → selecciona cámara trasera
 *
 * @param {Html5Qrcode} instance
 * @param {object} config  – config de Html5Qrcode (fps, qrbox, etc.)
 * @param {function} onDecoded – callback al decodificar
 * @returns {Promise<void>}
 */
export async function startCameraWithFallback(instance, config, onDecoded) {
  // Intento 1: exact environment
  try {
    await instance.start(
      { facingMode: { exact: "environment" } },
      config,
      onDecoded,
      () => {}
    );
    return;
  } catch {
    /* fallback */
  }

  // Intento 2: environment sin exact
  try {
    await instance.start(
      { facingMode: "environment" },
      config,
      onDecoded,
      () => {}
    );
    return;
  } catch {
    /* fallback */
  }

  // Intento 3: lista de cámaras → elegir trasera
  const devices = await Html5Qrcode.getCameras();
  let cameraId = devices?.[0]?.id || null;
  const env = devices?.find((d) =>
    /back|rear|environment/i.test(d.label || "")
  );
  if (env?.id) cameraId = env.id;

  await instance.start(
    cameraId ?? { facingMode: "environment" },
    config,
    onDecoded,
    () => {}
  );
}

/**
 * Detiene una instancia de Html5Qrcode de forma segura.
 * @param {Html5Qrcode|null} instance
 */
export async function stopScanner(instance) {
  try {
    if (instance && instance.isScanning) await instance.stop();
  } catch {
    /* silenciar errores al detener */
  }
}

/**
 * Crea un scanner reutilizable ligado a un readerId del DOM.
 *
 * Uso:
 *   const scanner = createScanner("qrReader");
 *   await scanner.start({ mode: "QR", onDecoded: (code) => { ... } });
 *   await scanner.stop();
 *
 * @param {string} readerId – id del elemento donde se renderiza el visor
 * @returns {{ start, stop, getInstance, isActive }}
 */
export function createScanner(readerId) {
  let instance = null;

  function ensureInstance() {
    if (!window.Html5Qrcode) {
      throw new Error("No se pudo cargar la librería Html5Qrcode.");
    }
    if (!instance) instance = new Html5Qrcode(readerId);
    return instance;
  }

  /**
   * Inicia el escaneo.
   * @param {object}   opts
   * @param {"QR"|"BAR"} [opts.mode="QR"]     – modo de escaneo
   * @param {function}   opts.onDecoded       – callback(code: string)
   * @param {object}     [opts.config]        – override de la config (opcional)
   * @param {HTMLElement} [opts.msgEl]        – elemento donde mostrar mensajes
   */
  async function start({ mode = "QR", onDecoded, config: customConfig, msgEl } = {}) {
    try {
      const inst = ensureInstance();
      const cfg = customConfig || getScanConfig(mode);

      const wrappedOnDecoded = async (decodedText) => {
        const code = normalizeScanText(decodedText);
        if (!code) return;
        await onDecoded?.(code);
      };

      await startCameraWithFallback(inst, cfg, wrappedOnDecoded);
    } catch (err) {
      if (msgEl) {
        msgEl.textContent =
          "No se pudo abrir la cámara. Revisa permisos (HTTPS o localhost).";
      }
      throw err;
    }
  }

  async function stop() {
    await stopScanner(instance);
  }

  function getInstance() {
    return instance;
  }

  function isActive() {
    return !!(instance && instance.isScanning);
  }

  return { start, stop, getInstance, isActive };
}
