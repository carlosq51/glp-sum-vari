/**
 * migrate_to_supabase.js
 *
 * Ejecutar desde Apps Script (pegar en el editor de GAS y correr manualmente).
 * Lee todas las hojas del Sheet y las inserta en Supabase via REST API.
 *
 * REQUISITOS:
 *   1. En Script Properties agregar:
 *      - SUPABASE_URL    = https://xxxxx.supabase.co
 *      - SUPABASE_KEY    = tu service_role key (NO la anon key)
 *   2. Ejecutar el schema.sql en Supabase ANTES de correr este script.
 *   3. Las tablas deben estar vacías (o hacer TRUNCATE antes).
 */
const MIGRATION_CTX = {
  userIdMap: {},   // legacy USER_ID -> uuid
  userEmailMap: {}, // email -> uuid
};

// ─── CONFIG ───
function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty("SUPABASE_URL"),
    key: props.getProperty("SUPABASE_KEY"),
  };
}

function supabaseInsert_(table, rows) {
  if (!rows.length) return;
  const cfg = getSupabaseConfig_();
  // Supabase tiene límite por request; enviar en batches de 500
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const resp = UrlFetchApp.fetch(`${cfg.url}/rest/v1/${table}`, {
      method: "POST",
      contentType: "application/json",
      headers: {
        "apikey": cfg.key,
        "Authorization": "Bearer " + cfg.key,
        "Prefer": "return=minimal",
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error(`Supabase INSERT ${table} batch ${i}: ${code} — ${resp.getContentText()}`);
    }
    Logger.log(`[${table}] inserted ${batch.length} rows (batch ${Math.floor(i / BATCH) + 1})`);
  }
}

// ─── HELPERS ───
function sheetData_(sheetName) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) { Logger.log(`Hoja "${sheetName}" no encontrada, saltando.`); return []; }
  const last = sh.getLastRow();
  if (last < 2) return [];
  const data = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const headers = data[0].map(h => String(h || "").trim().toUpperCase());
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((h, c) => { if (h) obj[h] = data[i][c]; });
    rows.push(obj);
  }
  return rows;
}

function isoOrNull_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}


function str_(v) { return String(v || "").trim(); }

// Generador simple de UUID v4
function uuidv4_() {
  // https://stackoverflow.com/a/2117523/3988732
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Valida si un string es UUID v4
function isValidUUID_(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function resolveUserUuid_(rawUserId, rawEmail) {
  const legacyId = str_(rawUserId);
  const email = str_(rawEmail).toLowerCase();

  if (legacyId && MIGRATION_CTX.userIdMap[legacyId]) {
    return MIGRATION_CTX.userIdMap[legacyId];
  }

  if (email && MIGRATION_CTX.userEmailMap[email]) {
    return MIGRATION_CTX.userEmailMap[email];
  }

  return null;
}

function tipoOt_(rol) {
  const r = String(rol || "").trim().toUpperCase();
  if (r === "MOTOR" || r === "TANQUE" || r === "MOVILIZADOR") return "CONVERSION";
  if (r === "CALIDAD") return "CALIDAD";
  if (r === "RAMALERO") return "RAMALERO";
  return "CONVERSION";
}

function normalizeTipoRamal_(v) {
  const s = str_(v).toUpperCase();

  if (!s) return null;

  if (s.includes("JETOUR")) return "JETOUR";
  if (s.includes("VOLKSWAGEN")) return "VOLKSWAGEN";
  if (s.includes("KYC X5")) return "KYC X5";
  if (s.includes("KYC V7")) return "KYC V7";

  // caso ambiguo: "KYC V3 / V5"
  if (s.includes("KYC V3") && s.includes("KYC V5")) return "KYC V3";

  if (s.includes("KYC V3")) return "KYC V3";
  if (s.includes("KYC V5")) return "KYC V5";

  return null;
}

// ═══════════════════════════════════════════
//  MAIN: ejecutar esta función
// ═══════════════════════════════════════════
function migrateAll() {
  migrateVins_();
  migrateUsuarios_();
  migrateWorkOrders_();
  migrateAsignaciones_();
  migrateEventos_();
  migrateIncidencias_();
  Logger.log("✅ MIGRACIÓN COMPLETA");
}

// ─── 1. VINS ───
function migrateVins_() {
  const rows = sheetData_("LISTA DE VIN GLP");
  if (!rows.length) return;
  const out = rows.map(r => ({
    vin:               str_(r["VIN"]),
    modelo:            str_(r["MODELO"]),
    dua:               str_(r["DUA"]),
    cliente:           str_(r["CLIENTE"]),
    reductor_asignado: str_(r["REDU_AUTO"] || r["REDUCTOR_ASIGNADO"] || r["REDUCTOR"] || ""),
    tanque_asignado:   str_(r["TANQ_AUTO"] || r["TANQUE_ASIGNADO"] || r["TANQUE"] || ""),
  })).filter(r => r.vin);
  supabaseInsert_("vins", out);
  Logger.log(`✅ vins: ${out.length} filas`);
}

// ─── 2. USUARIOS + MODULOS ───
function normalizeEspecialidad_(v) {
  let e = str_(v).toUpperCase();

  if (e === "TANQUERO") e = "TANQUE";

  const allowed = new Set(["AMBOS", "MOTOR", "TANQUE"]);
  if (!allowed.has(e)) return "AMBOS";

  return e;
}

function migrateUsuarios_() {
  const rows = sheetData_("USUARIOS");
  if (!rows.length) return;

  const users = [];
  const modulos = [];

  for (const r of rows) {
    let id = str_(r["UUID"]);
    if (!isValidUUID_(id)) {
      id = uuidv4_();
    }
    if (!id) continue;

    const legacyUserId = str_(r["USER_ID"] || r["ID"]);
    const email = str_(r["EMAIL"]).toLowerCase();
    const rol = str_(r["ROL"]).toUpperCase() || "TECNICO";
    const especialidad = normalizeEspecialidad_(r["ESPECIALIDAD"]);

    // Guardar mapa legacy -> uuid
    if (legacyUserId) MIGRATION_CTX.userIdMap[legacyUserId] = id;
    if (email) MIGRATION_CTX.userEmailMap[email] = id;

    users.push({
      id,
      email,
      nombre: str_(r["NOMBRE"]),
      rol,
      especialidad,
      activo: String(r["ACTIVO"]).toUpperCase() !== "FALSE",
    });

    const modRaw = str_(r["MODULOS"]).toUpperCase();
    if (modRaw) {
      const ALL = ["TECNICO","RAMALERO","CALIDAD","MOVILIZADOR","SUPERVISOR","ADMIN"];
      const mods = modRaw === "ALL" ? ALL : modRaw.split(/[,;\s|]+/).filter(Boolean);

      for (const m of mods) {
        if (ALL.includes(m)) {
          modulos.push({ user_id: id, modulo: m });
        }
      }
    }
  }

  supabaseInsert_("usuarios", users);
  Logger.log(`✅ usuarios: ${users.length} filas`);

  if (modulos.length) {
    supabaseInsert_("usuario_modulos", modulos);
    Logger.log(`✅ usuario_modulos: ${modulos.length} filas`);
  }
}

// ─── 3. WORK ORDERS (CONV121 + CALIDAD1 + RAMALERO1) ───
function migrateWorkOrders_() {
  const out = [];

  // CONV121
  const conv = sheetData_("CONV121");
  for (const r of conv) {
    const id = str_(r["CONVERSION_ID"]);
    if (!id) continue;

    const row = workOrderBase_();
    row.id = id;
    row.tipo_ot = "CONVERSION";
    row.vin = str_(r["CHASIS_ID"]) || null;
    row.fecha_creacion = isoOrNull_(r["FECHA_CREACION"]);
    row.estado_general = str_(r["ESTADO_GENERAL"]).toUpperCase() || "PENDIENTE";
    row.observaciones = str_(r["OBSERVACIONES"]);
    row.tanque_registrado = str_(r["TANQUE_REGISTRADO"]);
    row.reductor_registrado = str_(r["REDUCTOR_REGISTRADO"]);
    row.conf_ck1 = !!r["CONF_CK1"];
    row.conf_ck2 = !!r["CONF_CK2"];
    row.conf_ck3 = !!r["CONF_CK3"];
    row.conf_ck4 = !!r["CONF_CK4"];
    row.conf_ts = isoOrNull_(r["CONF_TS"]);
    row.conf_by = str_(r["CONF_BY"]) || null;

    out.push(row);
  }

  // CALIDAD1
  const cal = sheetData_("CALIDAD1");
  for (const r of cal) {
    const id = str_(r["CALIDAD_ID"]);
    if (!id) continue;

    const row = workOrderBase_();
    row.id = id;
    row.tipo_ot = "CALIDAD";
    row.vin = str_(r["CHASIS_ID"]) || null;
    row.fecha_creacion = isoOrNull_(r["FECHA_CREACION"]);
    row.estado_general = str_(r["ESTADO_GENERAL"]).toUpperCase() || "PENDIENTE";
    row.observaciones = str_(r["OBSERVACIONES"]);
    row.tanque_registrado = str_(r["TANQUE_REGISTRADO"]);
    row.reductor_registrado = str_(r["REDUCTOR_REGISTRADO"]);

    out.push(row);
  }

  // RAMALERO1
  const ram = sheetData_("RAMALERO1");
  for (const r of ram) {
    const id = str_(r["RAMAL_ID"]);
    if (!id) continue;

    const row = workOrderBase_();
    row.id = id;
    row.tipo_ot = "RAMALERO";
    row.user_id = resolveUserUuid_(r["USER_ID"], r["EMAIL"]);
    row.tipo_ramal = normalizeTipoRamal_(r["TIPO_RAMAL"]);
    row.fecha_creacion = isoOrNull_(r["FECHA_CREACION"]);
    row.estado_general = str_(r["ESTADO_GENERAL"]).toUpperCase() || "PENDIENTE";
    row.observaciones = str_(r["OBSERVACIONES"]);

    out.push(row);
  }

  if (out.length) {
    supabaseInsert_("work_orders", out);
    Logger.log(`✅ work_orders: ${out.length} filas (CONV:${conv.length} CAL:${cal.length} RAM:${ram.length})`);
  }
}

// ─── 4. ASIGNACIONES ───
function migrateAsignaciones_() {
  const rows = sheetData_("ASIGNACIONES");
  if (!rows.length) return;

  const out = rows.map(r => {
    const rol = str_(r["ROL_TRABAJO"]).toUpperCase();
    return {
      id:               str_(r["ASIGNACION_ID"]),
      work_order_id:    str_(r["CONVERSION_ID"]),
      user_id: resolveUserUuid_(r["USER_ID"], r["EMAIL"]),
      tipo_ot:          str_(r["TIPO_OT"]).toUpperCase() || tipoOt_(rol),
      rol_trabajo:      rol,
      activo:           String(r["ACTIVO"]).toUpperCase() === "TRUE",
      fecha_asignacion: isoOrNull_(r["FECHA_ASIGNACION"]),
      tiempo_trab_ms:   Number(r["TIEMPO_TRAB_MS"]) || 0,
      estado_actual:    str_(r["ESTADO_ACTUAL"]).toUpperCase() || "SIN_INICIAR",
      updated_at:       isoOrNull_(r["UPDATED_AT"]),
      running_since:    isoOrNull_(r["RUNNING_SINCE"]),
      last_nota:        str_(r["LAST_NOTA"]),
      last_nota_ts:     isoOrNull_(r["LAST_NOTA_TS"]),
    };
  }).filter(r => r.id && r.work_order_id && r.user_id);

  supabaseInsert_("asignaciones", out);
  Logger.log(`✅ asignaciones: ${out.length} filas`);
}

// ─── 5. EVENTOS ───
function migrateEventos_() {
  const rows = sheetData_("MARCA_EVENTOS");
  if (!rows.length) return;

  const out = rows.map(r => {
    const rol = str_(r["ROL_TRABAJO"]).toUpperCase();
    return {
      id:            str_(r["EVENTO_ID"]),
      timestamp:     isoOrNull_(r["TIMESTAMP"]),
      user_id: resolveUserUuid_(r["USER_ID"], r["EMAIL"]),
      work_order_id: str_(r["CONVERSION_ID"]),
      tipo_ot:       str_(r["TIPO_OT"]).toUpperCase() || tipoOt_(rol),
      rol_trabajo:   rol,
      accion:        str_(r["ACCION"]).toUpperCase(),
      nota:          str_(r["NOTA"]),
    };
  }).filter(r => r.id && r.work_order_id && r.user_id);

  supabaseInsert_("eventos", out);
  Logger.log(`✅ eventos: ${out.length} filas`);
}

// ─── 6. INCIDENCIAS ───
function migrateIncidencias_() {
  const rows = sheetData_("INCIDENCIAS");
  if (!rows.length) return;

  const out = rows.map(r => ({
    fecha_hora:     isoOrNull_(r["FECHA_HORA"]),
    mes:            str_(r["MES"]),
    work_order_id:  str_(r["CONVERSION_ID"]) || null,
    vin:            str_(r["VIN"]) || null,
    tecnico:        str_(r["TECNICO"]),
    tipo:           str_(r["TIPO"]).toUpperCase(),
    registrado_por: str_(r["REGISTRADO_POR"]),
    nota:           str_(r["NOTA"]),
    foto_file_id:   str_(r["FOTO_FILE_ID"]),
    foto_folder_id: str_(r["FOTO_FOLDER_ID"]),
    foto_batch_id:  str_(r["FOTO_BATCH_ID"]),
    // FOTO_URL, FOTO_THUMB_URL, FOTO_IMG_URL → NO se migran (se computan desde foto_file_id)
  })).filter(r => r.mes && r.tecnico);

  supabaseInsert_("incidencias", out);
  Logger.log(`✅ incidencias: ${out.length} filas`);
}

function workOrderBase_() {
  return {
    id: null,
    tipo_ot: null,
    vin: null,
    user_id: null,
    tipo_ramal: null,
    fecha_creacion: null,
    estado_general: "PENDIENTE",
    observaciones: "",
    tanque_registrado: "",
    reductor_registrado: "",
    conf_ck1: false,
    conf_ck2: false,
    conf_ck3: false,
    conf_ck4: false,
    conf_ts: null,
    conf_by: null,
  };
}