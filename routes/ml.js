import { Router } from "express";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { normalizeModelo_ } from "../lib/utils.js";
import { pendingSuggestions_ } from "../lib/ml-state.js";

const router = Router();

// ── POST /api/ml/train-vin-model ──────────────────────────────────────────────
// Entrena el modelo de inferencia de modelo vehicular desde la base de VINs.
// Estrategia: tabla de frecuencia por prefijo VIN (posiciones 1-9, 1-8, ..., 1-3).
// Dos VINs con el mismo prefijo de 9 chars son el mismo modelo/variante.
const VIN_MODEL_PATH = "./vin-model.json";

// ── POST /api/ml/train-pairing ────────────────────────────────────────────────
// Entrena el modelo de emparejamiento de técnicos por similitud de producción.
// Algoritmo: distancia euclidiana ponderada en espacio de 5 features normalizados.
// Features: tasa_diaria (40%), hora_pico (30%), tiempo_promedio (15%),
//           dispersión_horaria (10%), consistencia_diaria (5%).
const PAIRING_MODEL_PATH  = "./pairing-model.json";
const OMISIONES_PATH      = "./omisiones.json";

// ── Persistencia del modelo en Supabase (sobrevive reinicios de Render) ───────
// El filesystem efímero de Render borra archivos al reiniciar el dyno.
// Guardamos el modelo en la tabla ml_models de Supabase como respaldo.

async function savePairingModelToSupabase_(modelObj) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    await fetch(`${SUPABASE_URL}/rest/v1/ml_models`, {
      method:  "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "resolution=merge-duplicates,return=minimal" },
      body:    JSON.stringify({ key: "pairing-model", data: modelObj, updated_at: new Date().toISOString() }),
    });
    console.log("[ML] Modelo de emparejamiento guardado en Supabase.");
  } catch (e) {
    console.warn("[ML] No se pudo guardar modelo en Supabase:", e.message);
  }
}

export async function loadPairingModelFromSupabase_() {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ml_models?key=eq.pairing-model&select=data,updated_at&limit=1`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    if (!r.ok) return false;
    const rows = await r.json();
    if (!rows.length || !rows[0]?.data) return false;
    writeFileSync(PAIRING_MODEL_PATH, JSON.stringify(rows[0].data));
    console.log(`[ML] Modelo restaurado desde Supabase (entrenado: ${rows[0].data.trained_at})`);
    return true;
  } catch (e) {
    console.warn("[ML] No se pudo restaurar modelo desde Supabase:", e.message);
    return false;
  }
}

function readOmisiones_() {
  try {
    if (!existsSync(OMISIONES_PATH)) return {};
    return JSON.parse(readFileSync(OMISIONES_PATH, "utf8"));
  } catch { return {}; }
}

function writeOmisiones_(data) {
  writeFileSync(OMISIONES_PATH, JSON.stringify(data, null, 2));
}

// Distancia circular entre horas del día (0-23): normalizada a [0,1], máximo a 12h de diferencia.
const circHourDist_ = (ha, hb) => Math.min(Math.abs(ha - hb), 24 - Math.abs(ha - hb)) / 12;

// Próximo re-entrenamiento automático (ISO string, se actualiza al programar).
let nextAutoRetrainAt_ = null;

// ── Auto re-entrenamiento de emparejamiento cada 3 días ──────────────────────
// El scheduler se re-programa a sí mismo tras cada ejecución para mantenerse
// alineado con el intervalo real (no con el uptime del servidor).
const RETRAIN_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 horas

export function scheduleAutoRetrain_() {
  let delayMs = RETRAIN_INTERVAL_MS;
  if (existsSync(PAIRING_MODEL_PATH)) {
    try {
      const { trained_at } = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
      const elapsed = Date.now() - new Date(trained_at).getTime();
      delayMs = Math.max(60_000, RETRAIN_INTERVAL_MS - elapsed); // mínimo 1 min
    } catch {}
  }
  nextAutoRetrainAt_ = new Date(Date.now() + delayMs).toISOString();
  const h = Math.round(delayMs / 3600000);
  console.log(`[ML-AUTO] Próximo re-entrenamiento en ${h}h (${new Date(nextAutoRetrainAt_).toLocaleString("es-PE")})`);

  setTimeout(async () => {
    try {
      console.log("[ML-AUTO] Iniciando re-entrenamiento automático de emparejamiento…");
      const PORT = process.env.PORT || 3000;
      const r = await fetch(`http://localhost:${PORT}/api/ml/train-pairing`, { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        console.log(`[ML-AUTO] OK · ${j.total_techs} técnicos (motor:${j.motor} tanque:${j.tanque}) · tendencias up:${j.trends?.up} down:${j.trends?.down}`);
      } else {
        console.warn(`[ML-AUTO] Falla: ${j.error}`);
      }
    } catch (e) {
      console.error("[ML-AUTO] Error en re-entrenamiento:", e.message);
    }
    scheduleAutoRetrain_(); // re-programar para dentro de 3 días
  }, delayMs);
}

router.post("/api/ml/train-vin-model", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    // Fetch all VINs with known modelo
    let offset = 0, allVins = [];
    while (true) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?modelo=not.is.null&select=vin,modelo&limit=1000&offset=${offset}`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (!r.ok) break;
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      allVins.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }

    if (!allVins.length) return res.json({ ok: false, error: "Sin VINs con modelo conocido" });

    // Build prefix frequency table for lengths 3-9
    const prefixes = {};
    for (let len = 3; len <= 9; len++) prefixes[len] = {};

    for (const { vin, modelo } of allVins) {
      if (!vin || !modelo || vin.length < 3) continue;
      for (let len = 3; len <= Math.min(9, vin.length); len++) {
        const key = vin.slice(0, len).toUpperCase();
        if (!prefixes[len][key]) prefixes[len][key] = {};
        prefixes[len][key][modelo] = (prefixes[len][key][modelo] || 0) + 1;
      }
    }

    // Count unique models and prefixes
    const uniqueModels = new Set(allVins.map(v => v.modelo)).size;
    const model = {
      trained_at: new Date().toISOString(),
      total_vins: allVins.length,
      unique_models: uniqueModels,
      prefixes,
    };
    writeFileSync(VIN_MODEL_PATH, JSON.stringify(model));

    return res.json({ ok: true, total_vins: allVins.length, unique_models: uniqueModels });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/infer-vin-model?vin=XYZ ──────────────────────────────────────
router.get("/api/ml/infer-vin-model", (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (vin.length < 3) return res.json({ ok: false, error: "VIN demasiado corto" });
    if (!existsSync(VIN_MODEL_PATH))
      return res.json({ ok: false, error: "Modelo no entrenado aún. Ejecuta el entrenamiento primero." });

    const model = JSON.parse(readFileSync(VIN_MODEL_PATH, "utf8"));
    const prefixes = model.prefixes || {};

    // Longest-prefix match: try 9 chars down to 3
    for (let len = Math.min(9, vin.length); len >= 3; len--) {
      const key = vin.slice(0, len);
      const dist = prefixes[len]?.[key];
      if (!dist) continue;

      const total = Object.values(dist).reduce((s, c) => s + c, 0);
      const [bestModel, bestCount] = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
      const confidence = Math.round((bestCount / total) * 100);
      return res.json({
        ok: true,
        vin,
        modelo: bestModel,
        confidence,
        match_len: len,
        candidates: Object.entries(dist)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([m, c]) => ({ modelo: m, count: c, pct: Math.round(c/total*100) })),
      });
    }

    return res.json({ ok: true, vin, modelo: null, confidence: 0, match_len: 0, candidates: [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

router.post("/api/ml/train-pairing", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;

    const rUsers = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,email,especialidad`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const users = rUsers.ok ? await rUsers.json() : [];
    if (!users.length) return res.json({ ok: false, error: "Sin técnicos activos" });

    const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const rFin = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?estado_actual=eq.FINALIZADO&updated_at=gte.${encodeURIComponent(since90)}&select=user_id,updated_at,tiempo_trab_ms,work_order_id&limit=5000`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const finRows = rFin.ok ? await rFin.json() : [];

    // Enriquecer con modelo del carro: asignaciones → work_orders → vins
    const woIds = [...new Set(finRows.map(r => r.work_order_id).filter(Boolean))];
    const woVinMap = {};
    for (let i = 0; i < woIds.length; i += 200) {
      const batch = woIds.slice(i, i + 200);
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?id=in.(${batch.join(",")})&select=id,vin`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (r.ok) (await r.json()).forEach(wo => { woVinMap[wo.id] = wo.vin; });
    }
    const vinList = [...new Set(Object.values(woVinMap).filter(Boolean))];
    const vinModelMap = {};
    for (let i = 0; i < vinList.length; i += 200) {
      const batch = vinList.slice(i, i + 200);
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?vin=in.(${batch.map(v => encodeURIComponent(v)).join(",")})&select=vin,modelo,modelo_normalizado`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (r.ok) (await r.json()).forEach(v => {
        // Preferir modelo_normalizado; si no existe, normalizar on-the-fly desde modelo
        vinModelMap[v.vin] = v.modelo_normalizado || normalizeModelo_(v.modelo) || v.modelo || null;
      });
    }
    // Fallback: para VINs sin modelo en DB, intentar inferir con el modelo VIN entrenado
    if (existsSync(VIN_MODEL_PATH)) {
      try {
        const vinInfModel = JSON.parse(readFileSync(VIN_MODEL_PATH, "utf8"));
        const vinPrefixes = vinInfModel.prefixes || {};
        let inferred = 0;
        for (const vin of vinList) {
          if (vinModelMap[vin]) continue;
          for (let len = Math.min(9, vin.length); len >= 3; len--) {
            const key = vin.slice(0, len).toUpperCase();
            const dist = vinPrefixes[len]?.[key];
            if (!dist) continue;
            const total = Object.values(dist).reduce((s, c) => s + c, 0);
            const [bestModel, bestCount] = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
            if (Math.round((bestCount / total) * 100) >= 70) { vinModelMap[vin] = bestModel; inferred++; }
            break;
          }
        }
        if (inferred) console.log(`[ML-TRAIN] ${inferred} VINs sin modelo inferidos con vin-model.json`);
      } catch {}
    }

    for (const row of finRows) {
      const woVin = woVinMap[row.work_order_id];
      row.modelo = woVin ? (vinModelMap[woVin] || null) : null;
    }

    const byUser     = {};
    const byUserModel = {};   // { userId: { modelo: [rows] } }
    for (const row of finRows) {
      if (!byUser[row.user_id]) byUser[row.user_id] = [];
      byUser[row.user_id].push(row);
      if (row.modelo) {
        if (!byUserModel[row.user_id]) byUserModel[row.user_id] = {};
        if (!byUserModel[row.user_id][row.modelo]) byUserModel[row.user_id][row.modelo] = [];
        byUserModel[row.user_id][row.modelo].push(row);
      }
    }

    // ── Feature extraction (reutilizable para base y reciente) ──────────────
    function computeFeatures(rows) {
      if (rows.length < 3) return null;
      const byDay = {};
      rows.forEach(r => { const d = r.updated_at?.split("T")[0]; if (d) byDay[d] = (byDay[d] || 0) + 1; });
      const dayCounts = Object.values(byDay);
      if (!dayCounts.length) return null;
      const dailyRate = dayCounts.reduce((s, c) => s + c, 0) / dayCounts.length;
      const dayStd = Math.sqrt(dayCounts.reduce((s, c) => s + (c - dailyRate) ** 2, 0) / dayCounts.length);
      const consistency = dailyRate > 0 ? dayStd / dailyRate : 1;
      const times = rows.map(r => Number(r.tiempo_trab_ms)).filter(t => t > 0 && t < 28800000);
      const avgMs = times.length ? times.reduce((s, t) => s + t, 0) / times.length : 0;
      const hours = rows.map(r => r.updated_at ? new Date(r.updated_at).getHours() : -1).filter(h => h >= 0);
      const sortedHours = [...hours].sort((a, b) => a - b);
      const peakHour = sortedHours[Math.floor(sortedHours.length / 2)] ?? 12;
      const hourMean = hours.reduce((s, h) => s + h, 0) / (hours.length || 1);
      const hourStd = Math.sqrt(hours.reduce((s, h) => s + (h - hourMean) ** 2, 0) / (hours.length || 1));
      return { dailyRate, consistency, avgMs, peakHour, hourStd, totalRows: rows.length, workingDays: dayCounts.length };
    }

    // ── Recency blending: mezcla modelo base (90d) con últimos 7 días ────────
    // Idea: los últimos 7 días tienen mayor peso (α=0.65) porque reflejan
    // la forma actual del técnico. El modelo base (0.35) aporta estabilidad
    // ante semanas atípicas. Si no hay datos recientes suficientes, usa base.
    const BLEND_ALPHA   = 0.65;   // peso de los últimos 7 días
    const MIN_RECENT    = 5;      // mínimo de asignaciones recientes para blend
    const TREND_UP_THR  = 1.10;   // +10% respecto a base → tendencia ascendente
    const TREND_DN_THR  = 0.90;   // −10% → tendencia descendente
    const since7ms      = Date.now() - 7 * 86400000;

    const techFeatures = [];
    for (const user of users) {
      const allRows    = byUser[user.id] || [];
      const baseFeats  = computeFeatures(allRows);
      if (!baseFeats) continue;

      const recentRows  = allRows.filter(r => new Date(r.updated_at).getTime() >= since7ms);
      const recentFeats = recentRows.length >= MIN_RECENT ? computeFeatures(recentRows) : null;

      // Blend adaptivo: más datos recientes → más peso reciente (escala MIN_RECENT→0.35 hasta 30→BLEND_ALPHA)
      const adaptiveAlpha = recentFeats
        ? Math.min(BLEND_ALPHA, 0.35 + (recentRows.length - MIN_RECENT) / Math.max(30 - MIN_RECENT, 1) * (BLEND_ALPHA - 0.35))
        : 0;
      const features = recentFeats
        ? Object.fromEntries(
            ["dailyRate", "consistency", "avgMs", "peakHour", "hourStd"].map(k => [
              k, adaptiveAlpha * (recentFeats[k] ?? baseFeats[k]) + (1 - adaptiveAlpha) * baseFeats[k],
            ])
          )
        : { ...baseFeats };
      features.workingDays  = baseFeats.workingDays;
      features.totalRows    = baseFeats.totalRows;
      features.recentRows   = recentRows.length;

      // Tendencia: compara tasa diaria reciente vs histórica
      const trend = recentFeats
        ? (recentFeats.dailyRate > baseFeats.dailyRate * TREND_UP_THR ? "up"
          : recentFeats.dailyRate < baseFeats.dailyRate * TREND_DN_THR ? "down"
          : "stable")
        : "unknown";

      const trendPct = recentFeats
        ? Math.round(((recentFeats.dailyRate - baseFeats.dailyRate) / Math.max(baseFeats.dailyRate, 0.1)) * 100)
        : 0;

      // Features por modelo: mismo blend pero segmentado por tipo de carro
      const modelFeatsMap = {};
      for (const [modelo, rows] of Object.entries(byUserModel[user.id] || {})) {
        if (rows.length < 8) continue;   // mínimo 8 asignaciones para features confiables por modelo
        const mBase   = computeFeatures(rows);
        const mRecent = rows.filter(r => new Date(r.updated_at).getTime() >= since7ms);
        const mRF     = mRecent.length >= MIN_RECENT ? computeFeatures(mRecent) : null;
        if (!mBase) continue;
        const mAlpha = mRF
          ? Math.min(BLEND_ALPHA, 0.35 + (mRecent.length - MIN_RECENT) / Math.max(30 - MIN_RECENT, 1) * (BLEND_ALPHA - 0.35))
          : 0;
        modelFeatsMap[modelo] = mRF
          ? Object.fromEntries(
              ["dailyRate","consistency","avgMs","peakHour","hourStd"].map(k => [
                k, mAlpha * (mRF[k] ?? mBase[k]) + (1 - mAlpha) * mBase[k],
              ])
            )
          : { ...mBase };
        modelFeatsMap[modelo].sampleCount = rows.length;
      }

      techFeatures.push({
        id: user.id, nombre: user.nombre, email: user.email, especialidad: user.especialidad,
        features, trend, trendPct,
        baseFeatures: baseFeats, recentFeatures: recentFeats,
        modelFeatures: modelFeatsMap,
      });
    }
    if (!techFeatures.length) return res.json({ ok: false, error: "Sin datos suficientes para entrenar" });

    // Normalizar features globales a [0,1] usando maxes entre todos los técnicos
    const KEYS = ["dailyRate", "avgMs", "peakHour", "hourStd", "consistency"];
    const maxes = {};
    for (const k of KEYS) maxes[k] = Math.max(...techFeatures.map(t => t.features[k] || 0), 1e-9);
    for (const tech of techFeatures) {
      tech.normalized = {};
      for (const k of KEYS) tech.normalized[k] = (tech.features[k] || 0) / maxes[k];

      // Normalizar features por modelo usando los MISMOS maxes globales → comparables
      tech.modelNormalized = {};
      for (const [modelo, mf] of Object.entries(tech.modelFeatures || {})) {
        tech.modelNormalized[modelo] = {};
        for (const k of KEYS) tech.modelNormalized[modelo][k] = (mf[k] || 0) / maxes[k];
        tech.modelNormalized[modelo].sampleCount = mf.sampleCount || 0;
      }
    }

    // Construir índice modelFeatures: { userId: { modelo: normalizedFeatures } }
    const modelFeaturesIndex = {};
    for (const tech of techFeatures) {
      if (Object.keys(tech.modelNormalized).length) {
        modelFeaturesIndex[tech.id] = tech.modelNormalized;
      }
    }

    const modelPayload = {
      trained_at: new Date().toISOString(),
      blend_alpha: BLEND_ALPHA,
      recent_days: 7,
      total_techs: techFeatures.length,
      maxes,
      modelFeaturesIndex,
      techs: techFeatures.map(t => ({
        user_id: t.id, nombre: t.nombre, email: t.email, especialidad: t.especialidad,
        features: t.features, normalized: t.normalized,
        trend: t.trend, trendPct: t.trendPct,
        baseFeatures: t.baseFeatures, recentFeatures: t.recentFeatures,
        modelFeatures: t.modelFeatures, modelNormalized: t.modelNormalized,
      })),
    };
    writeFileSync(PAIRING_MODEL_PATH, JSON.stringify(modelPayload));
    // Persistir en Supabase para sobrevivir reinicios de Render
    await savePairingModelToSupabase_(modelPayload);

    const trends = { up: 0, down: 0, stable: 0, unknown: 0 };
    for (const t of techFeatures) trends[t.trend] = (trends[t.trend] || 0) + 1;

    return res.json({
      ok: true,
      total_techs: techFeatures.length,
      motor:  techFeatures.filter(t => t.especialidad === "MOTOR").length,
      tanque: techFeatures.filter(t => t.especialidad === "TANQUE").length,
      blend_alpha: BLEND_ALPHA,
      trends,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/suggest-pair?email=xxx ───────────────────────────────────────
// Devuelve TODOS los candidatos de especialidad opuesta rankeados por similitud
// + la sugerencia principal si hay un candidato claramente mejor.
router.get("/api/ml/suggest-pair", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.json({ ok: false, error: "Email requerido" });
    if (!existsSync(PAIRING_MODEL_PATH)) await loadPairingModelFromSupabase_();
    if (!existsSync(PAIRING_MODEL_PATH))
      return res.json({ ok: true, suggestion: null, ranked: [], reason: "model_not_trained" });

    const model = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
    const techs = model.techs || [];

    const me = techs.find(t => t.email?.toLowerCase() === email);
    if (!me) return res.json({ ok: true, suggestion: null, ranked: [], reason: "not_in_model" });

    const myEsp   = me.especialidad?.toUpperCase();
    const pairEsp = myEsp === "MOTOR" ? "TANQUE" : myEsp === "TANQUE" ? "MOTOR" : null;
    if (!pairEsp) return res.json({ ok: true, suggestion: null, ranked: [] });

    const candidates = techs.filter(t => t.especialidad?.toUpperCase() === pairEsp);
    if (!candidates.length) return res.json({ ok: true, suggestion: null, ranked: [] });

    const W = { dailyRate: 0.40, peakHour: 0.30, avgMs: 0.15, hourStd: 0.10, consistency: 0.05 };
    const calcDist = (a, b) => Math.sqrt(
      Object.entries(W).reduce((s, [k, w]) => {
        const d = k === 'peakHour'
          ? circHourDist_(a.features?.peakHour || 0, b.features?.peakHour || 0)
          : (a.normalized[k]||0) - (b.normalized[k]||0);
        return s + w * d * d;
      }, 0)
    );

    const ranked = candidates
      .map(c => {
        const d = calcDist(me, c);
        const sim = Math.round((1 - d) * 100);
        const bF = c.features, myF = me.features;
        const reasons = [];
        if (bF && myF) {
          if (Math.abs(myF.dailyRate - bF.dailyRate) / Math.max(myF.dailyRate, 1) < 0.25)
            reasons.push(`ritmo ~${bF.dailyRate.toFixed(1)} conv./día`);
          if (Math.abs(myF.peakHour - bF.peakHour) <= 2)
            reasons.push(`horario ~${bF.peakHour}:00h`);
          if (bF.avgMs && Math.abs(myF.avgMs - bF.avgMs) / Math.max(myF.avgMs, 1) < 0.30)
            reasons.push(`velocidad ~${Math.round(bF.avgMs/60000)}min/conv.`);
        }
        return {
          user_id: c.user_id,
          nombre: c.nombre,
          especialidad: c.especialidad,
          similarity: sim,
          distance: Math.round(d * 1000) / 1000,
          features: c.features ? {
            dailyRate:  Math.round((c.features.dailyRate || 0) * 10) / 10,
            peakHour:   c.features.peakHour || 0,
            avgMs:      Math.round((c.features.avgMs || 0) / 60000),
            workingDays: c.features.workingDays || 0,
            totalRows:   c.features.totalRows || 0,
          } : null,
          reasons,
        };
      })
      .sort((a, b) => a.distance - b.distance);

    // Best suggestion: only if clear winner
    let suggestion = null;
    if (ranked.length >= 2) {
      const best = ranked[0], second = ranked[1];
      if (best.distance <= 0.45 && best.distance < second.distance * 0.78)
        suggestion = ranked[0];
    } else if (ranked.length === 1 && ranked[0].distance <= 0.45) {
      suggestion = ranked[0];
    }

    return res.json({ ok: true, suggestion, ranked, myFeatures: me.features });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/suggest-next?email=xxx ───────────────────────────────────────
// Lógica de sugerencia:
//   1. Encuentra complementarios YA TRABAJANDO en un carro que AÚN NO TIENE su dupla.
//   2. Calcula el top-3 del ML para el técnico solicitante (todos los complementarios).
//   3. Intersección: solo sugiere a quien esté trabajando solo Y esté en el top-3 ML.
//   4. Si la intersección es vacía → mode="new_car" (nadie compatible está solo).
//   Sin modelo ML: muestra hasta 3 trabajando-solos sin filtro de similitud (fallback).
router.get("/api/ml/suggest-next", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.json({ ok: false, error: "Email requerido" });

    // Cargar modelo (puede no existir)
    let model = null;
    let me    = null;
    if (existsSync(PAIRING_MODEL_PATH)) {
      try { model = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8")); } catch {}
      me = model?.techs?.find(t => t.email?.toLowerCase() === email);
    }

    // Obtener userId y especialidad del técnico solicitante
    const rUser = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&activo=eq.true&select=id,nombre,especialidad`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const userRows = rUser.ok ? await rUser.json() : [];
    const userRow  = userRows[0];
    if (!userRow) return res.json({ ok: false, error: "Usuario no encontrado" });

    const myUserId = userRow.id;
    const myEsp    = (userRow.especialidad || me?.especialidad || "").toUpperCase();
    const pairEsp  = myEsp === "MOTOR" ? "TANQUE" : myEsp === "TANQUE" ? "MOTOR" : null;
    if (!pairEsp) return res.json({ ok: true, suggestions: [], mode: "new_car" });

    // ── Paso 1: complementarios trabajando en carros sin su dupla ────────────
    const [rPairActive, rMyActive] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=user_id,work_order_id`,
        { method: "GET", headers: supabaseHeaders_() }),
      fetch(`${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${myEsp}&activo=eq.true&select=work_order_id`,
        { method: "GET", headers: supabaseHeaders_() }),
    ]);
    const pairActiveRows = rPairActive.ok ? await rPairActive.json() : [];
    // Cualquier asignación mía (activa, en cualquier estado, incluido FINALIZADO) ya "cubre"
    // ese work_order — si mi rol ya terminó ahí, no debe sugerirse como "carro sin dupla".
    const myActiveWoIds  = new Set((rMyActive.ok ? await rMyActive.json() : []).map(a => a.work_order_id));

    const soloRows = pairActiveRows.filter(a => !myActiveWoIds.has(a.work_order_id));
    const soloByUser = {};   // userId → work_order_id
    soloRows.forEach(a => { soloByUser[a.user_id] = a.work_order_id; });
    const soloUserIds = new Set(Object.keys(soloByUser));

    // ── Paso 1b: obtener el modelo del carro de cada trabajador-solo ──────────
    // work_order_id → vin → modelo (para usar features por modelo en la similitud)
    const soloWoIds = [...new Set(Object.values(soloByUser))];
    const soloWoVin = {};   // work_order_id → vin
    const soloWoModelo = {}; // work_order_id → modelo
    if (soloWoIds.length) {
      const rWo = await fetch(
        `${SUPABASE_URL}/rest/v1/work_orders?id=in.(${soloWoIds.join(",")})&select=id,vin`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (rWo.ok) (await rWo.json()).forEach(wo => { soloWoVin[wo.id] = wo.vin; });

      const soloVins = [...new Set(Object.values(soloWoVin).filter(Boolean))];
      if (soloVins.length) {
        const rVins = await fetch(
          `${SUPABASE_URL}/rest/v1/vins?vin=in.(${soloVins.map(v => encodeURIComponent(v)).join(",")})&select=vin,modelo,modelo_normalizado`,
          { method: "GET", headers: supabaseHeaders_() }
        );
        const vinModelMap = {};
        if (rVins.ok) (await rVins.json()).forEach(v => {
          // Usar modelo_normalizado si existe, si no normalizar on-the-fly, si no usar raw
          vinModelMap[v.vin] = v.modelo_normalizado || normalizeModelo_(v.modelo) || v.modelo || null;
        });
        for (const [woId, vin] of Object.entries(soloWoVin)) {
          soloWoModelo[woId] = vinModelMap[vin] || null;
        }
      }
    }

    // ── Paso 2: ML con features por modelo ────────────────────────────────────
    const W = { dailyRate: 0.40, peakHour: 0.30, avgMs: 0.15, hourStd: 0.10, consistency: 0.05 };
    const calcDist = (aNorm, bNorm, aPeakH, bPeakH) => Math.sqrt(
      Object.entries(W).reduce((s, [k, w]) => {
        const d = k === 'peakHour'
          ? circHourDist_(aPeakH || 0, bPeakH || 0)
          : (aNorm[k]||0) - (bNorm[k]||0);
        return s + w * d * d;
      }, 0)
    );

    // Devuelve features normalizadas para un técnico, prefiriendo las del modelo si existen
    const mfi = model?.modelFeaturesIndex || {};
    const getNorm  = (techEntry, modelo) =>
      (modelo && mfi[techEntry?.user_id]?.[modelo]) || techEntry?.normalized || {};
    const getPeakH = (techEntry, modelo) =>
      (modelo && techEntry?.modelFeatures?.[modelo]?.peakHour) ?? techEntry?.features?.peakHour ?? 0;

    let suggestions = [];

    if (me && model) {
      const mlCandidates = model.techs?.filter(t => t.especialidad?.toUpperCase() === pairEsp) || [];

      // Para cada candidato que trabaja solo, calcular similitud usando el modelo de SU carro
      const rankedSolo = mlCandidates
        .filter(t => t.user_id && soloUserIds.has(t.user_id))
        .map(t => {
          const woId    = soloByUser[t.user_id];
          const modelo  = soloWoModelo[woId] || null;
          // Similitud: mis features para ese modelo vs. las del candidato para ese modelo
          const myNorm   = getNorm(me,  modelo);
          const canNorm  = getNorm(t,   modelo);
          const myPeakH  = getPeakH(me, modelo);
          const canPeakH = getPeakH(t,  modelo);
          const sim      = Math.round((1 - calcDist(myNorm, canNorm, myPeakH, canPeakH)) * 100);
          return { userId: t.user_id, sim, modelo, ml: t };
        })
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3);

      const candIds = rankedSolo.map(c => c.userId);
      const rCandUsers = candIds.length ? await fetch(
        `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${candIds.join(",")})&select=id,nombre`,
        { method: "GET", headers: supabaseHeaders_() }
      ) : null;
      const candUserMap = {};
      if (rCandUsers?.ok) (await rCandUsers.json()).forEach(u => { candUserMap[u.id] = u.nombre; });

      for (const { userId, sim, modelo, ml } of rankedSolo) {
        const f = ml?.features;
        suggestions.push({
          id:           userId,
          nombre:       candUserMap[userId] || ml?.nombre || "",
          especialidad: pairEsp,
          modelo:       modelo,
          similarity:   sim,
          quality:      sim >= 85 ? "great" : sim >= 75 ? "good" : "ok",
          trend:        ml?.trend    || "unknown",
          trendPct:     ml?.trendPct || 0,
          features: f ? {
            dailyRate:   Math.round((f.dailyRate || 0) * 10) / 10,
            peakHour:    f.peakHour  || 0,
            avgMs:       Math.round((f.avgMs || 0) / 60000),
            workingDays: f.workingDays || 0,
          } : null,
          hasMLData: true,
        });
      }
    } else if (soloUserIds.size > 0) {
      // Sin modelo ML: fallback — mostrar trabajando-solos sin filtro
      const rSoloUsers = await fetch(
        `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${[...soloUserIds].join(",")})&select=id,nombre`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      (rSoloUsers.ok ? await rSoloUsers.json() : []).slice(0, 3).forEach(u => {
        const woId = soloByUser[u.id];
        suggestions.push({
          id: u.id, nombre: u.nombre || "", especialidad: pairEsp,
          modelo: soloWoModelo[woId] || null,
          similarity: 50, quality: "ok", trend: "unknown", trendPct: 0,
          features: null, hasMLData: false,
        });
      });
    }

    const mode         = suggestions.length === 0 ? "new_car" : "pair";
    const suggestedIds = suggestions.map(s => s.id).filter(Boolean);

    pendingSuggestions_.set(myUserId, { suggestedIds, mode, ts: Date.now() });

    return res.json({ ok: true, suggestions, pairEsp, totalSolo: soloUserIds.size, mode });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/omisiones ───────────────────────────────────────────────────────
// Devuelve el conteo de omisiones por técnico (+ historial reciente).
router.get("/api/omisiones", (req, res) => {
  try {
    const data = readOmisiones_();
    const list = Object.entries(data)
      .map(([userId, d]) => ({ userId, nombre: d.nombre, total: d.total, history: (d.history || []).slice(-10) }))
      .sort((a, b) => b.total - a.total);
    res.json({ ok: true, omisiones: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// DELETE /api/omisiones/:userId  — resetea el contador de un técnico (uso admin)
router.delete("/api/omisiones/:userId", (req, res) => {
  try {
    const data = readOmisiones_();
    delete data[req.params.userId];
    writeOmisiones_(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// ── GET /api/ml/pairing-overview ─────────────────────────────────────────────
// Vista admin: matriz completa de similitud MOTOR × TANQUE + mejores pares
// + resultados por modelo de vehículo.
router.get("/api/ml/pairing-overview", async (req, res) => {
  try {
    if (!existsSync(PAIRING_MODEL_PATH)) await loadPairingModelFromSupabase_();
    if (!existsSync(PAIRING_MODEL_PATH))
      return res.json({ ok: false, error: "Modelo no entrenado. Ve a Admin → Configuración → Entrenar emparejamiento." });

    const model = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
    const techs = model.techs || [];
    const motors  = techs.filter(t => t.especialidad?.toUpperCase() === "MOTOR");
    const tanques = techs.filter(t => t.especialidad?.toUpperCase() === "TANQUE");

    const W = { dailyRate: 0.40, peakHour: 0.30, avgMs: 0.15, hourStd: 0.10, consistency: 0.05 };
    const calcDistNorm = (na, nb, aPeakH, bPeakH) => Math.sqrt(
      Object.entries(W).reduce((s, [k, w]) => {
        const d = k === 'peakHour'
          ? circHourDist_(aPeakH || 0, bPeakH || 0)
          : (na[k]||0) - (nb[k]||0);
        return s + w * d * d;
      }, 0)
    );

    // Similarity matrix global [motorIdx][tanqueIdx]
    const matrix = motors.map(m =>
      tanques.map(t => Math.round((1 - calcDistNorm(m.normalized, t.normalized, m.features?.peakHour, t.features?.peakHour)) * 100))
    );

    // Best pair for each motor (global)
    const motorPairs = motors.map((m, mi) => {
      const sorted = tanques.map((t, ti) => ({ ...t, sim: matrix[mi][ti] })).sort((a, b) => b.sim - a.sim);
      return { motor: { user_id: m.user_id, nombre: m.nombre, features: m.features, trend: m.trend, trendPct: m.trendPct },
               best: sorted[0] ? { user_id: sorted[0].user_id, nombre: sorted[0].nombre, sim: sorted[0].sim, features: sorted[0].features, trend: sorted[0].trend, trendPct: sorted[0].trendPct } : null,
               all: sorted.map(t => ({ user_id: t.user_id, nombre: t.nombre, sim: t.sim })) };
    }).sort((a, b) => (b.best?.sim || 0) - (a.best?.sim || 0));

    // Best pair for each tanque (global)
    const tanquePairs = tanques.map((t, ti) => {
      const sorted = motors.map((m, mi) => ({ ...m, sim: matrix[mi][ti] })).sort((a, b) => b.sim - a.sim);
      return { tanque: { user_id: t.user_id, nombre: t.nombre, features: t.features, trend: t.trend, trendPct: t.trendPct },
               best: sorted[0] ? { user_id: sorted[0].user_id, nombre: sorted[0].nombre, sim: sorted[0].sim, features: sorted[0].features, trend: sorted[0].trend, trendPct: sorted[0].trendPct } : null };
    });

    // ── Resultados por modelo de vehículo ──────────────────────────────────
    const allModelos = new Set();
    for (const tech of techs) {
      for (const modelo of Object.keys(tech.modelNormalized || {})) allModelos.add(modelo);
    }

    const byModel = {};
    for (const modelo of allModelos) {
      const mMotors  = motors.filter(m => m.modelNormalized?.[modelo]);
      const mTanques = tanques.filter(t => t.modelNormalized?.[modelo]);
      if (!mMotors.length || !mTanques.length) continue;

      const mMatrix = mMotors.map(m =>
        mTanques.map(t => Math.round((1 - calcDistNorm(
          m.modelNormalized[modelo], t.modelNormalized[modelo],
          m.modelFeatures?.[modelo]?.peakHour, t.modelFeatures?.[modelo]?.peakHour
        )) * 100))
      );

      const mMotorPairs = mMotors.map((m, mi) => {
        const sorted = mTanques.map((t, ti) => ({ ...t, sim: mMatrix[mi][ti] })).sort((a, b) => b.sim - a.sim);
        return {
          motor: { user_id: m.user_id, nombre: m.nombre, features: m.modelFeatures?.[modelo], samples: m.modelNormalized[modelo]?.sampleCount || 0, trend: m.trend, trendPct: m.trendPct },
          best: sorted[0] ? { user_id: sorted[0].user_id, nombre: sorted[0].nombre, sim: sorted[0].sim, features: sorted[0].modelFeatures?.[modelo], trend: sorted[0].trend, trendPct: sorted[0].trendPct } : null,
          all: sorted.map(t => ({ user_id: t.user_id, nombre: t.nombre, sim: t.sim })),
        };
      }).sort((a, b) => (b.best?.sim || 0) - (a.best?.sim || 0));

      byModel[modelo] = {
        motors:    mMotors.map(m  => ({ user_id: m.user_id,  nombre: m.nombre,  features: m.modelFeatures?.[modelo],  samples: m.modelNormalized[modelo]?.sampleCount || 0, trend: m.trend,  trendPct: m.trendPct })),
        tanques:   mTanques.map(t => ({ user_id: t.user_id,  nombre: t.nombre,  features: t.modelFeatures?.[modelo],  samples: t.modelNormalized[modelo]?.sampleCount || 0, trend: t.trend,  trendPct: t.trendPct })),
        matrix:    mMatrix,
        motorPairs: mMotorPairs,
      };
    }

    return res.json({
      ok: true,
      trained_at: model.trained_at,
      next_auto_retrain: nextAutoRetrainAt_,
      total_techs: techs.length,
      motors:  motors.map(m => ({ user_id: m.user_id, nombre: m.nombre, features: m.features })),
      tanques: tanques.map(t => ({ user_id: t.user_id, nombre: t.nombre, features: t.features })),
      matrix,
      motorPairs,
      tanquePairs,
      byModel,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
