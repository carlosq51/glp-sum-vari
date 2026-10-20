// =========================
// public/js/core/camara-app.js
// Cámara dentro de la página, para que Chrome no se vaya a segundo plano.
//
// Con <input capture> el celular abre SU app de cámara y deja Chrome detrás.
// En los celulares de gama baja del taller Android aprovecha para matar la
// pestaña y darle la RAM a la cámara: el técnico toma la foto, toca ✓, y
// vuelve a una app recargada desde el menú, sin la foto (2026-10-19, visto en
// compresión y en soldadura cabina). Aquí la cámara se abre con getUserMedia
// —como el lector de QR—, la página nunca deja de estar al frente, y no hay
// nada que matar.
//
// La cámara del teléfono queda como salida (botón «📱») para quien necesite su
// zoom o su HDR, y como respaldo si el navegador no da getUserMedia.
// =========================

/** Lado mayor de la foto tomada. Después se comprime a 800 px (image-compress.js);
 *  el doble deja margen para recortar sin cargar al celular con 12 MP. */
const LADO_MAX_CAPTURA = 1600;
const CALIDAD_CAPTURA = 0.9;

let _el = null;          // overlay (se crea una vez)
let _sesion = null;      // { resolve, inputNativo, stream, track, blob, url }

const $c = (id) => _el?.querySelector(`[data-cam="${id}"]`);

function soportada_() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
}

function crearOverlay_() {
  if (_el) return _el;
  _el = document.createElement("div");
  _el.className = "camApp";
  _el.setAttribute("role", "dialog");
  _el.setAttribute("aria-modal", "true");
  _el.innerHTML = `
    <div class="camApp__top">
      <span class="camApp__titulo" data-cam="titulo"></span>
      <button type="button" class="camApp__x" data-cam="cerrar" aria-label="Cerrar cámara">✕</button>
    </div>

    <div class="camApp__visor">
      <video data-cam="video" playsinline muted autoplay></video>
      <img data-cam="foto" alt="Foto tomada" hidden>
      <div class="camApp__msg" data-cam="msg"></div>
    </div>

    <div class="camApp__barra" data-cam="barraVivo">
      <button type="button" class="camApp__lado" data-cam="linterna" hidden aria-label="Linterna">🔦</button>
      <button type="button" class="camApp__disparo" data-cam="disparar" aria-label="Tomar foto"></button>
      <button type="button" class="camApp__lado" data-cam="nativa" aria-label="Usar la cámara del teléfono">📱</button>
    </div>

    <div class="camApp__barra" data-cam="barraFoto" hidden>
      <button type="button" class="camApp__accion" data-cam="repetir">↺ Repetir</button>
      <button type="button" class="camApp__accion camApp__accion--ok" data-cam="usar">✓ Usar foto</button>
    </div>

    <div class="camApp__barra" data-cam="barraError" hidden>
      <button type="button" class="camApp__accion camApp__accion--ok" data-cam="nativa2">📱 Usar la cámara del teléfono</button>
    </div>`;
  document.body.appendChild(_el);

  $c("cerrar").addEventListener("click", () => terminar_(null));
  $c("disparar").addEventListener("click", disparar_);
  $c("repetir").addEventListener("click", repetir_);
  $c("usar").addEventListener("click", usar_);
  $c("linterna").addEventListener("click", alternarLinterna_);
  $c("nativa").addEventListener("click", usarNativa_);
  $c("nativa2").addEventListener("click", usarNativa_);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _sesion) terminar_(null);
  });

  // Si el técnico sale de la app con la cámara abierta, se suelta la cámara
  // (Android la reclama igual) y se vuelve a pedir al regresar.
  document.addEventListener("visibilitychange", () => {
    if (!_sesion) return;
    if (document.hidden) apagar_();
    else if (!_sesion.blob && !_sesion.error) encender_().catch(() => {});
  });
  return _el;
}

function modo_(m) {
  $c("barraVivo").hidden  = m !== "vivo";
  $c("barraFoto").hidden  = m !== "foto";
  $c("barraError").hidden = m !== "error";
  $c("video").hidden = m === "foto";
  $c("foto").hidden  = m !== "foto";
  $c("disparar").disabled = m !== "vivo";
}

function mensaje_(txt) {
  const m = $c("msg");
  m.textContent = txt || "";
  m.hidden = !txt;
}

function apagar_() {
  const s = _sesion;
  if (!s?.stream) return;
  s.stream.getTracks().forEach((t) => t.stop());
  s.stream = null;
  s.track = null;
  $c("video").srcObject = null;
}

async function pedirStream_() {
  const ideal = {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: ideal, audio: false });
  } catch (err) {
    // Algún celular no acepta la resolución pedida: sin exigencias, la que dé.
    if (err?.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    }
    throw err;
  }
}

async function encender_() {
  const s = _sesion;
  if (!s) return;
  mensaje_("Abriendo cámara…");
  modo_("vivo");
  $c("disparar").disabled = true;

  let stream;
  try {
    stream = await pedirStream_();
  } catch (err) {
    if (_sesion !== s) return;
    s.error = true;
    const negada = err?.name === "NotAllowedError" || err?.name === "SecurityError";
    mensaje_(negada
      ? "No hay permiso para usar la cámara aquí. Actívalo en el candado de la barra de direcciones, o usa la cámara del teléfono."
      : "No se pudo abrir la cámara. Usa la cámara del teléfono.");
    modo_("error");
    return;
  }
  // Se cerró (o se abrió otra) mientras esperábamos el permiso.
  if (_sesion !== s || document.hidden) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }

  s.stream = stream;
  s.track = stream.getVideoTracks()[0] || null;
  s.linterna = false;

  const caps = s.track?.getCapabilities?.() || {};
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
    s.track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  }
  $c("linterna").hidden = !caps.torch;
  $c("linterna").classList.remove("is-on");

  const video = $c("video");
  video.srcObject = stream;
  try { await video.play(); } catch { /* autoplay muted: no debería fallar */ }
  mensaje_("");
  modo_("vivo");
}

function alternarLinterna_() {
  const s = _sesion;
  if (!s?.track) return;
  const on = !s.linterna;
  s.track.applyConstraints({ advanced: [{ torch: on }] })
    .then(() => {
      s.linterna = on;
      $c("linterna").classList.toggle("is-on", on);
    })
    .catch(() => {});
}

function disparar_() {
  const s = _sesion;
  const video = $c("video");
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!s || !w || !h) return;

  const k = Math.min(1, LADO_MAX_CAPTURA / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  $c("disparar").disabled = true;
  canvas.toBlob((blob) => {
    canvas.width = canvas.height = 0; // soltar la memoria del lienzo ya
    if (_sesion !== s) return;
    if (!blob) {
      $c("disparar").disabled = false;
      return;
    }
    s.blob = blob;
    s.url = URL.createObjectURL(blob);
    $c("foto").src = s.url;
    video.pause();
    modo_("foto");
  }, "image/jpeg", CALIDAD_CAPTURA);
}

function soltarFoto_() {
  const s = _sesion;
  if (s?.url) URL.revokeObjectURL(s.url);
  if (s) { s.blob = null; s.url = null; }
  if (_el) $c("foto").removeAttribute("src");
}

function repetir_() {
  soltarFoto_();
  const video = $c("video");
  if (_sesion?.stream) {
    video.play().catch(() => {});
    modo_("vivo");
  } else {
    encender_().catch(() => {});
  }
}

function usar_() {
  const s = _sesion;
  if (!s?.blob) return;
  const file = new File([s.blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  terminar_(file);
}

function usarNativa_() {
  const input = _sesion?.inputNativo;
  terminar_(null);
  // Este click viene de un toque del técnico: el navegador sí deja abrir el selector.
  input?.click();
}

function terminar_(file) {
  const s = _sesion;
  if (!s) return;
  apagar_();
  soltarFoto_();
  _sesion = null;
  _el.classList.remove("is-open");
  document.documentElement.classList.remove("camApp-abierta");
  s.resolve(file);
}

/**
 * tomarFoto — abre la cámara dentro de la app y devuelve la foto como File
 * (JPEG), o null si el técnico cerró sin foto o eligió la cámara del teléfono.
 *
 * En ese último caso (y si el navegador no tiene getUserMedia) se abre
 * `inputNativo`, y la foto llega por SU evento change, como siempre: por eso
 * los handlers de change de los inputs se dejan donde están.
 *
 * @param {object} o
 * @param {string} [o.titulo]         qué foto se está tomando ("Cilindro 3")
 * @param {HTMLInputElement} [o.inputNativo]  <input capture> de respaldo
 * @param {Function} [o.antes]        async; p. ej. apagar el lector de QR, que tiene la cámara tomada
 * @returns {Promise<File|null>}
 */
export function tomarFoto({ titulo = "Foto", inputNativo = null, antes = null } = {}) {
  if (!soportada_()) {
    inputNativo?.click();
    return Promise.resolve(null);
  }
  if (_sesion) terminar_(null);

  crearOverlay_();
  $c("titulo").textContent = titulo;
  document.documentElement.classList.add("camApp-abierta");
  _el.classList.add("is-open");
  modo_("vivo");

  return new Promise((resolve) => {
    const s = { resolve, inputNativo, stream: null, track: null, blob: null, url: null, error: false };
    _sesion = s;
    Promise.resolve(typeof antes === "function" ? antes() : null)
      .catch(() => {})
      .then(() => { if (_sesion === s) return encender_(); })
      .catch(() => {});
  });
}
