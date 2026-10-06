// =========================
// lib/realtime.js
// El servidor escucha en Supabase Realtime lo que escribe Apps Script.
//
// Todo lo que cambia la app pasa por este servidor y él avisa con emitEvent_.
// Apps Script no: escribe directo en lista_diaria_activa, vins y work_orders
// (migración 007), y el servidor solo se enteraba al vencer el TTL de sus
// caches. Por eso esos TTL eran cortos, y cada vencimiento es una petición a
// Supabase: una línea de la cuota de logs.
//
// Con esta conexión el servidor se entera en el momento, y mientras esté
// SANA (suscripción confirmada y latido al día) los caches que dependían de
// Apps Script pueden durar mucho más: ttlConRealtime_(). Si se cae, vuelven
// solos al TTL de siempre: nunca se queda peor que sin Realtime.
//
// Es UNA conexión del servidor. Los celulares no se conectan a Realtime:
// siguen con el SSE (lib/events.js). Un intento anterior abría cuatro sockets
// por celular, mandaba {type:"subscribe"} en vez del phx_join que espera
// Supabase y nunca recibió un cambio (ver public/js/core/supabase-client.js).
// =========================

import WebSocket from "ws";
import { emitEvent_, ultimoEmit_ } from "./events.js";
import { invalidateByTopic_ } from "./poll-cache.js";

// Tabla → topics. `cache` se invalida siempre; `aviso` despierta pantallas
// por SSE, salvo que el servidor acabe de avisar ese topic (ver ECO_MS).
const TABLAS = {
  lista_diaria_activa: { cache: ["lista_diaria"], aviso: "movilizador" },
  vins:                { cache: ["vins"],         aviso: "vins" },
  work_orders:         { cache: ["work_orders"],  aviso: "work_orders" },
};

// Supabase devuelve también los cambios que hizo este servidor, que ya avisó
// al escribir. Si el topic se emitió hace menos de esto, el cambio es eco: se
// invalida el cache pero no se vuelve a despertar a las pantallas.
const ECO_MS = 10_000;
// Apps Script escribe en ráfagas (un fetchAll de decenas de PATCH): se juntan.
const AGRUPAR_MS = 2_000;
const LATIDO_MS = 25_000;
const LATIDO_VENCIDO_MS = 75_000;   // sin respuesta en 3 latidos → reconectar
const ESPERA_MAX_MS = 60_000;

let _ws = null;
let _ref = 0;
let _suscrito = false;
let _ultimaRespuesta = 0;
let _latido = null;
let _reintento = null;
let _espera = 1_000;
let _pendientes = new Set();
let _flush = null;

/** ¿Se puede confiar en que los cambios de Apps Script llegan solos? */
export function realtimeSano_() {
  return _suscrito && Date.now() - _ultimaRespuesta < LATIDO_VENCIDO_MS;
}

/**
 * TTL de un cache que depende de lo que escribe Apps Script: el largo
 * (SRV_CACHE_REALTIME_MS) mientras Realtime está sano, el de siempre si no.
 */
export function ttlConRealtime_(cfg, ttlMs) {
  return realtimeSano_() ? Math.max(ttlMs, Number(cfg.SRV_CACHE_REALTIME_MS) || 0) : ttlMs;
}

/** Arranca la conexión. Se llama una vez al levantar el servidor. */
export function iniciarRealtime_() {
  if (process.env.REALTIME_OFF === "1") return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
  conectar_();
}

function enviar_(msg) {
  try { _ws?.send(JSON.stringify(msg)); } catch { /* el cierre lo maneja onclose */ }
}

function conectar_() {
  clearTimeout(_reintento);
  const key = process.env.SUPABASE_SERVICE_KEY;
  const url = process.env.SUPABASE_URL.replace(/^http/, "ws") +
    `/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;

  const ws = new WebSocket(url);
  _ws = ws;

  ws.on("open", () => {
    _ultimaRespuesta = Date.now();
    const ref = String(++_ref);
    enviar_({
      topic: "realtime:servidor-glp",
      event: "phx_join",
      payload: {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: "" },
          postgres_changes: Object.keys(TABLAS).map(table => ({ event: "*", schema: "public", table })),
          private: false,
        },
        access_token: key,
      },
      ref,
      join_ref: ref,
    });
    clearInterval(_latido);
    _latido = setInterval(() => {
      if (Date.now() - _ultimaRespuesta > LATIDO_VENCIDO_MS) {
        console.warn("[Realtime] Sin latido: reconectando.");
        try { ws.terminate(); } catch { /* ya cerrado */ }
        return;
      }
      enviar_({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++_ref) });
    }, LATIDO_MS);
    _latido.unref?.();
  });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    _ultimaRespuesta = Date.now();

    if (msg.event === "phx_reply" && msg.payload?.status === "error") {
      console.warn("[Realtime] Suscripción rechazada:", JSON.stringify(msg.payload.response));
      return;
    }
    // La confirmación real: Supabase ya está leyendo los cambios de la base.
    if (msg.event === "system" && msg.payload?.extension === "postgres_changes") {
      if (msg.payload.status === "ok") {
        if (!_suscrito) console.log("[Realtime] Escuchando:", Object.keys(TABLAS).join(", "));
        _suscrito = true;
        _espera = 1_000;
        // Mientras estuvo caído pudo cambiar algo que nadie avisó.
        for (const t of Object.values(TABLAS)) for (const c of t.cache) invalidateByTopic_(c);
      } else {
        console.warn("[Realtime] Error de postgres_changes:", msg.payload.message);
        _suscrito = false;
      }
      return;
    }
    if (msg.event === "postgres_changes") {
      const tabla = msg.payload?.data?.table;
      if (TABLAS[tabla]) programarAviso_(tabla);
    }
  });

  ws.on("close", () => {
    if (_ws !== ws) return;           // un socket viejo que terminó tarde
    _suscrito = false;
    clearInterval(_latido);
    _reintento = setTimeout(conectar_, _espera);
    _reintento.unref?.();
    _espera = Math.min(_espera * 2, ESPERA_MAX_MS);
  });

  ws.on("error", (e) => {
    // Sin log en cada reintento: con la red caída serían cientos de líneas.
    if (_espera <= 1_000) console.warn("[Realtime] Error de conexión:", e.message);
  });
}

function programarAviso_(tabla) {
  _pendientes.add(tabla);
  if (_flush) return;
  _flush = setTimeout(() => {
    _flush = null;
    const tablas = _pendientes;
    _pendientes = new Set();
    for (const tabla of tablas) {
      const { cache, aviso } = TABLAS[tabla];
      for (const c of cache) invalidateByTopic_(c);
      if (Date.now() - ultimoEmit_(aviso) > ECO_MS) emitEvent_(aviso, { origen: "realtime", tabla });
    }
  }, AGRUPAR_MS);
  _flush.unref?.();
}
