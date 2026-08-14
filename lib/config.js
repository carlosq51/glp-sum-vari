// =========================
// lib/config.js
// FUENTE ÚNICA de configuración operativa del sistema.
//
// Regla: NINGÚN número operativo (intervalo, meta, límite, TTL) vive
// hardcodeado en rutas o vistas. Todos nacen aquí como default documentado
// y pueden sobreescribirse desde la tabla app_config (editable por Admin
// sin redeploy). El frontend los recibe vía GET /api/config.
// =========================

import { supabaseHeaders_ } from "./supabase.js";

// ─── Defaults documentados ────────────────────────────────────────────────────
// Cada clave existe en UN solo lugar. app_config puede sobreescribir cualquiera.
export const CONFIG_DEFAULTS = {
  // ── Metas de producción (editables en Admin) ──
  META_DIARIA:   25,   // carros convertidos objetivo por día (grupal)
  META_CALIDAD:  22,   // inspecciones de calidad objetivo por día
  META_MENSUAL:  60,   // objetivo mensual por técnico
  META_CARROS_TEC: 2,  // carros COMPLETOS por técnico/día antes de emparejarse en dupla

  // ── Horarios de pausa programada (editables en Admin) ──
  HORARIO_COMIDA_INICIO:   "13:00",
  HORARIO_COMIDA_FIN:      "14:00",
  HORARIO_DESCANSO_INICIO: "16:30",
  HORARIO_DESCANSO_FIN:    "07:00",

  // ── Tiempos objetivo por tipo de trabajo (minutos, editables en Admin) ──
  TARGET_CONVERSION_MIN: 180,  // conversión (motor/tanque): 3 h
  TARGET_CALIDAD_MIN:     50,  // inspección de calidad
  TARGET_RAMAL_MIN:       40,  // armado de ramal

  // ── Polling del frontend (ms) — heartbeat de respaldo cuando no hay SSE ──
  POLL_RAMAL_LISTO_MS:     15_000,   // técnico: ¿mi ramal está listo?
  POLL_COLA_POSICION_MS:   15_000,   // técnico: posición en cola de ramal
  POLL_PAIR_SUGGEST_MS:    90_000,   // técnico: sugerencia ML de pareja
  POLL_COLA_BADGE_MS:     180_000,   // técnico: badge contador de cola
  POLL_VIN_READY_MS:      120_000,   // técnico: notificación de VIN disponible
  POLL_MOVILIZADOR_MS:     30_000,   // movilizador: refresh general
  POLL_OT_RECHECK_MS:     480_000,   // movilizador: re-validar VINs sin OT
  POLL_SUP_LIVE_MS:       300_000,   // supervisor: vista live
  POLL_SUP_UBICACIONES_MS: 300_000,  // supervisor: ubicaciones
  POLL_ZONAS_MAPA_MS:      60_000,   // mapa de zonas: auto-refresh
  POLL_RAMALERO_SOL_MS:    60_000,   // ramalero: cola de solicitudes (respaldo del SSE)

  // ── Despacho dirigido (módulo nuevo — inerte mientras DESPACHO_MODO=OFF) ──
  DESPACHO_MODO:             "OFF",    // OFF | SOMBRA | REAL
  DESPACHO_JORNADA_INICIO:   "06:00",  // corte de jornada (debe calzar con lib/despacho.js)
  DESPACHO_TURNO_INICIO:     "07:00",  // desde aquí se reparte trabajo
  // Puede ser MENOR que el inicio: el turno cruza medianoche (07:00 → 01:00).
  // Toda comparación contra esta ventana va por enTurno_/duracionTurno_.
  DESPACHO_TURNO_FIN:        "01:00",  // fin del turno productivo (base del ritmo)
  DESPACHO_JORNADA_FIN:      "05:00",
  DESPACHO_VARADO_MIN:       240,      // minutos en zona sin terminar → alerta
  DESPACHO_INICIO_MAX_MIN:   20,       // asignado sin arrancar → vuelve a la cola
  DESPACHO_QR_VENTANA_SEG:   300,      // vida de cada token del QR rotativo (5 min)
  DESPACHO_TTL_PROPUESTA_MIN: 10,      // espera de confirmación antes de EXPIRAR
  DESPACHO_INTERVALO_SEG:    60,       // cada cuánto corre el motor
  DESPACHO_ESPERA_TOPE_MIN:  30,       // espera con la que la prioridad ya es máxima
  // Importancia relativa de cada criterio del reparto. NO tienen que sumar 100:
  // el motor los normaliza, así que valen como proporción entre ellos.
  DESPACHO_PESO_ESPERA:         30,
  DESPACHO_PESO_COMPATIBILIDAD: 30,
  DESPACHO_PESO_FAMILIARIDAD:   25,
  DESPACHO_PESO_CERCANIA:       15,

  // ── Servidor ──
  SRV_POLL_CACHE_TTL_MS:  10_000,    // micro-cache de endpoints de polling (ramal)

  // ── Límites de consulta ──
  LIM_ENTREGADOS_RECIENTES: 200,     // solicitudes ENTREGADO a listar
  LIM_ASG_RECIENTES:        2000,    // asignaciones recientes (rol_trabajo)
  LIM_STATS_SEMANA:         5000,    // asignaciones para stats semanales
};

// ─── Cache del merge defaults+app_config ─────────────────────────────────────
let _merged = null;
let _mergedTs = 0;
const MERGE_TTL_MS = 60_000; // re-lee app_config máx. 1 vez por minuto

/** Convierte el value (texto en app_config) al tipo del default */
function coerce_(key, value) {
  const def = CONFIG_DEFAULTS[key];
  if (typeof def === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : def;
  }
  return value;
}

/**
 * getConfig_ — defaults + overrides de app_config (cacheado 60s).
 * Nunca lanza: si Supabase falla devuelve los defaults.
 */
export async function getConfig_() {
  const now = Date.now();
  if (_merged && (now - _mergedTs) < MERGE_TTL_MS) return _merged;
  const out = { ...CONFIG_DEFAULTS };
  try {
    const resp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/app_config?select=key,value`,
      { method: "GET", headers: supabaseHeaders_() },
    );
    if (resp.ok) {
      for (const r of await resp.json()) {
        if (r.key) out[r.key] = coerce_(r.key, r.value);
      }
    }
  } catch { /* sin Supabase → defaults */ }
  _merged = out;
  _mergedTs = now;
  return out;
}

/** Invalidar tras un POST /api/admin/config para que el cambio aplique ya */
export function invalidateConfigCache_() {
  _merged = null;
  _mergedTs = 0;
}
