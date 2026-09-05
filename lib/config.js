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
  // El servidor pausa TODAS las OTs al INICIO de comida y las reanuda al FIN
  // (solo lo que él mismo pausó). Ver lib/pausa-masiva.js. El horario de
  // descanso NO pausa: sirve solo para no auto-reanudar dentro de su ventana.
  HORARIO_COMIDA_INICIO:   "13:00",
  HORARIO_COMIDA_FIN:      "14:00",
  HORARIO_DESCANSO_INICIO: "16:30",
  HORARIO_DESCANSO_FIN:    "07:00",
  // Interruptor del disparo automático por horario. "0" lo apaga sin redeploy
  // y deja los horarios sirviendo solo para no auto-reanudar (lo de antes).
  PAUSA_AUTO_HORARIO:      "1",

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
  // Movilizador: 5 min, no 30 s. Su vista es la más cara del sistema (varias
  // consultas grandes por ciclo) y a 30 s se comía sola el egress del plan
  // Supabase — ~770 MB por turno y por pantalla abierta. No pierde reactividad:
  // el SSE dispara pollNow ante cualquier cambio real y la vista tiene botón
  // "↻ Actualizar". Este intervalo es solo el heartbeat de respaldo.
  POLL_MOVILIZADOR_MS:    300_000,   // movilizador: refresh general
  POLL_OT_RECHECK_MS:     480_000,   // movilizador: re-validar VINs sin OT
  POLL_SUP_LIVE_MS:       300_000,   // supervisor: vista live
  POLL_SUP_OT_CONTROL_MS: 180_000,   // supervisor: consola de OTs en vivo
  POLL_ZONAS_MAPA_MS:      60_000,   // mapa de zonas: auto-refresh
  POLL_RAMALERO_SOL_MS:    60_000,   // ramalero: cola de solicitudes (respaldo del SSE)
  // Panel de ramales (lotes, reparto, arqueo). El SSE "ramales" lo refresca
  // al instante; esto es solo el heartbeat por si el stream se cayó.
  POLL_RAMALES_MS:        120_000,

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
  // QR fijo: el código deja de rotar y el mismo papel impreso vale todo el día.
  // Es un permiso temporal para el taller que todavía no tiene la TV montada —
  // sin pantalla, el técnico no tiene dónde ver un código que cambia, y a media
  // tarde intenta marcar su salida con la foto de la mañana y le rebota.
  // Contrapartida: un papel se fotografía y se manda por WhatsApp, así que la
  // marca deja de probar que estuvo en el taller. Volver a "0" al montar la TV.
  DESPACHO_QR_ESTATICO:      "0",      // 1 = QR fijo (sin TV) · 0 = rotativo
  DESPACHO_TTL_PROPUESTA_MIN: 10,      // espera de confirmación antes de EXPIRAR
  DESPACHO_INTERVALO_SEG:    60,       // cada cuánto corre el motor
  DESPACHO_ESPERA_TOPE_MIN:  30,       // espera con la que la prioridad ya es máxima

  // Cuánto puede una dupla PENDIENTE dejar a sus dos técnicos fuera del reparto.
  //
  // Mientras el compañero no acepta, ninguno de los dos recibe carro: si el
  // motor le diera uno al que propuso, la dupla nacería con un miembro ya
  // ocupado y el emparejamiento sería mentira desde el primer minuto.
  //
  // Pero ese bloqueo TIENE que caducar. Una invitación que nadie contesta
  // —el compañero dejó el celular en el casillero— congelaría a dos técnicos
  // la jornada entera, en silencio, que es exactamente la familia de bugs que
  // ya nos costó a LUIS URIBE. Al vencer, la dupla se disuelve sola y los dos
  // vuelven a la cola.
  DESPACHO_TTL_DUPLA_MIN:    10,

  // Dupla automática del carro extra: pasada META_CARROS_TEC, el que queda
  // libre entra al carro del compañero de su rol que ya está en el suyo, en vez
  // de abrir uno propio. La OT y el crédito quedan a nombre del que lo abrió;
  // al cerrarlo la dupla se deshace sola y cada uno sigue por su cuenta. Vale
  // UNA vez por técnico y por jornada. "0" la apaga sin redeploy.
  DESPACHO_DUPLA_AUTO:       "1",

  // Quiénes tienen el botón de "avanzar siguiente carro" SIN estar en dupla.
  // "*" = todos los técnicos · o lista de user_id separados por coma.
  //
  // Es un permiso NOMINAL: nació para Cahuana, que trabaja con ayudantes que no
  // marcan asistencia y por tanto no pueden formar dupla en el sistema pero sí
  // adelantan carros con él. Sin la excepción tenía que elegir entre mentirle
  // al sistema (emparejarse con alguien que no está) o perder la ventaja de
  // tener ayuda. Junior Alvarado se sumó por lo mismo (2026-08-20).
  //
  // Estuvo abierto a todo el taller con "*" durante el desorden (2026-08-17),
  // y se volvió a cerrar al pasar (2026-08-18). Se abre así de nuevo cuando
  // haga falta, y desde app_config toma efecto sin redeploy. Cerrado por
  // defecto a propósito: el reparto lo hace el motor, y un taller entero
  // sirviéndose carros a mano es exactamente lo que el modelo de unidades
  // existe para evitar.
  //
  // La lista se edita en Admin → Configuración → Despacho dirigido, marcando
  // técnicos por nombre (2026-08-25). Hasta entonces había que entrar a
  // Supabase a pegar UUIDs a mano, que es como se sumó a Junior: mal sitio
  // para una decisión que se toma en piso y a media jornada.
  DESPACHO_AVANCE_SOLO:      "",
  // ¿El motor solo reparte carros de la lista diaria?
  //
  // Apagado (por decisión de operaciones, 2026-08-14): un carro estacionado en
  // zona es trabajo real, esté o no en la lista, y la lista se queda corta a
  // media jornada. Con esto en 1 pasaba lo que dejó a PIERO SANCHEZ parado con
  // tres zonas libres delante: las tres estaban fuera de la lista.
  // Ponerlo en "1" vuelve al comportamiento anterior sin tocar código.
  DESPACHO_EXIGE_LISTA_DIARIA: "0",
  // Importancia relativa de cada criterio del reparto. NO tienen que sumar 100:
  // el motor los normaliza, así que valen como proporción entre ellos.
  DESPACHO_PESO_ESPERA:         30,
  DESPACHO_PESO_COMPATIBILIDAD: 30,
  DESPACHO_PESO_FAMILIARIDAD:   25,
  DESPACHO_PESO_CERCANIA:       15,

  // ── Movilizador ──
  // Ventana MÓVIL de la vista del movilizador, en días hacia atrás desde hoy
  // (hora Perú). Sustituye a la fecha de corte fija, que envejecía sola: quedó
  // cuatro meses atrás y las listas llegaron a las 1000 filas del tope de
  // PostgREST — truncadas en silencio y descargadas enteras en cada refresco.
  //
  // Ponerlo en 0 vuelve al corte fijo de FECHA_CORTE_MOVILIZADOR (que sigue en
  // app_config y sirve de escape para una revisión histórica puntual).
  MOV_VENTANA_DIAS: 20,

  // ── Servidor ──
  SRV_POLL_CACHE_TTL_MS:  10_000,    // micro-cache de endpoints de polling (ramal)
  // Cache de los endpoints CAROS (/movilizador/status, /movilizador/pendientes,
  // /ots/vivas). Puede ser largo porque NO es el mecanismo de frescura: toda
  // mutación pasa por emitEvent_ y borra la entrada del topic al instante
  // (lib/poll-cache.js). Este TTL solo cubre lo que cambia sin pasar por este
  // servidor — escrituras desde Apps Script o edición manual en Supabase.
  //
  // Tiene que ser >= al POLL_ más largo que lo usa (300s, el del movilizador).
  // Si fuera menor, cada pantalla vencería el cache justo antes de su propio
  // ciclo y ninguna se serviría de otra: el ahorro entre dispositivos —el
  // motivo de existir del cache— desaparecería.
  SRV_CACHE_PESADO_MS:   300_000,

  // ── Límites de consulta ──
  LIM_ENTREGADOS_RECIENTES: 200,     // solicitudes ENTREGADO a listar
  LIM_ASG_RECIENTES:        2000,    // asignaciones recientes (rol_trabajo)
  LIM_STATS_SEMANA:         5000,    // asignaciones para stats semanales
  // PostgREST corta toda respuesta en db-max-rows (1000 en Supabase hosted) SIN avisar.
  // Cualquier consulta que pueda superarlo tiene que paginarse con estos dos valores.
  LIM_PAGINA_SUPABASE:      1000,    // tamaño de página al paginar por Range
  LIM_REPORTE_MAX_FILAS:    20_000,  // tope duro del reporte de supervisor
  LIM_VINS_POR_CONSULTA:    200,     // VINs por `in.(...)` para no reventar la URL
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
