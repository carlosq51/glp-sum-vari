import { Router } from "express";
import { supabaseHeaders_, supabaseGet_ } from "../lib/supabase.js";
import { addServerTiming_ } from "../lib/timing.js";

const router = Router();

// =========================
// SUPERVISOR REPORT (Supabase directo)
// =========================
router.post("/api/supervisor/report", async (req, res) => {
  try {
    const payload = req.body || {};
    return await handleSupervisorReport_(payload, res);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.get("/api/supervisor/report", async (req, res) => {
  try {
    const payload = {
      q:         String(req.query.q         || "").trim(),
      from:      String(req.query.from      || "").trim(),
      to:        String(req.query.to        || "").trim(),
      month:     String(req.query.month     || "").trim(),
      tipoRamal: String(req.query.tipoRamal || "").trim(),
      track:     String(req.query.track     || "CONVERSION").toUpperCase(),
    };
    return await handleSupervisorReport_(payload, res);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

async function handleSupervisorReport_(payload, res) {
  const t1 = Date.now();
  const track = String(payload.track || "CONVERSION").toUpperCase();
  const q = String(payload.q || "").trim().toLowerCase();
  const from = String(payload.from || "").trim();
  const to = String(payload.to || "").trim();
  const month = String(payload.month || "").trim(); // YYYY-MM

  const headers = supabaseHeaders_();
  const SUPABASE_URL = process.env.SUPABASE_URL;

  // Determinar tipo_ot según track
  let tipoOtFilter = "";
  if (track === "CONVERSION") tipoOtFilter = "tipo_ot=in.(CONVERSION)";
  else if (track === "CALIDAD") tipoOtFilter = "tipo_ot=eq.CALIDAD";
  else if (track === "RAMAL") tipoOtFilter = "tipo_ot=eq.RAMALERO";
  else tipoOtFilter = "tipo_ot=in.(CONVERSION)";

  // Calcular fecha efectiva de inicio (para cross-day logic)
  let effectiveFrom = from;
  let effectiveTo = to;
  if (!effectiveFrom && month) {
    effectiveFrom = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    effectiveTo = effectiveTo || `${month}-${String(lastDay).padStart(2, "0")}`;
  }
  // Fecha actual en hora Perú (UTC-5) para que "hoy" coincida con el horario local
  const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());

  // ¿Es un rango puramente histórico? (el día final es antes de hoy)
  // Si es histórico → usamos fecha de CIERRE (updated_at) como criterio de producción.
  // Si es hoy o el rango incluye hoy → comportamiento LIVE (fecha de inicio + cross-day).
  const effectiveToForCheck = effectiveTo || (effectiveFrom ? effectiveFrom : todayStr);
  const isHistorical = !!(effectiveFrom) && effectiveToForCheck < todayStr;

  // Campo select compartido
  const selectFields =
    `id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,last_nota,activo,` +
    `usuarios(id,nombre,email),` +
    `work_orders(id,vin,tipo_ot,tipo_ramal,fecha_creacion,estado_general)`;

  // ── Límites UTC equivalentes a un día en hora Perú (UTC-5, sin DST) ────────
  // Medianoche Lima = 05:00 UTC ; fin del día Lima = 04:59:59 UTC del día siguiente
  function _peruDayStart_(d) { return `${d}T05:00:00`; }
  function _peruDayEnd_(d) {
    const dt = new Date(d + "T12:00:00");
    dt.setDate(dt.getDate() + 1);
    return `${dt.toISOString().slice(0, 10)}T04:59:59`;
  }

  let urlMain, urlCrossFin = null, urlCrossActive = null;

  if (isHistorical) {
    // ── MODO HISTÓRICO: producción por fecha de cierre ──────────────────────
    // Filtramos updated_at con límites en hora Perú para no perder items
    // finalizados entre las 7 PM y medianoche Lima (cuyo UTC ya es el día siguiente).
    const toDay = effectiveTo || effectiveFrom;
    urlMain = `${SUPABASE_URL}/rest/v1/asignaciones?` +
      `select=${selectFields}` +
      `&${tipoOtFilter}` +
      `&activo=eq.true` +
      `&estado_actual=eq.FINALIZADO` +
      `&updated_at=gte.${_peruDayStart_(effectiveFrom)}` +
      `&updated_at=lte.${_peruDayEnd_(toDay)}` +
      `&order=updated_at.desc`;
    // No Q2 ni Q5: ya están incluidos en Q1 por el filtro updated_at
  } else {
    // ── MODO HOY / RANGO ACTUAL: igual que LIVE ──────────────────────────────
    // Q1: asignaciones iniciadas dentro del rango (límites en hora Perú)
    urlMain = `${SUPABASE_URL}/rest/v1/asignaciones?` +
      `select=${selectFields}` +
      `&${tipoOtFilter}` +
      `&activo=eq.true`;

    if (effectiveFrom) urlMain += `&fecha_asignacion=gte.${_peruDayStart_(effectiveFrom)}`;
    if (effectiveTo)   urlMain += `&fecha_asignacion=lte.${_peruDayEnd_(effectiveTo)}`;
    if (month && !from && !to) {
      urlMain += `&fecha_asignacion=gte.${month}-01T05:00:00`;
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const lastDayStr = `${month}-${String(lastDay).padStart(2, "0")}`;
      urlMain += `&fecha_asignacion=lte.${_peruDayEnd_(lastDayStr)}`;
    }
    urlMain += `&order=updated_at.desc`;

    // Q2: finalizados dentro del rango pero iniciados ANTES (cross-day fin)
    // Usamos límite Perú: items que terminen entre las 7 PM-medianoche Lima
    // tienen UTC del día siguiente, por eso la frontera es T05:00:00.
    if (effectiveFrom) {
      urlCrossFin = `${SUPABASE_URL}/rest/v1/asignaciones?` +
        `select=${selectFields}` +
        `&${tipoOtFilter}` +
        `&activo=eq.true` +
        `&estado_actual=eq.FINALIZADO` +
        `&updated_at=gte.${_peruDayStart_(effectiveFrom)}` +
        `&fecha_asignacion=lt.${_peruDayStart_(effectiveFrom)}` +
        `&order=updated_at.desc`;
      if (effectiveTo) urlCrossFin += `&updated_at=lte.${_peruDayEnd_(effectiveTo)}`;
    }

    // Q5: aún activos pero iniciados ANTES del rango (cross-day activo)
    if (effectiveFrom) {
      urlCrossActive = `${SUPABASE_URL}/rest/v1/asignaciones?` +
        `select=${selectFields}` +
        `&${tipoOtFilter}` +
        `&activo=eq.true` +
        `&estado_actual=in.(TRABAJANDO,PAUSADO,SIN_INICIAR)` +
        `&fecha_asignacion=lt.${_peruDayStart_(effectiveFrom)}` +
        `&order=updated_at.desc`;
    }
  }

  // Q_histStart: en modo histórico + búsqueda de técnico específico, traer también
  // los items que EMPEZARON en el rango pero terminaron FUERA de él (o siguen activos).
  // Estos son los "½ carro del día de inicio" que el frontend pesa como 0.5.
  // Filtro: fecha_asignacion en rango Y (no FINALIZADO O updated_at > fin del rango).
  let urlHistStart = null;
  if (isHistorical && q && effectiveFrom) {
    const toDay = effectiveTo || effectiveFrom;
    const rangeEnd = _peruDayEnd_(toDay);
    urlHistStart = `${SUPABASE_URL}/rest/v1/asignaciones?` +
      `select=${selectFields}` +
      `&${tipoOtFilter}` +
      `&activo=eq.true` +
      `&fecha_asignacion=gte.${_peruDayStart_(effectiveFrom)}` +
      `&fecha_asignacion=lte.${rangeEnd}` +
      `&or=(estado_actual.neq.FINALIZADO,updated_at.gt.${rangeEnd})` +
      `&order=updated_at.desc`;
  }

  const fetches = [
    fetch(urlMain, { method: "GET", headers }),
    urlCrossFin    ? fetch(urlCrossFin,    { method: "GET", headers }) : Promise.resolve(null),
    urlCrossActive ? fetch(urlCrossActive, { method: "GET", headers }) : Promise.resolve(null),
    urlHistStart   ? fetch(urlHistStart,   { method: "GET", headers }) : Promise.resolve(null),
  ];

  const [resp, respCrossFin, respCrossActive, respHistStart] = await Promise.all(fetches);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[SUPERVISOR_REPORT] Supabase error:", resp.status, text.slice(0, 300));
    return res.status(500).json({ ok: false, error: `Supabase: ${resp.status}` });
  }

  const [rawMain, rawCrossFin, rawCrossActive, rawHistStart] = await Promise.all([
    resp.json(),
    respCrossFin    ? respCrossFin.json().catch(() => [])    : [],
    respCrossActive ? respCrossActive.json().catch(() => []) : [],
    respHistStart   ? respHistStart.json().catch(() => [])   : [],
  ]);

  // Merge deduplicando por id; marcar cross-day
  // - Histórico Q1: items cerrados dentro del rango (_crossDay: false)
  // - Histórico Q_histStart: items iniciados en el rango pero cerrados fuera (_crossDay: true → ½ carro)
  // - Live Q2/Q5: cross-day clásico
  const seenIds = new Set();
  const raw = [];
  for (const asg of (rawMain || [])) {
    if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _crossDay: false }); }
  }
  if (isHistorical) {
    for (const asg of (rawHistStart || [])) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _crossDay: true }); }
    }
  } else {
    for (const asg of [...(rawCrossFin || []), ...(rawCrossActive || [])]) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _crossDay: true }); }
    }
  }

  // Obtener modelos de VINs (consulta separada)
  const vinsSet = new Set();
  (raw || []).forEach(asg => {
    const wo = asg.work_orders || {};
    if (wo.vin) vinsSet.add(wo.vin);
  });

  let vinsMap = {};
  if (vinsSet.size > 0) {
    const vinsArray = Array.from(vinsSet);
    const vinsUrl = `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&vin=in.(${vinsArray.join(",")})`;
    const vinsResp = await fetch(vinsUrl, { method: "GET", headers }).catch(() => null);

    if (vinsResp && vinsResp.ok) {
      const vinsData = await vinsResp.json();
      (vinsData || []).forEach(v => {
        vinsMap[v.vin] = v.modelo || "";
      });
    }
  }

  // Mapear a formato esperado por el frontend
  let items = (raw || []).map(asg => {
    const user = asg.usuarios || {};
    const wo = asg.work_orders || {};
    const vin = wo.vin || "";
    return {
      // IDs
      id: asg.id,
      workId: asg.work_order_id,
      conversionId: asg.work_order_id,
      userId: asg.user_id,
      // User info
      userName: user.nombre || "",
      userEmail: user.email || "",
      // Work order info
      vin: vin,
      modelo: vinsMap[vin] || "",
      tipoRamal: wo.tipo_ramal || "",
      tipo_ot: asg.tipo_ot,
      // Assignment info
      rol: asg.rol_trabajo,
      rolTrabajo: asg.rol_trabajo,
      estado: asg.estado_actual,
      tiempo_ms: asg.tiempo_trab_ms || 0,
      running_since: asg.running_since,
      fecha_inicio: asg.fecha_asignacion,
      fecha_asignacion: asg.fecha_asignacion,
      updated_at: asg.updated_at,
      created_at: wo.fecha_creacion,
      fecha_creacion: wo.fecha_creacion,
      last_nota: asg.last_nota || "",
      activo: asg.activo,
      // Cross-day flag: started before range start, finalized/active within range
      crossDay: asg._crossDay === true,
    };
  });

  // Filtro por texto (nombre, email, vin)
  if (q) {
    items = items.filter(it => {
      const haystack = [it.userName, it.userEmail, it.vin, it.tipoRamal]
        .join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  const duration = Date.now() - t1;
  console.log(`[SUPERVISOR_REPORT] ${track} ${isHistorical ? "HISTÓRICO(updated_at)" : "HOY(fecha_asignacion)"}: ${items.length} items en ${duration}ms`);

  return res.json({ ok: true, items, count: items.length, isHistorical, _timing: `${duration}ms`, _source: "supabase" });
}

// =========================
// SUPERVISOR LIVE (resumen en tiempo real de técnicos del día)
// =========================
router.get("/api/supervisor/live", async (req, res) => {
  try {
    const t1 = Date.now();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Fecha actual en hora Perú (UTC-5) para que el LIVE funcione hasta medianoche local
    const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
    const thirtyDaysAgo = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" })
      .format(new Date(Date.now() - 30 * 24 * 3600 * 1000));

    const selectFields =
      `id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,activo,` +
      `usuarios!inner(id,nombre,email),` +
      `work_orders(id,vin,tipo_ramal,tipo_ot,estado_general)`;

    // Q1: Asignaciones creadas hoy (activas o no)
    let url1 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&fecha_asignacion=gte.${todayStr}T00:00:00&order=updated_at.desc`;

    // Q2: Trabajos de días anteriores finalizados HOY (cross-day: ½ carro)
    let url2 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&estado_actual=eq.FINALIZADO&updated_at=gte.${todayStr}T00:00:00&fecha_asignacion=lt.${todayStr}T00:00:00&order=updated_at.desc`;

    // Q3: Todos los usuarios activos con rol técnico (para mostrar DESCONECTADO)
    const url3 = `${SUPABASE_URL}/rest/v1/usuarios?select=id,nombre,email,rol,especialidad&activo=eq.true&rol=in.(TECNICO,CALIDAD,RAMALERO)&order=nombre.asc`;

    // Q4: Última asignación reciente por usuario (para rol_trabajo de TECNICO AMBOS)
    const url4 = `${SUPABASE_URL}/rest/v1/asignaciones?select=user_id,rol_trabajo,updated_at&fecha_asignacion=gte.${thirtyDaysAgo}T00:00:00&order=updated_at.desc&limit=2000`;

    // Q5: Trabajos de días anteriores que siguen ACTIVOS hoy ("virtual" — en progreso, no finalizados)
    const url5 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&estado_actual=in.(TRABAJANDO,PAUSADO,SIN_INICIAR)&fecha_asignacion=lt.${todayStr}T00:00:00&order=updated_at.desc`;

    // Q6: Metas diarias (META_DIARIA, META_CALIDAD) desde app_config
    const url6 = `${SUPABASE_URL}/rest/v1/app_config?select=key,value&key=in.(META_DIARIA,META_CALIDAD,META_CONVERSION)`;

    const [resp1, resp2, resp3, resp4, resp5, resp6] = await Promise.all([
      fetch(url1, { method: "GET", headers }),
      fetch(url2, { method: "GET", headers }),
      fetch(url3, { method: "GET", headers }),
      fetch(url4, { method: "GET", headers }),
      fetch(url5, { method: "GET", headers }),
      fetch(url6, { method: "GET", headers }).catch(() => null),
    ]);
    if (!resp1.ok) {
      const text = await resp1.text().catch(() => "");
      throw new Error(`Supabase Q1: ${resp1.status} ${text.slice(0, 200)}`);
    }
    const [raw1, raw2, allUsers, recentAsg, raw5, cfgRows] = await Promise.all([
      resp1.json(),
      resp2.json().catch(() => []),
      resp3.json().catch(() => []),
      resp4.json().catch(() => []),
      resp5.json().catch(() => []),
      resp6 && resp6.ok ? resp6.json().catch(() => []) : Promise.resolve([]),
    ]);
    const _cfgMap = {};
    (cfgRows || []).forEach(r => { _cfgMap[r.key] = r.value; });
    // META_DIARIA = objetivo grupal diario (Live). Fallback a META_CONVERSION por compatibilidad.
    const metaConv = Number(_cfgMap.META_DIARIA || _cfgMap.META_CONVERSION) || 25;
    const metaCal  = Number(_cfgMap.META_CALIDAD) || 22;

    // Mapa: user_id → último rol_trabajo conocido (para TECNICO AMBOS)
    const lastRolMap = new Map();
    for (const a of (recentAsg || [])) {
      if (a.user_id && a.rol_trabajo && !lastRolMap.has(a.user_id)) {
        lastRolMap.set(a.user_id, a.rol_trabajo);
      }
    }

    // Rol_trabajo por defecto según perfil del usuario
    function defaultRolTrabajo_(u) {
      if (u.rol === "CALIDAD")   return "CALIDAD";
      if (u.rol === "RAMALERO")  return "RAMALERO";
      if (u.rol === "TECNICO") {
        if (u.especialidad === "MOTOR")  return "MOTOR";
        if (u.especialidad === "TANQUE") return "TANQUE";
        // AMBOS: usar último rol conocido, si no MOTOR por defecto
        return lastRolMap.get(u.id) || "MOTOR";
      }
      return null; // otros roles no se muestran
    }

    // Merge deduplicando por id:
    // raw1 = hoy activos, raw2 = cross-day FINALIZADO hoy, raw5 = cross-day aún ACTIVOS (virtual)
    const seenIds = new Set();
    const raw = [];
    for (const asg of [...(raw1 || []), ...(raw2 || []), ...(raw5 || [])]) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push(asg); }
    }

    // ── VIN-level summary: CONVERSION = MOTOR+TANQUE ambos FINALIZADO; CALIDAD = CALIDAD FINALIZADO ──
    const vinConv = {}; // vin → { motorFin, tanqueFin, hasActive }
    const vinCal  = {}; // vin → { done, active }
    for (const asg of raw) {
      const wo     = Array.isArray(asg.work_orders) ? asg.work_orders[0] : (asg.work_orders || {});
      const vin    = wo.vin || "";
      if (!vin) continue;
      const tipoOt = (asg.tipo_ot || "").toUpperCase();
      const rol    = (asg.rol_trabajo || "").toUpperCase();
      const done   = asg.estado_actual === "FINALIZADO";
      if (tipoOt === "CONVERSION") {
        if (!vinConv[vin]) vinConv[vin] = { motorFin: false, tanqueFin: false, hasActive: false };
        if (rol === "MOTOR")  { if (done) vinConv[vin].motorFin  = true; else vinConv[vin].hasActive = true; }
        if (rol === "TANQUE") { if (done) vinConv[vin].tanqueFin = true; else vinConv[vin].hasActive = true; }
      } else if (tipoOt === "CALIDAD") {
        if (!vinCal[vin])  vinCal[vin] = { done: false, active: false };
        if (done) vinCal[vin].done = true; else vinCal[vin].active = true;
      }
    }
    const convDone   = Object.values(vinConv).filter(v => v.motorFin && v.tanqueFin).length;
    const convActive = Object.values(vinConv).filter(v => !(v.motorFin && v.tanqueFin)).length;
    const calDone    = Object.values(vinCal).filter(v => v.done).length;
    const calActive  = Object.values(vinCal).filter(v => v.active && !v.done).length;
    const vinsSummary = { convDone, convActive, calDone, calActive, metaConv, metaCal };

    // 2. Agrupar por user_id + rol_trabajo
    const techMap = new Map();
    for (const asg of (raw || [])) {
      const user = Array.isArray(asg.usuarios) ? asg.usuarios[0] : (asg.usuarios || {});
      const wo   = Array.isArray(asg.work_orders) ? asg.work_orders[0] : (asg.work_orders || {});
      const key  = `${asg.user_id}__${asg.rol_trabajo}`;

      if (!techMap.has(key)) {
        techMap.set(key, {
          userId: asg.user_id,
          nombre: user.nombre || "",
          email: user.email || "",
          rol: asg.rol_trabajo || "",
          assignments: [],
        });
      }

      techMap.get(key).assignments.push({
        id: asg.id,
        vin: wo.vin || "",
        tipo_ramal: wo.tipo_ramal || "",
        tipo_ot: asg.tipo_ot || "",
        estado: asg.estado_actual,
        tiempo_ms: asg.tiempo_trab_ms || 0,
        running_since: asg.running_since,
        updated_at: asg.updated_at,
        fecha_asignacion: asg.fecha_asignacion,
        work_order_id: asg.work_order_id,
      });
    }

    // 3. Construir resultado por técnico
    const estadoOrder = { "TRABAJANDO": 0, "PAUSADO": 1, "SIN_INICIAR": 2, "FINALIZADO": 3, "DESCONECTADO": 9 };
    const techs = [];

    for (const tech of techMap.values()) {
      const asgList = tech.assignments;
      const finalizados = asgList.filter(a => a.estado === "FINALIZADO");
      const activos     = asgList.filter(a => a.estado !== "FINALIZADO");

      // El VIN/estado activo actual (el más reciente no finalizado)
      const current = [...activos].sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at)
      )[0] || null;

      // carsHoy: trabajos finalizados contando 0.5 si empezaron un día anterior
      const carsHoy = finalizados.reduce((sum, a) => {
        const d = (a.fecha_asignacion || "").slice(0, 10);
        return sum + (d < todayStr ? 0.5 : 1.0);
      }, 0);

      // virtualHoy: trabajos aún en progreso (no finalizados) — incluye cross-day activos
      const virtualHoy = activos.length;

      techs.push({
        userId: tech.userId,
        nombre: tech.nombre,
        email: tech.email,
        rol: tech.rol,
        vinActivo: current?.vin || "",
        estadoActivo: current?.estado || (finalizados.length > 0 ? "FINALIZADO" : "SIN_ACTIVIDAD"),
        totalHoy: asgList.length,
        finalizadosHoy: finalizados.length,
        activosHoy: activos.length,
        carsHoy,
        virtualHoy,
        vinsHoy: [...new Set(asgList.map(a => a.vin).filter(Boolean))],
        asignacionesHoy: asgList,
      });
    }

    // 4. Agregar usuarios DESCONECTADO (activos pero sin actividad hoy)
    const seenUserRols = new Set(Array.from(techMap.keys())); // "userId__rol"
    for (const u of (allUsers || [])) {
      const rol = defaultRolTrabajo_(u);
      if (!rol) continue;
      const key = `${u.id}__${rol}`;
      if (seenUserRols.has(key)) continue; // ya tiene actividad hoy
      techs.push({
        userId: u.id,
        nombre: u.nombre || "",
        email: u.email || "",
        rol,
        vinActivo: "",
        estadoActivo: "DESCONECTADO",
        totalHoy: 0,
        finalizadosHoy: 0,
        activosHoy: 0,
        carsHoy: 0,
        vinsHoy: [],
        asignacionesHoy: [],
      });
    }

    // Ordenar: TRABAJANDO → PAUSADO → SIN_INICIAR → FINALIZADO → otros; luego por nombre
    techs.sort((a, b) => {
      const oa = estadoOrder[a.estadoActivo] ?? 8;
      const ob = estadoOrder[b.estadoActivo] ?? 8;
      if (oa !== ob) return oa - ob;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });

    const duration = Date.now() - t1;
    return res.json({ ok: true, techs, fecha: todayStr, vinsSummary, _timing: `${duration}ms` });
  } catch (e) {
    console.error("[GET /api/supervisor/live]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Supabase (supervisor_conversion_detail) - LECTURA SOLO
router.get("/api/supervisor/conversion-detail", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const timings = [];

    if (!vin) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok: false, error: "Falta ?vin=" });
    }

    // ?? LECTURA DESDE SUPABASE
    const t1 = Date.now();
    const workOrders = await supabaseGet_("work_orders", { vin });
    timings.push({ label: "work_order_by_vin", duration: Date.now() - t1 });

    if (!workOrders || !workOrders.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "VIN no encontrado" });
    }

    const wo = workOrders[0];

    // Obtener todas las asignaciones para este work_order
    const t2 = Date.now();
    const asignaciones = await supabaseGet_("asignaciones", { work_order_id: wo.id });
    timings.push({ label: "asignaciones_by_wo", duration: Date.now() - t2 });

    // Separar por rol
    const motorAsg = asignaciones?.find(a => a.rol_trabajo === "MOTOR");
    const tanqueAsg = asignaciones?.find(a => a.rol_trabajo === "TANQUE");

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      vin,
      motor: motorAsg ? {
        tecnico: motorAsg.user_id,
        inicio: motorAsg.running_since,
        fin: motorAsg.updated_at,
        estado: motorAsg.estado_actual,
      } : null,
      tanque: tanqueAsg ? {
        tecnico: tanqueAsg.user_id,
        inicio: tanqueAsg.running_since,
        fin: tanqueAsg.updated_at,
        estado: tanqueAsg.estado_actual,
      } : null,
    });
  } catch (e) {
    console.error("[GET /api/supervisor/conversion-detail]", e.message);
    addServerTiming_(res, timings || []);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;
