// =========================
// public/js/core/qr-scanner.js
// Módulo reutilizable de escaneo QR / Código de Barras
// Basado en la implementación de conversion-qr.js
// =========================
/* global Html5Qrcode, Html5QrcodeSupportedFormats */

/**
 * Detecta iOS (iPhone/iPad/iPod, incluido iPad con iPadOS que reporta MacIntel).
 */
function isIOS_() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Normaliza el texto escaneado: elimina espacios y convierte a mayúsculas.
 * @param {string} text
 * @returns {string}
 */
export function normalizeScanText(text) {
  return String(text || "").replace(/\s+/g, "").trim().toUpperCase();
}

/**
 * Configuraciones de escaneo predeterminadas por modo y plataforma.
 *
 * iOS Safari: usa qrbox relativo al viewfinder (función) para adaptarse a la
 * alta resolución de cámara del iPhone 13+ y deshabilita BarcodeDetector API
 * (nativa de Chromium) que no existe en WebKit.
 *
 * Android/Desktop: qrbox fijo, mayor fps, sin restricciones.
 *
 * @param {"QR"|"BAR"} mode
 * @returns {{ fps: number, qrbox: object|function, formatsToSupport: number[], experimentalFeatures: object }}
 */
export function getScanConfig(mode) {
  const isBar = mode === "BAR";
  const ios = isIOS_();

  // En iOS, el viewfinder puede tener resolución muy alta (iPhone 13 → 4K).
  // Un qrbox fijo de 300×300 px queda microscópico respecto al frame real,
  // haciendo imposible la lectura. Usamos una función que recibe las dimensiones
  // reales del contenedor y retorna el 70 % del lado menor.
  const qrboxFn = (w, h) => {
    const side = Math.floor(Math.min(w, h) * (isBar ? 0.55 : 0.70));
    return isBar ? { width: side, height: Math.floor(side * 1.8) } : { width: side, height: side };
  };

  const barFormats = [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,
  ];

  return {
    fps: ios ? 6 : (isBar ? 8 : 10),
    // iOS siempre usa función relativa; Android puede usar función o fijo
    qrbox: ios ? qrboxFn : (isBar ? { width: 200, height: 360 } : qrboxFn),
    formatsToSupport: isBar ? barFormats : [Html5QrcodeSupportedFormats.QR_CODE],
    // BarcodeDetector API no existe en Safari/WebKit → deshabilitarla evita
    // que html5-qrcode rompa silenciosamente en iOS.
    experimentalFeatures: { useBarCodeDetectorIfSupported: false },
  };
}

/**
 * Estrategia de apertura de cámara según plataforma:
 *
 * iOS Safari: { exact: "environment" } casi siempre falla con
 * OverconstrainedError. Ir directo a "environment" sin exact, luego "user".
 *
 * Android/Desktop: intentos progresivos como antes.
 *
 * @param {Html5Qrcode} instance
 * @param {object} config
 * @param {function} onDecoded
 * @returns {Promise<void>}
 */
export async function startCameraWithFallback(instance, config, onDecoded) {
  if (isIOS_()) {
    // iOS: evitar { exact: "environment" } — genera OverconstrainedError en Safari
    try {
      await instance.start({ facingMode: "environment" }, config, onDecoded, () => {});
      return;
    } catch { /* fallback */ }

    // Último recurso iOS: cámara frontal
    await instance.start({ facingMode: "user" }, config, onDecoded, () => {});
    return;
  }

  // ── Android / Desktop ────────────────────────────────────────────────────
  // Intento 1: exact environment (funciona en la mayoría de Android Chrome)
  try {
    await instance.start(
      { facingMode: { exact: "environment" } },
      config,
      onDecoded,
      () => {}
    );
    return;
  } catch { /* fallback */ }

  // Intento 2: environment sin exact
  try {
    await instance.start({ facingMode: "environment" }, config, onDecoded, () => {});
    return;
  } catch { /* fallback */ }

  // Intento 3: lista de dispositivos → elegir cámara trasera por label
  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      let cameraId = devices[0].id;
      const env = devices.find((d) => /back|rear|environment/i.test(d.label || ""));
      if (env?.id) cameraId = env.id;
      await instance.start(cameraId, config, onDecoded, () => {});
      return;
    }
  } catch { /* fallback */ }

  // Intento 4: cámara frontal como último recurso
  await instance.start({ facingMode: "user" }, config, onDecoded, () => {});
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
      const msg = String(err?.message || err || "");
      const isPermission = /permission|denied|notallowed|not allowed/i.test(msg);
      if (msgEl) {
        msgEl.textContent = isPermission
          ? "Permiso de cámara denegado. Ve a Configuración > Safari > Cámara y permite el acceso."
          : "No se pudo abrir la cámara. Revisa permisos en tu navegador.";
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
