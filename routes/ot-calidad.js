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
//                                 técnico registró, la OT que ya tenga y
//                                 quiénes lo convirtieron.
//   · POST /api/ot-calidad        el inspector pone la OT, confirma que el
//                                 tanque y el reductor coinciden y aprueba.
//
// Al aprobar se guarda la fila en ot_calidad y el #OT en la OT de
// CONVERSION (work_orders.numero_ot): Salida deja de pedirlo a la hoja. La
// hoja ASIGNACIONES la escribe Apps Script (subirOtsCalidadAsignaciones_ en
// REPORTE_PRINCIPAL): toma las filas con hoja_at vacío y pone la OT, la
// fecha y los técnicos en la fila del VIN.
// =========================

import { Router } from "express";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { getUsuarioByEmail_, padron_ } from "../lib/authz.js";
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

const fmtFecha_ = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });
const hoyLima_ = () => fmtFecha_.format(Date.now());

/**
 * La OT como se escribe en ASIGNACIONES: solo dígitos, con o sin "#".
 * Es la regla de isValidOT_GAS_ (la de Apps Script), más estricta que la de
 * lib/utils.js: lo que no pase aquí, la hoja no lo sube a Supabase.
 */
export function limpiarOt_(raw) {
  const s = s_(raw).replace(/\s+/g, "");
  return /^#?\d{1,10}$/.test(s) ? s : "";
}


/** Primer nombre, como va en la columna TECNICOS de ASIGNACIONES. */
const primerNombre_ = (n) => s_(n).split(/\s+/)[0] || "";

/**
 * Todo lo del carro que el modal enseña. La OT de CONVERSION más reciente
 * del VIN y, de sus asignaciones, la última de cada rol (puede haber
 * reasignaciones: firma quien la cerró, que es la más reciente).
 */
async function datosCarro_(vin) {
  const v = encodeURIComponent(vin);
  const [vins, wos, previas] = await Promise.all([
    sb_(`vins?select=vin,modelo,tanque_asignado,reductor_asignado&vin=eq.${v}&limit=1`),
    sb_(`work_orders?select=id,numero_ot,estado_general,tanque_registrado,reductor_registrado`
      + `&tipo_ot=eq.CONVERSION&vin=eq.${v}&order=fecha_creacion.desc&limit=1`),
    sb_(`${TABLA}?select=*&vin=eq.${v}&limit=1`),
  ]);
  const wo = wos?.[0] || null;

  let delantero = "", tanquero = "";
  if (wo) {
    const [asgs, p] = await Promise.all([
      sb_(`asignaciones?select=rol_trabajo,user_id,updated_at&work_order_id=eq.${wo.id}&order=updated_at.desc`),
      padron_(),
    ]);
    for (const a of asgs || []) {
      const rol = s_(a.rol_trabajo).toUpperCase();
      const nombre = p.porId.get(a.user_id)?.nombre || "";
      if (!nombre) continue;
      if (rol === "MOTOR" && !delantero) delantero = nombre;
      if ((rol === "TANQUE" || rol === "TANQUERO") && !tanquero) tanquero = nombre;
    }
  }

  return {
    vehiculo: vins?.[0] || null,
    wo,
    delantero,
    tanquero,
    tecnicos: [primerNombre_(delantero), primerNombre_(tanquero)].filter(Boolean).join(" - "),
    previa: previas?.[0] || null,
  };
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
      estadoConversion: s_(d.wo?.estado_general),
      delantero: d.delantero,
      tanquero: d.tanquero,
      tecnicos: d.tecnicos,
      hoy: hoyLima_(),
      aprobada: d.previa,
    });
  } catch (err) {
    console.error("[ot-calidad] GET:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/ot-calidad — { email, vin, numero_ot, tanque_ok, reductor_ok }
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

    const d = await datosCarro_(vin);
    if (!d.vehiculo) return res.status(404).json({ ok: false, error: `El VIN ${vin} no está en el padrón de carros.` });
    if (!d.wo) return res.status(422).json({ ok: false, error: "Este carro no tiene OT de conversión en el sistema." });

    // Verificar es comparar con el equipo virtual. Sin equipo virtual no
    // hay contra qué comparar: que la oficina lo asigne primero.
    const tanqueV = s_(d.vehiculo.tanque_asignado);
    const reductorV = s_(d.vehiculo.reductor_asignado);
    const faltan = [!tanqueV && "tanque", !reductorV && "reductor"].filter(Boolean);
    if (faltan.length) {
      return res.status(422).json({ ok: false, error: `El carro no tiene ${faltan.join(" ni ")} virtual asignado en ASIGNACIONES. Que la oficina lo asigne antes de aprobar.` });
    }
    if (req.body?.tanque_ok !== true || req.body?.reductor_ok !== true) {
      return res.status(422).json({ ok: false, error: "Para aprobar tienes que confirmar que el tanque y el reductor coinciden. Si no coinciden, registra la falla." });
    }

    // La misma OT en dos carros es un error de tipeo casi seguro.
    const otra = await sb_(`${TABLA}?select=vin&numero_ot=in.(${encodeURIComponent(ot.replace(/^#/, ""))},${encodeURIComponent("#" + ot.replace(/^#/, ""))})&vin=neq.${encodeURIComponent(vin)}&limit=1`);
    if (otra?.[0]) {
      return res.status(409).json({ ok: false, error: `La OT ${ot} ya está registrada en el carro ${otra[0].vin}. Revisa el número.` });
    }

    const fila = {
      vin,
      work_order_id: d.wo.id,
      numero_ot: ot,
      tanque_virtual: tanqueV,
      reductor_virtual: reductorV,
      tanque_ok: true,
      reductor_ok: true,
      tecnicos: d.tecnicos,
      fecha_aprobacion: hoyLima_(),
      aprobado_por: u.email,
      aprobado_por_user_id: u.id || null,
      // Corregirla la vuelve a poner en la cola de Apps Script.
      hoja_at: null,
      hoja_error: null,
    };
    const guardadas = await sb_(`${TABLA}?on_conflict=vin`, {
      method: "POST", body: fila, prefer: "resolution=merge-duplicates,return=representation",
    });

    // El #OT en la OT de conversión: Salida (movilizador) lo exige y ya no
    // tiene que esperar a que alguien lo escriba en la hoja.
    await sb_(`work_orders?tipo_ot=eq.CONVERSION&vin=eq.${encodeURIComponent(vin)}`, {
      method: "PATCH", body: { numero_ot: ot }, prefer: "return=minimal",
    });

    emitEvent_("ot-calidad", { accion: d.previa ? "corregida" : "aprobada", vin });
    emitEvent_("work_orders", { accion: "OT_CALIDAD", id: d.wo.id, vin });
    res.json({ ok: true, yaEstaba: !!d.previa, fila: Array.isArray(guardadas) ? guardadas[0] : guardadas });
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
