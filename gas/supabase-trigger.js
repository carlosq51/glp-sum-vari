/**
 * ═══════════════════════════════════════════════════════════════
 * SUPABASE SYNC TRIGGER — Apps Script (PEGA EN TU PROYECTO GAS)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Este archivo sincroniza datos de Supabase a Google Sheets cada 10 minutos
 * SIN interferir con la app (runs en background en el servidor de Google)
 * 
 * INSTALACIÓN:
 * 1. Abre tu Google Sheet
 * 2. Extensiones → Apps Script
 * 3. Crea un nuevo archivo llamado "supabase-trigger.js"
 * 4. Pega este código completo
 * 5. En project Settings → Script Properties, agrega:
 *    - SUPABASE_URL = tu URL
 *    - SUPABASE_KEY = tu ANON_KEY
 *    - SUPABASE_SERVICE_ROLE_KEY = tu service role key (opcional, si quieres hacer update)
 * 6. Autoriza y guarda
 * 7. En "Triggers" (⏰), crea trigger: "syncFromSupabase" cada 10 minutos
 */

const SYNC_CONFIG = {
  // Script Properties (configura en Configuración del proyecto)
  getSupabaseUrl: () => PropertiesService.getScriptProperties().getProperty("SUPABASE_URL"),
  getSupabaseKey: () => PropertiesService.getScriptProperties().getProperty("SUPABASE_KEY"),
  
  // Hojas de destino
  SHEETS: {
    incidencias: "INCIDENCIAS",
    eventos: "MARCA_EVENTOS", 
    conformidades: "CALIDAD1",
    work_orders: "LISTADO_TRABAJO",
  },

  // Columnas (ajusta según tu estructura)
  COLUMNS: {
    incidencias: ["id", "fecha_hora", "vin", "conversion_id", "tipo", "categoria", "registrado_por", "nota"],
    eventos: ["id", "fecha_hora", "vin", "conversion_id", "accion", "registrado_por", "rol"],
    conformidades: ["id", "fecha_hora", "vin", "tipo", "registrado_por", "estado"],
    work_orders: ["id", "vin", "conversion_id", "estado", "tecnico_asignado", "fecha_inicio"],
  },

  // TTL para cache (evita re-sincronizar constantemente)
  CACHE_TTL_MIN: 5,
};

/**
 * 🎯 MAIN TRIGGER — Se ejecuta cada 10 minutos automáticamente
 */
function syncFromSupabase() {
  try {
    console.log(`[SYNC] Iniciando sincronización desde Supabase (${new Date().toISOString()})`);
    
    // Sincroniza cada tabla
    const results = {
      incidencias: syncTable_("incidencias", "id", "updated_at"),
      eventos: syncTable_("eventos", "id", "updated_at"),
      conformidades: syncTable_("conformidades", "id", "updated_at"),
      work_orders: syncTable_("work_orders", "id", "updated_at"),
    };

    console.log("[SYNC] ✅ Sincronización completada:", JSON.stringify(results));
    
    // Registra última sincronización
    PropertiesService.getScriptProperties().setProperty(
      "LAST_SYNC_TIME",
      new Date().toISOString()
    );

  } catch (err) {
    console.error("[SYNC] ❌ Error:", err);
    // Envía notificación al propietario del Sheet
    sendErrorNotification_(err);
  }
}

/**
 * 🔄 Sincroniza UNA tabla desde Supabase
 */
function syncTable_(table, idCol, dateCol) {
  try {
    const sheetName = SYNC_CONFIG.SHEETS[table];
    if (!sheetName) throw new Error(`Tabla ${table} no configurada en SHEETS`);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      console.warn(`[SYNC] Sheet ${sheetName} no existe, creando...`);
      sheet = ss.insertSheet(sheetName);
    }

    // Obtén columnas configuradas
    const columns = SYNC_CONFIG.COLUMNS[table] || [];
    if (!columns.length) throw new Error(`Columnas no configuradas para ${table}`);

    // 1️⃣ Obtén data de Supabase
    const data = fetchFromSupabase_(table, columns, dateCol);
    if (!data || !data.length) {
      console.log(`[SYNC] ${table}: sin datos nuevos`);
      return { table, synced: 0 };
    }

    // 2️⃣ Prepara headers
    if (sheet.getLastRow() === 0) {
      // Sheet vacío: agrega headers
      sheet.appendRow(columns);
    }

    // 3️⃣ Limpia datos viejos (OPCIONAL: solo si quieres histórico reducido)
    // clearOldRows_(sheet, dateCol);

    // 4️⃣ Agrega nuevas filas
    const newRows = data.map(record => 
      columns.map(col => formatValue_(record[col], col))
    );

    if (newRows.length > 0) {
      sheet.getRange(
        sheet.getLastRow() + 1,
        1,
        newRows.length,
        columns.length
      ).setValues(newRows);

      console.log(`[SYNC] ✅ ${table}: ${newRows.length} filas sincronizadas`);
    }

    return { table, synced: newRows.length };

  } catch (err) {
    console.error(`[SYNC] Error sincronizando ${table}:`, err);
    return { table, error: err.message };
  }
}

/**
 * 🌐 Obtiene datos de Supabase REST API
 */
function fetchFromSupabase_(table, columns, dateCol) {
  const url = SYNC_CONFIG.getSupabaseUrl();
  const key = SYNC_CONFIG.getSupabaseKey();

  if (!url || !key) {
    throw new Error("Falta SUPABASE_URL o SUPABASE_KEY en Script Properties");
  }

  try {
    // Construye query: obtén registros actualizados recientemente
    // Ordena por dateCol descendente para obtener los más nuevos primero
    const query = `?order=${encodeURIComponent(dateCol)}.desc&limit=1000`;
    
    const fullUrl = `${url}/rest/v1/${table}${query}`;

    const options = {
      method: "GET",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(fullUrl, options);
    const status = response.getResponseCode();

    if (status !== 200) {
      const text = response.getContentText();
      throw new Error(`Supabase ${status}: ${text}`);
    }

    const json = JSON.parse(response.getContentText());
    return Array.isArray(json) ? json : [];

  } catch (err) {
    throw new Error(`fetch Supabase '${table}' falló: ${err.message}`);
  }
}

/**
 * 💾 Formatea valores según el tipo de columna
 */
function formatValue_(value, colName) {
  if (value === null || value === undefined) return "";
  
  // Si es ISO date, convierte a formato legible
  if ((colName.includes("fecha") || colName.includes("date") || colName.includes("time")) 
      && typeof value === "string" && value.includes("T")) {
    try {
      const date = new Date(value);
      return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      return String(value);
    }
  }

  // Si es boolean, convierte a YES/NO
  if (typeof value === "boolean") {
    return value ? "SÍ" : "NO";
  }

  // Si es array o objeto, convierte a JSON string
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  return String(value);
}

/**
 * 🧹 OPCIONAL: Limpia filas más antiguas que X días (para reducir Sheet)
 */
function clearOldRows_(sheet, dateCol) {
  const DAYS_TO_KEEP = 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP);

  try {
    const range = sheet.getDataRange();
    const values = range.getValues();
    
    // Busca la columna con la fecha
    const headers = values[0];
    const dateColIdx = headers.indexOf(dateCol);
    if (dateColIdx === -1) return; // No encontró columna de fecha

    // Marca filas para borrar (de atrás hacia adelante)
    let rowsDeleted = 0;
    for (let i = values.length - 1; i > 0; i--) {
      const cellValue = values[i][dateColIdx];
      if (cellValue && typeof cellValue === "object" && cellValue.getTime) {
        if (cellValue < cutoffDate) {
          sheet.deleteRow(i + 1);
          rowsDeleted++;
        }
      }
    }

    if (rowsDeleted > 0) {
      console.log(`[CLEANUP] Eliminadas ${rowsDeleted} filas antiguas de ${sheet.getName()}`);
    }
  } catch (err) {
    console.warn("[CLEANUP] Error limpiando filas antigas:", err);
  }
}

/**
 * 📧 Envía notificación de error al propietario
 */
function sendErrorNotification_(err) {
  try {
    const subject = `[GLP-SYNC] ❌ Error en sincronización Supabase`;
    const message = `
Timestamp: ${new Date().toISOString()}
Error: ${err.message}

Por favor verifica:
1. Script Properties (SUPABASE_URL, SUPABASE_KEY)
2. Estado de Supabase
3. Permisos de lectura en las tablas

Sheet: ${SpreadsheetApp.getActiveSpreadsheet().getName()}
    `;

    // Envía a propietario
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    MailApp.sendEmail(ss.getOwner().getEmail(), subject, message);
  } catch (e) {
    console.error("[NOTIFICATION] No se pudo enviar email:", e);
  }
}

/**
 * 🧪 TEST: Ejecuta sincronización manualmente desde editor
 * (para debugging, ejecuta en la interfaz de Apps Script)
 */
function testSync() {
  console.clear();
  console.log("🧪 Iniciando test de sincronización...");
  syncFromSupabase();
}

/**
 * ✅ Verifica que Script Properties está configurado correctamente
 */
function verifyConfig() {
  const url = SYNC_CONFIG.getSupabaseUrl();
  const key = SYNC_CONFIG.getSupabaseKey();

  const config = {
    SUPABASE_URL: url ? "✅ Configurado" : "❌ Falta",
    SUPABASE_KEY: key ? "✅ Configurado" : "❌ Falta",
    Sheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
  };

  console.log("📋 Configuración actual:", JSON.stringify(config, null, 2));

  if (url && key) {
    console.log("✅ Listo para sincronizar!");
    return true;
  } else {
    console.log("❌ Por favor configura Script Properties primero");
    return false;
  }
}
