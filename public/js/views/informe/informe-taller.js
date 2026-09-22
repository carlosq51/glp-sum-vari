// =========================
// public/js/views/informe/informe-taller.js
// Página /informe-taller: el técnico llena UN formulario y salen las TRES
// hojas que hoy rellena a mano — Informe de Taller, Lista de Chequeo y
// Registro de Producción — listas para imprimir de un solo tirón.
//
// La vista previa se redibuja en cada tecla a propósito: el técnico ve los
// tres papeles exactos ANTES de gastarlos. Formulario y hojas nunca pueden
// discrepar porque las tres salen del mismo objeto de datos.
// =========================

import { informeHojaHtml, informeTallerPageHtml, DETALLE_TAREAS } from "../../templates/views/informe-taller-view.js";
import { hojaChequeoHtml } from "../../templates/views/hoja-chequeo-view.js";
import { hojaProduccionHtml } from "../../templates/views/hoja-produccion-view.js";
import { getJSON, postJSON } from "../../core/api.js";
import { CORE } from "../../core/state.js";

const $ = (id) => document.getElementById(id);
const val = (id) => ($(id)?.value || "").trim();

let montado_ = false;

// Hora en que se pidió la impresión, "HH:MM". Rellena las horas de fin que
// el técnico dejó en blanco. Vacía hasta que se imprime por primera vez.
let horaImpresion_ = "";

// Informe que se está revisando, cuando se llega desde la cola con
// /informe-taller?id=… . Null si alguien abrió la página en blanco para
// llenarla a mano en la oficina.
let informeId_ = null;

/** ISO → "HH:MM", que es lo que acepta un <input type="time">. */
function horaDe_(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ISO → "aaaa-mm-dd", que es lo que acepta un <input type="date">. */
function isoDe_(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** dd-mm-aa — el formato del Registro de Tiempos, que tiene poco ancho. */
function fechaCorta_(iso) {
  const larga = fechaPeru_(iso);
  return larga ? larga.slice(0, 6) + larga.slice(-2) : "";
}

/** dd-mm-aaaa, que es como se escribe la fecha en estas hojas. */
function fechaPeru_(iso) {
  // Acepta "aaaa-mm-dd" (lo que da un <input type="date">) y un ISO
  // completo con hora, que es como vienen las fechas del sistema.
  const d = !iso ? new Date()
    : /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Lee el formulario una sola vez y de ahí salen las tres hojas. */
function datos_() {
  const tareas = DETALLE_TAREAS
    .map((_, i) => i)
    .filter(i => document.querySelector(`[data-it-tarea="${i}"]`)?.checked);

  const tecnicos = [val("itTec1"), val("itTec2")].filter(Boolean);

  return {
    marca: val("itMarca") || "JETOUR",
    modelo: val("itModelo") || "X70",
    ot: val("itOt"),
    // La placa y el VIN siempre en mayúsculas: en el papel se leen de un
    // vistazo y evita que dos informes del mismo carro parezcan distintos.
    placa: val("itPlaca").toUpperCase(),
    vin: val("itVin").toUpperCase(),
    trabajo: $("itTrabajo")?.value || "CONVERSION",
    tareas,
    observaciones: $("itObs")?.value || "",
    tecnicos,
    tanquero: val("itTanquero"),
    bateria: { v: val("itBatV"), ai: val("itBatAi"), af: val("itBatAf") },
    cilindros: [val("itCil1"), val("itCil2"), val("itCil3"), val("itCil4")],
    // Una entrada por persona: el técnico 1, el 2 y el tanquero. Cada uno
    // con SU fecha, SUS horas y las etapas que hizo.
    prod: ["itP1", "itP2", "itP3"].map((p, i) => ({
      nombre: [val("itTec1"), val("itTec2"), val("itTanquero")][i],
      fecha: val(`${p}Fecha`),
      inicio: val(`${p}Ini`),
      fin: val(`${p}Fin`),
      marcas: Object.fromEntries(
        [...document.querySelectorAll(`[data-it-etapa^="${p}:"]`)]
          .filter(el => el.checked)
          .map(el => [el.dataset.itEtapa.split(":")[1], true])
      ),
    })).filter(x => x.nombre),
  };
}

function pintarHojas_() {
  const host = $("itHojas");
  if (!host) return;
  const d = datos_();

  // La hora final que quedó en blanco se estampa con el momento de imprimir:
  // el último en terminar es precisamente el que viene a la oficina por el
  // papel, así que esa ES su hora de fin. Mientras no se imprima va vacía.
  const filasProd = d.prod.map(p => ({
    ...p,
    // En el Registro de Tiempos la fecha va en DD-MM-AA: su columna es
    // estrecha y con el año de cuatro cifras el texto se salía.
    fecha: fechaCorta_(p.fecha),
    fin: p.fin || horaImpresion_,
  }));

  // Los bloques de producción muestran el nombre real en cuanto se escribe,
  // para no tener que adivinar cuál de los tres se está llenando.
  ["itP1", "itP2", "itP3"].forEach((p, i) => {
    const nombre = [val("itTec1"), val("itTec2"), val("itTanquero")][i];
    const rotulo = ["Técnico 1", "Técnico 2", "Tanquero"][i];
    const el = $(`${p}Nom`);
    if (el) el.textContent = nombre ? `${rotulo} — ${nombre}` : rotulo;
  });

  host.innerHTML =
    informeHojaHtml(d) +
    hojaChequeoHtml({
      fecha: fechaPeru_(),
      marcados: chequeoMarcados_,
      vin: d.vin,
      marca: d.marca,
      modelo: d.modelo,
      tecnicos: d.tecnicos,
      bateria: d.bateria,
      cilindros: d.cilindros,
      tanquero: d.tanquero,
    }) +
    hojaProduccionHtml({ ot: d.ot, filas: filasProd });
}

function imprimir_() {
  // Sin OT ni placa los papeles no sirven: mejor avisar que gastar 3 hojas.
  const d = datos_();
  if (!d.ot || !d.placa) {
    alert("Falta la OT o la placa.");
    ($("itOt")?.value.trim() ? $("itPlaca") : $("itOt"))?.focus();
    return;
  }
  // Se sella AQUÍ, no al cargar la página: si se sellara antes, un formulario
  // abierto desde la mañana imprimiría una hora que ya pasó.
  const ahora = new Date();
  horaImpresion_ = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;

  pintarHojas_();
  window.print();

  // Sale de la cola. Se marca DESPUÉS de abrir el diálogo: si se marcara
  // antes y la impresión fallara, el informe habría desaparecido de la
  // oficina sin que nadie tenga el papel.
  marcarImpreso_();
}

/** Guarda las correcciones y saca el informe de la cola. */
async function marcarImpreso_() {
  if (!informeId_) return;                 // formulario suelto, no viene de la cola
  const email = CORE.state.currentProfile?.email || CORE.state.email || "";
  try {
    // Primero lo corregido, por si la oficina cambió algo antes de imprimir.
    await postJSON(`/api/informes/${informeId_}/guardar`, {
      email,
      placa: val("itPlaca").toUpperCase(),
      datos: { ...datos_(), marcados: chequeoMarcados_ },
    });
  } catch (err) {
    console.warn("[informe] no se pudo guardar antes de imprimir:", err.message);
  }
  try {
    await postJSON(`/api/informes/${informeId_}/impreso`, { email });
  } catch (err) {
    alert("El papel salió, pero no pude marcarlo como impreso: " + String(err?.message || err));
  }
}

/**
 * Vuelca en el formulario lo que mandó el técnico. Es el paso que convierte
 * la cola en algo útil: en la oficina no se vuelve a teclear nada, solo se
 * corrige lo que venga mal.
 */
function volcar_(d = {}) {
  const set = (id, v) => { const el = $(id); if (el && v != null) el.value = String(v); };

  set("itOt", d.ot);
  set("itPlaca", d.placa);
  set("itVin", d.vin);
  set("itMarca", d.marca || "JETOUR");
  set("itModelo", d.modelo || "X70");
  set("itTrabajo", d.trabajo || "CONVERSION");
  set("itObs", d.observaciones);
  set("itTanquero", d.tanquero);
  set("itBatV", d.bateria?.v);
  set("itBatAi", d.bateria?.ai);
  set("itBatAf", d.bateria?.af);
  (d.cilindros || []).forEach((c, i) => set(`itCil${i + 1}`, c));

  // El técnico manda su nombre; el segundo y el tanquero los completa la
  // oficina, que es quien sabe con quién hizo dupla.
  set("itTec1", (d.tecnicos || [])[0]);
  set("itTec2", (d.tecnicos || [])[1]);
  if (d.tanquero && !val("itTec2")) set("itTanquero", d.tanquero);

  // Las tareas del informe: marcadas las que mandó, desmarcadas las demás.
  if (Array.isArray(d.tareas)) {
    document.querySelectorAll("[data-it-tarea]").forEach(el => {
      el.checked = d.tareas.includes(Number(el.dataset.itTarea));
    });
  }
  // Los tiempos de producción. SIN ESTO no salían: llegaban del servidor
  // dentro de `prod` y se tiraban, porque las hojas se pintan leyendo el
  // formulario y nadie los escribía en él.
  //
  // El orden de `prod` es delantero, tanquero — el mismo que los bloques
  // itP1/itP2 del formulario.
  (d.prod || []).forEach((persona, i) => {
    const campo = ["itP1", "itP2", "itP3"][i];
    if (!campo) return;
    set(`${campo}Fecha`, isoDe_(persona.inicio));
    set(`${campo}Ini`, horaDe_(persona.inicio));
    set(`${campo}Fin`, horaDe_(persona.fin));
    // Las etapas que marcó cada uno.
    for (const [k, on] of Object.entries(persona.marcas || {})) {
      const cb = document.querySelector(`[data-it-etapa="${campo}:${k}"]`);
      if (cb) cb.checked = !!on;
    }
  });

  // Los puntos del chequeo viajan aparte: el formulario de la oficina no
  // los muestra uno a uno, así que se guardan para pintarlos en la hoja.
  if (Array.isArray(d.marcados)) chequeoMarcados_ = d.marcados;
}

// Puntos del chequeo que marcó el técnico. Null = todos, que es el valor
// por defecto de la hoja cuando nadie ha dicho lo contrario.
let chequeoMarcados_ = null;

/** Carga un informe de la cola y lo vuelca en el formulario. */
async function cargarInforme_(id) {
  const email = CORE.state.currentProfile?.email || CORE.state.email || "";
  const r = await getJSON(`/api/informes/${id}?email=${encodeURIComponent(email)}`);
  if (!r?.ok) throw new Error(r?.error || "No se pudo cargar el informe.");
  informeId_ = id;
  // Se usa `plano`, no `datos`: el servidor ya unió las dos mitades (la del
  // delantero y la del tanquero). Repetir esa unión aquí sería tener la
  // misma regla en dos sitios, y tarde o temprano una de las dos cambia.
  volcar_(r.plano || {});
  if ((r.plano?.faltan || []).length) {
    const quien = r.plano.faltan.map(x => x === "MOTOR" ? "el delantero" : "el tanquero").join(" y ");
    alert(`Ojo: este informe está incompleto, falta la parte de ${quien}.

Puedes completarlo a mano e imprimirlo igual.`);
  }
  pintarHojas_();
}

/** Monta la página dentro del contenedor que le den. */
export function renderInformeTaller(host) {
  if (!host) return;
  host.innerHTML = informeTallerPageHtml();

  // Las fechas arrancan en hoy: es lo que el técnico va a poner el 99% de
  // las veces, y así no tiene que abrir el calendario tres veces.
  const iso = new Date().toISOString().slice(0, 10);
  for (const p of ["itP1", "itP2", "itP3"]) {
    const el = $(`${p}Fecha`);
    if (el && !el.value) el.value = iso;
  }

  if (!montado_) {
    // Un solo listener en el contenedor en vez de uno por campo: el HTML se
    // regenera en cada montaje y los listeners individuales se perderían.
    host.addEventListener("input", pintarHojas_);
    host.addEventListener("change", pintarHojas_);
    host.addEventListener("click", (e) => {
      if (e.target.closest("#itPrint")) imprimir_();
      if (e.target.closest("#itBack")) window.location.href = "/";
    });
    montado_ = true;
  }

  pintarHojas_();

  // Si se llega desde la cola (/informe-taller?id=…), se carga lo que mandó
  // el técnico. Sin id, la página queda en blanco para llenarla a mano.
  const id = new URLSearchParams(location.search).get("id");
  if (id) {
    cargarInforme_(id).catch(err => {
      alert("No se pudo cargar el informe: " + String(err?.message || err));
    });
  }
}
