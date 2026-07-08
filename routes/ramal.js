import { Router } from "express";
import { supabaseHeaders_, supabaseServiceHeaders_, supabaseGet_, supabasePost_, supabasePatch_ } from "../lib/supabase.js";
import webpush from "web-push";

const router = Router();

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
    // PENDIENTES (todas) + ENTREGADOS de hoy — últimos 100 ordenados por fecha
    const url = `${SUPABASE_URL}/rest/v1/solicitudes_ramal?order=created_at.desc&limit=100`;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const all = await r.json();
    // Filtrar: pendientes siempre + entregados solo del día de hoy (local)
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    const items = all.filter(s =>
      s.estado === "PENDIENTE" ||
      (s.estado === "ENTREGADO" && (s.entregado_at || s.created_at || "").startsWith(todayStr))
    );
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
    const sol = Array.isArray(updated) ? updated[0] : null;
    const techEmail = sol?.tecnico_email || "";
    const vin       = sol?.vin || "";

    // 2. Enviar Web Push a todas las suscripciones del técnico
    if (techEmail) {
      try {
        // Usar service key para bypassear RLS en push_subscriptions
        const _svcUrl = `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?email=eq.${encodeURIComponent(techEmail)}`;
        const _svcR   = await fetch(_svcUrl, { headers: supabaseServiceHeaders_() });
        const subs    = _svcR.ok ? await _svcR.json() : [];
        const payload = JSON.stringify({
          title: "🔩 ¡Tu ramal está listo!",
          body:  vin ? `VIN: ${vin} — Acércate a recoger tu ramal.` : "Acércate a recoger tu ramal.",
          tag:   "ramal-listo",
        });
        await Promise.allSettled(
          (subs || []).map(s =>
            webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
            ).catch(err => {
              // 410 = suscripción caducada → limpiar
              if (err.statusCode === 410) {
                // Borrar suscripción caducada con service key
                const _delUrl = `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`;
                fetch(_delUrl, { method: "DELETE", headers: supabaseServiceHeaders_() }).catch(() => {});
              }
              console.warn("[PUSH] send error:", err.statusCode, err.message);
            })
          )
        );
      } catch (pushErr) {
        console.warn("[PUSH] fetch subs error:", pushErr.message);
      }
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
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const url = `${SUPABASE_URL}/rest/v1/solicitudes_ramal` +
      `?tecnico_email=eq.${encodeURIComponent(email)}` +
      `&estado=eq.PENDIENTE` +
      `&notificado_at=not.is.null` +
      `&order=notificado_at.desc&limit=1`;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const items = await r.json();
    return res.json({ ok: true, listo: items.length > 0, item: items[0] || null });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/mi-ramal]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/solicitud-ramal/mi-posicion  — posición del técnico en la cola PENDIENTE
router.get("/api/solicitud-ramal/mi-posicion", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const url = `${SUPABASE_URL}/rest/v1/solicitudes_ramal` +
      `?estado=eq.PENDIENTE&order=created_at.asc&select=id,tecnico_email`;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const items = await r.json();
    const idx = items.findIndex(it => String(it.tecnico_email || "").toLowerCase() === email);
    if (idx === -1) return res.json({ ok: true, enCola: false, posicion: null, total: items.length });
    return res.json({ ok: true, enCola: true, posicion: idx + 1, total: items.length });
  } catch (e) {
    console.error("[GET /api/solicitud-ramal/mi-posicion]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/solicitud-ramal/:id/entregar  — el ramalero marca como entregado
router.post("/api/solicitud-ramal/:id/entregar", async (req, res) => {
  try {
    const id    = String(req.params.id || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!id) return res.status(400).json({ ok: false, error: "Falta id" });

    const usuarios = await supabaseGet_("usuarios", { email });
    const nombre = usuarios?.[0]?.nombre || email;

    await supabasePatch_("solicitudes_ramal", { id }, {
      estado:        "ENTREGADO",
      entregado_at:  new Date().toISOString(),
      entregado_por: nombre,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/solicitud-ramal/:id/entregar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
