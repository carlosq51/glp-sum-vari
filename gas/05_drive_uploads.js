// ✅ SOLO upload crea carpetas (con UserLock para no bloquear otros usuarios)
function uploadFiles_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const ctx = getOrCreateCarContext_(root, vin, dateStr);
    const regFolder = getOrCreateFolder_(ctx.carFolder, "REGISTRO");

    const saved = [];
    (data.files || []).forEach(file => {
      const slot = file.slot;
      if (!SLOT_NAMES[slot]) throw new Error("Slot desconocido: " + slot);

      const fixedName = SLOT_NAMES[slot];
      deleteIfExistsByName_(regFolder, fixedName);

      const blob = Utilities.newBlob(
        Utilities.base64Decode(file.b64),
        file.mimeType || "image/jpeg",
        fixedName
      );
      const created = regFolder.createFile(blob);
      saved.push({ slot, fileId: created.getId(), name: created.getName() });
    });

    return json_({
      ok: true,
      vin,
      dateStr,
      monthFolderName: ctx.monthFolderName,
      carFolderName: ctx.carFolderName,
      monthFolderId: ctx.monthFolder.getId(),
      carFolderId: ctx.carFolder.getId(),
      registroFolderId: regFolder.getId(),
      saved
    });
  } finally {
    lock.releaseLock();
  }
}

// ✅ NUEVO: uploadOne -> 1 foto a REGISTRO o CALIDAD (según slot)
function uploadOne_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();
  const slot = String(data.slot || "").trim();
  const b64 = data.b64;
  const mimeType = data.mimeType || "image/jpeg";
  if (!slot) throw new Error("Falta slot");
  if (!b64) throw new Error("Falta b64");

  // decide si va a REGISTRO o CALIDAD
  const isCalidad = !!CALIDAD_SLOT_NAMES[slot];
  const isRegistro = !!SLOT_NAMES[slot];
  if (!isCalidad && !isRegistro) throw new Error("Slot desconocido: " + slot);

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const ctx = getOrCreateCarContext_(root, vin, dateStr);

    const targetFolder = isCalidad
      ? getOrCreateFolder_(ctx.carFolder, "CALIDAD")
      : getOrCreateFolder_(ctx.carFolder, "REGISTRO");

    const fixedName = isCalidad ? CALIDAD_SLOT_NAMES[slot] : SLOT_NAMES[slot];

    // reemplaza si existe
    deleteIfExistsByName_(targetFolder, fixedName);

    const blob = Utilities.newBlob(
      Utilities.base64Decode(b64),
      mimeType,
      fixedName
    );
    const created = targetFolder.createFile(blob);
    const id = created.getId();

    // preview igual a tu getStatus
    const preview = {
      fileId: id,
      name: created.getName(),
      url: `https://drive.google.com/file/d/${id}/view`,
      thumbUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
      imgUrl: `https://drive.google.com/uc?export=view&id=${id}`
    };

    return json_({
      ok: true,
      vin,
      dateStr,
      monthFolderName: ctx.monthFolderName,
      carFolderName: ctx.carFolderName,
      folderKind: isCalidad ? "CALIDAD" : "REGISTRO",
      folderId: targetFolder.getId(),
      saved: { slot, fileId: id, name: created.getName() },
      preview
    });

  } finally {
    lock.releaseLock();
  }
}

// ✅ NUEVO: uploadFalla -> N fotos + 1 nota (carpeta FALLAS)
function uploadFalla_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();
  const note = String(data.note || "").trim(); // ✅ UNA nota para el conjunto
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  const files = data.files || [];
  if (!files.length && !note) throw new Error("No hay fotos ni nota para registrar falla.");

  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const ctx = getOrCreateCarContext_(root, vin, dateStr);
    const fallaFolder = getOrCreateFolder_(ctx.carFolder, "FALLAS");

    // identificador del lote (para que no se pisen nombres)
    const batchId = batchId_(); // ej: 20260209_071530

    const saved = [];

    // Guardar nota (si existe)
    if (note) {
      const noteName = `FALLA_${batchId}_NOTA.txt`;
      deleteIfExistsByName_(fallaFolder, noteName);
      const noteBlob = Utilities.newBlob(note, "text/plain", noteName);
      const noteFile = fallaFolder.createFile(noteBlob);
      saved.push({ kind: "nota", fileId: noteFile.getId(), name: noteFile.getName() });
    }

    // Guardar N imágenes
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const b64 = f.b64;
      if (!b64) continue;

      const idx = String(i + 1).padStart(3, "0");
      const name = `FALLA_${batchId}_${idx}.jpg`;

      // NO borramos todas las fallas anteriores; solo evitamos colisión exacta
      deleteIfExistsByName_(fallaFolder, name);

      const blob = Utilities.newBlob(
        Utilities.base64Decode(b64),
        f.mimeType || "image/jpeg",
        name
      );
      const created = fallaFolder.createFile(blob);
      saved.push({ kind: "foto", slot: "falla", fileId: created.getId(), name: created.getName() });
    }

    return json_({
      ok: true,
      vin,
      dateStr,
      monthFolderName: ctx.monthFolderName,
      carFolderName: ctx.carFolderName,
      fallaFolderId: fallaFolder.getId(),
      batchId,
      savedCount: saved.length,
      saved
    });
  } finally {
    lock.releaseLock();
  }
}

// ✅ NUEVO: uploadCalidad -> 3-4 fotos (carpeta CALIDAD), reemplaza calidad_1..4
function uploadCalidad_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const files = data.files || [];

  // esperamos slots calidad_1..calidad_4 (mínimo 3)
  const valid = files.filter(x => x && x.slot && CALIDAD_SLOT_NAMES[x.slot] && x.b64);
  if (valid.length < 3) throw new Error("Calidad requiere mínimo 3 fotos.");

  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const ctx = getOrCreateCarContext_(root, vin, dateStr);
    const calFolder = getOrCreateFolder_(ctx.carFolder, "CALIDAD");

    const saved = [];
    valid.forEach(file => {
      const slot = file.slot;
      const fixedName = CALIDAD_SLOT_NAMES[slot];
      deleteIfExistsByName_(calFolder, fixedName);

      const blob = Utilities.newBlob(
        Utilities.base64Decode(file.b64),
        file.mimeType || "image/jpeg",
        fixedName
      );
      const created = calFolder.createFile(blob);
      saved.push({ slot, fileId: created.getId(), name: created.getName() });
    });

    return json_({
      ok: true,
      vin,
      dateStr,
      monthFolderName: ctx.monthFolderName,
      carFolderName: ctx.carFolderName,
      calidadFolderId: calFolder.getId(),
      saved
    });
  } finally {
    lock.releaseLock();
  }
}

// ✅ NUEVO: uploadConformidad -> checklist + técnico + 1 foto (carpeta ACTA CONF TANQUE / REDUCTOR)
function uploadConformidad_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();

  const tipoRaw = String(data.tipo || "").trim().toUpperCase(); // "TANQUE" | "REDUCTOR"
  if (!CONF_MAIN_FOLDERS[tipoRaw]) throw new Error("Tipo de conformidad inválido. Usa TANQUE o REDUCTOR.");

  const tecnico = String(data.tecnico || "").trim();
  if (!tecnico) throw new Error("Falta nombre del técnico");

  const checklist = data.checklist || {};
  const c1 = !!checklist.revisadoConTiempo;
  const c2 = !!checklist.responsablePerdida;
  const c3 = !!checklist.todoConforme;

  // si quieres obligar los 3 checks:
  if (!c1 || !c2 || !c3) throw new Error("Debes marcar los 3 checks de conformidad.");

  const file = data.file || {};
  const b64 = file.b64;
  if (!b64) throw new Error("Falta foto (b64)");
  const mimeType = file.mimeType || "image/jpeg";

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const ctx = getOrCreateCarContext_(root, vin, dateStr);

    // MAIN folder: ACTA CONF TANQUE / ACTA CONF REDUCTOR
    const mainFolderName = CONF_MAIN_FOLDERS[tipoRaw];
    const mainFolder = getOrCreateFolder_(ctx.carFolder, mainFolderName);

    // Subfolder por batch para histórico (recomendado)
    const batchId = batchId_(); // ej 20260212_153012
    const subFolderName = `${batchId}`;
    const subFolder = getOrCreateFolder_(mainFolder, subFolderName);

    // Guardar ACTA como JSON
    const actaObj = {
      vin,
      dateStr,
      tipo: tipoRaw,
      tecnico,
      checklist: { revisadoConTiempo: c1, responsablePerdida: c2, todoConforme: c3 },
      createdAt: new Date().toISOString(),
      batchId
    };

    const actaName = "acta.json";
    deleteIfExistsByName_(subFolder, actaName);
    const actaBlob = Utilities.newBlob(JSON.stringify(actaObj, null, 2), "application/json", actaName);
    const actaFile = subFolder.createFile(actaBlob);

    // Guardar FOTO (equipo.jpg)
    const photoName = "equipo.jpg";
    deleteIfExistsByName_(subFolder, photoName);
    const photoBlob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, photoName);
    const photoFile = subFolder.createFile(photoBlob);

    return json_({
      ok: true,
      vin,
      dateStr,
      monthFolderName: ctx.monthFolderName,
      carFolderName: ctx.carFolderName,
      mainFolderName,
      subFolderName,
      mainFolderId: mainFolder.getId(),
      subFolderId: subFolder.getId(),
      actaId: actaFile.getId(),
      actaName,
      photoId: photoFile.getId(),
      photoName
    });

  } finally {
    lock.releaseLock();
  }
}

// ✅ NUEVO: uploadIncidencia -> 1 foto por incidencia (carpeta INCIDENCIAS)
function uploadIncidencia_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();
  const conversionId = String(data.conversionId || "").trim();
  const tipo = String(data.tipo || "INCIDENCIA").trim().toUpperCase();
  const nota = String(data.nota || "").trim();
  const tecnico = String(data.tecnico || "").trim();

  const file = data.file || {};
  const b64 = String(file.b64 || "").trim();
  const mimeType = String(file.mimeType || "image/jpeg").trim();

  if (!b64) throw new Error("Falta foto (b64)");

  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    const ctx = getOrCreateCarContext_(root, vin, dateStr);

    // Carpeta principal de incidencias dentro del VIN
    const incFolder = getOrCreateFolder_(ctx.carFolder, "INCIDENCIAS");

    // Subcarpeta única por incidencia (evita colisiones)
    const batchId = batchId_() + "_" + Utilities.getUuid().slice(0, 8);
    const subFolderName = `INC_${batchId}_${tipo}`;
    const subFolder = getOrCreateFolder_(incFolder, subFolderName);

    // 1) foto.jpg
    const photoName = "foto.jpg";
    deleteIfExistsByName_(subFolder, photoName);

    const photoBlob = Utilities.newBlob(
      Utilities.base64Decode(b64),
      mimeType,
      photoName
    );
    const photoFile = subFolder.createFile(photoBlob);
    // Hacer público para que los thumbnails se puedan ver desde la app
    photoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const photoId = photoFile.getId();

    // 2) meta.json (opcional, pero útil)
    const metaName = "meta.json";
    deleteIfExistsByName_(subFolder, metaName);

    const metaObj = {
      vin,
      conversionId,
      tipo,
      tecnico,
      nota,
      dateStr,
      createdAt: new Date().toISOString(),
      batchId,
    };

    const metaBlob = Utilities.newBlob(
      JSON.stringify(metaObj, null, 2),
      "application/json",
      metaName
    );
    const metaFile = subFolder.createFile(metaBlob);

    return json_({
      ok: true,
      vin,
      conversionId,
      tipo,
      batchId,
      monthFolderName: ctx.monthFolderName,
      carFolderName: ctx.carFolderName,
      incFolderId: incFolder.getId(),
      subFolderId: subFolder.getId(),
      subFolderName,

      photoId,
      photoName: photoFile.getName(),
      photoUrl: `https://drive.google.com/file/d/${photoId}/view`,
      photoThumbUrl: `https://drive.google.com/thumbnail?id=${photoId}&sz=w400`,
      photoImgUrl: `https://drive.google.com/uc?export=view&id=${photoId}`,

      metaId: metaFile.getId(),
      metaName: metaFile.getName(),
    });
  } finally {
    lock.releaseLock();
  }
}


// ✅ getStatus NO crea nada: solo busca y reporta
function getStatus_(data) {
  const vin = normalizeVin_(data.vin);
  if (!vin) throw new Error("VIN inválido");

  const dateStr = data.dateStr || todayDateStr_();
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);

  // ✅ Resolver carpeta real por VIN (sin crear)
  let monthFolderName = monthYearFolderName_(dateStr);
  let carFolderName = `${vin}-${formatDate_DDMMYYYY_(dateStr)}`;
  let monthFolder = findFolder_(root, monthFolderName);
  let carFolder = null;

  const savedId = getVinFolderId_(vin);
  if (savedId) {
    try {
      carFolder = DriveApp.getFolderById(savedId);
      const parentMonth = getFirstParentFolder_(carFolder);
      monthFolder = parentMonth || monthFolder;
      monthFolderName = monthFolder ? monthFolder.getName() : monthFolderName;
      carFolderName = carFolder.getName();
    } catch (e) {
      setVinFolderId_(vin, "");
      carFolder = null;
    }
  }

  // si no había índice, buscamos por VIN en fallback
  if (!carFolder) {
    const found = findCarFolderByVinFallback_(root, vin);
    if (found) {
      carFolder = found;
      const parentMonth = getFirstParentFolder_(carFolder);
      monthFolder = parentMonth || monthFolder;
      monthFolderName = monthFolder ? monthFolder.getName() : monthFolderName;
      carFolderName = carFolder.getName();
      setVinFolderId_(vin, carFolder.getId());
      if (!getVinCreatedDate_(vin)) setVinCreatedDate_(vin, dateStr);
    }
  }

  // si NO encontramos nada, dejamos monthFolder como está y el flujo sigue (retorna "no existe")

  const status = {};
  const previews = {};

  Object.keys(SLOT_NAMES).forEach(slot => status[slot] = false);

  // ✅ NUEVO: status de CALIDAD (solo presencia)
  const calidadStatus = {};
  const calidadPreviews = {};
  Object.keys(CALIDAD_SLOT_NAMES).forEach(slot => calidadStatus[slot] = false);

  // ✅ NUEVO: conteo de FALLAS (no previews porque son muchas)
  const fallasInfo = { exists: false, count: 0 };

  if (!monthFolder) {
    return json_({
      ok: true,
      vin, dateStr,
      monthFolderName, carFolderName,
      exists: { month:false, car:false, registro:false },
      status, previews,
      calidad: { exists:false, status: calidadStatus, previews: calidadPreviews },
      fallas: fallasInfo
    });
  }

  if (!carFolder && monthFolder) carFolder = findFolder_(monthFolder, carFolderName);

  if (!carFolder) {
    return json_({
      ok: true,
      vin, dateStr,
      monthFolderName, carFolderName,
      exists: { month:true, car:false, registro:false },
      status, previews,
      calidad: { exists:false, status: calidadStatus, previews: calidadPreviews },
      fallas: fallasInfo
    });
  }

  const regFolder = findFolder_(carFolder, "REGISTRO");
  if (!regFolder) {
    // aún podemos reportar calidad/fallas si existieran
    fillCalidadAndFallas_(carFolder, calidadStatus, calidadPreviews, fallasInfo);
    return json_({
      ok: true,
      vin, dateStr,
      monthFolderName, carFolderName,
      exists: { month:true, car:true, registro:false },
      status, previews,
      calidad: { exists: Object.values(calidadStatus).some(Boolean), status: calidadStatus, previews: calidadPreviews },
      fallas: fallasInfo
    });
  }

  const it = regFolder.getFiles();
  const byName = {};
  while (it.hasNext()) {
    const f = it.next();
    byName[f.getName()] = f;
  }

  Object.keys(SLOT_NAMES).forEach(slot => {
    const name = SLOT_NAMES[slot];
    const f = byName[name];
    status[slot] = !!f;
    if (f) {
      const id = f.getId();
      previews[slot] = {
        fileId: id,
        name: f.getName(),
        url: `https://drive.google.com/file/d/${id}/view`,
        thumbUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
        imgUrl: `https://drive.google.com/uc?export=view&id=${id}`
      };
    }
  });

  // ✅ NUEVO: completar CALIDAD + FALLAS
  fillCalidadAndFallas_(carFolder, calidadStatus, calidadPreviews, fallasInfo);

  return json_({
    ok: true,
    vin, dateStr,
    monthFolderName, carFolderName,
    exists: { month:true, car:true, registro:true },
    status, previews,
    calidad: { exists: Object.values(calidadStatus).some(Boolean), status: calidadStatus, previews: calidadPreviews },
    fallas: fallasInfo
  });
}

// ===== helpers =====

// =========================
// ✅ VIN INDEX (VIN -> carFolderId)
// =========================
function vinKey_(vin){ return `VIN_FOLDER_${vin}`; }
function vinCreatedKey_(vin){ return `VIN_CREATED_${vin}`; }

function getVinFolderId_(vin){
  return PropertiesService.getScriptProperties().getProperty(vinKey_(vin)) || "";
}

function setVinFolderId_(vin, folderId){
  PropertiesService.getScriptProperties().setProperty(vinKey_(vin), folderId);
}

function getVinCreatedDate_(vin){
  return PropertiesService.getScriptProperties().getProperty(vinCreatedKey_(vin)) || "";
}

function setVinCreatedDate_(vin, dateStr){
  PropertiesService.getScriptProperties().setProperty(vinCreatedKey_(vin), dateStr);
}

// Fallback (por si se borró Properties): busca VIN- dentro de todos los meses
function findCarFolderByVinFallback_(root, vin){
  const itMonth = root.getFolders();
  while (itMonth.hasNext()){
    const month = itMonth.next();
    const itCar = month.getFolders();
    while (itCar.hasNext()){
      const car = itCar.next();
      const name = car.getName() || "";
      if (name.startsWith(vin + "-")) return car;
    }
  }
  return null;
}

// Dado un carFolder, obtiene su parent (mes). Si no existe, lo deja null.
function getFirstParentFolder_(folder){
  const it = folder.getParents();
  return it.hasNext() ? it.next() : null;
}



function fillCalidadAndFallas_(carFolder, calidadStatus, calidadPreviews, fallasInfo) {
  // CALIDAD
  const calFolder = findFolder_(carFolder, "CALIDAD");
  if (calFolder) {
    const it = calFolder.getFiles();
    const byName = {};
    while (it.hasNext()) {
      const f = it.next();
      byName[f.getName()] = f;
    }
    Object.keys(CALIDAD_SLOT_NAMES).forEach(slot => {
      const name = CALIDAD_SLOT_NAMES[slot];
      const f = byName[name];
      calidadStatus[slot] = !!f;
      if (f) {
        const id = f.getId();
        calidadPreviews[slot] = {
          fileId: id,
          name: f.getName(),
          url: `https://drive.google.com/file/d/${id}/view`,
          thumbUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
          imgUrl: `https://drive.google.com/uc?export=view&id=${id}`
        };
      }
    });
  }

  // FALLAS (solo conteo)
  const faFolder = findFolder_(carFolder, "FALLAS");
  if (faFolder) {
    fallasInfo.exists = true;
    let count = 0;
    const it2 = faFolder.getFiles();
    while (it2.hasNext()) { it2.next(); count++; }
    fallasInfo.count = count;
  }
}

function getOrCreateCarContext_(root, vin, dateStr) {
  // 1) Si ya tenemos el folderId guardado para este VIN, usamos ese SIEMPRE
  const savedId = getVinFolderId_(vin);
  if (savedId) {
    try {
      const carFolder = DriveApp.getFolderById(savedId);
      const monthFolder = getFirstParentFolder_(carFolder);
      const monthFolderName = monthFolder ? monthFolder.getName() : "SIN_MES";
      const carFolderName = carFolder.getName();

      // fecha "real" (la de creación guardada)
      const createdDateStr = getVinCreatedDate_(vin) || dateStr;

      return { monthFolderName, carFolderName, monthFolder, carFolder, createdDateStr };
    } catch (e) {
      // si el folderId ya no existe o no hay permisos, borramos el índice y seguimos a crear/buscar
      setVinFolderId_(vin, "");
    }
  }

  // 2) Fallback: si no hay índice, intentamos encontrar VIN-xxxxx en Drive (recorriendo meses)
  const found = findCarFolderByVinFallback_(root, vin);
  if (found) {
    const monthFolder = getFirstParentFolder_(found);
    const monthFolderName = monthFolder ? monthFolder.getName() : "SIN_MES";
    const carFolderName = found.getName();

    setVinFolderId_(vin, found.getId());
    // si no había fecha guardada, la “derivamos” de la primera creación (no perfecta, pero sirve)
    if (!getVinCreatedDate_(vin)) setVinCreatedDate_(vin, dateStr);

    const createdDateStr = getVinCreatedDate_(vin) || dateStr;
    return { monthFolderName, carFolderName, monthFolder, carFolder: found, createdDateStr };
  }

  // 3) Si no existe nada: creamos la carpeta con VIN-FECHA (primera vez)
  const createdDateStr = dateStr || todayDateStr_();
  const monthFolderName = monthYearFolderName_(createdDateStr);
  const monthFolder = getOrCreateFolder_(root, monthFolderName);

  const dateForFolder = formatDate_DDMMYYYY_(createdDateStr);
  const carFolderName = `${vin}-${dateForFolder}`;
  const carFolder = getOrCreateFolder_(monthFolder, carFolderName);

  // guardamos índice para que nunca más cree duplicados con otra fecha
  setVinFolderId_(vin, carFolder.getId());
  setVinCreatedDate_(vin, createdDateStr);

  return { monthFolderName, carFolderName, monthFolder, carFolder, createdDateStr };
}


function batchId_() {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss");
}

function findFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function deleteIfExistsByName_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
}


function todayDateStr_() {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}


function monthYearFolderName_(dateStr) {
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return "SIN_FECHA";
  const y = Number(parts[0]);
  const m = Number(parts[1]);

  const monthNames = [
    "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
    "JULIO","AGOSTO","SETIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"
  ];
  const month = monthNames[m - 1] || "MES";
  return `${month} ${y}`;
}

function formatDate_DDMMYYYY_(dateStr) {
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}
