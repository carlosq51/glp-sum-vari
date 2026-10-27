// =========================
// routes/hojas-calidad.js
// Hojas CONTROL FINAL (la "CC WILMER") que pide el inspector de calidad.
//
// Requiere `supabase/migrations/010_hojas-calidad.sql`.
//
// EL FLUJO
// ────────
//   · GET  /api/hojas-calidad/carro?vin=   modelo del carro para el modal
//   · POST /api/hojas-calidad              el inspector la valida en el
//                                          modal y la pide. Queda PENDIENTE.
//   · GET  /api/hojas-calidad              la oficina ve las pendientes;
//                                          con ?vin= busca para reimprimir
//   · GET  /api/hojas-calidad/hojas?ids=   las hojas como página, para papel
//   · POST /api/hojas-calidad/impresas     salieron: se marcan IMPRESA
//   · POST /api/hojas-calidad/:id/anular   pedida por error
//
// Las marcas salen del modelo del carro (CC_MODELOS) más lo que el
// inspector cambió en el modal (columna marcas). Lo demás propio de cada
// papel es el VIN, el día en que se pidió y quién la pidió (TÉCNICO:).
// =========================

import { Router } from "express";
import { readFileSync } from "node:fs";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { requireRol_, getUsuarioByEmail_, padron_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { normalizeModelo_ } from "../lib/utils.js";
import { hojaCcHtml, modeloCc_, limpiarMarcasCc_, MODELOS_CC_TEXTO } from "../public/js/templates/views/hoja-cc-view.js";
import { escapeHtml } from "../public/js/core/format.js";

const router = Router();
const TABLA = "hojas_calidad";
// `marcas` entra solo donde se pinta el papel: la lista no la necesita.
const CAMPOS = "id,vin,estado,solicitado_por,created_at,impresa_at,impresa_por";

const s_ = (v) => String(v ?? "").trim();
const emailDe_ = (req) => s_(req.body?.email || req.query?.email || req.get("x-user-email")).toLowerCase();

// PostgREST directo, igual que routes/informes.js (y por lo mismo:
// supabaseGet_ antepone "eq." a todo y rompe select/order/in).
async function sb_(path, { method = "GET", body } = {}) {
  const h = supabaseServiceHeaders_();
  if (!h) throw new Error("Supabase no configurado (.env)");
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: body ? { ...h, Prefer: "return=representation" } : h,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const fmtFecha_ = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });

/** dd-mm-aaaa en hora de Lima, como se escribe en la hoja. */
function fechaPeru_(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const [y, m, d] = fmtFecha_.format(t).split("-");
  return `${d}-${m}-${y}`;
}

/** { vin: "Jetour X70" } de los carros pedidos. */
async function modelosDe_(vins) {
  const unicos = [...new Set(vins.filter(Boolean))];
  if (!unicos.length) return new Map();
  const filas = await sb_(`vins?select=vin,modelo&vin=in.(${unicos.map(encodeURIComponent).join(",")})`);
  return new Map((filas || []).map(f => [f.vin, normalizeModelo_(f.modelo)]));
}

/** Las filas con lo que la oficina necesita ver: nombre de quien pidió y modelo. */
async function enriquecer_(filas) {
  const [p, modelos] = await Promise.all([padron_(), modelosDe_(filas.map(f => f.vin))]);
  const nombre = (email) => p.porEmail.get(s_(email).toLowerCase())?.nombre || s_(email);
  return filas.map(f => ({
    ...f,
    solicitado_nombre: nombre(f.solicitado_por),
    impresa_nombre: f.impresa_por ? nombre(f.impresa_por) : "",
    modelo: modelos.get(f.vin) || "",
  }));
}

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/hojas-calidad/carro?vin= — lo que el modal del inspector
//  necesita: el modelo (para saber qué hoja va) y, si ya la pidió y sigue
//  pendiente, lo que marcó entonces.
// ─────────────────────────────────────────────────────────────────────────
router.get("/api/hojas-calidad/carro", async (req, res) => {
  try {
    const vin = s_(req.query.vin).toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta el VIN del carro." });
    const [modelos, previa] = await Promise.all([
      modelosDe_([vin]),
      sb_(`${TABLA}?select=${CAMPOS},marcas&vin=eq.${encodeURIComponent(vin)}&estado=eq.PENDIENTE&limit=1`),
    ]);
    const modelo = modelos.get(vin) || "";
    res.json({ ok: true, vin, modelo, tieneHoja: !!modeloCc_(modelo), pendiente: previa?.[0] || null });
  } catch (err) {
    console.error("[hojas-calidad] carro:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/hojas-calidad — el inspector pide la hoja de un carro
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/hojas-calidad", async (req, res) => {
  try {
    // Cualquiera con cuenta activa: el inspector no siempre tiene rol
    // CALIDAD (Uribe es MOTOR con el módulo de calidad).
    const u = await getUsuarioByEmail_(emailDe_(req));
    if (!u?.activo) {
      return res.status(403).json({ ok: false, error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar." });
    }

    const vin = s_(req.body?.vin).toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta el VIN del carro." });

    // Sin hoja para el modelo no se acepta: si entrara, la oficina
    // imprimiría el X70 a un KYC y nadie lo notaría hasta firmarlo.
    const modelo = (await modelosDe_([vin])).get(vin);
    const cc = modeloCc_(modelo);
    if (!cc) {
      return res.status(422).json({
        ok: false,
        error: modelo
          ? `Todavía no está cargada la hoja CC del ${modelo}. Hay hoja para: ${MODELOS_CC_TEXTO}.`
          : `No sé qué modelo es el ${vin}: no está en el padrón de carros.`,
      });
    }

    // Lo que el inspector validó en el modal. Se guarda solo lo que cambia
    // respecto del modelo.
    const marcas = limpiarMarcasCc_(cc, req.body?.marcas);

    // Una sola pendiente por carro. Pedirla otra vez no imprime dos: se
    // corrigen las marcas de la que ya estaba, y firma quien la mandó.
    const previa = await sb_(`${TABLA}?select=id&vin=eq.${encodeURIComponent(vin)}&estado=eq.PENDIENTE&limit=1`);
    if (previa?.[0]) {
      const act = await sb_(`${TABLA}?id=eq.${previa[0].id}`, { method: "PATCH", body: { marcas, solicitado_por: u.email } });
      emitEvent_("hojas-calidad", { accion: "corregida", id: previa[0].id });
      return res.json({ ok: true, yaEstaba: true, hoja: act?.[0] });
    }

    const creadas = await sb_(TABLA, { method: "POST", body: { vin, solicitado_por: u.email, marcas } });
    const hoja = Array.isArray(creadas) ? creadas[0] : creadas;
    emitEvent_("hojas-calidad", { accion: "nueva", id: hoja?.id });
    res.json({ ok: true, hoja });
  } catch (err) {
    console.error("[hojas-calidad] POST:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/hojas-calidad — pendientes, o búsqueda por VIN para reimprimir
// ─────────────────────────────────────────────────────────────────────────
router.get("/api/hojas-calidad", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    // Basta con los últimos dígitos: es lo que se lee en el parabrisas.
    const vin = s_(req.query.vin).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const filtro = vin
      ? `vin=ilike.*${encodeURIComponent(vin)}*&estado=neq.ANULADA&order=created_at.desc&limit=30`
      : "estado=eq.PENDIENTE&order=created_at.asc&limit=200";
    const filas = await sb_(`${TABLA}?select=${CAMPOS}&${filtro}`);
    res.json({ ok: true, items: await enriquecer_(filas || []) });
  } catch (err) {
    console.error("[hojas-calidad] GET:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/hojas-calidad/hojas?ids=a,b — las hojas como página
//  La oficina la baja con fetch y la imprime de una vez desde un iframe
//  (srcdoc): una hoja por papel. El CSS va dentro para no depender del
//  bundle de la app. Abierta como página dentro de la app NO sirve: el
//  service worker contesta cualquier navegación con la app (NavigationRoute).
// ─────────────────────────────────────────────────────────────────────────
let css_ = null;
const cssHoja_ = () => (css_ ??= readFileSync(new URL("../public/css/views/hoja-cc.css", import.meta.url), "utf8"));

router.get("/api/hojas-calidad/hojas", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const ids = s_(req.query.ids).split(",").map(s_).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
    if (!ids.length) return res.status(400).send("No hay hojas que imprimir.");

    const filas = await enriquecer_(await sb_(`${TABLA}?select=${CAMPOS},marcas&id=in.(${ids.join(",")})&order=created_at.asc`) || []);
    const hojas = filas.map(f => {
      const cc = modeloCc_(f.modelo);
      // Un carro cuyo modelo cambió en el padrón después de pedirla: mejor
      // un aviso en el papel que la hoja de otro modelo.
      if (!cc) return `<div class="ccHoja"><p>${escapeHtml(f.vin)}: no hay hoja CC para ${escapeHtml(f.modelo || "este modelo")}.</p></div>`;
      return hojaCcHtml({
        cc,
        fecha: fechaPeru_(f.created_at),
        vin: f.vin,
        tecnico: s_(f.solicitado_nombre).toUpperCase(),
        marcas: f.marcas,
      });
    }).join("");

    res.type("html").send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Control final · ${filas.length} hoja${filas.length === 1 ? "" : "s"}</title>
<style>@media screen{body{margin:0;padding:24px 0;background:#6b7280}.ccHoja+.ccHoja{margin-top:24px}}${cssHoja_()}</style>
</head><body>${hojas}</body></html>`);
  } catch (err) {
    console.error("[hojas-calidad] hojas:", err.message);
    res.status(500).send(escapeHtml(mensajeUtil_(err)));
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/hojas-calidad/impresas — { ids } salieron por la impresora
//  También para una reimpresión: la fecha de impresión pasa a ser la última.
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/hojas-calidad/impresas", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(s_).filter(x => /^[0-9a-f-]{36}$/i.test(x));
    if (!ids.length) return res.status(400).json({ ok: false, error: "No mandaste qué hojas salieron." });

    const filas = await sb_(`${TABLA}?id=in.(${ids.join(",")})&estado=neq.ANULADA`, {
      method: "PATCH",
      body: { estado: "IMPRESA", impresa_at: new Date().toISOString(), impresa_por: emailDe_(req) },
    });
    emitEvent_("hojas-calidad", { accion: "impresas", n: filas?.length || 0 });
    res.json({ ok: true, n: filas?.length || 0 });
  } catch (err) {
    console.error("[hojas-calidad] impresas:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/hojas-calidad/:id/anular — pedida por error
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/hojas-calidad/:id/anular", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const filas = await sb_(`${TABLA}?id=eq.${encodeURIComponent(s_(req.params.id))}`, {
      method: "PATCH", body: { estado: "ANULADA" },
    });
    if (!filas?.[0]) return res.status(404).json({ ok: false, error: "Esa hoja no existe." });
    emitEvent_("hojas-calidad", { accion: "anulada", id: filas[0].id });
    res.json({ ok: true });
  } catch (err) {
    console.error("[hojas-calidad] anular:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

/** Si falta la tabla, se dice qué migración correr. */
function mensajeUtil_(err) {
  const m = String(err?.message || err);
  if (/marcas/.test(m) && /column|PGRST204/i.test(m)) {
    return "Falta la columna de marcas. Ejecuta supabase/migrations/011_hojas-calidad-marcas.sql en Supabase.";
  }
  if (/hojas_calidad/.test(m) && /does not exist|relation|PGRST205/i.test(m)) {
    return "Falta la tabla de hojas de calidad. Ejecuta supabase/migrations/010_hojas-calidad.sql en Supabase.";
  }
  return m;
}

export default router;
