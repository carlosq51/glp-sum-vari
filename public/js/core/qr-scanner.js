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
    // fps: iOS estaba en 6 y era demasiado bajo. Seis intentos de decodificación
    // por segundo, con la mano temblando sobre un código de barras, es la
    // diferencia entre "lee al instante" y "no lee nunca". Se sube a 10; el
    // cuello de botella del iPhone no es la CPU, es la resolución (abajo).
    fps: ios ? 10 : (isBar ? 8 : 10),
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
/**
 * Restricciones de VIDEO — y DÓNDE se entregan, que es lo que importa.
 *
 * El porqué de pedir resolución: sin pedirla, Safari entrega el stream por
 * defecto —típicamente 640×480— y a esa resolución las barras finas de un VIN
 * se funden entre sí; el decodificador no falla, es que no hay información que
 * leer. Se pide `ideal` y nunca `exact`: exact en un dispositivo que no puede
 * darlo lanza OverconstrainedError y deja al técnico sin cámara.
 *
 * El porqué de que esto viaje en `config.videoConstraints` y NO en el primer
 * argumento de `start()`: html5-qrcode valida ese primer argumento con
 * `createVideoConstraints`, que exige UNA SOLA clave —`facingMode` o
 * `deviceId`— y lanza en cuanto ve tres. Y lanza DENTRO del ejecutor de la
 * promesa, después de haber abierto la transición de estado y sin cancelarla:
 * la instancia queda atrapada en TRANSITIONING y todo `start()` posterior
 * muere con "already under transition". Por eso el iPhone dejó de abrir la
 * cámara del todo, y por eso el mensaje hablaba de permisos: los dos
 * reintentos ya nacían muertos y el error final no tenía nada que ver con la
 * causa. Android nunca pasó por aquí, y por eso solo se rompió el iPhone.
 *
 * `config.videoConstraints` es la puerta que sí acepta un MediaTrackConstraints
 * completo —solo rechaza claves de audio— y cuando está presente la librería
 * ignora el primer argumento para armar el stream.
 */
function videoConstraints_(facingMode, isBar) {
  return {
    facingMode,
    // El código de barras del VIN necesita más ancho que un QR: son barras
    // finas repartidas a lo largo, y lo que las resuelve es la horizontal.
    width:  { ideal: isBar ? 2560 : 1920 },
    height: { ideal: isBar ? 1440 : 1080 },
  };
}

export async function startCameraWithFallback(
  instance,
  config,
  onDecoded,
  { isBar = false, reset = null } = {}
) {
  // Un intento fallido puede dejar la máquina de estados de html5-qrcode a
  // medias, y el intento siguiente hereda ese cadáver en vez de fallar por su
  // propio motivo. `reset` entrega una instancia limpia para que el fallback
  // sea de verdad un fallback y no la misma muerte repetida tres veces.
  const fresh = async () => (reset ? await reset() : instance);

  if (isIOS_()) {
    // iOS: evitar { exact: "environment" } — genera OverconstrainedError en Safari
    try {
      await instance.start(
        { facingMode: "environment" },
        { ...config, videoConstraints: videoConstraints_("environment", isBar) },
        onDecoded,
        () => {}
      );
      return;
    } catch { /* fallback */ }

    // Sin resolución pedida: si el iPhone no pudo con la ideal, al menos que
    // abra la cámara. Vale más un escaneo difícil que ninguno.
    try {
      await (await fresh()).start({ facingMode: "environment" }, config, onDecoded, () => {});
      return;
    } catch { /* fallback */ }

    // Último recurso iOS: cámara frontal
    await (await fresh()).start({ facingMode: "user" }, config, onDecoded, () => {});
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
   * Tira la instancia y devuelve una nueva.
   *
   * La máquina de estados de html5-qrcode vive DENTRO de la instancia, y un
   * start() que falla a medio camino puede dejarla trabada para siempre. Como
   * la instancia se cachea por readerId, esa avería no se va ni cerrando el
   * modal: el técnico tendría que recargar la app. Botarla y crear otra cuesta
   * nada y es lo único que garantiza que el siguiente intento empiece limpio.
   */
  async function resetInstance() {
    await stopScanner(instance);
    instance = null;
    return ensureInstance();
  }

  /**
   * Inicia el escaneo.
   * @param {object}   opts
   * @param {"QR"|"BAR"} [opts.mode="QR"]     – modo de escaneo
   * @param {function}   opts.onDecoded       – callback(code: string)
   * @param {object}     [opts.config]        – override de la config (opcional)
   * @param {HTMLElement} [opts.msgEl]        – elemento donde mostrar mensajes
   * @param {boolean}    [opts.normalize=true] – false entrega el texto tal cual.
   *   Los VIN son mayúsculas sin espacios, pero un QR que lleva una URL con
   *   token firmado (asistencia) se corrompe si se normaliza: la firma
   *   distingue mayúsculas de minúsculas.
   */
  async function start({ mode = "QR", onDecoded, config: customConfig, msgEl, normalize = true } = {}) {
    try {
      const inst = ensureInstance();
      const cfg = customConfig || getScanConfig(mode);

      const wrappedOnDecoded = async (decodedText) => {
        const code = normalize ? normalizeScanText(decodedText) : String(decodedText || "").trim();
        if (!code) return;
        await onDecoded?.(code);
      };

      // El modo viaja a las restricciones de vídeo: el código de barras del
      // VIN pide más resolución horizontal que un QR.
      await startCameraWithFallback(inst, cfg, wrappedOnDecoded, {
        isBar: mode === "BAR",
        reset: resetInstance,
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      const isPermission =
        err?.name === "NotAllowedError" ||
        /permission|denied|notallowed|not allowed/i.test(msg);

      // Si el scanner queda trabado, el próximo intento arranca de cero en vez
      // de heredar el estado roto. Sin esto, una sola falla condena al botón.
      instance = null;

      if (msgEl) {
        msgEl.textContent = isPermission
          ? "Permiso de cámara denegado. Ve a Configuración > Safari > Cámara y permite el acceso."
          : "No se pudo abrir la cámara. Vuelve a intentar.";
      }
      // El mensaje de pantalla tiene que ser corto; el motivo real no se pierde
      // por eso. Decirle "revisa permisos" a alguien cuya cámara falló por otra
      // cosa lo manda una hora a Ajustes a no encontrar nada.
      console.error("[qr-scanner] no se pudo abrir la cámara:", err);
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
