function actualizarListaVinGLP() {
  const ID_ASSA = "1nIx6S0yu0h-56q3yIcV3rrhEfr4pvvD1tvpTb4FpaE4";
  const ID_GLP  = "1J9ibuBGAGvVC6t-VacNQdviTz_GN5WFih_9NDhPtHTQ";

  const SH_ASSA = "AÑO 2025";
  const SH_SEAT = "GLP SEAT";
  const SH_VW   = "GLP VW";

  const ssFinal = SpreadsheetApp.getActiveSpreadsheet();
  const DEST_NAME = "LISTA DE VIN GLP";
  const shDest = ssFinal.getSheetByName(DEST_NAME) || ssFinal.insertSheet(DEST_NAME);

  // Dejar A libre y escribir desde B
  const START_COL = 2; // B
  const NUM_COLS  = 4; // VIN, MODELO, DUA, CLIENTE

  // Encabezados en B1:E1
  if (shDest.getLastRow() === 0) {
    shDest.getRange(1, START_COL, 1, NUM_COLS)
      .setValues([["VIN","MODELO","DUA","CLIENTE"]]);
  }

  // Leer VINs ya guardados (columna B)
  const lastDest = shDest.getLastRow();
  const existingVINs = new Set(
    lastDest >= 2
      ? shDest.getRange(2, START_COL, lastDest - 1, 1).getDisplayValues().flat()
          .map(normalizarVIN_)
          .filter(v => v)
      : []
  );

  // ========= LECTURA POR lastRow (no columnas completas) =========
  // ASSA: VIN=C, MODELO=D, DUA=H, CLIENTE=E
  const assaVIN     = leerColLastRow_(ID_ASSA, SH_ASSA, 3); // C
  const assaModelo  = leerColLastRow_(ID_ASSA, SH_ASSA, 4); // D
  const assaDUA     = leerColLastRow_(ID_ASSA, SH_ASSA, 8); // H
  const assaCliente = leerColLastRow_(ID_ASSA, SH_ASSA, 5); // E

  // GLP SEAT: VIN=A, MODELO=B, DUA=C, CLIENTE=G
  const seatVIN     = leerColLastRow_(ID_GLP, SH_SEAT, 1); // A
  const seatModelo  = leerColLastRow_(ID_GLP, SH_SEAT, 2); // B
  const seatDUA     = leerColLastRow_(ID_GLP, SH_SEAT, 3); // C
  const seatCliente = leerColLastRow_(ID_GLP, SH_SEAT, 7); // G

  // GLP VW: VIN=A, MODELO=B, DUA=C, CLIENTE=G
  const vwVIN       = leerColLastRow_(ID_GLP, SH_VW, 1); // A
  const vwModelo    = leerColLastRow_(ID_GLP, SH_VW, 2); // B
  const vwDUA       = leerColLastRow_(ID_GLP, SH_VW, 3); // C
  const vwCliente   = leerColLastRow_(ID_GLP, SH_VW, 7); // G

  // Armar filas [VIN, MODELO, DUA, CLIENTE]
  const filas = [];
  pushFilas_(filas, assaVIN, assaModelo, assaDUA, assaCliente);
  pushFilas_(filas, seatVIN, seatModelo, seatDUA, seatCliente);
  pushFilas_(filas, vwVIN, vwModelo, vwDUA, vwCliente);

  // Deduplicar por VIN (primera aparición)
  const seen = new Set();
  const unicos = [];
  for (const r of filas) {
    const key = normalizarVIN_(r[0]);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      unicos.push(r);
    }
  }

  // Append solo VIN nuevos vs destino
  const nuevos = unicos.filter(r => !existingVINs.has(normalizarVIN_(r[0])));

  if (nuevos.length > 0) {
    shDest.getRange(shDest.getLastRow() + 1, START_COL, nuevos.length, NUM_COLS)
      .setValues(nuevos);
  }
}


// ---------- Helpers ----------
function leerColLastRow_(spreadsheetId, sheetName, colIndex) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sh = ss.getSheetByName(sheetName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2, colIndex, lastRow - 1, 1).getDisplayValues().flat();
}

function pushFilas_(out, vinArr, modeloArr, duaArr, clienteArr) {
  const n = Math.max(vinArr.length, modeloArr.length, duaArr.length, clienteArr.length);
  for (let i = 0; i < n; i++) {
    const vinRaw = (vinArr[i] ?? "").toString();
    const vinKey = normalizarVIN_(vinRaw);
    if (!vinKey) continue;

    out.push([
      vinRaw.trim(),
      (modeloArr[i] ?? "").toString().trim(),
      (duaArr[i] ?? "").toString().trim(),
      (clienteArr[i] ?? "").toString().trim()
    ]);
  }
}

function normalizarVIN_(v) {
  if (v === null || v === undefined) return "";
  // mayúsculas + sin espacios/guiones
  return String(v).toUpperCase().replace(/[\s-]/g, "").trim();
}
