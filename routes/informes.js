// =========================
// routes/informes.js
// Informes de taller: las tres hojas que hoy se llenan a mano.
//
// Requiere `supabase/historico/informes-taller.sql`.
//
// EL FLUJO
// ────────
//   · POST   /api/informes            el TÉCNICO manda el informe de su OT
//                                     desde el taller. Queda en la cola.
//   · GET    /api/informes            la cola de la oficina (ADMIN/SUPERVISOR)
//   · GET    /api/informes/:id        un informe entero, para abrirlo y
//                                     revisarlo antes de imprimir
//   · PATCH  /api/informes/:id        corregir lo que venga mal
//     POST   /api/informes/:id/guardar  lo mismo, para el cliente de la app
//   · POST   /api/informes/:id/impreso  sale por la impresora y de la cola
//   · POST   /api/informes/:id/anular   se descarta (duplicado, carro que
//                                     no se entregó…)
//
// POR QUÉ EL TÉCNICO NO MANDA EL VIN
// El cliente manda la OT —que es la clave del documento y la que ve en su
// tarjeta— y el servidor saca el VIN de ella. Si el VIN lo mandara el
// navegador, un informe podría salir con el VIN de otro carro por un error
// de tecleo, y el papel iría firmado con datos que no son.
// =========================

import { Router } from "express";
import { supabaseServiceHeaders_ } from "../lib/supabase.js";
import { requireRol_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import {
  fusionarInforme_, aplanarInforme_, aplicarEdicion_, aplicarVehiculo_, SLOTS_ETAPA_FOTO, etapasPorFoto_,
} from "../lib/informes.js";
import { r2AutoresRegistro } from "../r2-uploads.js";
import { readFileSync } from "node:fs";
import { hojasInformeHtml } from "../public/js/templates/views/informe-imprimible.js";
import { escapeHtml } from "../public/js/core/format.js";

const router = Router();

// ── Acceso a Supabase ────────────────────────────────────────────────────
// Se usa la clave de SERVICIO, no la anónima. Los informes son datos de
// backend: el navegador nunca habla con esta tabla, siempre pasa por aquí,
// y con la clave anónima la RLS rechaza el INSERT con un 401 (42501).
// Mismo criterio que lib/authz.js y routes/push.js.
// No se usa supabaseGet_ de lib/supabase.js: ese helper antepone "eq." a
// TODOS los valores del filtro, así que sirve para igualdades simples pero
// rompe cualquier consulta con select, order, limit o un operador que no
// sea eq — convertía select=id,vin en select=eq.id,vin y Supabase devolvía
// un 400. Aquí las URLs se escriben en PostgREST directo, igual que en
// routes/ramales.js.
const SB = () => process.env.SUPABASE_URL;

/**
 * Cabeceras con la clave de SERVICIO, o un error que se entiende.
 *
 * supabaseServiceHeaders_() caía de vuelta a la clave anónima cuando faltaba
 * SUPABASE_SERVICE_KEY, sin decir nada (hoy devuelve null, y la base ya no
 * acepta la anónima en ninguna tabla). Con la RLS activa eso se manifestaba
 * como un 401 42501 en el INSERT —"new row violates row-level security"—
 * que apunta a la base de datos cuando el problema es la configuración del
 * servidor. Aquí se corta antes y se dice qué falta.
 */
function headers_() {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    throw new Error(
      "Falta SUPABASE_SERVICE_KEY en el servidor. Los informes se escriben " +
      "con la clave de servicio; con la anónima la RLS los rechaza."
    );
  }
  const cab = supabaseServiceHeaders_();
  if (!cab) throw new Error("Supabase no configurado (.env)");
  return cab;
}

async function sbGet_(path) {
  const h = headers_();
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: h });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase GET ${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function sbPost_(table, data) {
  const h = headers_();
  const r = await fetch(`${SB()}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase POST ${table}: ${r.status} ${t.slice(0, 200)}`);
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbPatch_(table, filtro, data) {
  const h = headers_();
  const r = await fetch(`${SB()}/rest/v1/${table}?${filtro}`, {
    method: "PATCH",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Supabase PATCH ${table}: ${r.status} ${t.slice(0, 200)}`);
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

const TABLA = "informes_taller";

// Lo que la cola necesita mostrar. `datos` no entra: es el formulario
// entero y en una lista de 30 filas serían cientos de KB para pintar
// cuatro columnas.
const CAMPOS_COLA =
  "id,work_order_id,ot_fisica,vin,placa,estado,creado_por,creado_nombre,created_at,updated_at,impreso_por,impreso_at";

const s_ = (v) => String(v ?? "").trim();

/** "aaaa-mm" de una fecha en hora de Lima (o de ahora). Es la carpeta del mes en R2. */
function mesLima_(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}

/** Quién hace la petición. Mismo criterio que requireRol_. */
function emailDe_(req) {
  return s_(req.body?.email || req.query?.email || req.get("x-user-email")).toLowerCase();
}

/**
 * Quiénes trabajaron el carro, con sus horas. Sale de `asignaciones` y de
 * los eventos, nunca de lo que escriba el navegador.
 *
 * Se usa en dos sitios: el modal al abrirse, y el POST al guardar. Lo
 * segundo importa — el padrón se guarda CON el informe aunque solo haya
 * mandado uno de los dos. Así el papel imprime el nombre del tanquero y su
 * hora de inicio aunque él no haya enviado su mitad todavía: el sistema ya
 * sabe quién es, no hay razón para dejar el hueco en blanco.
 */
async function contextoDeOt_(ot) {
  const asgs = await sbGet_(
    "asignaciones?select=id,rol_trabajo,estado_actual,fecha_asignacion,updated_at,tiempo_trab_ms,usuarios(nombre,email)"
    + `&work_order_id=eq.${encodeURIComponent(ot)}&activo=eq.true&tipo_ot=eq.CONVERSION`
  );

  // La hora de FIN sale del evento, no de updated_at de la asignación:
  // updated_at cambia con cualquier retoque posterior (una nota, una
  // corrección del supervisor) y el papel acabaría diciendo que el técnico
  // terminó a una hora a la que ya se había ido.
  const fines = new Map();
  try {
    const evs = await sbGet_(
      "eventos?select=rol_trabajo,timestamp&accion=eq.FIN"
      + `&work_order_id=eq.${encodeURIComponent(ot)}&order=timestamp.desc`
    );
    // Van de más nuevo a más viejo: el primero de cada rol es el último
    // FIN, que es el que vale si reabrieron y volvieron a cerrar.
    for (const e of evs || []) {
      const r = s_(e.rol_trabajo).toUpperCase();
      if (r && !fines.has(r)) fines.set(r, e.timestamp);
    }
  } catch (err) {
    console.warn("[informes] no pude leer los FIN:", err.message);
  }

  // COMPRESIÓN y SCANNER se marcan a quien subió esas fotos, no por rol.
  // El autor va guardado en la propia foto (ver r2UploadOne). Las fotos
  // viven en la carpeta del mes en que se subieron: se mira el mes de cada
  // asignación y el actual, que cubre un carro que cruzó de mes.
  let autores = {};
  try {
    const wos = await sbGet_(`work_orders?select=vin&id=eq.${encodeURIComponent(ot)}&limit=1`);
    const vin = s_(wos?.[0]?.vin);
    if (vin) {
      const meses = [...(asgs || []).map(a => mesLima_(a.fecha_asignacion)), mesLima_()];
      autores = await r2AutoresRegistro({
        vin, meses, slots: Object.values(SLOTS_ETAPA_FOTO).flat(),
      });
    }
  } catch (err) {
    console.warn("[informes] no pude leer quién subió las fotos:", err.message);
  }

  return (asgs || []).map(a => {
    const u = Array.isArray(a.usuarios) ? a.usuarios[0] : a.usuarios;
    const rol = s_(a.rol_trabajo).toUpperCase();
    return {
      // { compresion: true/false, scanner: … } solo para las etapas cuyas
      // fotos tienen autor guardado. Lo que no aparece se queda como lo
      // mandó el técnico.
      fotos: etapasPorFoto_(autores, u?.email),
      rol,
      nombre: s_(u?.nombre),
      email: s_(u?.email),
      estado: s_(a.estado_actual),
      // El inicio es cuando se le asignó el carro, no cuando le dio a
      // INICIO: es lo que el taller entiende por "desde cuándo lo tiene".
      inicio: a.fecha_asignacion || null,
      // Sin FIN va null, y lo rellena la hora de la impresión.
      fin: fines.get(rol) || (a.estado_actual === "FINALIZADO" ? a.updated_at : null),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/informes/contexto — quiénes trabajaron el carro y desde cuándo
//  Lo llama el modal al abrirse, para no pedirle al técnico nada que el
//  sistema ya sabe.
// ─────────────────────────────────────────────────────────────────────────
router.get("/api/informes/contexto", async (req, res) => {
  try {
    const ot = s_(req.query.work_order_id);
    if (!ot) return res.status(400).json({ ok: false, error: "Falta la OT." });

    const personas = await contextoDeOt_(ot);
    const wos = await sbGet_(`work_orders?select=id,vin&id=eq.${encodeURIComponent(ot)}&limit=1`);

    res.json({ ok: true, ot, vin: s_(wos?.[0]?.vin), personas });
  } catch (err) {
    console.error("[informes] contexto:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/informes — el técnico manda el informe de su OT
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/informes", async (req, res) => {
  try {
    const email = emailDe_(req);
    if (!email) {
      return res.status(403).json({ ok: false, error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar." });
    }

    const ot = s_(req.body?.work_order_id);
    if (!ot) return res.status(400).json({ ok: false, error: "Falta la OT del carro." });

    // El VIN sale de la OT, nunca del navegador.
    const wos = await sbGet_(`work_orders?select=id,vin&id=eq.${encodeURIComponent(ot)}&limit=1`);

    if (!wos?.[0]) return res.status(404).json({ ok: false, error: `La OT ${ot} no existe.` });
    const vin = s_(wos[0].vin);

    // El número de OT FÍSICA es el único dato del papel que no está en
    // ninguna tabla: lo escribe el técnico. Sin él, la hoja sale con el
    // campo "OT :" en blanco y no se puede cruzar con la orden de papel.
    const otFisica = s_(req.body?.ot_fisica);
    if (!otFisica) return res.status(400).json({ ok: false, error: "Falta el número de OT." });
    const placa = s_(req.body?.placa).toUpperCase();


    // ESPERAR = sale cuando estén las dos mitades (lo de siempre).
    // YA      = sale ahora con lo que haya; la mitad del compañero va en
    //           blanco y se llena a mano.
    const ya = s_(req.body?.modo).toUpperCase() === "YA";
    const estadoDe = (faltan) => (faltan.length && !ya ? "BORRADOR" : "ENVIADO");

    // ¿Ya hay uno para esta OT? Primero el vivo; si no, el último impreso.
    // El impreso cuenta porque con "imprimir ya" el papel sale a medias: si
    // el compañero manda su parte después, se suma a ESE informe y vuelve a
    // la cola completo. Si se abriera uno nuevo solo con su mitad, se
    // quedaría a medias para siempre, esperando a alguien que ya mandó.
    // (El índice único de la tabla impediría dos vivos igual, pero el error
    // de Postgres no le dice nada a nadie.)
    const previos = await sbGet_(`${TABLA}?select=id,estado&work_order_id=eq.${encodeURIComponent(ot)}&estado=in.(BORRADOR,ENVIADO,IMPRESO)&order=created_at.desc&limit=5`);
    const previo = (previos || []).find(p => p.estado !== "IMPRESO") || (previos || [])[0];
    const vivos = previo ? [previo] : [];

    // EL INFORME ES COLABORATIVO: lo llenan el delantero (MOTOR) y el
    // tanquero (TANQUE) al acabar, cada uno su mitad. Por eso se FUSIONA
    // por rol en vez de reemplazar: si el segundo en enviar pisara lo del
    // primero, el papel saldría a medias y nadie lo notaría hasta tenerlo
    // en la mano.
    const rol = s_(req.body?.rol).toUpperCase();

    // El padrón del sistema se guarda SIEMPRE, mande quien mande. Es lo
    // que permite imprimir el nombre y la hora del compañero aunque él
    // todavía no haya enviado su mitad.
    let personas = [];
    try { personas = await contextoDeOt_(ot); }
    catch (err) { console.warn("[informes] sin padrón:", err.message); }
    const parte = req.body?.parte && typeof req.body.parte === "object" ? req.body.parte : {};

    if (vivos?.[0]) {
      const actuales = await sbGet_(`${TABLA}?select=id,datos&id=eq.${vivos[0].id}&limit=1`);
      const datos = fusionarInforme_(actuales?.[0]?.datos, rol, parte);
      if (personas.length) datos.personas = personas;

      // Con "esperar", un informe NO entra en la cola hasta que están las
      // dos mitades. Mientras falte una queda en BORRADOR, que la cola
      // muestra aparte y la impresora no toca. Con "ya" entra igual.
      const faltan = aplanarInforme_(datos).faltan;

      const actualizado = await sbPatch_(TABLA, `id=eq.${vivos[0].id}`, {
        ot_fisica: otFisica || s_(datos.comun.ot),
        placa: placa || s_(datos.comun.placa),
        datos,
        estado: estadoDe(faltan),
      });
      const inf = Array.isArray(actualizado) ? actualizado[0] : actualizado;
      emitEvent_("informes", { accion: "actualizado", id: inf?.id, ot });
      return res.json({ ok: true, fusionado: true, faltan, ya, informe: inf });
    }

    const datos = fusionarInforme_(null, rol, parte);
    if (personas.length) datos.personas = personas;
    datos.comun.ot = otFisica;          // el del papel, no el UUID
    datos.comun.vin = vin;
    datos.comun.placa = placa;

    const faltan = aplanarInforme_(datos).faltan;

    const creado = await sbPost_(TABLA, {
      work_order_id: ot,               // UUID del sistema, para cruzar datos
      ot_fisica: otFisica,             // el número que va impreso en la hoja
      vin,
      placa,
      estado: estadoDe(faltan),
      datos,
      creado_por: email,
      creado_nombre: s_(req.body?.nombre),
    });

    emitEvent_("informes", { accion: "nuevo", id: creado?.id, ot });
    res.json({ ok: true, faltan, ya, informe: creado });
  } catch (err) {
    console.error("[informes] POST:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/informes — la cola de la oficina
// ─────────────────────────────────────────────────────────────────────────
router.get("/api/informes", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    // Por defecto solo lo pendiente: es lo que la oficina mira todo el día.
    // Con ?estado=TODOS sale el histórico, para buscar un papel viejo.
    // ENVIADO = completo, listo para imprimir.
    // BORRADOR = le falta la mitad de alguien. Van igualmente, pero aparte:
    // si no se vieran, un informe cuyo compañero nunca envía quedaría
    // invisible y en la oficina no sabrían a quién ir a buscar.
    const estado = s_(req.query.estado).toUpperCase() || "COLA";
    const limite = Math.min(Number(req.query.limit) || 100, 300);
    let filtro = `select=${CAMPOS_COLA}&order=created_at.desc&limit=${limite}`;
    if (estado === "COLA") filtro += "&estado=in.(ENVIADO,BORRADOR)";
    else if (estado !== "TODOS") filtro += `&estado=eq.${encodeURIComponent(estado)}`;

    const items = await sbGet_(`${TABLA}?${filtro}`);
    res.json({
      ok: true,
      items: (items || []).filter(i => i.estado === "ENVIADO"),
      incompletos: (items || []).filter(i => i.estado === "BORRADOR"),
    });
  } catch (err) {
    console.error("[informes] GET cola:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/informes/:id — el informe entero, para revisarlo e imprimirlo
// ─────────────────────────────────────────────────────────────────────────
/** El informe unido y listo para pintar. Lo usan la pantalla y la impresora. */
async function planoDe_(fila) {
  // El padrón se vuelve a pedir AQUÍ, no se usa el que se guardó.
  //
  // Dos razones: los informes mandados antes de que el padrón existiera
  // no lo llevan dentro —y sin esto saldrían sin el nombre del compañero—,
  // y si mientras tanto reasignaron el carro a otro técnico, el papel debe
  // decir quién lo trabajó de verdad, no quién estaba cuando se envió.
  const datos = { ...(fila.datos || {}) };
  try {
    const personas = await contextoDeOt_(s_(fila.work_order_id));
    if (personas.length) datos.personas = personas;
  } catch (err) {
    console.warn("[informes] sin padrón al abrir:", err.message);
  }

  // Marca y modelo del carro de verdad, de `vins`. Antes salía JETOUR X70
  // para todo, también para un KYC X5.
  let plano = aplanarInforme_(datos);
  try {
    const vin = s_(fila.vin) || s_(plano.vin);
    if (vin) {
      const v = await sbGet_(`vins?select=modelo&vin=eq.${encodeURIComponent(vin)}&limit=1`);
      plano = aplicarVehiculo_(plano, v?.[0]?.modelo);
    }
  } catch (err) {
    console.warn("[informes] sin modelo del carro:", err.message);
  }
  return plano;
}

router.get("/api/informes/:id", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const filas = await sbGet_(`${TABLA}?id=eq.${encodeURIComponent(s_(req.params.id))}&limit=1`);
    if (!filas?.[0]) return res.status(404).json({ ok: false, error: "Ese informe no existe." });
    res.json({ ok: true, informe: filas[0], plano: await planoDe_(filas[0]) });
  } catch (err) {
    console.error("[informes] GET uno:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/informes/:id/hojas — las 3 hojas como página, lista para papel
//  La pide la laptop de la oficina (impresora/agente.mjs): la convierte en
//  PDF con Chrome y la manda a la impresora sin que nadie la toque. También
//  sirve abierta en el navegador para reimprimir un papel.
// ─────────────────────────────────────────────────────────────────────────

// El CSS de las hojas va DENTRO de la página: así no depende del bundle de
// Vite ni de que la pantalla de la app esté cargada.
let cssHojas_ = null;
function cssHojas() {
  if (cssHojas_ == null) {
    cssHojas_ = ["informe-taller.css", "hoja-chequeo.css", "hoja-produccion.css"]
      .map(f => readFileSync(new URL(`../public/css/views/${f}`, import.meta.url), "utf8"))
      .join("\n");
  }
  return cssHojas_;
}

router.get("/api/informes/:id/hojas", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const filas = await sbGet_(`${TABLA}?id=eq.${encodeURIComponent(s_(req.params.id))}&limit=1`);
    if (!filas?.[0]) return res.status(404).send("Ese informe no existe.");
    const plano = await planoDe_(filas[0]);
    res.type("html").send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>OT ${escapeHtml(s_(plano.ot))}</title>
<style>${cssHojas()}</style>
</head><body><div class="itHojas">${hojasInformeHtml(plano)}</div></body></html>`);
  } catch (err) {
    console.error("[informes] hojas:", err.message);
    res.status(500).send(mensajeUtil_(err));
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  PATCH /api/informes/:id — corregir antes de imprimir
// ─────────────────────────────────────────────────────────────────────────
async function guardar_(req, res) {
  try {
    const cambios = {};
    // Lo que manda la pantalla de impresión es el informe APLANADO. Si se
    // guardara tal cual, borraría `porRol` y `personas` — quién marcó qué y
    // el padrón del sistema. Se aplica como corrección sobre lo guardado.
    if (req.body?.datos && typeof req.body.datos === "object") {
      const previas = await sbGet_(`${TABLA}?select=datos&id=eq.${encodeURIComponent(s_(req.params.id))}&limit=1`);
      cambios.datos = aplicarEdicion_(previas?.[0]?.datos, req.body.datos);
    }
    if (req.body?.placa !== undefined) cambios.placa = s_(req.body.placa).toUpperCase();
    if (!Object.keys(cambios).length) {
      return res.status(400).json({ ok: false, error: "No mandaste nada que cambiar." });
    }

    const filas = await sbPatch_(TABLA, `id=eq.${encodeURIComponent(s_(req.params.id))}`, cambios);
    const informe = Array.isArray(filas) ? filas[0] : filas;
    if (!informe) return res.status(404).json({ ok: false, error: "Ese informe no existe." });

    emitEvent_("informes", { accion: "editado", id: informe.id });
    res.json({ ok: true, informe });
  } catch (err) {
    console.error("[informes] guardar:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
}

router.patch("/api/informes/:id", requireRol_("ADMIN", "SUPERVISOR"), guardar_);

// El cliente de la app solo sabe hacer GET y POST (core/api.js), así que
// guardar tiene además esta puerta en POST. Es el mismo manejador.
router.post("/api/informes/:id/guardar", requireRol_("ADMIN", "SUPERVISOR"), guardar_);

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/informes/:id/impreso — salió por la impresora
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/informes/:id/impreso", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    // Último cierre: medio informe solo sale si el técnico pidió "imprimir
    // ya" (y entonces está en ENVIADO). Uno en BORRADOR está esperando al
    // compañero: si alguien llega aquí con él —una pestaña vieja, un enlace
    // guardado— se para en seco en vez de dar por bueno un papel a medias.
    const previas = await sbGet_(`${TABLA}?select=id,estado,datos&id=eq.${encodeURIComponent(s_(req.params.id))}&limit=1`);
    const faltan = aplanarInforme_(previas?.[0]?.datos).faltan;
    if (faltan.length && previas?.[0]?.estado === "BORRADOR") {
      const quien = faltan.map(x => x === "MOTOR" ? "el delantero" : "el tanquero").join(" y ");
      return res.status(409).json({ ok: false, error: `Este informe está incompleto: falta la parte de ${quien}.` });
    }
    const filas = await sbPatch_(TABLA, `id=eq.${encodeURIComponent(s_(req.params.id))}`, {
      estado: "IMPRESO",
      impreso_por: emailDe_(req),
      impreso_at: new Date().toISOString(),
    });
    const informe = Array.isArray(filas) ? filas[0] : filas;
    if (!informe) return res.status(404).json({ ok: false, error: "Ese informe no existe." });

    emitEvent_("informes", { accion: "impreso", id: informe.id });
    res.json({ ok: true, informe });
  } catch (err) {
    console.error("[informes] impreso:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/informes/:id/anular — se descarta
// ─────────────────────────────────────────────────────────────────────────
router.post("/api/informes/:id/anular", requireRol_("ADMIN", "SUPERVISOR"), async (req, res) => {
  try {
    const filas = await sbPatch_(TABLA, `id=eq.${encodeURIComponent(s_(req.params.id))}`, { estado: "ANULADO" });
    const informe = Array.isArray(filas) ? filas[0] : filas;
    if (!informe) return res.status(404).json({ ok: false, error: "Ese informe no existe." });

    emitEvent_("informes", { accion: "anulado", id: informe.id });
    res.json({ ok: true, informe });
  } catch (err) {
    console.error("[informes] anular:", err.message);
    res.status(500).json({ ok: false, error: mensajeUtil_(err) });
  }
});

/**
 * "relation informes_taller does not exist" no le dice nada a quien está
 * en el taller. Si falta la tabla, se dice qué hay que ejecutar.
 */
function mensajeUtil_(err) {
  const m = String(err?.message || err);
  if (/informes_taller/.test(m) && /does not exist|relation/i.test(m)) {
    return "Falta la tabla de informes. Ejecuta supabase/historico/informes-taller.sql en Supabase.";
  }
  return m;
}

export default router;
