// =========================
// public/js/views/zonas/zonas-despacho.js
// Los dos puestos de un carro —delantero y tanquero— dentro de la hoja de la
// zona, en el mapa que el admin ya tiene abierto.
//
// Por qué vive aquí y no solo en la consola de despacho:
//
// La consola (public/despacho-admin.html) es una pantalla aparte con su propio
// mapa, su propia lista de técnicos y su propio login. Para mover a alguien de
// carro había que salir de la app, entrar ahí, encontrar OTRA VEZ la misma zona
// que acababas de tocar, y hacerlo todo en un ancho pensado para el monitor del
// taller. En un celular, en piso, eso es media docena de toques y dos pantallas
// para un cambio de treinta segundos.
//
// El mapa de zonas ya es el sitio donde se mira el taller y donde ya se asigna
// y se libera el CARRO. Que los TÉCNICOS de ese carro se toquen en la misma
// hoja es la continuación obvia: un solo lugar, una sola idea de "esta plaza".
//
// La consola no desaparece: sigue siendo la pantalla del taller (duplas,
// carros sin plaza, la cola entera) y se enlaza desde aquí. Lo que deja de ser
// obligatorio es ir hasta ella para un gesto de un toque.
// =========================

import { CORE, escapeHtml, postJSON } from "../../core/core.js";

const ROL_LABEL = { MOTOR: "Delantero", TANQUE: "Tanquero" };

const ESTADO_OT = {
  SIN_INICIAR: "sin arrancar",
  TRABAJANDO:  "trabajando",
  PAUSADO:     "en pausa",
  FINALIZADO:  "terminó ✓",
};

/** Minutos de pausa que ofrece la hoja. Los mismos que la consola. */
const PAUSAS_MIN = [5, 10, 15, 0];

/**
 * La consola completa, para lo que no cabe en una hoja (duplas, cola, carros
 * sin plaza). Es la ruta de Express, no el archivo: en producción se sirve
 * `dist/` y ahí el .html no existe — solo lo lee el handler de /despacho.
 */
export const CONSOLA_DESPACHO = "/despacho";

function email_() {
  return String(CORE.state.currentProfile?.email
    || document.getElementById("email")?.value || "").trim().toLowerCase();
}

/**
 * ¿Este usuario puede mover técnicos?
 *
 * Mismo criterio que el servidor (requireRol_("SUPERVISOR","ADMIN") en todos
 * los endpoints que usa esta hoja). Aquí solo decide si SE PINTA: la barrera
 * real está en el servidor, y si algún día cambia allá, esto de más o de menos
 * solo enseña u oculta botones que igual serían rechazados.
 */
export function puedeDespachar_() {
  const rol = String(CORE.state.currentProfile?.rol || "").toUpperCase();
  return rol === "ADMIN" || rol === "SUPERVISOR";
}

// ─── Datos ───────────────────────────────────────────────────────────────────

/**
 * El panel del despacho, del que esta hoja usa dos cosas: los puestos del carro
 * abierto y la lista de técnicos para el desplegable.
 *
 * Se pide SOLO al abrir la hoja, nunca en bucle: el servidor lo sirve cacheado
 * por topics (ver armarPanelDespacho_), así que abrir la hoja diez veces no son
 * diez rondas de consultas a Supabase — pero el mapa se refresca cada pocos
 * segundos y colgarlo de ahí sí lo sería.
 */
async function cargarPanel_({ fresco = false } = {}) {
  // Tras una acción se pide FRESCO: el panel se sirve cacheado unos segundos y
  // quien acaba de mover a alguien tiene que ver su propio cambio, no la foto
  // de antes. El resto de aperturas van por caché, que es lo que evita treinta
  // consultas a Supabase por cada toque en el mapa.
  const r = await fetch(`/api/despacho/panel?email=${encodeURIComponent(email_())}${
    fresco ? "&fresh=1" : ""}`);
  // 503 = el taller tiene el despacho apagado (DESPACHO_MODO=OFF). No es un
  // error del que abrió la hoja: es que aquí no se reparte por el motor, y lo
  // correcto es no enseñar nada en vez de un cartel rojo en cada plaza.
  if (r.status === 503) return null;
  const d = await r.json().catch(() => null);
  if (!d?.ok) throw new Error(d?.error || "No se pudo leer el despacho");
  return d;
}

/** El carro de esta zona dentro del panel, con sus dos puestos resueltos. */
function carroDePanel_(panel, { zonaId, vin }) {
  const donde = [...(panel.zonas || []), ...(panel.sinZona || [])];
  return (vin && donde.find(z => z.vin === vin))
      || donde.find(z => z.zona_id === zonaId)
      || null;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function opcionesTecnicos_(tecnicos, rol) {
  const encaja = t => t.especialidad === rol || t.especialidad === "AMBOS";
  const opt = t => `<option value="${escapeHtml(t.user_id)}">${escapeHtml(t.nombre)} · ${
    escapeHtml(t.estado === "DISPONIBLE" ? "libre" : String(t.estado || "").toLowerCase())
  }</option>`;

  // Los libres primero: es a quien se busca el 90% de las veces, y en un
  // desplegable de celular lo que no está arriba no se ve.
  const propios = (tecnicos || []).filter(encaja)
    .sort((a, b) => (a.estado === "DISPONIBLE" ? 0 : 1) - (b.estado === "DISPONIBLE" ? 0 : 1));
  const otros = (tecnicos || []).filter(t => !encaja(t));

  return `<optgroup label="${escapeHtml(ROL_LABEL[rol])}">${propios.map(opt).join("")}</optgroup>` +
    (otros.length ? `<optgroup label="Otras especialidades">${otros.map(opt).join("")}</optgroup>` : "");
}

function puestoHTML_(carro, tecnicos, rol) {
  const p = carro?.puestos?.[rol] || null;

  if (!p) {
    return `
      <div class="zdPuesto zdPuesto--libre" data-rol="${rol}">
        <div class="zdPuestoTop">
          <span class="zdRol zdRol--${rol}">${escapeHtml(ROL_LABEL[rol])}</span>
          <span class="zdNombre zdNombre--libre">Puesto vacío</span>
        </div>
        <div class="zdForm">
          <select class="zdSelect" data-sel="${rol}">${opcionesTecnicos_(tecnicos, rol)}</select>
          <button class="zdBtn zdBtn--pri" type="button" data-poner="${rol}">Poner</button>
        </div>
      </div>`;
  }

  const estado = ESTADO_OT[p.estadoOt] || (p.asignacionId ? "" : "publicado");

  // El ayudante se PONE desde la consola (allá viven juntos los dos tipos de
  // dupla y es un solo sitio donde decidirlo). Aquí queda el cartel y el
  // quitar: sacar a alguien es un gesto que se hace mirando el carro.
  const ayuda = p.ayudante ? `
    <div class="zdAyuda">
      <span>🤝 ${escapeHtml(p.ayudante.nombre || "—")}
        <span class="zdNota">${p.ayudante.manual ? "puesto a mano" : "automático"}</span></span>
      <button class="zdBtn zdBtn--rev" type="button" data-ayuda-quitar="${rol}">Quitar apoyo</button>
    </div>` : "";

  const pausas = (p.asignacionId && !p.terminado) ? `
    <div class="zdPausas">
      ${p.pausado
        ? `<button class="zdBtn zdBtn--pri" type="button" data-reanudar="${escapeHtml(p.asignacionId)}">▶ Reanudar</button>
           <span class="zdNota">${escapeHtml(p.pausaTxt || "en pausa")}</span>`
        : `<span class="zdNota">Pausar:</span>` + PAUSAS_MIN.map(m => `
            <button class="zdBtn" type="button" data-pausa="${escapeHtml(p.asignacionId)}" data-min="${m}">
              ${m ? `${m} min` : "Indefinida"}
            </button>`).join("")}
    </div>` : "";

  return `
    <div class="zdPuesto" data-rol="${rol}">
      <div class="zdPuestoTop">
        <span class="zdRol zdRol--${rol}">${escapeHtml(ROL_LABEL[rol])}</span>
        <span class="zdNombre">${escapeHtml(p.nombre || "—")}</span>
        ${estado ? `<span class="zdEstado">${escapeHtml(estado)}</span>` : ""}
      </div>
      ${p.razon ? `<div class="zdRazon">${escapeHtml(p.razon)}</div>` : ""}
      <div class="zdAcciones">
        <button class="zdBtn" type="button" data-cambiar="${rol}">Cambiar</button>
        <button class="zdBtn zdBtn--rev" type="button" data-quitar="${rol}">Quitar</button>
      </div>
      ${ayuda}
      ${pausas}
    </div>`;
}

// ─── Acciones ────────────────────────────────────────────────────────────────

async function conBoton_(btn, accion) {
  const texto = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    return await accion();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texto; }
  }
}

/**
 * Quitar a alguien que YA arrancó el carro no puede ser un toque suelto: el
 * servidor contesta 409 pidiendo confirmación y solo entonces se reenvía con
 * `forzar`. El texto del 409 lo escribe el servidor porque es el que sabe qué
 * se está a punto de deshacer.
 */
async function quitarPuesto_(vin, rol, { confirmar } = {}) {
  let d = await postJSON("/api/despacho/puesto/liberar", { email: email_(), vin, rol });
  if (!d?.ok && d?.requiereForzar) {
    if (!(await confirmar(d.error || "¿Seguro?"))) return { ok: true, cancelado: true };
    d = await postJSON("/api/despacho/puesto/liberar", { email: email_(), vin, rol, forzar: true });
  }
  if (!d?.ok) throw new Error(d?.error || "No se pudo quitar");
  return d;
}

/**
 * Cambiar de técnico SIN soltar el puesto: el carro no vuelve a la cola y nadie
 * más se lo puede llevar entre medias. Si ya hay OT se reasigna la asignación
 * real; si solo había una propuesta del motor, se rehace.
 */
async function cambiarPuesto_(carro, rol, nuevoUserId) {
  const p = carro?.puestos?.[rol];
  if (p?.asignacionId) {
    const r = await fetch(`/api/admin/asignaciones/${encodeURIComponent(p.asignacionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-email": email_() },
      body: JSON.stringify({ user_id: nuevoUserId, email: email_() }),
    });
    const d = await r.json().catch(() => null);
    if (!d?.ok) throw new Error(d?.error || "No se pudo cambiar");
    return d;
  }

  await quitarPuesto_(carro.vin, rol, { confirmar: async () => true });
  const d = await postJSON("/api/despacho/asignar-manual", {
    email: email_(), vin: carro.vin, rol, userId: nuevoUserId,
    zonaId: carro.zona_id === 16 ? null : carro.zona_id,
  });
  if (!d?.ok) throw new Error(d?.error || "No se pudo cambiar");
  return d;
}

// ─── Montaje ─────────────────────────────────────────────────────────────────

/**
 * Pinta los puestos del carro dentro de `contenedor` y deja todo cableado.
 *
 * @param {HTMLElement} contenedor  el hueco que la hoja de zona dejó para esto
 * @param {{zonaId:number, vin:string}} zona
 * @param {{onCambio:Function, confirmar:Function, error:Function}} cbs
 */
export async function montarPuestos_(contenedor, zona, cbs = {}, fresco = false) {
  if (!contenedor) return;
  const { onCambio, confirmar, error } = cbs;

  contenedor.innerHTML = `<div class="zdCargando small muted">Cargando técnicos…</div>`;

  let panel;
  try {
    panel = await cargarPanel_({ fresco });
    if (!panel) { contenedor.innerHTML = ""; return; }   // despacho apagado
  } catch (e) {
    // Que falle el despacho no puede romper la hoja: asignar y liberar el
    // CARRO son otras rutas y tienen que seguir funcionando.
    contenedor.innerHTML = `<div class="zdError small">${escapeHtml(e?.message || "Sin despacho")}</div>`;
    return;
  }

  const carro = carroDePanel_(panel, zona);
  if (!carro?.vin) {
    contenedor.innerHTML = "";
    return;
  }

  const repintar = async () => {
    await montarPuestos_(contenedor, { zonaId: zona.zonaId, vin: carro.vin }, cbs, true);
    if (onCambio) await onCambio();
  };

  const avisar = (msg) => {
    if (error) error(msg);
    else contenedor.querySelector(".zdError")?.replaceChildren(document.createTextNode(msg));
  };

  const ambos = carro.puestos?.MOTOR && carro.puestos?.TANQUE;

  contenedor.innerHTML = `
    <div class="zdTitulo">Técnicos del carro</div>
    ${puestoHTML_(carro, panel.tecnicos, "MOTOR")}
    ${puestoHTML_(carro, panel.tecnicos, "TANQUE")}
    ${ambos ? `<button class="zdBtn zdBtn--rev zdBtn--ancho" type="button" data-quitar-ambos="1">
        Quitar a los dos</button>` : ""}
    <div class="zdError small"></div>`;

  const correr = (btn, fn) => conBoton_(btn, async () => {
    try {
      await fn();
      await repintar();
    } catch (e) {
      avisar(e?.message || "No se pudo");
    }
  });

  contenedor.querySelectorAll("[data-poner]").forEach(btn => {
    btn.onclick = () => correr(btn, async () => {
      const rol = btn.dataset.poner;
      const userId = contenedor.querySelector(`[data-sel="${rol}"]`)?.value;
      if (!userId) throw new Error("Elige un técnico");
      const d = await postJSON("/api/despacho/asignar-manual", {
        email: email_(), vin: carro.vin, rol, userId,
        zonaId: carro.zona_id === 16 ? null : carro.zona_id,
      });
      if (!d?.ok) throw new Error(d?.error || "No se pudo asignar");
    });
  });

  contenedor.querySelectorAll("[data-quitar]").forEach(btn => {
    btn.onclick = () => correr(btn, () =>
      quitarPuesto_(carro.vin, btn.dataset.quitar, { confirmar }));
  });

  const btnAmbos = contenedor.querySelector("[data-quitar-ambos]");
  if (btnAmbos) {
    btnAmbos.onclick = () => correr(btnAmbos, async () => {
      await quitarPuesto_(carro.vin, "MOTOR", { confirmar });
      await quitarPuesto_(carro.vin, "TANQUE", { confirmar });
    });
  }

  contenedor.querySelectorAll("[data-cambiar]").forEach(btn => {
    btn.onclick = () => {
      const rol = btn.dataset.cambiar;
      const caja = contenedor.querySelector(`.zdPuesto[data-rol="${rol}"]`);
      if (!caja || caja.querySelector(".zdForm")) return;

      // El desplegable aparece DENTRO del puesto, no en otra pantalla: se ve a
      // quién se reemplaza mientras se elige el reemplazo.
      const form = document.createElement("div");
      form.className = "zdForm";
      form.innerHTML = `
        <select class="zdSelect">${opcionesTecnicos_(panel.tecnicos, rol)}</select>
        <button class="zdBtn zdBtn--pri" type="button">Confirmar</button>`;
      caja.appendChild(form);

      const ok = form.querySelector("button");
      ok.onclick = () => correr(ok, () =>
        cambiarPuesto_(carro, rol, form.querySelector("select").value));
    };
  });

  contenedor.querySelectorAll("[data-ayuda-quitar]").forEach(btn => {
    btn.onclick = () => correr(btn, async () => {
      const d = await postJSON("/api/despacho/ayudante/quitar",
        { email: email_(), vin: carro.vin, rol: btn.dataset.ayudaQuitar });
      if (!d?.ok) throw new Error(d?.error || "No se pudo quitar el apoyo");
    });
  });

  contenedor.querySelectorAll("[data-pausa]").forEach(btn => {
    btn.onclick = () => correr(btn, async () => {
      const d = await postJSON("/api/despacho/pausa-ot", {
        email: email_(), asignacionId: btn.dataset.pausa, minutos: Number(btn.dataset.min),
      });
      if (!d?.ok) throw new Error(d?.error || "No se pudo pausar");
    });
  });

  contenedor.querySelectorAll("[data-reanudar]").forEach(btn => {
    btn.onclick = () => correr(btn, async () => {
      const d = await postJSON("/api/despacho/reanudar-ot",
        { email: email_(), asignacionId: btn.dataset.reanudar });
      if (!d?.ok) throw new Error(d?.error || "No se pudo reanudar");
    });
  });
}
