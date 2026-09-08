// =========================
// public/js/core/image-compress.js
// Compresión de fotos en el navegador, antes de que salgan del celular.
//
// Había dos copias de esto —uploader-api.js e incidencias.js— y las dos
// arrastraban el mismo defecto de origen: si el archivo era HEIC se rendían y
// subían el original. Un HEIC de iPhone pesa 2-8 MB y viaja en
// base64, así que el técnico gastaba ~11 MB de su plan de datos para que el
// servidor guardara al final 80 KB. El servidor ya lo arregla
// (lib/image-optimize.js), pero lo arregla DESPUÉS de que los bytes cruzaron la
// red, que es justo lo caro.
//
// Aquí no se pregunta el formato: se intenta decodificar y ya. Safari en iPhone
// —el único navegador donde aparecen HEIC— sabe decodificarlos perfectamente.
// El que no puede es Android, y ahí el archivo nunca es HEIC. Subir el original
// queda como último recurso, no como primera reacción.
// =========================

/**
 * Parámetros de salida. El lado máximo va deliberadamente igual al MAX_WIDTH
 * del servidor (lib/image-optimize.js): si el cliente entrega algo más grande
 * el servidor lo vuelve a escalar, y ese segundo reencode es pérdida de
 * calidad sin ganancia de tamaño.
 */
export const LADO_MAX = 800;
export const CALIDAD_INICIAL = 0.62;
export const CALIDAD_MINIMA = 0.40;
export const PASO_CALIDAD = 0.09;

/** Objetivo por foto. Si al comprimir se pasa, se baja calidad y se reintenta. */
export const PRESUPUESTO_BYTES = 320 * 1024;

/** Un decode colgado no se resuelve solo; sin tope el técnico se queda mirando. */
export const TIMEOUT_DECODE_MS = 15000;

/** Fotos preparadas a la vez. Más hilos en un celular de gama baja lo atoran. */
export const CONCURRENCIA = 2;

/**
 * Escalar de 4000 px a 800 px de un solo brinco hace que el navegador muestree
 * uno de cada cinco píxeles: en una aguja de manómetro o en las barras de un
 * VIN eso se ve como moiré o como una línea que desaparece. Reducir a la mitad
 * por pasos promedia todos los píxeles del camino.
 */
const FACTOR_PASO = 2;

// ─── decodificación ─────────────────────────────────────────────────────────

/**
 * decodificar_ — abre el archivo como algo dibujable en un canvas.
 *
 * Orden de intentos, y el porqué de cada uno:
 *  1. createImageBitmap con `imageOrientation:"from-image"`. Decodifica fuera
 *     del hilo principal (la UI no se congela con una foto de 12 MP) y aplica
 *     la orientación EXIF, que es lo que evita que las fotos verticales del
 *     iPhone se guarden acostadas.
 *  2. <img> + object URL. Los navegadores modernos ya honran EXIF aquí por
 *     defecto, así que es un fallback fiel, solo que síncrono.
 *
 * Se evita a propósito un tercer intento con createImageBitmap SIN opciones:
 * ahí la orientación EXIF se ignora y las fotos salen giradas, que es peor que
 * el <img>.
 *
 * @returns {Promise<{fuente:ImageBitmap|HTMLImageElement, ancho:number, alto:number, liberar:function}>}
 */
async function decodificar_(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        fuente: bmp,
        ancho: bmp.width,
        alto: bmp.height,
        liberar: () => { try { bmp.close?.(); } catch { /* ya cerrado */ } },
      };
    } catch { /* navegador viejo o formato que no decodifica → <img> */ }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      const timer = setTimeout(
        () => reject(new Error("La imagen tardó demasiado en abrirse.")),
        TIMEOUT_DECODE_MS
      );
      im.onload = () => { clearTimeout(timer); resolve(im); };
      im.onerror = () => { clearTimeout(timer); reject(new Error("NO_SE_PUDO_ABRIR")); };
      // Sin crossOrigin: un object URL es same-origin y ponerlo hacía que
      // Safari iOS marcara el canvas como contaminado.
      im.src = url;
    });
    return {
      fuente: img,
      ancho: img.naturalWidth || img.width || 0,
      alto: img.naturalHeight || img.height || 0,
      liberar: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

// ─── canvas ─────────────────────────────────────────────────────────────────

function crearLienzo_(w, h) {
  // OffscreenCanvas mantiene el trabajo fuera del árbol de la página, pero solo
  // sirve si además sabe entregar el blob: hay navegadores que traen la clase
  // sin `convertToBlob`, y ahí el canvas del DOM es la única salida.
  if (typeof OffscreenCanvas === "function" && OffscreenCanvas.prototype.convertToBlob) {
    try { return new OffscreenCanvas(w, h); } catch { /* fallback DOM */ }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function contexto_(lienzo) {
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible en este navegador.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

async function aBlob_(lienzo, tipo, calidad) {
  if (typeof lienzo.convertToBlob === "function") {
    return await lienzo.convertToBlob({ type: tipo, quality: calidad });
  }
  return await new Promise((resolve, reject) => {
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("La compresión devolvió una imagen vacía."))),
      tipo,
      calidad
    );
  });
}

/**
 * dimensionesDestino — a qué tamaño debe quedar la foto.
 *
 * Manda el lado MAYOR, no el ancho. La versión anterior solo miraba el ancho,
 * así que una foto vertical de 900×4000 —un tablero fotografiado de pie, o el
 * poste del VIN en el marco de la puerta— pasaba de largo casi sin encoger y
 * llegaba al servidor pesando lo que salió del teléfono. Con el lado mayor,
 * una foto vertical encoge tanto como una horizontal.
 *
 * Una imagen que ya cabe se devuelve intacta: agrandar solo inventa píxeles.
 *
 * @param {number} ancho
 * @param {number} alto
 * @param {number} ladoMax
 * @returns {{ancho:number, alto:number}}
 */
export function dimensionesDestino(ancho, alto, ladoMax = LADO_MAX) {
  const lado = Math.max(ancho, alto);
  if (!lado || lado <= ladoMax) return { ancho, alto };

  const escala = ladoMax / lado;
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/** escalar_ — reduce hasta `dimensionesDestino`, a la mitad cada vez. */
function escalar_({ fuente, ancho, alto }, ladoMax) {
  const { ancho: objetivoW, alto: objetivoH } = dimensionesDestino(ancho, alto, ladoMax);

  let w = ancho;
  let h = alto;
  let origen = fuente;
  let lienzo = null;

  do {
    w = Math.max(objetivoW, Math.round(w / FACTOR_PASO));
    h = Math.max(objetivoH, Math.round(h / FACTOR_PASO));

    lienzo = crearLienzo_(w, h);
    contexto_(lienzo).drawImage(origen, 0, 0, w, h);
    origen = lienzo;
  } while (w > objetivoW || h > objetivoH);

  return { lienzo, ancho: w, alto: h };
}

// ─── base64 ─────────────────────────────────────────────────────────────────

/**
 * base64_ — pasa un Blob a base64 sin el prefijo `data:`.
 *
 * FileReader en vez de canvas.toDataURL a propósito: toDataURL codifica y
 * serializa en el hilo principal de un tirón, y con una foto grande eso es
 * medio segundo de pantalla congelada por cada toma.
 */
function base64_(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(blob);
  });
}

// ─── API pública ────────────────────────────────────────────────────────────

/**
 * comprimirImagen — deja una foto lista para subir.
 *
 * Nunca falla por culpa del formato: si no se puede decodificar (un HEIC en
 * Android, un TIFF, un canvas bloqueado) devuelve el archivo original marcado
 * con `comprimida:false`, y el servidor se encarga. Lo único que puede lanzar
 * es no poder leer el archivo del disco.
 *
 * @param {File|Blob} file
 * @param {object}   [opts]
 * @param {number}   [opts.ladoMax=LADO_MAX]
 * @param {number}   [opts.presupuesto=PRESUPUESTO_BYTES]
 * @param {number}   [opts.calidad=CALIDAD_INICIAL]
 * @param {function} [opts.onEtapa] recibe "decodificando" | "comprimiendo"
 * @returns {Promise<{b64:string, mimeType:string, bytes:number, bytesOriginales:number, comprimida:boolean, ancho:number, alto:number}>}
 */
export async function comprimirImagen(file, opts = {}) {
  const {
    ladoMax = LADO_MAX,
    presupuesto = PRESUPUESTO_BYTES,
    calidad = CALIDAD_INICIAL,
    onEtapa,
  } = opts;

  if (!file) throw new Error("No hay archivo que subir.");

  const bytesOriginales = file.size || 0;
  const tipoOriginal = file.type || "application/octet-stream";

  const original = async () => ({
    b64: await base64_(file),
    mimeType: tipoOriginal,
    bytes: bytesOriginales,
    bytesOriginales,
    comprimida: false,
    ancho: 0,
    alto: 0,
  });

  // Lo que no es imagen (la nota .txt de una falla) viaja tal cual.
  const pareceImagen =
    /^image\//i.test(tipoOriginal) ||
    /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(file.name || "");
  if (!pareceImagen) return await original();

  let abierta = null;
  try {
    onEtapa?.("decodificando");
    abierta = await decodificar_(file);
    if (!abierta.ancho || !abierta.alto) throw new Error("La imagen no tiene dimensiones válidas.");

    onEtapa?.("comprimiendo");
    const { lienzo, ancho, alto } = escalar_(abierta, ladoMax);

    // Se baja calidad mientras no quepa en el presupuesto. Antes no había
    // presupuesto: una foto con mucho grano (taller oscuro, ISO alto) salía de
    // 800 px pesando 900 KB y nadie se enteraba.
    let q = calidad;
    let blob = await aBlob_(lienzo, "image/jpeg", q);
    while (blob.size > presupuesto && q - PASO_CALIDAD >= CALIDAD_MINIMA) {
      q = Number((q - PASO_CALIDAD).toFixed(2));
      blob = await aBlob_(lienzo, "image/jpeg", q);
    }

    // Si el original ya era un JPEG más liviano que nuestro resultado, se queda
    // el original: reencodarlo solo agregaría una generación de pérdida.
    if (blob.size >= bytesOriginales && /jpe?g/i.test(tipoOriginal)) {
      return await original();
    }

    return {
      b64: await base64_(blob),
      mimeType: "image/jpeg",
      bytes: blob.size,
      bytesOriginales,
      comprimida: true,
      ancho,
      alto,
    };
  } catch {
    // Formato que el navegador no abre, canvas bloqueado, memoria: da igual el
    // motivo. El original sube y el servidor lo normaliza.
    return await original();
  } finally {
    abierta?.liberar();
  }
}

/**
 * comprimirVarias — prepara un lote sin serializarlo ni desbordarlo.
 *
 * Los lotes (falla, calidad) se comprimían de uno en uno esperando a que
 * terminara el anterior; con cuatro fotos eso es cuatro veces el decode más
 * lento del celular, en fila. Con dos en vuelo el tiempo casi se parte a la
 * mitad y la memoria sigue acotada, que es lo que importa en un Android viejo.
 *
 * @param {File[]}   files
 * @param {object}   [opts]           mismas opciones que comprimirImagen, más:
 * @param {function} [opts.onProgreso] recibe ({ listas, total })
 * @returns {Promise<Array>} resultados en el mismo orden de entrada
 */
export async function comprimirVarias(files = [], opts = {}) {
  const { onProgreso, concurrencia = CONCURRENCIA, ...resto } = opts;
  const lista = Array.from(files).filter(Boolean);
  const salida = new Array(lista.length);

  let siguiente = 0;
  let listas = 0;

  const obrero = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      salida[i] = await comprimirImagen(lista[i], resto);
      listas++;
      onProgreso?.({ listas, total: lista.length });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrencia, lista.length) }, obrero)
  );
  return salida;
}

/** Bytes en texto corto ("1.4 MB"). Vive aquí porque siempre acompaña al tamaño. */
export function bytesLegibles(n) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = Number(n || 0);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/**
 * ahorroLegible — "2.4 MB → 118 KB (−95 %)".
 * El técnico ve en pantalla lo que NO gastó de su plan de datos; es la única
 * forma de que la compresión deje de ser invisible.
 */
export function ahorroLegible({ bytes, bytesOriginales, comprimida } = {}) {
  if (!comprimida || !bytesOriginales || bytes >= bytesOriginales) {
    return bytesLegibles(bytes || bytesOriginales || 0);
  }
  const pct = Math.round((1 - bytes / bytesOriginales) * 100);
  return `${bytesLegibles(bytesOriginales)} → ${bytesLegibles(bytes)} (−${pct} %)`;
}
