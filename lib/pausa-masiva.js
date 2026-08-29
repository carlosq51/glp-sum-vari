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
import { getConfig_, invalidateConfigCache_ } from "./config.js";
import { emitEvent_ } from "./events.js";
import { partesPeru_ } from "./despacho.js";

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

// Los horarios de app_config ("12:50") son hora Perú, y la comparación tiene que
// hacerse contra la hora Perú de ahora — no contra la del reloj del proceso, que
// es lo que hacía el getHours() de antes. En un servidor en UTC eso disparaba el
// almuerzo a las 12:50 UTC = 07:50 en el taller: pausaba a todo el mundo a media
// mañana y a las 12:50 de verdad no pasaba nada. Se reusa partesPeru_ para no
// tener otro formateador de zona horaria más en el repo. Si el proceso corriera
// en otra zona, Admin → Configuración lo enseña (GET /api/admin/pausa-horario).
function minutosDelDia_(d = new Date()) {
  const { hora, min } = partesPeru_(d);
  return hora * 60 + min;
}

function diaKey_(d = new Date()) {
  const { anio, mes, dia } = partesPeru_(d);
  return `${anio}-${mes}-${dia}`;
}

/** "HH:MM" a partir de minutos desde medianoche. */
function comoHhmm_(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Qué se disparó ya hoy: "2026-8-14|COMIDA_INI". Se limpia al cambiar de día. */
const disparado_ = new Set();

// La marca de "ya se disparó hoy" también se escribe en app_config, con la clave
// PAUSA_AUTO_ULTIMO_<EVENTO>. En memoria no basta por dos motivos: un reinicio
// del servidor borra el Set —y con la recuperación de abajo eso significaría
// volver a pausar el taller entero a media tarde—, y si algún día corren dos
// instancias, cada una creería que le toca disparar. De paso es el único rastro
// legible de si el disparo ocurrió: Admin lo muestra tal cual.
const CLAVE_ULTIMO = ev => `PAUSA_AUTO_ULTIMO_${ev}`;

// Cuánto tiempo después de su hora un evento todavía se puede disparar.
//
// Antes eran 5 minutos para los dos, y esa ventana es demasiado estrecha para
// algo que corre una vez al día: bastaba un redeploy, una siesta del proceso o
// un minuto de red caída a las 12:50 para que el almuerzo NO se pausara y el
// taller acumulara la hora de comida como trabajada, en silencio hasta el
// reporte del día siguiente.
//
// Ahora la comida se recupera durante toda su ventana (si el servidor arranca a
// las 13:20 y la comida va de 12:50 a 14:00, pausa igual: los técnicos están
// almorzando), y la reanudación tiene media hora. La marca persistida es lo que
// impide que esa recuperación se convierta en un segundo disparo.
const GRACIA_FIN_MIN = 30;
const CHECK_MS       = 60_000;

/** Los dos eventos del día, ya resueltos contra la config vigente. */
export function eventosHorario_(cfg) {
  const ini = hhmm_(cfg.HORARIO_COMIDA_INICIO);
  const fin = hhmm_(cfg.HORARIO_COMIDA_FIN);
  return [
    {
      clave: "COMIDA_INI",
      etiqueta: "Pausa de comida",
      min:   ini,
      // Recuperable hasta el fin de la comida: mientras dure el almuerzo, pausar
      // sigue siendo lo correcto. Si el fin no se entiende, 30 min como el otro.
      hasta: ini == null ? null : (fin != null && fin > ini ? fin : ini + GRACIA_FIN_MIN),
      log:   "almuerzo: taller pausado",
      run:   () => aplicarPausaMasiva_({ accion: "PAUSA", nota: NOTA_AUTO_COMIDA }),
    },
    {
      clave: "COMIDA_FIN",
      etiqueta: "Reanudación tras la comida",
      min:   fin,
      hasta: fin == null ? null : fin + GRACIA_FIN_MIN,
      log:   "fin de almuerzo: taller reanudado",
      // Solo lo que pausó el almuerzo. Lo que pausó el supervisor sigue pausado.
      run:   () => aplicarPausaMasiva_({
        accion: "REANUDAR", nota: NOTA_AUTO_REANUDAR, soloNotas: [NOTA_AUTO_COMIDA],
      }),
    },
    // Solo la comida, por decisión de operaciones (2026-08-14, reafirmada el
    // 2026-08-25). El fin de jornada (HORARIO_DESCANSO_INICIO) NO pausa a nadie:
    // lo que cierra el día es la marca de SALIDA de cada técnico, que ya pausa
    // sus carros uno por uno (routes/despacho.js · pausarTrabajoDe_). Un corte a
    // las 16:20 para todos se llevaría por delante a quien se queda terminando
    // un carro. Ese horario solo sirve para no auto-reanudar dentro de su
    // ventana; si alguna vez se quiere que pause, es un evento más en esta lista.
  ];
}

/**
 * ¿Le toca dispararse a este evento ahora mismo?
 *
 * Pura y exportada porque es la regla que se rompió: con la ventana de 5 min de
 * antes, un reinicio del servidor a las 12:56 se comía el almuerzo entero sin
 * dejar rastro. Aquí se puede probar en frío que a las 13:20 todavía pausa y
 * que con la marca del día puesta ya no.
 *
 * @param {{min:number|null, hasta:number|null}} ev
 * @param {number} ahora  minutos del día (hora Perú)
 * @param {string} ultimo valor de PAUSA_AUTO_ULTIMO_<EVENTO> en app_config
 * @param {string} hoy    día Perú, formato de diaKey_()
 */
export function tocaDisparar_(ev, ahora, ultimo, hoy) {
  if (ev?.min == null || ev?.hasta == null) return false;
  if (ahora < ev.min || ahora >= ev.hasta) return false;
  // La marca persistida gana sobre la memoria: sobrevive a los reinicios.
  return !String(ultimo || "").startsWith(`${hoy} `);
}

/** Deja constancia en app_config de que el evento ya corrió hoy. */
async function marcarDisparado_(clave, texto) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
    method: "POST",
    headers: { ...supabaseHeaders_(), "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: CLAVE_ULTIMO(clave), value: texto }),
  });
  invalidateConfigCache_(); // el próximo tick tiene que ver la marca recién puesta
}

async function tickHorarios_() {
  const cfg = await getConfig_();
  // Interruptor de emergencia sin redeploy: PAUSA_AUTO_HORARIO=0 en app_config.
  if (String(cfg.PAUSA_AUTO_HORARIO ?? "1") !== "1") return;

  const hoy   = diaKey_();
  const ahora = minutosDelDia_();

  // El Set solo guarda lo de hoy; si no, crece para siempre en un proceso largo.
  for (const k of disparado_) if (!k.startsWith(`${hoy}|`)) disparado_.delete(k);

  for (const ev of eventosHorario_(cfg)) {
    if (!tocaDisparar_(ev, ahora, cfg[CLAVE_ULTIMO(ev.clave)], hoy)) continue;

    const k = `${hoy}|${ev.clave}`;
    if (disparado_.has(k)) continue;
    disparado_.add(k);
    try {
      const r = await ev.run();
      console.log(`[PAUSA-HORARIO] ${ev.log} · ${r.afectadas} OT(s)`
        + (r.errores.length ? ` · ${r.errores.length} con error` : ""));
      await marcarDisparado_(ev.clave, `${hoy} ${comoHhmm_(ahora)} · ${r.afectadas} OT`);
      if (r.afectadas) emitEvent_("asignaciones", { accion: `PAUSA_HORARIO_${ev.clave}`, afectadas: r.afectadas });
    } catch (e) {
      // Se saca de los disparados para que el próximo tick, si aún está dentro
      // de la ventana, lo reintente: una caída de red no debe costar el almuerzo.
      disparado_.delete(k);
      console.warn(`[PAUSA-HORARIO] ${ev.clave} falló:`, e.message);
    }
  }
}

/**
 * Radiografía del disparo horario, para el panel de Admin.
 *
 * Lo que responde de verdad es "¿el reloj del servidor es el del taller?".
 * Todo este módulo compara horas Perú contra horas Perú, pero si el proceso
 * corre en otra zona y alguien vuelve a leer getHours() en algún sitio, el
 * desfase aparece aquí antes que en el reporte de fin de mes.
 */
export async function estadoHorarios_() {
  const cfg   = await getConfig_();
  const ahora = new Date();
  const peru  = minutosDelDia_(ahora);
  const local = ahora.getHours() * 60 + ahora.getMinutes();
  // Normalizado a ±12 h: sin esto, un servidor en UTC da "+1140 min" en vez de -300.
  const desfase = ((local - peru + 720 + 1440) % 1440) - 720;

  return {
    activo:  String(cfg.PAUSA_AUTO_HORARIO ?? "1") === "1",
    hoy:     diaKey_(),
    ahoraPeru:     comoHhmm_(peru),
    ahoraServidor: comoHhmm_(local),
    desfaseMin:    desfase,
    tzServidor: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    eventos: eventosHorario_(cfg).map(ev => ({
      clave: ev.clave,
      etiqueta: ev.etiqueta,
      hora: ev.min == null ? null : comoHhmm_(ev.min),
      recuperableHasta: ev.hasta == null ? null : comoHhmm_(ev.hasta),
      ultimo: String(cfg[CLAVE_ULTIMO(ev.clave)] || ""),
    })),
  };
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
