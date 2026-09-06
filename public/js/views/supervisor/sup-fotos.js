// =========================
// public/js/views/supervisor/sup-fotos.js
// Abre las fotos de un VIN desde el reporte del supervisor.
//
// Las fotos que sube el técnico —compresión, soldadura, eléctrico— solo se
// podían ver desde el módulo de CALIDAD, y solo mientras el carro estaba en
// inspección. Al revisar el reporte, que es cuando se pregunta "¿este carro
// quedó bien?", no había forma de mirarlas: había que saber el VIN, entrar por
// otra vista y buscarlo a mano.
//
// Usa el mismo visor que calidad (core/fotos-vin.js): la pregunta es la misma,
// y dos visores distintos acabarían enseñando cosas distintas.
// =========================

import { cargarFotosVin_, htmlFotosVin_, asegurarEstilosFotos_ } from "../../core/fotos-vin.js";

const MODAL_ID = "supFotosModal";

function cerrar_() {
  document.getElementById(MODAL_ID)?.remove();
}

function abrir_(vin) {
  cerrar_();
  asegurarEstilosFotos_();

  const el = document.createElement("div");
  el.id = MODAL_ID;
  el.style.cssText = `
    position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.72);
    display:flex; align-items:flex-end; justify-content:center;`;
  el.innerHTML = `
    <div style="background:var(--surface,#1e232b); color:var(--text,#e9eaec);
                width:100%; max-width:780px; max-height:88vh; overflow-y:auto;
                border-radius:16px 16px 0 0; padding:16px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
        <div style="font-weight:900; font-size:15px;">📸 Fotos · ${vin}</div>
        <button type="button" id="supFotosClose"
          style="margin-left:auto; border:0; background:transparent; color:inherit;
                 font-size:24px; line-height:1; cursor:pointer; padding:0 6px;">×</button>
      </div>
      <div id="supFotosBody" class="small" style="opacity:.7; padding:18px 0; text-align:center;">
        Cargando fotos…
      </div>
    </div>`;

  document.body.appendChild(el);
  el.querySelector("#supFotosClose")?.addEventListener("click", cerrar_);
  // Cerrar tocando el fondo, no el contenido: en el celular del supervisor el
  // botón de cerrar queda arriba y la mano está abajo.
  el.addEventListener("click", (ev) => { if (ev.target === el) cerrar_(); });

  return el;
}

export function bindSupFotos_() {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sup-fotos]");
    if (!btn) return;

    const vin = String(btn.dataset.vin || "").trim().toUpperCase();
    if (!vin || vin === "-") return;

    const modal = abrir_(vin);
    const body = modal.querySelector("#supFotosBody");
    try {
      const datos = await cargarFotosVin_(vin);
      // El modal pudo cerrarse mientras cargaba: sin esta comprobación se
      // escribiría sobre un nodo que ya no está en el documento.
      if (!document.getElementById(MODAL_ID)) return;
      body.style.opacity = "1";
      body.style.padding = "0";
      body.style.textAlign = "left";
      body.innerHTML = htmlFotosVin_(datos);
    } catch (err) {
      if (body) body.textContent = "No se pudieron cargar las fotos.";
      console.warn("[supFotos]", err);
    }
  });
}
