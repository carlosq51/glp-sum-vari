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
 * medianaPonderada_ — mediana donde cada valor pesa distinto.
 *
 * POR QUÉ HACE FALTA
 * Al agrupar el taller por jornadas, no todas las jornadas valen lo mismo: la
 * mediana de un día de 40 carros se conoce mucho mejor que la de un día de 3.
 * La salida anterior era binaria —el día vota o no vota— y con los filtros
 * finos (un modelo concreto, un puesto) NINGÚN día llegaba al mínimo y la
 * tendencia simplemente no existía. Pesar en vez de excluir usa todo lo que
 * hay y le da a cada punto la voz que su tamaño justifica.
 *
 * Con todos los pesos iguales devuelve exactamente la mediana de siempre,
 * promedio de los dos centrales incluido.
 *
 * @param {Array<{v:number,w:number}>} items
 */
export function medianaPonderada_(items) {
  const xs = (items || [])
    .filter(d => Number.isFinite(d?.v) && Number.isFinite(d?.w) && d.w > 0)
    .sort((a, b) => a.v - b.v);
  if (!xs.length) return NaN;

  const total = xs.reduce((s, d) => s + d.w, 0);
  const mitad = total / 2;
  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    acc += xs[i].w;
    if (acc > mitad) return xs[i].v;
    // Cae justo en el corte: hay tanto peso a un lado como al otro, y el valor
    // honesto es el punto medio entre los dos vecinos (como la mediana de un
    // array de longitud par). El siguiente elemento existe porque acc < total.
    if (acc === mitad) return (xs[i].v + xs[i + 1].v) / 2;
  }
  return xs[xs.length - 1].v;
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

// Por debajo de 4 jornadas no hay test que valga: ni siquiera el reparto
// exacto puede separar una bajada real del azar, así que se dice que no se sabe.
const MIN_N_MK = 4;

// Hasta aquí se cuenta el reparto EXACTO de S. El coste es n! repartido en un
// polinomio de n(n-1)/2 grados; con 12 son 479 millones de permutaciones
// contadas como número, no enumeradas, y entra de sobra en un double.
const MAX_N_EXACTO = 12;

/**
 * repartoInversiones_ — cuántas permutaciones de n elementos tienen k
 * inversiones, para todo k. Es el producto (1)(1+q)(1+q+q²)…, que se arma
 * multiplicando polinomios: el mismo conteo que hay detrás de la tabla exacta
 * de Kendall, sin la tabla.
 */
function repartoInversiones_(n) {
  let poly = [1];
  for (let i = 2; i <= n; i++) {
    const out = new Array(poly.length + i - 1).fill(0);
    for (let k = 0; k < poly.length; k++) {
      for (let d = 0; d < i; d++) out[k + d] += poly[k];
    }
    poly = out;
  }
  return poly;
}

/**
 * pExacta_ — p bilateral exacto de S para series cortas SIN empates.
 *
 * La aproximación normal necesita ~8 puntos para no mentir, y con los filtros
 * finos del taller (un modelo, un puesto) casi nunca hay ocho jornadas. Aquí no
 * se aproxima nada: se cuenta qué fracción de todas las ordenaciones posibles
 * daría un S al menos tan extremo como el observado.
 */
function pExacta_(n, S) {
  const poly = repartoInversiones_(n);
  const total = poly.reduce((a, b) => a + b, 0);
  const C = (n * (n - 1)) / 2;
  // S = C - 2·(inversiones), así que "S al menos tan grande" es "no más de
  // este número de inversiones".
  const kMax = Math.floor((C - Math.abs(S)) / 2);
  let cola = 0;
  for (let k = 0; k <= kMax && k < poly.length; k++) cola += poly[k];
  return Math.min(1, (2 * cola) / total);
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
 * DOS CAMINOS SEGÚN EL TAMAÑO
 * Con pocos puntos y sin empates se usa el reparto exacto; con muchos, o
 * cuando hay empates (que el reparto exacto no sabe tratar), la aproximación
 * normal de siempre con su corrección de continuidad. Antes había un corte
 * seco en 8 que dejaba mudos justo a los filtros más específicos.
 *
 * @param {number[]} ys serie en orden temporal
 * @returns {{ok:boolean, S:number, z:number, p:number, significativa:boolean, sentido:-1|0|1, exacto:boolean}}
 */
export function mannKendall_(ys, alfa = 0.05) {
  const y = (ys || []).filter(n => Number.isFinite(n));
  const n = y.length;
  const nulo = { ok: false, S: 0, z: 0, p: 1, significativa: false, sentido: 0, n, exacto: false };
  if (n < MIN_N_MK) return nulo;

  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  }

  const cuentas = new Map();
  for (const v of y) cuentas.set(v, (cuentas.get(v) || 0) + 1);
  const hayEmpates = cuentas.size < n;

  const cerrar = (p, z, exacto) => {
    const significativa = p < alfa;
    return { ok: true, S, z, p, significativa, sentido: significativa ? Math.sign(S) : 0, n, exacto };
  };

  if (!hayEmpates && n <= MAX_N_EXACTO) return cerrar(pExacta_(n, S), 0, true);

  // Aproximación normal. Por debajo de 8 puntos no vale, y con empates no hay
  // reparto exacto al que caer: ahí es más honesto no decir nada.
  if (n < 8) return nulo;

  // Corrección por empates: días con la misma mediana no aportan información
  // de orden, y sin descontarlos la varianza saldría inflada.
  let ajuste = 0;
  for (const t of cuentas.values()) if (t > 1) ajuste += t * (t - 1) * (2 * t + 5);

  const varS = (n * (n - 1) * (2 * n + 5) - ajuste) / 18;
  if (varS <= 0) return { ...nulo, S };

  // Corrección de continuidad: S es discreto y lo estamos midiendo contra una
  // normal continua. Sin el -1 el test es optimista con series cortas.
  const z = (S - Math.sign(S)) / Math.sqrt(varS);
  return cerrar(2 * (1 - phi_(Math.abs(z))), z, false);
}

/**
 * Regresión robusta de Theil–Sen, con peso opcional por punto.
 *
 * @param {Array<{x:number,y:number,w?:number}>} puntos
 *   `w` es cuánto vale ese punto como medida. Al regresar sobre medianas de
 *   jornada, un día de 40 carros conoce su mediana mucho mejor que uno de 3, y
 *   la precisión de una mediana crece con la raíz del tamaño: quien llama pasa
 *   ese peso ya calculado. Sin `w` todos valen 1 y sale el Theil–Sen clásico.
 * @returns {{ pendiente:number, intercepto:number, n:number, ok:boolean }}
 *
 * `ok:false` cuando no hay con qué: menos de dos puntos, o todos en la misma
 * x (una sola jornada) — ahí no hay tendencia que medir y dibujar una recta
 * sería inventarla.
 */
export function theilSen_(puntos) {
  const p = (puntos || []).filter(d => Number.isFinite(d?.x) && Number.isFinite(d?.y));
  if (p.length < 2) return { pendiente: 0, intercepto: NaN, n: p.length, ok: false };

  const peso_ = (d) => (Number.isFinite(d?.w) && d.w > 0 ? d.w : 1);

  const pendientes = [];
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = i + 1; j < p.length; j++) {
      const dx = p[j].x - p[i].x;
      // Dos medidas del mismo día no dicen nada sobre la tendencia: su
      // pendiente sería infinita. Se saltan, no se fuerzan a cero.
      if (dx === 0) continue;
      // El par no es más fiable que su miembro más flojo: una pendiente entre
      // un día de 40 carros y uno de 2 vale lo que vale el de 2.
      pendientes.push({ v: (p[j].y - p[i].y) / dx, w: Math.min(peso_(p[i]), peso_(p[j])) });
    }
  }
  if (!pendientes.length) return { pendiente: 0, intercepto: NaN, n: p.length, ok: false };

  const pendiente = medianaPonderada_(pendientes);
  // El intercepto también por mediana, por el mismo motivo que la pendiente:
  // usar la media aquí devolvería por la ventana el peso de los outliers que
  // acabamos de quitar por la puerta.
  const intercepto = medianaPonderada_(p.map(d => ({ v: d.y - pendiente * d.x, w: peso_(d) })));
  return { pendiente, intercepto, n: p.length, ok: Number.isFinite(intercepto) };
}

// ─── Ventana adaptativa ──────────────────────────────────────────────────────
//
// La unidad natural de la serie es la jornada, y con el taller entero (30–93
// carros al día) funciona. Pero al filtrar por modelo Y puesto ese volumen se
// reparte, y un modelo de dos carros al día no tiene NINGUNA jornada con cinco:
// con un umbral fijo por día, todos sus días quedaban fuera y no había recta —
// solo el combo con volumen la dibujaba.
//
// El arreglo no es un modelo más flexible: una polinómica o un SVR necesitan
// MÁS puntos que la recta, no menos, y devuelven una pendiente que no se puede
// decir en voz alta ni extrapolar sin inventar. El arreglo es agrupar más
// grueso cuando hay menos carros, y pesar cada grupo por lo bien que se conoce
// su mediana en vez de vetarlo.

/** Escalones de agrupación, del más fino al más grueso, en días. */
export const VENTANAS_DIAS = [1, 3, 7, 14];

/** Menos puntos que esto no son una serie: son cuatro números y una corazonada. */
export const MIN_PUNTOS_TENDENCIA = 5;

/** Medidas por punto a las que se aspira al elegir la ventana. */
export const CARROS_OBJETIVO_POR_PUNTO = 5;

/**
 * agruparEnVentanas_ — la serie sobre la que se ajusta la recta.
 *
 * No sustituye a la mediana diaria que se dibuja: esa se sigue viendo tal cual,
 * porque es lo que el supervisor reconoce. Esto es solo el material del ajuste,
 * agrupado con el paso que el volumen permita.
 *
 * La x del grupo es la MEDIANA de las x de sus carros, no el centro nominal de
 * la ventana: el último grupo casi siempre está a medias y ponerlo en su centro
 * teórico lo empujaría hacia un futuro que aún no ha pasado.
 *
 * @param {Array<{x:number,y:number}>} pts carros con x en días desde el origen
 * @param {number} ancho tamaño de la ventana en días
 * @returns {Array<{x:number, mediana:number, n:number, desde:number, hasta:number}>}
 */
export function agruparEnVentanas_(pts, ancho) {
  const cubos = new Map();
  for (const p of pts) {
    const k = Math.floor(p.x / ancho);
    if (!cubos.has(k)) cubos.set(k, []);
    cubos.get(k).push(p);
  }
  return [...cubos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, grupo]) => ({
      x: mediana_(grupo.map(g => g.x)),
      mediana: mediana_(grupo.map(g => g.y)),
      n: grupo.length,
      desde: k * ancho,
      hasta: (k + 1) * ancho - 1,
    }))
    .filter(c => Number.isFinite(c.mediana));
}

/**
 * elegirVentana_ — el paso más FINO que los datos aguanten.
 *
 * Se prefiere el detalle: si con jornadas hay serie suficiente y jornadas
 * suficientemente pobladas, se usan jornadas. Solo cuando no las hay se sube
 * de escalón, y si ni la quincena reúne el tamaño deseado se coge la ventana
 * más gruesa que aún deje una serie — mejor una tendencia semanal medida que
 * ninguna tendencia.
 */
export function elegirVentana_(pts) {
  const opciones = VENTANAS_DIAS.map(ancho => ({ ancho, cubos: agruparEnVentanas_(pts, ancho) }));

  const buena = opciones.find(o =>
    o.cubos.length >= MIN_PUNTOS_TENDENCIA &&
    mediana_(o.cubos.map(c => c.n)) >= CARROS_OBJETIVO_POR_PUNTO);
  if (buena) return buena;

  // Nadie llega al tamaño deseado: se recorre al revés y gana la ventana más
  // gruesa (más carros por punto) que todavía deje serie que mirar.
  const posible = [...opciones].reverse().find(o => o.cubos.length >= MIN_PUNTOS_TENDENCIA);
  return posible || opciones[0];
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

  // Se pidió el contraste y no se pudo hacer (muy pocas jornadas). Anunciar
  // "bajando" aquí sería peor que callarse: la recta existe siempre, incluso
  // sobre tres puntos que no dicen nada. La posición contra el objetivo sí es
  // un hecho y se dice.
  if (mk && !mk.ok) {
    return {
      hay: true, cumple: yHoy <= umbralY, yHoy, pendiente: modelo.pendiente, insuficiente: true,
      texto: yHoy <= umbralY
        ? "Por debajo del objetivo; muy pocas jornadas para hablar de tendencia"
        : "Por encima del objetivo; muy pocas jornadas para hablar de tendencia",
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
