/***********************
 *  WEBAPP: doGet / doPost
 ***********************/
function doGet(e) {
  try {
    const p = e?.parameter || {};
    const action = String(p.action || "").trim().toLowerCase();

    if (action === "ping") return json_({ ok: true, msg: "pong", time: now_().toISOString() });

    requireKey_(p);
    return handleAction_(action, p);

  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = e?.postData?.contents ? JSON.parse(e.postData.contents) : {};
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "ping") return json_({ ok: true, msg: "pong", time: now_().toISOString() });

    requireKey_(body);
    return handleAction_(action, body);

  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/***********************
 *  ROUTER
 ***********************/
function handleAction_(action, payload) {
  switch (action) {
    case "me": {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email) return json_({ ok: false, error: "Falta email." });
      const profile = getUserProfileByEmail_(email);
      return json_({ ok: true, profile });
    }

    case "check_vin": {
      const vin = normalizeVin_(payload.vin);
      if (!vin) return json_({ ok: false, error: "VIN requerido." });
      return json_({ ok: true, vin, exists: vinExistsInList_(vin) });
    }

    case "ensure": {
      const vin = normalizeVin_(payload.vin);
      if (!vin) return json_({ ok: false, error: "VIN requerido." });
      if (!vinExistsInList_(vin)) return json_({ ok: false, error: "VIN no existe en LISTA DE VIN GLP." });
      const conversionId = ensureConversionId_(vin);
      return json_({ ok: true, vin, conversionId });
    }

    case "tecnicos_list": {
      const r = tecnicos_list_();
      return json_(r);
    }

    case "incidencia_add": {
      const lock = LockService.getScriptLock();
      lock.waitLock(4000);
      try {
        const r = incidencia_add_(payload);
        r.rev = bumpRev_();
        return json_(r);
      } finally {
        lock.releaseLock();
      }
    }

    case "equipo_conformidad": {
      const r = equipoConformidad_(payload);
      return json_(r);
    }

    case "mis_activas": {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email) return json_({ ok: false, error: "Falta email." });
      const profile = getUserProfileByEmail_(email);
      const r = api_misActivas_fast_(profile, { excludeFinalizados: !!payload.excludeFinalizados });
      return json_(r);
    }

    case "mis_finalizadas": {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email) return json_({ ok: false, error: "Falta email." });
      const profile = getUserProfileByEmail_(email);
      const r = api_misActivas_fast_(profile, { onlyFinalizados: true });
      return json_(r);
    }

    case "estado": {
      const r = api_estado_fast_(payload);
      return json_(r);
    }

    case "supervisor_conversion_detail": {
      const r = api_supervisorConversionDetail_(payload);
      return json_(r);
    }

    case "evento": {
      const p = makeProfiler_("ROUTER:evento");
      p.lap("inicio");
      const res = registrarEvento_fast_(payload);
      p.lap("fin registrarEvento_fast_", { ok: res?.ok });
      return json_(res);
    }

    case "sync": {
      const p = makeProfiler_("ROUTER:sync");
      p.lap("inicio");
      const r = api_sync_(payload);
      p.lap("fin api_sync_", { ok: r?.ok });
      return json_(r);
    }

    case "supervisor_report": {
      const r = api_supervisorReport_(payload);
      return json_(r);
    }

    case "name_suggest": {
      const r = api_nameSuggest_(payload);
      return json_(r);
    }

    case "vin_suggest": {
      const r = api_vinSuggest_(payload);
      return json_(r);
    }

    case "uploadfiles": {
      return uploadFiles_(payload); // 👈 estas funciones ya devuelven json_()
    }

    case "getstatus": {
      return getStatus_(payload);   // 👈 ya devuelve json_()
    }

    case "uploadone": {
      return uploadOne_(payload);
    }

    case "uploadfalla": {
      return uploadFalla_(payload);
    }

    case "uploadcalidad": {
      return uploadCalidad_(payload);
    }

    case "uploadconformidad": {
      return uploadConformidad_(payload);
    }

    case "uploadincidencia": {
  // ✅ antes era data (NO existe)
      return uploadIncidencia_(payload);
    } 

    case "incidencias_list": {
      // ✅ Eliminado el lock — es solo lectura, no necesita bloquear
      const r = incidencias_list_(payload);
      return json_(r);
    }

    case "debug_roles": {
      const shA = sh_(SHEETS.ASSIGN);
      const hA = headersMap_(shA);
      const colROL = hA["ROL_TRABAJO"];
      const last = shA.getLastRow();
      if (last < 2) return json_({ roles: [] });

      const data = shA.getRange(2, colROL, last - 1, 1).getDisplayValues();
      const roles = [...new Set(data.map(r => String(r[0] || "").trim().toUpperCase()).filter(Boolean))];
      return json_({ roles });
    }

    default:
      return json_({
        ok: false,
        error: "action inválida. Usa: ping, me, check_vin, ensure, mis_activas, mis_finalizadas, estado, evento, sync, vin_suggest.",
      });
  }
}

function testDrivePerms() {
  const f = DriveApp.getFolderById(ROOT_FOLDER_ID);
  Logger.log(f.getName());
}

function testWriteDrive() {
  const folder = DriveApp.getRootFolder(); // o tu carpeta ROOT real
  const f = folder.createFile("perm_test.txt", "ok");
  Logger.log(f.getId());
  // opcional: borrar
  f.setTrashed(true);
}

// ✅ makeProfiler_ con flag de producción
// Agrega esto fuera del router, en tu bloque de helpers
const PROFILER_ENABLED = false; // ← ponlo en true solo cuando debuggeas

function makeProfiler_(label) {
  const t0 = Date.now();
  let prev = t0;
  return {
    lap(name, extra) {
      if (!PROFILER_ENABLED) return;
      const now = Date.now();
      Logger.log(`[${label}] ${name} | +${now - prev}ms | total ${now - t0}ms` +
                 (extra ? " " + JSON.stringify(extra) : ""));
      prev = now;
    }
  };
}


function testDebugTrackCalidad() {
  const shA = sh_(SHEETS.ASSIGN);
  const hA = headersMap_(shA);
  const last = shA.getLastRow();
  const data = shA.getRange(2, 1, last - 1, shA.getLastColumn()).getValues();

  let pasaFiltro = 0;

  for (const r of data) {
    const rol = String(r[hA["ROL_TRABAJO"] - 1] || "").trim().toUpperCase();
    if (rol !== "CALIDAD") continue;

    // Simula exactamente el filtro de api_supervisorReport_ con track=CALIDAD
    const isCalRol = rol === "CALIDAD";
    if (!isCalRol) continue; // nunca debería entrar aquí

    const fa = r[hA["FECHA_ASIGNACION"] - 1];
    const up = r[hA["UPDATED_AT"] - 1];
    
    Logger.log(`fa tipo: ${typeof fa} | valor: ${fa} | up tipo: ${typeof up} | valor: ${up}`);
    pasaFiltro++;
    if (pasaFiltro >= 3) break; // solo muestra 3 ejemplos
  }

  Logger.log(`Filas que pasan filtro track=CALIDAD: ${pasaFiltro}`);
}
