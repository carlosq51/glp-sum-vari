function generarReporteCalidad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const SH_CALIDAD  = "CALIDAD1";
  const SH_CONV     = "CONV121";
  const SH_ASIG     = "ASIGNACIONES";
  const SH_USUARIOS = "USUARIOS";
  const SH_OUT      = "REPORTE";

  const shC = ss.getSheetByName(SH_CALIDAD);
  const shV = ss.getSheetByName(SH_CONV);
  const shA = ss.getSheetByName(SH_ASIG);
  const shU = ss.getSheetByName(SH_USUARIOS);

  if (!shC) throw new Error("No encuentro la hoja CALIDAD1.");
  if (!shV) throw new Error("No encuentro la hoja CONV121.");
  if (!shA) throw new Error("No encuentro la hoja ASIGNACIONES.");
  if (!shU) throw new Error("No encuentro la hoja USUARIOS.");

  const cal      = shC.getDataRange().getValues();
  const conv     = shV.getDataRange().getValues();
  const asig     = shA.getDataRange().getValues();
  const usuarios = shU.getDataRange().getValues();

  // CALIDAD1
  const C_VIN = 1;  // col B
  const C_EST = 3;  // col D

  // CONV121
  const CV_ID  = 0;  // col A
  const CV_VIN = 1;  // col B

  // ASIGNACIONES
  const AS_CONVID = 1;  // col B
  const AS_USER   = 2;  // col C
  const AS_FECHA  = 5;  // col F

  // USUARIOS
  const U_ID     = 0;  // col A
  const U_NOMBRE = 2;  // col C

  // ── Mapa VIN -> ID conversión ──────────────────────────────────
  const mapVinToConvId = new Map();
  for (let i = 1; i < conv.length; i++) {
    const vin    = String(conv[i][CV_VIN] ?? "").trim();
    const convId = String(conv[i][CV_ID]  ?? "").trim();
    if (vin && convId && !mapVinToConvId.has(vin)) {
      mapVinToConvId.set(vin, convId);
    }
  }

  // ── Mapa ID conversión -> ARRAY de { userId, fechaRaw } ───────
  // CAMBIO CLAVE: ahora guardamos TODOS los técnicos por conversión
  const mapConvIdToInfos = new Map();
  for (let i = 1; i < asig.length; i++) {
    const convId   = String(asig[i][AS_CONVID] ?? "").trim();
    const userId   = String(asig[i][AS_USER]   ?? "").trim();
    const fechaRaw = asig[i][AS_FECHA];
    if (!convId || !userId) continue;

    if (!mapConvIdToInfos.has(convId)) {
      mapConvIdToInfos.set(convId, []);
    }
    mapConvIdToInfos.get(convId).push({ userId, fechaRaw });
  }

  // ── Mapa USER_ID -> primer nombre ─────────────────────────────
  const mapUserToNombre = new Map();
  for (let i = 1; i < usuarios.length; i++) {
    const userId      = String(usuarios[i][U_ID]     ?? "").trim();
    const nombreFull  = String(usuarios[i][U_NOMBRE] ?? "").trim();
    const primerNombre = nombreFull ? nombreFull.split(/\s+/)[0] : "";
    if (userId && primerNombre && !mapUserToNombre.has(userId)) {
      mapUserToNombre.set(userId, primerNombre);
    }
  }

  // ── Resolver técnicos y fecha mínima por VIN ──────────────────
  const getInfo = (vin) => {
    const convId = mapVinToConvId.get(vin);
    if (!convId) return { tecnicos: "-", fecha: "" };

    const infos = mapConvIdToInfos.get(convId);
    if (!infos || infos.length === 0) return { tecnicos: "-", fecha: "" };

    // Obtener nombres únicos de técnicos (en orden de aparición)
    const nombresVistos = new Set();
    const nombresList = [];
    let fechaMin = null;

    for (const info of infos) {
      // Acumular técnicos únicos
      const nombre = mapUserToNombre.get(info.userId) || info.userId || "-";
      if (!nombresVistos.has(nombre)) {
        nombresVistos.add(nombre);
        nombresList.push(nombre);
      }

      // Calcular fecha mínima (más antigua)
      if (info.fechaRaw) {
        const d = (info.fechaRaw instanceof Date) ? info.fechaRaw : new Date(info.fechaRaw);
        if (!isNaN(d.getTime())) {
          if (fechaMin === null || d < fechaMin) {
            fechaMin = d;
          }
        }
      }
    }

    const tecnicos = nombresList.join(" - ") || "-";

    let fecha = "";
    if (fechaMin) {
      fecha = Utilities.formatDate(fechaMin, ss.getSpreadsheetTimeZone(), "dd-MM-yyyy");
    }

    return { tecnicos, fecha };
  };

  // ── Construir filas de salida ──────────────────────────────────
  const out = [];
  out.push(["CHASIS / VIN", "FECHA CALIDAD", "TECNICOS", "ESTADO"]);

  const seen = new Set();

  for (let i = 1; i < cal.length; i++) {
    const vin    = String(cal[i][C_VIN] ?? "").trim();
    const estado = String(cal[i][C_EST] ?? "").trim();
    if (!vin || estado !== "FINALIZADO") continue;
    if (seen.has(vin)) continue;
    seen.add(vin);

    const { tecnicos, fecha } = getInfo(vin);
    out.push([vin, fecha, tecnicos, estado]);
  }

  // ── Crear/preparar hoja de salida ─────────────────────────────
  let shOut = ss.getSheetByName(SH_OUT);
  if (!shOut) shOut = ss.insertSheet(SH_OUT);

  const lastRow = Math.max(shOut.getLastRow(), out.length);
  const lastCol = out[0].length;

  const existing = shOut.getRange(1, 1, lastRow, lastCol).getValues();

  for (let r = 0; r < out.length; r++) {
    for (let c = 0; c < out[r].length; c++) {
      const actual = String(existing[r]?.[c] ?? "").trim();
      if (actual === "") {
        shOut.getRange(r + 1, c + 1).setValue(out[r][c]);
      }
    }
  }

  shOut.autoResizeColumns(1, lastCol);
  shOut.setFrozenRows(1);
}