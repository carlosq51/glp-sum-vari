// =========================
// routes/ots.js
// CRUD de órdenes de trabajo + control de OTs en vivo.
//
// Existe aparte de routes/admin.js por dos motivos:
//   · Lo consumen dos vistas (Admin → OTs y Supervisor → CONTROL), no solo Admin.
//   · El borrado de una OT arrastra cinco tablas y merece vivir en un solo sitio,
//     no repartido entre el cliente y el servidor.
//
// Regla de fondo: NINGUNA de estas consultas se filtra en Node. Buscar un VIN
// trayendo "las últimas 1000 OTs" y filtrando en memoria es exactamente el bug
// que hacía que un VIN de hace dos meses no apareciera nunca: PostgREST recorta
// en db-max-rows sin avisar. Todo filtro viaja a la BD.
// =========================

import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { getConfig_ } from "../lib/config.js";
import { emitEvent_ } from "../lib/events.js";
import { requireRol_ } from "../lib/authz.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { repartirTrasEvento_ } from "./despacho.js";

const router = Router();

// Admin y Supervisor comparten esta consola: el supervisor es quien está en
// piso y necesita corregir la OT en el momento.
const requireMando_ = () => requireRol_("ADMIN", "SUPERVISOR");

const SB = () => process.env.SUPABASE_URL;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sbGet_(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { method: "GET", headers: supabaseHeaders_() });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Supabase GET ${path.split("?")[0]}: ${r.status} ${txt.slice(0, 200)}`);
  }
  return r.json();
}

async function sbWrite_(method, path, body) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, {
    method,
    headers: { ...supabaseHeaders_(), Prefer: method === "POST" ? "return=representation" : "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path.split("?")[0]}: ${r.status} ${txt.slice(0, 300)}`);
  }
  return method === "POST" ? r.json() : null;
}

/** `%texto%` listo para un ilike de PostgREST, con los comodines escapados. */
function likeParam_(q) {
  // `,` y `.` rompen el parser de PostgREST dentro de un `or=(...)`; los VINs
  // y números de OT no los usan, así que se descartan en vez de escaparse.
  const clean = String(q || "").replace(/[,.()*%]/g, "");
  return encodeURIComponent(`%${clean}%`);
}

// Columnas por las que busca cada sección del Admin. La búsqueda se hace en la
// BD sobre TODAS las filas, no sobre el lote que quepa en una página.
const TABLA_DEF_ = {
  ots: {
    tabla:  "work_orders",
    select: "*",
    cols:   ["vin", "numero_ot", "observaciones"],
    order:  "fecha_creacion.desc",
  },
  vins: {
    tabla:  "vins",
    select: "*",
    cols:   ["vin", "modelo", "cliente", "dua"],
    order:  "vin.asc",
  },
  usuarios: {
    tabla:  "usuarios",
    select: "*",
    cols:   ["nombre", "email"],
    order:  "nombre.asc",
  },
  incidencias: {
    tabla:  "incidencias",
    select: "*",
    cols:   ["vin", "tecnico", "nota"],
    order:  "fecha_hora.desc",
  },
};

// ─── GET /api/admin/tabla/:seccion?q=&limit= ─────────────────────────────────
// Listado paginado + búsqueda server-side para las secciones CRUD del Admin.
// `truncated` avisa cuando el listado sin filtro llegó al tope: la vista lo dice
// en pantalla en vez de mostrar un total falso.
router.get("/api/admin/tabla/:seccion", async (req, res) => {
  try {
    const def = TABLA_DEF_[String(req.params.seccion || "")];
    if (!def) return res.status(400).json({ ok: false, error: "Sección desconocida" });

    const cfg   = await getConfig_();
    const tope  = Number(cfg.LIM_PAGINA_SUPABASE) || 1000;
    const limit = Math.max(1, Math.min(tope, Number(req.query.limit) || tope));
    const q     = String(req.query.q || "").trim();

    let url = `${def.tabla}?select=${encodeURIComponent(def.select)}&order=${def.order}&limit=${limit}`;
    if (q) {
      const pat = likeParam_(q);
      url += `&or=(${def.cols.map(c => `${c}.ilike.${pat}`).join(",")})`;
    }

    const rows = await sbGet_(url);
    return res.json({
      ok: true,
      rows,
      total: rows.length,
      truncated: rows.length >= limit,
      limit,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── Detalle de OTs enriquecido ──────────────────────────────────────────────
/**
 * Toma work_orders y les cuelga sus asignaciones con el nombre del técnico.
 * Dos consultas en total (asignaciones + usuarios), no una por OT.
 */
async function enriquecerOts_(wos) {
  if (!wos.length) return [];

  const woIds = wos.map(w => w.id).join(",");
  const asgs = await sbGet_(
    `asignaciones?work_order_id=in.(${encodeURIComponent(woIds)})` +
    `&select=id,work_order_id,user_id,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,activo` +
    `&order=updated_at.desc`
  );

  const userIds = [...new Set(asgs.map(a => a.user_id).filter(Boolean))];
  const usrs = userIds.length
    ? await sbGet_(`usuarios?id=in.(${encodeURIComponent(userIds.join(","))})&select=id,nombre,email,especialidad`)
    : [];
  const userMap = Object.fromEntries(usrs.map(u => [u.id, u]));

  const porWo = new Map();
  for (const a of asgs) {
    if (!porWo.has(a.work_order_id)) porWo.set(a.work_order_id, []);
    porWo.get(a.work_order_id).push({
      ...a,
      tecnico_nombre: userMap[a.user_id]?.nombre || "—",
      tecnico_email:  userMap[a.user_id]?.email  || "",
    });
  }

  return wos.map(w => ({ ...w, asignaciones: porWo.get(w.id) || [] }));
}

// ─── GET /api/ots/vivas ──────────────────────────────────────────────────────
// OTs abiertas (estado_general != FINALIZADO) con sus asignaciones y técnicos.
// Es la lista base del panel CONTROL del supervisor cuando no hay VIN buscado.
router.get("/api/ots/vivas", async (req, res) => {
  try {
    const cfg   = await getConfig_();
    const limit = Math.max(1, Math.min(Number(cfg.LIM_PAGINA_SUPABASE) || 1000, Number(req.query.limit) || 300));

    // Cacheado por topic: la consola la tienen abierta varios supervisores a la
    // vez y cada uno repetía las mismas ~240 KB por ciclo de poll. Cualquier
    // mutación de OT o asignación invalida la entrada (ver lib/poll-cache.js),
    // así que el supervisor sigue viendo el cambio al instante vía SSE.
    const payload = await cachedByTopics_(
      `ots:vivas:${limit}`, ["work_orders", "asignaciones", "zonas"], cfg.SRV_CACHE_PESADO_MS,
      async () => {
        // Columnas explícitas, no `select=*`: las conf_ck* y conf_by no las
        // pinta la consola y viajaban 300 veces en cada refresco.
        const wos = await sbGet_(
          `work_orders?estado_general=neq.FINALIZADO` +
          `&select=id,vin,tipo_ot,tipo_ramal,numero_ot,estado_general,fecha_creacion,created_at,` +
          `user_id,observaciones,tanque_registrado,reductor_registrado,fecha_sin_calidad` +
          `&order=fecha_creacion.desc&limit=${limit}`
        );
        return { ok: true, ots: await enriquecerOts_(wos), total: wos.length };
      }, { bypass: req.query.fresh === "1" });
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── GET /api/nombres-por-vin?vins=A,B,C ─────────────────────────────────────
// VIN → nombre del MOTOR y del TANQUERO, solo para los VINs pedidos.
//
// Existe porque la vista de CALIDAD resolvía esos nombres bajándose el REPORTE
// COMPLETO del supervisor (/api/supervisor/report?track=CONVERSION): 1003
// items, 768 KB al cliente y ~1.5 MB de lecturas a Supabase, cada 5 minutos,
// para sacar dos nombres por cada VIN que el inspector tiene en pantalla. Lo
// mismo pedido por VIN son 0.97 KB.
//
// Todo el filtro viaja a la BD (regla de este archivo): el `!inner` sobre
// work_orders permite filtrar por vin sin traer nada más.
router.get("/api/nombres-por-vin", async (req, res) => {
  try {
    const { LIM_VINS_POR_CONSULTA } = await getConfig_();
    const vins = [...new Set(
      String(req.query.vins || "")
        .split(",")
        .map(v => v.trim().toUpperCase())
        .filter(Boolean),
    )].slice(0, LIM_VINS_POR_CONSULTA);

    if (!vins.length) return res.json({ ok: true, byVin: {} });

    const select = "rol_trabajo,usuarios(nombre),work_orders!inner(vin)";
    const rows = await sbGet_(
      `asignaciones?select=${encodeURIComponent(select)}` +
      `&tipo_ot=eq.CONVERSION` +
      `&work_orders.vin=in.(${vins.map(encodeURIComponent).join(",")})`,
    );

    const byVin = {};
    for (const a of rows || []) {
      const vin = String(a.work_orders?.vin || "").toUpperCase().trim();
      if (!vin) continue;
      const nombre = String(a.usuarios?.nombre || "").trim();
      if (!nombre) continue;
      const rol = String(a.rol_trabajo || "").toUpperCase();
      byVin[vin] = byVin[vin] || { motorNombre: "", tanqueroNombre: "" };
      if (rol === "MOTOR") byVin[vin].motorNombre = nombre;
      else if (rol === "TANQUE" || rol === "TANQUERO") byVin[vin].tanqueroNombre = nombre;
    }

    return res.json({ ok: true, byVin });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── GET /api/ots?vin=XXX ────────────────────────────────────────────────────
// Todas las OTs de un VIN (abiertas y cerradas) con sus asignaciones.
// Un VIN es único: aquí NO se filtra por fecha, tiene que aparecer esté donde esté.
router.get("/api/ots", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "VIN requerido" });

    const [wos, vinRows] = await Promise.all([
      sbGet_(`work_orders?vin=eq.${encodeURIComponent(vin)}&select=*&order=fecha_creacion.desc`),
      sbGet_(`vins?vin=eq.${encodeURIComponent(vin)}&select=vin,modelo,cliente,reductor_asignado,tanque_asignado&limit=1`),
    ]);

    return res.json({
      ok: true,
      vin,
      vehiculo: vinRows[0] || null,
      registrado: !!vinRows.length,
      ots: await enriquecerOts_(wos),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── POST /api/ots ───────────────────────────────────────────────────────────
router.post("/api/ots", requireMando_(), async (req, res) => {
  try {
    const b = req.body || {};
    const tipo_ot = String(b.tipo_ot || "").trim().toUpperCase();
    if (!["CONVERSION", "CALIDAD", "RAMALERO"].includes(tipo_ot)) {
      return res.status(400).json({ ok: false, error: "tipo_ot inválido" });
    }

    const vin = String(b.vin || "").trim().toUpperCase();
    if (tipo_ot !== "RAMALERO" && !vin) {
      return res.status(400).json({ ok: false, error: "El VIN es obligatorio para OTs de CONVERSION y CALIDAD" });
    }

    // El VIN tiene que existir en `vins`: work_orders.vin es FK y el 409 de
    // PostgREST no le dice nada útil a quien está en piso.
    if (vin) {
      const existe = await sbGet_(`vins?vin=eq.${encodeURIComponent(vin)}&select=vin&limit=1`);
      if (!existe.length) {
        return res.status(404).json({ ok: false, error: `El VIN ${vin} no está registrado en la lista de vehículos.` });
      }
    }

    const data = {
      tipo_ot,
      vin: vin || null,
      estado_general: String(b.estado_general || "PENDIENTE").toUpperCase(),
      observaciones:  String(b.observaciones || ""),
      numero_ot:      String(b.numero_ot || ""),
    };
    if (b.tipo_ramal) data.tipo_ramal = String(b.tipo_ramal).trim();

    const creada = await sbWrite_("POST", "work_orders", data);
    const ot = Array.isArray(creada) ? creada[0] : creada;
    emitEvent_("work_orders", { accion: "CREADA", id: ot?.id, vin: ot?.vin });
    return res.json({ ok: true, ot });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── PATCH /api/ots/:id ──────────────────────────────────────────────────────
// Solo se aceptan las columnas editables: un PATCH abierto dejaría reescribir
// fecha_creacion o el id desde el navegador.
const CAMPOS_EDITABLES_ = [
  "tipo_ot", "vin", "estado_general", "observaciones", "numero_ot",
  "tipo_ramal", "tanque_registrado", "reductor_registrado",
];

router.patch("/api/ots/:id", requireMando_(), async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const data = {};
    for (const k of CAMPOS_EDITABLES_) {
      if (b[k] === undefined) continue;
      data[k] = k === "vin" ? String(b[k] || "").trim().toUpperCase() || null : b[k];
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ ok: false, error: "Nada que actualizar" });
    }

    if (data.vin) {
      const existe = await sbGet_(`vins?vin=eq.${encodeURIComponent(data.vin)}&select=vin&limit=1`);
      if (!existe.length) {
        return res.status(404).json({ ok: false, error: `El VIN ${data.vin} no está registrado.` });
      }
    }

    await sbWrite_("PATCH", `work_orders?id=eq.${encodeURIComponent(id)}`, data);
    emitEvent_("work_orders", { accion: "ACTUALIZADA", id });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── DELETE /api/ots/:id ─────────────────────────────────────────────────────
// Borrado en cascada MANUAL: el esquema no declara ON DELETE CASCADE en ninguna
// de las FKs hacia work_orders, así que el orden importa y hay un nieto:
// despacho_propuestas.asignacion_id → asignaciones.id. Si no se suelta primero,
// el DELETE de asignaciones revienta con 23503 y la OT queda a medio borrar.
router.delete("/api/ots/:id", requireMando_(), async (req, res) => {
  try {
    const { id } = req.params;
    const woId = encodeURIComponent(id);

    const ot = await sbGet_(`work_orders?id=eq.${woId}&select=id,vin,tipo_ot&limit=1`);
    if (!ot.length) return res.status(404).json({ ok: false, error: "La OT no existe" });

    // 1. Nietos: propuestas de despacho que apuntan a estas asignaciones.
    //    Se sueltan (no se borran): la propuesta es el registro del experimento
    //    del motor y sigue siendo válida aunque la asignación desaparezca.
    const asgs = await sbGet_(`asignaciones?work_order_id=eq.${woId}&select=id`);
    if (asgs.length) {
      const ids = encodeURIComponent(asgs.map(a => a.id).join(","));
      await sbWrite_("PATCH", `despacho_propuestas?asignacion_id=in.(${ids})`, { asignacion_id: null });
    }

    // 2. Hijos directos, en orden de dependencia.
    const borrados = {};
    for (const tabla of ["eventos", "asignaciones", "incidencias", "solicitudes_ramal"]) {
      await sbWrite_("DELETE", `${tabla}?work_order_id=eq.${woId}`);
      borrados[tabla] = true;
    }

    // 3. La OT.
    await sbWrite_("DELETE", `work_orders?id=eq.${woId}`);

    emitEvent_("work_orders", { accion: "ELIMINADA", id, vin: ot[0].vin });
    // Borrar la OT arrastra sus asignaciones: quien estuviera en ese carro se
    // queda sin trabajo en este mismo instante y hay que buscarle otro.
    repartirTrasEvento_(`OT ${ot[0].vin} eliminada`);
    return res.json({
      ok: true,
      vin: ot[0].vin,
      asignaciones_borradas: asgs.length,
      tablas: Object.keys(borrados),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

export default router;
