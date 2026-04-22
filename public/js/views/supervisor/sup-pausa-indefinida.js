// =========================
// public/js/views/supervisor/sup-pausa-indefinida.js
// Permite al supervisor pausar indefinidamente la OT de un técnico específico.
// Funciona para CONVERSION (MOTOR/TANQUE), CALIDAD y RAMALERO.
// =========================

// Nota interna que se guarda en last_nota para que el tick del técnico
// reconozca que fue una pausa de supervisor y no dispare el auto-resume.
export const SUP_PAUSA_NOTA = "__SUP_PAUSA_INDEFINIDA";

let _getJSON_user = null;

export function bindSupPausaIndefinida_({ getJSON_user }) {
  _getJSON_user = getJSON_user;

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sup-pausa]");
    if (!btn) return;

    const email  = btn.dataset.email  || "";
    const vin    = btn.dataset.vin    || "";
    const rol    = btn.dataset.rol    || "";
    const cid    = btn.dataset.cid    || "";
    const who    = btn.dataset.who    || "Técnico";
    const estado = btn.dataset.estado || "";

    if (!email || !rol) return;

    // Ya está pausado — no hacer nada
    if (String(estado).toUpperCase() === "PAUSADO") return;

    const label = vin ? `${who} (${rol} · VIN ${vin})` : `${who} (${rol})`;
    if (!confirm(`¿Pausar indefinidamente la OT de ${label}?\n\nEl técnico deberá reanudarla manualmente.`)) return;

    btn.disabled = true;
    btn.textContent = "Pausando…";

    try {
      const body = { email, vin, rolTrabajo: rol, accion: "PAUSA", nota: SUP_PAUSA_NOTA };
      if (!vin && cid) body.conversionId = cid; // RAMALERO sin VIN

      const r = await fetch("/api/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(res => res.json());

      if (r?.ok) {
        btn.textContent = "✓ Pausado";
        btn.style.opacity = "0.5";
      } else {
        alert(`Error al pausar: ${r?.error || "desconocido"}`);
        btn.disabled = false;
        btn.textContent = "⏸ Pausa indefinida";
      }
    } catch (err) {
      alert(`Error de red: ${err.message}`);
      btn.disabled = false;
      btn.textContent = "⏸ Pausa indefinida";
    }
  });
}
