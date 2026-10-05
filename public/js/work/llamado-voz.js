// =========================
// public/js/work/llamado-voz.js
// Voz por el parlante del celular que toca el botón:
//  · CALIDAD: "📢" junto al delantero o al tanquero repite "Técnico
//    Juan Pérez, por favor, acérquese a control de calidad" (alternando
//    entre varias versiones) hasta volver a tocarlo.
//  · SUPERVISOR: avisos al taller (limpieza, reunión, frases propias) que
//    también se repiten hasta volver a tocarlos.
// =========================
//
// Todo corre en el teléfono (speechSynthesis + Web Audio): sin servidor, sin
// API de pago y sin internet. Lo que hay que saber del navegador:
//
//  · Solo deja sonar una página dentro de un toque. Por eso el toque que
//    enciende el llamado "desbloquea" la voz y el audio en ese mismo
//    instante; las repeticiones posteriores ya pueden salir solas.
//  · El VOLUMEN no se puede subir desde una página: ni iOS ni Android lo
//    permiten. Lo que sí se hace es pedir el máximo dentro de la app; el
//    volumen del celular y del parlante se suben a mano.
//  · Si la pantalla se apaga o se cambia de app, el sistema corta el audio.
//    Se pide Wake Lock mientras haya algo sonando para que no se bloquee.
//  · El parlante Bluetooth se duerme tras unos segundos de silencio y se come
//    el inicio de lo que suena. El "ding-dong" de antes de cada frase lo
//    despierta, y además hace que la gente levante la cabeza.
//
// Las tarjetas se repintan solas (sync cada pocos segundos, OT que se
// finaliza y desaparece), así que el estado vive aquí y no en el botón; la
// barra flotante permite apagar algo aunque su botón ya no exista.

import { escapeHtml } from "../core/format.js";

// 6 s entre rondas: con menos se oye como alarma y estresa; con más, quien
// llegó tarde al primer aviso se queda esperando a que lo repitan.
const PAUSA_ENTRE_RONDAS_MS = 6000;

const ROTULO = { MOTOR: "delantero", TANQUE: "tanquero" };

/** id → { id, textos, ultima, etiqueta, restantes } — restantes: Infinity = hasta apagarlo */
const activas_ = new Map();

let corriendo_ = false;
let despertar_ = null;   // corta la pausa entre rondas
let audioCtx_ = null;
let wakeLock_ = null;
let voz_ = null;

const idLlamada_ = (vin, rol) => `${String(vin || "").toUpperCase()}|${String(rol || "").toUpperCase()}`;
const idAviso_ = (clave) => `aviso|${clave}`;

export function llamadaActiva_(vin, rol) {
  return activas_.has(idLlamada_(vin, rol));
}

export function avisoActivo_(clave) {
  return activas_.has(idAviso_(clave));
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

// Varias versiones y se alterna entre ellas: oír la misma grabación una y
// otra vez es lo que suena robótico y termina molestando. Tono cordial, con
// "por favor" y "gracias": el llamado es frecuente y no debe sonar a regaño.
function frasesLlamada_(nombre) {
  const n = nombreHablado_(nombre);
  return [
    `Técnico ${n}, por favor, acérquese a control de calidad. Gracias.`,
    `${n}, lo esperamos en control de calidad.`,
    `Técnico ${n}, control de calidad lo está esperando. Gracias.`,
    `${n}, por favor, pase por control de calidad. Gracias.`,
    `Llamando al técnico ${n}. Por favor, acérquese a control de calidad.`,
  ];
}

// Al azar, pero nunca la misma dos veces seguidas.
function siguienteFrase_(it) {
  const t = it.textos;
  if (t.length < 2) return t[0] || "";
  let i;
  do { i = Math.floor(Math.random() * t.length); } while (i === it.ultima);
  it.ultima = i;
  return t[i];
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
    // Un poco más rápida y aguda que la de fábrica: a 0.95 sonaba desganada.
    u.rate = 1.05;
    u.pitch = 1.1;
    u.volume = 1;   // el máximo que una página puede pedir
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
  gan.gain.exponentialRampToValueAtTime(0.9, t0 + 0.02);
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
      for (const it of [...activas_.values()]) {
        if (!activas_.has(it.id)) continue;
        await dingDong_();
        if (!activas_.has(it.id)) continue;
        await hablar_(siguienteFrase_(it));
        it.restantes -= 1;
        if (it.restantes <= 0 && activas_.get(it.id) === it) {
          activas_.delete(it.id);
          refrescarUI_();
        }
      }
      if (activas_.size) await esperar_(PAUSA_ENTRE_RONDAS_MS);
    }
  } finally {
    corriendo_ = false;
    soltarWakeLock_();
  }
}

// ── Encender / apagar ───────────────────────────────────────────────────

/** Enciende o apaga. Llamarla SIEMPRE desde el handler del toque. */
function alternar_(id, crear) {
  if (activas_.has(id)) {
    activas_.delete(id);
    // Si estaba diciendo justo eso, que se calle ya.
    try { window.speechSynthesis?.cancel(); } catch {}
    if (!activas_.size) soltarWakeLock_();
  } else if (crear) {
    desbloquearAudio_();
    activas_.set(id, { id, ...crear() });
    pedirWakeLock_();
    despertar_?.();   // si estaba en la pausa entre rondas, que suene ya
    bucle_();
  }
  refrescarUI_();
}

/**
 * Aviso del supervisor: se repite hasta volver a tocarlo (o `veces` veces
 * si se pasa). `texto` puede ser una frase o varias para alternar. Tocar de
 * nuevo el mismo aviso mientras suena lo apaga.
 */
export function alternarAviso_(clave, { texto, etiqueta, veces = Infinity } = {}) {
  const textos = [].concat(texto || []).map(s => String(s).trim()).filter(Boolean);
  if (!textos.length && !avisoActivo_(clave)) return;
  alternar_(idAviso_(clave), () => ({
    textos,
    ultima: -1,
    etiqueta: `Aviso: <b>${escapeHtml(etiqueta || textos[0])}</b>`,
    restantes: veces,
  }));
}

function refrescarUI_() {
  document.querySelectorAll(".btnLlamar[data-llamar-vin]").forEach((b) => {
    const on = llamadaActiva_(b.dataset.llamarVin, b.dataset.llamarRol);
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.textContent = on ? "🔊 Detener" : "📢 Llamar";
  });
  document.dispatchEvent(new CustomEvent("glp:voz-cambio"));
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
  bar.innerHTML = [...activas_.values()].map(it => `
    <div class="llamadoBarRow">
      <span class="llamadoBarTxt">🔊 ${it.etiqueta}</span>
      <button type="button" class="llamadoBarStop" data-voz-id="${escapeHtml(it.id)}">Detener</button>
    </div>`).join("");
}

// Captura: el toque no debe llegar a la delegación de la tarjeta.
document.addEventListener("click", (e) => {
  const stop = e.target.closest?.(".llamadoBarStop[data-voz-id]");
  if (stop) {
    e.stopPropagation();
    e.preventDefault();
    alternar_(stop.dataset.vozId);
    return;
  }

  const b = e.target.closest?.(".btnLlamar[data-llamar-vin]");
  if (!b) return;
  e.stopPropagation();
  e.preventDefault();
  const { llamarVin: vin, llamarRol: rol, llamarNombre: nombre = "" } = b.dataset;
  alternar_(idLlamada_(vin, rol), () => ({
    textos: frasesLlamada_(nombre),
    ultima: -1,
    etiqueta: `Llamando a <b>${escapeHtml(nombreHablado_(nombre))}</b> ` +
      `<span class="llamadoBarRol">(${ROTULO[rol] || escapeHtml(rol)})</span>`,
    restantes: Infinity,
  }));
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
