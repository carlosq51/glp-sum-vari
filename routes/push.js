import { Router } from "express";
import webpush from "web-push";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";

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

export default router;
