/***********************
 *  CONFIG
 ***********************/
const SHEETS = {
  VIN_LIST: "LISTA DE VIN GLP",
  USERS: "USUARIOS",
  CONV: "CONV121",
  CALIDAD: "CALIDAD1",
  RAMAL: "RAMALERO1",
  ASSIGN: "ASIGNACIONES",
  EVENTS: "MARCA_EVENTOS",
  INC: "INCIDENCIAS",
};

const ALLOWED_ROLES = new Set(["MOTOR", "TANQUE", "CALIDAD", "RAMALERO", "MOVILIZADOR"]);
const ALLOWED_ACTIONS = new Set(["INICIO", "PAUSA", "REANUDAR", "FIN", "NOTA"]);

/***********************
 *  DRIVE / FOTOS
 ***********************/
const ROOT_FOLDER_ID = "1wTy6uPATj_yeGyxZM54ZaT8ku8eTCirN";

const SLOT_NAMES = {
  vin: "vin.jpg",
  comp_1: "comp_1.jpg",
  comp_2: "comp_2.jpg",
  comp_3: "comp_3.jpg",
  comp_4: "comp_4.jpg",
  corr_pre: "corr_pre.jpg",
  corr_post: "corr_post.jpg",
  voltaje: "voltaje.jpg",
  scan_carro: "scan_carro.jpg",
};


const CALIDAD_SLOT_NAMES = {
  calidad_1: "calidad_1.jpg",
  calidad_2: "calidad_2.jpg",
  calidad_3: "calidad_3.jpg",
  calidad_4: "calidad_4.jpg",
};

const CONF_MAIN_FOLDERS = {
  TANQUE: "ACTA CONF TANQUE",
  REDUCTOR: "ACTA CONF REDUCTOR",
};

/***********************
 *  HELPERS
 ***********************/

function findRealConversionIdByVin_(vin) {
  const v = normalizeVin_(vin);
  if (!v) return "";

  const cacheKey = `REAL_CONV_ID_${v}`;
  const cached = cacheGetJson_(cacheKey);
  if (cached && typeof cached.value === "string") return cached.value;

  const sh = sh_(SHEETS.CONV);
  const hdr = headersMap_(sh);

  const colVin  = hdr["VIN"]           || 0;
  const colConv = hdr["CONVERSION_ID"] || 0;
  if (!colVin || !colConv) return "";

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "";

  const numRows = lastRow - 1;

  // ✅ UN solo viaje: leemos desde la col más pequeña hasta la más grande
  const colStart = Math.min(colVin, colConv);
  const colEnd   = Math.max(colVin, colConv);
  const numCols  = colEnd - colStart + 1;

  const data = sh.getRange(2, colStart, numRows, numCols).getDisplayValues();

  // Índices locales dentro del bloque leído
  const iVin  = colVin  - colStart;
  const iConv = colConv - colStart;

  for (let i = 0; i < numRows; i++) {
    const row = data[i];
    if (String(row[iVin] || "").trim().toUpperCase() !== v) continue;

    const realConversionId = String(row[iConv] || "").trim();
    if (realConversionId) {
      cachePutJson_(cacheKey, { value: realConversionId }, 300);
      return realConversionId;
    }
    return "";
  }

  return "";
}

const _sheetCache_ = {};
function sh_(name) {
  if (_sheetCache_[name]) return _sheetCache_[name];
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error(`No encuentro la hoja "${name}".`);
  _sheetCache_[name] = sh;
  return sh;
}

const _headersCache_ = {};
function headersMap_(sheet) {
  const name = sheet.getName();
  if (_headersCache_[name]) return _headersCache_[name];
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  const key = `HDR_${name}_${lastCol}`;
  const cached = cacheGetJson_(key);
  if (cached && cached.map) { _headersCache_[name] = cached.map; return cached.map; }

  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const keyH = String(headers[i] || "").trim().toUpperCase();
    if (keyH) map[keyH] = i + 1; // 1-based
  }
  cachePutJson_(key, { map }, 600);
  _headersCache_[name] = map;
  return map;
}

function now_() {
  return new Date();
}
function uuid_() {
  return Utilities.getUuid();
}
function normalizeVin_(vin) {
  return String(vin || "").trim().toUpperCase();
}
function normalizeRole_(role) {
  return String(role || "").trim().toUpperCase();
}
function normalizeAction_(action) {
  return String(action || "").trim().toUpperCase();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
}

function requireKey_(obj) {
  const expected = getApiKey_();
  if (!expected) throw new Error("Falta API_KEY en Script Properties.");
  const key = String(obj?.key || obj?.apiKey || "").trim();
  if (key !== expected) throw new Error("No autorizado (API key inválida).");
}

function fmtHMS_(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toIso_(d) {
  return (d instanceof Date && !isNaN(d.getTime())) ? d.toISOString() : null;
}

/***********************
 *  DB-READY HELPERS
 *  Canonical column names = what the DB will use.
 *  Aliases = legacy Sheet header variants still supported.
 ***********************/
const COLUMN_ALIASES = {
  "VIN":               ["VIN", "CHASIS", "CHASIS_ID"],
  "REDUCTOR_ASIGNADO": ["REDUCTOR_ASIGNADO", "REDU_AUTO", "REDUCTOR", "REDU"],
  "TANQUE_ASIGNADO":   ["TANQUE_ASIGNADO", "TANQ_AUTO", "TANQUE", "TANQ"],
};

/** Resolve canonical name → 1-based col index, trying aliases. Returns 0 if missing. */
function resolveCol_(headersMap, canonicalName) {
  const aliases = COLUMN_ALIASES[canonicalName];
  if (aliases) {
    for (const a of aliases) { if (headersMap[a]) return headersMap[a]; }
    return 0;
  }
  return headersMap[canonicalName] || 0;
}

/** Derives TIPO_OT (work order type) from ROL_TRABAJO for polymorphic FK. */
function tipoOtFromRole_(rol) {
  const r = normalizeRole_(rol);
  if (r === "MOTOR" || r === "TANQUE" || r === "MOVILIZADOR") return "CONVERSION";
  if (r === "CALIDAD") return "CALIDAD";
  if (r === "RAMALERO") return "RAMALERO";
  return "CONVERSION";
}

/** Build Drive URLs from a file ID. In DB only store fileId; URLs are computed. */
function driveUrls_(fileId) {
  if (!fileId) return { url: "", thumbUrl: "", imgUrl: "" };
  return {
    url:      "https://drive.google.com/file/d/" + fileId + "/view",
    thumbUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400",
    imgUrl:   "https://drive.google.com/uc?export=view&id=" + fileId,
  };
}

/***********************
 *  CACHE
 ***********************/
function cache_() {
  return CacheService.getScriptCache();
}

function cacheGetJson_(key) {
  const v = cache_().get(key);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function cachePutJson_(key, obj, ttlSec) {
  cache_().put(key, JSON.stringify(obj), ttlSec || 120);
}

function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k) || "";
}

function propSet_(k, v) {
  PropertiesService.getScriptProperties().setProperty(k, String(v));
}

/**
 * Revision global monotónica para sync.
 * Asume que el caller ya tiene ScriptLock.
 * Si se llama sin lock externo, usar bumpRevSafe_().
 */
function bumpRev_() {
  const n = Number(prop_("REV") || "0") + 1;
  propSet_("REV", String(n));
  propSet_("REV_TS", String(Date.now()));
  // Invalidar caches de mapas para que el próximo sync los reconstruya
  cache_().removeAll(["ALL_MAPS_V2", "WORKID2META", "ASG_BY_VIN", "REG_BY_CID"]);
  return String(n);
}

function bumpRevSafe_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try { return bumpRev_(); }
  finally { lock.releaseLock(); }
}

function getRev_() {
  const rev = prop_("REV") || "0";
  const ts = Number(prop_("REV_TS") || "0");
  return { rev, ts };
}