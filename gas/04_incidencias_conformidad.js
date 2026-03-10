/***********************
 *  EQUIPO CONFORMIDAD
 ***********************/
// ✅ 1) equipoConformidad_ — una sola escritura en bloque
function equipoConformidad_(p) {
  try {
    const email         = String(p.email        || "").trim().toLowerCase();
    const conversionId  = String(p.conversionId || "").trim();
    const rolTrabajo    = String(p.rolTrabajo   || "").trim().toUpperCase();
    const equipoCodigo  = String(p.equipoCodigo || "").trim().toUpperCase();

    const checks = p.checks || {};
    const ck1 = !!checks.ck1, ck2 = !!checks.ck2,
          ck3 = !!checks.ck3, ck4 = !!checks.ck4;

    if (!email)         return { ok: false, error: "Falta email" };
    if (!conversionId)  return { ok: false, error: "Falta conversionId" };
    if (rolTrabajo !== "MOTOR" && rolTrabajo !== "TANQUE")
                        return { ok: false, error: "rolTrabajo inválido" };
    if (!equipoCodigo)  return { ok: false, error: "Falta equipoCodigo" };

    const sh  = sh_(SHEETS.CONV);
    const hdr = headersMap_(sh);

    const colCID = hdr["CONVERSION_ID"];
    if (!colCID) return { ok: false, error: "CONV121: falta columna CONVERSION_ID." };

    const colTanqueReg = hdr["TANQUE_REGISTRADO"] || 0;
    const colRedReg    = hdr["REDUCTOR_REGISTRADO"] || 0;

    if (rolTrabajo === "TANQUE" && !colTanqueReg)
      return { ok: false, error: "CONV121: falta columna TANQUE_REGISTRADO." };
    if (rolTrabajo === "MOTOR" && !colRedReg)
      return { ok: false, error: "CONV121: falta columna REDUCTOR_REGISTRADO." };

    const colCk1 = hdr["CONF_CK1"] || 0;
    const colCk2 = hdr["CONF_CK2"] || 0;
    const colCk3 = hdr["CONF_CK3"] || 0;
    const colCk4 = hdr["CONF_CK4"] || 0;
    const colTs  = hdr["CONF_TS"]  || 0;
    const colBy  = hdr["CONF_BY"]  || 0;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: false, error: "CONV121 está vacía" };

    const found = sh.getRange(2, colCID, lastRow - 1, 1)
      .createTextFinder(conversionId)
      .matchEntireCell(true)
      .findNext();
    if (!found) return { ok: false, error: "No se encontró conversionId en CONV121" };

    const rowIndex = found.getRow();
    const lastCol  = sh.getLastColumn();

    // ✅ Leer fila completa, modificar en memoria, escribir una sola vez
    const rowData = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];

    if (rolTrabajo === "TANQUE" && colTanqueReg) rowData[colTanqueReg - 1] = equipoCodigo;
    else if (colRedReg)                          rowData[colRedReg    - 1] = equipoCodigo;

    if (colCk1) rowData[colCk1 - 1] = ck1;
    if (colCk2) rowData[colCk2 - 1] = ck2;
    if (colCk3) rowData[colCk3 - 1] = ck3;
    if (colCk4) rowData[colCk4 - 1] = ck4;
    if (colTs)  rowData[colTs  - 1] = new Date();
    if (colBy)  rowData[colBy  - 1] = email;

    // ✅ UN solo viaje de escritura en lugar de 8
    sh.getRange(rowIndex, 1, 1, lastCol).setValues([rowData]);

    bumpRevSafe_();

    return { ok: true, conversionId, rolTrabajo, equipoCodigo,
             checks: { ck1, ck2, ck3, ck4 } };

  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}


/***********************
 *  Helpers (genéricos)
 ***********************/
function headersMapByRow_(sh, headerRow) {
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const map = {};
  for (let c = 0; c < headers.length; c++) {
    const k = String(headers[c] || "").trim().toUpperCase();
    if (k) map[k] = c + 1;
  }
  return map;
}
function mustCol_(hdr, name) {
  const k = String(name || "").trim().toUpperCase();
  const col = hdr[k];
  if (!col) throw new Error("Falta columna " + k);
  return col;
}
function optCol_(hdr, name) {
  const k = String(name || "").trim().toUpperCase();
  return hdr[k] || 0;
}

/***********************
 *  INCIDENCIAS
 ***********************/
// ✅ 2) incidencias_list_ — sort con timestamp pre-calculado
function incidencias_list_(payload) {
  const email = String(payload?.email || "").trim().toLowerCase();
  const vin   = String(payload?.vin   || "").trim().toUpperCase();
  const limit = Math.max(1, Math.min(500, Number(payload?.limit || 200)));

  if (!vin) throw new Error("Falta vin.");

  const rol = email ? getRoleByEmail_(email) : "";
  if (rol && !["SUPERVISOR", "CALIDAD", "ADMIN"].includes(String(rol).toUpperCase())) {
    throw new Error("No autorizado.");
  }

  const realConversionId = findRealConversionIdByVin_(vin);

  const sh  = ensureIncSheet_();
  const hdr = headersMapByRow_(sh, 1);

  const cVin  = hdr["VIN"]           || 0;
  const cConv = hdr["CONVERSION_ID"] || 0;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    return { ok: true, items: [], resolved: { vin, realConversionId } };
  }

  const values  = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const out = [];

  for (let i = 0; i < values.length; i++) {
    const row     = values[i];
    const rowVin  = cVin  ? String(row[cVin  - 1] || "").trim().toUpperCase() : "";
    const rowConv = cConv ? String(row[cConv - 1] || "").trim()               : "";

    let match = false;
    if (realConversionId) {
      match = (rowConv === realConversionId) || (rowVin === vin);
    } else {
      match = (rowVin === vin);
    }
    if (!match) continue;

    const it = {};
    for (const k of Object.keys(hdr)) it[k] = row[hdr[k] - 1];

    const fechaRaw = it["FECHA_HORA"] || "";
    // ✅ pre-calcular timestamp una sola vez, no en cada comparación del sort
    const fechaMs  = fechaRaw instanceof Date
      ? fechaRaw.getTime()
      : (isFinite(new Date(fechaRaw).getTime()) ? new Date(fechaRaw).getTime() : 0);

    out.push({
      _sortMs:      fechaMs,
      fecha:        fechaRaw,
      mes:          it["MES"]              || "",
      conversionId: it["CONVERSION_ID"]    || "",
      vin:          it["VIN"]              || "",
      tecnico:      it["TECNICO"]          || "",
      tipo:         it["TIPO"]             || "",
      nota:         it["NOTA"]             || "",
      registradoPor:it["REGISTRADO_POR"]   || "",
      fotoFileId:   it["FOTO_FILE_ID"]     || "",
      // DB-READY: compute URLs from fileId if sheet columns are empty
      fotoUrl:      it["FOTO_URL"]         || driveUrls_(it["FOTO_FILE_ID"]).url      || "",
      fotoThumbUrl: it["FOTO_THUMB_URL"]   || driveUrls_(it["FOTO_FILE_ID"]).thumbUrl  || "",
      fotoImgUrl:   it["FOTO_IMG_URL"]     || driveUrls_(it["FOTO_FILE_ID"]).imgUrl    || "",
      fotoFolderId: it["FOTO_FOLDER_ID"]   || "",
      fotoBatchId:  it["FOTO_BATCH_ID"]    || "",
    });

    if (out.length >= limit) break;
  }

  // ✅ sort directo en ms, sin new Date() en cada comparación
  out.sort((a, b) => b._sortMs - a._sortMs);
  for (const it of out) delete it._sortMs;

  return { ok: true, items: out, resolved: { vin, realConversionId } };
}


function ensureIncSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEETS.INC);
  if (!sh) sh = ss.insertSheet(SHEETS.INC);

  const REQUIRED_HEADERS = [
    "FECHA_HORA",
    "MES",
    "CONVERSION_ID",
    "VIN",
    "TECNICO",
    "TIPO",
    "REGISTRADO_POR",
    "NOTA",

    // ✅ nuevas columnas foto
    "FOTO_FILE_ID",
    "FOTO_URL",
    "FOTO_THUMB_URL",
    "FOTO_IMG_URL",
    "FOTO_FOLDER_ID",
    "FOTO_BATCH_ID",
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    return sh;
  }

  // si ya existía, agrega columnas faltantes sin romper datos
  const lastCol = sh.getLastColumn();
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h || "").trim().toUpperCase());

  const existingSet = {};
  current.forEach((h, i) => { if (h) existingSet[h] = i + 1; });

  let col = lastCol;
  REQUIRED_HEADERS.forEach(h => {
    if (!existingSet[h]) {
      col++;
      sh.getRange(1, col).setValue(h);
      existingSet[h] = col;
    }
  });

  return sh;
}

function incidencia_add_(payload) {
  const email = String(payload?.email || "").trim().toLowerCase();
  const conversionId = String(payload?.conversionId || "").trim();
  const vin = String(payload?.vin || "").trim().toUpperCase();

  // ✅ Compatibilidad nueva + vieja
  const tecnicoUserId = String(payload?.tecnicoUserId || payload?.tecnicoId || "").trim();
  const tecnicoEmail = String(payload?.tecnicoEmail || "").trim().toLowerCase();
  const tecnicoNombre = String(payload?.tecnicoNombre || "").trim();

  // legacy
  const tecnicoLegacy = String(payload?.tecnico || "").trim();

  const tecnico = tecnicoNombre || tecnicoEmail || tecnicoUserId || tecnicoLegacy;

  const tipo = String(payload?.tipo || "").trim().toUpperCase();
  const nota = String(payload?.nota || "").trim();

  // ✅ foto opcional (la manda Node después de subir a Drive)
  const fotoFileId = String(payload?.fotoFileId || "").trim();
  // DB-READY: derive URLs from fileId; only fileId needs to be stored in DB
  const derivedUrls = driveUrls_(fotoFileId);
  const fotoUrl = String(payload?.fotoUrl || derivedUrls.url).trim();
  const fotoThumbUrl = String(payload?.fotoThumbUrl || derivedUrls.thumbUrl).trim();
  const fotoImgUrl = String(payload?.fotoImgUrl || derivedUrls.imgUrl).trim();
  const fotoFolderId = String(payload?.fotoFolderId || "").trim();
  const fotoBatchId = String(payload?.fotoBatchId || "").trim();

  if (!email) throw new Error("Falta email (registrador).");
  if (!vin && !conversionId) throw new Error("Falta VIN o CONVERSION_ID.");
  if (!tecnico && !tecnicoUserId && !tecnicoEmail) throw new Error("Selecciona técnico.");
  if (!["LEVE", "MODERADA", "CRITICA"].includes(tipo)) throw new Error("Tipo inválido.");

  const rol = getRoleByEmail_(email);


  const sh = ensureIncSheet_();
  const now = new Date();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const mes = Utilities.formatDate(now, tz, "yyyy-MM");

  // ✅ escribir por headers (más robusto si cambias columnas)
  const hdr = headersMapByRow_(sh, 1);
  const row = new Array(sh.getLastColumn()).fill("");

  function put_(name, value) {
    const c = hdr[String(name || "").toUpperCase()];
    if (c) row[c - 1] = value;
  }

  put_("FECHA_HORA", now);
  put_("MES", mes);
  put_("CONVERSION_ID", conversionId);
  put_("VIN", vin);
  put_("TECNICO", tecnico);
  put_("TIPO", tipo);
  put_("REGISTRADO_POR", email);
  put_("NOTA", nota);

  // foto
  put_("FOTO_FILE_ID", fotoFileId);
  put_("FOTO_URL", fotoUrl);
  put_("FOTO_THUMB_URL", fotoThumbUrl);
  put_("FOTO_IMG_URL", fotoImgUrl);
  put_("FOTO_FOLDER_ID", fotoFolderId);
  put_("FOTO_BATCH_ID", fotoBatchId);

  sh.appendRow(row);

  return {
    ok: true,
    saved: true,
    mes,
    vin,
    conversionId,
    tipo,
    tecnico,
    tecnicoUserId,
    tecnicoEmail,
    tecnicoNombre,
    foto: {
      fileId: fotoFileId,
      url: fotoUrl,
      thumbUrl: fotoThumbUrl,
      imgUrl: fotoImgUrl,
      folderId: fotoFolderId,
      batchId: fotoBatchId,
    }
  };
}