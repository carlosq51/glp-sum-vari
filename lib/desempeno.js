// =========================
// lib/desempeno.js
// Comparar técnicos entre sí sin que el reparto del trabajo decida el resultado.
//
// POR QUÉ NO SIRVE LA MEDIANA A SECAS
// ───────────────────────────────────
// Ordenar a los técnicos por "su mediana de horas" mide, sobre todo, QUÉ CARROS
// LE TOCARON. Un tanquero y un motorista no hacen el mismo trabajo; un modelo
// nuevo tarda más que uno que el taller lleva dos años armando. Quien recibió
// más carros difíciles sale peor sin haber trabajado peor, y eso no es una
// medición: es el reparto del despacho con otro nombre.
//
// QUÉ SE HACE EN SU LUGAR: COMPARAR DENTRO DE LA MISMA CELDA
// Cada carro se compara SOLO contra los carros del mismo modelo y el mismo
// puesto hechos por OTRA gente, y lo que se guarda es la razón:
//
//     razón = tiempo del carro ÷ mediana de ese mismo trabajo en los demás
//
// 1,00 es "igual que el resto en ese trabajo"; 0,85 es "un 15% más rápido";
// 1,30 es "un 30% más lento". Como cada carro ya viene medido contra su propio
// listón, las razones de modelos distintos SÍ se pueden juntar, y el índice del
// técnico es la mediana de las suyas. El mix deja de decidir.
//
// Es una comparación pareada, la misma idea que en un ensayo clínico se
// empareja por edad y sexo antes de comparar tratamientos.
//
// Y NO SE AFIRMA NADA SIN CONTRASTARLO
// Ocho carros dan un índice, siempre. Mann–Whitney contrasta si las razones de
// este técnico están de verdad desplazadas frente a las de los demás o si la
// diferencia cabe en el azar — es el hermano de Mann–Kendall (ver
// lib/regresion.js): no paramétrico, solo mira ORDEN, así que un carro de 947 h
// que nadie cerró cuenta como un carro lento y no como cuarenta.
//
// Además el índice se ENCOGE hacia 1 según cuántos carros lo sostienen: con
// tres carros, "el más rápido del taller" es casi siempre suerte, y el ranking
// no debe premiarla.
//
// Puro y sin red: se calcula sobre datos ya leídos.
// =========================

import { mediana_ } from "./regresion.js";

/** Φ(z): normal estándar acumulada (A&S 7.1.26), igual que en regresion.js. */
function phi_(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  const erf = z < 0 ? -y : y;
  return 0.5 * (1 + erf);
}

// Tope para contar el reparto exacto de U. El coste es n·m·(n·m/2) celdas de
// tabla; por encima de esto la normal ya es buena aproximación de todas formas.
const MAX_PRODUCTO_EXACTO = 400;

/**
 * repartoU_ — cuántas de las combinaciones posibles dan cada valor de U.
 *
 * Recursión clásica: el mayor de los N valores pertenece a un grupo o al otro.
 * Se cuenta, no se enumera.
 */
function repartoU_(n, m) {
  // tabla[i][j][u] = combinaciones de i elementos de un grupo y j del otro que
  // dan ese U. Con 0 de un lado solo hay una combinación y U vale 0.
  const tabla = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => null));
  for (let i = 0; i <= n; i++) tabla[i][0] = [1];
  for (let j = 0; j <= m; j++) tabla[0][j] = [1];

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const a = tabla[i - 1][j];   // el mayor viene del grupo 1: aporta j a U
      const b = tabla[i][j - 1];   // el mayor viene del grupo 2: no aporta
      const largo = i * j + 1;
      const out = new Array(largo).fill(0);
      for (let u = 0; u < a.length; u++) if (u + j < largo) out[u + j] += a[u];
      for (let u = 0; u < b.length; u++) out[u] += b[u];
      tabla[i][j] = out;
    }
  }
  return tabla[n][m];
}

/**
 * rangos_ — rangos de 1..N con empates promediados.
 * @returns {{rangos:number[], ajusteEmpates:number}}
 */
function rangos_(valores) {
  const idx = valores.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array(valores.length);
  let ajuste = 0;
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1].v === idx[k].v) j++;
    const promedio = (k + j) / 2 + 1;            // rangos base 1
    const t = j - k + 1;
    if (t > 1) ajuste += t * t * t - t;
    for (let q = k; q <= j; q++) r[idx[q].i] = promedio;
    k = j + 1;
  }
  return { rangos: r, ajusteEmpates: ajuste };
}

/**
 * mannWhitney_ — ¿estas dos muestras salen de la misma distribución?
 *
 * Es la prueba que corresponde aquí y no la t de Student: los tiempos de taller
 * no son normales (tienen una cola larguísima de OTs sin cerrar) y la t
 * compara MEDIAS, que es justo el estadístico que esa cola destroza. Mann–
 * Whitney solo usa el orden.
 *
 * Con muestras pequeñas y sin empates usa el reparto exacto; si no, la
 * aproximación normal con corrección por empates y por continuidad.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {{ok:boolean, U:number, p:number, significativa:boolean, exacto:boolean, n:number, m:number}}
 */
export function mannWhitney_(a, b, alfa = 0.05) {
  const x = (a || []).filter(Number.isFinite);
  const y = (b || []).filter(Number.isFinite);
  const n = x.length, m = y.length;
  const nulo = { ok: false, U: NaN, p: 1, significativa: false, exacto: false, n, m };
  // Con menos de 3 contra 3 ni el reparto exacto puede bajar de 0,05: el p más
  // pequeño posible es 0,1. Decir "no se sabe" es lo honesto.
  if (n < 3 || m < 3) return nulo;

  const { rangos, ajusteEmpates } = rangos_([...x, ...y]);
  const sumaX = rangos.slice(0, n).reduce((s, r) => s + r, 0);
  const U1 = sumaX - (n * (n + 1)) / 2;
  const U2 = n * m - U1;
  const U = Math.min(U1, U2);

  const cerrar = (p, exacto) => ({
    ok: true, U: U1, p, significativa: p < alfa, exacto, n, m,
  });

  if (ajusteEmpates === 0 && n * m <= MAX_PRODUCTO_EXACTO) {
    const dp = repartoU_(n, m);
    const total = dp.reduce((s, v) => s + v, 0);
    let cola = 0;
    for (let u = 0; u <= Math.floor(U) && u < dp.length; u++) cola += dp[u];
    return cerrar(Math.min(1, (2 * cola) / total), true);
  }

  const N = n + m;
  const mu = (n * m) / 2;
  // Varianza con corrección por empates: sin ella, muchas razones idénticas
  // inflarían la dispersión esperada y el test se volvería incapaz de ver nada.
  const varU = (n * m / 12) * ((N + 1) - ajusteEmpates / (N * (N - 1)));
  if (varU <= 0) return nulo;

  const z = (Math.abs(U1 - mu) - 0.5) / Math.sqrt(varU);
  return cerrar(Math.min(1, 2 * (1 - phi_(z))), false);
}

/** Clave de celda comparable: mismo puesto y mismo modelo. */
export const celdaDe_ = (rol, modelo) =>
  `${String(rol || "?").toUpperCase()}|${String(modelo || "?").trim().toUpperCase()}`;

/**
 * comparativaTecnicos_ — cada técnico frente al resto, a igualdad de trabajo.
 *
 * @param {Array<{tecnico:string, celda:string, y:number}>} carros
 *   `y` en las unidades que sean (horas); `celda` de celdaDe_.
 * @param {object} [opts]
 * @param {number} [opts.minPares=4]   carros de OTROS que hacen falta en la
 *   celda para que un carro sea comparable. Con menos, el listón sería una
 *   persona y no "el resto".
 * @param {number} [opts.minCarros=5]  carros comparables para entrar al cuadro.
 * @param {number} [opts.k=5]          fuerza del encogimiento hacia 1.
 * @returns {{
 *   filas:Array<{tecnico,n,indice,indiceAjustado,mediana,medianaPares,p,significativo,mejor,celdas}>,
 *   pocos:Array<{tecnico,n}>, sinComparar:number, celdasUsadas:number, total:number
 * }}
 */
export function comparativaTecnicos_(carros, opts = {}) {
  const { minPares = 4, minCarros = 5, k = 5, alfa = 0.05 } = opts;

  const limpios = (carros || []).filter(c =>
    Number.isFinite(c?.y) && c.y > 0 && String(c?.tecnico || "").trim() && c?.celda);

  // Carros por celda, para poder sacar el listón "de los demás".
  const porCelda = new Map();
  for (const c of limpios) {
    if (!porCelda.has(c.celda)) porCelda.set(c.celda, []);
    porCelda.get(c.celda).push(c);
  }

  // Razón de cada carro contra la mediana de SUS PARES: mismo modelo, mismo
  // puesto, otra persona. Dejar fuera al propio técnico no es un detalle — si
  // hace la mitad de los carros de ese modelo, se estaría comparando consigo
  // mismo y su índice tendería a 1 por construcción.
  const razones = [];      // { tecnico, r, celda }
  let sinComparar = 0;
  const celdasUsadas = new Set();

  for (const [celda, grupo] of porCelda) {
    // El listón no depende del carro, solo de quién lo hizo: es el mismo para
    // todos los carros de una persona en esa celda. Calcularlo una vez por
    // técnico en lugar de una por carro deja esto lineal en vez de cuadrático,
    // que importa cuando el reporte trae meses enteros.
    const porTec = new Map();
    for (const c of grupo) {
      if (!porTec.has(c.tecnico)) porTec.set(c.tecnico, []);
      porTec.get(c.tecnico).push(c.y);
    }

    for (const [tecnico, mios] of porTec) {
      const pares = grupo.filter(o => o.tecnico !== tecnico).map(o => o.y);
      if (pares.length < minPares) { sinComparar += mios.length; continue; }
      const base = mediana_(pares);
      if (!Number.isFinite(base) || base <= 0) { sinComparar += mios.length; continue; }
      for (const y of mios) razones.push({ tecnico, r: y / base, celda });
      celdasUsadas.add(celda);
    }
  }

  const porTecnico = new Map();
  for (const x of razones) {
    if (!porTecnico.has(x.tecnico)) porTecnico.set(x.tecnico, []);
    porTecnico.get(x.tecnico).push(x);
  }

  const filas = [], pocos = [];
  for (const [tecnico, suyas] of porTecnico) {
    if (suyas.length < minCarros) { pocos.push({ tecnico, n: suyas.length }); continue; }

    const mias = suyas.map(x => x.r);
    const otras = razones.filter(x => x.tecnico !== tecnico).map(x => x.r);
    const indice = mediana_(mias);

    // Encogimiento hacia 1: la señal se cree en proporción a lo que la
    // sostiene. Con 5 carros y k=5 se conserva la mitad de la desviación; con
    // 45, el 90%. Nadie encabeza el cuadro por haber tenido una buena semana.
    const indiceAjustado = 1 + (indice - 1) * (suyas.length / (suyas.length + k));

    const mw = mannWhitney_(mias, otras, alfa);
    filas.push({
      tecnico,
      n: suyas.length,
      indice,
      indiceAjustado,
      mediana: mediana_(mias),
      p: mw.ok ? mw.p : null,
      exacto: mw.exacto,
      significativo: mw.ok && mw.significativa,
      mejor: indice < 1,
      celdas: new Set(suyas.map(x => x.celda)).size,
    });
  }

  // Del más rápido al más lento por el índice ENCOGIDO, que es el que se puede
  // defender delante de la persona.
  filas.sort((a, b) => a.indiceAjustado - b.indiceAjustado);
  pocos.sort((a, b) => b.n - a.n);

  return {
    filas, pocos, sinComparar,
    celdasUsadas: celdasUsadas.size,
    total: limpios.length,
    comparables: razones.length,
  };
}
