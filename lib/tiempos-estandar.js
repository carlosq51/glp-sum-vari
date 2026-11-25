// =========================
// lib/tiempos-estandar.js
// El tiempo normal de cada trabajo y de cada técnico, UNA vez y para todos.
//
// Antes cada pantalla medía el suyo: el LIVE la media de 30 días con un tope de
// 8 h, el mapa la mediana de 45 días por modelo, el ML otra media. Ninguno
// descontaba las noches que el cronómetro corrió porque alguien no marcó la
// salida: solo tiraban lo que pasaba de un tope. Aquí se corrige cada mitad con
// la presencia real (lib/tiempo-real.js) y de ESE tiempo salen los normales que
// usan el LIVE, el mapa y el celular del técnico.
//
// Se calcula una vez por jornada (la historia de días cerrados no cambia
// durante el día) y se guarda en memoria.
// =========================

import { supabaseServiceHeaders_, supabaseFetchAll_ } from "./supabase.js";
import { getConfig_ } from "./config.js";
import {
  presenciaDelUsuario_, tiempoCorregido_, estandaresDe_, estandaresParaRed_,
  hhmm_, jornadaDeMs_,
} from "./tiempo-real.js";

const LIM = { pageSize: 1000, maxRows: 40000 };
const DIA_MS = 86_400_000;

let _cache = { jornada: null, valor: null, promesa: null };

/** Lo que el reloj del taller necesita de la configuración. */
export function relojDesdeConfig_(cfg = {}) {
  return {
    inicioTurnoMin: hhmm_(cfg.PROYECCION_INICIO_TURNO) ?? 420,
    finTurnoMin:    hhmm_(cfg.PROYECCION_FIN_TURNO) ?? 990,
    comida: {
      iniMin: hhmm_(cfg.HORARIO_COMIDA_INICIO) ?? 770,
      finMin: hhmm_(cfg.HORARIO_COMIDA_FIN) ?? 840,
    },
  };
}

/**
 * Lee la historia y la deja corregida. Exportada para el script de diagnóstico
 * y las pruebas de integración; las pantallas usan tiemposEstandar_().
 */
export async function leerHistoriaCorregida_({ dias = 60, ahoraMs = Date.now(), cfg = null } = {}) {
  const URL_ = process.env.SUPABASE_URL;
  const headers = supabaseServiceHeaders_();
  if (!URL_ || !headers) throw new Error("Supabase no configurado");
  cfg = cfg || await getConfig_();
  const reloj = relojDesdeConfig_(cfg);

  const desde = new Date(ahoraMs - dias * DIA_MS).toISOString();
  // Los eventos y marcas empiezan antes: una mitad cerrada el primer día de la
  // ventana pudo empezarse días atrás, y su presencia de esos días cuenta.
  const desdeAmplio = new Date(ahoraMs - (dias + 10) * DIA_MS).toISOString();
  const enc = encodeURIComponent;

  const [asg, ev, mar, extra] = await Promise.all([
    supabaseFetchAll_(
      `${URL_}/rest/v1/asignaciones?select=id,user_id,work_order_id,rol_trabajo,tiempo_trab_ms,updated_at,` +
      `work_orders(vins(modelo_normalizado))` +
      `&tipo_ot=eq.CONVERSION&activo=eq.true&estado_actual=eq.FINALIZADO&rol_trabajo=in.(MOTOR,TANQUE)` +
      `&updated_at=gte.${enc(desde)}&order=id.asc`, headers, LIM),
    supabaseFetchAll_(
      `${URL_}/rest/v1/eventos?select=user_id,work_order_id,rol_trabajo,accion,timestamp` +
      `&timestamp=gte.${enc(desdeAmplio)}&order=timestamp.asc`, headers, { pageSize: 1000, maxRows: 80000 }),
    supabaseFetchAll_(
      `${URL_}/rest/v1/asistencia_marcas?select=user_id,tipo,ts,jornada_fecha` +
      `&ts=gte.${enc(desdeAmplio)}&order=ts.asc`, headers, LIM),
    supabaseFetchAll_(
      `${URL_}/rest/v1/produccion_horas_extra?select=jornada_fecha,user_id,hasta` +
      `&jornada_fecha=gte.${desdeAmplio.slice(0, 10)}`, headers, LIM),
  ]);
  if (!asg.ok) throw new Error(`asignaciones: ${asg.status} ${asg.error}`);

  // Actividad por persona (todo lo que hizo en la app) y ventana de cada mitad.
  const actividad = new Map();
  const ventana = new Map();   // work_order_id|rol → { t0, t1, duenos:Set }
  for (const e of ev.rows || []) {
    const t = new Date(e.timestamp).getTime();
    if (!Number.isFinite(t)) continue;
    if (e.user_id) {
      if (!actividad.has(e.user_id)) actividad.set(e.user_id, []);
      actividad.get(e.user_id).push(t);
    }
    const rol = String(e.rol_trabajo || "").toUpperCase();
    if (!e.work_order_id || !rol) continue;
    const k = `${e.work_order_id}|${rol}`;
    if (!ventana.has(k)) ventana.set(k, { t0: null, t1: null, duenos: new Set() });
    const v = ventana.get(k);
    if (e.user_id) v.duenos.add(e.user_id);
    if (e.accion === "INICIO" && (v.t0 == null || t < v.t0)) v.t0 = t;
    if (e.accion === "FIN" && (v.t1 == null || t > v.t1)) v.t1 = t;
  }

  const marcasPor = new Map();
  for (const m of mar.rows || []) {
    if (!marcasPor.has(m.user_id)) marcasPor.set(m.user_id, []);
    marcasPor.get(m.user_id).push(m);
  }
  const extraPor = new Map();
  for (const x of extra.rows || []) {
    if (!extraPor.has(x.user_id)) extraPor.set(x.user_id, {});
    extraPor.get(x.user_id)[x.jornada_fecha] = x.hasta;
  }

  const presCache = new Map();
  const presencia_ = (uid) => {
    if (!presCache.has(uid)) {
      presCache.set(uid, presenciaDelUsuario_({
        marcas: marcasPor.get(uid) || [],
        actividadMs: actividad.get(uid) || [],
        ahoraMs,
        inicioTurnoMin: reloj.inicioTurnoMin,
        finTurnoMin: reloj.finTurnoMin,
        extraHasta: extraPor.get(uid) || {},
      }));
    }
    return presCache.get(uid);
  };

  const filas = [];
  for (const a of asg.rows) {
    const rol = String(a.rol_trabajo || "").toUpperCase();
    const v = ventana.get(`${a.work_order_id}|${rol}`);
    const wo = Array.isArray(a.work_orders) ? a.work_orders[0] : a.work_orders;
    const vin = Array.isArray(wo?.vins) ? wo.vins[0] : wo?.vins;
    const t1 = v?.t1 ?? new Date(a.updated_at).getTime();
    // Quien la cerró y quien la tuvo antes (reasignaciones): la presencia de
    // cualquiera de ellos es tiempo en que la mitad pudo avanzar.
    const duenos = new Set([a.user_id, ...(v?.duenos || [])].filter(Boolean));
    const presencia = [...duenos].flatMap(presencia_);
    const c = tiempoCorregido_({
      rawMs: a.tiempo_trab_ms, desdeMs: v?.t0 ?? null, hastaMs: t1, presencia, comida: reloj.comida,
    });
    filas.push({
      id: a.id, userId: a.user_id, rol, modelo: vin?.modelo_normalizado || "",
      rawMs: Number(a.tiempo_trab_ms) || 0, ms: c.ms, descontadoMs: c.descontadoMs,
      jornada: jornadaDeMs_(t1),
    });
  }
  return { filas, reloj, truncado: !!(asg.truncated || ev.truncated || mar.truncated) };
}

/** Lo que reciben las pantallas. */
export function resumirEstandares_(filas, { dias }) {
  // < 10 min no es una mitad, es un cierre de prueba o un error de botón.
  const validas = filas.filter(f => f.ms >= 10 * 60_000);
  const est = estandaresParaRed_(estandaresDe_(validas));
  const recortadas = filas.filter(f => f.descontadoMs >= 15 * 60_000);
  return {
    ...est,
    dias,
    generado: new Date().toISOString(),
    correccion: {
      mitades: filas.length,
      recortadas: recortadas.length,
      horasDescontadas: Math.round(recortadas.reduce((s, f) => s + f.descontadoMs, 0) / 3_600_000),
    },
  };
}

/**
 * Lo que haya ya calculado, sin esperar. Si el de hoy no está, lo pide por
 * detrás: leer 60 días tarda ~15 s y el LIVE no puede quedarse colgado por eso.
 * Mientras tanto vale el de ayer (o nada, recién arrancado el servidor).
 */
export function tiemposEstandarSiListo_() {
  const hoy = jornadaDeMs_(Date.now());
  if (_cache.jornada !== hoy && !_cache.promesa) tiemposEstandar_().catch(() => {});
  return _cache.valor;
}

/**
 * tiemposEstandar_ — los normales de hoy (cacheados por jornada).
 * Nunca lanza: sin datos devuelve null y cada pantalla se pinta sin el listón.
 */
export async function tiemposEstandar_({ forzar = false } = {}) {
  const hoy = jornadaDeMs_(Date.now());
  if (!forzar && _cache.jornada === hoy && _cache.valor) return _cache.valor;
  if (!forzar && _cache.promesa) return _cache.promesa;

  _cache.promesa = (async () => {
    try {
      const cfg = await getConfig_();
      const dias = Math.max(14, Number(cfg.TIEMPOS_HIST_DIAS) || 60);
      const { filas } = await leerHistoriaCorregida_({ dias, cfg });
      if (!filas.length) return _cache.valor;
      const valor = resumirEstandares_(filas, { dias });
      _cache = { jornada: hoy, valor, promesa: null };
      const c = valor.correccion;
      console.log(`[tiempos] estándar recalculado: ${c.mitades} mitades, ${c.recortadas} corregidas (−${c.horasDescontadas} h)`);
      return valor;
    } catch (e) {
      console.warn("[tiempos] no se pudo calcular el estándar:", e.message);
      return _cache.valor;
    } finally {
      _cache.promesa = null;
    }
  })();
  return _cache.promesa;
}
