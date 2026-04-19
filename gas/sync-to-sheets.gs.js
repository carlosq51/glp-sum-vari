/**
 * sync-to-sheets.gs.js
 *
 * Sincroniza datos de Supabase → Google Sheets cada 10 minutos
 * Ejecutar MANUALMENTE: setupTrigger_() una sola vez
 * Luego el trigger automático ejecutará syncSupabaseToSheets_() cada 10 min
 *
 * PURPOSE:
 *   - Supabase es source-of-truth
 *   - Google Sheets es replica de auditoría únicamente
 *   - Si hay discrepancias, Supabase es la versión correcta
 */

// ─── CONFIG ───
const SUPABASE_CONFIG = {
  get url() { return PropertiesService.getScriptProperties().getProperty("SUPABASE_URL"); },
  get key() { return PropertiesService.getScriptProperties().getProperty("SUPABASE_KEY"); },
};

// Mapping: nombre tabla Supabase → nombre hoja Sheets
const SHEET_MAPPING = {
  vins: "LISTA DE VIN GLP",
  usuarios: "USUARIOS",
  work_orders: "WORK_ORDERS",
  asignaciones: "ASIGNACIONES",
  eventos: "MARCA_EVENTOS",
  incidencias: "INCIDENCIAS",
};

// ─── SETUP: ejecutar MANUALMENTE en Apps Script Console ───
/**
 * PASO 1: Guardar credenciales en Script Properties
 * Ejecutar en console: setupCredentials_()
 */
function setupCredentials_() {
  const props = PropertiesService.getScriptProperties();
  
  // TODO: Reemplaza con tu Supabase URL y SERVICE ROLE key
  props.setProperty("SUPABASE_URL", "https://xxxxx.supabase.co");
  props.setProperty("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
  
  Logger.log("✅ Credenciales guardadas. Ahora ejecuta setupTrigger_()");
}

/**
 * PASO 2: Crear hojas si no existen
 * Ejecutar en console: createSheetsIfMissing_()
 */
function createSheetsIfMissing_() {
  const ss = SpreadsheetApp.getActive();
  const existingSheets = ss.getSheets().map(s => s.getName());
  
  Object.values(SHEET_MAPPING).forEach(sheetName => {
    if (!existingSheets.includes(sheetName)) {
      ss.insertSheet(sheetName);
      Logger.log(`✅ Creada hoja: ${sheetName}`);
    }
  });
  
  Logger.log("✅ Todas las hojas existen");
}

/**
 * PASO 3: Agendar trigger automático
 * Ejecutar en console: setupTrigger_()
 * (solo UNA vez)
 */
function setupTrigger_() {
  // Eliminar triggers antiguos para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncSupabaseToSheets_") {
      ScriptApp.deleteTrigger(t);
      Logger.log("🗑️ Eliminado trigger antiguo");
    }
  });
  
  // Crear nuevo trigger: cada 10 minutos
  ScriptApp.newTrigger("syncSupabaseToSheets_")
    .timeBased()
    .everyMinutes(10)
    .create();
  
  Logger.log("✅ Trigger creado: sincronización cada 10 minutos");
  Logger.log("ℹ️ La próxima ejecución será en ~10 min");
}

/**
 * FUNCIÓN PRINCIPAL: Sincronizar Supabase → Sheets
 * Se ejecuta automáticamente cada 10 min
 */
function syncSupabaseToSheets_() {
  try {
    Logger.log("🔄 INICIANDO SINCRONIZACIÓN: Supabase → Sheets");
    Logger.log(`timestamp: ${new Date().toISOString()}`);
    
    const ss = SpreadsheetApp.getActive();
    let syncedCount = 0;
    
    // 1. Sincronizar cada tabla
    syncedCount += syncTable_(ss, "vins");
    syncedCount += syncTable_(ss, "usuarios");
    syncedCount += syncTable_(ss, "work_orders");
    syncedCount += syncTable_(ss, "asignaciones");
    syncedCount += syncTable_(ss, "eventos");
    syncedCount += syncTable_(ss, "incidencias");
    
    // 2. Validar integridad
    const integrity = validateIntegrity_();
    
    // 3. Log final
    Logger.log(`✅ SINCRONIZACIÓN COMPLETADA`);
    Logger.log(`   - Tablas sincronizadas: ${syncedCount}`);
    Logger.log(`   - Integridad FK: ${integrity.ok ? "✅ OK" : "⚠️ WARNINGS"}`);
    if (!integrity.ok) {
      Logger.log(`   - Detalles: ${JSON.stringify(integrity.warnings)}`);
    }
    
  } catch (err) {
    Logger.log(`❌ ERROR en sincronización:`);
    Logger.log(`   ${err.name}: ${err.message}`);
    Logger.log(`   Stack: ${err.stack}`);
    
    // Notificar si está configurado
    sendSyncFailureAlert_(err);
  }
}

/**
 * Sincroniza una tabla individual
 * @param {Spreadsheet} ss
 * @param {string} tableName - nombre tabla en Supabase
 * @returns {number} 1 si éxito, 0 si fallo
 */
function syncTable_(ss, tableName) {
  try {
    const sheetName = SHEET_MAPPING[tableName];
    if (!sheetName) {
      Logger.log(`⚠️ No hay mapping para tabla: ${tableName}`);
      return 0;
    }
    
    // 1. Leer datos de Supabase
    const rows = supabaseSelect_(tableName);
    
    if (!rows || rows.length === 0) {
      Logger.log(`⚠️ ${tableName}: 0 filas (hoja se limpiará)`);
    } else {
      Logger.log(`📥 ${tableName}: ${rows.length} filas descargadas de Supabase`);
    }
    
    // 2. Obtener/crear hoja
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      Logger.log(`✅ ${sheetName}: creada`);
    }
    
    // 3. TRUNCATE + escribir datos
    writeSheetData_(sheet, rows);
    Logger.log(`✅ ${sheetName}: ${rows.length} filas escribidas`);
    
    return 1;
  } catch (err) {
    Logger.log(`❌ ${tableName}: ${err.message}`);
    return 0;
  }
}

/**
 * Lee datos de una tabla Supabase via REST API
 * @param {string} tableName
 * @returns {Array} filas
 */
function supabaseSelect_(tableName) {
  const url = SUPABASE_CONFIG.url + `/rest/v1/${tableName}`;
  const options = {
    method: "GET",
    headers: {
      "apikey": SUPABASE_CONFIG.key,
      "Authorization": "Bearer " + SUPABASE_CONFIG.key,
      "Content-Type": "application/json",
    },
    muteHttpExceptions: true,
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  
  if (code < 200 || code >= 300) {
    throw new Error(`Supabase GET ${tableName}: ${code} — ${response.getContentText().slice(0, 200)}`);
  }
  
  try {
    const data = JSON.parse(response.getContentText());
    return Array.isArray(data) ? data : [];
  } catch (err) {
    throw new Error(`Parse JSON error: ${err.message}`);
  }
}

/**
 * Escribe datos a hoja: TRUNCATE + INSERT
 * @param {Sheet} sheet
 * @param {Array} rows - datos
 */
function writeSheetData_(sheet, rows) {
  // 1. Limpiar hoja (excepto headers si existen)
  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.deleteRows(2, maxRows - 1); // Borrar desde fila 2
  }
  
  // 2. Si no hay datos, solo dejar headers vacía
  if (!rows || rows.length === 0) {
    // Opcional: escribir headers vacíos
    // sheet.appendRow([]); 
    return;
  }
  
  // 3. Escribir headers (primeros keys del primer objeto)
  const headers = Object.keys(rows[0]);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // 4. Escribir datos (batch por performance)
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map(row =>
      headers.map(h => row[h] !== undefined && row[h] !== null ? row[h] : "")
    );
    
    const startRow = 2 + i;
    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  }
}

/**
 * Valida integridad de datos (FK, duplicados, etc)
 * @returns {Object} {ok: boolean, warnings: Array}
 */
function validateIntegrity_() {
  try {
    const warnings = [];
    
    // 1. Verificar que no haya IDs duplicados
    const tables = ["usuarios", "work_orders", "asignaciones", "eventos", "incidencias"];
    for (const table of tables) {
      const rows = supabaseSelect_(table);
      const ids = rows.map(r => r.id);
      const uniqueIds = new Set(ids);
      
      if (ids.length !== uniqueIds.size) {
        warnings.push(`❌ ${table}: IDs duplicados detectados`);
      }
    }
    
    // 2. Verificar que asignaciones referencian work_orders existentes
    const asignaciones = supabaseSelect_("asignaciones");
    const workOrders = supabaseSelect_("work_orders");
    const woIds = new Set(workOrders.map(w => w.id));
    
    const orphanedAsig = asignaciones.filter(a => !woIds.has(a.work_order_id));
    if (orphanedAsig.length > 0) {
      warnings.push(`⚠️ asignaciones: ${orphanedAsig.length} sin work_order válido`);
    }
    
    // 3. Verificar que eventos referencien work_orders existentes
    const eventos = supabaseSelect_("eventos");
    const orphanedEvt = eventos.filter(e => !woIds.has(e.work_order_id));
    if (orphanedEvt.length > 0) {
      warnings.push(`⚠️ eventos: ${orphanedEvt.length} sin work_order válido`);
    }
    
    return {
      ok: warnings.length === 0,
      warnings,
    };
  } catch (err) {
    Logger.log(`⚠️ Validación de integridad falló: ${err.message}`);
    return {
      ok: false,
      warnings: [err.message],
    };
  }
}

/**
 * Envía alerta si sincronización falla
 * (Opcional: integrar con Slack, email, etc)
 */
function sendSyncFailureAlert_(err) {
  // TODO: Implementar notificación
  // Ej: MailApp.sendEmail("admin@glp.com", "Sync failed", err.message);
  // Ej: llamar webhook de Slack
  
  Logger.log("📧 [PLACEHOLDER] Alerta enviada (no configurado)");
}

/**
 * Ejecutar manualmente UNA VEZ para forzar sync
 * Útil para debugging
 */
function manualSync_() {
  Logger.log("🚀 FORZANDO SINCRONIZACIÓN MANUAL...");
  syncSupabaseToSheets_();
}

/**
 * Ver estado de triggers
 */
function listTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  
  if (triggers.length === 0) {
    Logger.log("ℹ️ No hay triggers programados");
    return;
  }
  
  Logger.log(`📋 Triggers activos: ${triggers.length}`);
  triggers.forEach((t, i) => {
    Logger.log(`  ${i + 1}. Función: ${t.getHandlerFunction()}, Tipo: ${t.getTriggerSource()}`);
  });
}

/**
 * Eliminar triggerautomático
 * (en caso de que quieras parar la sincronización)
 */
function deleteSyncTrigger_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncSupabaseToSheets_") {
      ScriptApp.deleteTrigger(t);
      Logger.log("✅ Trigger eliminado");
    }
  });
}
