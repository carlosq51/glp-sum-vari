// =========================
// lib/regresion.js
// Tendencia robusta para los tiempos del taller.
//
// POR QUÉ NO MÍNIMOS CUADRADOS
// ────────────────────────────
// Los datos vienen sucios y se sabe por qué: un técnico que olvida cerrar la OT
// deja un carro de catorce horas. Eso no es un carro lento, es un carro mal
// registrado — pero para una regresión ordinaria pesa como cualquier otro, y
// como el error va al cuadrado, un solo punto así inclina la recta entera.
// La "tendencia" acabaría midiendo los olvidos, no el trabajo.
//
// Theil–Sen toma la MEDIANA de las pendientes entre todos los pares de puntos.
// Su punto de ruptura es ~29%: hasta casi un tercio de los datos puede ser
// basura sin mover la recta. No hace falta decidir a mano qué es un outlier ni
// borrar filas —borrarlas sería decidir qué trabajo cuenta—, solo dejar de
// darles el voto desproporcionado que les daba el cuadrado del error.
//
// Puro y sin red: se calcula sobre datos ya leídos.
// =========================

/** Mediana de un array de números. Devuelve NaN si no hay datos. */
export function mediana_(nums) {
  const xs = (nums || []).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

/**
 * percentil_ — percentil p (0–100) con interpolación lineal.
 *
 * Se usa para los LÍMITES del eje y para la banda de dispersión. Con la media y
 * la desviación no serviría: el carro de 947 h que nadie cerró mueve las dos, y
 * el eje volvería a estirarse hasta lo absurdo por un solo registro roto.
 */
export function percentil_(nums, p) {
  const xs = (nums || []).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  if (xs.length === 1) return xs[0];
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (xs.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

/** Φ(z): normal estándar acumulada, vía la aproximación de erf de A&S 7.1.26. */
function phi_(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  const erf = z < 0 ? -y : y;
  return 0.5 * (1 + erf);
}

/**
 * mannKendall_ — ¿la serie tiene tendencia, o es ruido?
 *
 * POR QUÉ HACE FALTA
 * Theil–Sen SIEMPRE devuelve una pendiente, también cuando no hay nada que
 * medir: con datos puramente aleatorios sale un número pequeño distinto de
 * cero, y la lectura lo anunciaba como "vas mejorando". Eso es afirmar sobre
 * ruido. Mann–Kendall cuenta cuántos pares van hacia arriba y cuántos hacia
 * abajo y contrasta ese desbalance contra el que daría el azar.
 *
 * Es la prueba hermana de Theil–Sen (mismo mundo no paramétrico, misma
 * inmunidad a los outliers: solo mira el SIGNO de cada par, así que un carro de
 * 947 h cuenta exactamente igual que uno de 3 h y 1 minuto).
 *
 * @param {number[]} ys serie en orden temporal
 * @returns {{ok:boolean, S:number, z:number, p:number, significativa:boolean, sentido:-1|0|1}}
 */
export function mannKendall_(ys, alfa = 0.05) {
  const y = (ys || []).filter(n => Number.isFinite(n));
  const n = y.length;
  // Con menos de 8 puntos la aproximación normal no vale y el test no tiene
  // potencia para nada: es más honesto decir que no se sabe.
  if (n < 8) return { ok: false, S: 0, z: 0, p: 1, significativa: false, sentido: 0, n };

  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  }

  // Corrección por empates: días con la misma mediana no aportan información
  // de orden, y sin descontarlos la varianza saldría inflada.
  const cuentas = new Map();
  for (const v of y) cuentas.set(v, (cuentas.get(v) || 0) + 1);
  let ajuste = 0;
  for (const t of cuentas.values()) if (t > 1) ajuste += t * (t - 1) * (2 * t + 5);

  const varS = (n * (n - 1) * (2 * n + 5) - ajuste) / 18;
  if (varS <= 0) return { ok: false, S, z: 0, p: 1, significativa: false, sentido: 0, n };

  // Corrección de continuidad: S es discreto y lo estamos midiendo contra una
  // normal continua. Sin el -1 el test es optimista con series cortas.
  const z = (S - Math.sign(S)) / Math.sqrt(varS);
  const p = 2 * (1 - phi_(Math.abs(z)));
  const significativa = p < alfa;
  return { ok: true, S, z, p, significativa, sentido: significativa ? Math.sign(S) : 0, n };
}

/**
 * Regresión robusta de Theil–Sen.
 *
 * @param {Array<{x:number,y:number}>} puntos
 * @returns {{ pendiente:number, intercepto:number, n:number, ok:boolean }}
 *
 * `ok:false` cuando no hay con qué: menos de dos puntos, o todos en la misma
 * x (una sola jornada) — ahí no hay tendencia que medir y dibujar una recta
 * sería inventarla.
 */
export function theilSen_(puntos) {
  const p = (puntos || []).filter(d => Number.isFinite(d?.x) && Number.isFinite(d?.y));
  if (p.length < 2) return { pendiente: 0, intercepto: NaN, n: p.length, ok: false };

  const pendientes = [];
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = i + 1; j < p.length; j++) {
      const dx = p[j].x - p[i].x;
      // Dos medidas del mismo día no dicen nada sobre la tendencia: su
      // pendiente sería infinita. Se saltan, no se fuerzan a cero.
      if (dx === 0) continue;
      pendientes.push((p[j].y - p[i].y) / dx);
    }
  }
  if (!pendientes.length) return { pendiente: 0, intercepto: NaN, n: p.length, ok: false };

  const pendiente = mediana_(pendientes);
  // El intercepto también por mediana, por el mismo motivo que la pendiente:
  // usar la media aquí devolvería por la ventana el peso de los outliers que
  // acabamos de quitar por la puerta.
  const intercepto = mediana_(p.map(d => d.y - pendiente * d.x));
  return { pendiente, intercepto, n: p.length, ok: Number.isFinite(intercepto) };
}

/**
 * Dos extremos de la recta, listos para dibujar.
 * @returns {Array<{x:number,y:number}>} [] si el modelo no es utilizable
 */
export function lineaTendencia_(modelo, xMin, xMax) {
  if (!modelo?.ok || !Number.isFinite(xMin) || !Number.isFinite(xMax)) return [];
  const y = (x) => modelo.intercepto + modelo.pendiente * x;
  return [{ x: xMin, y: y(xMin) }, { x: xMax, y: y(xMax) }];
}

/**
 * Lectura de la tendencia contra un objetivo, en castellano.
 *
 * Devuelve el cruce SOLO si cae dentro de un horizonte razonable: extrapolar
 * una recta cien días hacia adelante para anunciar "llegarás al objetivo en
 * marzo" es precisión falsa sobre datos de taller.
 *
 * @param {object} modelo      salida de theilSen_
 * @param {number} umbralY     objetivo (en las mismas unidades que y)
 * @param {number} xActual     x del último punto
 * @param {number} [horizonte] cuántas unidades de x mirar hacia adelante
 * @param {object} [mk]        salida de mannKendall_; si dice que la pendiente
 *                             no se distingue del ruido, no se anuncia ninguna
 *                             mejora ni ningún empeoramiento
 */
export function lecturaTendencia_(modelo, umbralY, xActual, horizonte = 30, mk = null) {
  if (!modelo?.ok) return { hay: false, texto: "Faltan datos para una tendencia" };

  const yHoy = modelo.intercepto + modelo.pendiente * xActual;

  // Sin significancia no hay tendencia que contar. La posición contra el
  // objetivo sí se dice: eso es un hecho de hoy, no una extrapolación.
  if (mk?.ok && !mk.significativa) {
    return {
      hay: true, cumple: yHoy <= umbralY, yHoy, pendiente: modelo.pendiente, ruido: true,
      texto: yHoy <= umbralY
        ? "Por debajo del objetivo, estable: la variación cabe dentro del ruido"
        : "Por encima del objetivo y sin tendencia clara: la variación cabe dentro del ruido",
    };
  }

  const bajando = modelo.pendiente < 0;
  const porUnidad = Math.abs(modelo.pendiente);

  // Ya está por debajo del objetivo: no hay cruce que anunciar.
  if (yHoy <= umbralY) {
    // Cumplir hoy y estar subiendo no es la misma noticia que cumplir y seguir
    // bajando. Callarlo dejaba al supervisor enterándose el día que se pasa.
    let texto = "Por debajo del objetivo";
    if (bajando) texto = "Por debajo del objetivo y sigue bajando";
    else if (modelo.pendiente > 0) texto = "Por debajo del objetivo, pero subiendo";
    return { hay: true, cumple: true, yHoy, pendiente: modelo.pendiente, texto };
  }

  if (!bajando || porUnidad === 0) {
    return {
      hay: true, cumple: false, yHoy, pendiente: modelo.pendiente,
      texto: modelo.pendiente > 0
        ? "Por encima del objetivo y subiendo"
        : "Por encima del objetivo, sin mejora",
    };
  }

  const faltan = (yHoy - umbralY) / porUnidad;
  return {
    hay: true, cumple: false, yHoy, pendiente: modelo.pendiente,
    cruzaEn: faltan <= horizonte ? faltan : null,
    texto: faltan <= horizonte
      ? `Bajando: alcanzaría el objetivo en ~${Math.ceil(faltan)} días`
      : "Bajando, pero muy lento para alcanzar el objetivo",
  };
}
