// =========================
// lib/fin-prerequisites.js
// Qué fotos tiene que tener un carro antes de que se pueda cerrar su OT.
//
// Esto vivía dentro de routes/trabajo.js, enredado con la consulta a R2 y con
// el manejo de fechas de Lima. Aquí queda la decisión sola —dado un estado de
// fotos y un rol, qué falta— que es la parte que cambia cada vez que se añade
// un requisito y la única que se puede probar sin levantar nada.
// =========================

/**
 * Fotos del registro de parámetros que bloquean el cierre.
 *
 * No son las nueve del registro completo: el amperaje, el voltaje y el scan se
 * pueden completar después sin que nadie se quede parado. Estas cinco no.
 * Sin la foto del VIN no hay forma de probar de qué carro es el registro, y una
 * prueba de compresión a la que le falta un cilindro no es una prueba de
 * compresión: no se puede comparar contra nada.
 */
export const SLOTS_REGISTRO = ["vin", "comp_1", "comp_2", "comp_3", "comp_4"];

/** Soldadura, por rol. MOTOR suelda en cabina; TANQUE, el sensor de nivel. */
export const SLOTS_SOLDADURA = {
  MOTOR:  { slots: ["sold_cabina_antes", "sold_cabina_post"], nombre: "CABINA" },
  TANQUE: { slots: ["sold_sensor_antes", "sold_sensor_post"], nombre: "SENSOR DE NIVEL" },
};

/**
 * bloqueosDeFotos — qué le falta a este carro, en texto para el técnico.
 *
 * Devuelve dos listas porque no todo lo que falta pesa igual, y quien cierra
 * primero no puede pagar por el que cierra después:
 *
 *   bloqueos  impiden cerrar.
 *   avisos    se muestran, se pueden aceptar, y el cierre sigue.
 *
 * El registro de parámetros (VIN + las 4 compresiones) es UNO por carro, no
 * uno por técnico: lo suben entre los dos. Exigírselo a los dos por igual
 * dejaba al primero que terminaba esperando fotos que el otro todavía estaba
 * tomando. Por eso el requisito recae sobre EL ÚLTIMO en cerrar:
 *
 *   · no es el último → aviso: «no te olvides de subir tus fotos». Cierra.
 *   · es el último    → bloqueo: cuando él cierra ya no queda nadie que pueda
 *                      subirlas, y el carro se va sin registro.
 *
 * La soldadura no entra en este trato: cada rol tiene la suya (cabina o
 * sensor) y nadie más se la puede tomar, así que bloquea siempre.
 *
 * @param {object} opts
 * @param {string} opts.rol       rol del trabajo ("MOTOR" | "TANQUE" | otro)
 * @param {object} opts.status    mapa slot → boolean, tal como lo devuelve R2
 * @param {boolean} opts.esUltimo true si el rol complementario ya cerró. Por
 *   defecto true: si no se sabe, se exige el registro. Equivocarse hacia el
 *   bloqueo cuesta una llamada al supervisor; hacia el aviso cuesta un carro
 *   entregado sin prueba de qué se le hizo.
 * @returns {{bloqueos: string[], avisos: string[]}}
 */
export function bloqueosDeFotos({ rol, status, esUltimo = true } = {}) {
  const rolUp = String(rol || "").trim().toUpperCase();
  const s = status || {};
  const bloqueos = [];
  const avisos = [];

  const soldadura = SLOTS_SOLDADURA[rolUp];
  if (soldadura && !soldadura.slots.every((sl) => s[sl])) {
    bloqueos.push(
      `Falta registrar fotos de soldadura de ${soldadura.nombre} (antes y después).`
    );
  }

  // El registro de parámetros lo pide cualquiera de los dos roles que cierran
  // el carro: la OT se cierra una vez, y si se cierra sin registro nadie lo
  // vuelve a pedir. Quién lo paga depende de si todavía queda alguien detrás.
  if (SLOTS_SOLDADURA[rolUp]) {
    const faltanComp = SLOTS_REGISTRO
      .filter((sl) => sl.startsWith("comp_"))
      .filter((sl) => !s[sl]).length;

    const destino = esUltimo ? bloqueos : avisos;

    // Se dice CUÁNTAS faltan y no solo que faltan: entre "sube las 4" y
    // "te falta 1" hay la diferencia de volver a tomarlas todas o no.
    if (!s.vin) {
      destino.push("Falta la foto del VIN (Registrar parámetros).");
    }
    if (faltanComp) {
      destino.push(
        `Faltan ${faltanComp} de las 4 fotos de COMPRESIÓN (Registrar parámetros).`
      );
    }
  }

  return { bloqueos, avisos };
}

/**
 * fusionarStatus — une el estado de dos meses en uno.
 *
 * Las fotos se guardan bajo `registro/{YYYY-MM}/{VIN}/`, así que un carro que
 * empezó el último día de un mes y se cierra al día siguiente tiene sus fotos
 * repartidas entre dos carpetas. Una foto presente en cualquiera de los dos
 * cuenta; buscar solo en el mes en curso bloqueaba a quien no había hecho nada
 * mal.
 */
export function fusionarStatus(...estados) {
  const salida = {};
  for (const est of estados) {
    for (const [slot, hay] of Object.entries(est || {})) {
      salida[slot] = salida[slot] || !!hay;
    }
  }
  return salida;
}
