// =========================
// lib/ml-pairing.js
// El criterio de emparejamiento MOTOR–TANQUE, en un solo sitio.
//
// Todo aquí es PURO: recibe filas, devuelve números. Sin red, sin BD, sin reloj
// propio (la fecha de referencia siempre entra por parámetro). Eso es lo que
// permite validar el criterio contra el histórico sin levantar el servidor.
//
// Antes esto vivía repartido entre routes/ml.js (que entrena y sugiere en la
// pantalla del técnico) y lib/despacho-motor.js (que decide en el taller), con
// DOS juegos de pesos distintos y dos formas distintas de medir la distancia
// entre horas. Daban respuestas diferentes para la misma pregunta en 5 de cada
// 10 técnicos. Este módulo existe para que eso no pueda volver a pasar.
// =========================

// ─── FEATURES ─────────────────────────────────────────────────────────────────

export const KEYS = ["dailyRate", "avgMs", "peakHour", "hourStd", "consistency"];

// Mínimo de carros terminados para tener perfil. Con menos no hay ritmo que
// medir, solo ruido. A quien no llegue se le da compatibilidad neutra (0.5).
export const MIN_FILAS = 3;

// Semivida del decaimiento por recencia, en días. Un carro de hace 30 días pesa
// la mitad que uno de hoy; uno de hace 90, un octavo. Nunca llega a cero, así
// que dos semanas de ausencia no borran el perfil de nadie.
export const DECAY_HALFLIFE_D = 30;

const LN2 = Math.LN2;

/** Peso por recencia de un instante `ms` respecto de la referencia `refMs`. */
export function pesoPorEdad_(ms, refMs, semividaDias = DECAY_HALFLIFE_D) {
  const edadDias = Math.max(0, (refMs - ms) / 86400000);
  return Math.exp(-(LN2 / semividaDias) * edadDias);
}

const suma_ = ws => ws.reduce((s, w) => s + w, 0);

/** Media ponderada. */
export function wMean_(vals, ws) {
  const sw = suma_(ws);
  return sw > 0 ? vals.reduce((s, v, i) => s + v * ws[i], 0) / sw : 0;
}

/** Desviación estándar ponderada alrededor de `mu`. */
export function wStd_(vals, ws, mu) {
  const sw = suma_(ws);
  return sw > 0 ? Math.sqrt(vals.reduce((s, v, i) => s + ws[i] * (v - mu) ** 2, 0) / sw) : 0;
}

/** Mediana ponderada: el valor donde la mitad del PESO queda a cada lado. */
export function wMedian_(vals, ws, fallback) {
  if (!vals.length) return fallback;
  const pares = vals.map((v, i) => [v, ws[i]]).sort((a, b) => a[0] - b[0]);
  const mitad = suma_(pares.map(p => p[1])) / 2;
  let acc = 0;
  for (const [v, w] of pares) { acc += w; if (acc >= mitad) return v; }
  return pares[pares.length - 1][0];
}

/**
 * Los cinco features de un técnico, ponderados por recencia.
 *
 * @param rows  asignaciones FINALIZADO de esa persona EN SU ROL. Mezclar roles
 *              rompe el perfil: las filas de CALIDAD son mucho más rápidas y
 *              disparan dailyRate/avgMs de quien las tenga.
 * @param refMs instante desde el que se mide la antigüedad. En entrenamiento es
 *              "ahora"; en validación es la fecha de corte, y eso es justo lo
 *              que impide que el futuro se filtre al perfil.
 */
export function computeFeatures(rows, refMs = Date.now(), semividaDias = DECAY_HALFLIFE_D) {
  if (!Array.isArray(rows) || rows.length < MIN_FILAS) return null;
  const P = r => pesoPorEdad_(new Date(r.updated_at).getTime(), refMs, semividaDias);

  // Por día: cuántos carros, y qué peso le corresponde a ese día.
  const byDay = {};
  for (const r of rows) {
    const d = r.updated_at?.slice(0, 10);
    if (!d) continue;
    if (!byDay[d]) byDay[d] = { n: 0, w: 0 };
    byDay[d].n += 1;
    byDay[d].w = Math.max(byDay[d].w, P(r));
  }
  const dias = Object.values(byDay);
  if (!dias.length) return null;

  const dayCounts = dias.map(d => d.n);
  const dayWs     = dias.map(d => d.w);
  const dailyRate = wMean_(dayCounts, dayWs);
  const consistency = dailyRate > 0 ? wStd_(dayCounts, dayWs, dailyRate) / dailyRate : 1;

  // Se descartan los tiempos imposibles: 0 y cualquier cosa por encima de 8 h
  // es un carro que quedó abierto de un día para otro, no una duración real.
  const tRows = rows.filter(r => { const t = Number(r.tiempo_trab_ms); return t > 0 && t < 28800000; });
  const avgMs = wMean_(tRows.map(r => Number(r.tiempo_trab_ms)), tRows.map(P));

  const hRows = rows.filter(r => r.updated_at);
  const hours = hRows.map(r => new Date(r.updated_at).getHours());
  const hWs   = hRows.map(P);
  const peakHour = wMedian_(hours, hWs, 12);
  const hourStd  = wStd_(hours, hWs, wMean_(hours, hWs));

  // Dos números distintos, y conviene no confundirlos:
  //
  // `nEff` (Kish) mide cuánto DESEQUILIBRIO hay entre los pesos: si un técnico
  // tiene 200 carros pero 190 son de hace medio año y 10 de esta semana, esos
  // 10 mandan y nEff lo dice. Es invariante de escala, así que NO distingue un
  // perfil viejo de uno reciente: 20 carros todos de hace seis meses dan
  // nEff ≈ 20, igual que 20 de esta semana.
  //
  // `pesoTotal` (Σw) sí es la frescura: 20 carros de esta semana suman ~19,
  // y 20 de hace seis meses suman ~0.06. Para "¿me fío de este perfil?" hay
  // que mirar los dos — bastante muestra y no toda rancia.
  const wAll = rows.map(P);
  const sw = suma_(wAll), sw2 = wAll.reduce((s, w) => s + w * w, 0);

  return {
    dailyRate, consistency, avgMs, peakHour, hourStd,
    totalRows: rows.length,
    workingDays: dias.length,
    nEff: sw2 > 0 ? Math.round((sw * sw) / sw2 * 10) / 10 : 0,
    pesoTotal: Math.round(sw * 10) / 10,
  };
}

/**
 * Normaliza a [0,1] dividiendo cada feature por su máximo entre todos.
 *
 * Nota honesta sobre este método: comprime. Con la plantilla actual deja el 83 %
 * de los pares por encima del 80 % de similitud, así que el umbral de 0.8 que
 * dispara "mismo ritmo que su pareja" en la TV casi no discrimina. Se probó
 * sustituirlo por puntuación z y validarlo contra el desfase real (ver
 * `validarPorCortes_`): sobre siete cortes temporales las dos normalizaciones
 * quedaron empatadas dentro del ruido, así que se mantiene la de máximo, que
 * es la que ya estaba y tiene rango acotado. Si algún día hay más datos, este
 * es el primer sitio donde volver a mirar.
 */
export function normalizarFeatures(featsPorId) {
  const maxes = {};
  const ids = Object.keys(featsPorId);
  for (const k of KEYS) {
    maxes[k] = Math.max(...ids.map(id => featsPorId[id]?.[k] || 0), 1e-9);
  }
  const normalized = {};
  for (const id of ids) {
    normalized[id] = {};
    for (const k of KEYS) normalized[id][k] = (featsPorId[id]?.[k] || 0) / maxes[k];
  }
  return { maxes, normalized };
}

// ─── DISTANCIA ────────────────────────────────────────────────────────────────

/**
 * Los pesos del emparejamiento. ÚNICA definición del criterio.
 *
 * Son los que venían de lib/despacho-motor.js, o sea los que ya decidían de
 * verdad en el taller. La otra tabla que existía (routes/ml.js, con dailyRate
 * a 0.40) se retiró: al medirlas contra el desfase real ninguna de las dos
 * resultó mejor de forma consistente — sobre siete cortes temporales dieron
 * rho 0.26 y 0.26 — así que la elección entre ellas no era una mejora, era
 * una moneda al aire. Lo que sí costaba caro era tener las dos.
 */
export const W_SIM = {
  avgMs:       0.45,
  dailyRate:   0.25,
  consistency: 0.15,
  peakHour:    0.10,
  hourStd:     0.05,
};

/**
 * Distancia entre dos horas del día, normalizada a [0,1].
 *
 * Circular: las 23 h y la 1 h distan 2 horas, no 22. Con la jornada actual
 * (todos cierran entre las 10 y las 15) da igual que lineal, y así se midió;
 * se usa la circular porque es la correcta y no cuesta nada, no porque haya
 * mejorado ninguna métrica.
 */
export const circHourDist_ = (ha, hb) =>
  Math.min(Math.abs(ha - hb), 24 - Math.abs(ha - hb)) / 12;

/**
 * Distancia euclidiana ponderada entre dos técnicos.
 * Cada uno es `{ normalized, features }`; `features` solo hace falta para la
 * hora, y si no está se cae a la diferencia normalizada.
 */
export function distancia_(a, b, W = W_SIM) {
  const na = a?.normalized, nb = b?.normalized;
  if (!na || !nb) return null;
  const suma = Object.entries(W).reduce((s, [k, w]) => {
    let d;
    if (k === "peakHour" && a.features?.peakHour != null && b.features?.peakHour != null) {
      d = circHourDist_(a.features.peakHour, b.features.peakHour);
    } else {
      d = (na[k] || 0) - (nb[k] || 0);
    }
    return s + w * d * d;
  }, 0);
  return Math.sqrt(suma);
}

/** Similitud 0..1 entre dos técnicos. Devuelve 0.5 (neutra) si falta perfil. */
export function similitud_(a, b, W = W_SIM) {
  const d = distancia_(a, b, W);
  if (d == null) return 0.5;
  return Math.min(1, Math.max(0, 1 - d));
}

// ─── LA ETIQUETA: DESFASE MOTOR–TANQUE ────────────────────────────────────────

// Más allá de esto no es "la misma dupla en el mismo turno", es un carro que se
// quedó abierto. Incluirlos convertiría la métrica en un detector de carros
// abandonados, que no es lo que se quiere medir.
export const DESFASE_CAP_MIN = 480;   // 8 h

/**
 * Reconstruye, carro por carro, cuánto se llevaron MOTOR y TANQUE al terminar.
 *
 * Esta es la variable objetivo que faltaba. El emparejamiento existe para que
 * los dos acaben a la vez (ver PESOS.compatibilidad en despacho-motor.js), así
 * que el desfase real es exactamente la respuesta correcta contra la que
 * medirse. Estaba en la base desde el principio; nadie la había mirado.
 *
 * @param asignaciones filas FINALIZADO con work_order_id, user_id, rol_trabajo
 * @param espPorId     { user_id: "MOTOR" | "TANQUE" }
 * @returns [{ motor, tanque, ts, desfaseMin }]  ordenado por fecha ascendente
 */
export function extraerPares_(asignaciones, espPorId, { capMin = DESFASE_CAP_MIN } = {}) {
  const porCarro = new Map();
  for (const a of asignaciones) {
    if (!a.work_order_id) continue;
    if (!porCarro.has(a.work_order_id)) porCarro.set(a.work_order_id, []);
    porCarro.get(a.work_order_id).push(a);
  }

  const ultimoDe = (filas, rol) => filas
    .filter(r => String(r.rol_trabajo || "").toUpperCase() === rol)
    .sort((x, y) => new Date(y.updated_at) - new Date(x.updated_at))[0];

  const pares = [];
  for (const filas of porCarro.values()) {
    const m = ultimoDe(filas, "MOTOR"), t = ultimoDe(filas, "TANQUE");
    if (!m || !t || m.user_id === t.user_id) continue;
    // El rol registrado tiene que coincidir con la especialidad de la persona,
    // o el par no representa una dupla MOTOR–TANQUE de verdad.
    if (espPorId[m.user_id] !== "MOTOR" || espPorId[t.user_id] !== "TANQUE") continue;
    const tm = new Date(m.updated_at).getTime(), tt = new Date(t.updated_at).getTime();
    if (!Number.isFinite(tm) || !Number.isFinite(tt)) continue;
    const desfaseMin = Math.abs(tm - tt) / 60000;
    if (desfaseMin > capMin) continue;
    pares.push({ motor: m.user_id, tanque: t.user_id, ts: Math.max(tm, tt), desfaseMin });
  }
  return pares.sort((a, b) => a.ts - b.ts);
}

/**
 * Agrupa los pares por dupla y resume con la MEDIANA del desfase.
 *
 * Mediana y no media: un carro que se atascó una tarde no puede decidir si dos
 * personas se acompasan. `minCarros` evita que una dupla que coincidió una vez
 * pese lo mismo que una que lleva treinta carros juntos.
 */
export function agruparDuplas_(pares, minCarros = 3) {
  const g = new Map();
  for (const p of pares) {
    const k = p.motor + "|" + p.tanque;
    if (!g.has(k)) g.set(k, { motor: p.motor, tanque: p.tanque, desfases: [] });
    g.get(k).desfases.push(p.desfaseMin);
  }
  return [...g.values()]
    .filter(d => d.desfases.length >= minCarros)
    .map(d => {
      const orden = d.desfases.slice().sort((a, b) => a - b);
      return {
        motor: d.motor, tanque: d.tanque, carros: orden.length,
        desfaseMediano: orden[Math.floor(orden.length / 2)],
      };
    });
}

// ─── MÉTRICA ──────────────────────────────────────────────────────────────────

/**
 * Correlación de rangos de Spearman.
 *
 * De rangos y no de Pearson porque el desfase tiene una cola larguísima (la
 * mediana está en 59 min y hay pares de 8 h); Pearson mediría sobre todo esa
 * cola. Lo que interesa es el orden: ¿las duplas que el modelo llama parecidas
 * son las que de hecho acaban más juntas?
 */
export function spearman_(xs, ys) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const rangos = v => {
    const orden = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(v.length);
    let i = 0;
    while (i < orden.length) {
      let j = i;
      while (j + 1 < orden.length && orden[j + 1][0] === orden[i][0]) j++;
      const r = (i + j) / 2 + 1;                    // empates: rango promedio
      for (let k = i; k <= j; k++) out[orden[k][1]] = r;
      i = j + 1;
    }
    return out;
  };
  const a = rangos(xs), b = rangos(ys), mu = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - mu) * (b[i] - mu);
    da  += (a[i] - mu) ** 2;
    db  += (b[i] - mu) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

const mediana_ = v => {
  if (!v.length) return null;
  const o = v.slice().sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

/**
 * Una corrida de validación: perfilar con lo anterior al corte, medir con lo
 * posterior.
 *
 * El corte es TEMPORAL, nunca aleatorio. Con una separación al azar, carros del
 * mismo día caerían a un lado y otro y el perfil llevaría dentro información
 * del periodo que dice predecir; el rho saldría bonito y no significaría nada.
 *
 * @returns { rho, duplas, desfaseCerca, desfaseLejos, desfaseGlobal } · null si
 *          no hay duplas suficientes para que la métrica signifique algo.
 */
export function validarCorte_({
  asignaciones, espPorId, pares, corteMs, ventanaDias = 30,
  minCarros = 3, minDuplas = 20, W = W_SIM, semividaDias = DECAY_HALFLIFE_D,
}) {
  // Perfiles con lo que se sabía EN el corte.
  const filasPorTec = {};
  for (const a of asignaciones) {
    const esp = espPorId[a.user_id];
    if (!esp || String(a.rol_trabajo || "").toUpperCase() !== esp) continue;
    if (new Date(a.updated_at).getTime() >= corteMs) continue;
    (filasPorTec[a.user_id] ||= []).push(a);
  }
  const feats = {};
  for (const [id, filas] of Object.entries(filasPorTec)) {
    const f = computeFeatures(filas, corteMs, semividaDias);
    if (f) feats[id] = f;
  }
  if (Object.keys(feats).length < 2) return null;
  const { normalized } = normalizarFeatures(feats);
  const techs = Object.fromEntries(
    Object.keys(feats).map(id => [id, { features: feats[id], normalized: normalized[id] }])
  );

  // Duplas observadas DESPUÉS del corte, dentro de la ventana.
  const finVentana = corteMs + ventanaDias * 86400000;
  const duplas = agruparDuplas_(
    pares.filter(p => p.ts >= corteMs && p.ts < finVentana && techs[p.motor] && techs[p.tanque]),
    minCarros
  );
  if (duplas.length < minDuplas) return null;

  const dists = duplas.map(d => distancia_(techs[d.motor], techs[d.tanque], W));
  const ys    = duplas.map(d => d.desfaseMediano);
  const rho   = spearman_(dists, ys);
  if (rho == null) return null;

  // Además del rho, lo que se puede contar en una reunión: cuánto separa de
  // hecho el criterio a las duplas que dice que encajan de las que no.
  const orden = duplas.map((d, i) => ({ d: dists[i], y: ys[i] })).sort((a, b) => a.d - b.d);
  const t = Math.max(1, Math.floor(orden.length / 3));
  return {
    corte: new Date(corteMs).toISOString(),
    rho: Math.round(rho * 1000) / 1000,
    duplas: duplas.length,
    desfaseCerca:  mediana_(orden.slice(0, t).map(x => x.y)),
    desfaseLejos:  mediana_(orden.slice(-t).map(x => x.y)),
    desfaseGlobal: mediana_(ys),
  };
}

/**
 * Validación de origen rodante: repite `validarCorte_` en varias fechas.
 *
 * Un único corte 70/30 no basta. Al probarlo así, la puntuación z parecía batir
 * a la normalización por máximo (0.225 contra 0.174) — y sobre siete cortes la
 * ventaja se evaporó. Un solo corte mide tanto el criterio como la suerte de
 * ese mes; la mediana sobre varios mide sobre todo el criterio.
 */
export function validarPorCortes_({
  asignaciones, espPorId, fracciones = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8],
  ...opts
}) {
  const pares = extraerPares_(asignaciones, espPorId);
  if (pares.length < 50) {
    return { ok: false, error: "Sin pares MOTOR–TANQUE suficientes", pares: pares.length };
  }
  const t0 = pares[0].ts, t1 = pares[pares.length - 1].ts;
  const corridas = fracciones
    .map(f => validarCorte_({ asignaciones, espPorId, pares, corteMs: t0 + (t1 - t0) * f, ...opts }))
    .filter(Boolean);

  if (!corridas.length) {
    return { ok: false, error: "Ningún corte reunió duplas suficientes", pares: pares.length };
  }
  const rhos = corridas.map(c => c.rho);
  return {
    ok: true,
    pares: pares.length,
    cortes: corridas.length,
    rhoMediano: Math.round(mediana_(rhos) * 1000) / 1000,
    rhoMin: Math.min(...rhos),
    rhoMax: Math.max(...rhos),
    desfaseCercaMediano: mediana_(corridas.map(c => c.desfaseCerca)),
    desfaseLejosMediano: mediana_(corridas.map(c => c.desfaseLejos)),
    corridas,
  };
}
