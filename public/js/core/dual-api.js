// =========================
// public/js/core/dual-api.js
// Capa de datos: escritura dual (AppScript + Supabase)
// Lectura desde Supabase
// =========================

import { postJSON, getJSON } from "./api.js";
import { 
  supabaseEnabled, 
  supabaseGet, 
  supabasePost, 
  supabasePatch 
} from "./supabase-client.js";

/**
 * Config de migración
 */
const MIGRATION_CONFIG = {
  // Si true: escribe en ambos, lee desde Supabase
  DUAL_WRITE: true,
  // Si true: ignora errores de escritura en AppScript
  IGNORE_APPSCRIPT_ERRORS: false,
  // Si true: ignora errores de Supabase
  IGNORE_SUPABASE_ERRORS: false,
};

/**
 * Actualiza config de migración
 */
export function setMigrationConfig(cfg) {
  Object.assign(MIGRATION_CONFIG, cfg);
}

/**
 * ⚡ ESCRITURA DUAL: escribe en AppScript + Supabase en paralelo
 * Espera a que ambas terminen, pero reporta errores sin fallar
 */
export async function dualWrite(action, payload, options = {}) {
  if (!MIGRATION_CONFIG.DUAL_WRITE) {
    // Modo legacy: solo AppScript
    return await postJSON(`/api/${action}`, payload);
  }

  const writeAppScript = postJSON(`/api/${action}`, payload)
    .catch(err => {
      if (!MIGRATION_CONFIG.IGNORE_APPSCRIPT_ERRORS) throw err;
      console.warn(`[DUAL_WRITE] AppScript error (ignorado):`, err.message);
      return null;
    });

  let writeSupabase = Promise.resolve(null);
  
  if (supabaseEnabled()) {
    writeSupabase = dualWriteToSupabase_(action, payload, options)
      .catch(err => {
        if (!MIGRATION_CONFIG.IGNORE_SUPABASE_ERRORS) throw err;
        console.warn(`[DUAL_WRITE] Supabase error (ignorado):`, err.message);
        return null;
      });
  }

  // Espera ambas en paralelo
  const [appScriptResult, supabaseResult] = await Promise.all([writeAppScript, writeSupabase]);

  // Retorna resultado de AppScript (es el primario por ahora)
  return appScriptResult || { ok: true, _supabase: supabaseResult };
}

/**
 * 🚀 LECTURA DESDE SUPABASE (más rápido que AppScript)
 */
export async function dualRead(table, filter = {}, options = {}) {
  // Si Supabase está disponible, lee desde ahí
  if (supabaseEnabled() && !options.forceAppScript) {
    try {
      return await supabaseGet(table, filter);
    } catch (err) {
      if (!MIGRATION_CONFIG.IGNORE_SUPABASE_ERRORS) {
        console.warn(`[DUAL_READ] Supabase fallback:`, err.message);
      }
      // Fallback a AppScript si Supabase falla
    }
  }

  // Fallback a AppScript (sistema legacy)
  return await getJSON(`/api/supabase-read?table=${encodeURIComponent(table)}&filter=${encodeURIComponent(JSON.stringify(filter))}`);
}

/**
 * ✍️ Helper interno: escribe a Supabase según la acción
 */
async function dualWriteToSupabase_(action, payload, options = {}) {
  switch (action) {
    case "incidencia": {
      // Mapea payload de API a schema Supabase
      const data = {
        vin: payload.vin,
        conversion_id: payload.conversionId,
        tipo: payload.tipo,
        nota: payload.nota,
        tecnico_user_id: payload.tecnicoUserId,
        tecnico_email: payload.tecnicoEmail,
        tecnico_nombre: payload.tecnicoNombre,
        registrado_por: payload.email,
        foto_b64: payload.foto?.b64 || null,
        foto_mime: payload.foto?.mimeType || null,
        foto_name: payload.foto?.name || null,
        fecha_hora: new Date().toISOString(),
      };
      
      const result = await supabasePost("incidencias", data);
      return { ok: true, data: result };
    }

    case "evento": {
      const data = {
        vin: payload.vin,
        conversion_id: payload.conversionId,
        rol: payload.rol || "TECNICO",
        accion: payload.accion,
        nota: payload.nota || "",
        registrado_por: payload.email,
        fecha_hora: new Date().toISOString(),
      };
      
      const result = await supabasePost("eventos", data);
      return { ok: true, data: result };
    }

    case "conformidad": {
      const data = {
        vin: payload.vin,
        conversion_id: payload.conversionId,
        asignado_a: payload.email,
        estado: "PENDIENTE",
        fecha_asignacion: new Date().toISOString(),
      };
      
      const result = await supabasePost("conformidades", data);
      return { ok: true, data: result };
    }

    default:
      console.warn(`[DUAL_WRITE] Acción no mapeada a Supabase: ${action}`);
      return null;
  }
}

/**
 * 🔄 SYNC: fuerza sincronización AppScript → Supabase
 * (útil para migration inicial o recovery)
 */
export async function syncFromAppScript(action, filters = {}) {
  // Obtén datos de AppScript
  const fromAS = await getJSON(`/api/supabase-sync?action=${action}&filters=${JSON.stringify(filters)}`);
  
  if (!fromAS.ok || !supabaseEnabled()) {
    return fromAS;
  }

  // Mapea y sube a Supabase
  const records = fromAS.data || [];
  const results = [];

  for (const record of records) {
    try {
      const mapped = mapASRecordToSupabase_(action, record);
      const result = await supabasePost(mapTableName_(action), mapped);
      results.push({ ok: true, record: result });
    } catch (err) {
      results.push({ ok: false, error: err.message, original: record });
    }
  }

  return { ok: true, synced: results.length, results };
}

/**
 * Helper: mapea registro de AppScript a Supabase
 */
function mapASRecordToSupabase_(action, record) {
  switch (action) {
    case "incidencias":
      return {
        vin: record.VIN,
        conversion_id: record.CONVERSION_ID,
        tipo: record.TIPO,
        nota: record.NOTA,
        tecnico_email: record.TECNICO_EMAIL,
        tecnico_nombre: record.TECNICO,
        registrado_por: record.REGISTRADO_POR,
        fecha_hora: record.FECHA_HORA,
      };
    case "eventos":
      return {
        vin: record.VIN,
        conversion_id: record.CONVERSION_ID,
        rol: record.ROL,
        accion: record.ACCION,
        nota: record.NOTA,
        registrado_por: record.EMAIL,
        fecha_hora: record.FECHA,
      };
    default:
      return record;
  }
}

/**
 * Helper: mapea nombre de tabla de acción a Supabase
 */
function mapTableName_(action) {
  const map = {
    "incidencias": "incidencias",
    "eventos": "eventos",
    "conformidad": "conformidades",
  };
  return map[action] || action;
}
