// =========================
// whatsapp/agente.mjs
// Corre en la laptop de la oficina (la misma de la impresora).
//
// Manda al grupo de WhatsApp las fallas que registra Calidad: la foto y el
// comentario. El servidor (Render) no tiene WhatsApp; esta laptop sí, con la
// sesión del número alternativo, igual que WhatsApp Web.
//
//   1. el inspector registra la falla → el servidor la deja en la cola
//      (routes/whatsapp.js) y avisa por /api/events (topic "whatsapp")
//   2. este agente pide GET /api/whatsapp/cola
//   3. descarga las fotos y las manda al grupo: la primera con el texto
//   4. POST /api/whatsapp/enviado → sale de la cola
//
// Si la laptop está apagada, la cola espera: al prenderla sale todo.
//
// LA PRIMERA VEZ (o si WhatsApp cerró la sesión)
// Abrir iniciar.cmd (con ventana): sale un QR en la ventana y también se
// abre qr.png. En el celular del número alternativo: WhatsApp → Dispositivos
// vinculados → Vincular dispositivo → escanear. La sesión queda en sesion/
// (no se sube al repo). Después ya corre sin ventana con iniciar-oculto.vbs.
//
// Uso: node agente.mjs --email x@y.com --grupo "Nombre exacto del grupo"
//   --prueba : se conecta y busca el grupo, pero no manda nada.
// =========================

import * as B from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";
import { createServer } from "node:net";
import { existsSync, statSync, rmSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const makeWASocket = B.makeWASocket || B.default?.default || B.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = B;

// ── Configuración ────────────────────────────────────────────────────────
function arg_(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const APP = (arg_("app") || process.env.GLP_APP || "https://glp-control.onrender.com").replace(/\/+$/, "");
// Un ADMIN o SUPERVISOR activo: la cola solo se les da a ellos.
const EMAIL = arg_("email") || process.env.GLP_EMAIL || "";
const GRUPO = arg_("grupo") || process.env.GLP_WSP_GRUPO || "";
const PRUEBA = process.argv.includes("--prueba");

const VUELTA_MS = 3 * 60_000;
const ENTRE_MENSAJES_MS = 1_500;   // no ráfagas: WhatsApp castiga lo que parece bot
const SESION = fileURLToPath(new URL("./sesion", import.meta.url));
const QR_PNG = fileURLToPath(new URL("./qr.png", import.meta.url));
const MIEMBROS = fileURLToPath(new URL("./miembros.json", import.meta.url));
// email del técnico en la app → su número de WhatsApp. Lo arma Carlos a mano
// (NO va al repo). Ver etiquetar_().
const TELEFONOS = fileURLToPath(new URL("./telefonos.json", import.meta.url));

if (!EMAIL || !GRUPO) {
  console.error([
    !EMAIL && "Falta --email (un ADMIN o SUPERVISOR).",
    !GRUPO && 'Falta --grupo "Nombre del grupo" (tal cual sale en WhatsApp).',
  ].filter(Boolean).join("\n"));
  process.exit(1);
}

const LOG = new URL("./agente.log", import.meta.url);
try { if (existsSync(LOG) && statSync(LOG).size > 1_000_000) rmSync(LOG); } catch { /* sigue */ }
const hora_ = () => new Date().toLocaleString("es-PE", { hour12: false });
const log = (...xs) => {
  const linea = `[${hora_()}] ${xs.join(" ")}`;
  console.log(linea);
  try { appendFileSync(LOG, linea + "\n"); } catch { /* sin log */ }
};
const espera_ = (ms) => new Promise(r => setTimeout(r, ms));

// ── Una sola copia corriendo ─────────────────────────────────────────────
// Dos agentes con la misma sesión se patean entre ellos y mandarían doble.
await new Promise((resolve) => {
  const srv = createServer().once("error", () => {
    log("Ya hay otro agente de WhatsApp corriendo en esta laptop. Este se cierra.");
    process.exit(3);
  });
  srv.listen(47322, "127.0.0.1", resolve);
});

// ── WhatsApp ─────────────────────────────────────────────────────────────
let sock = null;
let listo = false;       // conectado y con el grupo encontrado
let conectado = false;   // WhatsApp abierto (con o sin grupo)
let grupoId = "";

// Solo letras y números: "SUM GLP FALLAS / ERRORES" y el mismo
// con un espacio, una tilde o un paréntesis de más se dan por el mismo grupo.
const normal_ = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── Miembros del grupo ───────────────────────────────────────────────────
// Para etiquetar (@) al técnico hay que saber qué número es de quién.
// WhatsApp da los números del grupo pero no los nombres; los nombres se van
// juntando solos: el apodo que cada uno se puso (cuando escribe en el grupo)
// y el nombre con que está guardado en los contactos del celular
// alternativo. Todo queda en miembros.json (NO va al repo: son teléfonos).
const miembros = new Map();   // id (lid o jid) → { id, numero, apodo, agendado, enGrupo }
try {
  for (const m of JSON.parse(readFileSync(MIEMBROS, "utf8")).miembros || []) miembros.set(m.id, { ...m, enGrupo: false });
} catch { /* primera vez */ }

const numeroDe_ = (jid) => (String(jid || "").endsWith("@s.whatsapp.net") ? String(jid).split("@")[0].split(":")[0] : "");
let guardarReloj = null;
function guardarMiembros_() {
  clearTimeout(guardarReloj);
  guardarReloj = setTimeout(() => {
    const lista = [...miembros.values()].sort((a, b) => Number(b.enGrupo) - Number(a.enGrupo) || String(a.apodo || a.agendado || "~").localeCompare(String(b.apodo || b.agendado || "~")));
    try { writeFileSync(MIEMBROS, JSON.stringify({ grupo: GRUPO, actualizado: new Date().toISOString(), miembros: lista }, null, 2)); }
    catch (err) { log("No pude guardar miembros.json:", err.message); }
  }, 2_000);
}

/** Junta lo que se sepa de un contacto en su ficha (por lid o por número). */
function anotar_({ id, lid, jid, notify, name, phoneNumber }) {
  const claves = [id, lid, jid, phoneNumber].filter(Boolean);
  let m = claves.map(k => miembros.get(k)).find(Boolean)
    || [...miembros.values()].find(x => claves.some(k => k === x.lid || k === x.jid));
  if (!m) return;          // solo interesan los del grupo
  let cambio = false;
  const numero = numeroDe_(jid) || numeroDe_(phoneNumber) || numeroDe_(id);
  if (numero && m.numero !== numero) { m.numero = numero; cambio = true; }
  if (notify && m.apodo !== notify) { m.apodo = notify; cambio = true; }
  if (name && m.agendado !== name) { m.agendado = name; cambio = true; }
  if (cambio) guardarMiembros_();
}

async function leerMiembros_() {
  const meta = await sock.groupMetadata(grupoId);
  lidDe.clear();   // alguien entró o salió: se vuelven a resolver
  for (const m of miembros.values()) m.enGrupo = false;
  for (const p of meta.participants || []) {
    const id = p.id;
    const previo = miembros.get(id) || {};
    miembros.set(id, {
      ...previo, id,
      lid: p.lid || (String(id).endsWith("@lid") ? id : previo.lid || ""),
      jid: p.jid || p.phoneNumber || (String(id).endsWith("@s.whatsapp.net") ? id : previo.jid || ""),
      numero: numeroDe_(p.jid) || numeroDe_(p.phoneNumber) || numeroDe_(id) || previo.numero || "",
      apodo: p.notify || previo.apodo || "",
      agendado: p.name || previo.agendado || "",
      admin: p.admin || "",
      enGrupo: true,
    });
  }
  guardarMiembros_();
  const conNombre = [...miembros.values()].filter(m => m.enGrupo && (m.apodo || m.agendado)).length;
  log(`Miembros del grupo: ${meta.participants?.length || 0} (${conNombre} con nombre). Lista en miembros.json`);
  revisarEtiquetas_().catch(err => log("No pude revisar telefonos.json:", err.message));
}

/** Al arrancar: a quién de telefonos.json se podrá etiquetar y a quién no. */
async function revisarEtiquetas_() {
  const tel = telefonos_();
  const sin = [];
  let ok = 0;
  for (const [email, t] of Object.entries(tel)) {
    if (await lidDeEmail_(email)) ok++;
    else sin.push(t.nombre || email);
  }
  if (Object.keys(tel).length) log(`Etiquetas: ${ok} técnicos listos.${sin.length ? ` Sin etiqueta: ${sin.join(", ")}.` : ""}`);
}

// ── Etiquetar (@) al técnico ─────────────────────────────────────────────
// telefonos.json: { "correo@app": { "nombre": "...", "numero": "51999..." } }
// o, para los que esconden su número, { "lid": "1234...@lid" } sacado de
// miembros.json. En el grupo cada miembro se nombra por su lid: el número se
// traduce a lid con onWhatsApp (una vez, y queda en memoria).
const lidDe = new Map();   // email → lid del grupo ("" si no está)

function telefonos_() {
  try { return JSON.parse(readFileSync(TELEFONOS, "utf8")); } catch { return {}; }
}

async function lidDeEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return "";
  if (lidDe.has(e)) return lidDe.get(e);
  const t = telefonos_()[e];
  if (!t) return "";
  let lid = t.lid || "";
  const numero = String(t.numero || "").replace(/\D/g, "");
  if (!lid && numero) {
    const m = [...miembros.values()].find(x => x.numero === numero && x.enGrupo);
    lid = m?.lid || m?.id || "";
    if (!lid) {
      try {
        const [r] = (await sock.onWhatsApp(`${numero}@s.whatsapp.net`)) || [];
        lid = r?.lid ? String(r.lid) : "";
        if (lid && !lid.includes("@")) lid += "@lid";
      } catch (err) { log(`No pude buscar el número de ${t.nombre || e}: ${err.message}`); }
    }
  }
  const enGrupo = lid && [...miembros.values()].some(x => x.enGrupo && (x.id === lid || x.lid === lid));
  if (lid && !enGrupo) log(`${t.nombre || e} no está en el grupo: va sin etiqueta.`);
  lidDe.set(e, enGrupo ? lid : "");
  return enGrupo ? lid : "";
}

/** Cambia "🔧 Técnico: NOMBRE" por "🔧 Técnico: @…" y devuelve las menciones. */
async function etiquetar_(it) {
  const lid = await lidDeEmail_(it.tecnicoEmail).catch(() => "");
  if (!lid || !it.tecnico) return { texto: it.texto, mentions: [] };
  const linea = `🔧 Técnico: ${it.tecnico}`;
  if (!String(it.texto).includes(linea)) return { texto: it.texto, mentions: [] };
  return { texto: it.texto.replace(linea, `🔧 Técnico: @${lid.split("@")[0]}`), mentions: [lid] };
}

async function buscarGrupo_() {
  const grupos = Object.values(await sock.groupFetchAllParticipating());
  const g = grupos.find(x => normal_(x.subject) === normal_(GRUPO));
  if (!g) {
    log(`No encuentro el grupo "${GRUPO}". Este número está en: ${grupos.map(x => `"${x.subject}"`).join(", ") || "(ninguno)"}`);
    log("Agrega el número alternativo al grupo o corrige --grupo en iniciar.cmd.");
    return "";
  }
  return g.id;
}

async function conectar_() {
  const { state, saveCreds } = await useMultiFileAuthState(SESION);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* usa la de la librería */ }

  sock = makeWASocket({
    auth: state,
    version,
    logger: P({ level: "silent" }),
    browser: Browsers.windows("GLP Calidad"),
    markOnlineOnConnect: false,     // que el celular siga recibiendo notificaciones
    syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);

  // Nombres de los miembros (ver anotar_): de los contactos del celular y de
  // los mensajes que escriben en el grupo.
  sock.ev.on("contacts.upsert", (cs) => cs.forEach(anotar_));
  sock.ev.on("contacts.update", (cs) => cs.forEach(anotar_));
  sock.ev.on("messaging-history.set", ({ contacts = [], messages = [] }) => {
    contacts.forEach(anotar_);
    for (const msg of messages) {
      if (msg.key?.remoteJid === grupoId && msg.pushName) anotar_({ id: msg.key.participant, jid: msg.key.participantPn || msg.key.participantAlt, notify: msg.pushName });
    }
  });
  sock.ev.on("messages.upsert", ({ messages = [] }) => {
    for (const msg of messages) {
      if (grupoId && msg.key?.remoteJid === grupoId && !msg.key.fromMe && msg.pushName) {
        anotar_({ id: msg.key.participant, jid: msg.key.participantPn || msg.key.participantAlt, notify: msg.pushName });
      }
    }
  });
  sock.ev.on("group-participants.update", ({ id }) => {
    if (id === grupoId) leerMiembros_().catch(err => log("No pude releer miembros:", err.message));
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      log("Escanea el QR: WhatsApp del número alternativo → Dispositivos vinculados → Vincular dispositivo.");
      try {
        console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
        await QRCode.toFile(QR_PNG, qr, { width: 420 });
        if (!process.argv.includes("--no-abrir")) {
          spawn("cmd", ["/c", "start", "", QR_PNG], { detached: true, stdio: "ignore", windowsHide: true }).unref();
        }
      } catch (err) { log("No pude dibujar el QR:", err.message); }
    }

    if (connection === "open") {
      conectado = true;
      try { rmSync(QR_PNG, { force: true }); } catch { /* ya no está */ }
      grupoId = await buscarGrupo_().catch((err) => { log("Error leyendo grupos:", err.message); return ""; });
      listo = !!grupoId;
      if (listo) leerMiembros_().catch(err => log("No pude leer miembros:", err.message));
      log(listo ? `WhatsApp conectado. Grupo: "${GRUPO}".${PRUEBA ? " · MODO PRUEBA (no manda)" : ""}` : "WhatsApp conectado, pero sin grupo.");
      if (listo) revisar_();
    }

    if (connection === "close") {
      listo = false;
      conectado = false;
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        // Desvincularon la laptop desde el celular: hay que escanear de nuevo.
        log("WhatsApp cerró la sesión. Borro sesion/ y pido QR nuevo (abre iniciar.cmd para verlo).");
        rmSync(SESION, { recursive: true, force: true });
      } else {
        log(`WhatsApp desconectado (${codigo || lastDisconnect?.error?.message || "?"}). Reconecto…`);
      }
      await espera_(5_000);
      conectar_().catch(err => log("No pude reconectar:", err.message));
    }
  });
}

// ── La cola ──────────────────────────────────────────────────────────────
const q_ = `email=${encodeURIComponent(EMAIL)}`;
// Lo que ya salió al grupo pero el servidor no supo (falló el aviso): no se
// manda dos veces, solo se reintenta sacarlo de la cola.
const yaEnviados = new Set();

async function cola_() {
  const r = await fetch(`${APP}/api/whatsapp/cola?${q_}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `la cola respondió ${r.status}`);
  return j.items || [];
}

async function marcarEnviado_(id) {
  const r = await fetch(`${APP}/api/whatsapp/enviado`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, id }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `respondió ${r.status}`);
}

async function bajarFoto_(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`foto ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function mandar_(it) {
  if (!yaEnviados.has(it.id)) {
    const fotos = [];
    for (const url of it.fotos || []) {
      try { fotos.push(await bajarFoto_(url)); }
      catch (err) { log(`${it.vin}: no pude bajar una foto (${err.message}), sigue sin ella.`); }
    }
    const { texto, mentions } = await etiquetar_(it);
    if (PRUEBA) {
      log(`PRUEBA · ${it.vin}: ${fotos.length} foto(s) · ${String(texto).replace(/\n/g, " | ")}${mentions.length ? ` · etiqueta ${mentions}` : ""}`);
      yaEnviados.add(it.id);
      return;
    }
    if (!fotos.length) {
      await sock.sendMessage(grupoId, { text: texto, mentions });
    } else {
      for (let i = 0; i < fotos.length; i++) {
        await sock.sendMessage(grupoId, i === 0 ? { image: fotos[i], caption: texto, mentions } : { image: fotos[i] });
        if (i < fotos.length - 1) await espera_(800);
      }
    }
    yaEnviados.add(it.id);
    log(`Enviado · ${it.vin} · ${fotos.length} foto(s) · de ${it.autor}${mentions.length ? ` · etiquetado ${it.tecnico}` : ""}`);
  }
  if (PRUEBA) return;
  try { await marcarEnviado_(it.id); }
  catch (err) { log(`${it.vin}: salió al grupo pero no pude sacarlo de la cola (${err.message}). Reintento luego.`); }
}

let corriendo = false;
let otraVez = false;

async function revisar_() {
  // Conectado pero sin grupo (el número aún no estaba, o le cambiaron el
  // nombre): se vuelve a buscar en cada vuelta en vez de quedarse mudo.
  if (conectado && !listo) {
    grupoId = await buscarGrupo_().catch(() => "");
    listo = !!grupoId;
    if (listo) { log(`Grupo encontrado: "${GRUPO}".`); leerMiembros_().catch(() => {}); }
  }
  if (!listo) return;
  if (corriendo) { otraVez = true; return; }
  corriendo = true;
  try {
    do {
      otraVez = false;
      let items = [];
      try { items = await cola_(); }
      catch (err) { log("No pude leer la cola:", err.message); break; }
      for (const it of items) {
        if (!listo) break;
        try { await mandar_(it); }
        catch (err) { log(`${it.vin}: no se pudo mandar — ${err.message}`); }
        await espera_(ENTRE_MENSAJES_MS);
      }
    } while (otraVez && listo);
  } finally {
    corriendo = false;
  }
}

// ── Avisos del servidor (SSE) ────────────────────────────────────────────
async function escuchar_() {
  for (;;) {
    try {
      const r = await fetch(`${APP}/api/events`, { headers: { Accept: "text/event-stream" } });
      if (!r.ok || !r.body) throw new Error(`respondió ${r.status}`);
      log("Conectado al servidor. Esperando fallas de Calidad…");
      revisar_();
      const lector = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let corte;
        while ((corte = buf.indexOf("\n\n")) >= 0) {
          const bloque = buf.slice(0, corte);
          buf = buf.slice(corte + 2);
          const data = bloque.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5)).join("\n");
          if (!data) continue;
          try { if (JSON.parse(data).topic === "whatsapp") revisar_(); } catch { /* no es JSON */ }
        }
      }
      log("El servidor cerró la conexión. Reconectando…");
    } catch (err) {
      log("Sin conexión con el servidor:", err.message);
    }
    await espera_(5_000);
  }
}

log(`Grupo:    ${GRUPO}`);
log(`Servidor: ${APP}  (como ${EMAIL})${PRUEBA ? "  · MODO PRUEBA" : ""}`);
setInterval(revisar_, VUELTA_MS);
await conectar_();
escuchar_();
