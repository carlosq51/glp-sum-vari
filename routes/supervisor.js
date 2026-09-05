import { Router } from "express";
import { supabaseHeaders_, supabaseGet_, supabaseFetchAll_ } from "../lib/supabase.js";
import { addServerTiming_ } from "../lib/timing.js";
import { getConfig_, CONFIG_DEFAULTS } from "../lib/config.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { jornadaFecha_, esDuplaApoyo_, vinDeDuplaApoyo_ } from "../lib/despacho.js";
import { fechaPeruMenosDias_ } from "../lib/utils.js";

const router = Router();

// Todo lo que mueve el LIVE del supervisor: quién trabaja en qué, las OTs, el
// reparto y las plazas del taller.
const TOPICS_LIVE = ["asignaciones", "work_orders", "despacho", "zonas"];

/**
 * Duplas automáticas del carro extra, para pintarlas en el LIVE.
 *
 * Devuelve un mapa user_id → { activa, con, conNombre, soyAncla, vin, zonaId }.
 * `activa` false significa "ya hizo su dupla hoy y volvió a trabajar solo": esa
 * marca es la que impide que el panel lo vuelva a proponer para emparejar. La
 * regla es de una vez por jornada y el registro que lo garantiza es la propia
 * fila DISUELTA — por eso se leen TODOS los estados, no solo las vivas.
 *
 * Nunca lanza: el LIVE es anterior al módulo de despacho y tiene que seguir
 * pintándose aunque esas tablas no existan o el módulo esté apagado.
 */
async function duplasAutoDeHoy_(SUPABASE_URL, headers) {
  const vacio = new Map();
  try {
    const fecha = jornadaFecha_();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/despacho_duplas?jornada_fecha=eq.${fecha}` +
      `&or=(motivo.like.AUTO_CARRO_EXTRA*,motivo.like.AYUDA_MANUAL*)` +
      `&select=id,rol_trabajo,lider_user_id,estado,motivo`,
      { headers },
    );
    if (!r.ok) return vacio;
    const duplas = (await r.json()).filter(esDuplaApoyo_);
    if (!duplas.length) return vacio;

    const ids = duplas.map(d => d.id).join(",");
    const mr = await fetch(
      `${SUPABASE_URL}/rest/v1/despacho_dupla_miembros?dupla_id=in.(${encodeURIComponent(ids)})&select=dupla_id,user_id`,
      { headers },
    );
    const miembros = mr.ok ? await mr.json() : [];
    if (!miembros.length) return vacio;

    // La zona solo se necesita para las que siguen en curso.
    const vinsActivos = duplas.filter(d => d.estado === "ACTIVA")
      .map(vinDeDuplaApoyo_).filter(Boolean);
    const zonaPorVin = new Map();
    if (vinsActivos.length) {
      const zr = await fetch(
        `${SUPABASE_URL}/rest/v1/conversion_zonas?vin=in.(${vinsActivos.map(encodeURIComponent).join(",")})&select=vin,zona_id`,
        { headers },
      );
      if (zr.ok) for (const z of await zr.json()) zonaPorVin.set(z.vin, z.zona_id);
    }

    const out = new Map();
    for (const d of duplas) {
      const suyos = miembros.filter(m => m.dupla_id === d.id).map(m => m.user_id);
      const vin = vinDeDuplaApoyo_(d);
      for (const uid of suyos) {
        const otro = suyos.find(x => x !== uid) || null;
        const previo = out.get(uid);
        // Con más de una (no debería, la regla es de una por jornada) manda la
        // que sigue viva: es la que cambia lo que el supervisor ve ahora.
        if (previo?.activa) continue;
        out.set(uid, {
          duplaId: d.id,
          activa: d.estado === "ACTIVA",
          rol: d.rol_trabajo,
          con: otro,
          soyAncla: d.lider_user_id === uid,
          vin: d.estado === "ACTIVA" ? vin : null,
          zonaId: d.estado === "ACTIVA" ? (zonaPorVin.get(vin) ?? null) : null,
        });
      }
    }
    return out;
  } catch {
    return vacio;
  }
}

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
      name:      String(req.query.name      || "").trim(),
      vin:       String(req.query.vin       || "").trim(),
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

/**
 * resolveSearchScope_ — traduce el texto buscado a filtros que entiende Supabase.
 *
 * Antes la búsqueda se hacía en Node sobre las filas ya traídas. Como PostgREST
 * corta en db-max-rows (1000), un VIN de hace dos meses simplemente no venía en
 * el lote y el reporte lo daba por inexistente aunque estuviera en la base.
 * Ahora el filtro viaja a la BD: primero resolvemos qué work_orders/usuarios
 * coinciden y después pedimos SOLO sus asignaciones.
 *
 * Devuelve { extra, vacio }: `extra` son params ya listos para concatenar a la
 * URL; `vacio` indica que el término no coincide con nada (no hay que consultar).
 */
async function resolveSearchScope_({ SUPABASE_URL, headers, nameQ, vinQ, q }) {
  const like_ = (t) => encodeURIComponent(`*${t}*`);

  // null = la consulta auxiliar falló → mejor no filtrar en BD que devolver vacío
  const ids_ = async (url) => {
    const r = await fetch(url, { method: "GET", headers }).catch(() => null);
    if (!r || !r.ok) return null;
    const rows = await r.json().catch(() => []);
    return (rows || []).map((x) => x.id);
  };
  const woIds_   = (t) => ids_(`${SUPABASE_URL}/rest/v1/work_orders?select=id&vin=ilike.${like_(t)}`);
  const userIds_ = (t) => ids_(`${SUPABASE_URL}/rest/v1/usuarios?select=id&or=(nombre.ilike.${like_(t)},email.ilike.${like_(t)})`);

  const params = [];
  let vacio = false;

  if (vinQ) {
    const ids = await woIds_(vinQ);
    if (ids && !ids.length) vacio = true;
    else if (ids) params.push(`work_order_id=in.(${ids.join(",")})`);
  }
  if (nameQ) {
    const ids = await userIds_(nameQ);
    if (ids && !ids.length) vacio = true;
    else if (ids) params.push(`user_id=in.(${ids.join(",")})`);
  }
  if (!vinQ && !nameQ && q) {
    // Término suelto (POST antiguo / URL a mano): puede ser VIN o persona.
    const [wo, us] = await Promise.all([woIds_(q), userIds_(q)]);
    if (wo && us) {
      if (!wo.length && !us.length) vacio = true;
      else params.push(`and=(or(work_order_id.in.(${wo.join(",")}),user_id.in.(${us.join(",")})))`);
    }
  }

  return { extra: params.length ? "&" + params.join("&") : "", vacio };
}

async function handleSupervisorReport_(payload, res) {
  const t1 = Date.now();
  const track = String(payload.track || "CONVERSION").toUpperCase();
  const q = String(payload.q || "").trim().toLowerCase();
  const nameQ = String(payload.name || "").trim().toLowerCase();
  const vinQ = String(payload.vin || "").trim().toLowerCase();

  // Un VIN es único: buscarlo tiene que encontrarlo esté o no dentro del rango.
  // Las fechas solo acotan listados generales o búsquedas por técnico.
  const ignoraFechas = !!vinQ;
  const from = ignoraFechas ? "" : String(payload.from || "").trim();
  const to = ignoraFechas ? "" : String(payload.to || "").trim();
  const month = ignoraFechas ? "" : String(payload.month || "").trim(); // YYYY-MM

  const headers = supabaseHeaders_();
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const cfg = await getConfig_();
  // Sin rango ni búsqueda el reporte es un listado exploratorio: traer los 6k+
  // registros históricos costaría ~9 s. Ahí sí se recorta (y se avisa con
  // `truncated`). En cuanto hay fecha o término de búsqueda se trae TODO.
  const hayFiltro = !!(from || to || month || nameQ || vinQ || q);
  const pageOpts = {
    pageSize: cfg.LIM_PAGINA_SUPABASE,
    maxRows: hayFiltro ? cfg.LIM_REPORTE_MAX_FILAS : cfg.LIM_PAGINA_SUPABASE,
  };

  const scope = await resolveSearchScope_({ SUPABASE_URL, headers, nameQ, vinQ, q });
  if (scope.vacio) {
    return res.json({ ok: true, items: [], count: 0, isHistorical: false, _timing: `${Date.now() - t1}ms`, _source: "supabase" });
  }

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

  // Sin rango pedido, el reporte es el de HOY.
  //
  // Antes, sin from/to/month la consulta LIVE salía SIN filtro de fecha: traía
  // todas las asignaciones de CONVERSION que existen, recortadas a 1000 por
  // LIM_PAGINA_SUPABASE y truncadas en silencio. O sea que la pantalla por
  // defecto del supervisor pesaba 768 KB (1.2 MB desde Supabase), decía "HOY"
  // en el log, y encima venía INCOMPLETA — el propio log lo marcaba con
  // "⚠ TRUNCADO" y nadie lo miraba.
  //
  // Poner la fecha aquí y no en la URL es a propósito: así entra por el mismo
  // camino que un rango explícito y se activan las consultas cross-day (Q2/Q5),
  // que son las que recogen el carro empezado ayer y terminado hoy. Sin ellas,
  // "hoy" se dejaría fuera media producción de la mañana.
  if (!effectiveFrom && !effectiveTo && !month) {
    effectiveFrom = todayStr;
    effectiveTo   = todayStr;
  }

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

  // El filtro de búsqueda va en TODAS las consultas (incluidas las cross-day)
  const conScope_ = (url) => (url ? url + scope.extra : null);

  // Paginado obligatorio: un mes de conversión pasa de 1300 asignaciones y
  // PostgREST devolvía solo las primeras 1000 sin marcar el recorte.
  const traer_ = (url) => (url
    ? supabaseFetchAll_(conScope_(url), headers, pageOpts)
    : Promise.resolve({ ok: true, rows: [], truncated: false }));

  const [rMain, rCrossFin, rCrossActive, rHistStart] = await Promise.all([
    traer_(urlMain), traer_(urlCrossFin), traer_(urlCrossActive), traer_(urlHistStart),
  ]);

  if (!rMain.ok) {
    console.error("[SUPERVISOR_REPORT] Supabase error:", rMain.status, rMain.error);
    return res.status(500).json({ ok: false, error: `Supabase: ${rMain.status}` });
  }

  const truncated = rMain.truncated || rCrossFin.truncated || rCrossActive.truncated || rHistStart.truncated;
  const rawMain = rMain.rows, rawCrossFin = rCrossFin.rows;
  const rawCrossActive = rCrossActive.rows, rawHistStart = rHistStart.rows;

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

  // ── Mitades hermanas fuera de la ventana ────────────────────────────────
  // La ventana del reporte (por inicio o por cierre, según el modo) puede dejar
  // fuera la OTRA mitad del mismo carro: si el tanque cerró el 15 y el motor el
  // 17, un filtro del 17 solo trae el motor y el carro aparece como "falta
  // TANQUE" aunque esté completo. Traemos esas mitades marcadas `_sibling` para
  // que el agrupado por VIN muestre el estado real; van excluidas de las
  // estadísticas (promedios, producción por día), que siguen midiendo el rango.
  let rawSiblings = [];
  if (track === "CONVERSION" && raw.length) {
    const woIds = [...new Set(raw.map(a => a.work_order_id).filter(Boolean))];
    const yaVistoWoRol = new Set(raw.map(a => `${a.work_order_id}|${String(a.rol_trabajo || "").toUpperCase()}`));
    const trozos = [];
    for (let i = 0; i < woIds.length; i += cfg.LIM_VINS_POR_CONSULTA) {
      trozos.push(woIds.slice(i, i + cfg.LIM_VINS_POR_CONSULTA));
    }
    const respHermanas = await Promise.all(trozos.map(trozo => {
      const u = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}` +
        `&${tipoOtFilter}&activo=eq.true&estado_actual=eq.FINALIZADO` +
        `&work_order_id=in.(${trozo.join(",")})`;
      return fetch(u, { method: "GET", headers })
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
    }));
    for (const rows of respHermanas) {
      for (const asg of (rows || [])) {
        const key = `${asg.work_order_id}|${String(asg.rol_trabajo || "").toUpperCase()}`;
        if (seenIds.has(asg.id) || yaVistoWoRol.has(key)) continue;
        seenIds.add(asg.id);
        yaVistoWoRol.add(key);
        rawSiblings.push({ ...asg, _crossDay: false, _sibling: true });
      }
    }
    raw.push(...rawSiblings);
  }

  // Obtener modelos de VINs (consulta separada)
  const vinsSet = new Set();
  (raw || []).forEach(asg => {
    const wo = asg.work_orders || {};
    if (wo.vin) vinsSet.add(wo.vin);
  });

  // En trozos: un mes entero son cientos de VINs y un solo `in.(...)` produce
  // una URL que el servidor rechaza por longitud.
  const vinsMap = {};
  const vinsArray = Array.from(vinsSet);
  for (let i = 0; i < vinsArray.length; i += cfg.LIM_VINS_POR_CONSULTA) {
    const trozo = vinsArray.slice(i, i + cfg.LIM_VINS_POR_CONSULTA);
    const vinsUrl = `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&vin=in.(${trozo.join(",")})`;
    const vinsResp = await fetch(vinsUrl, { method: "GET", headers }).catch(() => null);
    if (!vinsResp || !vinsResp.ok) continue;
    const vinsData = await vinsResp.json().catch(() => []);
    (vinsData || []).forEach(v => { vinsMap[v.vin] = v.modelo || ""; });
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
      // Mitad hermana traída fuera del rango: solo para completar el carro en la
      // vista agrupada por VIN. No entra en promedios ni en gráficos.
      siblingFin: asg._sibling === true,
    };
  });

  // Afinado en memoria sobre lo que ya acotó la BD. Nombre y VIN se evalúan por
  // separado: unidos en un solo texto ("juan LVTD...") nunca calzaban, porque en
  // el registro el email va entre medio.
  if (nameQ || vinQ || q) {
    items = items.filter(it => {
      if (vinQ && !String(it.vin || "").toLowerCase().includes(vinQ)) return false;
      if (nameQ && !`${it.userName} ${it.userEmail}`.toLowerCase().includes(nameQ)) return false;
      if (!nameQ && !vinQ && q) {
        return [it.userName, it.userEmail, it.vin, it.tipoRamal].join(" ").toLowerCase().includes(q);
      }
      return true;
    });
  }

  const duration = Date.now() - t1;
  // `count` = lo que cae en el rango; las hermanas son relleno para el agrupado.
  const nSiblings = items.filter(it => it.siblingFin).length;
  console.log(`[SUPERVISOR_REPORT] ${track} ${isHistorical ? "HISTÓRICO(updated_at)" : "HOY(fecha_asignacion)"}: ${items.length - nSiblings} items (+${nSiblings} mitades hermanas) en ${duration}ms${truncated ? " ⚠ TRUNCADO" : ""}`);

  return res.json({ ok: true, items, count: items.length - nSiblings, isHistorical, truncated, _timing: `${duration}ms`, _source: "supabase" });
}

// =========================
// SUPERVISOR LIVE (resumen en tiempo real de técnicos del día)
// =========================
// El armado va aparte del handler porque se sirve CACHEADO: son ~170 KB de
// Supabase por pasada (la ventana de 30 días de asignaciones pesa sola 119 KB)
// y la vista la tienen abierta varios supervisores a la vez, cada uno
// repitiéndola entera cada ciclo. La invalidación por evento la mantiene al
// día — ver lib/poll-cache.js.
async function armarLiveSupervisor_() {
  {
    const t1 = Date.now();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Fecha actual en hora Perú (UTC-5) para que el LIVE funcione hasta medianoche local
    const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
    const thirtyDaysAgo = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" })
      .format(new Date(Date.now() - 30 * 24 * 3600 * 1000));

    // IMPORTANTE: las columnas de fecha son timestamptz y el servidor Postgres corre
    // en UTC. Un literal sin offset ("2026-08-06T00:00:00") se interpreta como UTC,
    // o sea las 19:00 del día anterior en Perú, y se colaban los cierres de la noche
    // previa. El corte de jornada SIEMPRE tiene que llevar el offset de Perú.
    // Perú no aplica horario de verano, así que -05:00 es constante.
    const PE_OFFSET  = "-05:00";
    const inicioDia_ = (ymd) => encodeURIComponent(`${ymd}T00:00:00${PE_OFFSET}`);
    const hoy00      = inicioDia_(todayStr);
    const hace30d00  = inicioDia_(thirtyDaysAgo);

    const selectFields =
      `id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,activo,` +
      `usuarios!inner(id,nombre,email),` +
      `work_orders(id,vin,tipo_ramal,tipo_ot,estado_general)`;

    // Q1: Asignaciones creadas hoy (activas o no)
    let url1 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&fecha_asignacion=gte.${hoy00}&order=updated_at.desc`;

    // Q2: Trabajos empezados días anteriores pero finalizados HOY (cuentan como carro de hoy)
    let url2 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&estado_actual=eq.FINALIZADO&updated_at=gte.${hoy00}&fecha_asignacion=lt.${hoy00}&order=updated_at.desc`;

    // Q3: Todos los usuarios activos con rol técnico (para mostrar DESCONECTADO)
    const url3 = `${SUPABASE_URL}/rest/v1/usuarios?select=id,nombre,email,rol,especialidad&activo=eq.true&rol=in.(TECNICO,CALIDAD,RAMALERO)&order=nombre.asc`;

    // Config central (defaults + app_config, cacheado 60s en lib/config)
    const cfg = await getConfig_();

    // Q4: Última asignación reciente por usuario (para rol_trabajo de TECNICO AMBOS)
    const url4 = `${SUPABASE_URL}/rest/v1/asignaciones?select=user_id,rol_trabajo,updated_at&fecha_asignacion=gte.${hace30d00}&order=updated_at.desc&limit=${cfg.LIM_ASG_RECIENTES}`;

    // Q5: Trabajos de días anteriores que siguen abiertos ("arrastre").
    // NO cuentan como producción de hoy (ni finalizados ni en proceso): solo sirven
    // para saber en qué está parado ahora mismo un técnico que no abrió nada hoy.
    const url5 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&estado_actual=in.(TRABAJANDO,PAUSADO,SIN_INICIAR)&fecha_asignacion=lt.${hoy00}&order=updated_at.desc`;

    const [resp1, resp2, resp3, resp4, resp5, duplasAuto] = await Promise.all([
      fetch(url1, { method: "GET", headers }),
      fetch(url2, { method: "GET", headers }),
      fetch(url3, { method: "GET", headers }),
      fetch(url4, { method: "GET", headers }),
      fetch(url5, { method: "GET", headers }),
      duplasAutoDeHoy_(SUPABASE_URL, headers),
    ]);
    if (!resp1.ok) {
      const text = await resp1.text().catch(() => "");
      throw new Error(`Supabase Q1: ${resp1.status} ${text.slice(0, 200)}`);
    }
    const [raw1, raw2, allUsers, recentAsg, raw5] = await Promise.all([
      resp1.json(),
      resp2.json().catch(() => []),
      resp3.json().catch(() => []),
      resp4.json().catch(() => []),
      resp5.json().catch(() => []),
    ]);
    // META_DIARIA = objetivo grupal diario (Live). Fallback a META_CONVERSION por compatibilidad.
    const metaConv = Number(cfg.META_DIARIA || cfg.META_CONVERSION) || CONFIG_DEFAULTS.META_DIARIA;
    const metaCal  = Number(cfg.META_CALIDAD) || CONFIG_DEFAULTS.META_CALIDAD;

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

    // Merge deduplicando por id. El LIVE solo mide la jornada de HOY:
    //   raw1 = empezados hoy          → cuentan
    //   raw2 = finalizados hoy        → cuentan (aunque hayan empezado antes)
    //   raw5 = abiertos de días previos → NO cuentan, se marcan `arrastre`
    const seenIds = new Set();
    const raw = [];
    for (const asg of [...(raw1 || []), ...(raw2 || [])]) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push(asg); }
    }
    for (const asg of (raw5 || [])) {
      if (!seenIds.has(asg.id)) { seenIds.add(asg.id); raw.push({ ...asg, _arrastre: true }); }
    }

    // ── Q6: mitades hermanas cerradas ANTES de hoy ────────────────────────────
    // Una mitad que empezó Y terminó un día anterior no entra en Q1 (empezados
    // hoy), ni en Q2 (cerrados hoy), ni en Q5 (abiertas de días previos): es
    // invisible. Sin ella, un carro cuya ÚLTIMA mitad cierra hoy se veía a medias
    // y no sumaba a la meta — y tampoco había sumado el día que cerró la primera,
    // así que se perdía para siempre. Solo alimenta el resumen por VIN; la
    // producción por técnico sigue midiendo únicamente la jornada de hoy.
    const woIdsHoy = [...new Set(raw
      .filter(a => !a._arrastre && String(a.tipo_ot || "").toUpperCase() === "CONVERSION")
      .map(a => a.work_order_id).filter(Boolean))];
    const yaVistoWoRol = new Set(raw.map(a => `${a.work_order_id}|${String(a.rol_trabajo || "").toUpperCase()}`));
    const hermanas = [];
    if (woIdsHoy.length) {
      const trozos = [];
      for (let i = 0; i < woIdsHoy.length; i += cfg.LIM_VINS_POR_CONSULTA) {
        trozos.push(woIdsHoy.slice(i, i + cfg.LIM_VINS_POR_CONSULTA));
      }
      const respHermanas = await Promise.all(trozos.map(trozo => {
        const u = `${SUPABASE_URL}/rest/v1/asignaciones?` +
          `select=id,work_order_id,rol_trabajo,estado_actual,updated_at,work_orders(vin)` +
          `&tipo_ot=eq.CONVERSION&activo=eq.true&estado_actual=eq.FINALIZADO` +
          `&work_order_id=in.(${trozo.join(",")})`;
        return fetch(u, { method: "GET", headers })
          .then(r => (r.ok ? r.json() : []))
          .catch(() => []);
      }));
      for (const rows of respHermanas) {
        for (const asg of (rows || [])) {
          const key = `${asg.work_order_id}|${String(asg.rol_trabajo || "").toUpperCase()}`;
          if (seenIds.has(asg.id) || yaVistoWoRol.has(key)) continue;
          yaVistoWoRol.add(key);
          hermanas.push(asg);
        }
      }
    }

    // ── VIN-level summary: CONVERSION = MOTOR+TANQUE ambos FINALIZADO; CALIDAD = CALIDAD FINALIZADO ──
    // Un carro se convierte el día en que cierra su ÚLTIMA mitad: por eso se
    // guarda el cierre más tardío (`ultFinMs`) y no basta con que alguna mitad
    // haya cerrado hoy — si no, el carro sumaría el día de cada mitad.
    const diaPE_ = (iso) => (iso
      ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date(iso))
      : "");
    const vinConv = {}; // vin → { motorFin, tanqueFin, hasActive, ultFinMs }
    const vinCal  = {}; // vin → { done, active }
    for (const asg of [...raw, ...hermanas]) {
      if (asg._arrastre) continue;               // trabajo de días previos: no es producción de hoy
      const wo     = Array.isArray(asg.work_orders) ? asg.work_orders[0] : (asg.work_orders || {});
      const vin    = wo.vin || "";
      if (!vin) continue;
      const tipoOt = (asg.tipo_ot || "CONVERSION").toUpperCase(); // las hermanas ya vienen filtradas
      const rol    = (asg.rol_trabajo || "").toUpperCase();
      const done   = asg.estado_actual === "FINALIZADO";
      if (tipoOt === "CONVERSION") {
        if (!vinConv[vin]) vinConv[vin] = { motorFin: false, tanqueFin: false, hasActive: false, ultFinMs: 0 };
        if (rol === "MOTOR")  { if (done) vinConv[vin].motorFin  = true; else vinConv[vin].hasActive = true; }
        if (rol === "TANQUE") { if (done) vinConv[vin].tanqueFin = true; else vinConv[vin].hasActive = true; }
        if (done) {
          const ms = Date.parse(asg.updated_at || "") || 0;
          if (ms > vinConv[vin].ultFinMs) vinConv[vin].ultFinMs = ms;
        }
      } else if (tipoOt === "CALIDAD") {
        if (!vinCal[vin])  vinCal[vin] = { done: false, active: false };
        if (done) vinCal[vin].done = true; else vinCal[vin].active = true;
      }
    }
    const convDone   = Object.values(vinConv)
      .filter(v => v.motorFin && v.tanqueFin && diaPE_(v.ultFinMs) === todayStr).length;
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
        arrastre: !!asg._arrastre,
      });
    }

    // 3. Construir resultado por técnico
    const estadoOrder = { "TRABAJANDO": 0, "PAUSADO": 1, "SIN_INICIAR": 2, "FINALIZADO": 3, "DESCONECTADO": 9 };
    const techs = [];

    for (const tech of techMap.values()) {
      const asgList = tech.assignments;
      const finalizados = asgList.filter(a => a.estado === "FINALIZADO");
      const activos     = asgList.filter(a => a.estado !== "FINALIZADO");

      // El VIN/estado activo actual (el más reciente no finalizado). Se prefiere
      // lo de hoy; el arrastre solo entra si el técnico no abrió nada hoy.
      const activosHoy_ = activos.filter(a => !a.arrastre);
      const porFecha    = (a, b) => new Date(b.updated_at) - new Date(a.updated_at);
      const current = [...activosHoy_].sort(porFecha)[0]
        || [...activos].sort(porFecha)[0]
        || null;

      // carsHoy: carros COMPLETOS cerrados hoy (1 c/u — ya no se miden medios carros)
      const carsHoy = finalizados.length;

      // virtualHoy: trabajos abiertos HOY (el arrastre de días previos no cuenta)
      const virtualHoy = activosHoy_.length;

      techs.push({
        userId: tech.userId,
        nombre: tech.nombre,
        email: tech.email,
        rol: tech.rol,
        vinActivo: current?.vin || "",
        vinArrastre: !!current?.arrastre,   // lo que tiene abierto viene de días previos
        estadoActivo: current?.estado || (finalizados.length > 0 ? "FINALIZADO" : "SIN_ACTIVIDAD"),
        totalHoy: asgList.length,
        finalizadosHoy: finalizados.length,
        activosHoy: virtualHoy,
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
        vinArrastre: false,
        estadoActivo: "DESCONECTADO",
        totalHoy: 0,
        finalizadosHoy: 0,
        activosHoy: 0,
        carsHoy: 0,
        virtualHoy: 0,
        vinsHoy: [],
        asignacionesHoy: [],
      });
    }

    // 5. Dupla automática del carro extra (módulo de despacho)
    //
    // Dos datos distintos y los dos importan en pantalla:
    //   duplaAuto      → con quién está trabajando AHORA y en qué zona
    //   duplaAutoUsada → ya la hizo hoy ⇒ trabaja solo el resto de la jornada
    //
    // El segundo es el que evita la pregunta obvia del supervisor ("¿y por qué
    // no juntan a esta otra vez?"): el panel deja de proponerla y lo dice.
    if (duplasAuto.size) {
      const nombrePorId = new Map([
        ...(allUsers || []).map(u => [u.id, u.nombre || ""]),
        ...techs.map(t => [t.userId, t.nombre || ""]),
      ]);
      for (const t of techs) {
        const d = duplasAuto.get(t.userId);
        if (!d) continue;
        t.duplaAutoUsada = true;
        t.duplaAuto = d.activa ? {
          duplaId:   d.duplaId,
          conUserId: d.con,
          conNombre: nombrePorId.get(d.con) || "",
          soyAncla:  d.soyAncla,
          rol:       d.rol,
          vin:       d.vin,
          zonaId:    d.zonaId,
        } : null;
      }
    }

    // Ordenar: TRABAJANDO → PAUSADO → SIN_INICIAR → FINALIZADO → otros; luego por nombre
    techs.sort((a, b) => {
      const oa = estadoOrder[a.estadoActivo] ?? 8;
      const ob = estadoOrder[b.estadoActivo] ?? 8;
      if (oa !== ob) return oa - ob;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });

    const duration = Date.now() - t1;
    return { ok: true, techs, fecha: todayStr, vinsSummary, _timing: `${duration}ms` };
  }
}

router.get("/api/supervisor/live", async (req, res) => {
  try {
    const cfg = await getConfig_();
    // La fecha peruana entra en la clave, y es la fecha CIVIL — la misma que
    // usa el payload (todayStr), no la jornada de despacho con corte a las
    // 06:00. Con la de jornada, entre medianoche y las 6 la clave diría "ayer"
    // mientras el contenido ya sería de hoy, y el cache serviría el día
    // equivocado.
    const payload = await cachedByTopics_(
      `supervisor:live:${fechaPeruMenosDias_(0)}`, TOPICS_LIVE, cfg.SRV_CACHE_PESADO_MS,
      armarLiveSupervisor_,
      { bypass: req.query.fresh === "1" },
    );
    return res.json(payload);
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
