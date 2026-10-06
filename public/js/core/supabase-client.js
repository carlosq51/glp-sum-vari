// =========================
// public/js/core/supabase-client.js
// Lectura/escritura de tablas desde el navegador.
//
// Hasta la fase 3 del orden de la base, esto hablaba DIRECTO con Supabase
// usando la anon key del bundle, y la base dejaba a esa key leer, escribir y
// borrar cualquier tabla. Ahora todo pasa por /api/db (routes/db.js), que
// revisa quién pide qué (lib/db-permisos.js) y reenvía con la service key.
// Las funciones conservan su firma: las vistas no se enteran del cambio.
// =========================

import { cfg } from "./config.js";
import { getEmail } from "./auth.js";
import { ESTADOS_CALIDAD_COLABORATIVA } from "../../../lib/colaboracion.js";

/**
 * Siempre true: el servidor es el que habla con Supabase. Se conserva porque
 * hay vistas que todavía preguntan antes de leer.
 */
export function supabaseEnabled() {
  return true;
}

/**
 * Un pedido a /api/db. `pathYQuery` es lo que antes iba después de
 * /rest/v1/: "tabla?filtros&select=...". El error lleva `status` para que
 * quien llama distinga un 403 (no tienes permiso) de un corte de red.
 */
async function db_(metodo, pathYQuery, body) {
  const res = await fetch(`/api/db/${pathYQuery}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "x-user-email": getEmail() || "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`${metodo} ${pathYQuery.split("?")[0]}: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

/**
 * Construye query string para Supabase REST API
 * Soporta operadores: eq, neq, gt, gte, lt, lte, in, is, like
 * 
 * Ejemplo:
 *   buildQuery({ user_id: 'xxx', activo: true })
 *     → "?user_id=eq.xxx&activo=eq.true"
 * 
 *   buildQuery({ 
 *     user_id: 'xxx', 
 *     estado: { op: 'neq', val: 'FINALIZADO' }
 *   })
 *     → "?user_id=eq.xxx&estado=neq.FINALIZADO"
 */
function buildQuery(filter = {}) {
  const parts = [];
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    
    let op = "eq";
    let val = value;
    
    // Soportar filtros complejos: { op: "neq", val: "..." }
    if (value && typeof value === "object" && value.op && value.val !== undefined) {
      op = value.op;
      val = value.val;
    }
    
    // Operadores especiales
    if (Array.isArray(val) && op === "in") {
      // in filter para arrays
      val = `(${val.map(v => `"${v}"`).join(",")})`;
    } else if (typeof val === "boolean") {
      val = String(val);
    } else if (op !== "in") {
      val = String(val);
    }
    
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(op)}.${encodeURIComponent(val)}`);
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

/**
 * GET desde Supabase
 *
 * @param {string} table
 * @param {object} filter  filtros (ver buildQuery)
 * @param {object} [opts]
 * @param {string} [opts.order]  ej. "created_at.desc" — ordenar EN la base
 * @param {number} [opts.limit]  tope de filas
 *
 * order/limit existen para no traer tablas enteras y recortarlas en el
 * navegador: la bitácora de inventario bajaba sus 185 filas (77 KB) para
 * pintar 40, y ese número solo sube con el tiempo.
 */
export async function supabaseGet(table, filter = {}, opts = {}) {
  const extra = [];
  if (opts.order) extra.push(`order=${encodeURIComponent(opts.order)}`);
  if (opts.limit) extra.push(`limit=${Number(opts.limit)}`);
  const qs = buildQuery(filter);
  const res = await db_("GET", `${table}${qs}` + (extra.length ? (qs ? "&" : "?") + extra.join("&") : ""));
  return await res.json();
}

/**
 * POST (insertar). Devuelve las filas creadas.
 */
export async function supabasePost(table, data) {
  const res = await db_("POST", table, data);
  return await res.json();
}

/**
 * PATCH (actualizar). Devuelve las filas actualizadas.
 */
export async function supabasePatch(table, filter = {}, data) {
  const res = await db_("PATCH", `${table}${buildQuery(filter)}`, data);
  return await res.json();
}

/**
 * DELETE
 */
export async function supabaseDelete(table, filter = {}) {
  await db_("DELETE", `${table}${buildQuery(filter)}`);
  return { ok: true };
}

/**
 * Aquí vivía subscribeToChanges(): cuatro WebSockets por dispositivo contra
 * Supabase Realtime. Se eliminaron porque nunca funcionaron —enviaban
 * {type:"subscribe"} y Supabase espera un phx_join con la config de
 * postgres_changes, así que ningún cambio llegó jamás— y porque el reintento de
 * onclose añadía un listener en lugar de reabrir el socket. Con 30 técnicos eran
 * ~120 conexiones simultáneas del límite del plan sin entregar un solo evento.
 *
 * Lo que refresca la app es el SSE del propio servidor (core/live.js): toda
 * mutación pasa por él, llega en menos de un segundo y no gasta egress de
 * Supabase. Si algún día hace falta Realtime de verdad, tener presente que sus
 * mensajes SÍ cuentan como egress facturado, multiplicados por dispositivo.
 */

// =========================
// HIGH-LEVEL QUERIES (reemplazan /api/*)
// =========================

/**
 * usuarioPorEmail_ — fila de `usuarios` del técnico, cacheada en memoria.
 *
 * Cuatro funciones de este archivo empezaban resolviendo el MISMO usuario por
 * email, y ninguna guardaba el resultado: getMisActivas corre cada 60 s y
 * getEstadoTrabajo cada 8 s cuando el VIN no está en la lista. Eran cientos de
 * viajes al día, por técnico, para releer una fila que no cambia — y el
 * comentario de getMisActivas ya afirmaba que el userId estaba cacheado
 * cuando no lo estaba.
 *
 * Lleva TTL en vez de ser eterno porque el Admin puede cambiar la especialidad
 * de alguien en caliente, y esa fila decide qué carros se le ofrecen: con un
 * cache de por vida, el técnico seguiría viendo la cola del rol equivocado
 * hasta cerrar sesión.
 */
const _usuarioCache = new Map(); // email → { row, ts }

async function usuarioPorEmail_(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return null;

  const ttl = Math.max(0, Number(cfg("CACHE_USUARIO_MS")) || 0);
  const hit = _usuarioCache.get(key);
  if (hit && (Date.now() - hit.ts) < ttl) return hit.row;

  let usuarios;
  try {
    usuarios = await supabaseGet("usuarios", { email: key });
  } catch (err) {
    // /api/db responde 403 a un correo que no existe o está desactivado: para
    // el login eso es "usuario no encontrado", no un error de red.
    if (err.status === 403) return null;
    throw err;
  }
  const row = (usuarios && usuarios.length) ? usuarios[0] : null;
  // El fallo NO se cachea: si la fila no vino por un corte de red, cachear el
  // null dejaría al técnico sin app hasta que venza el TTL.
  if (row) _usuarioCache.set(key, { row, ts: Date.now() });
  return row;
}

/** Olvida el usuario cacheado (logout, cambio de cuenta). */
export function limpiarCacheUsuario_(email) {
  if (email) _usuarioCache.delete(String(email).trim().toLowerCase());
  else _usuarioCache.clear();
}

/**
 * GET /api/me — Obtener perfil de usuario
 */
export async function getUsuarioPerfil(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return null;

  const modulos = await supabaseGet("usuario_modulos", { user_id: usuario.id });
  
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    especialidad: usuario.especialidad,
    activo: usuario.activo,
    avatar_url: usuario.avatar_url || "",
    modulos: Array.isArray(modulos) ? modulos.map(m => m.modulo) : [],
  };
}

// =========================
// ASIGNACIONES: una consulta, un mapeo
// =========================
//
// Las tres listas de asignaciones que pide esta pantalla —las mías, las de
// CALIDAD del compañero y mis finalizadas— tenían cada una su `select` (el
// mismo, copiado), su mapeo fila→item (el mismo, copiado: 24 líneas × 3) y su
// bloque de fetch con su mensaje de error. Añadir un campo eran tres sitios, y
// olvidarse de uno significaba que la MISMA OT se veía distinta según de qué
// lista hubiera salido.
//
// El servidor ya lo tenía resuelto así (mapAsignacion_ en routes/trabajo.js).
// Aquí se hace igual, y a propósito: las dos caras tienen que devolver lo
// mismo porque alimentan la misma tarjeta.

const SELECT_ASG =
  "id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms," +
  "updated_at,last_nota,work_orders(id,vin,tipo_ramal,estado_general," +
  "tanque_registrado,reductor_registrado,fecha_creacion," +
  "vins(reductor_asignado,tanque_asignado))";

// El nombre del titular solo se pide donde hace falta —la lista ajena—: en mis
// propias OTs el titular soy yo y serían dos campos de egress por fila para
// decirme mi propio nombre.
const SELECT_ASG_AJENA = `${SELECT_ASG},user_id,usuarios(id,nombre,email)`;

// PostgREST devuelve el embed como objeto cuando la relación es de muchos a uno
// y como array cuando la lee por el otro lado. Se aplana una vez, aquí.
const uno_ = (x) => (Array.isArray(x) ? x[0] : x) || {};

/** Fila de `asignaciones` → item que pinta la tarjeta. */
function mapAsignacion_(asg) {
  const wo    = uno_(asg.work_orders);
  const vins  = uno_(wo.vins);
  const dueno = uno_(asg.usuarios);
  return {
    id:                  asg.id,
    work_order_id:       asg.work_order_id,
    tipo_ot:             asg.tipo_ot,
    rol_trabajo:         asg.rol_trabajo,
    estado_actual:       asg.estado_actual,
    estado:              asg.estado_actual,
    running_since:       asg.running_since,
    created_at:          asg.running_since || wo.fecha_creacion || "",
    fecha_creacion:      wo.fecha_creacion || "",
    tiempo_trab_ms:      Number(asg.tiempo_trab_ms || 0),
    tiempo_ms:           Number(asg.tiempo_trab_ms || 0),
    updated_at:          asg.updated_at,
    last_nota:           asg.last_nota || "",
    vin:                 wo.vin || "",
    tipo_ramal:          wo.tipo_ramal || "",
    tipoRamal:           wo.tipo_ramal || "",
    estado_general:      wo.estado_general,
    tanque_registrado:   wo.tanque_registrado,
    reductor_registrado: wo.reductor_registrado,
    tanque_asignado:     vins.tanque_asignado   || "",
    reductor_asignado:   vins.reductor_asignado || "",
    titular_nombre:      dueno.nombre || "",
    titular_email:       dueno.email  || "",
  };
}

/**
 * Pide asignaciones a Supabase y las devuelve ya mapeadas.
 *
 * `filtro` va tal cual en la querystring. Las filas sin work_order se caen:
 * una OT sin carro no se puede pintar.
 */
async function asignaciones_(filtro, { select = SELECT_ASG, order = "updated_at.desc", limit = 0 } = {}) {
  const res = await db_("GET", `asignaciones?${filtro}` +
    `&select=${encodeURIComponent(select)}&order=${order}` +
    (limit ? `&limit=${limit}` : ""));

  const data = await res.json();
  return (data || []).map(mapAsignacion_).filter(it => it.work_order_id);
}

/**
 * GET /api/mis-activas — Obtener trabajos activos del usuario
 * ⚡ OPTIMIZADO: Filtra EN SUPABASE (no trae todo)
 */
export async function getMisActivas(email, { calidadColaborativa = false } = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  // user_id cacheado: esto corre en cada ciclo del poll
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return [];

  const items = await asignaciones_(
    `user_id=eq.${usuario.id}&activo=eq.true&estado_actual=neq.FINALIZADO`,
  );

  // OJO: no se puede cortar con `if (!items.length) return []`.
  //
  // El inspector de CALIDAD que todavía no ha abierto ningún carro propio tiene
  // la lista propia vacía, y es justo el caso en el que MÁS necesita ver la del
  // compañero: llega, no tiene nada suyo, y lo que hay que revisar son los
  // carros que el otro ya empezó. Ese corte estuvo ahí y la pantalla salía
  // vacía: la colaboración solo funcionaba si por casualidad tenías algo tuyo
  // abierto.
  if (calidadColaborativa) items.push(...await calidadDeOtros_(usuario.id));

  return await conZonas_(items);
}

/**
 * calidadDeOtros_ — las OTs de CALIDAD que el OTRO inspector ya empezó.
 *
 * El permiso para accionarlas existe desde hace tiempo (lib/colaboracion.js y
 * el 409 de /api/evento que lo consulta), pero esta consulta seguía filtrando
 * por `user_id=eq.yo`: la OT de Wilmer no salía en la pantalla de Jesús y el
 * permiso solo servía si Jesús adivinaba el VIN y lo escribía a mano. Un
 * permiso que no se ve no existe.
 *
 * Solo las TRABAJANDO/PAUSADO, que es la misma frontera del permiso: una OT
 * SIN_INICIAR no es trabajo compartido todavía y su acción rebotaría con 409.
 *
 * El crédito no se mueve: siguen siendo del titular, y por eso vuelven marcadas
 * con `ajena` y su nombre para que la tarjeta diga de quién es.
 *
 * Si la consulta falla se devuelve []: el inspector se queda sin ver las del
 * compañero, que es mucho menos grave que quedarse sin ver las suyas.
 */
async function calidadDeOtros_(userId) {
  const estados = ESTADOS_CALIDAD_COLABORATIVA.join(",");
  try {
    const items = await asignaciones_(
      `user_id=neq.${userId}&tipo_ot=eq.CALIDAD&activo=eq.true&estado_actual=in.(${estados})`,
      { select: SELECT_ASG_AJENA },
    );
    return items.map(it => ({ ...it, ajena: true }));
  } catch {
    return [];
  }
}

/**
 * conZonas_ — añade a cada trabajo la plaza donde está aparcado su carro.
 *
 * Va en una consulta aparte y no embebida en el JOIN de arriba porque
 * `conversion_zonas` cuelga del VIN y no de la asignación: PostgREST no la
 * puede alcanzar desde `asignaciones` sin una relación que no existe.
 *
 * Es una petición más por ciclo del poll, pero devuelve dos columnas por cada
 * VIN que el técnico tiene abierto —tres o cuatro— y se filtra en Supabase, no
 * aquí. Al lado de las asignaciones con su JOIN a work_orders y vins que ya
 * viajan en el mismo ciclo, no se nota.
 *
 * Si la consulta falla, los trabajos se devuelven igual y sin zona: quedarse
 * sin ver el trabajo porque no se pudo resolver un número de plaza sería un
 * intercambio pésimo.
 */
async function conZonas_(items) {
  const vins = [...new Set(items.map(it => it.vin).filter(Boolean))];
  if (!vins.length) return items;

  try {
    const lista = vins.map(encodeURIComponent).join(",");
    const res = await db_("GET", `conversion_zonas?vin=in.(${lista})&select=vin,zona_id`);

    const porVin = new Map((await res.json()).map(z => [z.vin, z.zona_id]));
    // `?? null` y no `|| null`: un carro sin plaza tiene que llegar como null
    // explícito, para que el normalizador lo distinga de "este payload no
    // habla de zonas" y no conserve una plaza vieja que ya no es cierta.
    for (const it of items) it.zona = porVin.get(it.vin) ?? null;
  } catch (err) {
    console.warn("[getMisActivas] no se pudieron resolver las zonas:", err.message);
  }

  return items;
}

/**
 * GET /api/mis-finalizadas — Obtener trabajos finalizados del usuario
 *
 * Acotado por VENTANA y TOPE, no por "todo lo del usuario". Sin ellos esta
 * consulta bajaba el historial completo del técnico —360 filas y 219 KB para
 * uno de los veteranos— cada vez que alguien tocaba "Ver finalizados", directo
 * del navegador a Supabase y sin pasar por ningún cache del servidor. Y crecía
 * sola: el mismo botón costaba más cada mes que pasaba.
 *
 * Ambos límites viven en config (LIM_FINALIZADOS_DIAS / LIM_FINALIZADOS), así
 * que se pueden abrir desde Admin si alguna vez hace falta mirar más atrás.
 */
export async function getMisFinalizadas(email) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return [];

  const dias  = Math.max(1, Number(cfg("LIM_FINALIZADOS_DIAS")) || 30);
  const tope  = Math.max(1, Number(cfg("LIM_FINALIZADOS")) || 100);
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  // El gemelo de esta consulta vive en routes/trabajo.js (/api/mis-finalizadas)
  // con los MISMOS límites: si divergieran, el técnico vería una lista distinta
  // según si Supabase está configurado o no. `activo` va en las dos — el carro
  // que se le quitó a alguien deja de estar en su lista.
  return asignaciones_(
    `user_id=eq.${usuario.id}&activo=eq.true&estado_actual=eq.FINALIZADO` +
    `&updated_at=gte.${encodeURIComponent(desde)}`,
    { limit: tope },
  );
}

/**
 * GET /api/estado — Obtener estado de un trabajo específico
 */
export async function getEstadoTrabajo(email, vin, rolTrabajo) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  
  // Obtener usuario (cacheado: esto corre cada 8 s mientras hay VIN escrito)
  const usuario = await usuarioPorEmail_(email);
  if (!usuario) return null;

  const userId = usuario.id;
  
  // Resolver work_order a partir del VIN.
  const wos = await supabaseGet("work_orders", { vin });
  if (!wos || !wos.length) return null;
  
  const workOrder = wos[0];
  
  // Query REST: asignación relevante
  const select = "id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms,updated_at,last_nota,last_nota_ts,activo";
  const res = await db_("GET", `asignaciones?work_order_id=eq.${workOrder.id}&user_id=eq.${userId}` +
    `&rol_trabajo=eq.${encodeURIComponent(rolTrabajo)}&select=${encodeURIComponent(select)}&limit=1`);

  const data = await res.json();
  const asg = Array.isArray(data) && data.length ? data[0] : null;
  
  return {
    id: asg?.id || null,
    work_order_id: workOrder.id,
    tipo_ot: asg?.tipo_ot || workOrder.tipo_ot || "CONVERSION",
    rol_trabajo: rolTrabajo,
    estado_actual: asg?.estado_actual || "SIN_INICIAR",
    running_since: asg?.running_since || null,
    tiempo_trab_ms: Number(asg?.tiempo_trab_ms || 0),
    updated_at: asg?.updated_at || workOrder.updated_at || null,
    last_nota: asg?.last_nota || "",
    last_nota_ts: asg?.last_nota_ts || null,
    activo: asg?.activo ?? false,
    vin: String(workOrder.vin || vin || "").trim().toUpperCase(),
    conversionId: workOrder.id,
    rolTrabajo,
    estado: asg?.estado_actual || "SIN_INICIAR",
    tiempoMs: Number(asg?.tiempo_trab_ms || 0),
    tiempo_ms: Number(asg?.tiempo_trab_ms || 0),
  };
}

/**
 * GET incidencias de un VIN — lectura directa Supabase
 * @param {string} vin
 * @param {{ soloActivas?: boolean }} opts - soloActivas=true filtra las no resueltas (tiempo_fin IS NULL)
 */
export async function getIncidencias(vin, { soloActivas = false } = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const filter = { vin };
  if (soloActivas) filter.tiempo_fin = { op: "is", val: "null" };
  const incidencias = await supabaseGet("incidencias", filter);

  // R2 keys contienen "/" (ej: incidencias/2026-04/VIN/archivo.jpg)
  // Drive legacy IDs NO contienen "/"
  const R2_BASE = "https://pub-c7d6e000a03d4913b0694c761ea901d2.r2.dev";
  const photoUrls = (fileId) => {
    if (!fileId) return { url: "", thumbUrl: "", imgUrl: "" };
    if (fileId.includes("/")) {
      const url = `${R2_BASE}/${fileId}`;
      return { url, thumbUrl: url, imgUrl: url };
    }
    // Legacy Drive
    return {
      url: "https://drive.google.com/file/d/" + fileId + "/view",
      thumbUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400",
      imgUrl: "https://drive.google.com/uc?export=view&id=" + fileId,
    };
  };

  return incidencias
    .map(inc => {
      const urls = photoUrls(inc.foto_file_id);
      const tInicio = inc.tiempo_inicio ? new Date(inc.tiempo_inicio) : null;
      const tFin    = inc.tiempo_fin    ? new Date(inc.tiempo_fin)    : null;
      return {
        id: inc.id,
        fecha: inc.fecha_hora,
        fecha_hora: inc.fecha_hora,
        vin: inc.vin,
        tipo: inc.tipo,
        tecnico: inc.tecnico || "",
        nota: inc.nota || "",
        registrado_por: inc.registrado_por || "",
        fotoFileId: inc.foto_file_id || "",
        fotoUrl: urls.url,
        fotoThumbUrl: urls.thumbUrl,
        fotoImgUrl: urls.imgUrl,
        fotoFolderId: inc.foto_folder_id || "",
        fotoBatchId: inc.foto_batch_id || "",
        tiempo_inicio: inc.tiempo_inicio || null,
        tiempo_fin:    inc.tiempo_fin    || null,
        resuelta_por:  inc.resuelta_por  || null,
        duracion_min: (tInicio && tFin) ? Math.round((tFin - tInicio) / 60000) : null,
      };
    })
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
}

/**
 * Marca una incidencia como resuelta vía el backend.
 * @param {string} id    - UUID de la incidencia
 * @param {string} email - email del usuario que la resuelve
 */
export async function resolverIncidencia(id, email) {
  const res = await fetch(`/api/incidencia/${encodeURIComponent(id)}/resolver`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/**
 * GET nombre del técnico a partir de su email (tabla usuarios).
 * @param {string} email
 * @returns {Promise<string|null>}
 */
export async function getNombreByEmail(email) {
  if (!supabaseEnabled()) return null;
  const usuario = await usuarioPorEmail_(email);
  return usuario?.nombre?.trim() || null;
}

/**
 * GET incidencias recientes para un técnico por nombre (columna `tecnico`).
 * @param {string} nombre    - nombre del técnico tal como está en usuarios.nombre
 * @param {string} sinceIso  - ISO date string (ej. hace 12h)
 */
export async function getIncidenciasByTecnico(nombre, sinceIso) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");
  return supabaseGet("incidencias", {
    tecnico: nombre,
    fecha_hora: { op: "gte", val: sinceIso },
    tiempo_fin: { op: "is", val: "null" },
  });
}

/**
 * GET /api/vin-suggest — Sugerir VINs por búsqueda
 * ✅ Enrutado a través del backend para evitar CORS
 */
export async function getVinSuggest(q = "", limit = 12) {
  if (!q || q.length < 1) return [];
  
  try {
    // 🔍 Usar el endpoint del backend (proxy a Supabase)
    const res = await fetch(`/api/vin-suggest?q=${encodeURIComponent(q)}&limit=${limit}`, {
      method: "GET",
    });

    if (!res.ok) {
      throw new Error(`Backend getVinSuggest: ${res.status}`);
    }

    const data = await res.json();
    return (data?.items || []).map(v => ({
      vin: v.vin,
      modelo: v.modelo,
      cliente: v.cliente,
    }));
  } catch (err) {
    console.error("[getVinSuggest] Error:", err.message);
    return [];
  }
}
