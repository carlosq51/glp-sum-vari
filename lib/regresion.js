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
 */
export function lecturaTendencia_(modelo, umbralY, xActual, horizonte = 30) {
  if (!modelo?.ok) return { hay: false, texto: "Faltan datos para una tendencia" };

  const yHoy = modelo.intercepto + modelo.pendiente * xActual;
  const bajando = modelo.pendiente < 0;
  const porUnidad = Math.abs(modelo.pendiente);

  // Ya está por debajo del objetivo: no hay cruce que anunciar.
  if (yHoy <= umbralY) {
    return {
      hay: true, cumple: true, yHoy, pendiente: modelo.pendiente,
      texto: bajando
        ? "Por debajo del objetivo y sigue bajando"
        : "Por debajo del objetivo",
    };
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
