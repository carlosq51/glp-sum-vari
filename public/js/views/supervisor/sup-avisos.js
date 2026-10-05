// =========================
// public/js/views/supervisor/sup-avisos.js
// Pestaña AVISOS: el supervisor anuncia al taller por la voz del celular
// (y del parlante que tenga conectado). Suena en el teléfono de quien toca,
// no en otro: la voz y el ding-dong viven en work/llamado-voz.js.
// =========================

import { alternarAviso_, avisoActivo_ } from "../../work/llamado-voz.js";

// Frases fijas en tono de planta: primero a quién va ("todo el personal")
// para que la gente preste atención antes de que llegue la instrucción.
const AVISOS = [
  {
    clave: "LIMPIEZA",
    boton: "🧹 Hora de limpieza",
    texto: "Atención a todo el personal. Inicia la hora de limpieza. " +
      "Ordenar y limpiar su área de trabajo.",
  },
  {
    clave: "REUNION",
    boton: "👥 Reunión",
    texto: "Atención a todo el personal. Presentarse de inmediato en el punto de reunión.",
  },
];

const VECES = 3;

function pintar_(box) {
  box.innerHTML = `
    <div class="supAvisos">
      <div class="small muted">
        Suena por <b>este celular</b> ${VECES} veces y para solo. Tocar de nuevo lo detiene.
        El volumen no se puede subir desde la app: sube al máximo el del celular y el del parlante.
      </div>

      <div class="supAvisosGrid">
        ${AVISOS.map(a => `
          <button type="button" class="supAvisoBtn" data-aviso="${a.clave}">${a.boton}</button>
        `).join("")}
      </div>

      <label class="small" for="supAvisoTexto"><b>Aviso escrito</b></label>
      <textarea id="supAvisoTexto" rows="3" maxlength="300"
        placeholder="Ej.: Técnicos de la zona 3, presentarse en almacén."></textarea>
      <button type="button" class="supAvisoBtn" data-aviso="LIBRE">📢 Anunciar</button>
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

export function bindSupAvisos_() {
  const box = document.getElementById("supAvisosBody");
  if (!box || box.dataset.bound === "1") return;
  box.dataset.bound = "1";
  pintar_(box);

  // El aviso tiene que arrancar dentro del toque: el navegador no deja
  // sonar una página fuera de uno.
  box.addEventListener("click", (e) => {
    const b = e.target.closest(".supAvisoBtn[data-aviso]");
    if (!b) return;
    const clave = b.dataset.aviso;

    if (clave === "LIBRE") {
      const texto = document.getElementById("supAvisoTexto")?.value || "";
      if (!texto.trim() && !avisoActivo_(clave)) return;
      alternarAviso_(clave, { texto, etiqueta: "Aviso escrito", veces: VECES });
      return;
    }

    const a = AVISOS.find(x => x.clave === clave);
    if (a) alternarAviso_(clave, { texto: a.texto, etiqueta: a.boton, veces: VECES });
  });

  document.addEventListener("glp:voz-cambio", () => marcar_(box));
}
