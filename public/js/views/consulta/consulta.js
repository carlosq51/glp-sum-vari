// =========================
// public/js/views/consulta/consulta.js
// Vista CONSULTA DE VIN
//
// El mismo veredicto que ve PDI en /invitado, más el detrás: en qué zona está
// el carro, quién trabajó cada etapa y cuánto tardó.
//
// El detalle (nombres y tiempos) es solo para SUPERVISOR y ADMIN. El resto ve
// el veredicto, la zona y la ficha del carro. Ojo: el filtro es de cliente —
// este servidor no autentica ninguna ruta, aquí ni en admin. Esconde la
// información, no la protege.
// =========================

import { CORE, escapeHtml, fmtShort_, getJSON, postJSON, createVinSuggest_ } from "../../core/core.js";
import { createScanner } from "../../core/qr-scanner.js";

// Sobre el modal compartido #qrModal, igual que conversión y supervisor: cada
// vista trae su propia instancia y abre solo cuando su módulo está delante.
const _scanner = createScanner("qrReader");

/** ¿El usuario puede ver nombres y tiempos? */
function puedeVerDetalle_() {
  const rol = String(CORE.state.currentProfile?.rol || "").toUpperCase();
  if (rol === "SUPERVISOR" || rol === "ADMIN") return true;
  // Quien tiene el módulo concedido manda sobre el rol: hay supervisores
  // dados de alta como TECNICO con los módulos abiertos a mano.
  const mods = (CORE.state.currentProfile?.modulos || [])
    .map(m => String(m || "").toUpperCase());
  return mods.includes("ADMIN") || mods.includes("SUPERVISOR") || mods.includes("ALL");
}

function aviso_(msg, esError) {
  const el = document.getElementById("cqAviso");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("error", !!esError);
}

/** "2 h 15 min" — los ms crudos no le dicen nada a nadie. */
function dur_(ms) {
  const min = Math.round((Number(ms) || 0) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")} min`;
}

const ETIQUETA_ROL = {
  MOTOR: "Motor", TANQUE: "Tanque", CALIDAD: "Calidad",
  RAMALERO: "Ramal", MOVILIZADOR: "Movilizador",
};

const ETIQUETA_ESTADO = {
  SIN_INICIAR: "Sin iniciar", TRABAJANDO: "Trabajando",
  PAUSADO: "Pausado", FINALIZADO: "Terminado",
};

/**
 * La línea de debajo del veredicto: el dato que hace falta para actuar
 * sobre ESE veredicto, y no sobre los otros.
 *
 * Cada estado tiene una pregunta distinta y una sola:
 *   EN PROCESO      · ¿dónde está el carro para ir a verlo?
 *   FALTA GLP       · ¿ha llegado siquiera al área? ¿desde cuándo?
 *   FALTA REVISIÓN  · ¿cuánto lleva esperando a calidad?
 *   GLP COMPLETO    · ¿cuándo se cerró? (es lo que se apunta en el acta)
 *
 * Deliberadamente NO se contestan todas a la vez: la ficha ya tiene los
 * paneles con todo, y esta línea existe para que no haya que abrirlos.
 *
 * `compacto` es para las filas de la lista. Son cuarenta y entran en un
 * móvil de 360 px: ahí la frase explicativa no cabe y, al envolver, tapaba
 * la fila de al lado. El dato es el mismo, sin el porqué — que lo cuenta la
 * ficha al abrirla.
 */
function contextoVeredicto_(d, compacto) {
  const z = d.zona, h = d.hitos || {};
  const zona = z ? `📍 ${escapeHtml(z.nombre)}` : "";
  const zonaDesde = z ? `${zona} · desde ${fmtShort_(z.desde)}` : "";

  switch (d.veredicto) {
    case "EN_PROCESO":
      // Sin zona no se puede ir a buscarlo, y eso es una incidencia en sí:
      // alguien lo está trabajando en un sitio que nadie registró.
      if (compacto) return zona || "📍 Sin zona";
      return zonaDesde || "📍 Sin zona registrada — se está trabajando sin ubicación";

    case "FALTA_GLP":
      // La pregunta real aquí no es "¿falta?" sino "¿está el carro?". Un
      // FALTA GLP sin registro de zona es un carro que todavía no ha
      // entrado al área; con registro, uno que entró y está parado.
      if (z) return compacto ? zona : `${zonaDesde} · esperando conversión`;
      if (d.movilizador?.ingreso_at) {
        return compacto
          ? `🚚 Taller ${fmtShort_(d.movilizador.ingreso_at)}`
          : `🚚 Ingresó al taller ${fmtShort_(d.movilizador.ingreso_at)} · sin registro en zona de gas`;
      }
      return compacto
        ? "⛔ Sin zona de gas"
        : "⛔ Sin registro en zona de gas — el carro no ha entrado al área";

    case "FALTA_CALIDAD":
      if (!h.conversion_fin) return compacto ? zona : zonaDesde;
      return compacto
        ? `🔧 ${fmtShort_(h.conversion_fin)}${zona ? ` · ${zona}` : ""}`
        : `🔧 Conversión terminada ${fmtShort_(h.conversion_fin)}${zonaDesde ? ` · ${zonaDesde}` : ""}`;

    case "LISTO":
      // Las dos fechas, y en este orden: la de calidad es la que cierra el
      // carro, la de conversión explica cuánto tardó el visto bueno. En la
      // fila solo la de calidad: es la que se apunta.
      if (compacto) return h.calidad_fin ? `🔍 ${fmtShort_(h.calidad_fin)}` : "";
      return [
        h.calidad_fin    ? `🔍 Revisión técnica ${fmtShort_(h.calidad_fin)}` : "",
        h.conversion_fin ? `🔧 Conversión ${fmtShort_(h.conversion_fin)}`    : "",
      ].filter(Boolean).join(" · ");

    default:
      return compacto ? zona : zonaDesde;
  }
}

/**
 * El estado de una etapa, en un icono.
 *
 * En la ficha caben los chips con su texto; en una fila de la lista no. Con
 * cuarenta carros, escribir "Conversión: No iniciada · Revisión: No iniciada"
 * en cada una es una pared de texto idéntico donde lo único que cambia —el
 * estado— se pierde. Aquí el color ES el dato y el icono dice de qué etapa
 * habla. La leyenda de arriba lo traduce una vez para toda la lista.
 *
 * `title` va igualmente: en escritorio el hover lo cuenta sin leyenda, y los
 * lectores de pantalla no ven colores.
 */
function semaforo_(icono, nombre, etiqueta, tono) {
  return `<span class="cqPunto cqPunto--${tono || "sin"}" title="${escapeHtml(nombre)}: ${
    escapeHtml(etiqueta)}">${icono}</span>`;
}

/**
 * Chip de una etapa, pintado según en qué punto está.
 *
 * El tono lo decide el servidor (`etapas_tono`), no esta función: el texto y
 * el color salen del mismo sitio y no pueden desmentirse. Si la respuesta es
 * vieja y no trae el campo, el chip sale neutro como siempre.
 */
function chipEtapa_(icono, nombre, etiqueta, tono) {
  const clase = tono ? ` cqChip--${tono}` : "";
  return `<span class="cqChip${clase}">${icono} ${nombre}: ${escapeHtml(etiqueta)}</span>`;
}

/**
 * Chip de planificación.
 *
 * Tres respuestas, y la tercera importa: `null` es "no se pudo consultar la
 * lista". Ahí no se enseña nada, porque decir "no planificado" cuando no se
 * sabe frenaría un carro que sí se podía trabajar.
 */
function chipListaDiaria_(enLista) {
  if (enLista === true)  return `<span class="cqChip cqChip--listo">📋 En lista diaria</span>`;
  if (enLista === false) return `<span class="cqChip cqChip--alerta">⛔ Fuera de lista diaria · sin equipos asignados</span>`;
  return "";
}

// ─── Consulta ─────────────────────────────────────────────────────────

// Dónde se engancha la ficha al abrirse.
//
// En la plantilla, #cqResultado va DESPUÉS de #cqResultadoLista. Con 40
// carros pegados eso ponía la ficha al final de todo: se pulsaba una fila y
// la página saltaba al fondo, sin nada alrededor que dijera cuál de los 40
// se había abierto. Ahora la ficha se mueve justo debajo de la fila pulsada
// y vuelve a su sitio cuando se consulta un VIN suelto.
let _anclaFicha = null;

async function consultar_(vinCrudo, ancla) {
  _anclaFicha = ancla || null;
  const vin = String(vinCrudo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (vin.length < 11) {
    aviso_("Escriba o escanee un VIN completo.", true);
    return;
  }
  aviso_("Consultando…");
  try {
    const d = await getJSON(`/api/vin/ficha/${encodeURIComponent(vin)}`);
    if (!d?.ok) throw new Error(d?.error || "No se pudo consultar.");
    pintar_(d);
    aviso_("");
  } catch (e) {
    aviso_(e.message || "Sin conexión. Intente de nuevo.", true);
  }
}

function pintar_(d) {
  document.getElementById("cqRVin").textContent    = d.vin || "";
  document.getElementById("cqTitulo").textContent  = d.titulo || "";
  document.getElementById("cqDetalle").textContent = d.detalle || "";
  document.getElementById("cqVeredicto").className = "cqVeredicto " + (d.tono || "duda");
  // innerHTML y no textContent: el texto trae emojis y nombres de zona ya
  // escapados por contextoVeredicto_. Nada de aquí viene sin pasar por
  // escapeHtml.
  document.getElementById("cqContexto").innerHTML = contextoVeredicto_(d);

  // Chips: lo que se lee de un vistazo.
  //
  // La planificación va primero, delante incluso de la zona, porque manda
  // sobre el veredicto: un "FALTA GLP" de un carro que no está en la lista
  // diaria no es una orden de trabajarlo — es un carro sin equipos asignados
  // que hay que dejar en paz hasta que almacén los traiga.
  const chips = [];
  const lista = chipListaDiaria_(d.lista_diaria);
  if (lista) chips.push(lista);
  if (d.zona) chips.push(`<span class="cqChip cqChip--zona">📍 ${escapeHtml(d.zona.nombre)}</span>`);
  const tonos = d.etapas_tono || {};
  chips.push(chipEtapa_("🔧", "Conversión", d.etapas.conversion, tonos.conversion));
  chips.push(chipEtapa_("🔍", "Revisión",   d.etapas.calidad,    tonos.calidad));
  document.getElementById("cqChips").innerHTML = chips.join("");

  const f = d.ficha;
  document.getElementById("cqFicha").innerHTML = f ? `
    <div class="cqFichaGrid">
      ${f.modelo    ? `<span>Modelo</span><b>${escapeHtml(f.modelo)}</b>` : ""}
      ${f.cliente   ? `<span>Cliente</span><b>${escapeHtml(f.cliente)}</b>` : ""}
      ${f.tanque    ? `<span>Tanque</span><b>${escapeHtml(f.tanque)}</b>` : ""}
      ${f.reductor  ? `<span>Reductor</span><b>${escapeHtml(f.reductor)}</b>` : ""}
      ${f.ubicacion ? `<span>Ubicación</span><b>${escapeHtml(f.ubicacion)}</b>` : ""}
    </div>` : "";

  document.getElementById("cqDetalleBloque").innerHTML =
    puedeVerDetalle_() ? detalleHtml_(d) : "";

  const box = document.getElementById("cqResultado");
  // El nodo se mueve, no se duplica: es el mismo <div> de la plantilla, con
  // sus ids. Si la fila ya no está en el DOM (se volvió a consultar la
  // lista), la ficha regresa al final, que es su sitio en la plantilla.
  if (_anclaFicha?.isConnected) _anclaFicha.insertAdjacentElement("afterend", box);
  else document.getElementById("viewCONSULTA")?.appendChild(box);

  box.style.display = "block";
  // Anclada bajo su fila, "nearest" apenas mueve la página: la fila pulsada
  // sigue a la vista, que es justo lo que faltaba.
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function detalleHtml_(d) {
  const bloques = [];

  if (d.zona) {
    // Cerrado: la zona y su fecha ya están en los chips de arriba. Este
    // panel solo añade quién la registró, que casi nunca es la pregunta.
    bloques.push(panel_("Ubicación en el taller", `
      <div class="cqLinea">
        <b>${escapeHtml(d.zona.nombre)}</b>
        <span>desde ${fmtShort_(d.zona.desde)}${d.zona.por ? ` · por ${escapeHtml(d.zona.por)}` : ""}</span>
      </div>`, false));
  }

  // Las OTs vienen ordenadas por fecha descendente: la primera es la que
  // dice quién tiene el carro hoy, y es la única que se abre sola.
  let primeraOt = true;
  for (const ot of (d.ots || [])) {
    const trabajos = (ot.trabajos || []).length
      ? ot.trabajos.map(t => `
          <div class="cqTrabajo${t.anulada ? " anulada" : ""}">
            <span class="cqRol">${escapeHtml(ETIQUETA_ROL[t.rol] || t.rol)}</span>
            <span class="cqQuien">${escapeHtml(t.usuario)}</span>
            <span class="cqCuando">${escapeHtml(ETIQUETA_ESTADO[t.estado] || t.estado)} · ${dur_(t.tiempo_ms)}</span>
            <span class="cqFecha">${fmtShort_(t.actualizado)}</span>
            ${t.anulada ? `<span class="cqAnulada">asignación anulada</span>` : ""}
          </div>`).join("")
      : `<div class="cqVacio">Sin técnicos asignados todavía.</div>`;

    bloques.push(panel_(
      `OT de ${ot.tipo === "CONVERSION" ? "conversión" : ot.tipo.toLowerCase()}` +
      (ot.numero ? ` · #${escapeHtml(ot.numero)}` : ""),
      `<div class="cqLinea"><b>${escapeHtml(ot.estado)}</b><span>creada ${fmtShort_(ot.fecha)}</span></div>
       ${trabajos}
       ${ot.nota ? `<div class="cqNota">${escapeHtml(ot.nota)}</div>` : ""}`,
      primeraOt
    ));
    primeraOt = false;
  }

  const m = d.movilizador;
  if (m) {
    bloques.push(panel_("Movilizador", `
      ${m.ingreso_at ? `<div class="cqLinea"><b>Ingreso</b><span>${fmtShort_(m.ingreso_at)}${m.ingreso_por ? ` · ${escapeHtml(m.ingreso_por)}` : ""}</span></div>` : ""}
      ${m.salida_at  ? `<div class="cqLinea"><b>Entrega</b><span>${fmtShort_(m.salida_at)}${m.salida_por ? ` · ${escapeHtml(m.salida_por)}` : ""}</span></div>` : ""}
      <div class="cqLinea"><b>Estado</b><span>${escapeHtml(m.estado)}</span></div>`, false));
  }

  if (!bloques.length) {
    return `<div class="cqVacio" style="margin-top:10px;">Este carro no tiene todavía ningún movimiento registrado.</div>`;
  }
  return bloques.join("");
}

/**
 * Panel plegable.
 *
 * Antes nacían TODOS abiertos. Dentro de la lista eso era media pantalla de
 * ficha metida entre dos filas —zona, las dos OTs con sus técnicos y el
 * movilizador— y para ver el siguiente carro había que desplazarse a ciegas.
 *
 * Ahora solo se abre el que contesta la pregunta con la que se entra: la OT
 * más reciente, que es quién tiene el carro ahora. El resto está a un toque.
 */
function panel_(titulo, cuerpo, abierto) {
  return `
    <details class="cqPanel"${abierto ? " open" : ""}>
      <summary>${titulo}</summary>
      <div class="cqPanelBody">${cuerpo}</div>
    </details>`;
}

// ─── Modo lista ───────────────────────────────────────────────────────

/** Devuelve la ficha al final de la vista, que es su sitio en la plantilla. */
function devolverFicha_() {
  _anclaFicha = null;
  const box = document.getElementById("cqResultado");
  const vista = document.getElementById("viewCONSULTA");
  if (box && vista) { box.style.display = "none"; vista.appendChild(box); }
}

function setModo_(modo) {
  const uno = modo === "uno";
  devolverFicha_();
  document.getElementById("cqBloqueUno").style.display    = uno ? "flex" : "none";
  document.getElementById("cqBloqueLista").style.display  = uno ? "none" : "grid";
  document.getElementById("cqResultado").style.display    = "none";
  document.getElementById("cqResultadoLista").style.display = "none";
  document.getElementById("btnCqModoUno").classList.toggle("activo", uno);
  document.getElementById("btnCqModoLista").classList.toggle("activo", !uno);
  aviso_("");
  if (!uno) cerrarQr_();
}

/**
 * Trocea por todo lo que no sea alfanumérico: da igual si la lista viene de
 * un Excel (tabulaciones), de un correo (comas, viñetas) o con cabecera. El
 * servidor descarta lo que no sea un VIN y lo devuelve aparte.
 */
function extraerVins_(texto) {
  return String(texto || "").split(/[^A-Za-z0-9]+/).map(t => t.toUpperCase()).filter(Boolean);
}

/**
 * El orden de la lista, por veredicto y no por tono.
 *
 * Antes ordenaba por color, y eso metía EN PROCESO y FALTA REVISIÓN en el
 * mismo saco (los dos son `warn`), mezclados entre sí. Son dos cosas
 * distintas de hacer: uno se está trabajando ahora y el otro está parado
 * esperando a calidad.
 *
 * El orden es el del recorrido del carro por el taller, de lo más lejos de
 * salir a lo más cerca. Quien pega cuarenta carros lee de arriba abajo y
 * para cuando deja de haber trabajo pendiente.
 */
const ORDEN_VEREDICTO = {
  FALTA_GLP:     0,   // ni ha empezado
  EN_PROCESO:    1,   // alguien lo tiene ahora
  FALTA_CALIDAD: 2,   // convertido, esperando el visto bueno
  LISTO:         3,   // puede salir
  NO_FIGURA:     4,   // no está en el padrón: hay que confirmarlo aparte
  DELEGADO:      5,   // se convierte en otra sede
  ANULADO:       6,   // ya no lleva GLP
};
// Red de seguridad por si aparece un veredicto nuevo sin pasar por aquí:
// cae al final por su color en vez de colarse arriba con un 0.
const ORDEN_TONO = { danger: 0, warn: 1, duda: 2, ok: 3 };
const orden_ = r => ORDEN_VEREDICTO[r.veredicto] ?? (10 + (ORDEN_TONO[r.tono] ?? 9));

async function consultarLista_() {
  const vins = extraerVins_(document.getElementById("cqVinsLista").value);
  if (!vins.length) { aviso_("Pegue al menos un VIN.", true); return; }

  aviso_(`Consultando ${vins.length}…`);
  const btn = document.getElementById("btnCqLista");
  if (btn) btn.disabled = true;
  try {
    // No /api/invitado/lote: aquél es el público y devuelve solo el
    // veredicto. Aquí hace falta zona, fechas y planificación en la propia
    // fila, para no tener que abrir 40 fichas.
    const d = await postJSON("/api/vin/lote", { vins });
    if (!d?.ok) throw new Error(d?.error || "No se pudo consultar.");
    pintarLista_(d);
    aviso_("");
  } catch (e) {
    aviso_(e.message || "Sin conexión. Intente de nuevo.", true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function pintarLista_(d) {
  // Dentro del mismo veredicto manda el VIN, para que dos consultas de la
  // misma lista salgan en el mismo orden y se puedan comparar de un vistazo.
  const filas = (d.resultados || []).slice().sort(
    (a, b) => orden_(a) - orden_(b) || String(a.vin).localeCompare(String(b.vin)));

  let html = `
    <div class="cqResumen">
      <div class="cqResTile malo"><span class="cqResNum">${d.frenan}</span><span class="cqResLbl">NO PUEDEN SALIR</span></div>
      <div class="cqResTile duda"><span class="cqResNum">${d.dudosos}</span><span class="cqResLbl">POR CONFIRMAR</span></div>
      <div class="cqResTile bueno"><span class="cqResNum">${d.pueden}</span><span class="cqResLbl">PUEDEN SALIR</span></div>
    </div>`;

  // Los iconos de cada fila no se explican solos, y en un móvil no hay hover
  // que los cuente. Una leyenda para las cuarenta filas ocupa menos que
  // repetir las palabras cuarenta veces.
  html += `
    <div class="cqLeyenda">
      <span><b>🔧</b> Conversión</span>
      <span><b>🔍</b> Revisión</span>
      <span><b>📋</b> Planificado</span>
      <span class="cqLeySep"></span>
      <span><i class="cqPunto cqPunto--sin"></i> Sin iniciar</span>
      <span><i class="cqPunto cqPunto--proceso"></i> En proceso</span>
      <span><i class="cqPunto cqPunto--listo"></i> Terminado</span>
      <span><i class="cqPunto cqPunto--alerta"></i> Atención</span>
    </div>`;

  if (d.invalidos?.length) {
    html += `<div class="cqVacio">No se consultaron (${d.invalidos.length}): no parecen VIN — ${
      d.invalidos.map(escapeHtml).join(", ")}</div>`;
  }

  // Cada fila lleva ya lo que antes obligaba a abrirla: en qué punto están
  // las dos etapas, dónde está el carro o cuándo se cerró, y si está
  // planificado. Con 40 carros pegados, abrir uno por uno para eso eran 40
  // clics y 40 consultas.
  //
  // Sigue abriendo la ficha al pulsarla: ahí están los nombres de los
  // técnicos y los tiempos, que es otra pregunta y no cabe en una fila.
  html += filas.map(r => {
    const tonos = r.etapas_tono || {};
    const ctx = contextoVeredicto_(r, true);
    const plan = r.lista_diaria === true  ? semaforo_("📋", "Planificación", "En lista diaria", "listo")
               : r.lista_diaria === false ? semaforo_("📋", "Planificación", "Fuera de lista diaria — sin equipos asignados", "alerta")
               : "";
    return `
    <button class="cqFila ${r.tono}" data-cq-vin="${escapeHtml(r.vin)}" type="button">
      <span class="cqFilaTop">
        <span class="cqFilaVin">${escapeHtml(r.vin)}</span>
        <span class="cqFilaTit">${escapeHtml(r.titulo)}</span>
      </span>
      <span class="cqFilaEstado">
        ${semaforo_("🔧", "Conversión", r.etapas.conversion, tonos.conversion)}
        ${semaforo_("🔍", "Revisión",   r.etapas.calidad,    tonos.calidad)}
        ${plan}
        ${ctx ? `<span class="cqFilaCtx">${ctx}</span>` : ""}
      </span>
    </button>`;
  }).join("");

  // Repintar la lista destruye la fila que anclaba la ficha. Se devuelve
  // ANTES de vaciar el contenedor: si no, el <div> de la ficha se iría con
  // el innerHTML y la vista se quedaría sin sus ids para siempre.
  devolverFicha_();

  const box = document.getElementById("cqResultadoLista");
  box.innerHTML = html;
  box.style.display = "block";
}

// ─── QR ───────────────────────────────────────────────────────────────

async function abrirQr_() {
  document.getElementById("qrModal")?.classList?.add("show");
  try {
    await _scanner.start({
      mode: "QR",
      msgEl: document.getElementById("qrMsg"),
      onDecoded: async (code) => {
        await cerrarQr_();
        const inp = document.getElementById("cqVin");
        if (inp) inp.value = String(code || "").toUpperCase();
        consultar_(code);
      },
    });
  } catch { /* el propio scanner ya pintó el error en msgEl */ }
}

async function cerrarQr_() {
  document.getElementById("qrModal")?.classList?.remove("show");
  await _scanner.stop();
}

// ─── API pública ──────────────────────────────────────────────────────

export function init() {
  // Escribir 17 caracteres a mano no tiene sentido: el autocompletado
  // resuelve con 3 o 4, que es como se busca un carro de verdad.
  createVinSuggest_({
    input: "cqVin", box: "cqVinSuggest",
    min: 1, debounce: 220, limit: 12,
    onPick: item => {
      const inp = document.getElementById("cqVin");
      if (inp) inp.value = item.vin;
      consultar_(item.vin);
    },
  }).bind();

  document.getElementById("cqVin")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); consultar_(e.target.value); }
  });
  // Un lector Bluetooth escribe el VIN de golpe y no siempre manda Enter.
  document.getElementById("cqVin")?.addEventListener("input", e => {
    const v = String(e.target.value || "").replace(/[^A-Za-z0-9]/g, "");
    if (v.length === 17) consultar_(v);
  });

  // Modo
  document.getElementById("btnCqModoUno")?.addEventListener("click", () => setModo_("uno"));
  document.getElementById("btnCqModoLista")?.addEventListener("click", () => setModo_("lista"));
  document.getElementById("btnCqLista")?.addEventListener("click", () => consultarLista_());

  // De una fila de la lista a la ficha completa, sin reescribir el VIN.
  // NO se cambia de modo: la ficha se abre bajo la fila pulsada y la lista
  // se queda, para ir mirando uno por uno los que fallan sin volver a
  // pegarla.
  document.getElementById("cqResultadoLista")?.addEventListener("click", e => {
    const fila = e.target.closest("[data-cq-vin]");
    if (!fila) return;

    // Segundo toque en la MISMA fila: se cierra. Faltaba esa salida — una
    // vez abierta una ficha no había forma de quitarla de en medio, y con
    // cuarenta carros eso deja la lista partida por un bloque que ya no
    // interesa.
    if (fila.classList.contains("abierta")) {
      fila.classList.remove("abierta");
      devolverFicha_();
      fila.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    for (const otra of document.querySelectorAll(".cqFila.abierta")) otra.classList.remove("abierta");
    fila.classList.add("abierta");
    const inp = document.getElementById("cqVin");
    if (inp) inp.value = fila.dataset.cqVin;
    consultar_(fila.dataset.cqVin, fila);
  });

  // QR sobre el modal compartido #qrModal. El guard de módulo es obligatorio:
  // conversión y supervisor enganchan sus propios handlers al MISMO botón de
  // cerrar, así que sin él un clic en cualquiera de esas vistas pararía este
  // escáner (y al revés).
  document.getElementById("btnCqQr")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "CONSULTA") return;
    abrirQr_().catch(() => {});
  });
  document.getElementById("btnCloseQR")?.addEventListener("click", () => {
    if (CORE.state.currentModule !== "CONSULTA") return;
    cerrarQr_().catch(() => {});
  });
  document.getElementById("qrModal")?.addEventListener("click", e => {
    if (CORE.state.currentModule !== "CONSULTA") return;
    if (e.target === e.currentTarget) cerrarQr_().catch(() => {});
  });
}

export function enter() {
  setModo_("uno");
  document.getElementById("cqVin")?.focus();
}

export function exit() {
  cerrarQr_().catch(() => {});
}
