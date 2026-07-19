import { Router } from "express";
import { supabasePatch_ } from "../lib/supabase.js";
import { getRolByEmail_ } from "../lib/authz.js";

const router = Router();

// Un avatar solo puede ser: vacío (borrar foto), un asset local /avatars/…,
// o una foto subida a nuestro bucket R2. Nada de URLs arbitrarias.
function avatarUrlValida_(url) {
  const u = String(url || "");
  if (u === "") return true;
  if (u.startsWith("/avatars/")) return true;
  const r2 = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (r2 && u.startsWith(r2 + "/")) return true;
  return false;
}

// ─── ACTUALIZAR PERFIL ───────────────────────────────────────────────────────
// PATCH /api/perfil
// Actualiza el avatar_url del usuario (email se envía en el body desde el cliente)
router.patch("/api/perfil", async (req, res) => {
  try {
    const { avatar_url, email } = req.body || {};

    // Validar parámetros — avatar_url puede ser "" (eliminar foto), pero no undefined
    if (avatar_url === undefined || avatar_url === null) {
      return res.status(400).json({ ok: false, error: "Falta avatar_url" });
    }

    if (!email) {
      return res.status(400).json({ ok: false, error: "Falta email" });
    }

    if (!avatarUrlValida_(String(avatar_url).split("?")[0])) {
      return res.status(400).json({ ok: false, error: "avatar_url no permitido" });
    }

    // El usuario debe existir y estar activo
    const u = await getRolByEmail_(email);
    if (!u || !u.activo) {
      return res.status(403).json({ ok: false, error: "Usuario no válido" });
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
