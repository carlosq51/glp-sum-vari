// =========================
// lib/ot-estados.js
// Qué se puede hacer con una OT según el estado en que está.
//
// Esta tabla estaba escrita TRES veces, y las tres decían lo mismo hasta que
// alguna dejara de decirlo:
//
//   · routes/trabajo.js  — la validación del servidor (`transicionesValidas`).
//   · work-status.js     — la que valida lo que entra por el escáner del VIN.
//   · work-templates.js  — los botones de la tarjeta.
//
// La última regla que se añadió (CALIDAD no cierra la OT ajena) hubo que
// escribirla en las tres. La siguiente también, y el día que a una se le
// olvide, el síntoma es un botón que existe y rebota, o uno que no existe
// para algo que sí se podía hacer.
//
// Aquí vive una sola vez y las tres la leen.
// =========================

/** Estado de la OT → acciones que el flujo admite desde ahí. */
export const ACCIONES_POR_ESTADO = {
  SIN_INICIAR: ["INICIO", "NOTA"],
  TRABAJANDO:  ["PAUSA", "FIN", "NOTA"],
  PAUSADO:     ["REANUDAR", "FIN", "NOTA"],
  FINALIZADO:  ["NOTA"],
};

/**
 * Un estado que no está en la tabla no desbloquea nada raro: se trata como una
 * OT sin empezar. Es lo que hacía el servidor con su `|| ["INICIO", "NOTA"]`.
 */
const POR_DEFECTO = ACCIONES_POR_ESTADO.SIN_INICIAR;

/**
 * accionesDe_ — qué puede hacerse con esta OT, aquí y ahora.
 *
 * @param {string}  estado          estado_actual de la asignación
 * @param {object}  [o]
 * @param {boolean} [o.ajena]       es la OT de CALIDAD del otro inspector
 * @returns {string[]}
 */
export function accionesDe_(estado, { ajena = false } = {}) {
  const acciones = ACCIONES_POR_ESTADO[String(estado || "").toUpperCase()] || POR_DEFECTO;

  // La OT ajena de CALIDAD se trabaja pero no se firma: el FIN de una
  // inspección es de quien la hizo (ver lib/colaboracion.js). El permiso lo
  // decide allá; aquí solo se refleja, para que el botón no exista en vez de
  // existir y rebotar.
  //
  // Siempre una copia: la tabla es compartida por el servidor y la pantalla, y
  // un `.pop()` de alguien sobre el array devuelto se la llevaría por delante
  // para todo el proceso.
  return ajena ? acciones.filter(a => a !== "FIN") : acciones.slice();
}
