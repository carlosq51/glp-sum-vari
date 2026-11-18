// =========================
// lib/calibracion-stats.js
// Números de las calibraciones STAG: tiempo promedio, en qué se va el tiempo
// y cuánto pasa la laptop parada entre un carro y el siguiente.
//
// Puro (sin red ni DOM): lo usa la pestaña Admin → Calibraciones en el
// navegador y se puede probar con node. Las filas son las que devuelve
// GET /api/calibracion/estadisticas (routes/calibracion.js).
//
// De dónde sale cada número
// ─────────────────────────
// · total y por paso: lo mide stag-auto en la laptop (resumen.total_s,
//   resumen.splits). Solo cuentan las COMPLETAS: terminadas y empezadas desde
//   el paso 1 — una retomada desde el paso 6 no dice cuánto dura un carro.
// · en qué se va: stag-auto reparte cada segundo en cuatro bolsas
//   (resumen.esperas): técnico, criterios de foto, autocalibración, automático.
// · laptop parada: lo calcula esto con las horas de inicio y fin de filas
//   seguidas del mismo día. Un hueco largo (almuerzo, no había carros) no es
//   tiempo muerto de la calibración: se cuenta aparte.
// =========================

/** Las bolsas de stag-auto, en el orden en que se muestran. */
export const BOLSAS = [
  { k: "operario",        label: "Técnico",          det: "encender el carro, regular el reductor, responder" },
  { k: "criterios_foto",  label: "Esperando foto",   det: "que el motor cumpla los criterios de cada foto" },
  { k: "autocalibracion", label: "Autocalibración",  det: "lo que tarda AC STAG en calibrar" },
  { k: "automatico",      label: "Automático",       det: "clics y lecturas del programa" },
];

/** Hueco entre carros que ya no es "tiempo muerto" sino una pausa (almuerzo, no hay carros). */
export const PAUSA_LARGA_MIN = 45;
/** Hueco entre carros: hasta MUERTO_OK_MIN es normal (bajar el carro, subir el otro); desde MUERTO_ALTO_MIN, alguien se distrajo. */
export const MUERTO_OK_MIN = 3;
export const MUERTO_ALTO_MIN = 10;

/** 'ok' | 'medio' | 'alto' | 'pausa' para pintar un hueco. */
export function tonoHueco_(seg, pausaLargaMin = PAUSA_LARGA_MIN) {
  if (seg > pausaLargaMin * 60) return "pausa";
  if (seg >= MUERTO_ALTO_MIN * 60) return "alto";
  if (seg > MUERTO_OK_MIN * 60) return "medio";
  return "ok";
}

const ms_ = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : null; };
const prom_ = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function mediana_(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Día de Perú (YYYY-MM-DD) de una fecha ISO. */
export function diaPe_(iso) {
  const t = ms_(iso);
  if (t == null) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(t));
}

/** "JETOUR X70 FL.set" de "SUM\\JETOUR\\JETOUR X70 FL.set". */
export const mapaCorto_ = (m) => String(m || "").split(/[\\/]/).pop() || "—";

/** Una calibración cuenta para el promedio si terminó y empezó desde el paso 1. */
export const esCompleta_ = (f) =>
  f.estado === "TERMINADA" && Number(f.total_s) > 0 && (f.desde == null || Number(f.desde) === 1);

/**
 * Duración real (s): la que midió la laptop; si no la mandó, fin − inicio.
 */
export function duracion_(f) {
  if (Number(f.total_s) > 0) return Number(f.total_s);
  const a = ms_(f.iniciada_at), b = ms_(f.terminada_at);
  return a != null && b != null && b > a ? (b - a) / 1000 : null;
}

/**
 * Todo lo de la pestaña en una pasada.
 * @param {Array} filas  de /api/calibracion/estadisticas (ordenadas o no)
 */
export function calcularStats_(filas, { pausaLargaMin = PAUSA_LARGA_MIN } = {}) {
  // Una cancelada antes de empezar no ocupó la laptop: fuera de los tiempos.
  const fs = (filas || []).filter(f => f && (f.estado !== "CANCELADA" || f.iniciada_at));
  const porEstado = { TERMINADA: 0, DETENIDA: 0, ERROR: 0, CANCELADA: 0 };
  for (const f of filas || []) porEstado[f.estado] = (porEstado[f.estado] || 0) + 1;

  const completas = fs.filter(esCompleta_);
  const totales = completas.map(f => Number(f.total_s));

  // ── En qué se va el tiempo ──
  const conBolsas = completas.filter(f => f.esperas && typeof f.esperas === "object");
  const bolsas = BOLSAS.map(b => ({
    ...b, prom: prom_(conBolsas.map(f => Number(f.esperas[b.k]) || 0)),
  }));

  // ── Por paso ──
  const pasosMap = new Map();
  for (const f of completas) {
    for (const s of f.splits || []) {
      if (s.estado !== "ok" || !Number.isFinite(+s.seg)) continue;
      const k = s.paso || `Paso ${(+s.i || 0) + 1}`;
      if (!pasosMap.has(k)) pasosMap.set(k, { paso: k, i: +s.i || 0, segs: [] });
      pasosMap.get(k).segs.push(+s.seg);
    }
  }
  const pasos = [...pasosMap.values()]
    .map(p => ({ paso: p.paso, i: p.i, n: p.segs.length, prom: prom_(p.segs), mejor: Math.min(...p.segs) }))
    .sort((a, b) => a.i - b.i);

  // ── Por mapa (≈ modelo) ──
  const mapasMap = new Map();
  for (const f of completas) {
    const k = mapaCorto_(f.mapa);
    if (!mapasMap.has(k)) mapasMap.set(k, []);
    mapasMap.get(k).push(Number(f.total_s));
  }
  const mapas = [...mapasMap].map(([mapa, xs]) => ({ mapa, n: xs.length, prom: prom_(xs), mejor: Math.min(...xs) }))
    .sort((a, b) => b.n - a.n);

  // ── Laptop parada: huecos entre calibraciones seguidas del mismo día ──
  const conHoras = fs.filter(f => ms_(f.iniciada_at) != null && ms_(f.terminada_at) != null)
    .sort((a, b) => ms_(a.iniciada_at) - ms_(b.iniciada_at));
  const dias = new Map();
  for (const f of conHoras) {
    const d = diaPe_(f.iniciada_at);
    if (!dias.has(d)) dias.set(d, []);
    dias.get(d).push(f);
  }
  const huecos = [];            // segundos, solo los cortos (tiempo muerto real)
  const detalle = [];           // cada hueco con qué carro terminó y cuál empezó después
  let pausas = 0, pausasS = 0;
  const porDia = [];
  for (const [dia, lista] of dias) {
    let calibrando = 0, parada = 0, nHuecos = 0;
    const huecosDia = [];
    for (let i = 0; i < lista.length; i++) {
      const ini = ms_(lista[i].iniciada_at), fin = ms_(lista[i].terminada_at);
      calibrando += Math.max(0, fin - ini) / 1000;
      if (i === 0) continue;
      const hueco = (ini - ms_(lista[i - 1].terminada_at)) / 1000;
      if (hueco <= 0) continue;
      const larga = hueco > pausaLargaMin * 60;
      if (!larga) { huecos.push(hueco); parada += hueco; nHuecos++; }
      else { pausas++; pausasS += hueco; }
      const antes = lista[i - 1], despues = lista[i];
      const h = {
        dia, seg: hueco, larga, tono: tonoHueco_(hueco, pausaLargaMin),
        desde: antes.terminada_at, hasta: despues.iniciada_at,
        antes: { vin: antes.vin, estado: antes.estado },
        despues: { vin: despues.vin, estado: despues.estado, origen: despues.origen || null,
                   // Pedida desde la app: quién y a qué hora la pidió (la laptop arranca segundos después).
                   por: despues.origen ? null : despues.solicitado_por || null,
                   nombre: despues.origen ? null : despues.solicitado_nombre || null,
                   pedida: despues.origen ? null : despues.created_at || null },
      };
      huecosDia.push(h);
      detalle.push(h);
    }
    const comp = lista.filter(esCompleta_).map(f => Number(f.total_s));
    porDia.push({
      dia, n: lista.length, completas: comp.length, prom: prom_(comp),
      calibrando_s: calibrando, parada_s: parada, huecos: nHuecos,
      huecosAltos: huecosDia.filter(h => h.tono === "alto").length,
      detalle: huecosDia,
      // Para la línea de tiempo del día: cada calibración como bloque.
      bloques: lista.map(f => ({ ini: f.iniciada_at, fin: f.terminada_at, estado: f.estado, vin: f.vin })),
      primera: lista[0].iniciada_at, ultima: lista[lista.length - 1].terminada_at,
      // Del tiempo en que hubo carros (sin las pausas largas), ¿qué parte calibró?
      uso: calibrando + parada > 0 ? calibrando / (calibrando + parada) : null,
    });
  }
  porDia.sort((a, b) => a.dia.localeCompare(b.dia));

  // ── Desde que el inspector la pide hasta que la laptop arranca (solo pedidas desde la app) ──
  const esperasInicio = fs
    .filter(f => !f.origen && ms_(f.created_at) != null && ms_(f.iniciada_at) != null)
    .map(f => (ms_(f.iniciada_at) - ms_(f.created_at)) / 1000)
    .filter(s => s >= 0 && s < 30 * 60);

  return {
    n: (filas || []).length,
    porEstado,
    completas: completas.length,
    promedio: prom_(totales),
    mediana: mediana_(totales),
    mejor: totales.length ? Math.min(...totales) : null,
    peor: totales.length ? Math.max(...totales) : null,
    bolsas, conBolsas: conBolsas.length,
    pasos, mapas, porDia,
    muerto: {
      prom: prom_(huecos), total: huecos.reduce((a, b) => a + b, 0), n: huecos.length,
      pausas, pausasS, pausaLargaMin,
      mediana: mediana_(huecos), peor: huecos.length ? Math.max(...huecos) : null,
      altos: huecos.filter(x => x >= MUERTO_ALTO_MIN * 60).length,
      altosS: huecos.filter(x => x >= MUERTO_ALTO_MIN * 60).reduce((a, b) => a + b, 0),
      detalle,
    },
    esperaInicio: { prom: prom_(esperasInicio), n: esperasInicio.length },
  };
}

/** 754 → "12:34"; 3725 → "1:02:05". */
export function fmtSeg_(s) {
  if (s == null || !Number.isFinite(+s)) return "—";
  const t = Math.round(+s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}
