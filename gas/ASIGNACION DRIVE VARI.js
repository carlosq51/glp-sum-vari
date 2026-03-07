function actualizarPrincipalDesdeReporte() {
  // === 1) ARCHIVO DONDE CORRES EL SCRIPT (TIENE REPORTE) ===
  const ssReporte = SpreadsheetApp.getActiveSpreadsheet();
  const SH_REPORTE = "REPORTE";

  // === 2) ARCHIVO PRINCIPAL (DICIEMBRE 2025 / ENERO 2026) ===
  const MAIN_ID = "18suk74673GWKKl_B3c32npwuMrbTuCRZ32kp333Mh9I";
  const ssMain = SpreadsheetApp.openById(MAIN_ID);

  const TARGET_SHEETS = ["DICIEMBRE 2025", "ENERO 2026"];

  // ===== COLUMNAS (1-based) =====
  const COL_FECHA_SOL  = 3;   // C
  const COL_TAG_A      = 4;   // D
  const COL_FECHA_CONV = 6;   // F
  const COL_VIN        = 8;   // H
  const COL_PERSONAL   = 29;  // AC
  const COL_ESTADO     = 31;  // AE

  // === LEER REPORTE ===
  const shRep = ssReporte.getSheetByName(SH_REPORTE);
  if (!shRep) throw new Error(`No encuentro la hoja "${SH_REPORTE}".`);

  const rep = shRep.getDataRange().getValues();
  if (rep.length < 2) return;

  // ===== MAP VIN -> DATA =====
  const map = new Map();

  for (let i = 1; i < rep.length; i++) {
    const vin = String(rep[i][0] ?? "").trim();
    if (!vin) continue;

    let fechaTxt = rep[i][1];

    if (fechaTxt instanceof Date) {
      fechaTxt = Utilities.formatDate(fechaTxt, ssReporte.getSpreadsheetTimeZone(), "dd-MM-yyyy");
    } else {
      fechaTxt = String(fechaTxt ?? "").trim();
      const d = new Date(fechaTxt);
      if (!isNaN(d.getTime())) {
        fechaTxt = Utilities.formatDate(d, ssReporte.getSpreadsheetTimeZone(), "dd-MM-yyyy");
      }
    }

    const tecnicosTxt = String(rep[i][2] ?? "").trim();
    map.set(vin, { fechaTxt, tecnicosTxt });
  }

  // ===== HELPERS =====
  const isValidDateString = (v) => {
    const s = String(v ?? "").trim();
    return !!s && /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.test(s);
  };

  const hasTwoNamesHyphen = (s) => {
    s = String(s ?? "").trim();
    const p = s.split("-").map(x => x.trim());
    return p.length === 2 && p[0] && p[1];
  };

  const isBlockedTag = (v) => {
    const s = String(v ?? "").toUpperCase().trim();
    return s.includes("DUPLICADO") || s.includes("ELIMINADO");
  };

  // Comparación "igualdad" de fecha: Date vs string
  const sameDateValue_ = (a, b) => {
    // si ambos son Date
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    // comparar como string normalizado
    const sa = (a instanceof Date)
      ? Utilities.formatDate(a, ssReporte.getSpreadsheetTimeZone(), "dd-MM-yyyy")
      : String(a ?? "").trim();
    const sb = (b instanceof Date)
      ? Utilities.formatDate(b, ssReporte.getSpreadsheetTimeZone(), "dd-MM-yyyy")
      : String(b ?? "").trim();
    return sa === sb;
  };

  // ===== ACTUALIZAR HOJAS =====
  TARGET_SHEETS.forEach(name => {
    const sh = ssMain.getSheetByName(name);
    if (!sh) throw new Error(`No encuentro la hoja "${name}".`);

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    const numRows = lastRow - 1;

    const rngVin       = sh.getRange(2, COL_VIN,        numRows, 1);
    const rngFechaConv = sh.getRange(2, COL_FECHA_CONV, numRows, 1);
    const rngPersonal  = sh.getRange(2, COL_PERSONAL,   numRows, 1);
    const rngEstado    = sh.getRange(2, COL_ESTADO,     numRows, 1);
    const rngTagA      = sh.getRange(2, COL_TAG_A,      numRows, 1);
    const rngFechaSol  = sh.getRange(2, COL_FECHA_SOL,  numRows, 1);

    const vins       = rngVin.getValues();
    const fechasConv = rngFechaConv.getValues();
    const personal   = rngPersonal.getValues();
    const estados    = rngEstado.getValues();
    const tagA       = rngTagA.getValues();
    const fechasSol  = rngFechaSol.getValues();

    let changed = false;

    for (let r = 0; r < numRows; r++) {
      const vin = String(vins[r][0] ?? "").trim();
      if (!vin) continue;

      const data = map.get(vin);
      if (!data) continue;

      // 🚫 NO EDITAR SI NO HAY FECHA DE SOLICITUD
      if (!fechasSol[r][0]) continue;

      // 🚫 NO EDITAR SI ES DUPLICADO / ELIMINADO
      if (
        isBlockedTag(estados[r][0]) ||
        isBlockedTag(tagA[r][0])   ||
        isBlockedTag(fechasConv[r][0])
      ) continue;

      // === FECHA DE CONVERSIÓN (solo si realmente cambia) ===
      const curFecha = fechasConv[r][0];
      if (!(curFecha instanceof Date) && !isValidDateString(curFecha)) {
        // solo setear si distinto
        if (!sameDateValue_(curFecha, data.fechaTxt)) {
          fechasConv[r][0] = data.fechaTxt;
          changed = true;
        }
      }

      // === PERSONAL A CARGO (solo si cambia) ===
      const curPers = String(personal[r][0] ?? "").trim();
      if (!curPers && hasTwoNamesHyphen(data.tecnicosTxt)) {
        personal[r][0] = data.tecnicosTxt;
        changed = true;
      }

      // === ESTADO (solo si cambia) ===
      const curEstado = String(estados[r][0] ?? "").trim().toUpperCase();
      if (curEstado !== "FINALIZADO") {
        estados[r][0] = "FINALIZADO";
        changed = true;
      }
    }

    // ✅ Solo escribir si hubo cambios reales
    if (changed) {
      rngFechaConv.setValues(fechasConv);
      rngPersonal.setValues(personal);
      rngEstado.setValues(estados);
    }
  });
}
