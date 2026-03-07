function matchTanqueReductorPorVIN() {

  /************* CONFIG *************/
  const ID_ASIGNACIONES = "18suk74673GWKKl_B3c32npwuMrbTuCRZ32kp333Mh9I";

  const HOJA_LISTA = "LISTA DE VIN GLP";
  const HOJA_ASIG  = "ENERO 2026"; // ajusta si luego recorres otros meses

  // LISTA DE VIN GLP
  const COL_VIN_LISTA   = 2; // B
  const COL_REDU_LISTA  = 6; // F
  const COL_TANQ_LISTA  = 7; // G
  const START_ROW_LISTA = 2;

  // ASIGNACIONES
  const COL_VIN_ASIG  = 8;  // H (CHASIS / VIN)
  const COL_TANQ_ASIG = 16; // P
  const COL_REDU_ASIG = 19; // S
  const START_ROW_ASIG = 2;
  /*********************************/

  const ssLista = SpreadsheetApp.getActiveSpreadsheet();
  const shLista = ssLista.getSheetByName(HOJA_LISTA);

  const ssAsig = SpreadsheetApp.openById(ID_ASIGNACIONES);
  const shAsig = ssAsig.getSheetByName(HOJA_ASIG);

  if (!shLista || !shAsig) {
    throw new Error("No se encontró alguna hoja");
  }

  // ---------- leer LISTA ----------
  const lastRowLista = shLista.getLastRow();
  const vinsLista = shLista
    .getRange(START_ROW_LISTA, COL_VIN_LISTA, lastRowLista - 1, 1)
    .getValues()
    .map(r => String(r[0]).trim().toUpperCase());

  // ---------- leer ASIGNACIONES ----------
  const lastRowAsig = shAsig.getLastRow();
  const dataAsig = shAsig.getRange(
    START_ROW_ASIG,
    1,
    lastRowAsig - 1,
    shAsig.getLastColumn()
  ).getValues();

  // ---------- mapa VIN → {tanque, reductor} ----------
  const map = {};
  dataAsig.forEach(r => {
    const vin = String(r[COL_VIN_ASIG - 1]).trim().toUpperCase();
    if (!vin) return;

    map[vin] = {
      tanque: r[COL_TANQ_ASIG - 1] || "",
      reductor: r[COL_REDU_ASIG - 1] || ""
    };
  });

  // ---------- resolver matches ----------
  const outTanq = [];
  const outRedu = [];

  vinsLista.forEach(vin => {
    if (map[vin]) {
      outTanq.push([map[vin].tanque]);
      outRedu.push([map[vin].reductor]);
    } else {
      outTanq.push([""]);
      outRedu.push([""]);
    }
  });

  // ---------- escribir resultados ----------
  shLista.getRange(START_ROW_LISTA, COL_TANQ_LISTA, outTanq.length, 1)
    .setValues(outTanq);

  shLista.getRange(START_ROW_LISTA, COL_REDU_LISTA, outRedu.length, 1)
    .setValues(outRedu);

  Logger.log("MATCH VIN → TANQUE / REDUCTOR COMPLETADO");
}
