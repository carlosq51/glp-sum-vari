// =========================
// public/js/views/zonas/zonas-eta.js
// El estimado de la plaza: cuánto le falta al carro y si alcanza el turno.
//
// El cálculo es puro y vive en lib/eta-carro.js, con la medición que explica
// por qué NO se da una hora de reloj. Aquí solo se decide dos cosas:
//
//   1. QUIÉN VE QUÉ. Admin y supervisión ven el número; el movilizador, solo
//      si el carro alcanza hoy. No es desconfianza: un número blando se
//      convierte en plazo, y el movilizador no necesita el plazo sino la
//      decisión que depende de él —¿preparo la salida de esta plaza o no?—.
//      Al técnico no se le muestra nada: es a él a quien se mediría con el
//      número, y el estimado no está para eso.
//
//   2. CÓMO SE REDONDEA. A cuartos de hora y con un "~" delante. El 50%
//      central de las mitades está entre 2,1 y 3,6 h: fingir minutos exactos
//      sobre esa dispersión es mentir con decimales.
//
// Se calcula AL PINTAR y no en el servidor porque /api/zonas se sirve cacheado
// unos segundos: un "falta 1 h" calculado allá nacería viejo. Viajan los dos
// relojes de cada mitad y el cliente hace la cuenta, igual que el cronómetro
// de la tarjeta del técnico.
// =========================

import { cfg } from "../../core/config.js";
import { hhmmAMin_, minutosPE_ } from "../../core/format.js";
import { puedeDespachar_ } from "./zonas-despacho.js";
import {
  etaCarro_, minutosUtiles_, MOTIVO_ETA, PUESTOS_CARRO,
} from "../../../../lib/eta-carro.js";

/** Minutos de trabajo que quedan hoy, según el reloj del taller. */
function utilesDeHoy_() {
  return minutosUtiles_({
    ahoraMin:     minutosPE_(),
    finTurnoMin:  hhmmAMin_(cfg("PROYECCION_FIN_TURNO")) ?? 990,
    comidaIniMin: hhmmAMin_(cfg("HORARIO_COMIDA_INICIO")),
    comidaFinMin: hhmmAMin_(cfg("HORARIO_COMIDA_FIN")),
  });
}

/**
 * El estimado de una plaza, o null si esa plaza no admite ninguno.
 *
 * @param {object} zona        fila de /api/zonas
 * @param {object} medianas    `eta_medianas` del mismo payload
 */
export function etaDeZona_(zona, medianas) {
  if (!zona?.vin || !medianas) return null;
  if (zona.estado === "FINALIZADO") return { estimable: false, motivo: MOTIVO_ETA.LISTO };

  const relojes = zona.tecnicos?.relojes || {};
  const puestos = {};
  for (const rol of PUESTOS_CARRO) puestos[rol] = relojes[rol] || null;

  return etaCarro_({
    puestos,
    medianas,
    modelo: zona.modelo || "",
    ahoraMs: Date.now(),
    minutosUtiles: utilesDeHoy_(),
  });
}

/** "~1 h 15" · "~45 min". Cuartos de hora: el dato no sostiene más fineza. */
function faltaTexto_(ms) {
  const cuartos = Math.max(1, Math.round(ms / 900_000));
  const min = cuartos * 15;
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `~${h} h ${m}` : `~${h} h`;
}

const PUESTO_FALTA = { MOTOR: "delantero", TANQUE: "tanquero" };

/**
 * La línea corta de la tarjeta. Devuelve "" cuando no hay nada que decir: un
 * hueco en una tarjeta de 15 es mejor que un "—" que hay que descifrar.
 *
 * Dos lecturas según quién mira (ver cabecera):
 *   · supervisión → "~1 h 15" y el color del veredicto
 *   · movilizador → "hoy" / "no hoy", sin número
 */
export function etaBadgeHTML_(eta) {
  if (!eta) return "";
  const conNumero = puedeDespachar_();

  if (!eta.estimable) {
    // Se avisa de UN solo caso, y solo cuando falta UNA mitad: el carro que
    // parece ocupado y no va a salir porque está a medias. Eso no se ve en la
    // tarjeta y es lo que hay que mover.
    //
    // Si faltan las DOS, no se dice nada: la tarjeta ya lo grita —sin nombres
    // y en el color de "nadie encima" (dotacionClass_)— y repetirlo pondría
    // media rejilla en rojo cada noche, que es la forma más rápida de que
    // nadie vuelva a mirar los avisos.
    const faltan = eta.faltanPuestos || [];
    if (eta.motivo === MOTIVO_ETA.FALTA_UNO && faltan.length === 1) {
      return `<span class="zonaEta zonaEta--falta">falta ${PUESTO_FALTA[faltan[0]] || faltan[0]}</span>`;
    }
    return "";
  }

  if (eta.pasado && !eta.faltaMs) {
    return `<span class="zonaEta zonaEta--ya">${conNumero ? "ya pasó lo normal" : "en cualquier momento"}</span>`;
  }

  const clase = eta.alcanzaHoy ? "zonaEta--hoy" : "zonaEta--manana";
  const texto = conNumero
    ? faltaTexto_(eta.faltaMs)
    : (eta.alcanzaHoy ? "sale hoy" : "no sale hoy");
  return `<span class="zonaEta ${clase}">${texto}</span>`;
}

/**
 * La línea larga de la hoja de acciones, donde sí hay sitio para explicar.
 *
 * Aquí el movilizador también lee el veredicto en palabras: la hoja se abre a
 * propósito sobre una plaza concreta, no es un dato que le salte a la cara.
 */
export function etaLineaHTML_(eta) {
  if (!eta) return "";
  const conNumero = puedeDespachar_();

  if (!eta.estimable) {
    const txt = {
      [MOTIVO_ETA.LISTO]:     "El carro está listo.",
      [MOTIVO_ETA.EN_PAUSA]:  "El reloj está parado: no se puede estimar hasta que vuelvan al carro.",
      [MOTIVO_ETA.SIN_BASE]:  "Sin historia de este modelo todavía: no hay con qué medirlo.",
      // La hoja se abre a propósito sobre una plaza: aquí sí se explica también
      // el carro al que no le pusieron a nadie, que en la rejilla se callaba.
      [MOTIVO_ETA.FALTA_UNO]: (() => {
        const faltan = eta.faltanPuestos || [];
        if (faltan.length > 1) return "Este carro no tiene a nadie asignado todavía.";
        const quien = PUESTO_FALTA[faltan[0]] || faltan[0];
        return `Falta ${quien}. Mientras el carro esté a medias no depende del ritmo, sino de que el despacho mande a alguien.`;
      })(),
    }[eta.motivo];
    return txt ? `<div class="zdNota zonaEtaLinea">${txt}</div>` : "";
  }

  if (eta.pasado && !eta.faltaMs) {
    return `<div class="zdNota zonaEtaLinea">Ya pasó el tiempo que este trabajo tarda de normal: puede salir en cualquier momento.</div>`;
  }

  const veredicto = eta.alcanzaHoy
    ? "Alcanza el turno de hoy."
    : "No alcanza el turno de hoy.";
  const cuanto = conNumero
    ? `Falta ${faltaTexto_(eta.faltaMs)} de trabajo${eta.puestoLento ? ` (lo marca el ${PUESTO_FALTA[eta.puestoLento]})` : ""}. `
    : "";
  return `<div class="zdNota zonaEtaLinea">${cuanto}${veredicto}</div>`;
}
