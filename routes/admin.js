import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { normalizeModelo_ } from "../lib/utils.js";
import { getConfig_, invalidateConfigCache_ } from "../lib/config.js";
import { emitEvent_ } from "../lib/events.js";
import { requireRol_ } from "../lib/authz.js";
import { aplicarPausaMasiva_ } from "../lib/pausa-masiva.js";

const router = Router();

// ─── CONFIG PÚBLICA ──────────────────────────────────────────────────────────
// GET /api/config → defaults + overrides de app_config, ya tipados.
// Es la ÚNICA fuente de intervalos/metas/límites para el frontend.
router.get("/api/config", async (_req, res) => {
  try {
    const config = await getConfig_();
    // Cachear 60s en el cliente/proxy: la config cambia poco y esto evita
    // que cada vista dispare su propio fetch al arrancar.
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json({ ok: true, config });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── CLASIFICADOR DE VINs POR MODELO ─────────────────────────────────────────
// Tabla de prefijos (8 chars) → nombre canónico.
// JAC V-series comparte prefijo → se extrae V3/V5/V7 del modelo actual.
const VIN_BRAND_MAP_ = {
  "HJRPBGFA": "Jetour MEC",   // X70 transmisión manual
  "HJRPBGFB": "Jetour AUT",   // X70 automático
  "LVTDB11B": "Jetour MEC",   // X70FL 6MT
  "LVTDB21B": "Jetour AUT",   // X70FL 6DCT
  "LSCAB33E": "KYC X5 DC",    // JAC X5 Doble Cabina
  "LSCABN3E": "KYC X5",       // JAC X5 / T3 (cabina simple / cargo)
  "9BWBL6DF": "VW Tera",      // VW Tarek ensamblado en Brasil
  "9BWAL5BZ": "VW Polo",      // VW Polo Track Brasil
  "9BWAH5BZ": "VW Polo",      // VW Polo (otra variante)
  "9BWJL45U": "VW Saveiro",   // VW Saveiro
  "VSSZZZKJ": "SEAT",         // SEAT (modelo por confirmar)
};

function classifyVin_(vin, modeloActual) {
  if (!vin || vin.length < 8) return modeloActual || "";
  const pref = vin.substring(0, 8).toUpperCase();

  // JAC V-series: V3, V5, V7 comparten el mismo prefijo → leer del modelo actual
  if (pref === "LS4ASL2E") {
    const mu = (modeloActual || "").toUpperCase();
    if (mu.includes("V7")) return "KYC V7";
    if (mu.includes("V5")) return "KYC V5";
    if (mu.includes("V3")) return "KYC V3";
    return "KYC V-series"; // sin info suficiente para distinguir
  }

  return VIN_BRAND_MAP_[pref] || modeloActual || "";
}

// Lógica interna de normalización (reutilizada por el endpoint y el scheduler diario).
async function runNormalizarVins_(soloNuevos = false) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const hdrs = supabaseHeaders_();

  // Verificar que la columna existe
  const testR = await fetch(
    `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo_normalizado&limit=1`,
    { method: "GET", headers: hdrs }
  );
  if (!testR.ok) return { ok: false, need_migration: true,
    sql: "ALTER TABLE vins ADD COLUMN IF NOT EXISTS modelo_normalizado text;\nCREATE INDEX IF NOT EXISTS idx_vins_modelo_normalizado ON vins(modelo_normalizado);",
    error: "Columna modelo_normalizado no existe. Ejecuta el SQL en Supabase Dashboard → SQL Editor." };

  // Filtro: todos los VINs con modelo, o solo los que aún no tienen normalizado
  const filter = soloNuevos
    ? "modelo=not.is.null&modelo_normalizado=is.null"
    : "modelo=not.is.null";

  let all = [], offset = 0;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&${filter}&limit=1000&offset=${offset}`,
      { method: "GET", headers: hdrs }
    );
    const batch = r.ok ? await r.json() : [];
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }

  // Agrupar por canónico → 1 PATCH por grupo
  const groups = {};
  let skipped = 0;
  for (const { vin, modelo } of all) {
    const norm = normalizeModelo_(modelo);
    if (!norm) { skipped++; continue; }
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push(vin);
  }

  let updated = 0, failed = 0;
  const byNorm = {};
  const patchHdrs = { ...hdrs, "Content-Type": "application/json", "Prefer": "return=minimal" };
  for (const [norm, vins] of Object.entries(groups)) {
    byNorm[norm] = vins.length;
    for (let i = 0; i < vins.length; i += 200) {
      const batch = vins.slice(i, i + 200);
      const inClause = batch.map(v => encodeURIComponent(v)).join(",");
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?vin=in.(${inClause})`,
        { method: "PATCH", headers: patchHdrs, body: JSON.stringify({ modelo_normalizado: norm }) }
      );
      if (r.ok) updated += batch.length; else failed += batch.length;
    }
  }
  return { ok: true, total: all.length, updated, skipped, failed, byNorm };
}

// ── Auto-normalización diaria de VINs sin modelo_normalizado ─────────────────
// Corre cada 24h y solo toca los VINs nuevos (modelo_normalizado IS NULL).
export function scheduleAutoNormalize_() {
  const DAILY_MS = 24 * 60 * 60 * 1000;
  setTimeout(async () => {
    try {
      console.log("[NORM-AUTO] Normalizando VINs nuevos sin modelo_normalizado…");
      const r = await runNormalizarVins_(true); // soloNuevos=true
      if (r.ok) {
        console.log(`[NORM-AUTO] OK · ${r.updated} actualizados · ${r.skipped} sin mapeo`);
      } else if (r.need_migration) {
        console.warn("[NORM-AUTO] Columna modelo_normalizado no existe, salteando.");
      } else {
        console.warn(`[NORM-AUTO] Error: ${r.error}`);
      }
    } catch (e) {
      console.error("[NORM-AUTO] Falla:", e.message);
    }
    scheduleAutoNormalize_(); // re-programar para mañana
  }, DAILY_MS);
}

// ─── ADMIN CONFIG ────────────────────────────────────────────────────
// GET /api/admin/config  → { ok, config: { KEY: "value", ... } }
router.get("/api/admin/config", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/app_config?select=key,value`, { method: "GET", headers });
    if (!resp.ok) throw new Error(`Supabase: ${resp.status}`);
    const rows = await resp.json();
    const config = {};
    (rows || []).forEach(r => { config[r.key] = r.value; });
    return res.json({ ok: true, config });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/admin/config  body: { key, value } OR { configs: [{key,value},...] }
router.post("/api/admin/config", requireRol_("ADMIN"), async (req, res) => {
  try {
    const body = req.body || {};
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Permite guardar múltiples claves en un solo POST
    const pairs = Array.isArray(body.configs)
      ? body.configs
      : [{ key: body.key, value: body.value }];

    for (const { key, value } of pairs) {
      if (!key) return res.status(400).json({ ok: false, error: "Falta key" });
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key, value: String(value ?? "") }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Supabase: ${resp.status} ${text.slice(0, 200)}`);
      }
    }
    invalidateConfigCache_(); // el cambio aplica de inmediato en /api/config
    emitEvent_("config", {});
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/admin/pausa-masiva
// body: { accion: "PAUSA" | "REANUDAR", nota?: string }
// Pausa o reanuda TODAS las asignaciones activas en estado TRABAJANDO (o PAUSADO para reanudar)
//
// También lo usa el SUPERVISOR desde su panel CONTROL: quien está en piso cuando
// hay que parar el taller (simulacro, corte de energía, charla) es él, no el
// admin, y hacerle pedir el botón por WhatsApp era la forma más lenta de pararlo.
router.post("/api/admin/pausa-masiva", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const { accion, nota } = req.body || {};
    if (!["PAUSA", "REANUDAR"].includes(accion)) {
      return res.status(400).json({ ok: false, error: "accion debe ser PAUSA o REANUDAR" });
    }

    // El trabajo sucio vive en lib/pausa-masiva.js: lo comparte con el disparo
    // por horario (almuerzo / fin de jornada), que hace exactamente lo mismo.
    const { afectadas, errores } = await aplicarPausaMasiva_({ accion, nota });

    // Bandera de parada MANUAL. La automática por horario NO la toca: si lo
    // hiciera, el botón del supervisor pasaría a decir "Reanudar todas" durante
    // el almuerzo y al pulsarlo levantaría también las OTs que él había pausado
    // a propósito.
    const SUPABASE_URL = process.env.SUPABASE_URL;
    await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ key: "PAUSA_GLOBAL_ACTIVA", value: accion === "PAUSA" ? "1" : "0" }),
    }).catch(() => {});

    invalidateConfigCache_(); // PAUSA_GLOBAL_ACTIVA cambió
    emitEvent_("asignaciones", { accion: `PAUSA_MASIVA_${accion}`, afectadas });
    return res.json({ ok: true, afectadas, errors: errores.length ? errores : undefined });
  } catch (e) {
    console.error("[PAUSA_MASIVA]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/admin/asignaciones?vin=XXX
// Devuelve asignaciones activas para un VIN con nombres de técnicos
router.get("/api/admin/asignaciones", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "VIN requerido" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // 1. Work orders para este VIN
    const woResp = await fetch(
      `${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}&select=id,tipo_ot,estado_general,numero_ot`,
      { method: "GET", headers }
    );
    if (!woResp.ok) throw new Error(`Supabase work_orders: ${woResp.status}`);
    const wos = await woResp.json();
    if (!wos.length) return res.json({ ok: true, asignaciones: [], work_orders: [] });

    const woIds = wos.map(w => w.id).join(",");
    const woMap = Object.fromEntries(wos.map(w => [w.id, w]));

    // 2. Asignaciones activas para esos work_orders
    const asgResp = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=in.(${encodeURIComponent(woIds)})&activo=eq.true&select=*`,
      { method: "GET", headers }
    );
    if (!asgResp.ok) throw new Error(`Supabase asignaciones: ${asgResp.status}`);
    const asgs = await asgResp.json();

    if (!asgs.length) return res.json({ ok: true, asignaciones: [], work_orders: wos });

    // 3. Usuarios para esos user_ids
    const userIds = [...new Set(asgs.map(a => a.user_id))].join(",");
    const usrResp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${encodeURIComponent(userIds)})&select=id,nombre,email`,
      { method: "GET", headers }
    );
    const usrs = usrResp.ok ? await usrResp.json() : [];
    const userMap = Object.fromEntries(usrs.map(u => [u.id, u]));

    const result = asgs.map(a => ({
      ...a,
      tecnico_nombre: userMap[a.user_id]?.nombre || "—",
      tecnico_email:  userMap[a.user_id]?.email  || "—",
      tipo_ot:        woMap[a.work_order_id]?.tipo_ot        || a.tipo_ot,
      estado_general: woMap[a.work_order_id]?.estado_general,
      numero_ot:      woMap[a.work_order_id]?.numero_ot,
    }));

    return res.json({ ok: true, asignaciones: result, work_orders: wos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// PATCH /api/admin/asignaciones/:id  body: { user_id }
// También lo usa el supervisor desde su consola de OTs en vivo: reasignar un
// trabajo es una corrección de piso, no una tarea de administración.
router.patch("/api/admin/asignaciones/:id", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body || {};
    if (!id || !user_id) return res.status(400).json({ ok: false, error: "id y user_id requeridos" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // return=representation, no minimal: un PATCH que no encuentra la fila es
    // un 200 con lista vacía en PostgREST. Con "minimal" el servidor respondía
    // ok:true y la vista decía "técnico reasignado" sin que se hubiera tocado
    // nada — justo el caso de una asignación ya cerrada o recargada.
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?id=eq.${encodeURIComponent(id)}&select=id,user_id`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify({ user_id, updated_at: new Date().toISOString() }),
      }
    );
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Supabase PATCH: ${resp.status} ${txt.slice(0, 200)}`);
    }
    const filas = await resp.json().catch(() => []);
    if (!filas.length) {
      return res.status(404).json({
        ok: false,
        error: "Esa asignación ya no existe. Actualiza la vista y vuelve a intentarlo.",
      });
    }

    // La propuesta del despacho apunta a ESTA asignación y guarda a quién se le
    // reservó el puesto. Si no se mueve con ella, queda reservando a alguien que
    // ya no tiene el carro: reconciliarPropuestas_ la ve viva (el VIN sigue en
    // zona y el puesto no está FINALIZADO), el motor lo cuenta como "ya tiene
    // trabajo" y ese técnico no recibe nada más en toda la jornada.
    // Caso real: VICTOR BAILON quedó parado tras reasignarse su Z8 a otro.
    //
    // unidad_dupla_id se limpia porque la dupla era del técnico anterior: el
    // crédito del carro ya no le corresponde.
    await fetch(
      `${SUPABASE_URL}/rest/v1/despacho_propuestas?asignacion_id=eq.${encodeURIComponent(id)}` +
      `&estado=in.(PROPUESTA,CONFIRMADA)`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ user_id, unidad_dupla_id: null }),
      }
    ).catch(() => { /* la propuesta es un espejo: no tumba la reasignación */ });

    emitEvent_("asignaciones", { accion: "REASIGNADA", id });
    emitEvent_("despacho",     { tipo: "REASIGNADA", asignacion_id: id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/admin/usuarios-activos
// Lista de técnicos activos para picker de reasignación
router.get("/api/admin/usuarios-activos", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?activo=eq.true&select=id,nombre,email,especialidad&order=nombre.asc`,
      { method: "GET", headers }
    );
    if (!resp.ok) throw new Error(`Supabase: ${resp.status}`);
    const usuarios = await resp.json();
    return res.json({ ok: true, usuarios });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// POST /api/admin/normalize-modelos
// Migración batch: reclasifica todos los VINs con nombre canónico.
// Devuelve reporte de cuántos cambiaron por modelo.
router.post("/api/admin/normalize-modelos", requireRol_("ADMIN"), async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const hdrs = supabaseHeaders_();

    // Leer todos los VINs paginado
    let allVins = [];
    let offset  = 0;
    const LIMIT = 500;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?select=vin,modelo&limit=${LIMIT}&offset=${offset}`,
        { method: "GET", headers: hdrs }
      );
      if (!r.ok) throw new Error(`Supabase read: ${r.status}`);
      const page = await r.json();
      allVins = allVins.concat(page);
      if (page.length < LIMIT) break;
      offset += LIMIT;
    }

    // Clasificar y agrupar cambios
    const cambios   = [];   // {vin, antes, despues}
    const reporte   = {};   // canonico -> count
    const sinClasif = [];   // VINs que quedaron sin clasificar

    for (const row of allVins) {
      const canonico = classifyVin_(row.vin, row.modelo);
      if (canonico === (row.modelo || "")) continue;  // sin cambio
      cambios.push({ vin: row.vin, antes: row.modelo || "", despues: canonico });
      reporte[canonico] = (reporte[canonico] || 0) + 1;
      if (!canonico || canonico === (row.modelo || "")) sinClasif.push(row.vin);
    }

    // Aplicar en lotes de 100 via upsert
    const BATCH = 100;
    let actualizados = 0;
    for (let i = 0; i < cambios.length; i += BATCH) {
      const lote = cambios.slice(i, i + BATCH).map(c => ({ vin: c.vin, modelo: c.despues }));
      const rUp = await fetch(`${SUPABASE_URL}/rest/v1/vins`, {
        method: "POST",
        headers: { ...hdrs, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(lote),
      });
      if (!rUp.ok) throw new Error(`Supabase upsert: ${rUp.status} ${await rUp.text()}`);
      actualizados += lote.length;
    }

    console.log(`[NORMALIZE] ${actualizados} VINs reclasificados de ${allVins.length} totales.`);
    return res.json({ ok: true, total: allVins.length, actualizados, reporte, cambios: cambios.slice(0, 50) });
  } catch (e) {
    console.error("[NORMALIZE]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── POST /api/admin/normalizar-vins ──────────────────────────────────────────
// ?solo_nuevos=1 → solo normaliza VINs donde modelo_normalizado IS NULL (incremental)
router.post("/api/admin/normalizar-vins", requireRol_("ADMIN"), async (req, res) => {
  try {
    const soloNuevos = req.query.solo_nuevos === "1";
    const result = await runNormalizarVins_(soloNuevos);
    return res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});


// ── GET /api/admin/preview-normalizacion ─────────────────────────────────────
// Vista previa de cómo quedarían los modelos normalizados (sin modificar BD).
router.get("/api/admin/preview-normalizacion", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const hdrs = supabaseHeaders_();
    let rows = [], offset = 0;
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?select=modelo&modelo=not.is.null&limit=1000&offset=${offset}`,
        { method: "GET", headers: hdrs }
      );
      const batch = r.ok ? await r.json() : [];
      if (!Array.isArray(batch) || !batch.length) break;
      rows.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    const counts = {};
    for (const { modelo } of rows) {
      const norm = normalizeModelo_(modelo) || "⚠ sin mapeo";
      if (!counts[norm]) counts[norm] = { count: 0, examples: [] };
      counts[norm].count++;
      if (counts[norm].examples.length < 3) counts[norm].examples.push(modelo);
    }
    return res.json({ ok: true, total: rows.length, byNorm: counts });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
