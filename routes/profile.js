import { Router } from "express";
import { supabasePatch_ } from "../lib/supabase.js";

const router = Router();

// ─── ACTUALIZAR PERFIL ───────────────────────────────────────────────────────
// PATCH /api/perfil
// Actualiza el avatar_url del usuario (email se envía en el body desde el cliente)
router.patch("/api/perfil", async (req, res) => {
  try {
    const { avatar_url, email } = req.body || {};

    // Validar parámetros
    if (!avatar_url) {
      return res.status(400).json({ ok: false, error: "Falta avatar_url" });
    }

    if (!email) {
      return res.status(400).json({ ok: false, error: "Falta email" });
    }

    // Actualizar en Supabase
    const updated = await supabasePatch_(
      "usuarios",
      { email: String(email).trim().toLowerCase() },
      { avatar_url }
    );

    return res.json({
      ok: true,
      profile: updated,
      avatarUrl: updated?.avatar_url || avatar_url,
    });
  } catch (e) {
    console.error("[PROFILE] ERROR:", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;
