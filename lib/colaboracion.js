// =========================
// lib/colaboracion.js
// Cuándo puede alguien tocar la OT de OTRO, y qué rastro deja.
//
// La regla por defecto del sistema es "cada OT tiene un dueño y solo él la
// mueve" (el 409 ALREADY_ASSIGNED de routes/trabajo.js). Eso es correcto para
// el caso normal y hay que conservarlo: sin dueño, dos técnicos se pisan el
// mismo carro y el tiempo trabajado deja de significar nada.
//
// Pero hay dos casos donde esa regla estorbaba y el taller lo resolvía por
// fuera del sistema:
//
//   · El AYUDANTE del carro extra. El propio motor lo mandó a ese carro, está
//     trabajando en él, y no podía cerrarlo: tenía que buscar al ancla para que
//     lo hiciera. Si el ancla ya se fue, el carro se quedaba abierto.
//   · CALIDAD. Son dos inspectores sobre los mismos carros. Que Flores registre
//     uno y Wilmer no pueda ni verlo obliga a esperar a Flores para algo que
//     cualquiera de los dos puede terminar.
//
// En los dos casos el CRÉDITO no se mueve: la OT sigue siendo de quien la
// registró. Lo que se abre es quién puede accionarla, no de quién es.
//
// Todo aquí es puro y sin red: se decide con datos ya leídos.
// =========================

const TZ_PERU = "America/Lima";

/**
 * ¿Puede este usuario accionar una OT que no es suya?
 *
 * @param {object}  o
 * @param {string}  o.tipoOt          CONVERSION | CALIDAD | RAMALERO
 * @param {string}  o.estadoTitular   estado_actual de la asignación del dueño
 * @param {boolean} o.esApoyo         quien pide es el ayudante de ese puesto
 * @returns {{ permitido: boolean, motivo: string }}
 */
export function puedeColaborar_({ tipoOt, estadoTitular, esApoyo = false } = {}) {
  // El ayudante lo puso ahí el propio motor: negarle el cierre es negar el
  // trabajo que el sistema le mandó hacer. No se le exige nada más.
  if (esApoyo) return { permitido: true, motivo: "APOYO" };

  if (String(tipoOt || "").toUpperCase() === "CALIDAD") {
    // Solo si el titular YA EMPEZÓ. Una OT que su dueño ni ha tocado no es
    // trabajo compartido: es trabajo que todavía no existe, y dejar que otro
    // la cierre sería cerrar una inspección que nadie hizo.
    const est = String(estadoTitular || "").toUpperCase();
    if (est && est !== "SIN_INICIAR") return { permitido: true, motivo: "CALIDAD_COLABORATIVA" };
    return { permitido: false, motivo: "CALIDAD_SIN_INICIAR" };
  }

  return { permitido: false, motivo: "SIN_PERMISO" };
}

/** "HH:MM" en hora de Perú, o "" si la fecha no sirve. */
export function horaPeru_(iso) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return "";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TZ_PERU, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(t));
}

/**
 * notaApoyo_ — el rastro que queda en el reporte cuando dos trabajaron el carro.
 *
 * Se arma sola con lo que el sistema ya sabe (quién apoyó a quién y desde
 * cuándo) en vez de pedírsela a quien cierra: una nota que hay que escribir se
 * olvida, se escribe distinta cada vez y no sirve para sumar horas después.
 *
 * Sin hora de inicio no se inventa un texto a medias: se devuelve "" y el
 * cierre sigue su curso sin nota. Una nota que dice "desde las  hasta las 19:00"
 * es peor que ninguna.
 *
 * @param {object} o
 * @param {string} o.companero  nombre de la otra persona
 * @param {string} o.desdeIso   cuándo empezaron a compartir el carro
 * @param {string} [o.hastaIso] cuándo terminaron (por defecto, ahora)
 * @returns {string}
 */
export function notaApoyo_({ companero, desdeIso, hastaIso } = {}) {
  const quien = String(companero || "").trim();
  const desde = horaPeru_(desdeIso);
  if (!quien || !desde) return "";
  const hasta = horaPeru_(hastaIso || new Date().toISOString());
  return hasta
    ? `Trabajó con ${quien} desde las ${desde} hasta las ${hasta}`
    : `Trabajó con ${quien} desde las ${desde}`;
}

/**
 * notaDupla_ — rastro de un carro hecho en DUPLA DE TRABAJO.
 *
 * Distinta de notaApoyo_ a propósito, aunque el texto se parezca: no son lo
 * mismo y el reporte no debe confundirlas.
 *
 *   · APOYO (carro extra): el carro es del ancla y el ayudante entra a echar
 *     una mano. El crédito es de uno solo.
 *   · DUPLA de trabajo: los dos se emparejaron para trabajar juntos toda la
 *     jornada y el crédito se reparte por alternancia.
 *
 * Leer "trabajó con X" en los dos casos borraría esa diferencia justo en la
 * pantalla donde se mide a la gente.
 */
export function notaDupla_({ companero, desdeIso, hastaIso } = {}) {
  const quien = String(companero || "").trim();
  const desde = horaPeru_(desdeIso);
  if (!quien) return "";
  if (!desde) return `Trabajo en dupla con ${quien}`;
  const hasta = horaPeru_(hastaIso || new Date().toISOString());
  return hasta
    ? `Trabajo en dupla con ${quien} desde las ${desde} hasta las ${hasta}`
    : `Trabajo en dupla con ${quien} desde las ${desde}`;
}

/**
 * notaCierreAjeno_ — rastro de quién cerró una OT que no era suya.
 *
 * Para CALIDAD: el reporte tiene que poder decir "registró Flores, cerró
 * Wilmer". Sin esto, el cierre colaborativo borra la diferencia entre los dos
 * y nadie puede reconstruir quién hizo qué.
 */
export function notaCierreAjeno_({ cerradoPor } = {}) {
  const quien = String(cerradoPor || "").trim();
  return quien ? `Cerrada por ${quien}` : "";
}

/**
 * combinarNotas_ — junta notas sin repetir ni dejar separadores sueltos.
 * El técnico puede haber escrito la suya; la del sistema se añade, no la pisa.
 */
export function combinarNotas_(...notas) {
  const vistas = new Set();
  const out = [];
  for (const n of notas) {
    const t = String(n || "").trim();
    if (!t || vistas.has(t)) continue;
    vistas.add(t);
    out.push(t);
  }
  return out.join(" · ");
}
