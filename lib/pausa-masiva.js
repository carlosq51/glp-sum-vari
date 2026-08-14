// =========================
// lib/pausa-masiva.js
// Parar y reanudar el taller entero, y hacerlo SOLO en el servidor.
//
// Antes esto vivía repartido en dos sitios que no se hablaban:
//
//   · el botón de Admin → Configuración (pausa manual), y
//   · un array hardcodeado en el navegador del técnico
//     (SCHEDULED_PAUSES = [[13,0],[16,40]]) que disparaba desde tickClocksUI_.
//
// Lo segundo fallaba justo cuando importaba: el tick corre en el celular del
// técnico, así que si a las 13:00 tenía la pantalla bloqueada, la app cerrada o
// sin señal, su OT NO se pausaba y seguía acumulando la hora de almuerzo como
// tiempo trabajado. Además ignoraba HORARIO_COMIDA_INICIO: cambiar el horario
// desde Admin no cambiaba nada, porque las horas estaban escritas en el código.
//
// Aquí el disparo es del servidor, corre haya o no alguien con la app abierta,
// y lee los horarios de app_config como cualquier otro valor operativo.
//
// Alcance: SOLO la hora de comida. El fin de jornada no se pausa en masa —
// eso lo hace la marca de SALIDA de cada técnico, carro por carro.
// =========================

import { supabaseHeaders_ } from "./supabase.js";
import { getConfig_ } from "./config.js";
import { emitEvent_ } from "./events.js";

// Notas internas que marcan quién puso la pausa. No son decorativas: el tick
// del técnico las lee para no ofrecer countdown, y la reanudación de almuerzo
// las usa para tocar SOLO lo que ella misma pausó.
export const NOTA_AUTO_COMIDA    = "__AUTO_PAUSA_COMIDA";
export const NOTA_AUTO_REANUDAR  = "__AUTO_REANUDAR_COMIDA";

/**
 * Pausa o reanuda TODAS las asignaciones activas en el estado de origen.
 *
 * @param {object}   opts
 * @param {"PAUSA"|"REANUDAR"} opts.accion
 * @param {string}  [opts.nota]       last_nota que queda escrita en cada fila.
 * @param {string[]}[opts.soloNotas]  Si viene, solo toca las filas cuya
 *   last_nota esté en la lista. Es lo que hace segura la reanudación de las
 *   14:00: sin este filtro, "reanudar todo" también levantaría las OTs que el
 *   supervisor pausó a propósito y las que el técnico pausó por su cuenta.
 * @returns {Promise<{afectadas:number, errores:string[]}>}
 */
export async function aplicarPausaMasiva_({ accion, nota, soloNotas = null }) {
  if (!["PAUSA", "REANUDAR"].includes(accion)) {
    throw new Error("accion debe ser PAUSA o REANUDAR");
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");

  const now          = new Date().toISOString();
  const estadoBuscar = accion === "PAUSA" ? "TRABAJANDO" : "PAUSADO";
  const estadoNuevo  = accion === "PAUSA" ? "PAUSADO"    : "TRABAJANDO";
  const notaFinal    = nota || (accion === "PAUSA" ? "__ADMIN_PAUSA_MASIVA" : "__ADMIN_REANUDAR_MASIVA");

  let url = `${SUPABASE_URL}/rest/v1/asignaciones?activo=eq.true&estado_actual=eq.${estadoBuscar}`
          + `&select=id,running_since,tiempo_trab_ms`;
  if (soloNotas?.length) {
    url += `&last_nota=in.(${soloNotas.map(encodeURIComponent).join(",")})`;
  }

  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) throw new Error(`Supabase GET asignaciones: ${resp.status}`);
  const asignaciones = await resp.json();
  if (!asignaciones.length) return { afectadas: 0, errores: [] };

  let afectadas = 0;
  const errores = [];

  for (const asg of asignaciones) {
    try {
      const updateData = { estado_actual: estadoNuevo, updated_at: now, last_nota: notaFinal };
      if (accion === "PAUSA") {
        // Acumular el tiempo que llevaba corriendo antes de detener el reloj.
        const extraMs = asg.running_since
          ? Math.max(0, Date.now() - new Date(asg.running_since).getTime())
          : 0;
        updateData.tiempo_trab_ms = (asg.tiempo_trab_ms || 0) + extraMs;
        updateData.running_since  = null;
      } else {
        updateData.running_since = now;
      }
      const pr = await fetch(`${SUPABASE_URL}/rest/v1/asignaciones?id=eq.${asg.id}`, {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify(updateData),
      });
      if (pr.ok) afectadas++; else errores.push(asg.id);
    } catch {
      errores.push(asg.id);
    }
  }

  return { afectadas, errores };
}

// ─── Disparo por horario ─────────────────────────────────────────────────────

/** "HH:MM" → minutos desde medianoche, o null si no se entiende. */
function hhmm_(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutosDelDia_(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

function diaKey_(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Qué se disparó ya hoy: "2026-8-14|COMIDA_INI". Se limpia al cambiar de día. */
const disparado_ = new Set();

// Ventana en la que un evento todavía se considera "de ahora". El chequeo corre
// cada minuto, pero si el servidor se reinicia o el tick se atrasa, un disparo
// exacto al minuto se perdería del todo. Con la gracia, un arranque a las 13:03
// aún pausa el almuerzo; y si ya estaba pausado, el resultado es 0 afectadas.
const GRACIA_MIN = 5;
const CHECK_MS   = 60_000;

async function tickHorarios_() {
  const cfg = await getConfig_();
  // Interruptor de emergencia sin redeploy: PAUSA_AUTO_HORARIO=0 en app_config.
  if (String(cfg.PAUSA_AUTO_HORARIO ?? "1") !== "1") return;

  const hoy   = diaKey_();
  const ahora = minutosDelDia_();

  // El Set solo guarda lo de hoy; si no, crece para siempre en un proceso largo.
  for (const k of disparado_) if (!k.startsWith(`${hoy}|`)) disparado_.delete(k);

  const eventos = [
    {
      clave: "COMIDA_INI",
      min:   hhmm_(cfg.HORARIO_COMIDA_INICIO),
      log:   "almuerzo: taller pausado",
      run:   () => aplicarPausaMasiva_({ accion: "PAUSA", nota: NOTA_AUTO_COMIDA }),
    },
    {
      clave: "COMIDA_FIN",
      min:   hhmm_(cfg.HORARIO_COMIDA_FIN),
      log:   "fin de almuerzo: taller reanudado",
      // Solo lo que pausó el almuerzo. Lo que pausó el supervisor sigue pausado.
      run:   () => aplicarPausaMasiva_({
        accion: "REANUDAR", nota: NOTA_AUTO_REANUDAR, soloNotas: [NOTA_AUTO_COMIDA],
      }),
    },
    // Solo la comida, por decisión de operaciones (2026-08-14). El fin de
    // jornada (HORARIO_DESCANSO_INICIO) NO pausa a nadie: lo que cierra el día
    // es la marca de SALIDA de cada técnico, que ya pausa sus carros uno por
    // uno (routes/despacho.js · pausarTrabajoDe_). Un corte a las 16:30 para
    // todos se llevaría por delante a quien se queda terminando un carro.
  ];

  for (const ev of eventos) {
    if (ev.min == null) continue;
    if (ahora < ev.min || ahora >= ev.min + GRACIA_MIN) continue;
    const k = `${hoy}|${ev.clave}`;
    if (disparado_.has(k)) continue;
    disparado_.add(k);
    try {
      const r = await aplicarConLog_(ev);
      if (r.afectadas) emitEvent_("asignaciones", { accion: `PAUSA_HORARIO_${ev.clave}`, afectadas: r.afectadas });
    } catch (e) {
      // Se saca de los disparados para que el próximo tick, si aún está dentro
      // de la gracia, lo reintente: una caída de red no debe costar el almuerzo.
      disparado_.delete(k);
      console.warn(`[PAUSA-HORARIO] ${ev.clave} falló:`, e.message);
    }
  }
}

async function aplicarConLog_(ev) {
  const r = await ev.run();
  console.log(`[PAUSA-HORARIO] ${ev.log} · ${r.afectadas} OT(s)`
    + (r.errores.length ? ` · ${r.errores.length} con error` : ""));
  return r;
}

/**
 * Arranca el chequeo horario. Se llama una vez al levantar el servidor.
 * Es un setInterval por minuto: no hay cron externo en este despliegue, y el
 * costo es una lectura de config cacheada 60s.
 */
export function scheduleHorariosPausa_() {
  setInterval(() => {
    tickHorarios_().catch(e => console.warn("[PAUSA-HORARIO] tick:", e.message));
  }, CHECK_MS).unref?.();
}
