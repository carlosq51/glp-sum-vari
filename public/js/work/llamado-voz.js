// =========================
// public/js/work/llamado-voz.js
// Llamado por voz desde CALIDAD: el inspector toca "📢" junto al nombre del
// delantero o del tanquero y el iPhone, por el parlante Bluetooth, repite
// "Juan Pérez, delantero, acercarse a calidad" hasta que lo vuelva a tocar.
// =========================
//
// Todo corre en el teléfono (speechSynthesis + Web Audio): sin servidor, sin
// API de pago y sin internet. Lo que hay que saber de iOS:
//
//  · Safari solo deja sonar una página dentro de un toque. Por eso el toque
//    que enciende el llamado "desbloquea" la voz y el audio en ese mismo
//    instante; las repeticiones posteriores ya pueden salir solas.
//  · Si la pantalla se apaga o se cambia de app, iOS corta el audio. Se pide
//    Wake Lock mientras haya llamados encendidos para que no se bloquee.
//  · El parlante Bluetooth se duerme tras unos segundos de silencio y se come
//    el inicio de lo que suena. El "ding-dong" de antes de cada frase lo
//    despierta, y además hace que la gente levante la cabeza.
//
// Las tarjetas se repintan solas (sync cada pocos segundos, OT que se
// finaliza y desaparece), así que el estado vive aquí y no en el botón; la
// barra flotante permite apagar un llamado aunque su tarjeta ya no exista.

import { escapeHtml } from "../core/format.js";

const PAUSA_ENTRE_RONDAS_MS = 4000;

const ROTULO = { MOTOR: "delantero", TANQUE: "tanquero" };

/** id → { id, vin, rol, nombre } */
const activas_ = new Map();

let corriendo_ = false;
let despertar_ = null;   // corta la pausa entre rondas
let audioCtx_ = null;
let wakeLock_ = null;
let voz_ = null;

const idDe_ = (vin, rol) => `${String(vin || "").toUpperCase()}|${String(rol || "").toUpperCase()}`;

export function llamadaActiva_(vin, rol) {
  return activas_.has(idDe_(vin, rol));
}

// "PEREZ GOMEZ JUAN" se lee como siglas; en minúsculas con mayúscula
// inicial la voz lo pronuncia como un nombre.
function nombreHablado_(nombre) {
  return String(nombre || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_, sp, l) => sp + l.toUpperCase());
}

function frase_(ll) {
  // Los 4 últimos del VIN, separados, para que los diga dígito a dígito:
  // "4578" se oiría "cuatro mil quinientos setenta y ocho".
  const cola = String(ll.vin || "").slice(-4).split("").join(" ");
  return `${nombreHablado_(ll.nombre)}, ${ROTULO[ll.rol] || "técnico"}. ` +
    `Acercarse a control de calidad.` +
    (cola ? ` Carro ${cola}.` : "");
}

// ── Voz ─────────────────────────────────────────────────────────────────

// Español latino primero (en iPhone: Paulina, es-MX); si está descargada la
// versión mejorada, esa. En iOS la lista llega vacía hasta "voiceschanged".
function elegirVoz_() {
  const voces = window.speechSynthesis?.getVoices?.() || [];
  const es = voces.filter(v => /^es/i.test(v.lang));
  if (!es.length) return null;
  const puntaje = (v) =>
    (/enhanced|mejorad|premium/i.test(v.name) ? 4 : 0) +
    (/es[-_](MX|US|419)/i.test(v.lang) ? 2 : 0) +
    (/paulina/i.test(v.name) ? 1 : 0);
  return es.sort((a, b) => puntaje(b) - puntaje(a))[0];
}

try {
  window.speechSynthesis?.addEventListener?.("voiceschanged", () => { voz_ = elegirVoz_(); });
} catch {}

function hablar_(texto) {
  return new Promise((resolve) => {
    const ss = window.speechSynthesis;
    if (!ss) return resolve();
    const u = new SpeechSynthesisUtterance(texto);
    voz_ = voz_ || elegirVoz_();
    if (voz_) u.voice = voz_;
    u.lang = voz_?.lang || "es-MX";
    u.rate = 0.95;
    u.volume = 1;
    // iOS a veces no dispara onend; sin este tope el bucle se queda colgado.
    const tope = setTimeout(fin, 3000 + texto.length * 120);
    function fin() { clearTimeout(tope); resolve(); }
    u.onend = fin;
    u.onerror = fin;
    hablar_.actual = u;   // que el GC no se lleve la utterance a medio decir
    ss.speak(u);
  });
}

// ── Ding-dong ───────────────────────────────────────────────────────────

function tono_(ctx, freq, t0, dur) {
  const osc = ctx.createOscillator();
  const gan = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gan.gain.setValueAtTime(0.0001, t0);
  gan.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gan).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function dingDong_() {
  const ctx = audioCtx_;
  if (!ctx) return Promise.resolve();
  const t = ctx.currentTime + 0.05;
  tono_(ctx, 880, t, 0.6);
  tono_(ctx, 660, t + 0.45, 0.8);
  return esperar_(1300);
}

// ── Desbloqueo (dentro del toque) ───────────────────────────────────────

function desbloquearAudio_() {
  // Safari 17+: tratar la página como reproductor, no como sonido de
  // sistema, para que suene aunque el switch de silencio esté puesto.
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx_) audioCtx_ = new AC();
    audioCtx_?.resume?.();
  } catch {}

  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {}
}

// ── Pantalla encendida ──────────────────────────────────────────────────

async function pedirWakeLock_() {
  if (wakeLock_ || !activas_.size) return;
  try {
    wakeLock_ = await navigator.wakeLock?.request?.("screen");
    wakeLock_?.addEventListener?.("release", () => { wakeLock_ = null; });
  } catch { wakeLock_ = null; }
}

function soltarWakeLock_() {
  try { wakeLock_?.release?.(); } catch {}
  wakeLock_ = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pedirWakeLock_();
});

// ── Bucle ───────────────────────────────────────────────────────────────

function esperar_(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(listo, ms);
    function listo() { clearTimeout(t); if (despertar_ === listo) despertar_ = null; resolve(); }
    despertar_ = listo;
  });
}

async function bucle_() {
  if (corriendo_) return;
  corriendo_ = true;
  try {
    while (activas_.size) {
      for (const ll of [...activas_.values()]) {
        if (!activas_.has(ll.id)) continue;
        await dingDong_();
        if (!activas_.has(ll.id)) continue;
        await hablar_(frase_(ll));
      }
      if (activas_.size) await esperar_(PAUSA_ENTRE_RONDAS_MS);
    }
  } finally {
    corriendo_ = false;
  }
}

// ── Encender / apagar ───────────────────────────────────────────────────

function alternar_({ vin, rol, nombre }) {
  const id = idDe_(vin, rol);

  if (activas_.has(id)) {
    activas_.delete(id);
    // Si estaba diciendo justo ese nombre, que se calle ya.
    try { window.speechSynthesis?.cancel(); } catch {}
    if (!activas_.size) soltarWakeLock_();
  } else {
    desbloquearAudio_();
    activas_.set(id, { id, vin: String(vin || "").toUpperCase(), rol: String(rol || "").toUpperCase(), nombre });
    pedirWakeLock_();
    despertar_?.();   // si estaba en la pausa entre rondas, que llame ya
    bucle_();
  }

  refrescarUI_();
}

function refrescarUI_() {
  document.querySelectorAll(".btnLlamar[data-llamar-vin]").forEach((b) => {
    const on = llamadaActiva_(b.dataset.llamarVin, b.dataset.llamarRol);
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = on ? "🔊 Detener" : "📢 Llamar";
  });
  pintarBarra_();
}

// Barra fija abajo: la tarjeta puede desaparecer (OT finalizada, cambio de
// vista) y sin esto el llamado quedaría sonando sin botón para apagarlo.
function pintarBarra_() {
  let bar = document.getElementById("llamadoBar");
  if (!activas_.size) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "llamadoBar";
    bar.className = "llamadoBar";
    document.body.appendChild(bar);
  }
  bar.innerHTML = [...activas_.values()].map(ll => `
    <div class="llamadoBarRow">
      <span class="llamadoBarTxt">🔊 Llamando a <b>${escapeHtml(nombreHablado_(ll.nombre))}</b>
        <span class="llamadoBarRol">(${ROTULO[ll.rol] || ll.rol})</span></span>
      <button type="button" class="llamadoBarStop"
        data-llamar-vin="${escapeHtml(ll.vin)}" data-llamar-rol="${escapeHtml(ll.rol)}">Detener</button>
    </div>`).join("");
}

// Captura: el toque no debe llegar a la delegación de la tarjeta.
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".btnLlamar[data-llamar-vin], .llamadoBarStop[data-llamar-vin]");
  if (!b) return;
  e.stopPropagation();
  e.preventDefault();
  const id = idDe_(b.dataset.llamarVin, b.dataset.llamarRol);
  alternar_({
    vin: b.dataset.llamarVin,
    rol: b.dataset.llamarRol,
    nombre: activas_.get(id)?.nombre || b.dataset.llamarNombre || "",
  });
}, true);

// ── HTML de la línea de personal en las tarjetas de CALIDAD ─────────────

function botonLlamar_(vin, rol, nombre) {
  if (!vin || !nombre) return "";
  const on = llamadaActiva_(vin, rol);
  return `<button type="button" class="btnLlamar${on ? " is-on" : ""}" aria-pressed="${on}"
    data-llamar-vin="${escapeHtml(String(vin).toUpperCase())}" data-llamar-rol="${rol}"
    data-llamar-nombre="${escapeHtml(nombre)}">${on ? "🔊 Detener" : "📢 Llamar"}</button>`;
}

/** "🔧 MOTOR: Juan [📢 Llamar]  🛢️ TANQUERO: Pedro [📢 Llamar]" */
export function personalCalidadHTML_(it) {
  const m = String(it?.motorNombre || "");
  const t = String(it?.tanqueroNombre || "");
  return [
    m ? `<span class="llamadoPer">🔧 MOTOR: <b>${escapeHtml(m)}</b> ${botonLlamar_(it.vin, "MOTOR", m)}</span>` : "",
    t ? `<span class="llamadoPer">🛢️ TANQUERO: <b>${escapeHtml(t)}</b> ${botonLlamar_(it.vin, "TANQUE", t)}</span>` : "",
  ].join("");
}
