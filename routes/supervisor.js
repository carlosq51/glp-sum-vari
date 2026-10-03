import { Router } from "express";
import { supabaseHeaders_, supabaseGet_, supabaseFetchAll_ } from "../lib/supabase.js";
import { addServerTiming_ } from "../lib/timing.js";
import { getConfig_, CONFIG_DEFAULTS } from "../lib/config.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { jornadaFecha_, esDuplaApoyo_, vinDeDuplaApoyo_ } from "../lib/despacho.js";
import { fechaPeruMenosDias_, normalizeModelo_, jornadaPeru_ } from "../lib/utils.js";

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
async function duplasAutoDeHoy_(SUPABASE_URL, headers, jornada = null) {
  const vacio = new Map();
  try {
    // La jornada llega como argumento desde que el LIVE puede mirar días ya
    // cerrados: la tabla está indexada por jornada_fecha, así que la misma
    // consulta sirve para hoy y para el martes pasado.
    const fecha = jornada || jornadaFecha_();

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
// Lo que cambia el contenido del reporte. Mismos topics que el LIVE menos
// despacho/zonas: el reporte mide trabajo hecho, no dónde está aparcado nadie.
const TOPICS_REPORT = ["asignaciones", "work_orders"];

/**
 * Sirve el reporte pasando por el micro-cache compartido.
 *
 * El reporte no se pollea, pero sí se repite: el supervisor cambia un filtro,
 * vuelve al anterior y lo repide entero (16,6 KB de Supabase por pasada, en
 * cuatro páginas), y varios supervisores abren la misma vista por defecto el
 * mismo día. La clave lleva TODOS los filtros porque dos rangos distintos son
 * dos reportes distintos; la invalidación por evento evita que un cierre
 * reciente quede fuera de lo que se ve.
 */
async function servirReporte_(payload, req, res) {
  const cfg = await getConfig_();
  const clave = JSON.stringify([
    payload.q, payload.name, payload.vin, payload.from,
    payload.to, payload.month, payload.tipoRamal, payload.track,
  ]);
  const out = await cachedByTopics_(
    `supervisor:report:${clave}`, TOPICS_REPORT, cfg.SRV_CACHE_PESADO_MS,
    () => armarReporteSupervisor_(payload),
    { bypass: req.query.fresh === "1" },
  );
  return res.json(out);
}

router.post("/api/supervisor/report", async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {
      q:         String(body.q         || "").trim(),
      name:      String(body.name      || "").trim(),
      vin:       String(body.vin       || "").trim(),
      from:      String(body.from      || "").trim(),
      to:        String(body.to        || "").trim(),
      month:     String(body.month     || "").trim(),
      tipoRamal: String(body.tipoRamal || "").trim(),
      track:     String(body.track     || "CONVERSION").toUpperCase(),
    };
    return await servirReporte_(payload, req, res);
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
    return await servirReporte_(payload, req, res);
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

// Devuelve el payload en vez de escribirlo: así puede envolverse en el
// micro-cache (servirReporte_). Si Supabase falla LANZA, porque cachedByTopics_
// solo guarda lo que se produce bien — un error nunca debe quedarse pegado.
async function armarReporteSupervisor_(payload) {
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
    return { ok: true, items: [], count: 0, isHistorical: false, _timing: `${Date.now() - t1}ms`, _source: "supabase" };
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
  //
  // Con un VIN buscado NO se pone esa fecha. `ignoraFechas` ya había vaciado
  // el rango que venía de la pantalla justamente para que el carro apareciera
  // estuviera donde estuviera, y volver a meter "hoy" aquí lo deshacía en la
  // línea siguiente. El caso que se veía en el taller: un carro con la
  // conversión cerrada hace días y todavía sin calidad no salía en NINGUNA de
  // las consultas —Q1 pide fecha_asignacion de hoy, Q2 pide cierre de hoy y Q5
  // solo mira los que siguen abiertos—, así que escanear su VIN devolvía «sin
  // resultados» sobre una OT que existe y está cerrada. Sin fechas la consulta
  // sigue acotada por los work_order_id de ese VIN: un puñado de filas.
  if (!ignoraFechas && !effectiveFrom && !effectiveTo && !month) {
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
    throw new Error(`Supabase: ${rMain.status}`);
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

  const vinsMap = await modelosDeVins_(SUPABASE_URL, headers, cfg, vinsSet);

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

  return { ok: true, items, count: items.length - nSiblings, isHistorical, truncated, _timing: `${duration}ms`, _source: "supabase" };
}

// =========================
// SUPERVISOR LIVE (resumen en tiempo real de técnicos del día)
// =========================

/**
 * Quién está DENTRO del taller ahora mismo, según el marcaje de asistencia.
 *
 * Se lee la proyección `asistencia_jornada` y no la bitácora de marcas: la
 * proyección ya tiene el estado resuelto (una fila por persona), mientras que
 * reconstruirlo desde las marcas costaría traérselas todas y replicar aquí la
 * máquina de estados de lib/despacho.js. El LIVE solo necesita el resultado.
 *
 * La clave es `jornadaFecha_()`, con su corte a las 06:00, y NO la fecha civil
 * que usa el resto del LIVE: quien entró anoche a las 23:00 sigue dentro a las
 * 02:00, y con la fecha civil su marca se leería como la de "ayer".
 *
 * Estados posibles (lib/despacho.js): FUERA · PRESENTE · DISPONIBLE · OCUPADO
 * · PAUSA. Nunca lanza: el LIVE es anterior al módulo de despacho y tiene que
 * seguir pintándose con el módulo apagado — en ese caso simplemente no hay
 * marcas y nadie sale señalado, que es mejor que marcar a todo el taller como
 * ausente.
 */
/**
 * VIN → modelo canónico. Lo usan el reporte y el LIVE.
 *
 * Se manda el modelo CANÓNICO, no el de la factura. En vins conviven ~15
 * escrituras del mismo carro ("X70FL 1.5T 6MT 4X2 FULL", "Jetour MEC",
 * "X70 1,5T MEC 4X2 CONFORT"…) y mandar el crudo llenaba el filtro del
 * reporte con seis "Jetour" distintos que son el mismo modelo.
 * modelo_normalizado ya vive en la tabla; normalizeModelo_ cubre al VIN
 * recién dado de alta que el normalizador diario aún no tocó.
 *
 * En trozos: un mes entero son cientos de VINs y un solo `in.(...)` produce
 * una URL que el servidor rechaza por longitud. Un trozo que falla deja sus
 * VINs sin modelo en vez de tumbar la respuesta.
 */
async function modelosDeVins_(SUPABASE_URL, headers, cfg, vins) {
  const vinsMap = {};
  const vinsArray = Array.from(vins).filter(Boolean);
  for (let i = 0; i < vinsArray.length; i += cfg.LIM_VINS_POR_CONSULTA) {
    const trozo = vinsArray.slice(i, i + cfg.LIM_VINS_POR_CONSULTA);
    const vinsUrl = `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo,modelo_normalizado&vin=in.(${trozo.join(",")})`;
    const vinsResp = await fetch(vinsUrl, { method: "GET", headers }).catch(() => null);
    if (!vinsResp || !vinsResp.ok) continue;
    const vinsData = await vinsResp.json().catch(() => []);
    (vinsData || []).forEach(v => {
      vinsMap[v.vin] = v.modelo_normalizado || normalizeModelo_(v.modelo) || v.modelo || "";
    });
  }
  return vinsMap;
}

async function asistenciaDeHoy_(SUPABASE_URL, headers, fecha = jornadaFecha_()) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/asistencia_jornada` +
      `?jornada_fecha=eq.${fecha}&select=user_id,estado,ingreso_at`,
      { headers },
    );
    if (!r.ok) return new Map();
    return new Map((await r.json()).map(a => [a.user_id, a]));
  } catch {
    return new Map();
  }
}
/**
 * Forma de la jornada del mes: cuánto objetivo cabe y cuánto ya debería estar.
 *
 * El domingo no se trabaja y el sábado es medio día. Sin esa ponderación el
 * objetivo mensual sale de multiplicar META_DIARIA por 30 y no coincide con
 * ningún número que el taller reconozca — que es la forma más rápida de que
 * nadie vuelva a mirar el panel.
 *
 * Devuelve pesos en "jornadas": 24 jornadas × META_DIARIA = objetivo del mes.
 */
export function jornadasDelMes_(ym, hastaDia, factorSabado) {
  const [y, m] = String(ym).split("-").map(Number);
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const peso = (d) => {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 domingo … 6 sábado
    if (dow === 0) return 0;
    if (dow === 6) return factorSabado;
    return 1;
  };
  let transcurridas = 0, totales = 0;
  for (let d = 1; d <= diasMes; d++) {
    const w = peso(d);
    totales += w;
    if (d <= hastaDia) transcurridas += w;
  }
  return { transcurridas, totales, pesoHoy: peso(hastaDia) };
}

// Un carro puede quedarse a medias cruzando el cambio de mes: la mitad que
// falta se cierra en los primeros días del siguiente. Se mira un poco antes del
// día 1 para poder emparejarla; el carro sigue contando el día en que cerró su
// ÚLTIMA mitad, así que no se cuenta dos veces.
const DIAS_ANTES_DEL_MES = 15;

// Las dos mitades de un carro. Nombrarlas evita repetir el ternario
// MOTOR/TANQUE en cada sitio que pregunta "¿cuál falta?".
const ROLES_CONV = ["MOTOR", "TANQUE"];

/**
 * Carros convertidos en el mes SIN contar hoy.
 *
 * Va aparte de lo de hoy y con su propio cache porque los días ya cerrados no
 * cambian: releerlos en cada pasada del LIVE sería pagar el mes entero cada
 * cinco minutos para que el número no se mueva. El día en curso siempre se
 * calcula en vivo y se suma encima.
 */
async function convMesPrevio_(SUPABASE_URL, headers, cfg, ym, hoy00) {
  const [anio, mes] = String(ym).split("-").map(Number);
  // Date.UTC admite días <= 0 y retrocede al mes anterior por su cuenta.
  const desdeYmd = new Date(Date.UTC(anio, mes - 1, 1 - DIAS_ANTES_DEL_MES)).toISOString().slice(0, 10);

  const url = `${SUPABASE_URL}/rest/v1/asignaciones` +
    `?select=work_order_id,rol_trabajo,updated_at` +
    `&tipo_ot=eq.CONVERSION&activo=eq.true&estado_actual=eq.FINALIZADO` +
    `&updated_at=gte.${encodeURIComponent(desdeYmd + "T00:00:00-05:00")}` +
    `&updated_at=lt.${hoy00}&order=updated_at.asc`;

  const r = await supabaseFetchAll_(url, headers, {
    pageSize: cfg.LIM_PAGINA_SUPABASE,
    maxRows:  cfg.LIM_ASG_MES,
  });
  if (!r.ok) return { convDone: 0, truncado: false, ok: false };

  // Por jornada, no por fecha civil: si no, el carro cerrado a la 01:00 del 1
  // de octubre se contaría en octubre cuando lo hizo el turno del 30 de
  // septiembre, y el acumulado del mes no cuadraría con la suma de sus días.
  const diaPE = (ms) => jornadaPeru_(cfg.LIVE_JORNADA_INICIO || "05:00", new Date(ms));
  const porWo = new Map();
  for (const a of r.rows) {
    const rol = String(a.rol_trabajo || "").toUpperCase();
    if (rol !== "MOTOR" && rol !== "TANQUE") continue;
    let e = porWo.get(a.work_order_id);
    if (!e) { e = { MOTOR: false, TANQUE: false, ultFinMs: 0 }; porWo.set(a.work_order_id, e); }
    e[rol] = true;
    const ms = Date.parse(a.updated_at || "") || 0;
    if (ms > e.ultFinMs) e.ultFinMs = ms;
  }

  let convDone = 0;
  for (const e of porWo.values()) {
    // El carro cuenta el día en que cerró su última mitad; solo suma si ese día
    // cae dentro del mes que estamos mirando.
    if (e.MOTOR && e.TANQUE && diaPE(e.ultFinMs).slice(0, 7) === ym) convDone++;
  }
  return { convDone, truncado: r.truncated, ok: true };
}

// El armado va aparte del handler porque se sirve CACHEADO: son decenas de KB
// de Supabase por pasada y la vista la tienen abierta varios supervisores a la
// vez, cada uno repitiéndola entera cada ciclo. La invalidación por evento la
// mantiene al día — ver lib/poll-cache.js.
async function armarLiveSupervisor_(fechaPedida = null) {
  {

    const t1 = Date.now();
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Config central (defaults + app_config, cacheado 60s en lib/config).
    // Se lee ANTES que las fechas porque el corte de jornada sale de ella.
    const cfg = await getConfig_();

    // ── El día del LIVE es la JORNADA, no la fecha del calendario ────────────
    //
    // El taller se queda amanecido: abre a las 05:00 y arrastra hasta las 02:00
    // del día siguiente. Hasta el 30-09-2026 aquí se usaba la fecha civil, y eso
    // partía cada jornada en dos pestañas: la del 30 abría con las mitades que
    // se habían cerrado entre medianoche y las 02:00 —trabajo de la noche del
    // 29— ya puestas en la franja de noche, y el 29 cerraba sin ellas.
    //
    // Con la jornada, el cierre de la 01:00 del 30 suma donde lo hizo su turno:
    // el 29. Ver jornadaPeru_ en lib/utils.js.
    // Normalizada a HH:MM de dos dígitos: además de la cuenta, esta hora se
    // pega dentro de un literal timestamptz ("…T05:00:00-05:00"), y un "5:00"
    // suelto haría que Postgres rechazara la consulta entera.
    const INICIO_JORNADA = (() => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(cfg.LIVE_JORNADA_INICIO || "").trim());
      return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : "05:00";
    })();
    // ── Qué jornada se está mirando ──────────────────────────────────────────
    //
    // Por defecto la de ahora, pero el panel puede pedir una pasada: el
    // supervisor quiere comparar los cortes de hoy con los del sábado sin
    // salirse del LIVE. Un día cerrado se arma igual que el de hoy, con dos
    // diferencias: la ventana tiene tope por arriba (si no, el "arrastre" de
    // esta tarde entraría en la foto del martes) y lo que es estado de AHORA
    // —quién está dentro del taller— no se inventa para un día que ya pasó.
    const jornadaHoy = jornadaPeru_(INICIO_JORNADA);
    const jornadaStr = fechaPedida || jornadaHoy;
    const esHoy      = jornadaStr === jornadaHoy;
    /** La jornada a la que pertenece un instante cualquiera. */
    const jornadaDe_ = (ms) => (ms ? jornadaPeru_(INICIO_JORNADA, new Date(ms)) : "");
    /** "2026-09-28" + n días, en el calendario (Date.UTC normaliza mes y año). */
    const masDias_ = (ymd, n) => {
      const [a, m, d] = String(ymd).split("-").map(Number);
      return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
    };
    const thirtyDaysAgo = esHoy ? fechaPeruMenosDias_(30) : masDias_(jornadaStr, -30);


    // IMPORTANTE: las columnas de fecha son timestamptz y el servidor Postgres corre
    // en UTC. Un literal sin offset ("2026-08-06T00:00:00") se interpreta como UTC,
    // o sea las 19:00 del día anterior en Perú, y se colaban los cierres de la noche
    // previa. El corte de jornada SIEMPRE tiene que llevar el offset de Perú.
    // Perú no aplica horario de verano, así que -05:00 es constante.
    const PE_OFFSET  = "-05:00";
    // La ventana ya no arranca a medianoche sino a la hora en que abre el
    // taller: lo de antes de las 05:00 pertenece a la jornada anterior y entra
    // por su propia pestaña, no por esta.
    const inicioJornada_ = (ymd) => encodeURIComponent(`${ymd}T${INICIO_JORNADA}:00${PE_OFFSET}`);
    const hoy00      = inicioJornada_(jornadaStr);
    const hace30d00  = inicioJornada_(thirtyDaysAgo);
    // El cierre de la ventana. Para hoy no hace falta (nada está en el futuro),
    // y ponerlo igual costaría un filtro más en cada consulta.
    const fin00      = inicioJornada_(masDias_(jornadaStr, 1));
    const topeAsig_  = esHoy ? "" : `&fecha_asignacion=lt.${fin00}`;
    const topeUpd_   = esHoy ? "" : `&updated_at=lt.${fin00}`;
    // El instante en que esa jornada terminó, para poder preguntar por una fila
    // "¿esto se cerró DENTRO del día que estoy mirando?".
    const finMs = Date.parse(`${masDias_(jornadaStr, 1)}T${INICIO_JORNADA}:00${PE_OFFSET}`);

    /**
     * ¿Esta fila se cerró DESPUÉS de la jornada que se está mirando?
     *
     * Pasa de verdad: una mitad que se empieza el martes y se queda abierta la
     * cierra alguien el miércoles por la mañana. La fila entra por Q1 (se creó
     * el martes) y llega con estado FINALIZADO, así que sin esta pregunta el
     * martes se apuntaba un cierre que no fue suyo — y encima en la franja que
     * tocara por la hora del miércoles. Al cierre del martes ese trabajo
     * estaba ABIERTO, y así es como tiene que contar.
     *
     * Hoy nunca aplica: nada se cierra en el futuro.
     */
    const cerradoDespues_ = (asg) =>
      !esHoy && asg.estado_actual === "FINALIZADO" &&
      Number.isFinite(finMs) && (Date.parse(asg.updated_at || "") || 0) >= finMs;




    const selectFields =
      `id,work_order_id,user_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,fecha_asignacion,updated_at,activo,` +
      `usuarios!inner(id,nombre,email),` +
      `work_orders(id,vin,tipo_ramal,tipo_ot,estado_general)`;

    // Q1: Asignaciones creadas hoy (activas o no)
    let url1 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&fecha_asignacion=gte.${hoy00}${topeAsig_}&order=updated_at.desc`;


    // Q2: Trabajos empezados días anteriores pero finalizados HOY (cuentan como carro de hoy)
    // `activo=eq.true` igual que Q1: sin él, un carro anulado que se cerró hoy
    // entraba por esta puerta aunque Q1 lo estuviera excluyendo.
    let url2 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&estado_actual=eq.FINALIZADO&updated_at=gte.${hoy00}${topeUpd_}&fecha_asignacion=lt.${hoy00}&order=updated_at.desc`;


    // Q3: Todos los usuarios activos con rol técnico (para mostrar DESCONECTADO)
    const url3 = `${SUPABASE_URL}/rest/v1/usuarios?select=id,nombre,email,rol,especialidad&activo=eq.true&rol=in.(TECNICO,CALIDAD,RAMALERO)&order=nombre.asc`;

    // Q5: Trabajos de días anteriores que siguen abiertos ("arrastre").
    // NO cuentan como producción de hoy (ni finalizados ni en proceso): solo sirven
    // para saber en qué está parado ahora mismo un técnico que no abrió nada hoy.
    const url5 = `${SUPABASE_URL}/rest/v1/asignaciones?select=${selectFields}&activo=eq.true&estado_actual=in.(TRABAJANDO,PAUSADO,SIN_INICIAR)&fecha_asignacion=lt.${hoy00}&order=updated_at.desc`;

    // El arrastre es estado de AHORA MISMO, no del día que se está mirando: en
    // una jornada pasada no se pide. Lo que un técnico tenga abierto esta tarde
    // no dice nada de lo que hizo el martes.
    //
    // La asistencia sí se pide siempre, pero se usa distinto: quién marcó ese
    // día (para las faltas) es un hecho del día; "está dentro ahora" solo se
    // pinta en vivo, porque sobre un día cerrado sería afirmar algo que nadie
    // midió. Hoy la clave es jornadaFecha_() —corte a las 06:00, ver arriba—.
    const [resp1, resp2, resp3, resp5, duplasAuto, asistencia] = await Promise.all([
      fetch(url1, { method: "GET", headers }),
      fetch(url2, { method: "GET", headers }),
      fetch(url3, { method: "GET", headers }),
      esHoy ? fetch(url5, { method: "GET", headers }) : null,
      duplasAutoDeHoy_(SUPABASE_URL, headers, jornadaStr),
      asistenciaDeHoy_(SUPABASE_URL, headers, esHoy ? jornadaFecha_() : jornadaStr),
    ]);

    if (!resp1.ok) {
      const text = await resp1.text().catch(() => "");
      throw new Error(`Supabase Q1: ${resp1.status} ${text.slice(0, 200)}`);
    }
    const [raw1, raw2, allUsers, raw5] = await Promise.all([
      resp1.json(),
      resp2.json().catch(() => []),
      resp3.json().catch(() => []),
      resp5 ? resp5.json().catch(() => []) : [],
    ]);


    // Q4: último rol_trabajo conocido, SOLO de los técnicos con especialidad
    // AMBOS — son los únicos para los que se consulta (ver defaultRolTrabajo_).
    //
    // Antes salía en paralelo con las demás y sin filtro de usuario: 1000 filas
    // y 119 KB de los ~135 KB que costaba el endpoint entero, para deducir el
    // rol de un puñado de personas. Hoy en el taller no hay ningún técnico
    // AMBOS, así que esa consulta se pagaba entera para alimentar un mapa que
    // nadie llegaba a leer.
    //
    // Cuesta un viaje extra porque necesita la lista de usuarios (Q3), pero solo
    // sale cuando de verdad hay algún AMBOS, y el endpoint va cacheado.
    const idsAmbos = (allUsers || [])
      .filter(u => u.rol === "TECNICO" && u.especialidad === "AMBOS")
      .map(u => u.id);
    let recentAsg = [];
    if (idsAmbos.length) {
      const url4 = `${SUPABASE_URL}/rest/v1/asignaciones?select=user_id,rol_trabajo,updated_at` +
        `&activo=eq.true` +
        `&fecha_asignacion=gte.${hace30d00}&user_id=in.(${idsAmbos.join(",")})` +
        `&order=updated_at.desc&limit=${cfg.LIM_ASG_RECIENTES}`;
      recentAsg = await fetch(url4, { method: "GET", headers })
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
    }
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
          // En un día pasado, la mitad que se cerró DESPUÉS no puede entrar: si
          // entrara, el carro saldría completo en una foto en la que todavía
          // estaba a medias.
          topeUpd_ +
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
    // Y el día de ese cierre es el de su JORNADA, no el del calendario: la
    // mitad cerrada a la 01:00 la cerró el turno de la noche anterior, y ahí
    // es donde tiene que sumar. Ver jornadaDe_ arriba.
    // Guardado por rol y no como dos booleanos sueltos: para decir QUÉ mitad
    // falta y QUIÉN cerró la otra hace falta el cuándo y el quién, no solo el si.
    const vinConv = {}; // vin → { roles: {MOTOR|TANQUE: {fin, ms, nombre}}, hasActive, ultFinMs }
    const vinCal  = {}; // vin → { done, active, ultFinMs }
    for (const asg of [...raw, ...hermanas]) {
      if (asg._arrastre) continue;               // trabajo de días previos: no es producción de hoy
      const wo     = Array.isArray(asg.work_orders) ? asg.work_orders[0] : (asg.work_orders || {});
      const vin    = wo.vin || "";
      if (!vin) continue;
      // Las mitades hermanas vienen sin el usuario embebido: se cerraron otro
      // día y solo interesan para saber que están hechas.
      const user   = Array.isArray(asg.usuarios) ? asg.usuarios[0] : (asg.usuarios || {});
      const tipoOt = (asg.tipo_ot || "CONVERSION").toUpperCase(); // las hermanas ya vienen filtradas
      const rol    = (asg.rol_trabajo || "").toUpperCase();
      const done   = asg.estado_actual === "FINALIZADO" && !cerradoDespues_(asg);

      const ms     = Date.parse(asg.updated_at || "") || 0;
      if (tipoOt === "CONVERSION") {
        if (!vinConv[vin]) vinConv[vin] = { roles: {}, hasActive: false, ultFinMs: 0 };
        const v = vinConv[vin];
        if (ROLES_CONV.includes(rol)) {
          // Una mitad cerrada manda sobre una fila abierta del mismo rol: que
          // otra siga abierta no devuelve a medias lo que alguien ya terminó.
          const prev = v.roles[rol];
          if (!prev?.fin) v.roles[rol] = { fin: done, ms, nombre: user.nombre || prev?.nombre || "" };
          if (!done) v.hasActive = true;
        }
        if (done && ms > v.ultFinMs) v.ultFinMs = ms;
      } else if (tipoOt === "CALIDAD") {
        if (!vinCal[vin])  vinCal[vin] = { done: false, active: false, ultFinMs: 0 };
        if (done) {
          vinCal[vin].done = true;
          if (ms > vinCal[vin].ultFinMs) vinCal[vin].ultFinMs = ms;
        } else {
          vinCal[vin].active = true;
        }
      }
    }
    const convCompleto_ = (v) => ROLES_CONV.every(r => v.roles[r]?.fin);
    const cerradoHoy_   = (v) => convCompleto_(v) && jornadaDe_(v.ultFinMs) === jornadaStr;

    const convDone   = Object.values(vinConv).filter(cerradoHoy_).length;
    const convActive = Object.values(vinConv).filter(v => !convCompleto_(v)).length;
    const calDone    = Object.values(vinCal).filter(v => v.done).length;
    const calActive  = Object.values(vinCal).filter(v => v.active && !v.done).length;

    // ── Forma de la jornada y acumulado del mes ───────────────────────────────
    // El objetivo del sábado es medio: sin esto el panel marca rojo cada sábado
    // por un objetivo que nadie se ha propuesto cumplir.
    const ym     = jornadaStr.slice(0, 7);
    const diaHoy = Number(jornadaStr.slice(8, 10));
    const { transcurridas, totales, pesoHoy } =
      jornadasDelMes_(ym, diaHoy, Number(cfg.JORNADA_SABADO_FACTOR) || 0);
    const metaDia = Math.round(metaConv * pesoHoy);

    // Cache propio y sin topics: los días ya cerrados no cambian, así que no
    // tiene sentido que un cierre de HOY los invalide y obligue a releer el mes.
    const mesPrevio = await cachedByTopics_(
      `supervisor:live:mes:${ym}:${jornadaStr}`, [], cfg.LIVE_CACHE_MES_MS,
      () => convMesPrevio_(SUPABASE_URL, headers, cfg, ym, hoy00),
    ).catch(() => ({ convDone: 0, truncado: false, ok: false }));

    const mes = {
      ym,
      convDone:    mesPrevio.convDone + convDone,
      metaAcum:    Math.round(transcurridas * metaConv),
      metaMes:     Math.round(totales * metaConv),
      jornadas:    transcurridas,
      jornadasMes: totales,
      // Si la lectura del mes falló o topó el límite de filas, el acumulado es
      // un piso, no un dato. La vista lo dice en vez de fingir precisión.
      parcial:     !mesPrevio.ok || !!mesPrevio.truncado,
    };

    // ── Cuándo cerró cada carro ───────────────────────────────────────────────
    //
    // Va la lista de instantes, no un conteo por hora. Los cortes que lleva el
    // taller caen en :20 (16:20, 19:20), así que un array de 24 horas no los
    // puede representar: el corte de las 16:20 partiría la hora 16 por la
    // mitad. Con los instantes, el cliente agrupa donde el taller corte hoy y
    // donde corte mañana, sin tocar el servidor.
    //
    // Son unas decenas de números por día: cuesta menos que el conteo que
    // sustituye, porque este no viene duplicado en dos arrays de 24.
    const cierres = { conv: [], cal: [] };
    for (const v of Object.values(vinConv)) if (cerradoHoy_(v)) cierres.conv.push(v.ultFinMs);
    for (const v of Object.values(vinCal)) {
      if (v.done && jornadaDe_(v.ultFinMs) === jornadaStr) cierres.cal.push(v.ultFinMs);
    }
    cierres.conv.sort((a, b) => a - b);
    cierres.cal.sort((a, b) => a - b);

    // El detalle de esos mismos cierres: qué carro y de qué modelo. Va aparte
    // de `cierres` porque los gráficos y la matriz solo quieren los instantes.
    const detConv = Object.entries(vinConv).filter(([, v]) => cerradoHoy_(v))
      .map(([vin, v]) => ({ vin, ms: v.ultFinMs }));
    const detCal  = Object.entries(vinCal)
      .filter(([, v]) => v.done && jornadaDe_(v.ultFinMs) === jornadaStr)
      .map(([vin, v]) => ({ vin, ms: v.ultFinMs }));
    const modelos = await modelosDeVins_(SUPABASE_URL, headers, cfg,
      new Set([...detConv, ...detCal].map(c => c.vin))).catch(() => ({}));
    const cierresDet = {
      conv: detConv.map(c => ({ ...c, modelo: modelos[c.vin] || "" })).sort((a, b) => b.ms - a.ms),
      cal:  detCal.map(c => ({ ...c, modelo: modelos[c.vin] || "" })).sort((a, b) => b.ms - a.ms),
    };

    // ── Carros a medias: una mitad cerrada y la otra no ───────────────────────
    // Es la pregunta que el LIVE no sabía responder ("¿qué carro está
    // esperando?") teniendo el dato en la mano: hasta ahora vinConv alimentaba
    // un contador y se descartaba entero.
    const carrosMedios = [];
    for (const [vin, v] of Object.entries(vinConv)) {
      const hechas = ROLES_CONV.filter(r => v.roles[r]?.fin);
      if (hechas.length !== 1) continue;   // ni recién empezado ni terminado
      const hecho = hechas[0];
      const falta = ROLES_CONV.find(r => r !== hecho);
      carrosMedios.push({
        vin,
        hecho,
        falta,
        cerroNombre:  v.roles[hecho].nombre || "",
        cerroMs:      v.roles[hecho].ms || 0,
        faltaEnCurso: !!v.roles[falta],   // la otra mitad existe y está abierta
      });
    }
    carrosMedios.sort((a, b) => a.cerroMs - b.cerroMs);  // el que más lleva esperando, primero

    const vinsSummary = { convDone, convActive, calDone, calActive, metaConv, metaCal, metaDia };

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
        cerradoDespues: cerradoDespues_(asg),
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
      // Cerrado al día siguiente = abierto al cierre de ESTA jornada.
      const finalizados = asgList.filter(a => a.estado === "FINALIZADO" && !a.cerradoDespues);
      const activos     = asgList.filter(a => a.estado !== "FINALIZADO" || a.cerradoDespues);


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
        // La marca del ramal en curso. Un ramal no tiene VIN sino un código
        // inventado, y sin esto la card solo podía pintar ese código.
        tipoRamalActivo: current?.tipo_ramal || "",
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
        tipoRamalActivo: "",
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

    // 4b. Asistencia: quién está dentro del taller ahora mismo.
    //
    // `null` y "FUERA" dicen cosas distintas y la vista las pinta distinto:
    // null es "este módulo no sabe nada de esta persona" (no marcó nunca, o el
    // despacho está apagado) y FUERA es "marcó salida". Colapsarlos haría que,
    // con el despacho apagado, el taller entero apareciera como ausente.
    if (esHoy && asistencia.size) {
      for (const t of techs) {
        const a = asistencia.get(t.userId);
        t.asistencia   = a?.estado || null;
        t.asistenciaAt = a?.ingreso_at || null;
      }
    }

    // 4c. Faltas: la plantilla de conversión cruzada con el QR del día.
    //
    // Solo conversión (MOTOR/TANQUE): es la única que marca el QR, así que
    // calidad o ramales "sin marca" no dirían nada. Si NADIE marcó ese día
    // (domingo, despacho apagado, una jornada de antes del QR) no hay contra
    // qué cruzar y se manda null: inventar 20 faltas sería peor que no decir nada.
    //
    // Quien trabajó sin marcar va aparte y no cuenta como falta: estuvo, pero
    // el motor de despacho no lo ve y no le reparte carro.
    let asistenciaConv = null;
    if (asistencia.size) {
      // El arrastre no cuenta: un carro abierto ayer no dice que hoy vino.
      const conActividad = new Set([...techMap.values()]
        .filter(t => t.assignments.some(a => !a.arrastre)).map(t => t.userId));
      const plantilla = (allUsers || [])
        .filter(u => u.rol === "TECNICO")
        .map(u => ({ userId: u.id, nombre: u.nombre || u.email || "", rol: defaultRolTrabajo_(u) }));
      const marcaron  = plantilla.filter(p => asistencia.has(p.userId));
      const sinMarca  = plantilla.filter(p => !asistencia.has(p.userId));
      asistenciaConv = {
        plantilla: plantilla.length,
        marcaron:  marcaron.length,
        faltaron:  sinMarca.filter(p => !conActividad.has(p.userId)),
        sinMarcar: sinMarca.filter(p => conActividad.has(p.userId)),
      };
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
    return {
      ok: true, techs, fecha: jornadaStr, esHoy, vinsSummary,
      mes, cierres, cierresDet, carrosMedios, asistenciaConv,
      _timing: `${duration}ms`,
    };

  }
}

/**
 * La jornada que pide el panel, o null para "la de ahora".
 *
 * Se valida aquí y no en el armado porque el valor entra en la clave del cache:
 * un "2026-9-1" o un "../../etc" sueltos ensuciarían el cache con una entrada
 * por cada variante. Tampoco se admite el futuro — no hay nada que mirar — ni
 * más atrás del tope: el LIVE lee la jornada entera por técnico, y dejar pedir
 * 2019 es un escaneo gratis para cualquiera con la sesión abierta.
 */
const LIVE_DIAS_ATRAS = 120;

export function jornadaPedida_(req, hoyStr) {
  const q = String(req?.query?.fecha || "").trim();

  if (!q) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q)) return null;
  if (q > hoyStr) return null;                       // el futuro no tiene cortes
  const [a, m, d] = q.split("-").map(Number);
  const ms = Date.UTC(a, m - 1, d);
  if (!Number.isFinite(ms)) return null;
  // Fecha real (un "2026-02-31" se normaliza a marzo y no es el día que pidió).
  if (new Date(ms).toISOString().slice(0, 10) !== q) return null;
  const [ha, hm, hd] = hoyStr.split("-").map(Number);
  const dias = Math.round((Date.UTC(ha, hm - 1, hd) - ms) / 86_400_000);
  if (dias > LIVE_DIAS_ATRAS) return null;
  return q === hoyStr ? null : q;
}

router.get("/api/supervisor/live", async (req, res) => {
  try {
    const cfg = await getConfig_();

    // La clave lleva la MISMA fecha que el payload, y desde que el LIVE cuenta
    // por jornada esa fecha es la de la jornada, no la civil. La regla es que
    // clave y contenido se muevan juntos: con la civil, a las 00:30 la clave
    // saltaría de día mientras el contenido sigue siendo de la jornada de
    // anoche, y el cache serviría la pestaña equivocada justo en la madrugada
    // que se acaba de arreglar.
    const hoyStr = jornadaPeru_(cfg.LIVE_JORNADA_INICIO || "05:00");
    const fecha  = jornadaPedida_(req, hoyStr);

    // Una jornada cerrada ya no se mueve: se cachea mucho más tiempo que la de
    // hoy, y por eso cada fecha lleva su propia clave. Las de días pasados
    // siguen escuchando los mismos topics porque un cierre tardío (alguien que
    // olvidó cerrar y lo hace al día siguiente) sí cambia la foto de ayer.
    const payload = await cachedByTopics_(
      `supervisor:live:${fecha || hoyStr}`,
      TOPICS_LIVE,
      fecha ? cfg.LIVE_CACHE_MES_MS : cfg.SRV_CACHE_PESADO_MS,
      () => armarLiveSupervisor_(fecha),
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
