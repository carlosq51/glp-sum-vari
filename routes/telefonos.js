// =========================
// routes/telefonos.js
// Celulares del personal (usuarios.telefono, migración 014).
//
//   · GET /api/telefonos   [{ id, nombre, email, telefono }] de los activos
//                          con celular. Solo CALIDAD, SUPERVISOR y ADMIN:
//                          los técnicos no ven el número de los demás.
//
// Lo usan los botones 📞 / 🟢 de la tarjeta de Calidad
// (public/js/work/telefonos.js) y el agente de WhatsApp para etiquetar al
// técnico de una incidencia (whatsapp/agente.mjs).
// =========================

import { Router } from "express";
import { requireRol_, padron_ } from "../lib/authz.js";

const router = Router();

router.get("/api/telefonos", requireRol_("CALIDAD", "SUPERVISOR", "ADMIN"), async (_req, res) => {
  try {
    const p = await padron_();
    const items = p.rows
      .filter(u => u.activo && p.telefonoPorId?.get(u.id))
      .map(u => ({ id: u.id, nombre: u.nombre, email: u.email, telefono: p.telefonoPorId.get(u.id) }));
    res.set("Cache-Control", "private, max-age=300");
    res.json({ ok: true, items });
  } catch (err) {
    console.error("[telefonos]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
