import { Router } from "express";
import { supabaseHeaders_, supabaseGet_, supabasePost_, supabasePatch_ } from "../lib/supabase.js";
import { getConfig_ } from "../lib/config.js";
import { emitEvent_ } from "../lib/events.js";
import { sendPushToEmails_, getEmailsByRol_ } from "../lib/push.js";

const router = Router();

// ── Micro-cache (10s) para endpoints de polling ──────────────────────────────
// /mi-ramal y /mi-posicion se consultan cada 15s POR CADA técnico conectado.
// Sin cache, N técnicos = 2N queries idénticas a Supabase por ciclo.
// Con cache compartido, todos se sirven de 2 queries cada 10s como máximo.
const _pollCache = { cola: null, colaTs: 0, notif: null, notifTs: 0 };

function invalidatePollCache_() {
  _pollCache.cola = null;  _pollCache.colaTs = 0;
  _pollCache.notif = null; _pollCache.notifTs = 0;
}

/** Cola PENDIENTE con OT activa (base de /cola y /mi-posicion) */
async function getColaPendiente_() {
  const now = Date.now();
  const { SRV_POLL_CACHE_TTL_MS } = await getConfig_();
  if (_pollCache.cola && (now - _pollCache.colaTs) < SRV_POLL_CACHE_TTL_MS) return _pollCache.cola;
  const url = `${process.env.SUPABASE_URL}/rest/v1/solicitudes_ramal` +
    `?estado=eq.PENDIENTE&select=id,vin,tecnico_nombre,tecnico_email,created_at,work_orders!inner(estado_general)` +
    `&work_orders.estado_general=neq.FINALIZADO&order=created_at.asc`;
  const r = await fetch(url, { method: "GET", headers: supabaseHeaders_() });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const items = (await r.json()).map(({ work_orders, ...rest }) => rest);
  _pollCache.cola = items;
  _pollCache.colaTs = now;
  return items;
}

/** Solicitudes PENDIENTES ya notificadas (base de /mi-ramal) */
async function getNotificadas_() {
  const now = Date.now();
  const { SRV_POLL_CACHE_TTL_MS, LIM_ENTREGADOS_RECIENTES } = await getConfig_();
  if (_pollCache.notif && (now - _pollCache.notifTs) < SRV_POLL_CACHE_TTL_MS) return _pollCache.notif;
  const url = `${process.env.SUPABASE_URL}/rest/v1/solicitudes_ramal` +
    `?estado=eq.PENDIENTE&notificado_at=not.is.null&order=notificado_at.desc&limit=${LIM_ENTREGADOS_RECIENTES}`;
  const r = await fetch(url, { method: "GET", headers: supabaseHeaders_() });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const items = await r.json();
  _pollCache.notif = items;
  _pollCache.notifTs = now;
  return items;
}

// -----------------------------------------------------------------
// SOLICITUDES RAMAL
// -----------------------------------------------------------------

// POST /api/solicitud-ramal  — el técnico MOTOR crea una solicitud
router.post("/api/solicitud-ramal", async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const vin   = String(body.vin   || "").trim().toUpperCase();
    const conversionId = String(body.conversionId || "").trim();
    const nota  = String(body.nota  || "").trim();

    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

    // Validar: solo 1 solicitud PENDIENTE por VIN
    if (vin) {
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const headers = supabaseHeaders_();
      const checkUrl = `${SUPABASE_URL}/rest/v1/solicitudes_ramal?vin=eq.${encodeURIComponent(vin)}&estado=eq.PENDIENTE&limit=1`;
      const checkRes = await fetch(checkUrl, { method: "GET", headers });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        if (Array.isArray(existing) && existing.length > 0) {
          return res.status(409).json({ ok: false, error: "Ya existe una solicitud pendiente para este VIN", errorType: "DUPLICATE_VIN" });
        }
      }
    }

    // Obtener nombre del técnico
    const usuarios = await supabaseGet_("usuarios", { email });
    const tecnicoNombre = usuarios?.[0]?.nombre || email;

    const data = {
      vin:            vin || null,
      work_order_id:  conversionId || null,
      tecnico_nombre: tecnicoNombre,
      tecnico_email:  email,
      nota,
      estado:         "PENDIENTE",
    };

    const result = await supabasePost_("solicitudes_ramal", data);
    invalidatePollCache_();
    emitEvent_("ramal", { accion: "SOLICITADA", vin });

    // Push a los ramaleros: solicitud nueva en su cola (background, best-effort)
    (async () => {
      const ramaleros = await getEmailsByRol_("RAMALERO");
      if (!ramaleros.length) return;
      await sendPushToEmails_(ramaleros, {
        title: "🔩 Nueva solicitud de ramal",
        body:  `${tecnicoNombre}${vin ? ` — VIN: ${vin}` : ""}${nota ? `\n${nota.slice(0, 100)}` : ""}`,
        tag:   "ramal-solicitud",
      });
    })().catch(() => {});

    return res.json({ ok: true, item: Array.isArray(result) ? result[0] : result });
  } catch (e) {
    console.error("[POST /api/solicitud-ramal]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/pendientes  — el ramalero lista todas (PENDIENTE + ENTREGADO recientes)
router.get("/api/solicitud-ramal/pendientes", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // PENDIENTES: solo las cuya OT vinculada sigue activa (no FINALIZADA).
    // Sin este filtro, solicitudes de OTs ya cerradas (nunca marcadas "Entregado")
    // quedan huérfanas para siempre e inflan la cola indefinidamente.
    const pendUrl = `${SUPABASE_URL}/rest/v1/solicitudes_ramal` +
      `?estado=eq.PENDIENTE&select=*,work_orders!inner(estado_general)` +
      `&work_orders.estado_general=neq.FINALIZADO&order=created_at.asc`;
    const pendRes = await fetch(pendUrl, { method: "GET", headers });
    if (!pendRes.ok) throw new Error(`Supabase ${pendRes.status}`);
    const pendientes = (await pendRes.json()).map(({ work_orders, ...rest }) => rest);

    // ENTREGADOS de hoy — últimos N por fecha de creación
    const { LIM_ENTREGADOS_RECIENTES } = await getConfig_();
    const entrUrl = `${SUPABASE_URL}/rest/v1/solicitudes_ramal?estado=eq.ENTREGADO&order=created_at.desc&limit=${LIM_ENTREGADOS_RECIENTES}`;
    const entrRes = await fetch(entrUrl, { method: "GET", headers });
    if (!entrRes.ok) throw new Error(`Supabase ${entrRes.status}`);
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    const entregados = (await entrRes.json()).filter(s =>
      (s.entregado_at || s.created_at || "").startsWith(todayStr)
    );

    const items = [...pendientes, ...entregados];
    // Ordenar: pendientes primero, luego entregados; dentro de cada grupo por created_at asc
    items.sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === "PENDIENTE" ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });

    // Enriquecer con modelo_normalizado desde tabla vins
    const vins = [...new Set(items.map(s => s.vin).filter(Boolean))];
    if (vins.length) {
      const vinsUrl = `${SUPABASE_URL}/rest/v1/vins?vin=in.(${vins.map(encodeURIComponent).join(",")})&select=vin,modelo_normalizado`;
      const vr = await fetch(vinsUrl, { method: "GET", headers });
      if (vr.ok) {
        const vinsData = await vr.json();
        const modeloMap = {};
        vinsData.forEach(v => { if (v.vin) modeloMap[v.vin] = v.modelo_normalizado || ""; });
        items.forEach(s => { s.modelo_normalizado = modeloMap[s.vin] || ""; });
      }
    }

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/pendientes]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/solicitud-ramal/:id/notificar  — el ramalero avisa que el ramal está listo
router.post("/api/solicitud-ramal/:id/notificar", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Falta id" });

    // 1. Marcar notificado_at en la solicitud
    const updated = await supabasePatch_("solicitudes_ramal", { id }, { notificado_at: new Date().toISOString() });
    invalidatePollCache_();
    emitEvent_("ramal", { accion: "NOTIFICADA", id });
    const sol = Array.isArray(updated) ? updated[0] : null;
    const techEmail = sol?.tecnico_email || "";
    const vin       = sol?.vin || "";

    // 2. Web Push a todos los dispositivos del técnico (lib/push.js)
    if (techEmail) {
      await sendPushToEmails_([techEmail], {
        title: "🔩 ¡Tu ramal está listo!",
        body:  vin ? `VIN: ${vin} — Acércate a recoger tu ramal.` : "Acércate a recoger tu ramal.",
        tag:   "ramal-listo",
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/solicitud-ramal/:id/notificar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/mi-ramal  — el técnico consulta si su ramal está listo
router.get("/api/solicitud-ramal/mi-ramal", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });
    const notificadas = await getNotificadas_();
    const item = notificadas.find(s => String(s.tecnico_email || "").toLowerCase() === email) || null;
    return res.json({ ok: true, listo: !!item, item });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/mi-ramal]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/cola  — detalle completo y ordenado de la cola PENDIENTE
// (transparencia: quién solicitó qué y a qué hora, visible para cualquier técnico)
router.get("/api/solicitud-ramal/cola", async (req, res) => {
  try {
    // Mismo filtro que /mi-posicion: solo solicitudes cuya OT vinculada sigue activa.
    const items = await getColaPendiente_();
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/cola]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/mi-posicion  — posición del técnico en la cola PENDIENTE
router.get("/api/solicitud-ramal/mi-posicion", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });
    // Solo cuenta solicitudes cuya OT vinculada sigue activa (no FINALIZADA) —
    // evita contar solicitudes huérfanas de trabajos ya terminados.
    const items = await getColaPendiente_();
    const idx = items.findIndex(it => String(it.tecnico_email || "").toLowerCase() === email);
    if (idx === -1) return res.json({ ok: true, enCola: false, posicion: null, total: items.length });
    return res.json({ ok: true, enCola: true, posicion: idx + 1, total: items.length });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/mi-posicion]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/solicitud-ramal/:id/entregar  — el ramalero marca como entregado
//
// Además de cerrar la solicitud, DESCUENTA el ramal del stock. Este es el
// eslabón que hace honesto el módulo de ramales (routes/ramales.js): un
// ramal que alguien dijo armar tiene que aparecer después en la mano de
// un técnico, y esa aparición es la que consume el saldo. Sin este
// descuento la cola era una lista de avisos sin consecuencia material.
//
// El movimiento se anota best-effort: si `supabase/ramales.sql` todavía
// no se corrió, la entrega al técnico NO puede fallar por eso — el
// taller sigue operando y el stock se empieza a llevar cuando exista.
router.post("/api/solicitud-ramal/:id/entregar", async (req, res) => {
  try {
    const id    = String(req.params.id || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!id) return res.status(400).json({ ok: false, error: "Falta id" });

    const usuarios = await supabaseGet_("usuarios", { email });
    const usuario = usuarios?.[0] || null;
    const nombre = usuario?.nombre || email;

    // El tipo lo elige el ramalero al entregar: es el único momento en que
    // alguien tiene el ramal en la mano y sabe cuál es.
    const tipoRamal = String(req.body?.tipo_ramal || "").trim() || null;

    const sol = await supabasePatch_("solicitudes_ramal", { id }, {
      estado:        "ENTREGADO",
      entregado_at:  new Date().toISOString(),
      entregado_por: nombre,
      ...(tipoRamal ? { tipo_ramal: tipoRamal } : {}),
      ...(usuario?.id ? { entregado_por_user_id: usuario.id } : {}),
    });

    let stockDescontado = false;
    if (tipoRamal) {
      try {
        await supabasePost_("ramal_movimientos", {
          tipo:         "ENTREGA",
          tipo_ramal:   tipoRamal,
          cantidad:     -1,
          solicitud_id: id,
          user_id:      usuario?.id || null,
          user_nombre:  nombre,
          destino:      sol?.tecnico_nombre || "",
          vin:          sol?.vin || null,
          nota:         "Entrega a técnico",
          created_by:   nombre,
        });
        stockDescontado = true;
        emitEvent_("ramales", { accion: "ENTREGA_STOCK", id });
      } catch (err) {
        console.warn("[entregar] no se pudo descontar del stock:", err.message);
      }
    }

    invalidatePollCache_();
    emitEvent_("ramal", { accion: "ENTREGADA", id });
    return res.json({ ok: true, stock_descontado: stockDescontado });
  } catch (e) {
    console.error("[PATCH /api/solicitud-ramal/:id/entregar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
