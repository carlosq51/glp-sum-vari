// =========================
// impresora/agente.mjs
// Corre en la laptop de la oficina, la que ve la impresora en la red.
//
// El servidor vive en la nube y no puede hablar con una impresora de la red
// del taller. Esta laptop sí: escucha al servidor y, cuando un informe queda
// listo para imprimir (ENVIADO), hace esto sin que nadie toque nada:
//
//   1. pide las 3 hojas a /api/informes/:id/hojas
//   2. Chrome sin ventana las convierte en PDF
//   3. el PDF va a la impresora (SumatraPDF, que trae pdf-to-printer)
//   4. avisa al servidor: POST /api/informes/:id/impreso → sale de la cola
//
// CUÁNDO SALE UN INFORME
// Lo decide el técnico al mandarlo. "Esperar a compañero" lo deja en
// BORRADOR hasta que llegan las dos mitades; "Imprimir ya" lo pone en
// ENVIADO al momento. Aquí solo se imprime lo que está en ENVIADO.
//
// SE ENTERA POR DOS VÍAS
//   · /api/events (SSE): el servidor avisa en menos de un segundo.
//   · Una vuelta cada 3 min, por si el aviso se perdió (Wi-Fi que se cae,
//     el servidor que reinicia). Si la laptop estuvo apagada, al prenderla
//     sale todo lo que se acumuló.
//
// Uso: iniciar.cmd (lleva el correo y la impresora), o
//   node agente.mjs --email x@y.com --impresora "HP92BDEE (HP LaserJet Pro MFP 3101-3108)"
// =========================

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ptp from "pdf-to-printer";

// ── Configuración ────────────────────────────────────────────────────────
function arg_(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const APP = (arg_("app") || process.env.GLP_APP || "https://glp-control.onrender.com").replace(/\/+$/, "");
// Un ADMIN o SUPERVISOR activo: la cola y las hojas solo se les dan a ellos.
const EMAIL = arg_("email") || process.env.GLP_EMAIL || "";
const IMPRESORA = arg_("impresora") || process.env.GLP_IMPRESORA || "";
// --prueba: hace el PDF pero no lo manda a la impresora ni lo marca impreso.
const PRUEBA = process.argv.includes("--prueba");

const CHROMES = [
  process.env.GLP_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const CHROME = CHROMES.find(p => existsSync(p));

const VUELTA_MS = 3 * 60_000;

if (!EMAIL || !IMPRESORA || !CHROME) {
  console.error([
    !EMAIL && "Falta --email (un ADMIN o SUPERVISOR).",
    !IMPRESORA && "Falta --impresora (el nombre tal cual sale en Windows).",
    !CHROME && "No encuentro Chrome ni Edge. Pon la ruta en GLP_CHROME.",
  ].filter(Boolean).join("\n"));
  process.exit(1);
}

const hora_ = () => new Date().toLocaleTimeString("es-PE", { hour12: false });
const log = (...xs) => console.log(`[${hora_()}]`, ...xs);

// ── Lo ya impreso ────────────────────────────────────────────────────────
// La llave es id + updated_at, no el id solo: un informe que salió con
// "imprimir ya" vuelve a la cola, con el mismo id, cuando el compañero
// manda su parte. Ese tiene que volver a salir; el mismo sin cambios, no.
//
// Si la impresora imprimió pero el aviso al servidor falló, el informe
// sigue en ENVIADO: con esto se reintenta SOLO el aviso, sin gastar papel.
const impresos = new Map(); // llave → { id, marcado }

const llave_ = (it) => `${it.id}|${it.updated_at}`;

// ── Servidor ─────────────────────────────────────────────────────────────
const q_ = `email=${encodeURIComponent(EMAIL)}`;

async function cola_() {
  const r = await fetch(`${APP}/api/informes?${q_}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `la cola respondió ${r.status}`);
  // La API devuelve lo más nuevo primero; se imprime en el orden en que
  // llegaron, que es el orden en que los técnicos van a ir a buscarlos.
  return (j.items || []).filter(it => it.estado === "ENVIADO").reverse();
}

async function marcarImpreso_(id) {
  const r = await fetch(`${APP}/api/informes/${encodeURIComponent(id)}/impreso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `respondió ${r.status}`);
}

// ── PDF e impresora ──────────────────────────────────────────────────────
function pdfDe_(id, destino) {
  const perfil = mkdtempSync(join(tmpdir(), "glp-chrome-"));
  const url = `${APP}/api/informes/${encodeURIComponent(id)}/hojas?${q_}`;
  return new Promise((resolve, reject) => {
    const p = spawn(CHROME, [
      "--headless=new", "--disable-gpu", "--no-first-run",
      `--user-data-dir=${perfil}`,
      "--no-pdf-header-footer",
      `--print-to-pdf=${destino}`,
      url,
    ], { stdio: "ignore", windowsHide: true });
    const reloj = setTimeout(() => p.kill(), 90_000);
    p.on("error", reject);
    p.on("exit", () => {
      clearTimeout(reloj);
      try { rmSync(perfil, { recursive: true, force: true }); } catch { /* lo borra Windows */ }
      // Chrome sale con 0 aunque la página haya dado error: lo que vale es
      // que haya PDF y que no esté vacío.
      if (existsSync(destino) && statSync(destino).size > 5_000) resolve(destino);
      else reject(new Error("Chrome no generó el PDF"));
    });
  });
}

async function imprimir_(it) {
  const k = llave_(it);
  const previo = impresos.get(k);

  if (!previo) {
    const dir = mkdtempSync(join(tmpdir(), "glp-informe-"));
    try {
      const pdf = await pdfDe_(it.id, join(dir, `OT-${String(it.ot_fisica || it.id).replace(/[^\w-]/g, "_")}.pdf`));
      if (PRUEBA) {
        log(`PRUEBA · OT ${it.ot_fisica}: PDF listo en ${pdf} (no se imprime)`);
        impresos.set(k, { id: it.id, marcado: true });
        return;
      }
      await ptp.print(pdf, { printer: IMPRESORA, copies: 1 });
      log(`Impreso · OT ${it.ot_fisica} · ${it.placa || it.vin || ""} · de ${it.creado_nombre || it.creado_por}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    impresos.set(k, { id: it.id, marcado: false });
  }

  try {
    await marcarImpreso_(it.id);
    impresos.get(k).marcado = true;
  } catch (err) {
    log(`OT ${it.ot_fisica}: salió el papel pero no pude sacarlo de la cola (${err.message}). Reintento en la próxima vuelta.`);
  }
}

// ── La vuelta ────────────────────────────────────────────────────────────
// Una sola a la vez: si llegan tres avisos seguidos, se encadena una vuelta
// más en vez de imprimir el mismo informe tres veces en paralelo.
let corriendo = false;
let otraVez = false;

async function revisar_() {
  if (corriendo) { otraVez = true; return; }
  corriendo = true;
  try {
    do {
      otraVez = false;
      let items = [];
      try { items = await cola_(); }
      catch (err) { log("No pude leer la cola:", err.message); break; }
      for (const it of items) {
        try { await imprimir_(it); }
        catch (err) { log(`OT ${it.ot_fisica}: no se pudo imprimir — ${err.message}`); }
      }
    } while (otraVez);
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
      log("Conectado. Esperando informes…");
      revisar_();   // lo que llegó mientras no estaba conectado
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
          try {
            if (JSON.parse(data).topic === "informes") revisar_();
          } catch { /* aviso que no es JSON: se ignora */ }
        }
      }
      log("El servidor cerró la conexión. Reconectando…");
    } catch (err) {
      log("Sin conexión con el servidor:", err.message);
    }
    await new Promise(r => setTimeout(r, 5_000));
  }
}

log(`Impresora: ${IMPRESORA}`);
log(`Servidor:  ${APP}  (como ${EMAIL})${PRUEBA ? "  · MODO PRUEBA" : ""}`);
setInterval(revisar_, VUELTA_MS);
escuchar_();
