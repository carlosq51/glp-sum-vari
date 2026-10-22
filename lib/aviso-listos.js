// =========================
// lib/aviso-listos.js
// Push "carro listo para salida": cuando una conversión termina (MOTOR y
// TANQUE cerrados) y el carro está en el mapa de zonas, avisa a quien lo
// tiene que mover.
//
// Es el mismo número que el chip verde del mapa del movilizador ("N listos
// para salida"), pero sin tener que estar mirando la pantalla. A quién se
// avisa sale de AVISO_LISTOS_EMAILS (lib/config.js).
//
// Nunca lanza: lo llama /api/evento después de responder al técnico.
// =========================

import { supabaseServiceHeaders_ } from "./supabase.js";
import { sendPushToEmails_ } from "./push.js";
import { getConfig_ } from "./config.js";

async function get_(path) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseServiceHeaders_() });
  return r.ok ? r.json() : [];
}

/**
 * contarListos_ — carros en las 15 zonas cuya conversión más nueva está
 * FINALIZADO. La zona libre va aparte, como en el mapa (renderMapa_).
 */
async function contarListos_(zonaRows) {
  const vins = [...new Set(zonaRows.map(z => z.vin).filter(Boolean))];
  if (!vins.length) return 0;
  const wos = await get_(
    `work_orders?tipo_ot=eq.CONVERSION&vin=in.(${vins.map(encodeURIComponent).join(",")})` +
    `&select=vin,estado_general&order=fecha_creacion.desc&limit=200`
  );
  const ultimo = new Map();
  for (const w of wos) if (!ultimo.has(w.vin)) ultimo.set(w.vin, String(w.estado_general || "").toUpperCase());
  return vins.filter(v => ultimo.get(v) === "FINALIZADO").length;
}

/**
 * avisarCarroListo_ — se llama cuando el FIN de un técnico deja la OT de
 * conversión en FINALIZADO. Un carro que no está en el mapa no se avisa: no
 * hay plaza de la que sacarlo.
 */
export async function avisarCarroListo_(vin) {
  try {
    const { AVISO_LISTOS_EMAILS } = await getConfig_();
    const emails = String(AVISO_LISTOS_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!emails.length || !vin) return;

    const [zonaRows, libre] = await Promise.all([
      get_("conversion_zonas?select=zona_id,vin&vin=not.is.null"),
      get_(`zona_libre?select=vin&vin=eq.${encodeURIComponent(vin)}`),
    ]);
    const zona = zonaRows.find(z => z.vin === vin);
    if (!zona && !libre.length) return;

    const listos = await contarListos_(zonaRows);
    const donde = zona ? `Zona ${zona.zona_id}` : "Zona libre";

    await sendPushToEmails_(emails, {
      title: "🟢 Carro listo para salida",
      body:  `${vin.slice(-6)} · ${donde}\n${listos} listo${listos !== 1 ? "s" : ""} para salida en el mapa`,
      // Mismo tag: la notificación nueva reemplaza a la anterior en vez de
      // apilar una por carro; el número ya dice cuántos van.
      tag:   "listos-salida",
      data:  { url: "/" },
    });
  } catch (e) {
    console.warn("[AVISO_LISTOS]", e.message);
  }
}
