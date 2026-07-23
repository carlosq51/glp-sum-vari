// =========================
// public/js/views/conversion/mi-inventario.js
// Vista SOLO LECTURA del inventario de herramientas del técnico.
// El técnico consulta qué se le entregó; no edita nada.
// =========================
import { CORE } from "../../core/core.js";
import { supabaseGet } from "../../core/supabase-client.js";

const ESTADOS = ["OK", "FALTA", "MAL", "NO_STOCK"];
const ESTADO_LABEL = { OK: "OK", FALTA: "Falta", MAL: "Malo", NO_STOCK: "No stock" };
const ESTADO_CLASS = { OK: "adminBadgeOk", FALTA: "adminBadgeWarn", MAL: "adminBadgeDanger", NO_STOCK: "adminBadgeMuted" };

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Resuelve el user_id del técnico logueado (perfil en memoria o por email).
async function resolverUserId_() {
  const p = CORE.state.currentProfile;
  if (p?.id) return p.id;
  const email = String(document.getElementById("email")?.value || p?.email || "").trim().toLowerCase();
  if (!email) return null;
  try {
    const rows = await supabaseGet("usuarios", { email });
    return rows?.[0]?.id || null;
  } catch { return null; }
}

/**
 * Carga y pinta el inventario del técnico en el contenedor dado.
 * @param {string} containerId  id del div contenedor (ej: "tecInventarioContent")
 */
export async function loadMiInventario_(containerId = "tecInventarioContent") {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = `<div class="small muted">Cargando tu inventario…</div>`;

  const userId = await resolverUserId_();
  if (!userId) {
    box.innerHTML = `<div class="small muted">No se pudo identificar tu usuario.</div>`;
    return;
  }

  let inv, items = [], catalogo = [];
  try {
    const invs = await supabaseGet("inventario_tecnico", { user_id: userId });
    inv = invs?.[0] || null;
    if (!inv) {
      box.innerHTML = `
        <div class="invVacio">
          <div class="invVacioIcon">🧰</div>
          <div class="invVacioTitle">Aún no tienes inventario registrado</div>
          <div class="small muted">Cuando el administrador cargue tus herramientas, aparecerán aquí.</div>
        </div>`;
      return;
    }
    [items, catalogo] = await Promise.all([
      supabaseGet("inventario_tecnico_items", { inventario_id: inv.id }),
      supabaseGet("herramientas_catalogo"),
    ]);
  } catch (e) {
    box.innerHTML = `<div class="small" style="color:var(--danger);">${esc(e.message)}</div>`;
    return;
  }

  const catMap = new Map((catalogo || []).map(h => [h.id, h.nombre]));
  items.sort((a, b) => (a.orden || 0) - (b.orden || 0));

  const nombreItem = it =>
    (it.herramienta_id && catMap.get(it.herramienta_id)) || it.descripcion_libre || "—";

  const conteo = ESTADOS.reduce((acc, e) => {
    acc[e] = items.filter(it => it.estado === e).length; return acc;
  }, {});

  const filas = items.map(it => `
    <tr>
      <td>${esc(nombreItem(it))}</td>
      <td>${esc(it.marca || "—")}</td>
      <td style="text-align:center;">${it.cantidad ?? 1}</td>
      <td><span class="adminBadge ${ESTADO_CLASS[it.estado] || ""}">${esc(ESTADO_LABEL[it.estado] || it.estado)}</span></td>
    </tr>`).join("");

  box.innerHTML = `
    <div class="small muted" style="margin-bottom:8px;">
      Formato <strong>${inv.formato === "ANTIGUO" ? "Antiguo" : "Nuevo"}</strong>
      ${inv.fecha_entrega ? ` · entregado ${esc(inv.fecha_entrega)}` : ""}
      ${inv.tomado_por ? ` · tomado por ${esc(inv.tomado_por)}` : ""}
    </div>

    <div class="invResumen">
      <span class="invResumenChip">Total <strong>${items.length}</strong></span>
      ${ESTADOS.map(e => `<span class="invResumenChip">${ESTADO_LABEL[e]} <strong>${conteo[e]}</strong></span>`).join("")}
    </div>

    ${(conteo.FALTA + conteo.MAL) > 0 ? `
      <div class="invAvisoFalta">
        ⚠️ Tienes <strong>${conteo.FALTA + conteo.MAL}</strong> herramienta(s) marcada(s) como falta/mal.
        Si ya no es así, avisa al administrador para actualizar tu hoja.
      </div>` : ""}

    <div class="adminTableScroll" style="margin-top:10px;">
      <table class="adminTable">
        <thead><tr><th>Herramienta</th><th>Marca</th><th>Cant.</th><th>Estado</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="4" class="small muted" style="padding:12px;">Tu hoja está vacía.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}
