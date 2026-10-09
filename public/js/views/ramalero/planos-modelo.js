// =========================
// public/js/views/ramalero/planos-modelo.js
// El modelo de un plano de ramal, con las palabras del taller:
//
//   Ramal ── conector principal, cinta, observaciones
//     └─ Tronco ── secciones en orden desde el conector
//          └─ Sección ── cm, medida («1/4»), observaciones, salidas
//               └─ Rama ── cm, medida, cables o conector, observaciones
//                    └─ Rama …   (una rama puede abrirse en más ramas)
//
// LOS DATOS SON JSON; LAS CLASES SON LA LÓGICA
// ────────────────────────────────────────────
// Un plano se escribe como JSON plano (planos-datos.js), que es lo que un
// día vivirá en la base y editará un supervisor. Las clases lo envuelven
// para responder lo que la pantalla pregunta: ¿a cuánto del conector sale
// esta rama?, ¿cuánto mide hasta la punta?, ¿qué medidas usa el plano?
// Así nadie recalcula sumas a mano en la vista, y agregar un modelo es
// agregar datos, no código.
//
// Lo que es solo de dibujo (ángulo, dónde va el nombre…) va aparte, en
// `dibujo`, para que la forma no se mezcle con las medidas.
// =========================

/**
 * @typedef {Object} RamaJSON
 * @property {string} id
 * @property {string} nombre
 * @property {string} [corto]            nombre corto para el dibujo
 * @property {number} [cm]               largo real; sin él la rama va punteada
 * @property {string} [medida]           cómo la dice el papel («6/4 + 1 puño»)
 * @property {string[]} [cables]         colores de los cables de la punta
 * @property {string} [conector]         pieza de la punta: "iny" | "map" | "interface"
 * @property {string[]} [observaciones]
 * @property {number} [cantidad]         piezas iguales en la punta (INY ×4)
 * @property {number} [en]               0–1: en qué punto de la rama madre sale (1 = al final)
 * @property {RamaJSON[]} [ramas]
 * @property {Object} [dibujo]           { ang, codo, largo, lado, sinLargo, cotaAbajo }
 */

export class Rama {
  /** @param {RamaJSON} json */
  constructor(json, { padre = null, seccion }) {
    this.id = json.id;
    this.nombre = json.nombre;
    this.corto = json.corto || "";
    this.cm = json.cm || 0;
    this.medida = json.medida || "";
    this.cables = json.cables || [];
    this.conector = json.conector || "";
    this.cantidad = json.cantidad || 1;
    this.observaciones = json.observaciones || [];
    this.en = json.en ?? 1;
    this.dibujo = json.dibujo || {};
    this.padre = padre;
    this.seccion = seccion;
    this.ramas = (json.ramas || []).map((r) => new Rama(r, { padre: this, seccion }));
  }

  /** Rama común (empalme): no termina en nada, solo se abre en otras. */
  get esEmpalme() {
    return this.ramas.length > 0 && !this.cables.length && !this.conector;
  }

  /** A cuántos cm del conector principal está la sección de donde sale. */
  get desdeConector() {
    return this.seccion.hasta;
  }

  /**
   * Los tramos medidos desde el tronco hasta el final de esta rama.
   * RPM → [26, 20]. Una rama que sale a mitad de su madre (en < 1) no
   * hereda el largo de la madre: no se sabe en qué cm sale.
   */
  get tramos() {
    const base = this.padre && this.en >= 1 && this.padre.cm ? this.padre.tramos : [];
    return this.cm ? [...base, this.cm] : base;
  }

  /** Largo total desde el tronco (0 si no se sabe). */
  get largo() {
    return this.tramos.reduce((a, b) => a + b, 0);
  }

  /** Las puntas de verdad: si es empalme, las de sus ramas. */
  get puntas() {
    return this.esEmpalme ? this.ramas.flatMap((r) => r.puntas) : [this];
  }

  *recorrer() {
    yield this;
    for (const r of this.ramas) yield* r.recorrer();
  }
}

export class Seccion {
  constructor(json, { tronco, desde }) {
    this.tronco = tronco;
    this.cm = json.cm;
    this.medida = json.medida || "";
    this.observaciones = json.observaciones || [];
    // { largo }: cuántos cm se dibuja (más corto que el real, sin marca),
    // para acomodar lo que sale después. La cota dice el real.
    this.dibujo = json.dibujo || {};
    this.desde = desde;               // cm del conector al inicio
    this.hasta = desde + json.cm;     // cm del conector al final (donde salen las ramas)
    this.salidas = (json.salidas || []).map((r) => new Rama(r, { seccion: this }));
  }

  get esUltima() {
    return this.tronco.secciones[this.tronco.secciones.length - 1] === this;
  }
}

export class Tronco {
  constructor(json) {
    let desde = 0;
    this.secciones = (json.secciones || []).map((s) => {
      const sec = new Seccion(s, { tronco: this, desde });
      desde = sec.hasta;
      return sec;
    });
  }

  get largo() {
    return this.secciones.reduce((a, s) => a + s.cm, 0);
  }
}

export class Ramal {
  constructor(json) {
    this.id = json.id;
    this.modelo = json.modelo;
    this.conector = { tipo: "principal", invertido: false, observaciones: [], ...(json.conector || {}) };
    this.cinta = json.cinta || [];
    this.observaciones = json.observaciones || [];
    this.dibujo = json.dibujo || {};
    this.tronco = new Tronco(json.tronco || {});
  }

  /** Todas las ramas, a cualquier profundidad. */
  *ramas() {
    for (const s of this.tronco.secciones) for (const r of s.salidas) yield* r.recorrer();
  }

  buscar(id) {
    for (const r of this.ramas()) if (r.id === id) return r;
    return null;
  }

  /**
   * Las medidas que usa este plano: cada largo que se mide de una pieza
   * (secciones del tronco y ramas con cm). Los totales (RPM = 26 + 20) se
   * arman con sus partes, así que no son entradas propias.
   * @returns {{cm:number, medida:string, usos:string[]}[]}
   */
  medidas() {
    const m = new Map();
    const suma = (cm, medida, uso) => {
      const e = m.get(cm) || { cm, medida: "", usos: [] };
      if (!e.medida && medida) e.medida = medida;
      e.usos.push(uso);
      m.set(cm, e);
    };
    let antes = "conector";
    for (const s of this.tronco.secciones) {
      const ahora = s.salidas[0]?.nombre?.toLowerCase() || "fin";
      suma(s.cm, s.medida, `tronco: ${antes} → ${ahora}`);
      antes = ahora;
    }
    for (const r of this.ramas()) if (r.cm) suma(r.cm, r.medida, r.nombre.toLowerCase());
    return [...m.values()].sort((a, b) => a.cm - b.cm);
  }
}
