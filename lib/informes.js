// =========================
// lib/informes.js
// La forma de un informe de taller y cómo se fusionan las dos mitades.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El informe lo llenan DOS personas al final del trabajo: el delantero
// (MOTOR) marca lo suyo y el tanquero (TANQUE) lo suyo. Los dos mandan a la
// misma OT. Sin fusionar, el segundo en enviar borraría lo del primero y el
// papel saldría a medias — y nadie se daría cuenta hasta tenerlo en la mano.
//
// LA FORMA
//   {
//     comun:  { placa, marca, modelo, trabajo, ot, vin },
//     porRol: {
//       MOTOR:  { nombre, inicio, fin, tareas[], marcados[], bateria{},
//                 cilindros[], observaciones, etapas{} },
//       TANQUE: { … lo mismo … }
//     }
//   }
//
// `comun` es del carro y lo puede escribir cualquiera de los dos: la placa
// es la misma la mire quien la mire. `porRol` es de cada uno y solo lo toca
// su dueño.
// =========================

export const ROLES_INFORME = ["MOTOR", "TANQUE"];

const s_ = (v) => String(v ?? "").trim();

/** Un informe vacío con la forma completa. Evita comprobar null por todos lados. */
export function informeVacio_() {
  return {
    // `ot` es el número de la orden FÍSICA, el que va impreso en el papel.
    // El UUID del sistema vive fuera de `datos`, en la columna work_order_id:
    // en una hoja impresa un UUID no le sirve a nadie.
    comun: { ot: "", placa: "", marca: "JETOUR", modelo: "X70", trabajo: "CONVERSION", vin: "" },
    // Quiénes trabajaron el carro, según el sistema. Lo pone el servidor al
    // guardar, no el técnico, y existe aunque solo haya mandado uno de los
    // dos: es lo que permite imprimir el nombre y la hora del compañero
    // antes de que él envíe su mitad.
    personas: [],
    porRol: {},
  };
}

/**
 * Mete la mitad de un rol en el informe que ya existía.
 *
 * @param {object} previo   lo guardado (puede venir vacío o con forma vieja)
 * @param {string} rol      MOTOR o TANQUE
 * @param {object} parte    lo que mandó esa persona
 * @returns {object} el informe fusionado
 */
export function fusionarInforme_(previo, rol, parte = {}) {
  const base = normalizar_(previo);
  const r = s_(rol).toUpperCase();
  if (!ROLES_INFORME.includes(r)) return base;

  // Lo común se actualiza solo con lo que venga con contenido: si el
  // tanquero deja la placa vacía porque ya la puso el delantero, no puede
  // borrarla al enviar.
  for (const k of Object.keys(base.comun)) {
    const v = parte.comun?.[k];
    if (s_(v)) base.comun[k] = s_(v);
  }

  base.porRol[r] = {
    nombre: s_(parte.nombre),
    inicio: parte.inicio || null,
    fin: parte.fin || null,
    tareas: Array.isArray(parte.tareas) ? parte.tareas : [],
    marcados: Array.isArray(parte.marcados) ? parte.marcados : [],
    bateria: parte.bateria && typeof parte.bateria === "object" ? parte.bateria : {},
    cilindros: Array.isArray(parte.cilindros) ? parte.cilindros : [],
    observaciones: s_(parte.observaciones),
    etapas: parte.etapas && typeof parte.etapas === "object" ? parte.etapas : {},
    enviado_at: new Date().toISOString(),
  };

  return base;
}

/** Acepta informes con la forma vieja (todo plano) sin perder lo que traían. */
function normalizar_(previo) {
  const base = informeVacio_();
  if (!previo || typeof previo !== "object") return base;

  if (previo.comun || previo.porRol) {
    Object.assign(base.comun, previo.comun || {});
    base.porRol = { ...(previo.porRol || {}) };
    base.personas = Array.isArray(previo.personas) ? previo.personas : [];
    if (previo.correccion) base.correccion = previo.correccion;
    return base;
  }

  // Forma vieja: un solo objeto plano, de antes de que el informe fuera
  // colaborativo. Se conserva como la mitad del MOTOR, que es quien lo
  // mandaba entonces.
  for (const k of Object.keys(base.comun)) {
    if (s_(previo[k])) base.comun[k] = s_(previo[k]);
  }
  return base;
}

/**
 * Junta las dos mitades en el objeto plano que pintan las tres hojas.
 *
 * Las reglas de unión salen del papel, no de la comodidad:
 *   · tareas y puntos del chequeo → UNIÓN. Cada uno marca lo que hizo; el
 *     papel lleva todo lo hecho entre los dos.
 *   · batería y cilindros → los mide el delantero, pero si solo mandó el
 *     tanquero se cogen los suyos antes que dejar el hueco en blanco.
 *   · observaciones → se concatenan. Perder la de uno sería perder la
 *     única razón por la que ese campo existe.
 */
export function aplanarInforme_(informe) {
  const d = normalizar_(informe);
  const motor = d.porRol.MOTOR || {};
  const tanque = d.porRol.TANQUE || {};

  // La línea "PLACA :" de la hoja lleva el VIN COMPLETO, no una matrícula.
  // Los carros que se convierten son nuevos y todavía no la tienen, así que
  // el taller identifica el carro por su VIN. La etiqueta del papel se queda
  // como está —es el formulario que la empresa firma— y solo cambia el dato.
  //
  // Si alguien escribe una placa de verdad desde la oficina, esa manda: el
  // hueco vuelve a ser el de la placa el día que lleguen matriculados.
  const placa = s_(d.comun.placa) || s_(d.comun.vin);

  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y);
  const primero = (...xs) => xs.find(x => Array.isArray(x) ? x.some(s_) : s_(x)) ?? (Array.isArray(xs[0]) ? [] : "");

  const obs = [motor.observaciones, tanque.observaciones].filter(Boolean).join("\n");

  // Quién es cada uno y desde cuándo lo sabe el SISTEMA, no quien envía.
  // Por eso los nombres y las horas salen del padrón: el papel puede llevar
  // el nombre del tanquero y su hora de inicio aunque él no haya mandado
  // nada todavía. Lo que sí necesita su envío son las casillas marcadas.
  const delRol = (r) => (d.personas || []).find(p => s_(p.rol).toUpperCase() === r) || {};
  const pMotor = delRol("MOTOR");
  const pTanque = delRol("TANQUE");

  const nombreDe = (p, mitad) => s_(p.nombre) || s_(mitad.nombre);

  return {
    ...d.comun,
    placa,
    tareas: union(motor.tareas, tanque.tareas),
    // Si la oficina corrigió los puntos al revisar, mandan los suyos: es
    // la última palabra antes de que salga el papel.
    marcados: Array.isArray(d.correccion?.marcados)
      ? d.correccion.marcados
      : union(motor.marcados, tanque.marcados),
    bateria: Object.keys(motor.bateria || {}).length ? motor.bateria : (tanque.bateria || {}),
    cilindros: primero(motor.cilindros, tanque.cilindros),
    observaciones: obs,
    // En las hojas el delantero va primero y el tanquero después, que es el
    // orden en que se lee "TÉCNICO RESPONSABLE: fulano / mengano".
    tecnicos: [nombreDe(pMotor, motor), nombreDe(pTanque, tanque)].filter(Boolean),
    tanquero: nombreDe(pTanque, tanque),
    prod: [[pMotor, motor], [pTanque, tanque]]
      .filter(([p, mitad]) => nombreDe(p, mitad))
      .map(([p, mitad]) => ({
        nombre: nombreDe(p, mitad),
        // Las horas mandan las del sistema; las de la mitad enviada quedan
        // de reserva por si el padrón no llegó a guardarse.
        fecha: p.inicio || mitad.inicio || "",
        inicio: p.inicio || mitad.inicio || "",
        fin: p.fin || mitad.fin || "",
        // Las etapas SÍ son de quien envió: dicen qué hizo, y eso el
        // sistema no lo sabe.
        marcas: mitad.etapas || {},
      })),
    // Para que la oficina sepa si falta una mitad antes de imprimir.
    faltan: ROLES_INFORME.filter(r => !d.porRol[r]),
  };
}

/**
 * Aplica las correcciones que hizo la oficina sin destruir la estructura.
 *
 * La pantalla de impresión trabaja con el informe APLANADO —un objeto liso
 * con placa, ot, tecnicos…— porque es lo que pintan las hojas. Si eso se
 * guardara tal cual, machacaría `porRol` y `personas`, y se perdería quién
 * marcó qué y el padrón del sistema. El informe quedaría irrecuperable.
 *
 * Así que de lo aplanado solo se recoge lo que la oficina puede cambiar:
 * los datos del carro. Las mitades de cada técnico se quedan como están.
 *
 * @param {object} previo  lo guardado, con su forma completa
 * @param {object} plano   lo que devolvió el formulario de impresión
 */
export function aplicarEdicion_(previo, plano = {}) {
  const base = normalizar_(previo);
  for (const k of Object.keys(base.comun)) {
    if (s_(plano[k])) base.comun[k] = s_(plano[k]);
  }
  // Los puntos del chequeo sí puede tocarlos la oficina, y viajan aparte
  // porque su formulario no los muestra uno a uno. Se guardan como una
  // corrección propia, sin tocar lo que mandó cada técnico.
  if (Array.isArray(plano.marcados)) base.correccion = { marcados: plano.marcados };
  return base;
}
