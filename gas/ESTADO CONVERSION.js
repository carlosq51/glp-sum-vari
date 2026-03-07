function generarReporteCalidad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const SH_CALIDAD = "CALIDAD";
  const SH_CONV = "CONVERSIONES";
  const SH_OUT = "REPORTE";

  const shC = ss.getSheetByName(SH_CALIDAD);
  const shV = ss.getSheetByName(SH_CONV);
  if (!shC || !shV) throw new Error("No encuentro las hojas CALIDAD o CONVERSIONES.");

  const cal = shC.getDataRange().getValues();
  const conv = shV.getDataRange().getValues();

  // CALIDAD
  const C_VIN = 1;   // B
  const C_FINI = 3;  // D
  const C_FFIN = 4;  // E
  const C_EST = 7;   // H

  // CONVERSIONES
  const V_VIN = 1;          // B
  const V_TEC_TANQUE = 27;  // AB
  const V_TEC_MOTOR  = 28;  // AC

  // VIN -> tecnicos
  const mapConv = new Map();
  for (let i = 1; i < conv.length; i++) {
    const vin = String(conv[i][V_VIN] ?? "").trim();
    if (!vin) continue;

    const tecTanque = String(conv[i][V_TEC_TANQUE] ?? "").trim();
    const tecMotor  = String(conv[i][V_TEC_MOTOR] ?? "").trim();

    if (!mapConv.has(vin)) mapConv.set(vin, { tecTanque, tecMotor });
  }

  const primerNombre = (full) => {
    full = String(full || "").trim();
    return full ? full.split(/\s+/)[0] : "";
  };

  // Salida
  const out = [];
  out.push(["CHASIS / VIN", "FECHA CALIDAD", "TECNICOS", "ESTADO"]);

  const seen = new Set();

  for (let i = 1; i < cal.length; i++) {
    const vin = String(cal[i][C_VIN] ?? "").trim();
    const estado = String(cal[i][C_EST] ?? "").trim();
    if (!vin || estado !== "FINALIZADO") continue;
    if (seen.has(vin)) continue;
    seen.add(vin);

    const fechaFin = cal[i][C_FFIN];
    const fechaIni = cal[i][C_FINI];

    // Asegurar Date real (no texto)
    const fechaRaw = fechaFin || fechaIni || "";
    let fecha = "";
    if (fechaRaw) {
      const d = (fechaRaw instanceof Date) ? new Date(fechaRaw) : new Date(fechaRaw);
      fecha = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), "dd-MM-yyyy");
    }


    const info = mapConv.get(vin) || { tecTanque: "", tecMotor: "" };
    const tecMotor = primerNombre(info.tecMotor);
    const tecTanque = primerNombre(info.tecTanque);

    const tecnicosFmt = (tecMotor || tecTanque) ? `${tecMotor}-${tecTanque}` : "-";

    out.push([vin, fecha, tecnicosFmt, estado]);
  }

  // Crear/limpiar hoja salida
  let shOut = ss.getSheetByName(SH_OUT);
  if (!shOut) shOut = ss.insertSheet(SH_OUT);

  // BORRAR valores + formatos (clave para que no falle 2da vez)
  shOut.clear(); // <- esto reemplaza al clearContents()

  // Escribir
  shOut.getRange(1, 1, out.length, out[0].length).setValues(out);

  // Formato fecha (solo rango de datos)


  // Ajustes visuales
  shOut.autoResizeColumns(1, 4);
  shOut.setFrozenRows(1);
}
