/***********************
 *  3) CONV121: ensure conversionId for VIN (crea)
 ***********************/
function ensureConversionId_(vin) {
  const vinN = normalizeVin_(vin);
  if (!vinN) throw new Error("VIN vacío.");

  const ckey = `VIN2CID_${vinN}`;
  const cached = cache_().get(ckey);
  if (cached) return cached;

  const sh = sh_(SHEETS.CONV);
  const map = headersMap_(sh);

  const colCID = map["CONVERSION_ID"];
  const colVIN = map["CHASIS_ID"];
  const colCRE = map["FECHA_CREACION"];
  const colEST = map["ESTADO_GENERAL"];
  const colOBS = map["OBSERVACIONES"];

  if (!colCID || !colVIN) throw new Error('CONV121 debe tener columnas "CONVERSION_ID" y "CHASIS_ID".');

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (const row of data) {
      if (normalizeVin_(row[colVIN - 1]) === vinN) {
        const cid = String(row[colCID - 1] || "").trim();
        if (cid) {
          cache_().put(ckey, cid, 600);
          return cid;
        }
      }
    }
  }

  const newId = uuid_();
  const rowToAppend = Array(sh.getLastColumn()).fill("");
  const now = now_();

  rowToAppend[colCID - 1] = newId;
  rowToAppend[colVIN - 1] = vinN;
  if (colCRE) rowToAppend[colCRE - 1] = now;
  if (colEST) rowToAppend[colEST - 1] = "PENDIENTE";
  if (colOBS) rowToAppend[colOBS - 1] = "";

  const nextRow = sh.getLastRow() + 1;
  sh.getRange(nextRow, 1, 1, rowToAppend.length).setValues([rowToAppend]);

  cache_().put(ckey, newId, 600);
  return newId;
}

/***********************
 *  3c) CONV121: find conversionId por VIN (SIN crear)
 ***********************/
// ✅ 3) findConversionIdByVin_ — con caché
function findConversionIdByVin_(vin) {
  const vinN = normalizeVin_(vin);
  if (!vinN) return null;

  // ✅ Caché corto (30s) para evitar re-lecturas en la misma request
  const ckey = `FIND_CID_${vinN}`;
  const cached = cache_().get(ckey);
  if (cached !== null) return cached || null;

  const sh = sh_(SHEETS.CONV);
  const map = headersMap_(sh);
  const colCID = map["CONVERSION_ID"];
  const colVIN = map["CHASIS_ID"];
  if (!colCID || !colVIN) return null;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  for (const row of data) {
    if (normalizeVin_(row[colVIN - 1]) === vinN) {
      const cid = String(row[colCID - 1] || "").trim();
      if (cid) { cache_().put(ckey, cid, 30); return cid; }
    }
  }
  cache_().put(ckey, "", 30);
  return null;
}


// ✅ 4) updateCalidadRow_ y updateRamalRow_ — setValues en lugar de setValue por celda
function updateCalidadRow_(calidadId, patch) {
  const sh = sh_(SHEETS.CALIDAD);
  const map = headersMap_(sh);
  const colQID = map["CALIDAD_ID"];
  if (!colQID) return false;

  const last = sh.getLastRow();
  if (last < 2) return false;

  const qidN = String(calidadId || "").trim();
  if (!qidN) return false;

  const lastCol = sh.getLastColumn();
  const data = sh.getRange(2, 1, last - 1, lastCol).getValues();
  let rowIndex = -1;
  let rowData = null;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][colQID - 1] || "").trim() === qidN) {
      rowIndex = i + 2;
      rowData = data[i];
      break;
    }
  }
  if (!rowData) return false;

  if (map["ESTADO_GENERAL"] && patch?.estado_general != null) {
    rowData[map["ESTADO_GENERAL"] - 1] = String(patch.estado_general).trim().toUpperCase();
  }
  if (map["OBSERVACIONES"] && patch?.observaciones != null) {
    rowData[map["OBSERVACIONES"] - 1] = String(patch.observaciones);
  }

  sh.getRange(rowIndex, 1, 1, lastCol).setValues([rowData]);
  return true;
}

function updateRamalRow_(ramalId, patch) {
  const sh = sh_(SHEETS.RAMAL);
  const map = headersMap_(sh);
  const colRID = map["RAMAL_ID"];
  if (!colRID) return false;

  const last = sh.getLastRow();
  if (last < 2) return false;

  const rid = String(ramalId || "").trim();
  if (!rid) return false;

  const lastCol = sh.getLastColumn();
  const data = sh.getRange(2, 1, last - 1, lastCol).getValues();
  let rowIndex = -1;
  let rowData = null;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][colRID - 1] || "").trim() === rid) {
      rowIndex = i + 2;
      rowData = data[i];
      break;
    }
  }
  if (!rowData) return false;

  if (map["ESTADO_GENERAL"] && patch?.estado_general != null) {
    rowData[map["ESTADO_GENERAL"] - 1] = String(patch.estado_general).trim().toUpperCase();
  }
  if (map["OBSERVACIONES"] && patch?.observaciones != null) {
    rowData[map["OBSERVACIONES"] - 1] = String(patch.observaciones);
  }

  sh.getRange(rowIndex, 1, 1, lastCol).setValues([rowData]);
  return true;
}


/***********************
 *  3d) CALIDAD1: ensure calidadId por VIN (crea en CALIDAD1)
 ***********************/
function ensureCalidadId_(vin) {
  const vinN = normalizeVin_(vin);
  if (!vinN) throw new Error("VIN vacío.");

  const ckey = `VIN2QID_${vinN}`;
  const cached = cache_().get(ckey);
  if (cached) return cached;

  const sh = sh_(SHEETS.CALIDAD);
  const map = headersMap_(sh);

  const colQID = map["CALIDAD_ID"];
  const colVIN = map["CHASIS_ID"];
  const colCRE = map["FECHA_CREACION"];
  const colEST = map["ESTADO_GENERAL"];
  const colOBS = map["OBSERVACIONES"];

  if (!colQID || !colVIN) {
    throw new Error('CALIDAD1 debe tener columnas "CALIDAD_ID" y "CHASIS_ID".');
  }

  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (const row of data) {
      if (normalizeVin_(row[colVIN - 1]) === vinN) {
        const qid = String(row[colQID - 1] || "").trim();
        if (qid) {
          cache_().put(ckey, qid, 600);
          return qid;
        }
      }
    }
  }

  const newId = uuid_();
  const rowToAppend = Array(sh.getLastColumn()).fill("");

  rowToAppend[colQID - 1] = newId;
  rowToAppend[colVIN - 1] = vinN;
  if (colCRE) rowToAppend[colCRE - 1] = now_();
  if (colEST) rowToAppend[colEST - 1] = "PENDIENTE";
  if (colOBS) rowToAppend[colOBS - 1] = "";

  const nextRowQ = sh.getLastRow() + 1;
  sh.getRange(nextRowQ, 1, 1, rowToAppend.length).setValues([rowToAppend]);

  cache_().put(ckey, newId, 600);
  return newId;
}

/***********************
 *  3f) RAMALERO1: crear RAMAL_ID por INICIO (sin VIN)
 ***********************/
function normalizeTipoRamal_(t) {
  return String(t || "").trim().toUpperCase();
}

function createRamalId_(userId, tipoRamal) {
  const tipo = normalizeTipoRamal_(tipoRamal);
  if (!tipo) throw new Error("tipoRamal requerido (JETOUR, VOLKSWAGEN, KYC V3, KYC V5, KYC V7, KYC X5).");

  const sh = sh_(SHEETS.RAMAL);
  const map = headersMap_(sh);

  const colRID = map["RAMAL_ID"];
  const colUID = map["USER_ID"];
  const colTIP = map["TIPO_RAMAL"];
  const colCRE = map["FECHA_CREACION"];
  const colEST = map["ESTADO_GENERAL"];
  const colOBS = map["OBSERVACIONES"];

  if (!colRID || !colUID || !colTIP) {
    throw new Error('RAMALERO1 requiere headers: RAMAL_ID, USER_ID, TIPO_RAMAL (fila 1).');
  }

  const ramalId = uuid_();
  const row = Array(sh.getLastColumn()).fill("");

  row[colRID - 1] = ramalId;
  row[colUID - 1] = String(userId || "").trim();
  row[colTIP - 1] = tipo;
  if (colCRE) row[colCRE - 1] = now_();
  if (colEST) row[colEST - 1] = "PENDIENTE";
  if (colOBS) row[colOBS - 1] = "";

  const nextRowR = sh.getLastRow() + 1;
  sh.getRange(nextRowR, 1, 1, row.length).setValues([row]);
  return ramalId;
}

/***********************
 *  3b) REGLA: al entrar a CALIDAD, si existe OT MOTOR/TANQUE -> CONV121 FINALIZADO
 *  (pero sin crear CONV121 si no existe)
 ***********************/
function hasOtMotorOrTanque_(conversionId) {
  const shA = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(shA);
  const aCID = hA["CONVERSION_ID"];
  const aROL = hA["ROL_TRABAJO"];
  if (!aCID || !aROL) return false;

  const last = shA.getLastRow();
  if (last < 2) return false;

  const cidN = String(conversionId || "").trim();
  const data = shA.getRange(2, 1, last - 1, shA.getLastColumn()).getValues();
  for (const r of data) {
    if (String(r[aCID - 1] || "").trim() !== cidN) continue;
    const rol = String(r[aROL - 1] || "").trim().toUpperCase();
    if (rol === "MOTOR" || rol === "TANQUE") return true;
  }
  return false;
}

function setConvEstadoGeneral_(conversionId, estadoGeneral) {
  const shC = sh_(SHEETS.CONV);
  const hC = headersMap_(shC);
  const colCID = hC["CONVERSION_ID"];
  const colEST = hC["ESTADO_GENERAL"];
  if (!colCID || !colEST) return false;

  const last = shC.getLastRow();
  if (last < 2) return false;

  const cidN = String(conversionId || "").trim();
  const data = shC.getRange(2, 1, last - 1, shC.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][colCID - 1] || "").trim() === cidN) {
      shC.getRange(i + 2, colEST).setValue(String(estadoGeneral || "").trim().toUpperCase());
      return true;
    }
  }
  return false;
}

function maybeFinalizeConvOnCalidadOpenByVin_(vin) {
  const cid = findConversionIdByVin_(vin);
  if (!cid) return false;
  if (!hasOtMotorOrTanque_(cid)) return false;
  return setConvEstadoGeneral_(cid, "FINALIZADO");
}

/***********************
 *  4) ASIGNACIONES: ensure active assignment + rowIndex
 ***********************/
function ensureActiveAssignment_(workId, userId, roleTrabajo) {
  const sh = sh_(SHEETS.ASSIGN);
  const map = headersMap_(sh);

  const required = [
    "ASIGNACION_ID", "CONVERSION_ID", "USER_ID", "ROL_TRABAJO", "ACTIVO", "FECHA_ASIGNACION",
    "TIEMPO_TRAB_MS", "TIEMPO_TRAB", "ESTADO_ACTUAL", "UPDATED_AT",
    "RUNNING_SINCE", "LAST_NOTA", "LAST_NOTA_TS"
  ];
  const missing = required.filter(k => !map[k]);
  if (missing.length) throw new Error(`ASIGNACIONES: faltan headers: ${missing.join(", ")} (fila 1).`);

  const colCID = map["CONVERSION_ID"];
  const colUID = map["USER_ID"];
  const colROL = map["ROL_TRABAJO"];
  const colACT = map["ACTIVO"];

  const roleN = normalizeRole_(roleTrabajo);
  const widN = String(workId || "").trim();
  const uidN = String(userId || "").trim();

  const lastRow = sh.getLastRow();
  let activeRowIndex = null;
  let activeUid = null;

  if (lastRow >= 2) {
    const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (String(row[colCID - 1] || "").trim() !== widN) continue;
      const rol = normalizeRole_(row[colROL - 1]);
      const act = String(row[colACT - 1] || "").toUpperCase() === "TRUE";
      if (rol === roleN && act) {
        activeRowIndex = i + 2;
        activeUid = String(row[colUID - 1] || "").trim();
        break;
      }
    }
  }

  if (activeRowIndex && activeUid === uidN) {
    return { created: false, rowIndex: activeRowIndex };
  }

  if (activeRowIndex && activeUid && activeUid !== uidN) {
    if (isExclusiveRole_(roleN)) {
      const ownerName = getUserNameById_(activeUid) || activeUid;
      throw new Error(`OT ya está asignada a otro usuario (${ownerName}). No puedes tomarla en ${roleN}.`);
    }
    sh.getRange(activeRowIndex, colACT).setValue(false);
  }

  const newAId = uuid_();
  const rowToAppend = Array(sh.getLastColumn()).fill("");
  const now = now_();

  rowToAppend[map["ASIGNACION_ID"] - 1] = newAId;
  rowToAppend[map["CONVERSION_ID"] - 1] = widN;
  rowToAppend[map["USER_ID"] - 1] = uidN;
  rowToAppend[map["ROL_TRABAJO"] - 1] = roleN;
  rowToAppend[map["ACTIVO"] - 1] = true;
  rowToAppend[map["FECHA_ASIGNACION"] - 1] = now;
  rowToAppend[map["TIEMPO_TRAB_MS"] - 1] = 0;
  rowToAppend[map["TIEMPO_TRAB"] - 1] = fmtHMS_(0);
  rowToAppend[map["ESTADO_ACTUAL"] - 1] = "SIN_INICIAR";
  rowToAppend[map["UPDATED_AT"] - 1] = now;
  rowToAppend[map["RUNNING_SINCE"] - 1] = "";
  rowToAppend[map["LAST_NOTA"] - 1] = "";
  rowToAppend[map["LAST_NOTA_TS"] - 1] = "";

  const nextRowA = sh.getLastRow() + 1;
  sh.getRange(nextRowA, 1, 1, rowToAppend.length).setValues([rowToAppend]);

  return { created: true, asignacionId: newAId, rowIndex: nextRowA };
}

/***********************
 *  5) EVENTOS: auditoría
 ***********************/
function insertEvent_(userId, workId, roleTrabajo, accion, nota) {
  const sh = sh_(SHEETS.EVENTS);
  const map = headersMap_(sh);

  const colEID = map["EVENTO_ID"];
  const colTS = map["TIMESTAMP"];
  const colUID = map["USER_ID"];
  const colCID = map["CONVERSION_ID"];
  const colROL = map["ROL_TRABAJO"];
  const colACC = map["ACCION"];
  const colNOT = map["NOTA"];

  if (!colEID || !colTS || !colUID || !colCID || !colROL || !colACC) {
    throw new Error('MARCA_EVENTOS debe tener headers: EVENTO_ID, TIMESTAMP, USER_ID, CONVERSION_ID, ROL_TRABAJO, ACCION.');
  }

  const rowToAppend = Array(sh.getLastColumn()).fill("");
  rowToAppend[colEID - 1] = uuid_();
  rowToAppend[colTS - 1] = now_();
  rowToAppend[colUID - 1] = userId;
  rowToAppend[colCID - 1] = String(workId).trim();
  rowToAppend[colROL - 1] = normalizeRole_(roleTrabajo);
  rowToAppend[colACC - 1] = normalizeAction_(accion);
  if (colNOT) rowToAppend[colNOT - 1] = String(nota || "");

  const nextRowE = sh.getLastRow() + 1;
  sh.getRange(nextRowE, 1, 1, rowToAppend.length).setValues([rowToAppend]);

  return rowToAppend[colEID - 1];
}

/***********************
 *  6) Validación por ESTADO_ACTUAL
 ***********************/
function validateNextActionByEstado_(estadoActual, nextAction) {
  const e = String(estadoActual || "SIN_INICIAR").toUpperCase();
  const next = normalizeAction_(nextAction);

  if (next === "NOTA") return;

  if (e === "SIN_INICIAR") {
    if (next !== "INICIO") throw new Error("Primera acción debe ser INICIO.");
    return;
  }
  if (e === "TRABAJANDO") {
    if (next !== "PAUSA" && next !== "FIN") throw new Error("Desde TRABAJANDO solo puedes PAUSA o FIN.");
    return;
  }
  if (e === "PAUSADO") {
    if (next !== "REANUDAR" && next !== "FIN") throw new Error("Desde PAUSADO solo puedes REANUDAR o FIN.");
    return;
  }
  if (e === "FINALIZADO") {
    throw new Error("Ya finalizado. No se puede registrar más acciones para este VIN y rol.");
  }
  throw new Error("Estado inválido.");
}

/***********************
 *  7) Aplicar transición + tiempo en fila ASIGNACIONES
 ***********************/
function applyActionToAssignmentRow_(row, cols, accion, nota) {
  const colMS = cols["TIEMPO_TRAB_MS"] - 1;
  const colTXT = cols["TIEMPO_TRAB"] - 1;
  const colEST = cols["ESTADO_ACTUAL"] - 1;
  const colUPD = cols["UPDATED_AT"] - 1;
  const colRUN = cols["RUNNING_SINCE"] - 1;
  const colLN = cols["LAST_NOTA"] - 1;
  const colLTS = cols["LAST_NOTA_TS"] - 1;

  const now = now_();
  const next = normalizeAction_(accion);

  let ms = Number(row[colMS] || 0);
  let estado = String(row[colEST] || "SIN_INICIAR").toUpperCase();
  let runningSince = row[colRUN] instanceof Date ? row[colRUN] : null;

  validateNextActionByEstado_(estado, next);

  if (next === "NOTA") {
    row[colLN] = String(nota || "");
    row[colLTS] = now;
    row[colUPD] = now;
    return row;
  }

  function closeRunning_(endDate) {
    if (runningSince instanceof Date) {
      ms += Math.max(0, endDate.getTime() - runningSince.getTime());
      runningSince = null;
    }
  }

  if (next === "INICIO") {
    estado = "TRABAJANDO";
    runningSince = now;
  } else if (next === "REANUDAR") {
    estado = "TRABAJANDO";
    runningSince = now;
  } else if (next === "PAUSA") {
    closeRunning_(now);
    estado = "PAUSADO";
  } else if (next === "FIN") {
    closeRunning_(now);
    estado = "FINALIZADO";
  }

  row[colMS] = ms;
  row[colTXT] = fmtHMS_(ms);
  row[colEST] = estado;
  row[colRUN] = runningSince ? runningSince : "";
  row[colUPD] = now;

  return row;
}

/***********************
 *  8) Update CONV121 ESTADO_GENERAL desde ASIGNACIONES (solo MOTOR/TANQUE)
 ***********************/
function updateConversionStatusFromAssignments_(conversionId) {
  const cidN = String(conversionId || "").trim();
  if (!cidN) return;

  const shC = sh_(SHEETS.CONV);
  const hC = headersMap_(shC);
  const colCID_C = hC["CONVERSION_ID"];
  const colEST_C = hC["ESTADO_GENERAL"];
  if (!colCID_C || !colEST_C) return;

  const lastC = shC.getLastRow();
  if (lastC < 2) return;

  const dataC = shC.getRange(2, 1, lastC - 1, shC.getLastColumn()).getValues();
  let convRowIndex = -1;
  let currentEst = "";
  for (let i = 0; i < dataC.length; i++) {
    if (String(dataC[i][colCID_C - 1] || "").trim() === cidN) {
      convRowIndex = i + 2;
      currentEst = String(dataC[i][colEST_C - 1] || "").trim().toUpperCase();
      break;
    }
  }
  if (convRowIndex < 0) return;
  if (currentEst === "FINALIZADO") return;

  const shA = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(shA);
  const aCID = hA["CONVERSION_ID"];
  const aROL = hA["ROL_TRABAJO"];
  const aEST = hA["ESTADO_ACTUAL"];
  const aACT = hA["ACTIVO"];
  if (!aCID || !aROL || !aEST || !aACT) return;

  let motor = null, tanque = null;
  const lastA = shA.getLastRow();
  if (lastA >= 2) {
    const dataA = shA.getRange(2, 1, lastA - 1, shA.getLastColumn()).getValues();
    for (const row of dataA) {
      if (String(row[aCID - 1] || "").trim() !== cidN) continue;
      if (String(row[aACT - 1] || "").toUpperCase() !== "TRUE") continue;
      const rol = String(row[aROL - 1] || "").trim().toUpperCase();
      const est = String(row[aEST - 1] || "").trim().toUpperCase();
      if (rol === "MOTOR") motor = est;
      if (rol === "TANQUE") tanque = est;
    }
  }

  const any = motor || tanque;
  const estadoGeneral = !any ? "PENDIENTE"
    : (motor === "FINALIZADO" && tanque === "FINALIZADO") ? "FINALIZADO"
    : "EN PROCESO";

  shC.getRange(convRowIndex, colEST_C).setValue(estadoGeneral);
}


/***********************
 *  9) API: evento (rápido) — SOPORTA RAMALERO
 ***********************/
function registrarEvento_fast_(params) {
  const email = String(params.email || "").trim().toLowerCase();
  const rolTrabajo = normalizeRole_(params.rolTrabajo);
  const accion = normalizeAction_(params.accion);
  const nota = params.nota;

  if (!ALLOWED_ROLES.has(rolTrabajo)) {
    throw new Error("ROL_TRABAJO inválido.");
  }
  if (!ALLOWED_ACTIONS.has(accion)) {
    throw new Error("ACCION inválida.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    const profile = params.userId
      ? { userId: String(params.userId).trim(), email }
      : getUserProfileByEmail_(email);

    const userId = profile.userId;

    let workId = "";
    let vin = "";

    if (rolTrabajo === "RAMALERO") {
      const provided = String(params.conversionId || "").trim();

      if (!provided) {
        if (accion !== "INICIO") {
          throw new Error("RAMALERO: sin conversionId solo se permite INICIO.");
        }
        const tipoRamal = String(params.tipoRamal || "").trim();
        workId = createRamalId_(userId, tipoRamal);
      } else {
        workId = provided;
      }

    } else if (rolTrabajo === "CALIDAD") {
      vin = normalizeVin_(params.vin);
      if (!vin) throw new Error("VIN requerido.");
      if (!vinExistsInList_(vin)) throw new Error("VIN no existe.");

      workId = ensureCalidadId_(vin);
      maybeFinalizeConvOnCalidadOpenByVin_(vin);

    } else {
      vin = normalizeVin_(params.vin);
      if (!vin) throw new Error("VIN requerido.");
      if (!vinExistsInList_(vin)) throw new Error("VIN no existe.");

      workId = ensureConversionId_(vin);
    }

    const asg = ensureActiveAssignment_(workId, userId, rolTrabajo);

    const shA = sh_(SHEETS.ASSIGN);
    const hA = headersMap_(shA);

    const rowIndex = asg.rowIndex;
    const row = shA.getRange(rowIndex, 1, 1, shA.getLastColumn()).getValues()[0];

    const row2 = applyActionToAssignmentRow_(row, hA, accion, nota);
    shA.getRange(rowIndex, 1, 1, shA.getLastColumn()).setValues([row2]);

    const eventoId = insertEvent_(userId, workId, rolTrabajo, accion, nota);

    if (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE") {
      updateConversionStatusFromAssignments_(workId);
    }

    if (rolTrabajo === "CALIDAD") {
      const estadoNow = String(row2[hA["ESTADO_ACTUAL"] - 1] || "").toUpperCase();
      const obs = (accion === "NOTA") ? String(nota || "") : null;
      updateCalidadRow_(workId, { estado_general: estadoNow, observaciones: obs });
    }

    if (rolTrabajo === "RAMALERO") {
      const estadoNow = String(row2[hA["ESTADO_ACTUAL"] - 1] || "").toUpperCase();
      const obs = (accion === "NOTA") ? String(nota || "") : null;
      updateRamalRow_(workId, { estado_general: estadoNow, observaciones: obs });
    }

    const rev = bumpRev_();

    const fa = row2[hA["FECHA_ASIGNACION"] - 1];
    const faIso = toIso_(fa);

    // ✅ Usar maps fusionados en vez de getAsignadoByVin_ individual
    const maps = buildAllMaps_();
    const asgVin = (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE")
      ? (maps.asgByVin[vin] || { tanque: "", reductor: "" })
      : { tanque: "", reductor: "" };

    return {
      ok: true,
      rev,
      eventoId,
      conversionId: workId,
      created_at: faIso,
      fecha_inicio: faIso,
      fecha_asignacion: faIso,
      tanque_asignado: asgVin.tanque || "",
      reductor_asignado: asgVin.reductor || "",
      userId,
      vin,
      rolTrabajo,
      accion,
      estado: String(row2[hA["ESTADO_ACTUAL"] - 1] || ""),
      tiempo_ms: Number(row2[hA["TIEMPO_TRAB_MS"] - 1] || 0),
      running_since: toIso_(row2[hA["RUNNING_SINCE"] - 1]),
      last_nota: String(row2[hA["LAST_NOTA"] - 1] || ""),
      last_nota_ts: toIso_(row2[hA["LAST_NOTA_TS"] - 1]),
      updated_at: toIso_(row2[hA["UPDATED_AT"] - 1]),
    };

  } finally {
    lock.releaseLock();
  }
}


/***********************
 *  10) MIS ACTIVAS: mapeo workId -> meta (vin/tipo)
 *  ✅ OPTIMIZADO: buildAllMaps_ fusiona 3 maps en 1 lectura por hoja
 ***********************/
let _allMapsCache_ = null;

function buildAllMaps_() {
  if (_allMapsCache_) return _allMapsCache_;

  const key = "ALL_MAPS_V2";
  const cached = cacheGetJson_(key);
  if (cached && cached.t && (Date.now() - cached.t) < 60000 && cached.meta) {
    _allMapsCache_ = { meta: cached.meta, asgByVin: cached.asgByVin, regByCid: cached.regByCid };
    return _allMapsCache_;
  }

  const meta = {};
  const asgByVin = {};
  const regByCid = {};

  function isoOrNull_(x) {
    return (x instanceof Date && !isNaN(x.getTime())) ? x.toISOString() : null;
  }

  // ── CONV121: 1 lectura → meta + asgByVin + regByCid ──
  try {
    const shC = sh_(SHEETS.CONV);
    const hC = headersMap_(shC);
    const cCID = hC["CONVERSION_ID"];
    const cVIN = hC["CHASIS_ID"];
    const cCRE = hC["FECHA_CREACION"];
    const cTanA = hC["TANQUE_ASIGNADO"] || hC["TANQUE_REGISTRADO"] || hC["TANQUE"];
    const cRedA = hC["REDUCTOR_ASIGNADO"] || hC["REDUCTOR_REGISTRADO"] || hC["REDUCTOR"];
    const cTanR = hC["TANQUE_REGISTRADO"];
    const cRedR = hC["REDUCTOR_REGISTRADO"];

    if (cCID && cVIN) {
      const last = shC.getLastRow();
      if (last >= 2) {
        const data = shC.getRange(2, 1, last - 1, shC.getLastColumn()).getValues();
        for (const row of data) {
          const id = String(row[cCID - 1] || "").trim();
          if (!id) continue;
          const vin = String(row[cVIN - 1] || "").trim().toUpperCase();

          meta[id] = {
            vin,
            tipoRamal: "",
            fechaCreacion: cCRE ? isoOrNull_(row[cCRE - 1]) : null,
          };

          if (vin) {
            asgByVin[vin] = {
              tanque: cTanA ? String(row[cTanA - 1] || "").trim() : "",
              reductor: cRedA ? String(row[cRedA - 1] || "").trim() : "",
            };
          }

          if (cTanR || cRedR) {
            regByCid[id] = {
              tanque_registrado: cTanR ? String(row[cTanR - 1] || "").trim() : "",
              reductor_registrado: cRedR ? String(row[cRedR - 1] || "").trim() : "",
            };
          }
        }
      }
    }
  } catch {}

  // ── CALIDAD1: 1 lectura → meta + regByCid ──
  try {
    const shQ = sh_(SHEETS.CALIDAD);
    const hQ = headersMap_(shQ);
    const qID = hQ["CALIDAD_ID"];
    const qVIN = hQ["CHASIS_ID"];
    const qCRE = hQ["FECHA_CREACION"];
    const qTanR = hQ["TANQUE_REGISTRADO"];
    const qRedR = hQ["REDUCTOR_REGISTRADO"];

    if (qID && qVIN) {
      const last = shQ.getLastRow();
      if (last >= 2) {
        const data = shQ.getRange(2, 1, last - 1, shQ.getLastColumn()).getValues();
        for (const row of data) {
          const id = String(row[qID - 1] || "").trim();
          if (!id) continue;
          meta[id] = {
            vin: String(row[qVIN - 1] || "").trim().toUpperCase(),
            tipoRamal: "",
            fechaCreacion: qCRE ? isoOrNull_(row[qCRE - 1]) : null,
          };
          if ((qTanR || qRedR)) {
            regByCid[id] = {
              tanque_registrado: qTanR ? String(row[qTanR - 1] || "").trim() : "",
              reductor_registrado: qRedR ? String(row[qRedR - 1] || "").trim() : "",
            };
          }
        }
      }
    }
  } catch {}

  // ── RAMALERO1: 1 lectura → meta ──
  try {
    const shR = sh_(SHEETS.RAMAL);
    const hR = headersMap_(shR);
    const rID = hR["RAMAL_ID"];
    const rTIP = hR["TIPO_RAMAL"];
    const rCRE = hR["FECHA_CREACION"];
    if (rID && rTIP) {
      const last = shR.getLastRow();
      if (last >= 2) {
        const data = shR.getRange(2, 1, last - 1, shR.getLastColumn()).getValues();
        for (const row of data) {
          const id = String(row[rID - 1] || "").trim();
          if (!id) continue;
          meta[id] = {
            vin: "",
            tipoRamal: String(row[rTIP - 1] || "").trim().toUpperCase(),
            fechaCreacion: rCRE ? isoOrNull_(row[rCRE - 1]) : null,
          };
        }
      }
    }
  } catch {}

  _allMapsCache_ = { meta, asgByVin, regByCid };
  cachePutJson_(key, { t: Date.now(), meta, asgByVin, regByCid }, 60);
  return _allMapsCache_;
}

// Backwards-compatible wrappers
function buildWorkIdMetaMap_() { return buildAllMaps_().meta; }
function buildAsignadoByVinMap_() { return buildAllMaps_().asgByVin; }
function buildRegistradoByConversionIdMap_() { return buildAllMaps_().regByCid; }

function api_misActivas_fast_(profile, opts) {
  const excludeFin = !!(opts && opts.excludeFinalizados);
  const onlyFin    = !!(opts && opts.onlyFinalizados);
  const userId = String(profile.userId || "").trim();
  if (!userId) return { ok: false, error: "Profile sin userId." };

  const shA = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(shA);

  const need = [
    "CONVERSION_ID", "USER_ID", "ROL_TRABAJO", "ACTIVO",
    "TIEMPO_TRAB_MS", "ESTADO_ACTUAL", "UPDATED_AT",
    "RUNNING_SINCE", "LAST_NOTA", "LAST_NOTA_TS", "FECHA_ASIGNACION"
  ];
  for (const k of need) {
    if (!hA[k]) return { ok: false, error: `ASIGNACIONES: falta header ${k}.` };
  }

  const meta = buildWorkIdMetaMap_();
  const asgByVin = buildAsignadoByVinMap_();
  const regByCid = buildRegistradoByConversionIdMap_();

  const lastRow = shA.getLastRow();
  if (lastRow < 2) return { ok: true, profile, items: [] };

  const data = shA.getRange(2, 1, lastRow - 1, shA.getLastColumn()).getValues();

  const iCID = hA["CONVERSION_ID"] - 1;
  const iUID = hA["USER_ID"] - 1;
  const iROL = hA["ROL_TRABAJO"] - 1;
  const iACT = hA["ACTIVO"] - 1;
  const iMS  = hA["TIEMPO_TRAB_MS"] - 1;
  const iEST = hA["ESTADO_ACTUAL"] - 1;
  const iUPD = hA["UPDATED_AT"] - 1;
  const iRUN = hA["RUNNING_SINCE"] - 1;
  const iLNO = hA["LAST_NOTA"] - 1;
  const iLTS = hA["LAST_NOTA_TS"] - 1;
  const iFAS = hA["FECHA_ASIGNACION"] - 1;

  const items = [];
  const seen = new Set();

  // más reciente primero
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];

    if (String(row[iUID] || "").trim() !== userId) continue;
    if (row[iACT] !== true) continue;

    const workId = String(row[iCID] || "").trim();
    const rol = String(row[iROL] || "").trim().toUpperCase();
    if (!workId || !rol) continue;

    const key = workId + "|" + rol;
    if (seen.has(key)) continue;
    seen.add(key);

    const estado = String(row[iEST] || "").trim().toUpperCase();

    // Filtrar por estado según flags
    if (excludeFin && estado === "FINALIZADO") continue;
    if (onlyFin && estado !== "FINALIZADO") continue;

    const baseMs = Number(row[iMS] || 0);

    const run = row[iRUN];
    const upd = row[iUPD];
    const lts = row[iLTS];
    const fas = row[iFAS];

    const metaIt = meta[workId] || {};
    const vin = String(metaIt.vin || "").trim().toUpperCase();

    const asgVin = vin ? (asgByVin[vin] || EMPTY_ASG_) : EMPTY_ASG_;
    const reg = (rol === "MOTOR" || rol === "TANQUE")
      ? (regByCid[workId] || EMPTY_REG_)
      : EMPTY_REG_;

    const faIso = toIso_(fas);

    items.push({
      conversionId: workId,
      vin,
      tipoRamal: metaIt.tipoRamal || "",
      created_at: faIso,
      fecha_inicio: faIso,
      fecha_creacion: metaIt.fechaCreacion || null,
      rolTrabajo: rol,
      estado,
      tanque_asignado: asgVin.tanque || "",
      reductor_asignado: asgVin.reductor || "",
      tanque_registrado: reg.tanque_registrado || "",
      reductor_registrado: reg.reductor_registrado || "",
      tiempo_ms: baseMs,
      running_since: run instanceof Date ? run.toISOString() : null,
      last_nota: String(row[iLNO] || ""),
      last_nota_ts: lts instanceof Date ? lts.toISOString() : null,
      updated_at: upd instanceof Date ? upd.toISOString() : null,
      fecha_asignacion: faIso,
    });
  }

  return { ok: true, profile, items };
}

const EMPTY_ASG_ = Object.freeze({ tanque: "", reductor: "" });
const EMPTY_REG_ = Object.freeze({ tanque_registrado: "", reductor_registrado: "" });

/***********************
 *  11) ESTADO: soporta RAMALERO
 *  ✅ OPTIMIZADO: fast-path sin lock para asignaciones existentes
 ***********************/
function findActiveAssignmentRow_(workId, userId, roleTrabajo) {
  const sh = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(sh);
  const colCID = hA["CONVERSION_ID"];
  const colUID = hA["USER_ID"];
  const colROL = hA["ROL_TRABAJO"];
  const colACT = hA["ACTIVO"];
  if (!colCID || !colUID || !colROL || !colACT) return null;

  const widN = String(workId || "").trim();
  const uidN = String(userId || "").trim();
  const roleN = normalizeRole_(roleTrabajo);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[colCID - 1] || "").trim() !== widN) continue;
    const rol = normalizeRole_(row[colROL - 1]);
    const act = String(row[colACT - 1] || "").toUpperCase() === "TRUE";
    const uid = String(row[colUID - 1] || "").trim();
    if (rol === roleN && act && uid === uidN) {
      return { rowIndex: i + 2, rowData: row };
    }
  }
  return null;
}

function api_estado_fast_(payload) {
  const email = String(payload.email || "").trim().toLowerCase();
  const rolTrabajo = normalizeRole_(payload.rolTrabajo);

  if (!ALLOWED_ROLES.has(rolTrabajo)) {
    return { ok: false, error: "ROL inválido." };
  }

  const profile = payload.userId
    ? { userId: String(payload.userId).trim(), email }
    : getUserProfileByEmail_(email);

  const userId = profile.userId;

  let workId = "";
  let vin = "";

  if (rolTrabajo === "RAMALERO") {
    workId = String(payload.conversionId || "").trim();
    if (!workId) return { ok: false, error: "RAMALERO requiere conversionId." };

  } else if (rolTrabajo === "CALIDAD") {
    vin = normalizeVin_(payload.vin);
    if (!vin || !vinExistsInList_(vin)) return { ok: false, error: "VIN inválido." };
    workId = findConversionIdByVin_(vin) ? ensureCalidadId_(vin) : null;
    if (!workId) workId = ensureCalidadId_(vin);

  } else {
    vin = normalizeVin_(payload.vin);
    if (!vin || !vinExistsInList_(vin)) return { ok: false, error: "VIN inválido." };
    workId = findConversionIdByVin_(vin) || ensureConversionId_(vin);
  }

  // ✅ Fast path: buscar asignación existente SIN lock
  const existing = findActiveAssignmentRow_(workId, userId, rolTrabajo);
  let row;
  if (existing) {
    row = existing.rowData;
  } else {
    // Slow path: necesitamos crear asignación → lock
    const lock = LockService.getScriptLock();
    lock.waitLock(8000);
    try {
      if (rolTrabajo === "CALIDAD") {
        maybeFinalizeConvOnCalidadOpenByVin_(vin);
      }
      const asg = ensureActiveAssignment_(workId, userId, rolTrabajo);
      const shA = sh_(SHEETS.ASSIGN);
      row = shA.getRange(asg.rowIndex, 1, 1, shA.getLastColumn()).getValues()[0];
    } finally {
      lock.releaseLock();
    }
  }

  const hA = headersMap_(sh_(SHEETS.ASSIGN));
  const estado = String(row[hA["ESTADO_ACTUAL"] - 1] || "").toUpperCase();
  const baseMs = Number(row[hA["TIEMPO_TRAB_MS"] - 1] || 0);
  const run = row[hA["RUNNING_SINCE"] - 1] instanceof Date ? row[hA["RUNNING_SINCE"] - 1] : null;

  const fa = row[hA["FECHA_ASIGNACION"] - 1];
  const faIso = toIso_(fa);

  // ✅ Usar maps fusionados en vez de llamadas individuales
  const maps = buildAllMaps_();
  const asgVin = (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE")
    ? (maps.asgByVin[vin] || { tanque: "", reductor: "" })
    : { tanque: "", reductor: "" };

  const reg = (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE")
    ? (maps.regByCid[workId] || { tanque_registrado: "", reductor_registrado: "" })
    : { tanque_registrado: "", reductor_registrado: "" };

  return {
    ok: true,
    profile,
    vin,
    rolTrabajo,
    conversionId: workId,
    userId,
    estado,

    tanque_asignado: asgVin.tanque || "",
    reductor_asignado: asgVin.reductor || "",

    tanque_registrado: reg.tanque_registrado || "",
    reductor_registrado: reg.reductor_registrado || "",

    created_at: faIso,
    fecha_inicio: faIso,
    fecha_asignacion: faIso,

    tiempo_ms: baseMs,
    tiempo_hms: fmtHMS_(baseMs),

    running_since: run ? run.toISOString() : null,
    last_nota: String(row[hA["LAST_NOTA"] - 1] || ""),
    last_nota_ts: toIso_(row[hA["LAST_NOTA_TS"] - 1]),
    updated_at: toIso_(row[hA["UPDATED_AT"] - 1]),
  };
}

/***********************
 *  12) SYNC: snapshot + delta (AppSheet-style)
 ***********************/
function parseSince_(sinceRaw) {
  if (!sinceRaw) return null;

  const s = String(sinceRaw).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!isNaN(n) && n > 0) return new Date(n);
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function api_sync_(payload) {
  const t0 = Date.now();
  let prev = t0;

  function lap(label) {
    const now = Date.now();
    Logger.log(`[api_sync_] ${label} | +${now - prev} ms | total ${now - t0} ms`);
    prev = now;
  }

  // Flush server caches if user requested a hard refresh
  if (payload.forceRefresh) {
    _allMapsCache_ = null;
    try { cache_().removeAll(["ALL_MAPS_V2", "WORKID2META", "ASG_BY_VIN", "REG_BY_CID"]); } catch (e) {}
    lap("forceRefresh: caches cleared");
  }

  const email = String(payload.email || "").trim().toLowerCase();
  lap("email parseado");

  if (!email) return { ok: false, error: "Falta email." };

  const profile = getUserProfileByEmail_(email);
  lap("getUserProfileByEmail_");

  const since = parseSince_(payload.since);
  const full = !since;
  lap("parseSince_");

  const excludeFinalizados = !!(payload.excludeFinalizados);
  const base = api_misActivas_fast_(profile, { excludeFinalizados });
  lap("api_misActivas_fast_");

  if (!base.ok) return base;

  let items = base.items || [];
  lap("items base");

  if (!full && since) {
    const sinceMs = since.getTime();
    items = items.filter(it => {
      const t = it.updated_at ? new Date(it.updated_at) : null;
      return t && !isNaN(t.getTime()) && t.getTime() >= sinceMs;
    });
    lap("filter since");
  }

  const { rev, ts } = getRev_();
  lap("getRev_");

  const out = {
    ok: true,
    profile,
    server_time: new Date().toISOString(),
    rev,
    rev_ts: ts,
    full,
    items,
  };

  lap("respuesta armada");
  return out;
}

/***********************
 *  DEDUPE assignments activos
 ***********************/
function dedupeAssignments_(workId, userId, roleTrabajo) {
  const sh = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(sh);

  const colCID = hA["CONVERSION_ID"],
        colUID = hA["USER_ID"],
        colROL = hA["ROL_TRABAJO"],
        colACT = hA["ACTIVO"];

  const colFAS = hA["FECHA_ASIGNACION"];

  if (!colCID || !colUID || !colROL || !colACT) return;

  const last = sh.getLastRow();
  if (last < 2) return;

  const wid = String(workId || "").trim();
  const uid = String(userId || "").trim();
  const rol = normalizeRole_(roleTrabajo);

  const data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const hits = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[colCID - 1] || "").trim() !== wid) continue;
    if (String(row[colUID - 1] || "").trim() !== uid) continue;
    if (normalizeRole_(row[colROL - 1]) !== rol) continue;
    if (String(row[colACT - 1] || "").toUpperCase() !== "TRUE") continue;
    const fecha = colFAS && row[colFAS - 1] instanceof Date ? row[colFAS - 1].getTime() : 0;
    hits.push({ rowIndex: i + 2, fecha });
  }

  if (hits.length <= 1) return;

  hits.sort((a, b) => (b.fecha - a.fecha) || (b.rowIndex - a.rowIndex));

  const toDeactivate = hits.slice(1);
  for (const h of toDeactivate) {
    sh.getRange(h.rowIndex, colACT).setValue(false);
  }
}