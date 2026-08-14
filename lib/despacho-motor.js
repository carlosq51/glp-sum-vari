// =========================
// lib/despacho-motor.js
// Fase 3 — el motor de despacho: qué carro le toca a quién.
//
// Todo aquí es PURO: recibe datos, devuelve propuestas. Sin red, sin BD, sin
// reloj. Es lo que permite probar el criterio de reparto sin taller y sin
// Supabase, y lo que hace que el modo sombra sea auditable.
//
// El motor asigna por UNIDAD DE TRABAJO (ver lib/despacho.js): un técnico solo
// o una dupla del mismo rol. Una unidad ocupa un puesto de carro a la vez.
// =========================

import { proximoResponsable_ } from "./despacho.js";

// ─── LAYOUT FÍSICO ────────────────────────────────────────────────────────────
// Mismo orden que la pantalla: dos filas, ascendentes desde la entrada.
export const FILA_A = [10, 11, 12, 13, 14, 15];
export const FILA_B = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Distancia entre dos zonas, medida como se camina el taller.
 *
 * El taller es una rejilla de dos filas alineadas por columna. Un puesto es
 * vecino de otro si no se aleja más de una columna, esté en la fila que esté
 * — o sea también en diagonal y de frente, cruzando el pasillo.
 *
 *          col:   0    1    2    3   ...
 *   fila A:      Z10  Z11  Z12  Z13
 *   fila B:      Z1   Z2   Z3   Z4
 *
 * Los vecinos de Z2 (fila B, col 1) son Z1, Z3 (al lado), Z11 (al frente) y
 * Z10, Z12 (en diagonal): todos a distancia 1. Es distancia de Chebyshev.
 */
export function distanciaZonas_(a, b) {
  if (!a || !b) return null;
  if (a === b) return 0;
  const pos = z => {
    let i = FILA_A.indexOf(z);
    if (i >= 0) return { fila: 0, col: i };
    i = FILA_B.indexOf(z);
    if (i >= 0) return { fila: 1, col: i };
    return null;
  };
  const pa = pos(a), pb = pos(b);
  if (!pa || !pb) return null;
  // Cruzar el pasillo no cuesta más que moverse de columna: se hace en el
  // mismo paso. Por eso es el máximo de las dos diferencias, no la suma.
  return Math.max(Math.abs(pa.fila - pb.fila), Math.abs(pa.col - pb.col));
}

// Peor caso en este layout: de la columna 0 a la 8 (Z1 ↔ Z9).
const DIST_MAX = 8;

// ─── PESOS DEL RANKING ────────────────────────────────────────────────────────
// Punto de partida declarado, NO verdad revelada. El modo sombra existe
// precisamente para corregir estos números con datos reales antes del go-live.
export const PESOS = {
  espera:         0.30,   // quién lleva más tiempo parado sin carro
  compatibilidad: 0.30,   // que MOTOR y TANQUE del carro acaben a la vez
  familiaridad:   0.25,   // qué tan rápido es ESTA persona en ESTE modelo
  cercania:       0.15,   // no cruzar el taller sin necesidad
};

/**
 * Normaliza un juego de pesos para que sume 1.
 *
 * Los pesos son configurables desde el panel, y exigirle a alguien que cuadre
 * cuatro decimales a mano es pedir que se equivoque. Aquí valen como
 * IMPORTANCIA RELATIVA: 30/30/25/15 y 6/6/5/3 dan exactamente el mismo reparto.
 * Sin esto, unos pesos que suman 0.9 inflarían todos los scores y los umbrales
 * de `razonar_` dejarían de significar lo mismo.
 */
export function normalizarPesos_(pesos = PESOS) {
  const limpio = {};
  for (const k of Object.keys(PESOS)) {
    const v = Number(pesos?.[k]);
    limpio[k] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  const suma = Object.values(limpio).reduce((a, b) => a + b, 0);
  if (suma <= 0) return { ...PESOS };            // todo en cero → defaults
  for (const k of Object.keys(limpio)) limpio[k] /= suma;
  return limpio;
}

// Espera a partir de la cual la prioridad ya está al máximo. Media hora parado
// en el taller es mucho: más allá de eso, seguir escalando no cambia nada
// porque esa unidad ya le gana a cualquiera que acabe de quedar libre.
export const ESPERA_TOPE_MIN = 30;

// ─── POOL ─────────────────────────────────────────────────────────────────────

/**
 * Qué carros se pueden asignar y, sobre todo, POR QUÉ los demás no.
 *
 * Los motivos de exclusión no son telemetría: son lo que permite responder
 * "¿por qué el motor no asignó nada?" sin reconstruir el taller a posteriori.
 *
 * Reglas confirmadas con operaciones (2026-08-07):
 *   · El ramal NO condiciona la asignación.
 *   · Una incidencia abierta NO bloquea el carro.
 *   · No hay orden entre MOTOR y TANQUE: cualquiera puede empezar.
 */
export function construirPool_({
  zonas = [],
  listaDiaria = null,          // Set<vin> — null = no filtrar por lista
  modelos = new Map(),         // vin → modelo normalizado
  ocupados = [],               // [{ vin, rol_trabajo }] asignaciones activas
} = {}) {
  const elegibles = [];
  const excluidos = {};

  const porVin = new Map();
  const terminadosPorVin = new Map();
  const ocupantePorVinRol = new Map();
  for (const o of ocupados) {
    const rol = String(o.rol_trabajo || "").toUpperCase();
    if (!porVin.has(o.vin)) porVin.set(o.vin, new Set());
    porVin.get(o.vin).add(rol);
    if (o.terminado) {
      if (!terminadosPorVin.has(o.vin)) terminadosPorVin.set(o.vin, new Set());
      terminadosPorVin.get(o.vin).add(rol);
    } else if (o.user_id) {
      // Solo los que siguen trabajando: con quien ya terminó no hay nada que
      // sincronizar, se fue del carro.
      ocupantePorVinRol.set(`${o.vin}|${rol}`, o.user_id);
    }
  }

  for (const z of zonas) {
    if (!z.vin) continue;                       // zona libre: no es exclusión
    const estado = String(z.estado || "").toUpperCase();

    if (estado === "FINALIZADO") { excluidos[z.vin] = "FINALIZADO"; continue; }
    if (listaDiaria && !listaDiaria.has(z.vin)) { excluidos[z.vin] = "NO_EN_LISTA_DIARIA"; continue; }

    const tomados = porVin.get(z.vin) || new Set();
    const rolesLibres = ["MOTOR", "TANQUE"].filter(r => !tomados.has(r));
    if (!rolesLibres.length) {
      // "Ocupado" y "terminado" se ven igual desde el reparto, pero no son lo
      // mismo al depurar: uno espera a que alguien acabe, el otro ya acabó.
      const fin = terminadosPorVin.get(z.vin) || new Set();
      excluidos[z.vin] = [...tomados].every(r => fin.has(r))
        ? "TRABAJO_COMPLETO"
        : "PUESTOS_OCUPADOS";
      continue;
    }

    // Quién está YA trabajando en el otro puesto de este carro. Es el caso más
    // común del taller — un carro al que solo le falta la delantera — y sin
    // este dato el emparejamiento por ritmo no puede hacer nada ahí: no hay
    // con quién comparar. Con él, al puesto libre va quien mejor calce con el
    // que ya está en el carro, que es de lo que se trata acabar a la vez.
    const compa = {};
    for (const r of ["MOTOR", "TANQUE"]) {
      const dueño = ocupantePorVinRol.get(`${z.vin}|${r}`);
      if (dueño) compa[r] = dueño;
    }

    elegibles.push({
      vin: z.vin,
      zona: z.zona_id,
      modelo: modelos.get(z.vin) || z.modelo || null,
      registrado_at: z.registrado_at || null,
      rolesLibres,
      ocupadoPor: compa,          // { MOTOR?: user_id, TANQUE?: user_id }
    });
  }

  // FIFO: el carro que lleva más tiempo esperando se reparte primero. Es lo
  // que impide que un carro quede varado mientras entran otros más nuevos.
  elegibles.sort((a, b) =>
    new Date(a.registrado_at || 0) - new Date(b.registrado_at || 0));

  return { elegibles, excluidos };
}

// ─── CRITERIOS ────────────────────────────────────────────────────────────────

/** Qué tan rápida es la unidad en ese modelo. 0..1, 0.5 si no hay historia. */
export function familiaridad_(unidad, modelo, indice = {}) {
  if (!modelo) return 0.5;
  const valores = (unidad.miembros || [])
    .map(m => indice?.[m.user_id]?.[modelo]?.dailyRate)
    .filter(v => typeof v === "number");
  if (!valores.length) return 0.5;
  // En dupla manda el más rápido: es quien marca el ritmo del carro.
  return Math.min(1, Math.max(0, Math.max(...valores)));
}

/**
 * Prioridad por tiempo de espera. 0..1, 1 = lleva ESPERA_TOPE_MIN o más parado.
 *
 * Sustituye al criterio de equidad por meta diaria, que tenía un defecto de
 * fondo: se saturaba. En cuanto todos pasaban META_CARROS_TEC, el valor caía a
 * 0 para todo el mundo y ese peso dejaba de discriminar el resto del día.
 *
 * La espera no se satura nunca, y sobre todo es el único criterio que el
 * técnico puede verificar con sus propios ojos. "Llevo 40 minutos parado y le
 * diste el carro al que acaba de terminar" es la queja que destruye la
 * confianza en el reparto automático; familiaridad y cercanía no se pueden
 * discutir desde el piso del taller, la espera sí.
 *
 * En dupla manda el que lleva MENOS esperando: la unidad no está libre hasta
 * que lo están sus dos miembros.
 */
export function espera_(unidad, ahoraMs = Date.now(), topeMin = ESPERA_TOPE_MIN) {
  const ms = unidad.miembros || [];
  if (!ms.length) return 0.5;

  const esperas = ms.map(m => {
    const desde = m.libreDesde ? new Date(m.libreDesde).getTime() : null;
    return Number.isFinite(desde) ? (ahoraMs - desde) / 60000 : null;
  });
  if (esperas.some(e => e === null)) return 0.5;   // sin dato → neutro

  const min = Math.min(...esperas);
  return Math.min(1, Math.max(0, min / Math.max(1, topeMin)));
}

/** Cercanía a la zona del carro. 0..1, 1 = está al lado. */
export function cercania_(unidad, zonaCarro) {
  const d = distanciaZonas_(unidad.zonaUltima, zonaCarro);
  if (d === null) return 0.5;               // sin referencia previa → neutro
  return Math.min(1, Math.max(0, 1 - d / DIST_MAX));
}

/**
 * Compatibilidad entre quien va a tomar un puesto y quien ocupa el otro puesto
 * del mismo carro. Dos técnicos con el mismo ritmo terminan a la vez; uno
 * rápido con uno lento deja al rápido esperando y el carro ocupando zona.
 *
 * El peso manda en `avgMs` — el tiempo que tarda cada uno EN UN CARRO — porque
 * es la señal directa de "acaban juntos". `dailyRate` (carros por día) parece
 * lo mismo pero se confunde con cuántas horas trabaja cada quien: dos técnicos
 * con idéntico dailyRate pueden tardar muy distinto por carro si uno hace
 * jornadas más largas. `consistency` pesa más que antes porque un técnico
 * regular es emparejable; uno que un día tarda 2 h y otro 6 h no lo es, por
 * bueno que sea su promedio.
 */
export const W_SIM = {
  avgMs:       0.45,
  dailyRate:   0.25,
  consistency: 0.15,
  peakHour:    0.10,
  hourStd:     0.05,
};

/** Similitud entre dos user_id según el modelo entrenado. 0..1, 0.5 sin datos. */
function similitud_(idA, idB, techsPorId) {
  const na = techsPorId[idA]?.normalized;
  const nb = techsPorId[idB]?.normalized;
  if (!na || !nb) return 0.5;

  const d = Math.sqrt(Object.entries(W_SIM).reduce((s, [k, w]) => {
    const dif = (na[k] || 0) - (nb[k] || 0);
    return s + w * dif * dif;
  }, 0));
  return Math.min(1, Math.max(0, 1 - d));
}

/**
 * @param {object} unidad    la que se está puntuando
 * @param {object|object[]|string} pareja  unidad ya elegida, user_id de quien
 *   ya trabaja en el carro, o lista de unidades candidatas al otro puesto.
 *   Con una lista devuelve el MEJOR calce posible: responde "¿a esta unidad le
 *   queda algún buen compañero disponible?", que es lo que hay que saber al
 *   elegir el primero de los dos puestos.
 */
export function compatibilidad_(unidad, pareja, techsPorId = {}) {
  const idA = unidad?.miembros?.[0]?.user_id;
  if (!idA || !pareja) return 0.5;

  const idsDe = p => (typeof p === "string" ? p : p?.miembros?.[0]?.user_id);

  if (Array.isArray(pareja)) {
    const vals = pareja.map(p => idsDe(p)).filter(Boolean)
      .map(idB => similitud_(idA, idB, techsPorId));
    return vals.length ? Math.max(...vals) : 0.5;
  }
  const idB = idsDe(pareja);
  return idB ? similitud_(idA, idB, techsPorId) : 0.5;
}

// ─── PUNTUACIÓN ───────────────────────────────────────────────────────────────

/**
 * Puntúa una unidad para un carro concreto.
 * Devuelve también el desglose y una razón en castellano: es lo que la TV
 * muestra, y sin ella la asignación se lee como capricho de la máquina.
 */
export function puntuar_(unidad, carro, ctx = {}) {
  const {
    indiceModelos = {}, pesos = PESOS, parejaDe = null, techsPorId = {},
    ahoraMs = Date.now(), esperaTopeMin = ESPERA_TOPE_MIN,
  } = ctx;

  const detalle = {
    espera:       espera_(unidad, ahoraMs, esperaTopeMin),
    compatibilidad: compatibilidad_(unidad, parejaDe, techsPorId),
    familiaridad: familiaridad_(unidad, carro.modelo, indiceModelos),
    cercania:     cercania_(unidad, carro.zona),
  };

  const w = normalizarPesos_(pesos);
  const score = Object.entries(w)
    .reduce((s, [k, v]) => s + v * (detalle[k] ?? 0.5), 0);

  return { score: Math.round(score * 1000) / 1000, detalle, razon: razonar_(detalle, carro, unidad) };
}

/** La razón visible: el criterio que más pesó, dicho en castellano. */
export function razonar_(detalle, carro, unidad) {
  const partes = [];

  // La espera va primero: es la razón que el técnico entiende sin explicación
  // y la que hace que el reparto se lea como una cola y no como una lotería.
  if (detalle.espera >= 0.99) {
    partes.push("el que más lleva esperando");
  } else if (detalle.espera >= 0.5) {
    partes.push("lleva rato esperando");
  }
  if (detalle.compatibilidad >= 0.8) {
    partes.push("mismo ritmo que su pareja");
  }
  if (detalle.familiaridad >= 0.65 && carro.modelo) {
    partes.push(`rápido en ${carro.modelo}`);
  }
  if (detalle.cercania >= 0.8 && unidad.zonaUltima) {
    partes.push(unidad.zonaUltima === carro.zona ? "misma zona" : "zona contigua");
  }
  if (unidad.tipo === "DUPLA") {
    partes.push("dupla");
  }
  if (!partes.length) partes.push("siguiente en turno");

  return `Zona ${carro.zona} · ` + partes.join(" · ");
}

// ─── GENERACIÓN DE PROPUESTAS ─────────────────────────────────────────────────

/**
 * Reparte los carros del pool entre las unidades asignables.
 *
 * Estrategia: voraz por carro, en orden FIFO. Para cada puesto libre elige la
 * mejor unidad disponible y la marca como usada — una unidad no puede recibir
 * dos carros en la misma corrida, que es la regla que impide el acaparamiento.
 *
 * No busca el óptimo global a propósito: un reparto óptimo pero que cambia de
 * opinión cada minuto es inservible en un taller. Voraz + FIFO es estable y
 * explicable, que aquí vale más.
 */
export function generarPropuestas_(pool, unidades, ctx = {}) {
  const disponibles = unidades.filter(u => u.asignable);
  const usadas = new Set();
  const propuestas = [];

  const mejorPara = (carro, rol, parejaDe) => {
    let mejor = null;
    for (const u of disponibles) {
      if (usadas.has(u)) continue;
      if (String(u.rol || "").toUpperCase() !== rol && String(u.rol || "").toUpperCase() !== "AMBOS") continue;
      const p = puntuar_(u, carro, { ...ctx, parejaDe });
      if (!mejor || p.score > mejor.p.score) mejor = { u, p };
    }
    return mejor;
  };

  const libresDeRol = rol => disponibles.filter(u =>
    !usadas.has(u) &&
    (String(u.rol || "").toUpperCase() === rol || String(u.rol || "").toUpperCase() === "AMBOS"));

  for (const carro of pool.elegibles) {
    const carroId = ctx.nuevoId ? ctx.nuevoId() : `${carro.vin}-${carro.zona}`;

    // MOTOR primero solo para tener una pareja de referencia al puntuar el
    // TANQUE. No implica orden de trabajo: operaciones confirmó que cualquiera
    // de los dos puede empezar.
    const orden = ["MOTOR", "TANQUE"].filter(r => carro.rolesLibres.includes(r));
    let elegidaMotor = null;

    for (const rol of orden) {
      const otro = rol === "MOTOR" ? "TANQUE" : "MOTOR";

      // Contra quién se mide el ritmo, en orden de preferencia:
      //   1. Quien YA está trabajando el otro puesto de este carro. Es el caso
      //      más frecuente (al carro solo le falta un rol) y el único donde la
      //      pareja es un hecho, no una previsión.
      //   2. La unidad que acabamos de elegir para el otro puesto.
      //   3. Las unidades libres que podrían tomarlo — se usa el mejor calce
      //      posible, o sea "¿a este candidato le queda buen compañero?".
      // Antes el MOTOR se elegía siempre con `null` aquí: a ciegas, sin que la
      // compatibilidad interviniera, y el emparejamiento quedaba a medias.
      const pareja = carro.ocupadoPor?.[otro]
        || (otro === "MOTOR" ? elegidaMotor : null)
        || libresDeRol(otro);

      const sel = mejorPara(carro, rol, pareja);
      if (!sel) continue;
      usadas.add(sel.u);
      if (rol === "MOTOR") elegidaMotor = sel.u;

      const responsable = proximoResponsable_(sel.u, ctx.creditosDupla?.get(sel.u.duplaId) || new Map());

      propuestas.push({
        carro_id: carroId,
        vin: carro.vin,
        zona_id: carro.zona,
        modelo: carro.modelo,
        rol_trabajo: rol,
        unidad_dupla_id: sel.u.duplaId,
        user_id: responsable,
        miembros: sel.u.miembros.map(m => m.user_id),
        score: sel.p.score,
        score_detalle: sel.p.detalle,
        razon: sel.p.razon,
      });
    }
  }

  return {
    propuestas,
    unidadesLibres: disponibles.filter(u => !usadas.has(u)).length,
    carrosSinCubrir: pool.elegibles.length - new Set(propuestas.map(p => p.vin)).size,
  };
}
