// =========================
// lib/push.js
// Envío centralizado de Web Push (notificación nativa en el celular).
//
// Cualquier ruta que quiera avisar a una persona llama:
//   await sendPushToEmails_(["tecnico@x.com"], { title, body, tag })
//
// - Busca todas las suscripciones del email en push_subscriptions
//   (un usuario puede tener varias: celular + tablet).
// - Envía en paralelo; una suscripción caducada (410) se borra sola.
// - NUNCA lanza: la notificación es best-effort, no debe romper la
//   respuesta HTTP de la mutación que la disparó.
// =========================

import webpush from "web-push";
import { supabaseServiceHeaders_ } from "./supabase.js";

function pushEnabled_() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function getSubsForEmails_(emails) {
  const list = [...new Set(emails.map(e => String(e || "").trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return [];
  const url = `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions` +
    `?email=in.(${list.map(encodeURIComponent).join(",")})`;
  const r = await fetch(url, { headers: supabaseServiceHeaders_() });
  return r.ok ? await r.json() : [];
}

function deleteSub_(endpoint) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions` +
    `?endpoint=eq.${encodeURIComponent(endpoint)}`;
  return fetch(url, { method: "DELETE", headers: supabaseServiceHeaders_() }).catch(() => {});
}

/**
 * Envía una notificación push a todos los dispositivos de los emails dados.
 * @param {string[]} emails
 * @param {{ title: string, body?: string, tag?: string, data?: object }} payload
 * @returns {Promise<{ sent: number, failed: number }>} conteo (para logs)
 */
export async function sendPushToEmails_(emails, payload) {
  const out = { sent: 0, failed: 0 };
  try {
    if (!pushEnabled_()) return out;
    const subs = await getSubsForEmails_(emails);
    if (!subs.length) return out;

    const body = JSON.stringify({
      title: payload.title || "GLP",
      body:  payload.body  || "",
      tag:   payload.tag   || "glp",
      // patrón de vibración custom (el SW usa su default si no viene)
      ...(Array.isArray(payload.vibrate) && payload.vibrate.length ? { vibrate: payload.vibrate } : {}),
      data:  payload.data  || {},
    });

    await Promise.allSettled(subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      ).then(() => { out.sent++; })
       .catch(err => {
         out.failed++;
         if (err.statusCode === 410 || err.statusCode === 404) deleteSub_(s.endpoint);
         else console.warn("[PUSH] send error:", err.statusCode, err.message);
       })
    ));
  } catch (e) {
    console.warn("[PUSH] sendPushToEmails_:", e.message);
  }
  return out;
}

/**
 * Emails de todos los usuarios activos con un rol dado
 * (ej. "RAMALERO" → avisar a los ramaleros de una solicitud nueva).
 */
export async function getEmailsByRol_(rol) {
  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/usuarios?rol=eq.${encodeURIComponent(rol)}&activo=eq.true&select=email`,
      { headers: supabaseServiceHeaders_() },
    );
    const rows = r.ok ? await r.json() : [];
    return [...new Set(rows.map(u => u.email).filter(Boolean))];
  } catch (e) {
    console.warn("[PUSH] getEmailsByRol_:", e.message);
    return [];
  }
}

/**
 * Emails de los técnicos con asignación activa sobre un VIN
 * (para avisarles de incidencias de calidad sobre su carro).
 */
export async function getTecnicoEmailsByVin_(vin) {
  try {
    const v = String(vin || "").trim().toUpperCase();
    if (!v) return [];
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseServiceHeaders_();

    const woR = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${encodeURIComponent(v)}&select=id`,
      { headers },
    );
    const wos = woR.ok ? await woR.json() : [];
    if (!wos.length) return [];

    const ids = wos.map(w => w.id).join(",");
    const asgR = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=in.(${encodeURIComponent(ids)})` +
      `&activo=eq.true&select=usuarios(email)`,
      { headers },
    );
    const asgs = asgR.ok ? await asgR.json() : [];
    return [...new Set(asgs.map(a => a.usuarios?.email).filter(Boolean))];
  } catch (e) {
    console.warn("[PUSH] getTecnicoEmailsByVin_:", e.message);
    return [];
  }
}
