// =========================
// whatsapp/repuestos.mjs
// Segundo canal del agente: las entregas de repuestos de la app Repuestos SUM.
//
//   1. Almacén registra la entrega en la app de Repuestos (Stock de piezas →
//      📦 Entregar repuesto): VIN, pieza, técnico y foto. La app la anota en
//      el Drive y la deja en su cola (GET /api/whatsapp/cola).
//   2. Este canal entra a esa app con un usuario supervisor, lee la cola,
//      manda cada entrega al grupo ALMACEN REPUESTOS (foto + texto, con el
//      técnico etiquetado si se sabe su número) y avisa POST
//      /api/whatsapp/enviado.
//
// Configuración en repuestos.json, junto a este archivo (NO va al repo: lleva
// la contraseña). Sin ese archivo el canal queda apagado:
//   { "app": "https://....onrender.com", "usuario": "...", "clave": "...",
//     "grupo": "ALMACEN REPUESTOS" }
// El número alternativo tiene que estar en ese grupo.
//
// Solo pregunta de 6:00 a 22:00 (hora de Lima): de noche el servidor gratuito
// duerme y no se le despierta por nada. Lo de la noche sale a las 6.
// =========================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONFIG = fileURLToPath(new URL("./repuestos.json", import.meta.url));
const VUELTA_MS = 45_000;
const ENTRE_MENSAJES_MS = 1_500;
const MIEMBROS_MS = 30 * 60_000;

/**
 * `ctx`: { sock: () => socket de Baileys, log, telefonos: () => { email: { nombre, numero, lid } },
 *          buscarGrupo: (nombre) => id, normal, espera, prueba }.
 * Devuelve { alConectar, alDesconectar }.
 */
export function canalRepuestos(ctx) {
  let cfg = null;
  try { cfg = JSON.parse(readFileSync(CONFIG, "utf8")); } catch { /* sin archivo */ }
  if (!cfg?.app || !cfg?.usuario || !cfg?.grupo) {
    ctx.log("Repuestos: sin repuestos.json (app, usuario, clave, grupo): no se mandan las entregas de Almacén.");
    return { alConectar() {}, alDesconectar() {} };
  }
  const APP = String(cfg.app).replace(/\/+$/, "");
  const { log, espera, normal } = ctx;

  let grupoId = "";
  let cookie = "";
  let reloj = null;
  let corriendo = false;
  const yaEnviados = new Set();
  let miembros = { ts: 0, ids: new Set(), porNumero: new Map() };

  // ── Sesión en la app de Repuestos ─────────────────────────────────────
  async function entrar_() {
    const r = await fetch(`${APP}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: cfg.usuario, clave: cfg.clave || "" }),
    });
    if (!r.ok) throw new Error(`no pude entrar a la app (${(await r.json().catch(() => ({}))).error || r.status})`);
    const galletas = r.headers.getSetCookie?.() || [r.headers.get("set-cookie") || ""];
    cookie = galletas.map(c => c.split(";")[0]).find(c => c.startsWith("rg_sesion=")) || "";
    if (!cookie) throw new Error("la app no dio sesión");
  }

  async function api_(ruta, cuerpo) {
    if (!cookie) await entrar_();
    const pedir = () => fetch(`${APP}${ruta}`, cuerpo
      ? { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(cuerpo) }
      : { headers: { Cookie: cookie } });
    let r = await pedir();
    if (r.status === 401) { await entrar_(); r = await pedir(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `respondió ${r.status}`);
    return j;
  }

  // ── Etiquetar al técnico ──────────────────────────────────────────────
  // La app de Repuestos solo da el nombre del técnico: se busca ese nombre en
  // los celulares que ya conoce el agente (app de GLP y telefonos.json) y se
  // etiqueta solo si ese número está en el grupo.
  const palabras_ = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z]+/).filter(w => w.length >= 3);
  function mismoNombre_(a, b) {
    const [x, y] = [palabras_(a), palabras_(b)].sort((p, q) => p.length - q.length);
    return x.length >= 2 && x.every(w => y.includes(w));
  }

  async function miembros_() {
    if (Date.now() - miembros.ts < MIEMBROS_MS) return miembros;
    const meta = await ctx.sock().groupMetadata(grupoId);
    const ids = new Set();
    const porNumero = new Map();
    for (const p of meta.participants || []) {
      ids.add(p.id);
      if (p.lid) ids.add(p.lid);
      const jid = p.jid || p.phoneNumber || (String(p.id).endsWith("@s.whatsapp.net") ? p.id : "");
      const numero = String(jid).split("@")[0].split(":")[0];
      if (numero) porNumero.set(numero, p.id);
    }
    miembros = { ts: Date.now(), ids, porNumero };
    return miembros;
  }

  async function idDelTecnico_(nombre) {
    const tel = await ctx.telefonos();
    const coinciden = Object.values(tel).filter(t => mismoNombre_(t.nombre, nombre));
    if (coinciden.length !== 1) return "";   // nadie, o dos con el mismo nombre: sin etiqueta
    const t = coinciden[0];
    const m = await miembros_();
    if (t.lid && m.ids.has(t.lid)) return t.lid;
    const numero = String(t.numero || "").replace(/\D/g, "");
    if (!numero) return "";
    if (m.porNumero.has(numero)) return m.porNumero.get(numero);
    try {
      const [r] = (await ctx.sock().onWhatsApp(`${numero}@s.whatsapp.net`)) || [];
      let lid = r?.lid ? String(r.lid) : "";
      if (lid && !lid.includes("@")) lid += "@lid";
      return lid && m.ids.has(lid) ? lid : "";
    } catch { return ""; }
  }

  async function etiquetar_(it) {
    const linea = `🔧 Técnico: ${it.tecnico}`;
    const id = it.tecnico && String(it.texto).includes(linea) ? await idDelTecnico_(it.tecnico).catch(() => "") : "";
    if (!id) return { texto: it.texto, mentions: [] };
    return { texto: it.texto.replace(linea, `🔧 Técnico: @${id.split("@")[0]}`), mentions: [id] };
  }

  // ── Mandar ────────────────────────────────────────────────────────────
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
        catch (err) { log(`Repuestos ${it.vin}: no pude bajar una foto (${err.message}), sigue sin ella.`); }
      }
      const { texto, mentions } = await etiquetar_(it);
      if (ctx.prueba) {
        log(`PRUEBA · Repuestos ${it.vin}: ${fotos.length} foto(s) · ${String(texto).replace(/\n/g, " | ")}`);
        yaEnviados.add(it.id);
        return;
      }
      const sock = ctx.sock();
      if (!fotos.length) await sock.sendMessage(grupoId, { text: texto, mentions });
      for (let i = 0; i < fotos.length; i++) {
        await sock.sendMessage(grupoId, i === 0 ? { image: fotos[i], caption: texto, mentions } : { image: fotos[i] });
        if (i < fotos.length - 1) await espera(800);
      }
      yaEnviados.add(it.id);
      log(`Repuestos · enviado ${it.vin} · ${fotos.length} foto(s) · de ${it.autor}${mentions.length ? ` · etiquetado ${it.tecnico}` : ""}`);
    }
    if (ctx.prueba) return;
    try { await api_("/api/whatsapp/enviado", { id: it.id }); }
    catch (err) { log(`Repuestos ${it.vin}: salió al grupo pero no pude avisar a la app (${err.message}). Reintento luego.`); }
  }

  const horaLima_ = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", hourCycle: "h23" }).format(new Date()));

  async function revisar_() {
    if (corriendo || !grupoId) return;
    const h = horaLima_();
    if (h < 6 || h >= 22) return;
    corriendo = true;
    try {
      const { items = [] } = await api_("/api/whatsapp/cola");
      for (const it of items) {
        if (!grupoId) break;
        try { await mandar_(it); }
        catch (err) { log(`Repuestos ${it.vin}: no se pudo mandar — ${err.message}`); }
        await espera(ENTRE_MENSAJES_MS);
      }
    } catch (err) {
      log("Repuestos: no pude leer la cola:", err.message);
    } finally {
      corriendo = false;
    }
  }

  return {
    async alConectar() {
      grupoId = await ctx.buscarGrupo(cfg.grupo).catch(() => "");
      if (!grupoId) { log(`Repuestos: no encuentro el grupo "${cfg.grupo}". Agrega el número alternativo al grupo.`); return; }
      miembros.ts = 0;
      log(`Repuestos: grupo "${cfg.grupo}" · app ${APP} (como ${cfg.usuario})${ctx.prueba ? " · MODO PRUEBA" : ""}`);
      clearInterval(reloj);
      reloj = setInterval(revisar_, VUELTA_MS);
      revisar_();
    },
    alDesconectar() {
      grupoId = "";
      clearInterval(reloj);
    },
  };
}
