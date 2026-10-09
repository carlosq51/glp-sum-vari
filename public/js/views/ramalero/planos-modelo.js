// =========================
// public/js/views/ramalero/planos-modelo.js
// El modelo de un plano de ramal, con las palabras del taller.
//
// CÓMO SE PIENSA UN RAMAL
// ───────────────────────
// Todas las ramas nacen en el conector principal. Mientras van juntas son
// el TRONCO; en cada NODO se separan las que salen ahí. Una rama puede, a
// su vez, llevar a otras juntas un trecho y abrirse en un nodo propio
// (conmutador + chapa, electroválvula + temperatura).
//
//   Ramal ── conector principal, cinta, observaciones, guía de armado
//     ├─ Guía ── pasos (Posición 0 · tendido … Final · ramal armado)
//     └─ Tronco ── secciones en orden desde el conector
//          └─ Sección ── cm, medida («1/4»), observaciones
//               └─ Nodo ── donde termina la sección y salen ramas
//                    └─ Rama ── cm, medida, cables o pieza, pasos
//                         └─ Nodo ── si la rama lleva a otras y se abre
//                              └─ Rama …
//
// Cada rama es independiente: sabe de qué nodo sale, cuánto mide y a
// cuánto del conector termina (el largo al que se cortan sus cables), y
// lleva sus propios pasos (dobleces y lo que haya que hacerle).
//
// LOS DATOS SON JSON; LAS CLASES SON LA LÓGICA
// ────────────────────────────────────────────
// Un plano se escribe como JSON plano (planos-datos.js), que es lo que un
// día vivirá en la base y editará un supervisor. Las clases lo envuelven
// para responder lo que la pantalla pregunta. Lo que es solo de dibujo
// (ángulo, dónde va el nombre…) va aparte, en `dibujo`.
// =========================

/**
 * @typedef {Object} NodoJSON
 * @property {string[]} [observaciones]
 * @property {RamaJSON[]} ramas          las que salen aquí
 *
 * @typedef {Object} PasoJSON            algo que se le hace a la rama
 * @property {string} tipo               "doblez" | "nota" | …
 * @property {string} texto
 * @property {number} [cm]               a cuántos cm del nodo de salida
 *
 * @typedef {Object} RamaJSON
 * @property {string} id
 * @property {string} nombre
 * @property {string} [corto]            nombre corto para el dibujo
 * @property {number} [cm]               largo desde su nodo; sin él la rama va punteada
 * @property {string} [medida]           cómo la dice el papel («6/4 + 1 puño»)
 * @property {string[]} [cables]         colores de los cables de la punta
 * @property {string} [conector]         pieza de la punta: "iny" | "map" | "interface"
 * @property {number} [cantidad]         piezas iguales en la punta (INY ×4)
 * @property {string[]} [observaciones]
 * @property {PasoJSON[]} [pasos]
 * @property {NodoJSON} [nodo]           si lleva otras ramas y se abre al final
 * @property {Object} [dibujo]           { ang, codo, largo, lado, sinLargo }
 */

export class Nodo {
  /**
   * @param {NodoJSON} json
   * @param {{ distancia:number, de: Seccion|Rama }} donde
   */
  constructor(json, { distancia, de }) {
    this.distancia = distancia;         // cm desde el conector (null si no se sabe)
    this.de = de;                       // la sección del tronco o la rama que termina aquí
    this.observaciones = json?.observaciones || [];
    this.ramas = (json?.ramas || []).map((r) => new Rama(r, { origen: this }));
  }

  get enTronco() {
    return this.de instanceof Seccion;
  }
}

export class Rama {
  /** @param {RamaJSON} json */
  constructor(json, { origen }) {
    this.origen = origen;               // nodo del que sale
    this.id = json.id;
    this.nombre = json.nombre;
    this.corto = json.corto || "";
    this.cm = json.cm || 0;
    this.medida = json.medida || "";
    this.cables = json.cables || [];
    this.conector = json.conector || "";
    this.cantidad = json.cantidad || 1;
    this.observaciones = json.observaciones || [];
    this.pasos = json.pasos || [];
    this.dibujo = json.dibujo || {};
    const fin = this.cm && origen.distancia != null ? origen.distancia + this.cm : null;
    this.nodo = json.nodo ? new Nodo(json.nodo, { distancia: fin, de: this }) : null;
  }

  /** Lleva a otras ramas juntas y se abre al final: no termina en nada. */
  get esEmpalme() {
    return !!this.nodo;
  }

  /** La rama que la lleva hasta su nodo (null si sale del tronco). */
  get padre() {
    return this.origen.enTronco ? null : this.origen.de;
  }

  /** A cuántos cm del conector está el nodo de donde sale. */
  get sale() {
    return this.origen.distancia;
  }

  /** A cuántos cm del conector termina (null si no se sabe su largo). */
  get hastaPunta() {
    return this.cm && this.sale != null ? this.sale + this.cm : null;
  }

  /**
   * Los tramos medidos desde el tronco hasta el final de esta rama.
   * Chapa → [129] (va con el conmutador); una rama del tronco → [cm].
   */
  get tramos() {
    const base = this.padre ? this.padre.tramos : [];
    return this.cm ? [...base, this.cm] : base;
  }

  /** Largo desde el tronco hasta la punta (0 si no se sabe). */
  get largo() {
    return this.tramos.reduce((a, b) => a + b, 0);
  }

  /** Las puntas de verdad: si es empalme, las de las ramas de su nodo. */
  get puntas() {
    return this.esEmpalme ? this.nodo.ramas.flatMap((r) => r.puntas) : [this];
  }

  *recorrer() {
    yield this;
    if (this.nodo) for (const r of this.nodo.ramas) yield* r.recorrer();
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
    this.hasta = desde + json.cm;     // cm del conector al final, donde está su nodo
    this.nodo = new Nodo(json.nodo, { distancia: this.hasta, de: this });
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

  get nodos() {
    return this.secciones.map((s) => s.nodo);
  }
}

/**
 * Un paso de la guía de armado: una «posición» del ramal mientras se arma.
 * `vista` dice cómo se dibuja: "tendido" (todas las ramas colgando en
 * vertical del conector) o "plano" (el ramal armado).
 * @typedef {Object} PasoJSON_
 * @property {string} id
 * @property {string} titulo
 * @property {string} [texto]            qué se hace en este paso
 * @property {string} vista              "tendido" | "plano"
 * @property {boolean} [conectorInvertido]
 * @property {string[]} [orden]          tendido: ramas de izquierda a derecha
 */
export class Paso {
  constructor(json, { guia, n }) {
    this.guia = guia;
    this.n = n;
    this.id = json.id;
    this.titulo = json.titulo;
    this.texto = json.texto || "";
    this.vista = json.vista || "plano";
    this.conectorInvertido = json.conectorInvertido ?? this.vista === "plano";
    this.orden = json.orden || [];
  }

  get esUltimo() {
    return this.n === this.guia.pasos.length - 1;
  }

  /**
   * Tendido: las ramas que llegan a una punta, en el orden pedido (las que
   * no estén en `orden` van al final, en el orden del tronco).
   */
  get ramasTendidas() {
    const puntas = [];
    for (const s of this.guia.ramal.tronco.secciones) for (const r of s.nodo.ramas) puntas.push(...r.puntas);
    const pos = (r) => {
      const i = this.orden.indexOf(r.id);
      return i < 0 ? this.orden.length + puntas.indexOf(r) : i;
    };
    return puntas.sort((a, b) => pos(a) - pos(b));
  }
}

/** La guía de armado de un ramal: sus pasos en orden. */
export class Guia {
  constructor(json, ramal) {
    this.ramal = ramal;
    const pasos = json?.pasos?.length
      ? json.pasos
      : [{ id: "final", titulo: "Ramal armado", vista: "plano" }];
    this.pasos = pasos.map((p, n) => new Paso(p, { guia: this, n }));
  }

  get final() {
    return this.pasos[this.pasos.length - 1];
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
    this.guia = new Guia(json.guia, this);
  }

  /** Todas las ramas, a cualquier profundidad. */
  *ramas() {
    for (const n of this.tronco.nodos) for (const r of n.ramas) yield* r.recorrer();
  }

  buscar(id) {
    for (const r of this.ramas()) if (r.id === id) return r;
    return null;
  }

  /**
   * Las medidas que usa este plano: cada largo que se mide de una pieza
   * (secciones del tronco y ramas con cm). Los totales (chapa = 1.29 m del
   * conmutador) se arman con sus partes, así que no son entradas propias.
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
      const ahora = s.nodo.ramas[0]?.nombre?.toLowerCase() || "fin";
      suma(s.cm, s.medida, `tronco: ${antes} → ${ahora}`);
      antes = ahora;
    }
    for (const r of this.ramas()) if (r.cm) suma(r.cm, r.medida, r.nombre.toLowerCase());
    return [...m.values()].sort((a, b) => a.cm - b.cm);
  }
}
