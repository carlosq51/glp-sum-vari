// =========================
// public/js/templates/views/informe-imprimible.js
// Las tres hojas de un informe a partir de lo que mandaron los técnicos,
// SIN pasar por el formulario de la oficina. Funciones puras.
//
// POR QUÉ EXISTE
// La pantalla /informe-taller arma las hojas leyendo su formulario: vuelca
// el informe en los campos (volcar_) y los vuelve a leer (datos_). Eso sirve
// cuando una persona revisa antes de imprimir. La impresión automática no
// tiene formulario: la laptop de la oficina pide las hojas al servidor y las
// manda a la impresora. Aquí está esa misma ida y vuelta, sin DOM, para que
// el papel salga igual que si lo hubiera impreso alguien a mano.
// =========================

import { informeHojaHtml } from "./informe-taller-view.js";
import { hojaChequeoHtml } from "./hoja-chequeo-view.js";
import { hojaProduccionHtml } from "./hoja-produccion-view.js";

// Las horas van SIEMPRE en hora de Lima, igual que en informe-taller.js: el
// servidor corre en UTC y sin esto el papel diría 21:19 por 16:19.
const ZONA = "America/Lima";
const fmtHora_ = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtFecha_ = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

const s_ = (v) => String(v ?? "").trim();
const norm_ = (v) => s_(v).toUpperCase();

function horaDe_(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? fmtHora_.format(t) : "";
}

/** "aaaa-mm-dd" en Lima → "dd-mm-aaaa", que es como se escribe en estas hojas. */
function fechaPeru_(ms) {
  const [y, m, d] = fmtFecha_.format(ms).split("-");
  return `${d}-${m}-${y}`;
}

/** dd-mm-aa — el Registro de Tiempos tiene la columna estrecha. */
function fechaCorta_(ms) {
  const larga = fechaPeru_(ms);
  return larga.slice(0, 6) + larga.slice(-2);
}

/**
 * Lo que cada hoja necesita, sacado del informe aplanado del servidor.
 *
 * @param {object} plano  aplanarInforme_() + aplicarVehiculo_()
 * @param {number} ahora  ms de la impresión: fecha del chequeo y hora de fin
 *                        de quien no ha cerrado todavía
 */
export function datosHojas_(plano = {}, ahora = Date.now()) {
  const tanquero = s_(plano.tanquero);

  // "Delantero / tanquero", cada uno una vez: el tanquero no se repite
  // aunque venga también entre los técnicos.
  const tecnicos = [...(plano.tecnicos || []).filter(n => norm_(n) !== norm_(tanquero)), tanquero]
    .map(s_)
    .filter((n, i, xs) => n && xs.findIndex(y => norm_(y) === norm_(n)) === i);

  const bateria = plano.bateria || {};
  const cilindros = [0, 1, 2, 3].map(i => s_(plano.cilindros?.[i]));

  return {
    informe: {
      marca: s_(plano.marca) || "JETOUR",
      modelo: s_(plano.modelo) || "X70",
      ot: s_(plano.ot),
      placa: norm_(plano.placa),
      vin: norm_(plano.vin),
      trabajo: s_(plano.trabajo) || "CONVERSION",
      tareas: Array.isArray(plano.tareas) ? plano.tareas : undefined,
      observaciones: plano.observaciones || "",
      tecnicos,
    },
    chequeo: {
      fecha: fechaPeru_(ahora),
      // Null = todos marcados, que es lo que hace la hoja cuando nadie dijo
      // lo contrario. Un informe a medias trae solo los puntos de quien
      // mandó, y así sale: los del compañero quedan para marcarlos a mano.
      marcados: Array.isArray(plano.marcados) ? plano.marcados : null,
      vin: norm_(plano.vin),
      marca: s_(plano.marca) || "JETOUR",
      modelo: s_(plano.modelo) || "X70",
      tecnicos,
      bateria: { v: s_(bateria.v), ai: s_(bateria.ai), af: s_(bateria.af) },
      cilindros,
      tanquero,
    },
    produccion: {
      ot: s_(plano.ot),
      filas: (plano.prod || []).filter(p => s_(p.nombre)).map(p => ({
        nombre: s_(p.nombre),
        // Sin inicio, la fecha es la de hoy: la misma que pone el formulario.
        fecha: fechaCorta_(Number.isFinite(Date.parse(p.inicio)) ? Date.parse(p.inicio) : ahora),
        inicio: horaDe_(p.inicio),
        // Quien no ha cerrado termina cuando sale el papel, igual que en la
        // impresión a mano.
        fin: horaDe_(p.fin) || fmtHora_.format(ahora),
        marcas: p.marcas || {},
      })),
    },
  };
}

/** Las tres hojas, en el orden en que salen por la impresora. */
export function hojasInformeHtml(plano = {}, ahora = Date.now()) {
  const d = datosHojas_(plano, ahora);
  return informeHojaHtml(d.informe) + hojaChequeoHtml(d.chequeo) + hojaProduccionHtml(d.produccion);
}
