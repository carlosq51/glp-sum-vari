import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { isValidOT_, fechaPeruMenosDias_ } from "../lib/utils.js";
import { emitEvent_ } from "../lib/events.js";
import { getConfig_ } from "../lib/config.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";

const router = Router();

// Topics que invalidan el cache de las vistas del movilizador: cualquier cosa
// que mueva un VIN por el flujo (traslado propio, OT abierta o cerrada por un
// técnico, cambio de zona) tiene que verse en la pantalla del taller al toque.
//
// "asignaciones" NO está aquí a propósito. Es el topic más ruidoso del sistema
// (~130 mutaciones al día: cada avance de un técnico) y de esta vista solo
// mueve UN dato — la fecha de fin que list2 saca de las asignaciones
// FINALIZADAS. Tenerlo dentro obligaba a recalcular las ~210 KB de /status en
// cada avance (~27 MB/día de egress) para cambiar una hora en pantalla. Lo que
// de verdad mueve un VIN de lista es que su OT cambie de estado, y eso emite
// "work_orders", que sí invalida. La fecha, como mucho, llega un ciclo tarde.
const TOPICS_MOV = ["movilizador", "work_orders", "zonas"];

/**
 * Desde qué fecha mira el movilizador ("YYYY-MM-DD", o "" = sin filtro).
 *
 * Por defecto es una ventana MÓVIL de MOV_VENTANA_DIAS días hacia atrás. La
 * fecha fija que había antes envejecía sola: nadie la mueve, y a los meses las
 * listas rozaban las 1000 filas del tope de PostgREST — se descargaba el
 * histórico entero en cada refresco y encima venía recortado sin avisar.
 *
 * MOV_VENTANA_DIAS = 0 devuelve el mando a FECHA_CORTE_MOVILIZADOR, para
 * cuando alguien necesite abrir la ventana a una revisión histórica puntual.
 */
function fechaCorteMovilizador_(cfg) {
  const dias = Number(cfg.MOV_VENTANA_DIAS) || 0;
  if (dias > 0) return fechaPeruMenosDias_(dias);
  return cfg.FECHA_CORTE_MOVILIZADOR || "";
}

/**
 * Desde qué fecha cuenta un traslado como "vivo" ("" = sin filtro).
 *
 * movilizador_traslados guarda UNA fila por VIN y solo cambia de estado; nada
 * la cierra. Sin filtro, un VIN registrado como EN_ESPERA_CONVERSION que nunca
 * llegó a convertirse se queda en la pantalla de Ingreso para siempre: al
 * escribir esto había 141 traslados activos, 53 de más de 20 días y el más
 * viejo de hacía tres meses y medio. El movilizador leía su lista de hoy
 * mezclada con el cementerio de mayo.
 *
 * La ventana es MÁS ANCHA que la de las OTs (MOV_VENTANA_DIAS) porque el
 * registro de entrada ocurre ANTES de la conversión: si fuera igual o menor,
 * un carro que espera turno más días que la ventana desaparecería de Ingreso
 * justo mientras sigue en el patio.
 *
 * Lo que cae fuera NO se tira: vuelve en `olvidados` para que la vista lo
 * muestre aparte. Un VIN que se esfuma en silencio es peor que uno viejo.
 */
function fechaCorteTraslados_(cfg) {
  const dias = Number(cfg.MOV_VENTANA_TRASLADOS_DIAS) || 0;
  return dias > 0 ? fechaPeruMenosDias_(dias) : "";
}

// ─── MOVILIZADOR STATUS ───────────────────────────────────────────────
// GET /api/movilizador/status
// Devuelve las 3 listas del flujo movilizador + fecha_corte activa
router.get("/api/movilizador/status", async (req, res) => {
  try {
    const cfg = await getConfig_();
    const fechaCorte = fechaCorteMovilizador_(cfg);
    const corteTraslados = fechaCorteTraslados_(cfg);

    // Las fechas de corte entran en la CLAVE del cache, no solo en la consulta:
    // al cruzar la medianoche las ventanas se desplazan un día y la entrada
    // vieja dejaría de corresponder a lo que se está pidiendo.
    const payload = await cachedByTopics_(
      `movilizador:status:${fechaCorte}:${corteTraslados}`, TOPICS_MOV, cfg.SRV_CACHE_PESADO_MS, async () => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 2. CONVERSION FINALIZADO

    // Sin `asignaciones(...)` embebido a propósito: ese embed duplicaba el peso
    // de la respuesta (366 KB → 189 KB al quitarlo) para calcular la fecha de
    // fin de un puñado de VINs. Las asignaciones se piden abajo, solo para los
    // que terminan en list2. El resto de la respuesta es idéntica.
    let convUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&select=id,vin,fecha_creacion,created_at,numero_ot`;
    if (fechaCorte) convUrl += `&created_at=gte.${fechaCorte}T00:00:00`;
    convUrl += `&order=fecha_creacion.asc`;
    const convResp = await fetch(convUrl, { method: "GET", headers });
    const convRows = convResp.ok ? await convResp.json() : [];

    // 3. Traslados movilizador — solo estados activos (excluye ENTREGADO_FINAL).
    // La tabla acumula un registro por VIN histórico; sin filtro, Supabase trunca
    // a 1000 filas y VINs "viejos" desaparecen del trasMap aunque tengan estado activo.
    // Los ENTREGADO_FINAL se chequean por separado en list3 (ver abajo).
    const trasResp = await fetch(
      `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=neq.ENTREGADO_FINAL&select=vin,estado,trasladado_at,trasladado_por,entregado_at,entregado_por`,
      { method: "GET", headers }
    );
    const trasRows = trasResp.ok ? await trasResp.json() : [];

    // La fila se sigue bajando entera (son ~140, 24 KB: partirla en dos
    // consultas no ahorraría nada) pero se separa aquí: `trasMap` es lo que
    // alimenta las listas del día, `trasOlvidados` lo que lleva meses sin que
    // nadie lo mueva y se devuelve aparte. El corte mira el ÚLTIMO movimiento
    // (entregado_at si lo hubo, si no el ingreso), no la fecha de entrada.
    const corteTrasMs = corteTraslados ? Date.parse(`${corteTraslados}T00:00:00Z`) : 0;
    const trasMap = new Map();
    const trasOlvidados = new Map();
    for (const t of (trasRows || [])) {
      if (!t.vin) continue;
      const ultimoMov = Date.parse(t.entregado_at || t.trasladado_at || "") || 0;
      if (corteTrasMs && ultimoMov && ultimoMov < corteTrasMs) trasOlvidados.set(t.vin, t);
      else trasMap.set(t.vin, t);
    }

    // Lista diaria vigente: Ingreso solo trabaja con estos VINs. Sin este
    // filtro, carros de hace un mes que quedaron en movilizador_traslados
    // seguían apareciendo entre los del día.
    const listaDiariaResp = await fetch(`${SUPABASE_URL}/rest/v1/lista_diaria_activa?select=vin`, { method: "GET", headers });
    const listaDiariaRows = listaDiariaResp.ok ? await listaDiariaResp.json() : null;
    // Si la consulta falla no se filtra: mejor ver de más que un Ingreso vacío.
    const enListaDiaria = listaDiariaRows
      ? new Set(listaDiariaRows.map(r => String(r.vin || "").trim().toUpperCase()).filter(Boolean))
      : null;
    const enLista_ = vin => !enListaDiaria || enListaDiaria.has(String(vin || "").trim().toUpperCase());

    // 4. CALIDAD FINALIZADO (con filtro de fecha de corte)
    let calUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CALIDAD&estado_general=eq.FINALIZADO&select=vin,fecha_creacion,created_at`;
    if (fechaCorte) calUrl += `&fecha_creacion=gte.${fechaCorte}T00:00:00`;
    calUrl += `&order=fecha_creacion.desc`;
    const calResp = await fetch(calUrl, { method: "GET", headers });
    const calRows = calResp.ok ? await calResp.json() : [];
    const calidadDoneMap = new Map();
    for (const wo of (calRows || [])) {
      if (wo.vin && !calidadDoneMap.has(wo.vin)) calidadDoneMap.set(wo.vin, wo);
    }

    // 4b. CALIDAD ACTIVA (PENDIENTE o EN PROCESO) — para saber si el inspector está trabajando
    // Con la misma fecha de corte que el resto: era la única consulta del
    // endpoint sin filtro, y una OT de calidad que nadie cierra se quedaba
    // marcando "EN REVISIÓN" en Zona de Espera indefinidamente.
    let calActivaUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CALIDAD&estado_general=in.(PENDIENTE,EN PROCESO)&select=vin,fecha_creacion,created_at`;
    if (fechaCorte) calActivaUrl += `&fecha_creacion=gte.${fechaCorte}T00:00:00`;
    const calActivaResp = await fetch(calActivaUrl, { method: "GET", headers });
    const calActivaRows = calActivaResp.ok ? await calActivaResp.json() : [];
    // Map vin → OT data para VINs con CALIDAD activa
    const calidadActivaMap = new Map();
    for (const wo of (calActivaRows || [])) {
      if (wo.vin && !calidadActivaMap.has(wo.vin)) calidadActivaMap.set(wo.vin, wo);
    }

    // 4c. CONVERSION ACTIVA (PENDIENTE o EN PROCESO) — para saber si técnico ya inició
    let convActivaUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=in.(PENDIENTE,EN%20PROCESO)&select=vin,created_at`;
    if (fechaCorte) convActivaUrl += `&created_at=gte.${fechaCorte}T00:00:00`;
    const convActivaResp = await fetch(convActivaUrl, { method: "GET", headers });
    const convActivaRows = convActivaResp.ok ? await convActivaResp.json() : [];
    const convActivaMap = new Set();
    for (const wo of (convActivaRows || [])) {
      if (wo.vin) convActivaMap.add(wo.vin);
    }

    // ─── Pendientes de calibración: conversión finalizada y sin OT de CALIDAD.
    //
    // Antes esta lista dependía del estado del traslado (solo entraba el que el
    // movilizador había marcado como TRASLADADO). En la práctica el movilizador
    // dejó de registrar ese movimiento, así que carros ya convertidos no
    // aparecían en ninguna parte. Lo que define a un pendiente de calibración
    // es la conversión terminada y la ausencia de calidad, no que alguien haya
    // pulsado un botón: el traslado ya no filtra nada.
    const convVinMap = new Map();
    // convAllMap: todos los CONVERSION FINALIZADO para lookup de numero_ot (incluye list3 VINs)
    const convAllMap = new Map();
    for (const wo of (convRows || [])) {
      if (!wo.vin) continue;
      const prev = convAllMap.get(wo.vin);
      if (!prev || new Date(wo.fecha_creacion) > new Date(prev.fecha_creacion)) {
        convAllMap.set(wo.vin, wo);
      }
      if (calidadDoneMap.has(wo.vin) || calidadActivaMap.has(wo.vin)) continue;
      const prev2 = convVinMap.get(wo.vin);
      if (!prev2 || new Date(wo.fecha_creacion) > new Date(prev2.fecha_creacion)) {
        convVinMap.set(wo.vin, wo);
      }
    }
    // Fecha fin = max updated_at de asignaciones FINALIZADAS (MOTOR/TANQUE).
    // Solo para las OTs pendientes de calibración: son decenas, no las 1000 que
    // traía el embed. Si la consulta falla se cae al fecha_creacion de la OT,
    // que es exactamente el fallback que ya tenía el cálculo anterior.
    const finPorWo = new Map();
    const pendWoIds = Array.from(convVinMap.values()).map(wo => wo.id).filter(Boolean);
    if (pendWoIds.length) {
      try {
        // En trozos: la lista puede rondar el millar de OTs y un solo `in.(...)`
        // con mil UUIDs produce una URL que el servidor rechaza — y el catch de
        // abajo lo tragaría en silencio, dejando todas las fechas en el
        // fallback sin que nada lo delate.
        const { LIM_VINS_POR_CONSULTA } = await getConfig_();
        const trozos = [];
        for (let i = 0; i < pendWoIds.length; i += LIM_VINS_POR_CONSULTA) {
          trozos.push(pendWoIds.slice(i, i + LIM_VINS_POR_CONSULTA));
        }
        const respuestas = await Promise.all(trozos.map(trozo =>
          fetch(
            `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=in.(${trozo.join(",")})` +
            // Una asignación anulada no fija la fecha de fin del carro: si es
            // la única, la OT cae a su fecha_creacion, que es el fallback que
            // este cálculo ya tenía previsto.
            `&activo=eq.true&estado_actual=eq.FINALIZADO&select=work_order_id,updated_at`,
            { method: "GET", headers }
          ).then(r => (r.ok ? r.json() : [])).catch(() => [])
        ));
        for (const filas of respuestas) {
          for (const a of (filas || [])) {
            const prev = finPorWo.get(a.work_order_id);
            if (!prev || new Date(a.updated_at) > new Date(prev)) {
              finPorWo.set(a.work_order_id, a.updated_at);
            }
          }
        }
      } catch (_) { /* silencioso: cae al fecha_creacion de la OT */ }
    }

    // Quién ya salió del taller. Se consulta antes de armar las listas porque
    // ENTREGADO_FINAL es lo único que saca a un carro de pendientes de
    // calibración sin pasar por calidad, y trasMap no lo trae (la consulta de
    // traslados excluye ese estado a propósito, ver arriba).
    const vinsSalida = new Set([...calidadDoneMap.keys(), ...convVinMap.keys()]);
    let entregadoFinalSet = new Set();
    if (vinsSalida.size > 0) {
      try {
        const efList = [...vinsSalida].map(v => `"${v}"`).join(",");
        const efResp = await fetch(
          `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=eq.ENTREGADO_FINAL&vin=in.(${efList})&select=vin`,
          { method: "GET", headers }
        );
        if (efResp.ok) {
          const efRows = await efResp.json();
          entregadoFinalSet = new Set((efRows || []).map(r => r.vin));
        }
      } catch (_) { /* silencioso */ }
    }

    // ─── Lista 0: en espera de conversión + en conversión activa
    const list0 = [];
    const list0Vins = new Set();

    // a) Registrados por movilizador como EN_ESPERA_CONVERSION
    for (const [vin, t] of trasMap) {
      if (t.estado !== "EN_ESPERA_CONVERSION") continue;
      if (convVinMap.has(vin)) continue; // conversión ya finalizada → pendiente de calibración
      if (!enLista_(vin)) continue;
      list0.push({
        vin,
        fecha_entrada: t.trasladado_at,
        registrado_por: t.trasladado_por || "",
        en_conversion: convActivaMap.has(vin),
      });
      list0Vins.add(vin);
    }

    // b) VINs con OT de conversión activa pero sin registro de entrada (movilizador no los registró)
    for (const vin of convActivaMap) {
      if (list0Vins.has(vin)) continue; // ya está por traslado
      if (convVinMap.has(vin)) continue; // conversión finalizada → pendiente de calibración
      if (!enLista_(vin)) continue;
      list0.push({
        vin,
        fecha_entrada: null,
        registrado_por: "",
        en_conversion: true,
        sin_registro: true,
      });
    }

    // Orden: primero En Espera, luego En Conversión.
    // Dentro de En Espera: el más VIEJO arriba (no el más nuevo). Esta lista
    // es la que delata un carro que se trajo y otra área se llevó antes de
    // que empiece su conversión — el que lleva más días esperando es el que
    // hay que mirar primero, no el que acaba de entrar.
    list0.sort((a, b) => {
      if (a.en_conversion !== b.en_conversion) return a.en_conversion ? 1 : -1;
      if (!a.en_conversion) return new Date(a.fecha_entrada || 0) - new Date(b.fecha_entrada || 0);
      return 0;
    });

    // ─── Lista 2: pendientes de calibración — convertidos, sin calidad.
    //
    // Los que están EN_REVISION quedan fuera (calidad ya les abrió OT): esos
    // dejaron de ser "falta de calibración", alguien ya los está calibrando.
    //
    // Cada carro trae sus dos relojes: desde que entró al taller (el registro
    // de ingreso del movilizador) y desde que terminó su conversión. El
    // segundo es el que importa para calidad; el primero delata al carro que
    // lleva semanas dentro sin que nadie lo cierre.
    const list2 = [];
    for (const [vin, wo] of convVinMap) {
      if (entregadoFinalSet.has(vin)) continue; // ya salió del taller
      const t = trasMap.get(vin);
      const fechaConversion = finPorWo.get(wo.id) || wo.fecha_creacion;
      list2.push({
        vin,
        // Ingreso registrado por el movilizador. Null cuando el carro entró sin
        // pasar por "marcar ingreso" — pasa, y es justo lo que conviene ver.
        fecha_entrada: t?.trasladado_at || null,
        fecha_conversion: fechaConversion,
        estado: t?.estado || null,
        registrado_por: t?.trasladado_por || "",
      });
    }
    // El que terminó su conversión hace más tiempo, arriba: es el que lleva
    // más esperando calidad.
    list2.sort((a, b) => new Date(a.fecha_conversion || 0) - new Date(b.fecha_conversion || 0));

    // ─── Lista 3: calidad finalizada (con o sin traslado registrado, excluye ENTREGADO_FINAL)
    const list3 = [];
    for (const [vin, wo] of calidadDoneMap) {
      if (entregadoFinalSet.has(vin)) continue;
      const tL3 = trasMap.get(vin);
      list3.push({
        vin,
        fecha_calidad: wo.fecha_creacion || wo.created_at,
        trasladado_por: tL3?.trasladado_por || "",
        destino: "",  // enriquecido abajo si la columna existe en vins
        tiene_ot: isValidOT_(convAllMap.get(vin)?.numero_ot),
      });
    }
    list3.sort((a, b) => new Date(b.fecha_calidad) - new Date(a.fecha_calidad));

    // Fallback sin-fecha para VINs sin OT: el convAllMap aplica fechaCorte sobre created_at,
    // por lo que WOs de conversión anteriores al corte quedan fuera aunque tengan numero_ot.
    // Esta consulta adicional (sin filtro de fecha) cubre esos casos.
    try {
      const sinOT = list3.filter(r => !r.tiene_ot);
      if (sinOT.length > 0) {
        const vinList = sinOT.map(r => `"${r.vin}"`).join(",");
        const otFallbackResp = await fetch(
          `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&vin=in.(${vinList})&select=vin,numero_ot&order=fecha_creacion.desc`,
          { method: "GET", headers }
        );
        if (otFallbackResp.ok) {
          const otFallbackRows = await otFallbackResp.json();
          const otFallbackMap = new Map();
          for (const row of (otFallbackRows || [])) {
            if (row.vin && !otFallbackMap.has(row.vin)) otFallbackMap.set(row.vin, row.numero_ot);
          }
          for (const item of list3) {
            if (!item.tiene_ot) item.tiene_ot = isValidOT_(otFallbackMap.get(item.vin));
          }
        }
      }
    } catch (_) { /* silencioso */ }

    // Enriquecer list3 con ultima_ubicacion desde tabla vins (fallback silencioso)
    try {
      if (list3.length > 0) {
        const vinList = list3.map(r => `"${r.vin}"`).join(",");
        const destiResp = await fetch(
          `${SUPABASE_URL}/rest/v1/vins?vin=in.(${vinList})&select=vin,ultima_ubicacion`,
          { method: "GET", headers }
        );
        if (destiResp.ok) {
          const destiRows = await destiResp.json();
          if (Array.isArray(destiRows)) {
            const destiMap = new Map(destiRows.map(r => [r.vin, r.ultima_ubicacion || ""]));
            for (const item of list3) {
              item.destino = destiMap.get(item.vin) || "";
            }
          }
        }
      }
    } catch (_) { /* columna ultima_ubicacion aún no existe en vins, se omite */ }

    // ─── Lista Diaria: todos los VINs del flujo de conversión del día ───
    const allConvVins = new Set();
    for (const wo of (convRows || [])) { if (wo.vin) allConvVins.add(wo.vin); }
    for (const vin of convActivaMap) { allConvVins.add(vin); }
    // Incluir también los registrados por el movilizador aunque no tengan OT aún
    // (trasMap ya excluye ENTREGADO_FINAL, así que todos sus VINs son activos)
    for (const [vin] of trasMap) {
      allConvVins.add(vin);
    }

    const listDiaria = [];
    for (const vin of allConvVins) {
      const t = trasMap.get(vin);
      if (entregadoFinalSet.has(vin)) continue; // ya entregado, no mostrar
      if (!enLista_(vin)) continue;

      let flow_status;
      const fecha_ot = convVinMap.get(vin)?.fecha_creacion || null;

      if (calidadDoneMap.has(vin)) {
        flow_status = "LISTA_SALIDA";
      } else if (calidadActivaMap.has(vin) || t?.estado === "ENTREGADO_CALIDAD") {
        flow_status = "EN_REVISION";
      } else if (t?.estado === "TRASLADADO") {
        flow_status = "EN_ZONA";
      } else if (convVinMap.has(vin)) {
        flow_status = "CONVERSION_DONE";
      } else if (convActivaMap.has(vin)) {
        flow_status = "EN_CONVERSION";
      } else if (t?.estado === "EN_ESPERA_CONVERSION") {
        flow_status = "EN_ESPERA";
      } else {
        flow_status = "PENDIENTE_ENTRADA";
      }

      listDiaria.push({
        vin,
        flow_status,
        fecha_ot,
        registrado: !!t,
        fecha_entrada: t?.trasladado_at || null,
      });
    }
    const flowOrder = { PENDIENTE_ENTRADA: 0, EN_ESPERA: 1, EN_CONVERSION: 2, CONVERSION_DONE: 3, EN_ZONA: 4, EN_REVISION: 5, LISTA_SALIDA: 6 };
    listDiaria.sort((a, b) => (flowOrder[a.flow_status] ?? 9) - (flowOrder[b.flow_status] ?? 9));

    // ─── Olvidados: traslados fuera de la ventana que nadie cerró ───
    // Se muestran aparte (panel plegado en Ingreso) en vez de desaparecer:
    // casi siempre es un carro que salió sin registrar la salida, y el
    // movilizador es el único que puede saberlo. Los que sí siguen vivos en
    // alguna lista (su OT es reciente aunque el ingreso sea viejo) no cuentan.
    // calidadActivaMap entra aparte: list2 ya NO trae los VINs en revisión
    // activa (ver arriba), pero uno de esos puede tener un traslado VIEJO
    // (revisión que se alarga semanas) y sin esto se marcaría "olvidado"
    // estando en realidad en manos de calidad ahora mismo.
    const vivos = new Set([
      ...list0.map(r => r.vin),
      ...list2.map(r => r.vin), ...list3.map(r => r.vin),
      ...calidadActivaMap.keys(),
    ]);
    const olvidados = [];
    for (const [vin, t] of trasOlvidados) {
      if (vivos.has(vin)) continue;
      if (!enLista_(vin)) continue;
      olvidados.push({
        vin,
        estado: t.estado,
        fecha: t.entregado_at || t.trasladado_at || null,
        registrado_por: t.trasladado_por || "",
      });
    }
    olvidados.sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));

    return {
      ok: true,
      fechaCorte,
      corteTraslados,
      list0,
      list2,
      list3,
      listDiaria,
      olvidados,
      counts: {
        list0: list0.length,
        list0_espera: list0.filter(r => !r.en_conversion).length,
        list0_conversion: list0.filter(r => r.en_conversion).length,
        list2: list2.length,
        list3: list3.length,
        listDiaria: listDiaria.length,
        listDiariaPendientes: listDiaria.filter(r => r.flow_status === "PENDIENTE_ENTRADA").length,
        olvidados: olvidados.length,
      },
    };
      }, { bypass: req.query.fresh === "1" });
    return res.json(payload);
  } catch (e) {
    console.error("[MOVILIZADOR_STATUS]", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/movilizador/traslado
// body: { vin, accion: "TRASLADAR" | "ENTREGAR_CALIDAD" | "ENTREGAR_FINAL", usuario }
router.post("/api/movilizador/traslado", async (req, res) => {
  try {
    const { vin, accion, usuario } = req.body || {};
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });
    if (!["TRASLADAR", "ENTREGAR_CALIDAD", "ENTREGAR_FINAL", "REGISTRAR_ENTRADA", "REGISTRAR_SALIDA"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "accion inválida: use TRASLADAR, ENTREGAR_CALIDAD, ENTREGAR_FINAL, REGISTRAR_ENTRADA o REGISTRAR_SALIDA" });
    }
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();
    const userName = String(usuario || "").trim();
    const vinNorm = String(vin || "").trim().toUpperCase();

    // ── Validación #OT antes de confirmar salida final ──────────────────
    if (accion === "ENTREGAR_FINAL") {
      const otCheckResp = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&vin=eq.${encodeURIComponent(vinNorm)}&estado_general=eq.FINALIZADO&select=id,numero_ot&order=fecha_creacion.desc&limit=1`,
        { method: "GET", headers }
      );
      const otCheckRows = otCheckResp.ok ? await otCheckResp.json() : [];
      if (!isValidOT_(otCheckRows[0]?.numero_ot)) {
        return res.status(400).json({
          ok: false,
          error: "❌ #OT no registrado: registre el número de OT en ASIGNACIONES (columna E) antes de confirmar la salida del vehículo."
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────

    const data = accion === "TRASLADAR"
      ? { vin: vinNorm, estado: "TRASLADADO", trasladado_at: now, trasladado_por: userName }
      : accion === "ENTREGAR_CALIDAD"
        ? { vin: vinNorm, estado: "ENTREGADO_CALIDAD", entregado_at: now, entregado_por: userName }
        : accion === "REGISTRAR_ENTRADA"
          ? { vin: vinNorm, estado: "EN_ESPERA_CONVERSION", trasladado_at: now, trasladado_por: userName }
          : accion === "REGISTRAR_SALIDA"
            ? { vin: vinNorm, estado: "TRASLADADO", trasladado_at: now, trasladado_por: userName }
            : { vin: vinNorm, estado: "ENTREGADO_FINAL", entregado_at: now, entregado_por: userName };

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?on_conflict=vin`, {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[MOVILIZADOR_TRASLADO_SUPABASE]", resp.status, text);
      return res.status(resp.status >= 400 && resp.status < 500 ? resp.status : 502).json({
        ok: false,
        error: `No se pudo guardar el traslado (${resp.status}).`,
        detail: text.slice(0, 500),
      });
    }
    emitEvent_("movilizador", { accion: "TRASLADO", vin: vinNorm });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[MOVILIZADOR_TRASLADO]", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/movilizador/pendientes  (misma lógica, accesible al movilizador)
router.get("/api/movilizador/pendientes", async (req, res) => {
  try {
    const { SRV_CACHE_PESADO_MS } = await getConfig_();
    const payload = await cachedByTopics_(
      "movilizador:pendientes", TOPICS_MOV, SRV_CACHE_PESADO_MS, async () => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // La lista diaria manda: son unas decenas de VINs. Antes se descargaban
    // movilizador_traslados y vins ENTEROS (2000 filas, ~124 KB) para consultar
    // esos pocos — y encima ambas chocaban con el tope de 1000 filas de
    // PostgREST, así que un VIN viejo podía salir como "sin registrar" estando
    // registrado. Ahora se pregunta solo por los VINs de la lista.
    const listaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/lista_diaria_activa?select=vin,fecha_asignacion&order=fecha_asignacion.asc,vin.asc`,
      { method: "GET", headers }
    );
    const listaRows = listaResp.ok ? await listaResp.json() : [];

    const vinsLista = [...new Set((listaRows || []).map(r => r.vin).filter(Boolean))];
    if (!vinsLista.length) return { ok: true, sin_registrar: [] };

    const inList = vinsLista.map(v => `"${v}"`).join(",");
    const [trasResp, vinsResp, woResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?vin=in.(${inList})&select=vin`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/vins?vin=in.(${inList})&select=vin,ultima_ubicacion`, { method: "GET", headers }),
      // Una OT de CONVERSION ya es prueba de que el carro está físicamente en
      // el taller: un técnico lo trabajó. Sin esto, un VIN que entró sin pasar
      // por "marcar ingreso" del movilizador (caso real, no debería pasar pero
      // pasa) quedaba en "sin registrar" para siempre, aunque ya esté FINALIZADO.
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&vin=in.(${inList})&select=vin`, { method: "GET", headers }),
    ]);
    const trasRows = trasResp.ok ? await trasResp.json() : [];
    const vinsRows = vinsResp.ok ? await vinsResp.json() : [];
    const woRows   = woResp.ok   ? await woResp.json()   : [];

    const registrado = new Set((trasRows || []).map(t => t.vin));
    (woRows || []).forEach(w => { if (w.vin) registrado.add(w.vin); });
    const ubicMap    = new Map((vinsRows || []).map(v => [v.vin, v.ultima_ubicacion || ""]));
    const sin_registrar = (listaRows || [])
      .filter(r => !registrado.has(r.vin))
      .map(r => ({ vin: r.vin, fecha: r.fecha_asignacion, ubicacion: ubicMap.get(r.vin) || "" }));
    return { ok: true, sin_registrar };
      }, { bypass: req.query.fresh === "1" });
    return res.json(payload);
  } catch (e) {
    console.error("[MOV_PENDIENTES]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/movilizador/revalidate-ot?vins=VIN1,VIN2,...
// Consulta ligera: dado un set de VINs sin OT, devuelve cuáles ya tienen OT válida.
// Usado por el re-validador de 8 min del frontend para actualizar el estado sin
// llamar al endpoint completo /status.
router.get("/api/movilizador/revalidate-ot", async (req, res) => {
  try {
    const raw = String(req.query.vins || "").trim();
    if (!raw) return res.json({ ok: true, vins_con_ot: [] });

    const vins = raw.split(",")
      .map(v => v.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50); // máx 50 VINs por llamada

    if (!vins.length) return res.json({ ok: true, vins_con_ot: [] });

    const { SRV_CACHE_PESADO_MS } = await getConfig_();

    // Cacheado como el resto: todos los dispositivos con la pantalla de Salida
    // abierta preguntan por el MISMO conjunto de VINs (los que a esa hora no
    // tienen #OT), así que la clave se ordena para que coincidan. Sin esto era
    // el único endpoint del movilizador que iba directo a Supabase, N veces
    // cada POLL_OT_RECHECK_MS.
    //
    // Aquí la frescura la da el TTL, no el topic: quien escribe numero_ot es
    // obtenervin.js con un PATCH directo a Supabase, que no pasa por este
    // servidor y por tanto no emite "work_orders". El topic queda declarado
    // porque el día que el #OT se registre desde la app, invalidará al toque.
    const clave = [...vins].sort().join(",");
    const payload = await cachedByTopics_(
      `movilizador:revalidate-ot:${clave}`, ["work_orders"], SRV_CACHE_PESADO_MS, async () => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const vinFilter = vins.map(v => encodeURIComponent(v)).join(",");
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders` +
      `?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO` +
      `&vin=in.(${vinFilter})` +
      `&select=vin,numero_ot`,
      { method: "GET", headers }
    );
    const rows = resp.ok ? await resp.json() : [];

    // Para cada VIN tomar la fila con OT válida (puede haber varias OTs por VIN)
    const vins_con_ot = [];
    const seen = new Set();
    for (const row of (rows || [])) {
      if (!row.vin || seen.has(row.vin)) continue;
      if (isValidOT_(row.numero_ot)) {
        vins_con_ot.push(row.vin);
        seen.add(row.vin);
      }
    }

    return { ok: true, vins_con_ot };
      });
    return res.json(payload);
  } catch (e) {
    console.error("[MOV_REVALIDATE_OT]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/supervisor/lista-pendientes
// VINs de LISTA DIARIA que el movilizador aun no ha registrado en GLP
router.get("/api/supervisor/lista-pendientes", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const [listaResp, trasResp, vinsResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/lista_diaria_activa?select=vin,fecha_asignacion&order=fecha_asignacion.asc,vin.asc`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?select=vin,estado`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/vins?ultima_ubicacion=neq.&select=vin,ultima_ubicacion`, { method: "GET", headers }),
    ]);

    const listaRows = listaResp.ok ? await listaResp.json() : [];
    const trasRows  = trasResp.ok  ? await trasResp.json()  : [];
    const vinsRows  = vinsResp.ok  ? await vinsResp.json()  : [];

    // Una OT de CONVERSION ya es prueba de que el carro está físicamente en
    // el taller: un técnico lo trabajó. Sin esto, un VIN que entró sin pasar
    // por "marcar ingreso" del movilizador (pasa, aunque no debería) quedaba
    // en "sin registrar" para siempre, aunque ya esté FINALIZADO.
    const vinsListaSet = new Set((listaRows || []).map(r => r.vin).filter(Boolean));
    let woVins = new Set();
    if (vinsListaSet.size) {
      const inList = [...vinsListaSet].map(v => `"${v}"`).join(",");
      const woResp = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&vin=in.(${inList})&select=vin`,
        { method: "GET", headers }
      );
      const woRows = woResp.ok ? await woResp.json() : [];
      woVins = new Set((woRows || []).map(w => w.vin).filter(Boolean));
    }

    const registradoMap = new Map();  // vin → estado traslado
    for (const t of (trasRows || [])) { if (t.vin) registradoMap.set(t.vin, t.estado); }

    const ubicMap = new Map();
    for (const v of (vinsRows || [])) { if (v.vin) ubicMap.set(v.vin, v.ultima_ubicacion || ""); }

    const sin_registrar  = [];  // en lista diaria, movilizador NO los ha traido NI hay evidencia de trabajo
    const en_proceso     = [];  // movilizador ya los registró, o ya tienen OT (trabajados sin registro)

    for (const row of (listaRows || [])) {
      const estado = registradoMap.get(row.vin) || null;
      const trabajadoSinRegistro = !estado && woVins.has(row.vin);
      const item = {
        vin:    row.vin,
        fecha:  row.fecha_asignacion,
        ubicacion: ubicMap.get(row.vin) || "",
        estado_traslado: trabajadoSinRegistro ? "TRABAJADO_SIN_REGISTRO" : (estado || ""),
      };
      if (trabajadoSinRegistro) {
        en_proceso.push(item);  // hay OT: ya está en el taller, aunque el movilizador nunca lo marcó
      } else if (!estado || estado === "ENTREGADO_FINAL") {
        if (!estado) sin_registrar.push(item);  // no registrado aun, ni evidencia de trabajo
      } else {
        en_proceso.push(item);
      }
    }

    return res.json({ ok: true, sin_registrar, en_proceso });
  } catch (e) {
    console.error("[LISTA_PENDIENTES]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/vin-validar — Verifica si un VIN está registrado para conversión
router.get("/api/vin-validar", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (!vin) return res.json({ ok: false, error: "VIN requerido" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 1. Buscar VIN en tabla vins
    const vinResp = await fetch(
      `${SUPABASE_URL}/rest/v1/vins?vin=eq.${encodeURIComponent(vin)}&select=vin,modelo,cliente,reductor_asignado,tanque_asignado`,
      { method: "GET", headers }
    );
    const vins = vinResp.ok ? await vinResp.json() : [];

    if (!vins?.length) {
      return res.json({ ok: true, found: false, vin: null, workOrders: [] });
    }

    // 2. Buscar work orders con sus asignaciones activas
    const woResp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}`
      + `&select=id,tipo_ot,fecha_creacion,asignaciones(id,rol_trabajo,estado_actual,activo,usuarios(nombre))`
      + `&order=fecha_creacion.desc&limit=5`,
      { method: "GET", headers }
    );
    const workOrders = woResp.ok ? await woResp.json() : [];

    return res.json({ ok: true, found: true, vin: vins[0], workOrders: workOrders || [] });
  } catch (e) {
    console.error("[GET /api/vin-validar]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;
