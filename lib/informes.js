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

  // La línea "PLACA :" de la hoja lleva el número de OT, no una matrícula.
  // Los carros que se convierten son nuevos y todavía no tienen placa, así
  // que el taller escribe ahí la orden. La etiqueta del papel se queda como
  // está —es el formulario que la empresa firma— y solo cambia el dato.
  //
  // Si alguien escribe una placa de verdad desde la oficina, esa manda.
  const placa = s_(d.comun.placa) || s_(d.comun.ot);

  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y);
  const primero = (...xs) => xs.find(x => Array.isArray(x) ? x.some(s_) : s_(x)) ?? (Array.isArray(xs[0]) ? [] : "");

  const obs = [motor.observaciones, tanque.observaciones].filter(Boolean).join("\n");

  return {
    ...d.comun,
    placa,
    tareas: union(motor.tareas, tanque.tareas),
    marcados: union(motor.marcados, tanque.marcados),
    bateria: Object.keys(motor.bateria || {}).length ? motor.bateria : (tanque.bateria || {}),
    cilindros: primero(motor.cilindros, tanque.cilindros),
    observaciones: obs,
    // En las hojas el delantero va primero y el tanquero después, que es el
    // orden en que se lee "TÉCNICO RESPONSABLE: fulano / mengano".
    tecnicos: [motor.nombre, tanque.nombre].filter(Boolean),
    tanquero: s_(tanque.nombre),
    prod: ROLES_INFORME
      .map(r => d.porRol[r])
      .filter(p => p && s_(p.nombre))
      .map(p => ({
        nombre: p.nombre,
        fecha: p.inicio || "",
        inicio: p.inicio || "",
        fin: p.fin || "",
        marcas: p.etapas || {},
      })),
    // Para que la oficina sepa si falta una mitad antes de imprimir.
    faltan: ROLES_INFORME.filter(r => !d.porRol[r]),
  };
}
