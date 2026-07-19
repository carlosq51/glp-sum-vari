import { Router } from "express";
import webpush from "web-push";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { sendPushToEmails_ } from "../lib/push.js";

const router = Router();

// -----------------------------------------------------------------
// WEB PUSH
// -----------------------------------------------------------------

// GET /api/push/vapid-public-key  — el cliente obtiene la clave pública VAPID
router.get("/api/push/vapid-public-key", (_req, res) => {
  res.json({ ok: true, key: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe  — el cliente guarda su suscripción
router.post("/api/push/subscribe", async (req, res) => {
  try {
    const { email, subscription } = req.body || {};
    if (!email || !subscription?.endpoint) {
      return res.status(400).json({ ok: false, error: "Faltan datos" });
    }
    const record = {
      email:    String(email).trim().toLowerCase(),
      endpoint: subscription.endpoint,
      p256dh:   subscription.keys?.p256dh || "",
      auth:     subscription.keys?.auth   || "",
    };
    // Upsert por endpoint — service key para bypassear RLS
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseServiceHeaders_();
    await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`,
      {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(record),
      }
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/push/subscribe]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/push/test — notificación de prueba (panel Admin → Notificaciones).
// Envía a TODOS los dispositivos suscritos del email dado; devuelve {sent, failed}
// para que el panel muestre si realmente salió algo.
router.post("/api/push/test", async (req, res) => {
  try {
    const { email, title, body, vibrate, delayMs } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

    const doSend = () => sendPushToEmails_([email], {
      title:   title || "🔔 Prueba GLP",
      body:    body  || "Notificación de prueba desde el panel Admin.",
      tag:     "glp-test",
      vibrate: Array.isArray(vibrate) && vibrate.length ? vibrate.map(Number) : undefined,
      data:    { url: "/" },
    });

    // Retardo opcional (máx 30s): da tiempo a bloquear pantalla / cerrar la app
    // para probar que el push llega igual. Responde YA; el envío queda programado.
    const wait = Math.min(30_000, Math.max(0, Number(delayMs) || 0));
    if (wait > 0) {
      setTimeout(() => { doSend().catch(() => {}); }, wait);
      return res.json({ ok: true, scheduled: true, delayMs: wait });
    }

    const out = await doSend();
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error("[POST /api/push/test]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
