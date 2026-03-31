function uploadOne_(data) {
  try {
    const vin = normalizeVin_(data.vin);
    if (!vin) throw new Error("VIN inválido");

    const dateStr = data.dateStr || todayDateStr_();
    const slot = String(data.slot || "").trim();
    const b64 = data.b64;
    const mimeType = data.mimeType || "image/jpeg";

    if (!slot) throw new Error("Falta slot");
    if (!b64) throw new Error("Falta b64");

    const isCalidad = !!CALIDAD_SLOT_NAMES[slot];
    const isRegistro = !!SLOT_NAMES[slot];
    if (!isCalidad && !isRegistro) {
      throw new Error("Slot desconocido: " + slot);
    }

    Logger.log("[uploadOne_] vin=" + vin);
    Logger.log("[uploadOne_] slot=" + slot);
    Logger.log("[uploadOne_] mimeType=" + mimeType);
    Logger.log("[uploadOne_] b64.length=" + String(b64).length);
    Logger.log("[uploadOne_] ROOT_FOLDER_ID=" + ROOT_FOLDER_ID);

    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    Logger.log("[uploadOne_] root ok: " + root.getName());

    const lock = LockService.getUserLock();
    lock.waitLock(20000);

    try {
      const ctx = getOrCreateCarContext_(root, vin, dateStr);
      Logger.log("[uploadOne_] carFolder=" + ctx.carFolderName + " | id=" + ctx.carFolder.getId());

      const targetFolder = isCalidad
        ? getOrCreateFolder_(ctx.carFolder, "CALIDAD")
        : getOrCreateFolder_(ctx.carFolder, "REGISTRO");

      Logger.log("[uploadOne_] targetFolder=" + targetFolder.getName() + " | id=" + targetFolder.getId());

      const fixedName = isCalidad ? CALIDAD_SLOT_NAMES[slot] : SLOT_NAMES[slot];
      Logger.log("[uploadOne_] fixedName=" + fixedName);

      deleteIfExistsByName_(targetFolder, fixedName);

      let bytes;
      try {
        bytes = Utilities.base64Decode(b64);
        Logger.log("[uploadOne_] bytes=" + bytes.length);
      } catch (e) {
        throw new Error("base64Decode falló: " + (e.message || e));
      }

      const blob = Utilities.newBlob(bytes, mimeType, fixedName);

      const created = targetFolder.createFile(blob);
      const id = created.getId();

      return json_({
        ok: true,
        vin,
        dateStr,
        monthFolderName: ctx.monthFolderName,
        carFolderName: ctx.carFolderName,
        folderKind: isCalidad ? "CALIDAD" : "REGISTRO",
        folderId: targetFolder.getId(),
        saved: { slot, fileId: id, name: created.getName() },
        preview: {
          fileId: id,
          name: created.getName(),
          url: `https://drive.google.com/file/d/${id}/view`,
          thumbUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
          imgUrl: `https://drive.google.com/uc?export=view&id=${id}`
        }
      });

    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    Logger.log("[uploadOne_] ERROR=" + (err.message || err));
    Logger.log("[uploadOne_] STACK=" + (err.stack || "sin stack"));

    return json_({
      ok: false,
      error: "[uploadOne_] " + String(err.message || err),
      stack: String(err.stack || "")
    });
  }
}

function testUploadRootOnly() {
  try {
    Logger.log("ROOT_FOLDER_ID=" + ROOT_FOLDER_ID);
    const f = DriveApp.getFolderById(ROOT_FOLDER_ID);
    Logger.log("ROOT OK: " + f.getName() + " | " + f.getId());
  } catch (err) {
    Logger.log("testUploadRootOnly ERROR=" + (err.message || err));
    Logger.log("STACK=" + (err.stack || "sin stack"));
    throw err;
  }
}

function testUploadCreateFileInRoot() {
  try {
    Logger.log("ROOT_FOLDER_ID=" + ROOT_FOLDER_ID);
    const folder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    Logger.log("FOLDER OK: " + folder.getName() + " | " + folder.getId());

    const blob = Utilities.newBlob("hola", "text/plain", "test_upload.txt");
    const file = folder.createFile(blob);

    Logger.log("FILE OK: " + file.getId());
  } catch (err) {
    Logger.log("testUploadCreateFileInRoot ERROR=" + (err.message || err));
    Logger.log("STACK=" + (err.stack || "sin stack"));
    throw err;
  }
}

function testDriveSimple() {
  try {
    const root = DriveApp.getRootFolder();
    Logger.log("MY DRIVE OK: " + root.getName() + " | " + root.getId());
  } catch (err) {
    Logger.log("testDriveSimple ERROR=" + (err.message || err));
    Logger.log("STACK=" + (err.stack || "sin stack"));
    throw err;
  }
}

function reautorizarDrive() {
  const root = DriveApp.getRootFolder();
  Logger.log(root.getName());
}

function TEST_debugVinAsignaciones_LSCABN3E3TE144318() {
  const VIN_OBJETIVO = "LSCABN3E3TE144318";

  try {
    Logger.log("===== DEBUG VIN INICIO =====");
    Logger.log("VIN objetivo: " + VIN_OBJETIVO);

    // 0) limpiar cache en memoria
    _allMapsCache_ = null;

    // 1) VIN normalizado
    const vinN = normalizeVin_(VIN_OBJETIVO);
    Logger.log("VIN normalizado: " + vinN);

    // 2) verificar si existe en lista
    let existsInList = false;
    try {
      existsInList = vinExistsInList_(vinN);
    } catch (e) {
      Logger.log("ERROR vinExistsInList_: " + e.message);
    }
    Logger.log("Existe en LISTA VIN: " + existsInList);

    // 3) revisar hoja LISTA DE VIN GLP directamente
    try {
      const shV = sh_(SHEETS.VIN);
      const hV = headersMap_(shV);

      Logger.log("---- SHEETS.VIN ----");
      Logger.log("Nombre hoja VIN: " + SHEETS.VIN);
      Logger.log("Headers VIN: " + JSON.stringify(hV));

      const vVIN  = hV["VIN"] || 0;
      const vTanA = hV["TANQUE_ASIGNADO"] || hV["TANQ_AUTO"] || 0;
      const vRedA = hV["REDUCTOR_ASIGNADO"] || hV["REDU_AUTO"] || 0;

      Logger.log("Col VIN: " + vVIN);
      Logger.log("Col TANQUE asignado: " + vTanA);
      Logger.log("Col REDUCTOR asignado: " + vRedA);

      const lastV = shV.getLastRow();
      Logger.log("LastRow VIN sheet: " + lastV);

      let foundVinRow = -1;
      let foundVinData = null;

      if (lastV >= 2 && vVIN) {
        const dataV = shV.getRange(2, 1, lastV - 1, shV.getLastColumn()).getValues();

        for (let i = 0; i < dataV.length; i++) {
          const rowVin = String(dataV[i][vVIN - 1] || "").trim().toUpperCase();
          if (rowVin === vinN) {
            foundVinRow = i + 2;
            foundVinData = dataV[i];
            break;
          }
        }
      }

      if (foundVinRow > 0) {
        Logger.log("VIN encontrado en LISTA VIN, fila: " + foundVinRow);
        Logger.log("Tanque asignado real en LISTA VIN: " + (vTanA ? String(foundVinData[vTanA - 1] || "").trim() : ""));
        Logger.log("Reductor asignado real en LISTA VIN: " + (vRedA ? String(foundVinData[vRedA - 1] || "").trim() : ""));
        Logger.log("Fila completa LISTA VIN: " + JSON.stringify(foundVinData));
      } else {
        Logger.log("VIN NO encontrado en LISTA VIN");
      }

    } catch (e) {
      Logger.log("ERROR revisando LISTA VIN: " + e.message);
      Logger.log(e.stack);
    }

    // 4) revisar CONV121 directamente
    let cid = null;
    try {
      cid = findConversionIdByVin_(vinN);
      Logger.log("ConversionId encontrado: " + cid);

      const shC = sh_(SHEETS.CONV);
      const hC = headersMap_(shC);

      Logger.log("---- SHEETS.CONV ----");
      Logger.log("Nombre hoja CONV: " + SHEETS.CONV);
      Logger.log("Headers CONV: " + JSON.stringify(hC));

      const cCID  = hC["CONVERSION_ID"] || 0;
      const cVIN  = hC["CHASIS_ID"] || 0;
      const cTanR = hC["TANQUE_REGISTRADO"] || 0;
      const cRedR = hC["REDUCTOR_REGISTRADO"] || 0;

      Logger.log("Col CONVERSION_ID: " + cCID);
      Logger.log("Col CHASIS_ID: " + cVIN);
      Logger.log("Col TANQUE_REGISTRADO: " + cTanR);
      Logger.log("Col REDUCTOR_REGISTRADO: " + cRedR);

      const lastC = shC.getLastRow();
      Logger.log("LastRow CONV: " + lastC);

      let foundConvRow = -1;
      let foundConvData = null;

      if (lastC >= 2 && cVIN) {
        const dataC = shC.getRange(2, 1, lastC - 1, shC.getLastColumn()).getValues();

        for (let i = 0; i < dataC.length; i++) {
          const rowVin = String(dataC[i][cVIN - 1] || "").trim().toUpperCase();
          if (rowVin === vinN) {
            foundConvRow = i + 2;
            foundConvData = dataC[i];
            break;
          }
        }
      }

      if (foundConvRow > 0) {
        Logger.log("VIN encontrado en CONV121, fila: " + foundConvRow);
        Logger.log("CID en CONV121: " + (cCID ? String(foundConvData[cCID - 1] || "").trim() : ""));
        Logger.log("Tanque registrado en CONV121: " + (cTanR ? String(foundConvData[cTanR - 1] || "").trim() : ""));
        Logger.log("Reductor registrado en CONV121: " + (cRedR ? String(foundConvData[cRedR - 1] || "").trim() : ""));
        Logger.log("Fila completa CONV121: " + JSON.stringify(foundConvData));
      } else {
        Logger.log("VIN NO encontrado en CONV121");
      }

    } catch (e) {
      Logger.log("ERROR revisando CONV121: " + e.message);
      Logger.log(e.stack);
    }

    // 5) revisar buildAllMaps_
    try {
      _allMapsCache_ = null;
      const maps = buildAllMaps_();

      Logger.log("---- buildAllMaps_ ----");
      Logger.log("meta keys: " + Object.keys(maps.meta || {}).length);
      Logger.log("asgByVin keys: " + Object.keys(maps.asgByVin || {}).length);
      Logger.log("regByCid keys: " + Object.keys(maps.regByCid || {}).length);

      const asgVin = (maps.asgByVin && maps.asgByVin[vinN]) ? maps.asgByVin[vinN] : null;
      Logger.log("maps.asgByVin[VIN]: " + JSON.stringify(asgVin));

      const cid2 = cid || findConversionIdByVin_(vinN);
      Logger.log("CID usado para regByCid: " + cid2);

      const regCid = (cid2 && maps.regByCid && maps.regByCid[cid2]) ? maps.regByCid[cid2] : null;
      Logger.log("maps.regByCid[CID]: " + JSON.stringify(regCid));

    } catch (e) {
      Logger.log("ERROR en buildAllMaps_: " + e.message);
      Logger.log(e.stack);
    }

    // 6) probar salida simulada de mis_activas/sync para un técnico tanque
    try {
      const cid3 = cid || findConversionIdByVin_(vinN);
      const maps2 = buildAllMaps_();
      const asgVin2 = maps2.asgByVin[vinN] || { tanque: "", reductor: "" };
      const regCid2 = cid3 ? (maps2.regByCid[cid3] || { tanque_registrado: "", reductor_registrado: "" }) : null;

      const resumen = {
        vin: vinN,
        conversionId: cid3 || "",
        tanque_asignado: asgVin2.tanque || "",
        reductor_asignado: asgVin2.reductor || "",
        tanque_registrado: regCid2 ? (regCid2.tanque_registrado || "") : "",
        reductor_registrado: regCid2 ? (regCid2.reductor_registrado || "") : "",
      };

      Logger.log("---- RESUMEN FINAL ----");
      Logger.log(JSON.stringify(resumen, null, 2));

    } catch (e) {
      Logger.log("ERROR armando resumen final: " + e.message);
      Logger.log(e.stack);
    }

    Logger.log("===== DEBUG VIN FIN =====");

  } catch (err) {
    Logger.log("ERROR GENERAL: " + err.message);
    Logger.log(err.stack);
  }
}