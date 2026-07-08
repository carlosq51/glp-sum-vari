import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { isValidOT_ } from "../lib/utils.js";

const router = Router();

// ─── MOVILIZADOR STATUS ───────────────────────────────────────────────
// GET /api/movilizador/status
// Devuelve las 3 listas del flujo movilizador + fecha_corte activa
router.get("/api/movilizador/status", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 1. Fecha de corte desde app_config
    const cfgResp = await fetch(
      `${SUPABASE_URL}/rest/v1/app_config?key=eq.FECHA_CORTE_MOVILIZADOR`,
      { method: "GET", headers }
    );
    const cfgRows = cfgResp.ok ? await cfgResp.json() : [];
    const fechaCorte = cfgRows[0]?.value || "";

    // 2. CONVERSION FINALIZADO

    let convUrl = `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&select=vin,fecha_creacion,created_at,numero_ot,asignaciones(updated_at,estado_actual,rol_trabajo)`;
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
    const trasMap = new Map();
    for (const t of (trasRows || [])) {
      if (t.vin) trasMap.set(t.vin, t);
    }

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
    const calActivaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CALIDAD&estado_general=in.(PENDIENTE,EN PROCESO)&select=vin,fecha_creacion,created_at`,
      { method: "GET", headers }
    );
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

    // ─── Lista 1: conversión finalizada + sin traslado (o en EN_ESPERA_CONVERSION) + sin OT de CALIDAD
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
      const trasEntry = trasMap.get(wo.vin);
      // Excluir solo si ya fue trasladado/entregado (no si está en espera de conversión)
      if (trasEntry && trasEntry.estado !== "EN_ESPERA_CONVERSION") continue;
      const prev2 = convVinMap.get(wo.vin);
      if (!prev2 || new Date(wo.fecha_creacion) > new Date(prev2.fecha_creacion)) {
        convVinMap.set(wo.vin, wo);
      }
    }
    const list1 = Array.from(convVinMap.values())
      .map(wo => {
        // Fecha fin = max updated_at de asignaciones FINALIZADAS (MOTOR/TANQUE)
        const fechaFin = (wo.asignaciones || [])
          .filter(a => a.estado_actual === "FINALIZADO")
          .reduce((max, a) => (!max || new Date(a.updated_at) > new Date(max)) ? a.updated_at : max, null);
        return { vin: wo.vin, fecha: fechaFin || wo.fecha_creacion, fecha_updated: wo.created_at };
      })
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // ─── Lista 0: en espera de conversión + en conversión activa
    const list0 = [];
    const list0Vins = new Set();

    // a) Registrados por movilizador como EN_ESPERA_CONVERSION
    for (const [vin, t] of trasMap) {
      if (t.estado !== "EN_ESPERA_CONVERSION") continue;
      if (convVinMap.has(vin)) continue; // conversión ya finalizada → aparece en list1
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
      if (convVinMap.has(vin)) continue; // conversión finalizada → va a list1
      list0.push({
        vin,
        fecha_entrada: null,
        registrado_por: "",
        en_conversion: true,
        sin_registro: true,
      });
    }

    // Orden: primero En Espera (newest first), luego En Conversión
    list0.sort((a, b) => {
      if (a.en_conversion !== b.en_conversion) return a.en_conversion ? 1 : -1;
      // Dentro de En Espera: más reciente arriba
      if (!a.en_conversion) return new Date(b.fecha_entrada || 0) - new Date(a.fecha_entrada || 0);
      return 0;
    });

    // ─── Lista 2: VINs trasladados (sin calidad done) + VINs con OT CALIDAD activa
    const list2 = [];
    const list2Vins = new Set();

    // 2a. Trasladados manualmente por el movilizador (TRASLADADO o ENTREGADO_CALIDAD)
    for (const [vin, t] of trasMap) {
      if (calidadDoneMap.has(vin)) continue;
      if (t.estado === "ENTREGADO_FINAL") continue;
      if (t.estado === "TRASLADADO" || t.estado === "ENTREGADO_CALIDAD") {
        // Si ya tiene OT de calidad activa, mostrar como EN_REVISION aunque traslado diga TRASLADADO
        const estadoReal = calidadActivaMap.has(vin) ? "EN_REVISION" : t.estado;
        list2.push({
          vin,
          estado: estadoReal,
          trasladado_at: t.trasladado_at,
          trasladado_por: t.trasladado_por || "",
          entregado_at: t.entregado_at || null,
          entregado_por: t.entregado_por || "",
        });
        list2Vins.add(vin);
      }
    }

    // 2b. OT CALIDAD activa sin traslado registrado (inspector abrió OT directo)
    for (const [vin] of calidadActivaMap) {
      if (list2Vins.has(vin)) continue; // ya incluido por traslado
      if (calidadDoneMap.has(vin)) continue;
      const t = trasMap.get(vin);
      if (t?.estado === "ENTREGADO_FINAL") continue;
      list2.push({
        vin,
        estado: "EN_REVISION",
        trasladado_at: null,
        trasladado_por: "",
        entregado_at: null,
        entregado_por: "",
      });
    }
    list2.sort((a, b) => new Date(a.trasladado_at || 0) - new Date(b.trasladado_at || 0));

    // Consulta targeted: qué VINs de calidadDoneMap ya fueron entregados (ENTREGADO_FINAL).
    // No usamos trasMap para esto porque trasMap excluye ENTREGADO_FINAL (ver query arriba).
    let entregadoFinalSet = new Set();
    if (calidadDoneMap.size > 0) {
      try {
        const calVinList = [...calidadDoneMap.keys()].map(v => `"${v}"`).join(",");
        const efResp = await fetch(
          `${SUPABASE_URL}/rest/v1/movilizador_traslados?estado=eq.ENTREGADO_FINAL&vin=in.(${calVinList})&select=vin`,
          { method: "GET", headers }
        );
        if (efResp.ok) {
          const efRows = await efResp.json();
          entregadoFinalSet = new Set((efRows || []).map(r => r.vin));
        }
      } catch (_) { /* silencioso */ }
    }

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

    return res.json({
      ok: true,
      fechaCorte,
      list0,
      list1,
      list2,
      list3,
      listDiaria,
      counts: {
        list0: list0.length,
        list0_espera: list0.filter(r => !r.en_conversion).length,
        list0_conversion: list0.filter(r => r.en_conversion).length,
        list1: list1.length,
        list2: list2.length,
        list3: list3.length,
        listDiaria: listDiaria.length,
        listDiariaPendientes: listDiaria.filter(r => r.flow_status === "PENDIENTE_ENTRADA").length,
      },
    });
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
    return res.json({ ok: true });
  } catch (e) {
    console.error("[MOVILIZADOR_TRASLADO]", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/movilizador/pendientes  (misma lógica, accesible al movilizador)
router.get("/api/movilizador/pendientes", async (req, res) => {
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
    const registrado = new Set((trasRows || []).map(t => t.vin));
    const ubicMap    = new Map((vinsRows || []).map(v => [v.vin, v.ultima_ubicacion || ""]));
    const sin_registrar = (listaRows || [])
      .filter(r => !registrado.has(r.vin))
      .map(r => ({ vin: r.vin, fecha: r.fecha_asignacion, ubicacion: ubicMap.get(r.vin) || "" }));
    return res.json({ ok: true, sin_registrar });
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

    return res.json({ ok: true, vins_con_ot });
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

    const registradoMap = new Map();  // vin → estado traslado
    for (const t of (trasRows || [])) { if (t.vin) registradoMap.set(t.vin, t.estado); }

    const ubicMap = new Map();
    for (const v of (vinsRows || [])) { if (v.vin) ubicMap.set(v.vin, v.ultima_ubicacion || ""); }

    const sin_registrar  = [];  // en lista diaria, movilizador NO los ha traido
    const en_proceso     = [];  // movilizador ya los registró (EN_ESPERA o TRASLADADO)

    for (const row of (listaRows || [])) {
      const estado = registradoMap.get(row.vin) || null;
      const item = {
        vin:    row.vin,
        fecha:  row.fecha_asignacion,
        ubicacion: ubicMap.get(row.vin) || "",
        estado_traslado: estado || "",
      };
      if (!estado || estado === "ENTREGADO_FINAL") {
        if (!estado) sin_registrar.push(item);  // no registrado aun
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
