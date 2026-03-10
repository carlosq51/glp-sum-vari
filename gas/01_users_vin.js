/***********************
 *  1) VIN exists
 ***********************/
function vinExistsInList_(vin) {
  const vinN = normalizeVin_(vin);
  if (!vinN) return false;

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("vins", {
      select: "vin",
      vin: "eq." + vinN,
      limit: 1,
    });
    return rows.length > 0;
  }

  const sh = sh_(SHEETS.VIN_LIST);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  // Columna B (VIN)
  const vinRange = sh.getRange(2, 2, lastRow - 1, 1);

  const found = vinRange
    .createTextFinder(vinN)
    .matchEntireCell(true)
    .findNext();

  return !!found;
}

/***********************
 *  VIN LIST: asignado (tanque / reductor) por VIN
 ***********************/
function getAsignadoByVin_(vin) {
  const vinN = normalizeVin_(vin);
  if (!vinN) return { tanque: "", reductor: "" };

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("vins", {
      select: "tanque_asignado,reductor_asignado",
      vin: "eq." + vinN,
      limit: 1,
    });
    if (rows[0]) {
      return {
        tanque: String(rows[0].tanque_asignado || "").trim(),
        reductor: String(rows[0].reductor_asignado || "").trim(),
      };
    }
    return { tanque: "", reductor: "" };
  }

  const sh = sh_(SHEETS.VIN_LIST);
  const map = headersMap_(sh);

  // DB-READY: canonical names with alias fallback
  const colVIN  = resolveCol_(map, "VIN") || 2;
  const colREDU = resolveCol_(map, "REDUCTOR_ASIGNADO");
  const colTANQ = resolveCol_(map, "TANQUE_ASIGNADO");

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { tanque: "", reductor: "" };

  const rngVin = sh.getRange(2, colVIN, lastRow - 1, 1);
  const found = rngVin
    .createTextFinder(vinN)
    .matchEntireCell(true)
    .findNext();

  if (!found) return { tanque: "", reductor: "" };

  const rowNum = found.getRow();
  const lastCol = sh.getLastColumn();
  const row = sh.getRange(rowNum, 1, 1, lastCol).getDisplayValues()[0];

  return {
    tanque: colTANQ ? String(row[colTANQ - 1] || "").trim() : "",
    reductor: colREDU ? String(row[colREDU - 1] || "").trim() : "",
  };
}

function getRegistradoByConversionId_(conversionId) {
  const cid = String(conversionId || "").trim();
  if (!cid) return { tanque_registrado: "", reductor_registrado: "" };

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("work_orders", {
      select: "tanque_registrado,reductor_registrado",
      id: "eq." + cid,
      limit: 1,
    });
    if (rows[0]) {
      return {
        tanque_registrado: String(rows[0].tanque_registrado || "").trim(),
        reductor_registrado: String(rows[0].reductor_registrado || "").trim(),
      };
    }
    return { tanque_registrado: "", reductor_registrado: "" };
  }

  const sh = sh_(SHEETS.CONV);
  const h = headersMap_(sh);

  const colCID = h["CONVERSION_ID"] || 0;
  const colT = h["TANQUE_REGISTRADO"] || 0;
  const colR = h["REDUCTOR_REGISTRADO"] || 0;

  if (!colCID) return { tanque_registrado: "", reductor_registrado: "" };

  const last = sh.getLastRow();
  if (last < 2) return { tanque_registrado: "", reductor_registrado: "" };

  const found = sh
    .getRange(2, colCID, last - 1, 1)
    .createTextFinder(cid)
    .matchEntireCell(true)
    .findNext();

  if (!found) return { tanque_registrado: "", reductor_registrado: "" };
  if (!colT && !colR) return { tanque_registrado: "", reductor_registrado: "" };

  const rowNum = found.getRow();
  const startCol = Math.min(colT || Infinity, colR || Infinity);
  const endCol = Math.max(colT || 0, colR || 0);
  const width = endCol - startCol + 1;

  const vals = sh.getRange(rowNum, startCol, 1, width).getDisplayValues()[0];

  return {
    tanque_registrado: colT ? String(vals[colT - startCol] || "").trim() : "",
    reductor_registrado: colR ? String(vals[colR - startCol] || "").trim() : "",
  };
}

/***********************
 *  2) USERS: profile by email
 ***********************/
function parseModulos_(raw) {
  const ALL = ["TECNICO", "RAMALERO", "CALIDAD", "MOVILIZADOR", "SUPERVISOR", "ADMIN"];
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return null;
  if (s === "ALL") return ALL;
  const parts = s.split(/[,\s;|]+/).map(x => x.trim()).filter(Boolean);
  return [...new Set(parts)];
}

function getUserModulesById_(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !supabaseEnabled_()) return null;
  const rows = supabaseSelect_("usuario_modulos", {
    select: "modulo",
    user_id: "eq." + uid,
  });
  return rows.map(function(r) {
    return String(r.modulo || "").trim().toUpperCase();
  }).filter(Boolean);
}

function getUserInfoById_(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return { email: "", name: "" };

  const ckey = `UID2INFO_${uid}`;
  const cached = cacheGetJson_(ckey);
  if (cached && (cached.email !== undefined)) return cached;

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("usuarios", {
      select: "id,email,nombre,activo",
      id: "eq." + uid,
      limit: 1,
    });
    if (rows[0] && rows[0].activo !== false) {
      const info = {
        email: String(rows[0].email || "").trim().toLowerCase(),
        name: String(rows[0].nombre || "").trim(),
      };
      cachePutJson_(ckey, info, 300);
      return info;
    }
  }

  try {
    const shU = sh_(SHEETS.USERS);
    const hU = headersMap_(shU);
    const colUUID  = hU["UUID"];
    const colEMAIL = hU["EMAIL"];
    const colNAME  = hU["NOMBRE"];
    if (!colUUID) return { email: "", name: "" };

    const lastRow = shU.getLastRow();
    if (lastRow < 2) return { email: "", name: "" };

    const data = shU.getRange(2, 1, lastRow - 1, shU.getLastColumn()).getValues();
    for (const row of data) {
      if (String(row[colUUID - 1] || "").trim() !== uid) continue;
      const info = {
        email: colEMAIL ? String(row[colEMAIL - 1] || "").trim().toLowerCase() : "",
        name:  colNAME  ? String(row[colNAME  - 1] || "").trim() : "",
      };
      cachePutJson_(ckey, info, 300);
      return info;
    }
  } catch {}

  return { email: "", name: "" };
}

// Wrappers de compatibilidad (si ya usas las funciones viejas en otros lados)
function getUserEmailById_(userId) { return getUserInfoById_(userId).email; }
function getUserNameById_(userId)  { return getUserInfoById_(userId).name;  }


function getUserProfileByEmail_(email) {
  const emailN = String(email || "").trim().toLowerCase();
  if (!emailN) throw new Error("Email vacío.");

  const ckey = `USER_${emailN}`;
  const cached = cacheGetJson_(ckey);
  if (cached && cached.userId) return cached;

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("usuarios", {
      select: "id,email,nombre,rol,especialidad,activo",
      email: "eq." + emailN,
      limit: 1,
    });
    const row = rows[0];
    if (!row) throw new Error("Email no registrado en USUARIOS.");
    if (row.activo === false) throw new Error("Usuario inactivo.");

    const profile = {
      userId: String(row.id || "").trim(),
      email: emailN,
      nombre: String(row.nombre || "").trim(),
      rol: String(row.rol || "TECNICO").trim().toUpperCase(),
      especialidad: String(row.especialidad || "AMBOS").trim().toUpperCase(),
      modulos: getUserModulesById_(row.id),
    };
    cachePutJson_(ckey, profile, 300);
    return profile;
  }

  const shU = sh_(SHEETS.USERS);
  const hU = headersMap_(shU);

  const colUUID = hU["UUID"];
  const colEMAIL = hU["EMAIL"];
  const colNOMBRE = hU["NOMBRE"];
  const colROL = hU["ROL"];
  const colESP = hU["ESPECIALIDAD"];
  const colMOD = hU["MODULOS"];
  const colACT = hU["ACTIVO"];

  if (!colUUID || !colEMAIL) throw new Error('USUARIOS requiere headers: UUID, EMAIL (fila 1).');

  const lastRow = shU.getLastRow();
  if (lastRow < 2) throw new Error("USUARIOS está vacío.");

  const rng = shU.getRange(2, colEMAIL, lastRow - 1, 1);
  const found = rng.createTextFinder(emailN).matchEntireCell(true).findNext();
  if (!found) throw new Error("Email no registrado en USUARIOS.");

  const r = found.getRow();
  const row = shU.getRange(r, 1, 1, shU.getLastColumn()).getValues()[0];

  const activo = colACT ? String(row[colACT - 1] || "").toUpperCase() !== "FALSE" : true;
  if (!activo) throw new Error("Usuario inactivo.");

  const profile = {
    userId: String(row[colUUID - 1] || "").trim(),
    email: emailN,
    nombre: colNOMBRE ? String(row[colNOMBRE - 1] || "").trim() : "",
    rol: colROL ? String(row[colROL - 1] || "").trim().toUpperCase() : "TECNICO",
    especialidad: colESP ? (String(row[colESP - 1] || "").trim().toUpperCase() || "AMBOS") : "AMBOS",
    modulos: colMOD ? parseModulos_(row[colMOD - 1]) : null,
  };

  cachePutJson_(ckey, profile, 300);
  return profile;
}

function isExclusiveRole_(roleTrabajo) {
  const r = normalizeRole_(roleTrabajo);
  return (r === "MOTOR" || r === "TANQUE" || r === "CALIDAD");
}

/***********************
 *  USERS (listas / mapas)
 ***********************/
function getUserListCached_() {
  const key = "USERLIST";
  const cached = cacheGetJson_(key);
  if (cached && cached.t && (Date.now() - cached.t) < 180000 && Array.isArray(cached.items)) {
    return cached.items;
  }

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("usuarios", {
      select: "id,nombre,email,rol,activo",
      activo: "eq.true",
      order: "nombre.asc",
    });
    const items = rows.map(function(r) {
      const name = String(r.nombre || "").trim();
      const email = String(r.email || "").trim().toLowerCase();
      return {
        userId: String(r.id || "").trim(),
        name: name,
        email: email,
        rol: String(r.rol || "").trim().toUpperCase(),
        hay: (name + " " + email).toLowerCase(),
      };
    }).filter(function(r) {
      return r.userId && (r.name || r.email);
    });
    cachePutJson_(key, { t: Date.now(), items: items }, 180);
    return items;
  }

  const shU = sh_(SHEETS.USERS);
  const hU = headersMap_(shU);

  const colUUID  = hU["UUID"];
  const colNAME  = hU["NOMBRE"];
  const colEMAIL = hU["EMAIL"];
  const colACT   = hU["ACTIVO"];
  const colROL   = hU["ROL"];   // ✅ línea que faltaba

  if (!colUUID || (!colNAME && !colEMAIL)) return [];

  const last = shU.getLastRow();
  if (last < 2) return [];

  const data = shU.getRange(2, 1, last - 1, shU.getLastColumn()).getValues();

  const out = [];
  for (const r of data) {
    const activo = colACT ? String(r[colACT - 1] || "").toUpperCase() !== "FALSE" : true;
    if (!activo) continue;

    const userId = String(r[colUUID - 1] || "").trim();
    const name   = colNAME  ? String(r[colNAME  - 1] || "").trim() : "";
    const email  = colEMAIL ? String(r[colEMAIL - 1] || "").trim().toLowerCase() : "";

    if (!userId || (!name && !email)) continue;

    out.push({
      userId,
      name,
      email,
      rol: colROL ? String(r[colROL - 1] || "").trim().toUpperCase() : "", // ✅ ahora sí funciona
      hay: (name + " " + email).toLowerCase(),
    });
  }

  cachePutJson_(key, { t: Date.now(), items: out }, 180);
  return out;
}

function buildUserMap_() {
  const key = "USERMAP";
  const cached = cacheGetJson_(key);
  if (cached && cached.t && (Date.now() - cached.t) < 180000 && cached.m) return cached.m;

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("usuarios", {
      select: "id,nombre,email,activo",
      activo: "eq.true",
    });
    const m = {};
    rows.forEach(function(r) {
      const id = String(r.id || "").trim();
      if (!id) return;
      m[id] = {
        name: String(r.nombre || "").trim(),
        email: String(r.email || "").trim().toLowerCase(),
      };
    });
    cachePutJson_(key, { t: Date.now(), m: m }, 180);
    return m;
  }

  const shU = sh_(SHEETS.USERS);
  const hU = headersMap_(shU);

  const colUUID = hU["UUID"];
  const colEMAIL = hU["EMAIL"];
  const colNAME = hU["NOMBRE"];
  const colACT = hU["ACTIVO"];

  const m = {};
  const last = shU.getLastRow();

  if (last >= 2 && colUUID) {
    const data = shU.getRange(2, 1, last - 1, shU.getLastColumn()).getValues();
    for (const r of data) {
      const id = String(r[colUUID - 1] || "").trim();
      if (!id) continue;

      const activo = colACT ? String(r[colACT - 1] || "").toUpperCase() !== "FALSE" : true;
      if (!activo) continue;

      m[id] = {
        name: colNAME ? String(r[colNAME - 1] || "").trim() : "",
        email: colEMAIL ? String(r[colEMAIL - 1] || "").trim().toLowerCase() : "",
      };
    }
  }

  cachePutJson_(key, { t: Date.now(), m }, 180);
  return m;
}

/***********************
 *  VIN SUGGEST cache
 ***********************/
function getVinSetCached_() {
  const key = "VINSET";
  const cached = cacheGetJson_(key);
  if (cached && cached.t && (Date.now() - cached.t) < 180000 && Array.isArray(cached.vins)) {
    return cached.vins;
  }

  if (supabaseEnabled_()) {
    const rows = supabaseSelect_("vins", {
      select: "vin",
      order: "vin.asc",
    });
    const arr = rows.map(function(r) {
      return normalizeVin_(r.vin);
    }).filter(Boolean);
    cachePutJson_(key, { t: Date.now(), vins: arr }, 80);
    return arr;
  }

  const sh = sh_(SHEETS.VIN_LIST);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const vinColIndex = headers.findIndex(h => String(h).trim().toUpperCase() === "VIN");

  const set = new Set();

  if (vinColIndex !== -1) {
    const col = vinColIndex + 1;
    const vals = sh.getRange(2, col, lastRow - 1, 1).getValues();
    for (const r of vals) {
      const v = normalizeVin_(r[0]);
      if (v) set.add(v);
    }
  } else {
    const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    for (const row of values) {
      for (const cell of row) {
        const v = normalizeVin_(cell);
        if (v) set.add(v);
      }
    }
  }

  const arr = [...set];
  cachePutJson_(key, { t: Date.now(), vins: arr }, 80);
  return arr;
}

/***********************
 *  Helpers incidencias / usuarios
 ***********************/
function findColIdx_(headers, names) {
  const up = headers.map((x) => String(x || "").trim().toUpperCase());
  for (const n of names) {
    const i = up.indexOf(String(n).toUpperCase());
    if (i >= 0) return i + 1;
  }
  return 0;
}

function getRoleByEmail_(email) {
  try {
    return getUserProfileByEmail_(email).rol;
  } catch (e) {
    throw new Error("Usuario no encontrado: " + email);
  }
}

function tecnicos_list_() {
  const users = getUserListCached_(); // ya cacheada 180s
  const out = users
    .filter(u => {
      // getUserListCached_ no filtra por rol, así que lo hacemos aquí
      // Si quieres filtrar por rol necesitas exponer el rol en getUserListCached_
      // (ver nota abajo)
      return true; // placeholder — ver nota
    })
    .map(u => ({
      name:  u.name  || u.email || "TECNICO",
      email: u.email,
      label: u.email ? `${u.name || u.email} (${u.email})` : (u.name || "TECNICO"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, items: out };
}
