// =========================
// public/js/views/supervisor/sup-avisos.js
// Pestaña AVISOS: el supervisor anuncia al taller por la voz del celular
// (y del parlante que tenga conectado). Suena en el teléfono de quien toca,
// no en otro: la voz y el ding-dong viven en work/llamado-voz.js.
// =========================
//
// Cada aviso se repite hasta volver a tocarlo. Además de los fijos, cada
// supervisor puede guardar sus propias frases como botones. Se guardan en
// localStorage de ESE celular, a propósito: son atajos personales y no
// justifican una tabla en la BD. Si se borran los datos del navegador, se
// pierden.

import { escapeHtml } from "../../core/format.js";
import { alternarAviso_, avisoActivo_ } from "../../work/llamado-voz.js";

const AVISOS_FIJOS = [
  {
    clave: "LIMPIEZA",
    boton: "🧹 Hora de limpieza",
    texto: "Atención. Comenzó la hora de limpieza. " +
      "Delanteros, encargados de la limpieza del taller. " +
      "Tanqueros, encargados del orden de los equipos y la mesa de trabajo.",
  },
  {
    clave: "REUNION",
    boton: "👥 Reunión",
    texto: "Atención a todos los técnicos. Presentarse en el punto de reunión.",
  },
];

const LS_KEY = "glp.avisos.propios";

function leerPropios_() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter(a => a && a.clave && a.texto) : [];
  } catch { return []; }
}

function guardarPropios_(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); return true; }
  catch { return false; }
}

function todos_() {
  return [...AVISOS_FIJOS, ...leerPropios_()];
}

function pintar_(box) {
  const propios = leerPropios_();
  box.innerHTML = `
    <div class="supAvisos">
      <div class="small muted">
        Suena por <b>este celular</b> y se repite hasta volver a tocar el botón.
        El volumen no se puede subir desde la app: sube al máximo el del celular y el del parlante.
      </div>

      <div class="supAvisosGrid">
        ${AVISOS_FIJOS.map(a => `
          <button type="button" class="supAvisoBtn" data-aviso="${a.clave}">${escapeHtml(a.boton)}</button>
        `).join("")}
        ${propios.map(a => `
          <div class="supAvisoPropio">
            <button type="button" class="supAvisoBtn" data-aviso="${escapeHtml(a.clave)}"
              title="${escapeHtml(a.texto)}">${escapeHtml(a.boton)}</button>
            <button type="button" class="supAvisoDel" data-borrar="${escapeHtml(a.clave)}"
              aria-label="Borrar ${escapeHtml(a.boton)}">✕</button>
          </div>
        `).join("")}
      </div>

      <div class="supAvisoNuevo">
        <label class="small" for="supAvisoTexto"><b>Frase</b></label>
        <textarea id="supAvisoTexto" rows="3" maxlength="300"
          placeholder="Ej.: Atención. Técnicos de la zona 3, presentarse en almacén."></textarea>
        <input id="supAvisoNombre" type="text" maxlength="30"
          placeholder="Nombre del botón (opcional)" />
        <div class="supAvisosGrid">
          <button type="button" class="supAvisoBtn" data-aviso="LIBRE">📢 Anunciar</button>
          <button type="button" class="btn3" id="btnSupAvisoGuardar">💾 Guardar como botón</button>
        </div>
        <div class="small muted">Los botones guardados quedan solo en este celular.</div>
      </div>
    </div>
  `;
  marcar_(box);
}

function marcar_(box) {
  box.querySelectorAll(".supAvisoBtn[data-aviso]").forEach((b) => {
    const on = avisoActivo_(b.dataset.aviso);
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function guardarNuevo_(box) {
  const texto = String(document.getElementById("supAvisoTexto")?.value || "").trim();
  if (!texto) return;
  const nombre = String(document.getElementById("supAvisoNombre")?.value || "").trim();
  const boton = nombre || (texto.length > 28 ? texto.slice(0, 27) + "…" : texto);
  const propios = leerPropios_();
  propios.push({ clave: `P_${Date.now().toString(36)}`, boton: `📢 ${boton}`, texto });
  if (!guardarPropios_(propios)) {
    alert("No se pudo guardar en este celular (¿navegación privada?).");
    return;
  }
  pintar_(box);
}

function borrar_(box, clave) {
  const a = leerPropios_().find(x => x.clave === clave);
  if (!a || !confirm(`¿Borrar el botón "${a.boton}"?`)) return;
  if (avisoActivo_(clave)) alternarAviso_(clave);   // que deje de sonar
  guardarPropios_(leerPropios_().filter(x => x.clave !== clave));
  pintar_(box);
}

export function bindSupAvisos_() {
  const box = document.getElementById("supAvisosBody");
  if (!box || box.dataset.bound === "1") return;
  box.dataset.bound = "1";
  pintar_(box);

  // El aviso tiene que arrancar dentro del toque: el navegador no deja
  // sonar una página fuera de uno.
  box.addEventListener("click", (e) => {
    if (e.target.closest("#btnSupAvisoGuardar")) return guardarNuevo_(box);

    const del = e.target.closest(".supAvisoDel[data-borrar]");
    if (del) return borrar_(box, del.dataset.borrar);

    const b = e.target.closest(".supAvisoBtn[data-aviso]");
    if (!b) return;
    const clave = b.dataset.aviso;

    if (clave === "LIBRE") {
      const texto = document.getElementById("supAvisoTexto")?.value || "";
      alternarAviso_(clave, { texto, etiqueta: "Aviso escrito" });
      return;
    }

    const a = todos_().find(x => x.clave === clave);
    if (a) alternarAviso_(clave, { texto: a.texto, etiqueta: a.boton });
  });

  document.addEventListener("glp:voz-cambio", () => marcar_(box));
}
