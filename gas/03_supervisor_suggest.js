/***********************
 * NAME SUGGEST (autocomplete Supervisor)
 ***********************/
function api_nameSuggest_(payload) {
  const q0 = String(payload.q || payload.query || "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(payload.limit || 12)));
  const all = payload.all === true || q0 === ".";

  const users = getUserListCached_();

  if (all) {
    return {
      ok: true,
      q: q0,
      all: true,
      items: users.slice(0, limit).map(u => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        label: (u.name && u.email) ? `${u.name} — ${u.email}` : (u.name || u.email),
      })),
    };
  }

  if (!q0 || q0.length < 2) return { ok: true, q: q0, items: [] };

  const starts = [];
  const contains = [];

  for (const u of users) {
    if (!u.hay) continue;

    if (u.name.toLowerCase().startsWith(q0) || u.email.toLowerCase().startsWith(q0)) {
      starts.push(u);
    } else if (u.hay.includes(q0)) {
      contains.push(u);
    }
  }

  return {
    ok: true,
    q: q0,
    items: starts.concat(contains).slice(0, limit).map(u => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      label: (u.name && u.email) ? `${u.name} — ${u.email}` : (u.name || u.email),
    })),
  };
}

/***********************
 *  VIN SUGGEST (autocomplete)
 ***********************/
function api_vinSuggest_(payload) {
  const q = normalizeVin_(payload.q || payload.query || "");
  const limit = Math.min(25, Math.max(1, Number(payload.limit || 12)));

  if (!q || q.length < 2) return { ok: true, q, items: [] };

  const vins = getVinSetCached_();
  const starts = [];
  const contains = [];

  for (const v of vins) {
    if (!v) continue;
    if (v.startsWith(q)) starts.push(v);
    else if (v.includes(q)) contains.push(v);
  }

  return { ok: true, q, items: starts.concat(contains).slice(0, limit) };
}

/***********************
 *  SUPERVISOR REPORT
 ***********************/
// ✅ api_supervisorReport_ — sort optimizado con timestamp pre-calculado
function api_supervisorReport_(payload) {
  const q = String(payload.q || "").trim().toLowerCase();
  const month = String(payload.month || "").trim();
  const fromRaw = payload.from;
  const toRaw = payload.to;
  const track = String(payload.track || "CONVERSION").trim().toUpperCase();

  let from = null, to = null;

  function parseDate_(x) {
    if (!x) return null;
    const s = String(x).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s + "T00:00:00.000Z");
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{4}-\d{2}$/.test(month)) {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7)) - 1;
    from = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    to   = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  } else {
    from = parseDate_(fromRaw);
    to   = parseDate_(toRaw);
    if (toRaw && /^\d{4}-\d{2}-\d{2}$/.test(String(toRaw).trim())) {
      to = new Date(to.getTime() + 24 * 3600 * 1000);
    }
  }

  const shA = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(shA);

  const needA = ["CONVERSION_ID","USER_ID","ROL_TRABAJO","ACTIVO",
                 "FECHA_ASIGNACION","UPDATED_AT","ESTADO_ACTUAL","TIEMPO_TRAB_MS","TIEMPO_TRAB"];
  const missA = needA.filter(k => !hA[k]);
  if (missA.length) return { ok: false, error: `ASIGNACIONES: faltan headers: ${missA.join(", ")}` };

  const meta  = buildWorkIdMetaMap_();
  const users = buildUserMap_();

  const last = shA.getLastRow();
  if (last < 2) {
    return { ok: true, items: [], count: 0,
             filters: { q, from: from?.toISOString()||null, to: to?.toISOString()||null, month, track } };
  }

  const data = shA.getRange(2, 1, last - 1, shA.getLastColumn()).getValues();
  const items = [];

  const fromMs = from ? from.getTime() : null;
  const toMs   = to   ? to.getTime()   : null;

  for (const r of data) {
    const rol = String(r[hA["ROL_TRABAJO"] - 1] || "").trim().toUpperCase();

    if (track === "CONVERSION" && rol !== "MOTOR" && rol !== "TANQUE" && rol !== "TECNICO" && rol !== "TANQUERO") continue;
    if (track === "CALIDAD"    && rol !== "CALIDAD") continue;
    if (track === "RAMAL"      && rol !== "RAMALERO" && rol !== "RAMAL") continue;

    const fa = r[hA["FECHA_ASIGNACION"] - 1] instanceof Date ? r[hA["FECHA_ASIGNACION"] - 1] : null;
    const up = r[hA["UPDATED_AT"] - 1]       instanceof Date ? r[hA["UPDATED_AT"] - 1]       : null;
    const tMs = (up || fa)?.getTime() || 0;

    // ✅ Comparación directa en ms, sin Date.parse repetido
    if (fromMs && tMs && tMs < fromMs) continue;
    if (toMs   && tMs && tMs >= toMs)  continue;

    const workId = String(r[hA["CONVERSION_ID"] - 1] || "").trim();
    const userId = String(r[hA["USER_ID"] - 1]       || "").trim();
    const u      = users[userId] || { name: "", email: "" };
    const name   = String(u.name  || "");
    const email  = String(u.email || "");

    if (q) {
      const vin  = String(meta[workId]?.vin       || "");
      const tipo = String(meta[workId]?.tipoRamal || "");
      const hay  = `${name} ${email} ${rol} ${workId} ${vin} ${tipo}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const estado    = String(r[hA["ESTADO_ACTUAL"]   - 1] || "").toUpperCase();
    const tiempo_ms = Number(r[hA["TIEMPO_TRAB_MS"]  - 1] || 0);
    const faIso     = fa ? fa.toISOString() : null;

    items.push({
      workId, rol,
      activo: String(r[hA["ACTIVO"] - 1] || "").toUpperCase() === "TRUE",
      estado,
      userId, userName: name, userEmail: email,
      vin:       String(meta[workId]?.vin         || ""),
      tipoRamal: String(meta[workId]?.tipoRamal   || ""),
      fecha_creacion:   meta[workId]?.fechaCreacion || null,
      created_at:       faIso,
      fecha_inicio:     faIso,
      fecha_asignacion: faIso,
      updated_at:  up ? up.toISOString() : null,
      tiempo_ms,
      tiempo_hms: String(r[hA["TIEMPO_TRAB"] - 1] || fmtHMS_(tiempo_ms)),
      _sortMs: tMs,  // ✅ campo temporal para sort
    });
  }

  // ✅ Sort usando el valor pre-calculado, sin Date.parse en cada comparación
  items.sort((a, b) => b._sortMs - a._sortMs);

  // Limpiar campo interno antes de devolver
  for (const it of items) delete it._sortMs;

  return {
    ok: true,
    filters: { q, from: from?.toISOString()||null, to: to?.toISOString()||null, month, track },
    count: items.length,
    items,
  };
}

/***********************
 *  SUPERVISOR: CONVERSION DETAIL por VIN
 ***********************/
// ✅ api_supervisorConversionDetail_ optimizada
// Mejora: filtra eventos por conversionId con TextFinder en lugar de
// leer todas las filas y filtrar en JS
function api_supervisorConversionDetail_(payload) {
  const vin = normalizeVin_(payload.vin);
  if (!vin) return { ok: false, error: "Falta vin." };

  const conversionId = findConversionIdByVin_(vin);
  if (!conversionId) {
    return { ok: false, error: `No existe OT (CONV121) para VIN ${vin}.` };
  }

  const shE = sh_(SHEETS.EVENTS);
  const hE = headersMap_(shE);

  const needE = ["EVENTO_ID", "TIMESTAMP", "USER_ID", "CONVERSION_ID", "ROL_TRABAJO", "ACCION"];
  const missE = needE.filter(k => !hE[k]);
  if (missE.length) return { ok: false, error: `MARCA_EVENTOS: faltan headers: ${missE.join(", ")}` };

  const last = shE.getLastRow();
  if (last < 2) return emptyDetail_(vin, conversionId);

  const colCID = hE["CONVERSION_ID"];

  // ✅ TextFinder para saltar filas irrelevantes sin leerlas todas
  const finder = shE.getRange(2, colCID, last - 1, 1)
    .createTextFinder(String(conversionId).trim())
    .matchEntireCell(true);

  const matchedRows = [];
  let cell;
  while ((cell = finder.findNext()) !== null) {
    matchedRows.push(cell.getRow());
  }

  if (!matchedRows.length) return emptyDetail_(vin, conversionId);

  // ✅ Leer solo las filas que coinciden, agrupadas en rangos contiguos
  const lastCol = shE.getLastColumn();
  const events = [];

  // Agrupar filas contiguas para minimizar getRange calls
  const ranges = groupContiguousRows_(matchedRows);
  for (const [startRow, count] of ranges) {
    const block = shE.getRange(startRow, 1, count, lastCol).getValues();
    for (const r of block) {
      const rol = String(r[hE["ROL_TRABAJO"] - 1] || "").trim().toUpperCase();
      if (rol !== "MOTOR" && rol !== "TANQUE") continue;

      const accion = String(r[hE["ACCION"] - 1] || "").trim().toUpperCase();
      if (accion !== "INICIO" && accion !== "FIN") continue;

      const ts = r[hE["TIMESTAMP"] - 1] instanceof Date ? r[hE["TIMESTAMP"] - 1] : null;
      if (!ts) continue;

      events.push({
        rol,
        accion,
        ts,
        userId: String(r[hE["USER_ID"] - 1] || "").trim(),
      });
    }
  }

  events.sort((a, b) => a.ts.getTime() - b.ts.getTime());

  // ✅ Solo cargamos usuarios de los eventos encontrados, no todo el mapa
  const neededIds = new Set(events.map(e => e.userId).filter(Boolean));
  const users = neededIds.size > 0 ? buildUserMap_() : {};

  function packRole_(role) {
    const ev = events.filter(e => e.rol === role);
    const ini = ev.find(e => e.accion === "INICIO") || null;
    const fin = [...ev].reverse().find(e => e.accion === "FIN") || null;
    const techId = (ini?.userId || fin?.userId || "").trim();
    const u = users[techId] || { name: "", email: "" };
    return {
      userId: techId,
      userName: String(u.name || ""),
      userEmail: String(u.email || ""),
      inicio: ini ? ini.ts.toISOString() : null,
      fin: fin ? fin.ts.toISOString() : null,
    };
  }

  return {
    ok: true,
    vin,
    conversionId,
    motor: packRole_("MOTOR"),
    tanque: packRole_("TANQUE"),
  };
}

// Helper: devuelve [[startRow, count], ...] de filas contiguas
function groupContiguousRows_(sortedRows) {
  if (!sortedRows.length) return [];
  const groups = [];
  let start = sortedRows[0];
  let count = 1;
  for (let i = 1; i < sortedRows.length; i++) {
    if (sortedRows[i] === sortedRows[i - 1] + 1) {
      count++;
    } else {
      groups.push([start, count]);
      start = sortedRows[i];
      count = 1;
    }
  }
  groups.push([start, count]);
  return groups;
}

function emptyDetail_(vin, conversionId) {
  const empty = { userId: "", userName: "", userEmail: "", inicio: null, fin: null };
  return { ok: true, vin, conversionId, motor: empty, tanque: empty };
}
