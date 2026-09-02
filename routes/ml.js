import { Router } from "express";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { normalizeModelo_ } from "../lib/utils.js";
import { pendingSuggestions_ } from "../lib/ml-state.js";
import {
  computeFeatures as computeFeatures_,
  normalizarFeatures,
  distancia_,
  validarPorCortes_,
  W_SIM,
  KEYS,
  MIN_FILAS,
  DECAY_HALFLIFE_D,
} from "../lib/ml-pairing.js";

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


// Próximo re-entrenamiento automático (ISO string, se actualiza al programar).
let nextAutoRetrainAt_ = null;

// ── Auto re-entrenamiento de emparejamiento cada 3 días ──────────────────────
//
// Por qué esto no era suficiente con un `setTimeout` y ya:
//
// El temporizador vive en la memoria del proceso. Render duerme o reinicia el
// dyno y el temporizador muere con él; al arrancar de nuevo se programaba otro,
// y si el dyno vuelve a reiniciarse antes de que venza, nunca vence. El modelo
// en producción llegó a estar 51 días sin reentrenar con un intervalo de 3, y
// no había ninguna señal de que eso estuviera pasando.
//
// Ahora hay tres defensas, en orden de cuándo actúan:
//   1. Al arrancar se comprueba la EDAD del modelo. Si ya está vencido se
//      reentrena de inmediato en vez de esperar otro ciclo completo.
//   2. Un latido cada hora comprueba la edad otra vez. Aunque el temporizador
//      largo se pierda, el modelo nunca se aleja más de una hora de su plazo.
//   3. `/api/ml/pairing-status` publica la edad y si está vencido, para que se
//      pueda vigilar desde fuera sin leer los logs del dyno.
const RETRAIN_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 72 horas
const LATIDO_MS           = 60 * 60 * 1000;          // 1 hora
const ARRANQUE_GRACIA_MS  = 60_000;                  // no entrenar en el arranque en frío

/** Edad del modelo en ms, o null si no hay modelo legible. */
function edadModeloMs_() {
  if (!existsSync(PAIRING_MODEL_PATH)) return null;
  try {
    const { trained_at } = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
    const t = new Date(trained_at).getTime();
    return Number.isFinite(t) ? Date.now() - t : null;
  } catch { return null; }
}

let entrenando_ = false;

/** Dispara un entrenamiento. Nunca dos a la vez: son ~80 consultas a Supabase. */
async function entrenarAhora_(motivo) {
  if (entrenando_) {
    console.log(`[ML-AUTO] Ya hay un entrenamiento en curso, se omite (${motivo}).`);
    return;
  }
  entrenando_ = true;
  try {
    console.log(`[ML-AUTO] Entrenando emparejamiento — ${motivo}`);
    const PORT = process.env.PORT || 3000;
    const r = await fetch(`http://localhost:${PORT}/api/ml/train-pairing`, { method: "POST" });
    const j = await r.json();
    if (j.ok) {
      const v = j.validacion ? ` · rho ${j.validacion.rho_mediano}` : "";
      console.log(`[ML-AUTO] OK · ${j.total_techs} técnicos (motor:${j.motor} tanque:${j.tanque}) · ${j.filas_usadas} carros${v}`);
    } else {
      console.warn(`[ML-AUTO] Falla: ${j.error}`);
    }
  } catch (e) {
    console.error("[ML-AUTO] Error en re-entrenamiento:", e.message);
  } finally {
    entrenando_ = false;
  }
}

export function scheduleAutoRetrain_() {
  const edad = edadModeloMs_();
  const restante = edad == null ? 0 : Math.max(0, RETRAIN_INTERVAL_MS - edad);

  // Defensa 1: si al arrancar el modelo ya está vencido (o no existe), se
  // entrena tras un margen corto — el tiempo de que el servidor acepte
  // peticiones, ya que el entrenamiento se llama a sí mismo por HTTP.
  const delayMs = restante > 0 ? restante : ARRANQUE_GRACIA_MS;
  nextAutoRetrainAt_ = new Date(Date.now() + delayMs).toISOString();

  if (edad == null) {
    console.log(`[ML-AUTO] Sin modelo en disco. Entrenando en ${Math.round(delayMs / 1000)}s.`);
  } else if (restante === 0) {
    console.log(`[ML-AUTO] Modelo vencido (${Math.round(edad / 3600000)}h de antigüedad). Entrenando en ${Math.round(delayMs / 1000)}s.`);
  } else {
    console.log(`[ML-AUTO] Próximo re-entrenamiento en ${Math.round(delayMs / 3600000)}h (${new Date(nextAutoRetrainAt_).toLocaleString("es-PE")})`);
  }

  const t = setTimeout(async () => {
    await entrenarAhora_(restante > 0 ? "vencimiento del ciclo de 3 días" : "modelo ausente o vencido al arrancar");
    scheduleAutoRetrain_();
  }, delayMs);
  if (t.unref) t.unref();   // no mantener vivo el proceso solo por esto

  // Defensa 2: latido horario. Si el temporizador largo se pierde en un
  // reinicio, este lo recoge dentro de la hora siguiente.
  if (!scheduleAutoRetrain_._latido) {
    scheduleAutoRetrain_._latido = setInterval(async () => {
      const e = edadModeloMs_();
      if (e != null && e >= RETRAIN_INTERVAL_MS && !entrenando_) {
        await entrenarAhora_(`latido: ${Math.round(e / 3600000)}h sin reentrenar`);
      }
    }, LATIDO_MS);
    if (scheduleAutoRetrain_._latido.unref) scheduleAutoRetrain_._latido.unref();
  }
}

// ── GET /api/ml/pairing-status ────────────────────────────────────────────────
// Defensa 3: la edad del modelo, visible desde fuera. Sin esto, "el modelo está
// viejo" solo se descubre revisando los logs del dyno o notando que la TV
// sugiere duplas raras.
router.get("/api/ml/pairing-status", (req, res) => {
  const edad = edadModeloMs_();
  let modelo = null;
  try {
    if (existsSync(PAIRING_MODEL_PATH)) modelo = JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
  } catch {}
  res.json({
    ok: true,
    entrenado: !!modelo,
    trained_at: modelo?.trained_at ?? null,
    edad_horas: edad == null ? null : Math.round(edad / 3600000),
    vencido: edad != null && edad >= RETRAIN_INTERVAL_MS,
    intervalo_horas: RETRAIN_INTERVAL_MS / 3600000,
    proximo_reentrenamiento: nextAutoRetrainAt_,
    entrenando: entrenando_,
    total_techs: modelo?.total_techs ?? null,
    filas_usadas: modelo?.filas_usadas ?? null,
    validacion: modelo?.validacion ?? null,
  });
});

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

/**
 * Técnicos activos y TODO el histórico de asignaciones FINALIZADO.
 *
 * Sin corte por fecha. Antes se cortaba en 90 días: la idea era "que el modelo
 * refleje al técnico de ahora", pero el corte no lo conseguía y sí costaba caro
 * — en el entrenamiento del 13-jul había 5386 filas dentro de esos 90 días y el
 * modelo guardó 605; el resto se perdía en el `limit` sin paginar de entonces,
 * y nadie lo notó porque no había con qué comparar.
 *
 * La recencia la da ahora el decaimiento exponencial (DECAY_HALFLIFE_D), que es
 * la herramienta correcta: un carro de hace cuatro meses pesa poco, pero pesa
 * — no desaparece de golpe al cruzar una frontera arbitraria.
 */
async function cargarHistorico_() {
  const SUPABASE_URL = process.env.SUPABASE_URL;

  const rUsers = await fetch(
    `${SUPABASE_URL}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,email,especialidad`,
    { method: "GET", headers: supabaseHeaders_() }
  );
  const users = rUsers.ok ? await rUsers.json() : [];

  const PAGINA = 1000;
  const MAX_FILAS = 100000;     // freno de seguridad, no un objetivo
  const finRows = [];
  let truncado = false;
  for (let offset = 0; offset < MAX_FILAS; offset += PAGINA) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?estado_actual=eq.FINALIZADO` +
      `&select=user_id,updated_at,tiempo_trab_ms,work_order_id,rol_trabajo` +
      `&order=updated_at.desc&limit=${PAGINA}&offset=${offset}`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    if (!r.ok) break;
    const lote = await r.json();
    finRows.push(...lote);
    if (lote.length < PAGINA) break;
    if (offset + PAGINA >= MAX_FILAS) truncado = true;
  }
  return { users, finRows, truncado };
}

/** { user_id: "MOTOR" | "TANQUE" } — lo que necesita ml-pairing para los pares. */
const espPorId_ = users =>
  Object.fromEntries(users.map(u => [u.id, String(u.especialidad || "").toUpperCase()]));

// ── POST /api/ml/validate-pairing ─────────────────────────────────────────────
//
// ¿El criterio de emparejamiento sirve para algo? Hasta ahora no había forma de
// responder: no hay etiqueta que diga si una dupla salió bien. La que faltaba
// estaba en la base desde el principio — el DESFASE entre el cierre del MOTOR y
// el del TANQUE del mismo carro, que es literalmente el objetivo declarado del
// emparejamiento ("que acaben a la vez", PESOS.compatibilidad).
//
// Mide con origen rodante: perfila con lo anterior a cada corte y comprueba
// contra los 30 días siguientes. Nunca con separación aleatoria — carros del
// mismo día caerían a ambos lados y el perfil llevaría dentro el periodo que
// dice predecir.
//
// Lectura de los números, con los datos de sep-2026:
//   rho ≈ 0.25 sobre siete cortes, p = 0.03 por permutación → hay señal, y es
//   modesta. Las duplas que el modelo llama parecidas cierran con una mediana
//   de ~54 min de desfase; las que llama dispares, ~71 min.
router.post("/api/ml/validate-pairing", async (req, res) => {
  try {
    const { users, finRows } = await cargarHistorico_();
    if (!users.length) return res.json({ ok: false, error: "Sin técnicos activos" });

    const ventanaDias = Number(req.query.ventana_dias) || 30;
    const minCarros   = Number(req.query.min_carros)   || 3;

    const r = validarPorCortes_({
      asignaciones: finRows,
      espPorId: espPorId_(users),
      ventanaDias, minCarros,
    });

    return res.json({
      ...r,
      filas_analizadas: finRows.length,
      pesos: W_SIM,
      semivida_dias: DECAY_HALFLIFE_D,
      // Sin esto el rho es un número sin escala. El lector necesita saber que
      // 0 es "el criterio no sirve" y que aquí nunca se ha visto pasar de 0.45.
      interpretacion: r.ok
        ? `rho ${r.rhoMediano} sobre ${r.cortes} cortes. 0 = el criterio no predice nada; ` +
          `positivo = las duplas que el modelo llama parecidas cierran más juntas. ` +
          `Duplas más parecidas: ${Math.round(r.desfaseCercaMediano)} min de desfase mediano; ` +
          `menos parecidas: ${Math.round(r.desfaseLejosMediano)} min.`
        : undefined,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

router.post("/api/ml/train-pairing", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const { users, finRows, truncado } = await cargarHistorico_();
    if (!users.length) return res.json({ ok: false, error: "Sin técnicos activos" });

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

    // Solo cuentan las filas del rol que la persona ejerce en la dupla.
    //
    // El modelo empareja un MOTOR con un TANQUE, así que su perfil tiene que
    // medir cómo trabaja EN ESE PUESTO. Sin este filtro se colaban las filas
    // de CALIDAD y RAMALERO: Luis Uribe (MOTOR) tenía 186 de 347 en CALIDAD,
    // que son mucho más rápidas, y salía con 4.4 carros/día y 37 min/carro.
    // Como la normalización divide por el máximo, ese perfil inflado aplastaba
    // la escala de los otros 19 técnicos contra su propio artefacto.
    const espDe = espPorId_(users);

    const byUser     = {};
    const byUserModel = {};   // { userId: { modelo: [rows] } }
    for (const row of finRows) {
      const esp = espDe[row.user_id];
      if (!esp) continue;                                          // no es técnico activo
      if (String(row.rol_trabajo || "").toUpperCase() !== esp) continue;
      if (!byUser[row.user_id]) byUser[row.user_id] = [];
      byUser[row.user_id].push(row);
      if (row.modelo) {
        if (!byUserModel[row.user_id]) byUserModel[row.user_id] = {};
        if (!byUserModel[row.user_id][row.modelo]) byUserModel[row.user_id][row.modelo] = [];
        byUserModel[row.user_id][row.modelo].push(row);
      }
    }
    const filasUsadas = Object.values(byUser).reduce((s, rs) => s + rs.length, 0);

    // El decaimiento por recencia, los features y la distancia viven en
    // lib/ml-pairing.js. Estaban aquí duplicados frente a despacho-motor.js y
    // las dos copias se habían separado. Ahora hay una sola definición, y es
    // la misma que mide `/api/ml/validate-pairing`.
    const ahoraMs = Date.now();
    const computeFeatures = rows => computeFeatures_(rows, ahoraMs);

    // Ventana de referencia SOLO para reportar tendencia. No entra en el
    // cálculo de features — de eso se encarga el decaimiento. Son 30 días
    // porque es el horizonte que el supervisor reconoce ("cómo viene el mes").
    const TREND_DIAS    = 30;
    const TREND_UP_THR  = 1.10;   // +10% respecto al histórico → ascendente
    const TREND_DN_THR  = 0.90;   // −10% → descendente
    const sinceTrendMs  = ahoraMs - TREND_DIAS * 86400000;
    const MIN_TREND     = 5;      // mínimo de carros en la ventana para opinar

    const excluidos = [];

    const techFeatures = [];
    for (const user of users) {
      const allRows = byUser[user.id] || [];

      // `features` es lo que usa el emparejamiento: todo el histórico, con
      // decaimiento de 30 días de semivida aplicado dentro de computeFeatures.
      const features = computeFeatures(allRows);
      if (!features) {
        excluidos.push({
          user_id: user.id, nombre: user.nombre, especialidad: user.especialidad,
          carros_historicos: allRows.length,
          motivo: allRows.length < MIN_FILAS
            ? `Necesita ${MIN_FILAS} carros terminados en su rol, lleva ${allRows.length}`
            : "Sin fechas utilizables en sus carros terminados",
        });
        continue;
      }

      const recentRows  = allRows.filter(r => new Date(r.updated_at).getTime() >= sinceTrendMs);
      const recentFeats = recentRows.length >= MIN_TREND ? computeFeatures(recentRows) : null;
      features.recentRows = recentRows.length;

      // Tendencia: ritmo de los últimos 30 días contra el del histórico
      // ponderado. Es informativa (la TV la muestra), no altera el ranking.
      const trend = recentFeats
        ? (recentFeats.dailyRate > features.dailyRate * TREND_UP_THR ? "up"
          : recentFeats.dailyRate < features.dailyRate * TREND_DN_THR ? "down"
          : "stable")
        : "unknown";

      const trendPct = recentFeats
        ? Math.round(((recentFeats.dailyRate - features.dailyRate) / Math.max(features.dailyRate, 0.1)) * 100)
        : 0;

      // Features por modelo de carro: mismo decaimiento, segmentado por tipo.
      const modelFeatsMap = {};
      for (const [modelo, rows] of Object.entries(byUserModel[user.id] || {})) {
        if (rows.length < 8) continue;   // mínimo 8 asignaciones para features confiables por modelo
        const mf = computeFeatures(rows);
        if (!mf) continue;
        modelFeatsMap[modelo] = mf;
        modelFeatsMap[modelo].sampleCount = rows.length;
      }

      techFeatures.push({
        id: user.id, nombre: user.nombre, email: user.email, especialidad: user.especialidad,
        features, trend, trendPct,
        recentFeatures: recentFeats,
        modelFeatures: modelFeatsMap,
      });
    }
    if (!techFeatures.length) return res.json({ ok: false, error: "Sin datos suficientes para entrenar" });

    // Normalizar a [0,1] con los máximos entre todos los técnicos.
    const { maxes } = normalizarFeatures(
      Object.fromEntries(techFeatures.map(t => [t.id, t.features]))
    );
    for (const tech of techFeatures) {
      tech.normalized = {};
      for (const k of KEYS) tech.normalized[k] = (tech.features[k] || 0) / maxes[k];

      // Los features por modelo de carro se normalizan con los MISMOS máximos
      // globales; si cada modelo tuviera su escala no serían comparables entre sí.
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

    // Cada entrenamiento se mide a sí mismo y guarda su nota junto al modelo.
    // Sin esto, "el modelo empeoró" sería una impresión; con esto es un número
    // comparable entre corridas. Si falla no aborta el entrenamiento: un
    // modelo sin nota sigue sirviendo, y no tenerlo por no poder medirlo sería
    // peor que tenerlo a ciegas.
    let validacion = null;
    try {
      validacion = validarPorCortes_({ asignaciones: finRows, espPorId: espDe });
    } catch (e) {
      console.warn("[ML] No se pudo validar el modelo:", e.message);
    }

    const modelPayload = {
      trained_at: new Date().toISOString(),
      decay_halflife_days: DECAY_HALFLIFE_D,
      trend_days: TREND_DIAS,
      ventana: "historico-completo",
      total_techs: techFeatures.length,
      filas_usadas: filasUsadas,
      pesos: W_SIM,
      validacion: validacion?.ok
        ? {
            rho_mediano: validacion.rhoMediano,
            rho_min: validacion.rhoMin,
            rho_max: validacion.rhoMax,
            cortes: validacion.cortes,
            pares: validacion.pares,
            desfase_cerca_min: validacion.desfaseCercaMediano,
            desfase_lejos_min: validacion.desfaseLejosMediano,
          }
        : null,
      maxes,
      modelFeaturesIndex,
      techs: techFeatures.map(t => ({
        user_id: t.id, nombre: t.nombre, email: t.email, especialidad: t.especialidad,
        features: t.features, normalized: t.normalized,
        trend: t.trend, trendPct: t.trendPct,
        recentFeatures: t.recentFeatures,
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
      decay_halflife_days: DECAY_HALFLIFE_D,
      trends,
      validacion: modelPayload.validacion,
      // Lo que faltaba para poder responder "¿por qué no salió Fulano?"
      tecnicos_activos: users.length,
      filas_descargadas: finRows.length,
      filas_usadas: filasUsadas,
      filas_descartadas_por_rol: finRows.length - filasUsadas,
      filas_truncadas: truncado,
      excluidos,
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

    // Mismo criterio que aplica el motor de despacho en el taller. Antes esta
    // ruta tenía su propia tabla de pesos (dailyRate 0.40) y discrepaba con él
    // en la "mejor pareja" de 5 de cada 10 técnicos de MOTOR.
    const calcDist = (a, b) => distancia_(a, b, W_SIM) ?? 1;

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
    // Complementarios (pairEsp) con trabajo EN CURSO (no finalizado).
    const rPairActive = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${pairEsp}&activo=eq.true&estado_actual=neq.FINALIZADO&select=user_id,work_order_id&limit=2000`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const pairActiveRows = rPairActive.ok ? await rPairActive.json() : [];

    // Excluir carros cuyo lado de MI rol ya está TOMADO o TERMINADO.
    // ⚠️ Se consulta SOLO por los work_orders candidatos (in.(…), en lotes) en
    // vez de "todas mis asignaciones": `activo` nunca vuelve a false (ni al
    // FINALIZAR), así que un query global choca con el límite de 1000 filas de
    // Supabase y deja pasar carros que ya tienen tanquero (activo o finalizado).
    const pairWoIds = [...new Set(pairActiveRows.map(a => a.work_order_id).filter(Boolean))];
    const myTakenWoIds = new Set();
    for (let i = 0; i < pairWoIds.length; i += 200) {
      const batch = pairWoIds.slice(i, i + 200);
      const rMine = await fetch(
        `${SUPABASE_URL}/rest/v1/asignaciones?rol_trabajo=eq.${myEsp}&activo=eq.true&work_order_id=in.(${batch.join(",")})&select=work_order_id`,
        { method: "GET", headers: supabaseHeaders_() }
      );
      if (rMine.ok) (await rMine.json()).forEach(a => myTakenWoIds.add(a.work_order_id));
    }

    const soloRows = pairActiveRows.filter(a => !myTakenWoIds.has(a.work_order_id));
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
    const calcDist = (aNorm, bNorm, aPeakH, bPeakH) => distancia_(
      { normalized: aNorm, features: { peakHour: aPeakH } },
      { normalized: bNorm, features: { peakHour: bPeakH } },
      W_SIM
    ) ?? 1;

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
        const woId = soloByUser[userId];
        suggestions.push({
          id:           userId,
          nombre:       candUserMap[userId] || ml?.nombre || "",
          especialidad: pairEsp,
          modelo:       modelo,
          vin:          soloWoVin[woId] || null,
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
          vin: soloWoVin[woId] || null,
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

    const calcDistNorm = (na, nb, aPeakH, bPeakH) => distancia_(
      { normalized: na, features: { peakHour: aPeakH } },
      { normalized: nb, features: { peakHour: bPeakH } },
      W_SIM
    ) ?? 1;

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
