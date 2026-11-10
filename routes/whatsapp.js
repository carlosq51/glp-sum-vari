// =========================
// routes/whatsapp.js
// Fallas de Calidad → grupo de WhatsApp.
//
// Cuando el inspector registra una falla desde su tarjeta (📸 Registrar
// calidad / fallas → Enviar falla), la foto y el comentario salen también a
// un grupo de WhatsApp.
//
// QUIÉN LA MANDA
// El servidor está en Render y no tiene WhatsApp. Lo tiene la laptop de la
// oficina: whatsapp/agente.mjs, con la sesión del número alternativo (igual
// que WhatsApp Web). El agente se entera por /api/events (topic "whatsapp")
// y, por si se perdió el aviso, revisa la cola cada 3 min.
//
//   · encolarFallaCalidad_()          lo llama routes/uploader.js tras subir
//   · GET  /api/whatsapp/cola         agente: lo pendiente, del más viejo al
//                                      más nuevo
//   · POST /api/whatsapp/enviado      agente: ya salió → se borra de la cola
//
// POR QUÉ EN R2 Y NO EN SUPABASE
// La cola tiene que aguantar que la laptop esté apagada (y que el servidor
// reinicie), así que no puede vivir en memoria. Son pocos archivos que se
// borran al enviarse: en R2 (avisos-wsp/…json) no hace falta migración ni
// gastan la cuota de logs de la base.
// =========================

import { Router } from "express";
import { requireRol_, getUsuarioByEmail_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { supabaseGet_ } from "../lib/supabase.js";
import { r2GuardarJson_, r2ListarJson_, r2BorrarKey_ } from "../r2-uploads.js";

const router = Router();
const PREFIJO = "avisos-wsp/";
const MAX_FOTOS = 6;          // un aviso con 20 fotos tapa el grupo
const MAX_NOTA = 1500;

const s_ = (v) => String(v ?? "").trim();

function horaLima_(d = new Date()) {
  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** El texto que sale en el grupo (pie de la primera foto). */
export function textoFalla_({ vin, modelo, nota, autor, hora }) {
  const lineas = [
    "❌ *Falla de Calidad*",
    `🚗 ${modelo ? `${modelo} · ` : ""}VIN ${vin}`,
  ];
  if (nota) lineas.push(`📝 ${nota}`);
  lineas.push(`👤 ${autor || "Calidad"} · ${hora}`);
  return lineas.join("\n");
}

/**
 * Deja la falla en la cola del grupo. No lanza: si falla, la falla ya quedó
 * guardada en R2 y eso es lo importante; solo no sale al grupo.
 * Devuelve true si quedó en cola.
 */
export async function encolarFallaCalidad_({ vin, nota, fotoUrls = [], email }) {
  try {
    const v = s_(vin).toUpperCase();
    if (!v) return false;
    const u = await getUsuarioByEmail_(email).catch(() => null);
    let modelo = "";
    try {
      const filas = await supabaseGet_("vins", { vin: v });
      modelo = s_(filas?.[0]?.modelo);
    } catch { /* sin modelo, sale igual */ }

    const ahora = new Date();
    const id = `${ahora.toISOString().replace(/[-:.TZ]/g, "")}_${v.slice(-8)}_${Math.random().toString(36).slice(2, 6)}`;
    const aviso = {
      id, tipo: "FALLA_CALIDAD", vin: v, modelo,
      nota: s_(nota).slice(0, MAX_NOTA),
      autor: u?.nombre || s_(email),
      fotos: fotoUrls.filter(Boolean).slice(0, MAX_FOTOS),
      creado: ahora.toISOString(),
    };
    aviso.texto = textoFalla_({ ...aviso, hora: horaLima_(ahora) });
    await r2GuardarJson_(`${PREFIJO}${id}.json`, aviso);
    emitEvent_("whatsapp", { id });
    return true;
  } catch (err) {
    console.warn("[whatsapp] encolar:", err.message);
    return false;
  }
}

router.get("/api/whatsapp/cola", requireRol_("ADMIN", "SUPERVISOR"), async (_req, res) => {
  try {
    const items = (await r2ListarJson_(PREFIJO)).map(x => x.data).filter(d => d?.id);
    res.json({ ok: true, items });
  } catch (err) {
    console.error("[whatsapp] cola:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/api/whatsapp/enviado", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  const id = s_(req.body?.id);
  if (!/^[\w-]{6,80}$/.test(id)) return res.status(400).json({ ok: false, error: "id inválido" });
  try {
    await r2BorrarKey_(`${PREFIJO}${id}.json`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp] enviado:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
