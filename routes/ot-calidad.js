// =========================
// routes/ot-calidad.js
// Registro de OT por Calidad.
//
// Requiere `supabase/migrations/015_ot-calidad.sql`.
//
// EL FLUJO
// ────────
//   · GET  /api/ot-calidad?vin=   lo que el modal necesita: el equipo virtual
//                                 (tanque/reductor asignados), lo que el
//                                 técnico registró y la OT que ya tenga.
//   · POST /api/ot-calidad        el inspector pone la OT y dice, por cada
//                                 equipo, si coincide o no con el virtual.
//
// Las dos coinciden → APROBADA: el #OT va a la OT de CONVERSION
// (work_orders.numero_ot) y Apps Script (subirOtsCalidadAsignaciones en
// REPORTE_PRINCIPAL) lo escribe en la columna E de ASIGNACIONES. Solo la
// OT: fecha, técnicos y estado de la hoja siguen como estaban.
//
// Alguno no coincide → queda guardado así y la OT de CALIDAD del carro no
// se puede cerrar (bloqueoCierreCalidad_, que usa /api/evento) hasta que se
// corrija y se apruebe.
//
// OT repetida (ya la tiene otro carro) → se avisa y solo se guarda si el
// inspector lo confirma (confirmar_repetida).
// =========================

import { Router } from "express";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { getUsuarioByEmail_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";

const router = Router();
const TABLA = "ot_calidad";

const s_ = (v) => String(v ?? "").trim();
const emailDe_ = (req) => s_(req.body?.email || req.query?.email || req.get("x-user-email")).toLowerCase();

async function sb_(path, { method = "GET", body, prefer } = {}) {
  const h = supabaseServiceHeaders_();
  if (!h) throw new Error("Supabase no configurado (.env)");
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: prefer ? { ...h, Prefer: prefer } : h,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}

/**
 * La OT como se escribe en ASIGNACIONES: solo dígitos, con o sin "#".
 * Es la regla de isValidOT_GAS_ (la de Apps Script), más estricta que la de
 * lib/utils.js: lo que no pase aquí, la hoja no lo sube a Supabase.
 */
export function limpiarOt_(raw) {
  const s = s_(raw).replace(/\s+/g, "");
  return /^#?\d{1,10}$/.test(s) ? s : "";
}

/** "9801" y "#9801" son la misma OT. */
const variantesOt_ = (ot) => {
  const n = s_(ot).replace(/^#/, "");
  return [n, `#${n}`];
};

/**
 * Por qué no se puede cerrar la calidad de este carro, o "" si se puede.
 * Solo bloquea un registro guardado con un equipo que no coincide: sin
 * registro, el cierre sigue como siempre. Si la tabla no existe o Supabase
 * falla, no bloquea (una caída no debe dejar a Calidad sin cerrar nada).
 */
export async function bloqueoCierreCalidad_(vin) {
  try {
    const filas = await sb_(`${TABLA}?select=tanque_ok,reductor_ok,tanque_virtual,reductor_virtual&vin=eq.${encodeURIComponent(s_(vin).toUpperCase())}&limit=1`);
    const f = filas?.[0];
    if (!f || (f.tanque_ok && f.reductor_ok)) return "";
    const malos = [!f.tanque_ok && `el TANQUE (${f.tanque_virtual})`, !f.reductor_ok && `el REDUCTOR (${f.reductor_virtual})`].filter(Boolean);
    return `No puedes cerrar: en el Registro de OT ${malos.join(" y ")} no coincide con el equipo virtual. Soluciónalo y vuelve a aprobar el registro (Registro → Registro de OT).`;
  } catch (e) {
    console.warn("[ot-calidad] bloqueoCierre:", e.message);
    return "";
  }
}

async function datosCarro_(vin) {
  const v = encodeURIComponent(vin);
  const [vins, wos, previas] = await Promise.all([
    sb_(`vins?select=vin,modelo,tanque_asignado,reductor_asignado&vin=eq.${v}&limit=1`),
    sb_(`work_orders?select=id,numero_ot,tanque_registrado,reductor_registrado`
      + `&tipo_ot=eq.CONVERSION&vin=eq.${v}&order=fecha_creacion.desc&limit=1`),
    sb_(`${TABLA}?select=*&vin=eq.${v}&limit=1`),
  ]);
  return { vehiculo: vins?.[0] || null, wo: wos?.[0] || null, previa: previas?.[0] || null };
}

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/ot-calidad?vin=
// ─────────────────────────────────────────────────────────────────────────
router.get("/api/ot-calidad", async (req, res) => {
  try {
    const vin = s_(req.query.vin).toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta el VIN del carro." });
    const d = await datosCarro_(vin);
    if (!d.vehiculo) return res.status(404).json({ ok: false, error: `El VIN ${vin} no está en el padrón de carros.` });
    res.json({
      ok: true,
      vin,
      modelo: d.vehiculo.modelo || "",
      tanqueVirtual: s_(d.vehiculo.tanque_asignado),
      reductorVirtual: s_(d.vehiculo.reductor_asignado),
      tanqueRegistrado: s_(d.wo?.tanque_registrado),
      reductorRegistrado: s_(d.wo?.reductor_registrado),
      otActual: s_(d.previa?.numero_ot || d.wo?.numero_ot),
      registro: d.previa,
    });
  } catch (err) {
    console.error("[ot-calidad] GET:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/ot-calidad
//  { email, vin, numero_ot, tanque_ok, reductor_ok, confirmar_repetida }
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/ot-calidad", async (req, res) => {
  try {
    // Cualquiera con cuenta activa, como la hoja CC: el inspector no
    // siempre tiene rol CALIDAD (Uribe es MOTOR con el módulo de calidad).
    const u = await getUsuarioByEmail_(emailDe_(req));
    if (!u?.activo) {
      return res.status(403).json({ ok: false, error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar." });
    }

    const vin = s_(req.body?.vin).toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta el VIN del carro." });

    const ot = limpiarOt_(req.body?.numero_ot);
    if (!ot) return res.status(400).json({ ok: false, error: "El N.º de OT tiene que ser solo números (ej. 9801 o #9801)." });

    const tanqueOk = req.body?.tanque_ok;
    const reductorOk = req.body?.reductor_ok;
    if (typeof tanqueOk !== "boolean" || typeof reductorOk !== "boolean") {
      return res.status(400).json({ ok: false, error: "Marca, para el tanque y el reductor, si coinciden o no." });
    }

    const d = await datosCarro_(vin);
    if (!d.vehiculo) return res.status(404).json({ ok: false, error: `El VIN ${vin} no está en el padrón de carros.` });
    if (!d.wo) return res.status(422).json({ ok: false, error: "Este carro no tiene OT de conversión en el sistema." });

    // Verificar es comparar con el equipo virtual. Sin equipo virtual no
    // hay contra qué comparar: que la oficina lo asigne primero.
    const tanqueV = s_(d.vehiculo.tanque_asignado);
    const reductorV = s_(d.vehiculo.reductor_asignado);
    const faltan = [!tanqueV && "tanque", !reductorV && "reductor"].filter(Boolean);
    if (faltan.length) {
      return res.status(422).json({ ok: false, error: `El carro no tiene ${faltan.join(" ni ")} virtual asignado en ASIGNACIONES. Que la oficina lo asigne antes de registrar.` });
    }

    // La misma OT en otro carro: casi siempre es un error de tipeo, pero
    // puede ser real. Se avisa y se guarda solo si el inspector lo confirma.
    const enLista = variantesOt_(ot).map(encodeURIComponent).join(",");
    const [enOts, enRegistros] = await Promise.all([
      sb_(`work_orders?select=vin&tipo_ot=eq.CONVERSION&numero_ot=in.(${enLista})&vin=neq.${encodeURIComponent(vin)}&limit=3`),
      sb_(`${TABLA}?select=vin&numero_ot=in.(${enLista})&vin=neq.${encodeURIComponent(vin)}&limit=3`),
    ]);
    const otrosVins = [...new Set([...(enOts || []), ...(enRegistros || [])].map(r => r.vin).filter(Boolean))];
    if (otrosVins.length && req.body?.confirmar_repetida !== true) {
      return res.status(409).json({
        ok: false, repetida: true, otrosVins,
        error: `La OT ${ot} ya está registrada en ${otrosVins.length === 1 ? "el carro" : "los carros"} ${otrosVins.join(", ")}.`,
      });
    }

    const aprobada = tanqueOk && reductorOk;
    const fila = {
      vin,
      work_order_id: d.wo.id,
      numero_ot: ot,
      tanque_virtual: tanqueV,
      reductor_virtual: reductorV,
      tanque_ok: tanqueOk,
      reductor_ok: reductorOk,
      ot_repetida_confirmada: otrosVins.length > 0,
      aprobado_por: u.email,
      aprobado_por_user_id: u.id || null,
      // Toda corrección vuelve a la cola de Apps Script (si está aprobada).
      hoja_at: null,
      hoja_error: null,
    };
    const guardadas = await sb_(`${TABLA}?on_conflict=vin`, {
      method: "POST", body: fila, prefer: "resolution=merge-duplicates,return=representation",
    });

    // Solo aprobada pasa el #OT a la OT de conversión (Salida lo exige).
    if (aprobada) {
      await sb_(`work_orders?tipo_ot=eq.CONVERSION&vin=eq.${encodeURIComponent(vin)}`, {
        method: "PATCH", body: { numero_ot: ot }, prefer: "return=minimal",
      });
      emitEvent_("work_orders", { accion: "OT_CALIDAD", id: d.wo.id, vin });
    }
    emitEvent_("ot-calidad", { accion: aprobada ? "aprobada" : "no-coincide", vin });
    res.json({ ok: true, aprobada, yaEstaba: !!d.previa, fila: Array.isArray(guardadas) ? guardadas[0] : guardadas });
  } catch (err) {
    console.error("[ot-calidad] POST:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

/** Si falta la tabla, se dice qué migración correr. */
function mensajeUtil_(err) {
  const m = String(err?.message || err);
  if (/ot_calidad/.test(m) && /does not exist|relation|PGRST205|PGRST204|column/i.test(m)) {
    return "Falta la tabla del registro de OT. Ejecuta supabase/migrations/015_ot-calidad.sql en Supabase.";
  }
  return m;
}

export default router;
