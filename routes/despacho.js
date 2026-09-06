// =========================
// routes/despacho.js
// Fase 2 — Asistencia (ingreso / salida / pausa) + pantalla TV.
//
// AISLAMIENTO: ninguna ruta de aquí toca tablas existentes. Con
// DESPACHO_MODO = 'OFF' todos los endpoints de escritura responden 503 y el
// taller opera exactamente como hoy. La pantalla en modo demo (?demo=1)
// funciona siempre, sin base de datos, para poder revisar el diseño.
// =========================

import { Router } from "express";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { getConfig_ } from "../lib/config.js";
import { requireRol_ } from "../lib/authz.js";
import { emitEvent_ } from "../lib/events.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { sendPushToEmails_ } from "../lib/push.js";
import {
  jornadaFecha_, jornadaRango_, horaPeru_, minutosDelDia_, hhmmAMinutos_,
  slotActual_, firmarSlot_, verificarToken_, tokenEstatico_,
  aplicarMarca_, reconstruirJornada_, estadoEfectivo_,
  validarDupla_, unidadesDeTrabajo_, payloadDemo_,
  enTurno_, duracionTurno_, JORNADA_INICIO_H,
  porQueMuereLaPropuesta_, proximoResponsable_, avanceSolo_, avanceSoloTodos_,
  pareoCarroExtra_, esDuplaApoyo_, esAyudaManual_,
  motivoDuplaAuto_, motivoAyudaManual_, vinDeDuplaApoyo_, validarAyudante_,
} from "../lib/despacho.js";
import { construirPool_, generarPropuestas_, puntuar_, ESPERA_TOPE_MIN } from "../lib/despacho-motor.js";

// El modelo de emparejamiento vive donde lo deja routes/ml.js al entrenar.
const PAIRING_MODEL_PATH = "./pairing-model.json";

const router = Router();

const SB = () => process.env.SUPABASE_URL;

// ─── Guardas ──────────────────────────────────────────────────────────────────

/** El módulo está apagado salvo que un admin ponga DESPACHO_MODO en SOMBRA/REAL. */
async function requireModoActivo_(req, res, next) {
  const cfg = await getConfig_();
  const modo = String(cfg.DESPACHO_MODO || "OFF").toUpperCase();
  if (modo === "OFF") {
    return res.status(503).json({
      ok: false,
      error: "El módulo de despacho está desactivado (DESPACHO_MODO=OFF).",
    });
  }
  req.despachoModo = modo;
  req.despachoCfg  = cfg;
  next();
}

// ─── Helpers de datos ─────────────────────────────────────────────────────────

async function userPorEmail_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const r = await fetch(
    `${SB()}/rest/v1/usuarios?email=eq.${encodeURIComponent(e)}&select=id,nombre,rol,especialidad,activo&limit=1`,
    { headers: supabaseHeaders_() },
  );
  const rows = r.ok ? await r.json() : [];
  return rows[0] && rows[0].activo ? rows[0] : null;
}

async function marcasDeJornada_(fecha, userId = null) {
  const filtro = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : "";
  const r = await fetch(
    `${SB()}/rest/v1/asistencia_marcas?jornada_fecha=eq.${fecha}${filtro}` +
    `&select=id,user_id,tipo,origen,ts,motivo&order=ts.asc`,
    { headers: supabaseHeaders_() },
  );
  return r.ok ? await r.json() : [];
}

/** Reescribe la proyección asistencia_jornada desde la bitácora. */
async function proyectarJornada_(fecha, userId, marcas) {
  const j = reconstruirJornada_(marcas);
  const fila = {
    jornada_fecha: fecha,
    user_id:       userId,
    estado:        j.estado,
    ingreso_at:    j.ingresoAt ? j.ingresoAt.toISOString() : null,
    salida_at:     j.salidaAt  ? j.salidaAt.toISOString()  : null,
    salida_auto:   j.salidaAuto,
    minutos_pausa: j.minutosPausa,
    pausa_desde:   j.pausaDesde ? j.pausaDesde.toISOString() : null,
    updated_at:    new Date().toISOString(),
  };
  await fetch(`${SB()}/rest/v1/asistencia_jornada`, {
    method:  "POST",
    headers: { ...supabaseHeaders_(), "Prefer": "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify(fila),
  });
  return j;
}

/**
 * Al marcar salida, deja sus carros en PAUSADO.
 *
 * No se cierran ni se liberan: el trabajo hecho queda contabilizado y el carro
 * sigue siendo suyo para retomarlo mañana. Acumula el tiempo corrido igual que
 * lo haría una pausa normal, para no regalar horas de reloj a nadie.
 */
async function pausarTrabajoDe_(userId) {
  try {
    const abiertas = await fetch(
      `${SB()}/rest/v1/asignaciones?user_id=eq.${userId}&activo=eq.true` +
      `&estado_actual=in.(TRABAJANDO,SIN_INICIAR)&select=id,estado_actual,running_since,tiempo_trab_ms`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    if (!abiertas.length) return 0;

    const ahora = Date.now();
    for (const a of abiertas) {
      const corrido = a.estado_actual === "TRABAJANDO" && a.running_since
        ? ahora - new Date(a.running_since).getTime()
        : 0;
      await fetch(`${SB()}/rest/v1/asignaciones?id=eq.${a.id}`, {
        method: "PATCH",
        headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
        body: JSON.stringify({
          estado_actual: "PAUSADO",
          running_since: null,
          tiempo_trab_ms: (a.tiempo_trab_ms || 0) + corrido,
          updated_at: new Date().toISOString(),
          last_nota: "Pausado por salida del taller",
          last_nota_ts: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
    emitEvent_("asignaciones", { accion: "PAUSA_SALIDA" });
    return abiertas.length;
  } catch { return 0; }
}

/** ¿Tiene alguna asignación de conversión en curso? → Set<user_id> */
async function tecnicosOcupados_() {
  const ocupados = new Set();
  try {
    const r = await fetch(
      `${SB()}/rest/v1/asignaciones?activo=eq.true&estado_actual=in.(SIN_INICIAR,TRABAJANDO,PAUSADO)` +
      `&tipo_ot=eq.CONVERSION&select=user_id`,
      { headers: supabaseHeaders_() },
    );
    if (r.ok) for (const a of await r.json()) ocupados.add(a.user_id);
  } catch { /* sin datos → nadie ocupado */ }
  return ocupados;
}

// ─── QR ROTATIVO ──────────────────────────────────────────────────────────────

/**
 * ¿El QR está en modo fijo? Es el modo "todavía no hay TV": sin pantalla en el
 * taller no hay dónde mostrar un código que rota, así que el papel impreso vale
 * todo el día. Se apaga solo (vuelve a rotar) poniendo DESPACHO_QR_ESTATICO=0.
 */
function qrEstatico_(cfg) {
  return String(cfg?.DESPACHO_QR_ESTATICO ?? "0") === "1";
}

// GET /api/despacho/qr
// La TV pide un token nuevo cada ventana y lo pinta como QR. El técnico lo
// escanea desde su celular — así la marca prueba que estuvo en el taller.
// En modo fijo devuelve siempre el mismo token y sin cuenta regresiva.
router.get("/api/despacho/qr", async (req, res) => {
  const cfg = await getConfig_();
  if (qrEstatico_(cfg)) {
    return res.json({ ok: true, token: tokenEstatico_(), estatico: true, ventanaSeg: 0, expiraEn: null });
  }
  const ventana = Number(cfg.DESPACHO_QR_VENTANA_SEG) || 30;
  const slot = slotActual_(ventana);
  const expiraEn = ventana - Math.floor((Date.now() / 1000) % ventana);
  res.json({ ok: true, token: firmarSlot_(slot), estatico: false, ventanaSeg: ventana, expiraEn });
});

// GET /api/despacho/qr.svg — el QR ya renderizado, para que la TV solo tenga
// que refrescar un <img> y no necesite librería de QR en el cliente.
// El código apunta a /marcar?t=<token>: el celular abre esa página y marca.
router.get("/api/despacho/qr.svg", async (req, res) => {
  try {
    const cfg = await getConfig_();
    const ventana = Number(cfg.DESPACHO_QR_VENTANA_SEG) || 30;
    const token = qrEstatico_(cfg) ? tokenEstatico_() : firmarSlot_(slotActual_(ventana));
    const base = `${req.protocol}://${req.get("host")}`;
    // margin va en MÓDULOS, no en píxeles: es la "zona quieta" blanca que el
    // estándar QR exige alrededor del código. Con 1 sola (lo que había) el
    // fondo oscuro de la TV queda pegado al patrón y los lectores estrictos
    // se traban. 4 es lo que pide la norma.
    //
    // Ojo: la zona quieta vive DENTRO del SVG, así que al subirla el código
    // ocupa proporcionalmente menos del <img>. Los tamaños en public/tv.html
    // están compensados para que el módulo siga midiendo lo mismo en pantalla.
    const svg = await QRCode.toString(`${base}/marcar?t=${token}`, {
      type: "svg", margin: 4, errorCorrectionLevel: "M",
      color: { dark: "#0c0e11", light: "#ffffff" },
    });
    res.setHeader("Cache-Control", "no-store");
    res.type("image/svg+xml").send(svg);
  } catch (e) {
    res.status(500).send(`<!-- ${e.message} -->`);
  }
});

// GET /marcar — página que abre el celular al escanear el QR.
router.get("/marcar", (_req, res) => {
  try {
    res.type("html").send(readFileSync(resolve("./public/marcar.html"), "utf8"));
  } catch {
    res.status(404).send("marcar.html no encontrado");
  }
});

// GET /qr-tv — pantalla dedicada al QR, a pantalla completa.
// Mientras no haya TV montada, el código tiene que poder vivir en cualquier
// parte: una laptop en la puerta, el celular del supervisor o una hoja
// impresa. /tv es el tablero entero y ahí el QR es una esquina del pie —
// puesta a tres metros, esa esquina no se escanea.
// /qrtv y /qr responden igual: es una URL que alguien va a teclear de memoria.
router.get(["/qr-tv", "/qrtv", "/qr"], (_req, res) => {
  try {
    res.type("html").send(readFileSync(resolve("./public/qr-tv.html"), "utf8"));
  } catch {
    res.status(404).send("qr-tv.html no encontrado");
  }
});

// ─── ASISTENCIA ───────────────────────────────────────────────────────────────

// POST /api/despacho/marcar  { email, token, tipo? }
// Sin `tipo` alterna según el estado: fuera → INGRESO, dentro → SALIDA.
router.post("/api/despacho/marcar", requireModoActivo_, async (req, res) => {
  try {
    const { email, token, tipo } = req.body || {};
    const cfg = req.despachoCfg;

    const ver = verificarToken_(
      token, Number(cfg.DESPACHO_QR_VENTANA_SEG) || 30, new Date(),
      { estatico: qrEstatico_(cfg) },
    );
    if (!ver.ok) return res.status(400).json({ ok: false, error: ver.error });

    const user = await userPorEmail_(email);
    if (!user) return res.status(403).json({ ok: false, error: "Usuario no encontrado o inactivo" });

    const fecha  = jornadaFecha_();
    const marcas = await marcasDeJornada_(fecha, user.id);
    const actual = reconstruirJornada_(marcas).estado;

    const tipoFinal = tipo || (actual === "FUERA" ? "INGRESO" : "SALIDA");
    const paso = aplicarMarca_(actual, tipoFinal);
    if (!paso.ok) return res.status(409).json({ ok: false, error: paso.error, estado: actual });

    const insert = await fetch(`${SB()}/rest/v1/asistencia_marcas`, {
      method:  "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "return=representation" },
      body:    JSON.stringify({
        user_id: user.id, tipo: tipoFinal, origen: "QR",
        // Con el QR fijo `ver.slot` es null y no se escribe slot: el índice
        // único (token_slot, user_id) es parcial (WHERE token_slot IS NOT NULL),
        // así que ingreso y salida del mismo día dejan de chocar entre sí.
        token_slot: ver.slot ?? null, registrado_por: user.id,
      }),
    });

    if (!insert.ok) {
      const txt = await insert.text().catch(() => "");
      // Choque contra idx_asis_token_slot: alguien ya usó ese código.
      if (/duplicate key|23505/.test(txt)) {
        return res.status(409).json({
          ok: false,
          error: "Ese código ya fue usado. Espera el siguiente en la pantalla.",
        });
      }
      throw new Error(txt.slice(0, 200));
    }

    const marcasAct = [...marcas, (await insert.json())[0]];
    const j = await proyectarJornada_(fecha, user.id, marcasAct);

    // Al salir, sus carros quedan pausados: el avance se conserva y el
    // cronómetro deja de correr mientras no está en el taller.
    let pausados = 0;
    if (tipoFinal === "SALIDA" || tipoFinal === "CIERRE_AUTO") {
      pausados = await pausarTrabajoDe_(user.id);
    }
    emitEvent_("despacho", { tipo: tipoFinal, user_id: user.id });

    // El que acaba de llegar ya es repartible: sin esto esperaba al intervalo.
    if (tipoFinal === "INGRESO") repartirTrasEvento_(`INGRESO de ${user.nombre || user.id}`);

    res.json({
      ok: true, tipo: tipoFinal, estado: j.estado,
      nombre: user.nombre, hora: horaPeru_(), pausados,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/pausa  { email, activar }
// La pausa es lo que evita asignarle un carro a alguien que está almorzando.
router.post("/api/despacho/pausa", requireModoActivo_, async (req, res) => {
  try {
    const { email, activar, motivo } = req.body || {};
    const user = await userPorEmail_(email);
    if (!user) return res.status(403).json({ ok: false, error: "Usuario no encontrado o inactivo" });

    const fecha  = jornadaFecha_();
    const marcas = await marcasDeJornada_(fecha, user.id);
    const actual = reconstruirJornada_(marcas).estado;

    const tipoFinal = activar ? "PAUSA_INI" : "PAUSA_FIN";
    const paso = aplicarMarca_(actual, tipoFinal);
    if (!paso.ok) return res.status(409).json({ ok: false, error: paso.error, estado: actual });

    const insert = await fetch(`${SB()}/rest/v1/asistencia_marcas`, {
      method:  "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "return=representation" },
      body:    JSON.stringify({
        user_id: user.id, tipo: tipoFinal, origen: "MANUAL_SUPERVISOR",
        registrado_por: user.id, motivo: String(motivo || "").slice(0, 200),
      }),
    });
    if (!insert.ok) throw new Error((await insert.text()).slice(0, 200));

    const j = await proyectarJornada_(fecha, user.id, [...marcas, (await insert.json())[0]]);
    emitEvent_("despacho", { tipo: tipoFinal, user_id: user.id });
    if (tipoFinal === "PAUSA_FIN") repartirTrasEvento_(`fin de pausa de ${user.id}`);
    res.json({ ok: true, estado: j.estado });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/marcar-manual  { email, targetUserId, tipo, motivo }
// Respaldo para técnico sin celular o sin batería. Queda auditado quién marcó
// por quién: `registrado_por` es el supervisor, no el técnico.
router.post("/api/despacho/marcar-manual", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { email, targetUserId, tipo, motivo } = req.body || {};
    if (!targetUserId || !tipo) {
      return res.status(400).json({ ok: false, error: "Falta targetUserId o tipo" });
    }
    const sup = await userPorEmail_(email);

    const fecha  = jornadaFecha_();
    const marcas = await marcasDeJornada_(fecha, targetUserId);
    const actual = reconstruirJornada_(marcas).estado;

    const paso = aplicarMarca_(actual, tipo);
    if (!paso.ok) return res.status(409).json({ ok: false, error: paso.error, estado: actual });

    const insert = await fetch(`${SB()}/rest/v1/asistencia_marcas`, {
      method:  "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "return=representation" },
      body:    JSON.stringify({
        user_id: targetUserId, tipo, origen: "MANUAL_SUPERVISOR",
        registrado_por: sup?.id || null, motivo: String(motivo || "").slice(0, 200),
      }),
    });
    if (!insert.ok) throw new Error((await insert.text()).slice(0, 200));

    const j = await proyectarJornada_(fecha, targetUserId, [...marcas, (await insert.json())[0]]);

    // Una salida es una salida, la haya marcado el técnico con el QR o el
    // supervisor por él. Este camino no pausaba nada: al técnico sin celular le
    // seguía corriendo el cronómetro toda la noche, que es justo lo que la
    // pausa por salida existe para evitar.
    let pausados = 0;
    if (tipo === "SALIDA" || tipo === "CIERRE_AUTO") {
      pausados = await pausarTrabajoDe_(targetUserId);
    }
    emitEvent_("despacho", { tipo, user_id: targetUserId });
    if (tipo === "INGRESO" || tipo === "PAUSA_FIN") {
      repartirTrasEvento_(`marca ${tipo} puesta por supervisión`);
    }
    res.json({ ok: true, estado: j.estado, pausados });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/despacho/mi-estado?email=
router.get("/api/despacho/mi-estado", requireModoActivo_, async (req, res) => {
  try {
    const user = await userPorEmail_(req.query.email);
    if (!user) return res.status(403).json({ ok: false, error: "Usuario no encontrado" });

    const fecha  = jornadaFecha_();
    const marcas = await marcasDeJornada_(fecha, user.id);
    const j = reconstruirJornada_(marcas);
    const ocupados = await tecnicosOcupados_();

    const turnoMin = hhmmAMinutos_(req.despachoCfg.DESPACHO_TURNO_INICIO) ?? 420;
    const turnoFin = hhmmAMinutos_(req.despachoCfg.DESPACHO_TURNO_FIN) ?? 60;
    const efectivo = estadoEfectivo_(j.estado, {
      turnoInicioMin: turnoMin,
      turnoFinMin: turnoFin,
      ahoraMin: minutosDelDia_(),
      tieneTrabajo: ocupados.has(user.id),
    });

    res.json({
      ok: true, jornada: fecha, nombre: user.nombre, userId: user.id,
      estado: j.estado, estadoEfectivo: efectivo,
      ingreso: j.ingresoAt, salida: j.salidaAt,
      minutosPausa: j.minutosPausa,
      marcas: marcas.map(m => ({ tipo: m.tipo, ts: m.ts, origen: m.origen })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/despacho/asistencia — panorama de la jornada (supervisor / TV)
router.get("/api/despacho/asistencia", requireModoActivo_, async (req, res) => {
  try {
    const fecha  = jornadaFecha_();
    const cfg    = req.despachoCfg;
    const turnoMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
    const turnoFin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
    const ahoraMin = minutosDelDia_();

    const [uResp, marcas, ocupados] = await Promise.all([
      fetch(`${SB()}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,especialidad&order=nombre.asc`,
        { headers: supabaseHeaders_() }),
      marcasDeJornada_(fecha),
      tecnicosOcupados_(),
    ]);
    const tecnicos = uResp.ok ? await uResp.json() : [];

    const porUser = new Map();
    for (const m of marcas) {
      if (!porUser.has(m.user_id)) porUser.set(m.user_id, []);
      porUser.get(m.user_id).push(m);
    }

    const filas = tecnicos.map(t => {
      const j = reconstruirJornada_(porUser.get(t.id) || []);
      return {
        user_id: t.id, nombre: t.nombre, especialidad: t.especialidad,
        estado: j.estado,
        estadoEfectivo: estadoEfectivo_(j.estado, {
          turnoInicioMin: turnoMin, turnoFinMin: turnoFin,
          ahoraMin, tieneTrabajo: ocupados.has(t.id),
        }),
        ingreso: j.ingresoAt, salida: j.salidaAt, minutosPausa: j.minutosPausa,
      };
    });

    res.json({
      ok: true, jornada: fecha, hora: horaPeru_(), modo: req.despachoModo,
      presentes: filas.filter(f => f.estado !== "FUERA").length,
      total: filas.length,
      tecnicos: filas,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── DUPLAS DE TRABAJO ────────────────────────────────────────────────────────
// Dos técnicos del mismo rol que trabajan juntos. Existen para que el motor
// asigne por UNIDAD y no por persona: una dupla ocupa un solo puesto de carro
// a la vez, que es lo que impide que dos tanqueros acaparen dos zonas.

/** Duplas de la jornada con sus miembros resueltos. */
async function duplasDeJornada_(fecha, estados = ["PENDIENTE", "ACTIVA"]) {
  const filtro = `&estado=in.(${estados.join(",")})`;
  const r = await fetch(
    `${SB()}/rest/v1/despacho_duplas?jornada_fecha=eq.${fecha}${filtro}` +
    `&select=id,rol_trabajo,lider_user_id,estado,ultimo_responsable_user_id,carros_asignados,propuesta_at,confirmada_at,motivo`,
    { headers: supabaseHeaders_() },
  );
  const duplas = r.ok ? await r.json() : [];
  if (!duplas.length) return [];

  const ids = duplas.map(d => d.id).join(",");
  const mr = await fetch(
    `${SB()}/rest/v1/despacho_dupla_miembros?dupla_id=in.(${encodeURIComponent(ids)})&select=dupla_id,user_id`,
    { headers: supabaseHeaders_() },
  );
  const miembros = mr.ok ? await mr.json() : [];

  return duplas.map(d => ({
    ...d,
    // Ordenados: el A y el B de la alternancia tienen que ser los mismos en el
    // motor y en el botón de avanzar. Sin orden fijo, PostgREST puede devolver
    // los miembros al revés entre una llamada y otra y el primer carro de la
    // dupla caería en quien tocara.
    miembros: miembros.filter(m => m.dupla_id === d.id)
      .map(m => m.user_id).sort(),
  }));
}

/** vin → zona donde está estacionado ahora. */
async function zonasDeVins_(vins) {
  const lista = [...new Set(vins)].filter(Boolean);
  if (!lista.length) return new Map();
  const r = await fetch(
    `${SB()}/rest/v1/conversion_zonas?vin=in.(${lista.map(encodeURIComponent).join(",")})&select=vin,zona_id`,
    { headers: supabaseHeaders_() },
  );
  return new Map((r.ok ? await r.json() : []).map(z => [z.vin, z.zona_id]));
}

/** user_id → nombre, para no repetir el fetch en cada handler. */
async function nombresDe_(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const r = await fetch(
    `${SB()}/rest/v1/usuarios?id=in.(${encodeURIComponent(ids.join(","))})&select=id,nombre`,
    { headers: supabaseHeaders_() },
  );
  const rows = r.ok ? await r.json() : [];
  return new Map(rows.map(u => [u.id, u.nombre]));
}

// GET /api/despacho/duplas — estado de las duplas de hoy
router.get("/api/despacho/duplas", requireModoActivo_, async (req, res) => {
  try {
    const fecha  = jornadaFecha_();
    const duplas = await duplasDeJornada_(fecha);
    const nombres = await nombresDe_(duplas.flatMap(d => d.miembros));

    // Las automáticas cuelgan de un carro concreto: sin la zona, el ayudante
    // sabe con quién trabaja pero no adónde ir.
    const zonaPorVin = await zonasDeVins_(
      duplas.filter(esDuplaApoyo_).map(vinDeDuplaApoyo_).filter(Boolean));

    // Con email, se devuelve también QUIÉN pregunta: la app necesita el user_id
    // para saber de qué lado de la dupla está, y sin esto tendría que pedirlo a
    // /mi-estado en una segunda llamada solo para eso.
    const yo = req.query.email ? await userPorEmail_(req.query.email) : null;

    res.json({
      ok: true, jornada: fecha, userId: yo?.id || null,
      duplas: duplas.map(d => {
        const apoyo = esDuplaApoyo_(d);
        const vin = apoyo ? vinDeDuplaApoyo_(d) : null;
        return {
          ...d,
          miembrosNombres: d.miembros.map(id => nombres.get(id) || ""),
          // `auto` = es una dupla de apoyo atada a un carro (la pinta la app del
          // técnico igual venga del motor o del supervisor); `manual` dice cuál
          // de las dos, que es lo único que cambia el texto.
          auto: apoyo,
          manual: esAyudaManual_(d),
          vin,
          zonaId: vin ? (zonaPorVin.get(vin) ?? null) : null,
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/despacho/companeros?email= — con quién puede emparejarse
// Solo técnicos presentes hoy, del mismo rol, que no estén ya en una dupla.
router.get("/api/despacho/companeros", requireModoActivo_, async (req, res) => {
  try {
    const yo = await userPorEmail_(req.query.email);
    if (!yo) return res.status(403).json({ ok: false, error: "Usuario no encontrado" });

    const fecha = jornadaFecha_();
    const [uResp, marcas, duplas] = await Promise.all([
      // `activo` va en el select aunque el filtro ya lo garantice: validarDupla_
      // lo relee por su cuenta, y con la columna ausente leía `undefined` →
      // "Hay un técnico inactivo" para TODOS. La lista salía siempre vacía.
      fetch(`${SB()}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,especialidad,activo&order=nombre.asc`,
        { headers: supabaseHeaders_() }),
      marcasDeJornada_(fecha),
      duplasDeJornada_(fecha),
    ]);
    const tecnicos = uResp.ok ? await uResp.json() : [];

    const enDupla = new Set(duplas.flatMap(d => d.miembros));
    const porUser = new Map();
    for (const m of marcas) {
      if (!porUser.has(m.user_id)) porUser.set(m.user_id, []);
      porUser.get(m.user_id).push(m);
    }

    const candidatos = tecnicos.filter(t => {
      if (t.id === yo.id) return false;
      if (enDupla.has(t.id)) return false;
      // Presente hoy: emparejarse con alguien que no vino no tiene sentido.
      if (reconstruirJornada_(porUser.get(t.id) || []).estado === "FUERA") return false;
      return validarDupla_(yo, t).ok;
    });

    res.json({
      ok: true,
      yaEnDupla: enDupla.has(yo.id),
      candidatos: candidatos.map(t => ({ id: t.id, nombre: t.nombre, especialidad: t.especialidad })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/dupla/proponer  { email, socioUserId, rol? }
// Queda PENDIENTE hasta que el compañero confirme desde su celular: nadie
// debe poder inscribir a otro en una dupla que le afecta su crédito.
router.post("/api/despacho/dupla/proponer", requireModoActivo_, async (req, res) => {
  try {
    const { email, socioUserId, rol } = req.body || {};
    const yo = await userPorEmail_(email);
    if (!yo) return res.status(403).json({ ok: false, error: "Usuario no encontrado" });

    const sr = await fetch(
      `${SB()}/rest/v1/usuarios?id=eq.${encodeURIComponent(socioUserId || "")}&select=id,nombre,especialidad,activo&limit=1`,
      { headers: supabaseHeaders_() },
    );
    const socio = sr.ok ? (await sr.json())[0] : null;
    if (!socio) return res.status(404).json({ ok: false, error: "Compañero no encontrado" });

    const fecha  = jornadaFecha_();
    const duplas = await duplasDeJornada_(fecha);
    const enDupla = new Set(duplas.flatMap(d => d.miembros));

    const v = validarDupla_(yo, socio, { yaEnDupla: enDupla });
    if (!v.ok) return res.status(409).json({ ok: false, error: v.error });

    const rolFinal = v.rol || String(rol || "").toUpperCase();
    if (!rolFinal || !["MOTOR", "TANQUE"].includes(rolFinal)) {
      return res.status(400).json({ ok: false, error: "Indica el rol de la dupla (MOTOR o TANQUE)" });
    }

    const dr = await fetch(`${SB()}/rest/v1/despacho_duplas`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
      body: JSON.stringify({
        jornada_fecha: fecha, rol_trabajo: rolFinal,
        lider_user_id: yo.id, estado: "PENDIENTE",
      }),
    });
    if (!dr.ok) throw new Error((await dr.text()).slice(0, 200));
    const dupla = (await dr.json())[0];

    // activa=false hasta que confirme: así el índice único no bloquea a nadie
    // por una propuesta que quizá se rechace.
    const mr = await fetch(`${SB()}/rest/v1/despacho_dupla_miembros`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify([
        { dupla_id: dupla.id, user_id: yo.id,    jornada_fecha: fecha, activa: false },
        { dupla_id: dupla.id, user_id: socio.id, jornada_fecha: fecha, activa: false },
      ]),
    });
    if (!mr.ok) throw new Error((await mr.text()).slice(0, 200));

    emitEvent_("despacho", { tipo: "DUPLA_PROPUESTA", dupla_id: dupla.id });
    res.json({
      ok: true, duplaId: dupla.id, rol: rolFinal,
      esperandoA: socio.nombre,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/dupla/crear  { email, aUserId, bUserId, rol? }
// La misma dupla, armada desde la consola del taller. Nace ACTIVA sin esperar
// confirmación: el técnico invita a un igual y por eso el otro tiene que
// aceptar, pero el supervisor no invita — manda. Pedirle un tap al celular de
// alguien que está bajo un carro solo dejaría la orden a medias.
//
// Es una dupla DE TRABAJO, no un apoyo: no cuelga de ningún carro, recibe
// carros como unidad y reparte el crédito alternado. Vive hasta que alguien la
// disuelva (POST /dupla/disolver, que ya acepta supervisores).
router.post("/api/despacho/dupla/crear", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { aUserId, bUserId, rol } = req.body || {};
    if (!aUserId || !bUserId) {
      return res.status(400).json({ ok: false, error: "Elige a los dos técnicos" });
    }

    const ur = await fetch(
      `${SB()}/rest/v1/usuarios?id=in.(${encodeURIComponent([aUserId, bUserId].join(","))})` +
      `&select=id,nombre,email,especialidad,activo`,
      { headers: supabaseHeaders_() },
    );
    const users = ur.ok ? await ur.json() : [];
    const a = users.find(u => u.id === aUserId);
    const b = users.find(u => u.id === bUserId);
    if (!a || !b) return res.status(404).json({ ok: false, error: "Técnico no encontrado" });

    const fecha   = jornadaFecha_();
    const duplas  = await duplasDeJornada_(fecha);
    const enDupla = new Set(duplas.flatMap(d => d.miembros));

    const v = validarDupla_(a, b, { yaEnDupla: enDupla });
    if (!v.ok) return res.status(409).json({ ok: false, error: v.error });

    const rolFinal = v.rol || String(rol || "").toUpperCase();
    if (!["MOTOR", "TANQUE"].includes(rolFinal)) {
      return res.status(400).json({ ok: false, error: "Indica el rol de la dupla (MOTOR o TANQUE)" });
    }

    const ahora = new Date().toISOString();
    const dr = await fetch(`${SB()}/rest/v1/despacho_duplas`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
      body: JSON.stringify({
        jornada_fecha: fecha, rol_trabajo: rolFinal,
        lider_user_id: a.id, estado: "ACTIVA", confirmada_at: ahora,
        motivo: "SUPERVISOR",
      }),
    });
    if (!dr.ok) throw new Error((await dr.text()).slice(0, 200));
    const dupla = (await dr.json())[0];

    const mr = await fetch(`${SB()}/rest/v1/despacho_dupla_miembros`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify([
        { dupla_id: dupla.id, user_id: a.id, jornada_fecha: fecha, activa: true },
        { dupla_id: dupla.id, user_id: b.id, jornada_fecha: fecha, activa: true },
      ]),
    });
    if (!mr.ok) {
      // Alguien entró a otra dupla entre la lectura y el insert. La cabecera
      // huérfana se borra: viva contaría como dupla del día sin serlo.
      const txt = await mr.text();
      await fetch(`${SB()}/rest/v1/despacho_duplas?id=eq.${dupla.id}`, {
        method: "DELETE", headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      }).catch(() => {});
      if (/duplicate key|23505/.test(txt)) {
        return res.status(409).json({ ok: false, error: "Uno de los dos ya entró en otra dupla hoy" });
      }
      throw new Error(txt.slice(0, 200));
    }

    // Los dos tienen que enterarse ahora: a partir de este momento reciben UN
    // carro entre los dos, y quien no lo sepa va a seguir esperando el suyo.
    await sendPushToEmails_([a.email, b.email].filter(Boolean), {
      title: "🤝 Trabajas en dupla",
      body: `${rolFinal} · ${primerNombre_(a.nombre)} y ${primerNombre_(b.nombre)}`,
    }).catch(() => {});

    emitEvent_("despacho", {
      tipo: "DUPLA_ACTIVA", dupla_id: dupla.id, user_ids: [a.id, b.id],
    });
    res.json({ ok: true, duplaId: dupla.id, rol: rolFinal, miembros: [a.nombre, b.nombre] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/dupla/confirmar  { email, duplaId }
// Solo el compañero invitado puede confirmar — no el que propuso.
router.post("/api/despacho/dupla/confirmar", requireModoActivo_, async (req, res) => {
  try {
    const { email, duplaId } = req.body || {};
    const yo = await userPorEmail_(email);
    if (!yo) return res.status(403).json({ ok: false, error: "Usuario no encontrado" });

    const fecha  = jornadaFecha_();
    const duplas = await duplasDeJornada_(fecha);
    const dupla  = duplas.find(d => d.id === duplaId);

    if (!dupla)                       return res.status(404).json({ ok: false, error: "Dupla no encontrada" });
    if (dupla.estado !== "PENDIENTE") return res.status(409).json({ ok: false, error: "Esa dupla ya no está pendiente" });
    if (!dupla.miembros.includes(yo.id)) return res.status(403).json({ ok: false, error: "No eres parte de esa dupla" });
    if (dupla.lider_user_id === yo.id)   return res.status(403).json({ ok: false, error: "Debe confirmarla tu compañero" });

    // Si alguno entró a otra dupla mientras esta esperaba, el índice único de
    // la BD lo va a rechazar; se traduce a un mensaje legible.
    const up = await fetch(
      `${SB()}/rest/v1/despacho_dupla_miembros?dupla_id=eq.${dupla.id}`,
      {
        method: "PATCH",
        headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
        body: JSON.stringify({ activa: true }),
      },
    );
    if (!up.ok) {
      const txt = await up.text();
      if (/duplicate key|23505/.test(txt)) {
        return res.status(409).json({ ok: false, error: "Uno de los dos ya entró en otra dupla hoy" });
      }
      throw new Error(txt.slice(0, 200));
    }

    await fetch(`${SB()}/rest/v1/despacho_duplas?id=eq.${dupla.id}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({ estado: "ACTIVA", confirmada_at: new Date().toISOString() }),
    });

    emitEvent_("despacho", { tipo: "DUPLA_ACTIVA", dupla_id: dupla.id });
    // La dupla recién aceptada es una unidad asignable: repartir ya, o los dos
    // se quedan mirando el techo hasta el siguiente intervalo.
    repartirTrasEvento_(`dupla ${dupla.id} ACTIVA`);
    res.json({ ok: true, estado: "ACTIVA" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/dupla/disolver  { email, duplaId, motivo }
// Cualquiera de los dos, o un supervisor, puede romperla. El carro que esté
// en curso NO se toca: se termina como está y la disolución aplica al siguiente.
router.post("/api/despacho/dupla/disolver", requireModoActivo_, async (req, res) => {
  try {
    const { email, duplaId, motivo } = req.body || {};
    const yo = await userPorEmail_(email);
    if (!yo) return res.status(403).json({ ok: false, error: "Usuario no encontrado" });

    const fecha  = jornadaFecha_();
    const duplas = await duplasDeJornada_(fecha);
    const dupla  = duplas.find(d => d.id === duplaId);
    if (!dupla) return res.status(404).json({ ok: false, error: "Dupla no encontrada" });

    const esMiembro = dupla.miembros.includes(yo.id);
    const esSuper   = ["SUPERVISOR", "ADMIN"].includes(String(yo.rol || "").toUpperCase());
    if (!esMiembro && !esSuper) {
      return res.status(403).json({ ok: false, error: "No puedes disolver esa dupla" });
    }

    const nuevoEstado = dupla.estado === "PENDIENTE" ? "RECHAZADA" : "DISUELTA";
    await fetch(`${SB()}/rest/v1/despacho_dupla_miembros?dupla_id=eq.${dupla.id}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({ activa: false }),
    });
    await fetch(`${SB()}/rest/v1/despacho_duplas?id=eq.${dupla.id}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        estado: nuevoEstado,
        disuelta_at: new Date().toISOString(),
        disuelta_por: yo.id,
        motivo: String(motivo || "").slice(0, 200),
      }),
    });

    emitEvent_("despacho", { tipo: "DUPLA_DISUELTA", dupla_id: dupla.id });
    // Al deshacerse la dupla sus dos miembros vuelven a la cola por separado.
    repartirTrasEvento_(`dupla ${dupla.id} disuelta`);
    res.json({ ok: true, estado: nuevoEstado });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── CIERRE AUTOMÁTICO DE JORNADA ─────────────────────────────────────────────
// Sin esto, en una semana hay ocho técnicos eternamente "presentes" porque
// nadie marca salida un viernes a las 6 pm. La salida sintética queda marcada
// como CIERRE_AUTO para no confundirla con una salida real.

export async function cerrarJornadaPendiente_() {
  try {
    const cfg = await getConfig_();
    if (String(cfg.DESPACHO_MODO || "OFF").toUpperCase() === "OFF") return;

    const fecha  = jornadaFecha_();
    const marcas = await marcasDeJornada_(fecha);
    const porUser = new Map();
    for (const m of marcas) {
      if (!porUser.has(m.user_id)) porUser.set(m.user_id, []);
      porUser.get(m.user_id).push(m);
    }

    let cerrados = 0;
    for (const [userId, ms] of porUser) {
      const j = reconstruirJornada_(ms);
      if (j.estado === "FUERA") continue;
      await fetch(`${SB()}/rest/v1/asistencia_marcas`, {
        method:  "POST",
        headers: { ...supabaseHeaders_(), "Prefer": "return=minimal" },
        body:    JSON.stringify({
          user_id: userId, tipo: "CIERRE_AUTO", origen: "AUTO",
          motivo: "Salida no registrada — cierre automático de jornada",
        }),
      });
      await proyectarJornada_(fecha, userId, [
        ...ms, { tipo: "CIERRE_AUTO", ts: new Date().toISOString() },
      ]);
      await pausarTrabajoDe_(userId);   // mismo criterio que una salida normal
      cerrados++;
    }
    if (cerrados) {
      console.log(`[Despacho] Cierre automático: ${cerrados} técnico(s) sin salida.`);
      emitEvent_("despacho", { tipo: "CIERRE_JORNADA" });
    }
  } catch (e) {
    console.warn("[Despacho] Cierre automático falló:", e.message);
  }
}

/** Revisa cada 15 min y cierra cuando pasó la hora de fin de jornada. */
export function scheduleCierreJornada_() {
  const CHECK_MS = 15 * 60_000;
  setInterval(async () => {
    try {
      const cfg = await getConfig_();
      if (String(cfg.DESPACHO_MODO || "OFF").toUpperCase() === "OFF") return;
      const finMin = hhmmAMinutos_(cfg.DESPACHO_JORNADA_FIN) ?? 300;
      const ahora  = minutosDelDia_();
      // La jornada termina de madrugada: solo actuamos en esa franja.
      if (ahora >= finMin && ahora < finMin + 30) await cerrarJornadaPendiente_();
    } catch { /* silencioso: es una tarea de fondo */ }
  }, CHECK_MS).unref?.();
}

// ─── MOTOR DE DESPACHO (Fase 3) ───────────────────────────────────────────────
// Junta los datos del taller, llama al motor puro (lib/despacho-motor.js) y
// guarda lo que habría asignado. En modo SOMBRA no publica nada: los técnicos
// siguen eligiendo, y al cierre se compara la decisión del motor contra la
// realidad para saber si acertaba ANTES de dejarlo mandar.

/** El modelo de emparejamiento entrenado, si existe. */
function leerPairingModel_() {
  try {
    if (!existsSync(PAIRING_MODEL_PATH)) return null;
    return JSON.parse(readFileSync(PAIRING_MODEL_PATH, "utf8"));
  } catch { return null; }
}

/**
 * Unidades asignables a partir de los técnicos y las duplas vigentes.
 *
 * Está fuera de contextoDelTaller_ porque hay que rehacerlas DENTRO de la misma
 * corrida: la dupla automática del carro extra nace después de leer el taller y
 * antes de repartir, y unas unidades calculadas con las duplas de hace un
 * segundo le darían carro propio a quien acaba de quedar de ayudante.
 */
function armarUnidades_(tecnicosCtx, duplas, cfg) {
  return unidadesDeTrabajo_(tecnicosCtx, duplas, {
    ttlPendienteMin: Number(cfg.DESPACHO_TTL_DUPLA_MIN) || 10,
  }).map(u => ({
    ...u,
    // La unidad hereda la zona del miembro que la tenga más reciente.
    zonaUltima: u.miembros.map(m => m.zonaUltima).find(Boolean) || null,
  }));
}

/** Todo lo que el motor necesita saber del taller, en una sola pasada. */
async function contextoDelTaller_(cfg, fecha) {
  const { desde } = jornadaRango_(fecha);
  const h = supabaseHeaders_();

  // ── Ronda 1: lo que no depende de nada ──
  // OJO: las OTs y las asignaciones NO se pueden traer con un `limit` a secas.
  // work_orders tiene años de historia y sin ORDER BY el límite devuelve un
  // subconjunto arbitrario: las OTs de los carros que están AHORA en el taller
  // pueden no venir. Se filtran por los VINs en zona, que son ~15.
  const [zRes, ldRes, uRes, marcas, duplas, ocupadosGlobal] = await Promise.all([
    fetch(`${SB()}/rest/v1/conversion_zonas?select=zona_id,vin,registrado_at&order=zona_id.asc`, { headers: h }),
    fetch(`${SB()}/rest/v1/lista_diaria_activa?select=vin`, { headers: h }),
    fetch(`${SB()}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,especialidad`, { headers: h }),
    marcasDeJornada_(fecha),
    // PENDIENTE entra a propósito: mientras una invitación está en el aire,
    // sus dos técnicos salen del reparto (ver unidadesDeTrabajo_).
    duplasDeJornada_(fecha, ["ACTIVA", "PENDIENTE"]),
    // Quién tiene trabajo abierto, SIN pasar por las zonas. Ver el porqué en
    // el cálculo de `ocupadosIds` más abajo.
    tecnicosOcupados_(),
  ]);

  const zonasRaw = zRes.ok  ? await zRes.json()  : [];
  const lista    = ldRes.ok ? await ldRes.json() : [];
  const tecnicos = uRes.ok  ? await uRes.json()  : [];

  const vinsEnZona = zonasRaw.map(z => z.vin).filter(Boolean);
  const enLista = v => vinsEnZona.length
    ? `vin=in.(${vinsEnZona.map(encodeURIComponent).join(",")})&` + v
    : null;

  // ── Ronda 2: acotado a los carros que están en el taller ──
  const [woRes, mdRes, finRes] = await Promise.all([
    vinsEnZona.length
      ? fetch(`${SB()}/rest/v1/work_orders?${enLista("tipo_ot=eq.CONVERSION")}&select=id,vin,estado_general`, { headers: h })
      : null,
    vinsEnZona.length
      ? fetch(`${SB()}/rest/v1/vins?${enLista("select=vin,modelo_normalizado")}`, { headers: h })
      : null,
    // Carros cerrados en la jornada: acotado por fecha, no por un límite ciego.
    fetch(`${SB()}/rest/v1/asignaciones?tipo_ot=eq.CONVERSION&estado_actual=eq.FINALIZADO` +
      `&updated_at=gte.${desde.toISOString()}&select=work_order_id,user_id,updated_at`, { headers: h }),
  ]);

  const wos    = woRes  && woRes.ok  ? await woRes.json()  : [];
  const vinRows = mdRes && mdRes.ok  ? await mdRes.json()  : [];
  const finHoy = finRes && finRes.ok ? await finRes.json() : [];

  const modelos = new Map();
  for (const v of vinRows) if (v.modelo_normalizado) modelos.set(v.vin, v.modelo_normalizado);

  // Qué VINs de los que están en zona existen realmente en `vins`.
  //
  // Solo vale si la consulta RESPONDIÓ. Si falló, `vinRows` viene vacío y un
  // Set vacío significaría "ninguno registrado" — el motor excluiría el taller
  // entero y dejaría de repartir sin que nada lo delate. Ante la duda, null:
  // no verificar es infinitamente mejor que negar todo por un fetch caído.
  const registrados = (mdRes && mdRes.ok) ? new Set(vinRows.map(v => v.vin)) : null;

  const woVin = new Map(wos.map(w => [w.id, w.vin]));
  const vinEstado = new Map();
  for (const w of wos) if (w.vin) vinEstado.set(w.vin, String(w.estado_general || "").toUpperCase());

  // ── Ronda 3: asignaciones de esas OTs (quién ocupa qué puesto y dónde está) ──
  let asgs = [];
  if (wos.length) {
    const ids = wos.map(w => w.id).map(encodeURIComponent).join(",");
    const r = await fetch(
      `${SB()}/rest/v1/asignaciones?work_order_id=in.(${ids})` +
      `&select=work_order_id,user_id,rol_trabajo,activo,estado_actual,updated_at,fecha_asignacion` +
      `&order=updated_at.desc`,
      { headers: h },
    );
    if (r.ok) asgs = await r.json();
  }

  const zonas = zonasRaw.map(z => ({
    zona_id: z.zona_id,
    vin: z.vin,
    registrado_at: z.registrado_at,
    estado: z.vin ? (vinEstado.get(z.vin) === "FINALIZADO" ? "FINALIZADO" : "ACTIVO") : "LIBRE",
  }));

  // Puestos ya tomados.
  //
  // El criterio tiene que calzar EXACTAMENTE con idx_asg_active (UNIQUE sobre
  // work_order_id+rol_trabajo WHERE activo), que es quien tiene la última
  // palabra en el INSERT. Antes esto excluía las FINALIZADO y el motor las veía
  // como puesto libre: proponía el carro, el índice rechazaba el INSERT y el
  // error moría en un console.warn. El motor reintentaba cada 60 s, para
  // siempre, sin que nada apareciera en pantalla.
  //
  // Incluirlas además es lo correcto de fondo: en este modelo `activo` no se
  // apaga al terminar, y un puesto ya terminado no es trabajo que repartir.
  const ocupados = asgs
    .filter(a => a.activo && woVin.get(a.work_order_id))
    .map(a => ({
      vin: woVin.get(a.work_order_id),
      rol_trabajo: a.rol_trabajo,
      terminado: a.estado_actual === "FINALIZADO",
      // Con quién habrá que sincronizar el ritmo si el otro puesto sigue libre.
      user_id: a.user_id,
    }));

  const vinZona = new Map(zonasRaw.filter(z => z.vin).map(z => [z.vin, z.zona_id]));

  // Quién está trabajando QUÉ carro, y desde cuándo. Es lo que necesita la
  // dupla automática del carro extra: sin el VIN no se sabe a qué zona mandar
  // al que queda libre, y sin la hora de inicio no se puede elegir a quién
  // ayudar ("al que lleva más rato en el carro").
  const abiertas = new Map();
  for (const a of asgs) {
    if (!a.activo || a.estado_actual === "FINALIZADO") continue;
    const vin = woVin.get(a.work_order_id);
    if (!vin) continue;
    const prev = abiertas.get(a.user_id);
    const desde = a.fecha_asignacion || a.updated_at || null;
    // Con dos abiertas (no debería, pero pasa tras una reasignación a mano)
    // manda la más vieja: es el carro que de verdad está trabajando.
    if (prev && new Date(prev.desde || 0) <= new Date(desde || 0)) continue;
    abiertas.set(a.user_id, {
      vin, rol_trabajo: a.rol_trabajo, zona_id: vinZona.get(vin) ?? null, desde,
    });
  }

  // Carros acreditados hoy: se cuentan de la consulta acotada por fecha, que
  // abarca TODA la jornada (incluidos carros que ya salieron del taller).
  const creditosHoy = new Map();
  for (const a of finHoy) {
    creditosHoy.set(a.user_id, (creditosHoy.get(a.user_id) || 0) + 1);
  }

  // Desde cuándo está parado cada técnico — alimenta el criterio de espera.
  //
  // Es el más reciente entre "terminé mi último carro" y "marqué ingreso":
  // quien nunca ha terminado nada hoy lleva esperando desde que entró, y quien
  // acaba de entregar un carro empieza a contar desde ese momento. Sin el
  // ingreso, el que llega a media mañana entraría con espera infinita y se
  // llevaría todos los carros de golpe.
  const ultimoFin = new Map();
  for (const a of finHoy) {
    const ts = new Date(a.updated_at).getTime();
    if (!Number.isFinite(ts)) continue;
    if (!ultimoFin.has(a.user_id) || ts > ultimoFin.get(a.user_id)) {
      ultimoFin.set(a.user_id, ts);
    }
  }

  // Dónde está cada técnico: la zona del carro que tiene o tuvo más
  // recientemente. Es lo que alimenta el criterio de cercanía.
  const zonaUltima = new Map();
  for (const a of asgs) {                       // ya viene por updated_at desc
    const vin = woVin.get(a.work_order_id);
    if (!vin || zonaUltima.has(a.user_id)) continue;
    if (vinZona.has(vin)) zonaUltima.set(a.user_id, vinZona.get(vin));
  }

  // Estado de asistencia de cada técnico → quién es asignable
  const porUser = new Map();
  for (const m of marcas) {
    if (!porUser.has(m.user_id)) porUser.set(m.user_id, []);
    porUser.get(m.user_id).push(m);
  }
  // Quién NO puede recibir carro porque ya tiene uno.
  //
  // `asgs` solo cubre los VINs que están AHORA en conversion_zonas, y eso no
  // alcanza: si alguien libera la zona (o mueve el VIN) con la OT todavía
  // abierta, su técnico desaparece de aquí y el motor lo ve DISPONIBLE aunque
  // siga con el carro en las manos. Lo mismo pasa con un carro sin zona
  // registrada. Peor aún, la propuesta viva que lo protegía muere por el mismo
  // motivo en reconciliarPropuestas_ — los dos guardarraíles caen juntos, y el
  // resultado es una segunda OT encima de la que ya tenía.
  //
  // Por eso la ocupación se pregunta también sin pasar por las zonas, igual
  // que hacen /mi-estado y /asistencia. La unión, no el reemplazo: `asgs`
  // sigue aportando cualquier estado que la consulta global no enumere.
  const ocupadosIds = new Set([
    ...ocupadosGlobal,
    ...asgs.filter(a => a.activo && a.estado_actual !== "FINALIZADO").map(a => a.user_id),
  ]);
  const turnoMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
  const turnoFin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
  const ahoraMin = minutosDelDia_();

  const tecnicosCtx = tecnicos.map(t => {
    const j = reconstruirJornada_(porUser.get(t.id) || []);
    const ingresoMs = j.ingresoAt ? new Date(j.ingresoAt).getTime() : null;
    const finMs     = ultimoFin.get(t.id) ?? null;
    const libreDesde = finMs != null && ingresoMs != null ? Math.max(finMs, ingresoMs)
                     : finMs ?? ingresoMs;
    return {
      user_id: t.id, nombre: t.nombre, especialidad: t.especialidad,
      estadoEfectivo: estadoEfectivo_(j.estado, {
        turnoInicioMin: turnoMin, turnoFinMin: turnoFin,
        ahoraMin, tieneTrabajo: ocupadosIds.has(t.id),
      }),
      zonaUltima: zonaUltima.get(t.id) || null,
      libreDesde: libreDesde != null ? new Date(libreDesde).toISOString() : null,
    };
  });

  const unidades = armarUnidades_(tecnicosCtx, duplas, cfg);

  const modelo = leerPairingModel_();
  const techsPorId = Object.fromEntries((modelo?.techs || []).map(t => [t.user_id, t]));

  // Puestos ya cerrados: "<vin>|<rol>". Sirven para matar propuestas que la
  // realidad ya resolvió.
  const finalizados = new Set(
    asgs.filter(a => a.estado_actual === "FINALIZADO" && woVin.get(a.work_order_id))
        .map(a => `${woVin.get(a.work_order_id)}|${a.rol_trabajo}`));

  return {
    zonas, modelos, ocupados, unidades, duplas, tecnicosCtx,
    finalizados, registrados, abiertas,
    vinesEnZona: new Set(vinsEnZona),
    // La lista diaria dejó de condicionar el reparto (DESPACHO_EXIGE_LISTA_DIARIA
    // = "0" por defecto): un carro estacionado en zona es trabajo real, esté o
    // no en la lista, y la lista se queda corta a media jornada. Se sigue
    // trayendo porque ponerlo en "1" restaura el filtro sin tocar código.
    listaDiaria: String(cfg.DESPACHO_EXIGE_LISTA_DIARIA ?? "0") === "1" && lista.length
      ? new Set(lista.map(l => l.vin))
      : null,
    ctx: {
      indiceModelos: modelo?.modelFeaturesIndex || {},
      techsPorId,
      // creditosHoy ya no puntúa (lo hacía el criterio de equidad, sustituido
      // por espera): se conserva porque el panel del supervisor lo muestra.
      creditosHoy,
      esperaTopeMin: Number(cfg.DESPACHO_ESPERA_TOPE_MIN) || ESPERA_TOPE_MIN,
      // Importancia relativa de cada criterio, editable desde el panel. No hace
      // falta que sumen 1: normalizarPesos_ se encarga.
      pesos: {
        espera:         Number(cfg.DESPACHO_PESO_ESPERA),
        compatibilidad: Number(cfg.DESPACHO_PESO_COMPATIBILIDAD),
        familiaridad:   Number(cfg.DESPACHO_PESO_FAMILIARIDAD),
        cercania:       Number(cfg.DESPACHO_PESO_CERCANIA),
      },
      creditosDupla: new Map(),   // se llena abajo
    },
  };
}

/**
 * Propuestas vivas de la jornada, y limpieza de las que ya no aplican.
 *
 * Sin esto el motor reasignaría los mismos carros cada minuto: una propuesta
 * publicada NO crea una asignación en el flujo actual (el técnico sigue
 * abriendo el carro desde su app), así que el motor no tendría forma de saber
 * que ese puesto ya está hablado.
 *
 * Una propuesta muere cuando el carro sale de zona, cuando ese puesto ya quedó
 * FINALIZADO, o cuando la asignación que respalda la propuesta dejó de ser de
 * ese técnico. Todo lo demás sigue vivo y ocupa su puesto.
 */
async function reconciliarPropuestas_(fecha, { vinesEnZona, finalizados }) {
  let vivas = [];
  try {
    const r = await fetch(
      `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}` +
      `&estado=in.(PROPUESTA,CONFIRMADA)` +
      `&select=id,vin,rol_trabajo,user_id,unidad_dupla_id,zona_id,razon,score,propuesta_at,asignacion_id`,
      { headers: supabaseHeaders_() },
    );
    if (r.ok) vivas = await r.json();
  } catch { return []; }
  if (!vivas.length) return [];

  // Estado real de las asignaciones que respaldan estas propuestas.
  //
  // Una propuesta es solo un espejo de la asignación, y el espejo se despega:
  // basta un PATCH de user_id (reasignar desde la consola) o un activo=false
  // para que la propuesta siga reservando a alguien que ya no tiene el carro.
  // Como el VIN sigue en zona y el puesto no está FINALIZADO, las otras dos
  // condiciones no la matan nunca y el técnico se queda sin recibir trabajo el
  // resto de la jornada. Se comprueba contra la asignación, que es la verdad.
  const asgIds = [...new Set(vivas.map(p => p.asignacion_id).filter(Boolean))];
  const asgPorId = new Map();
  if (asgIds.length) {
    const rows = await fetch(
      `${SB()}/rest/v1/asignaciones?id=in.(${asgIds.join(",")})&select=id,user_id,activo,estado_actual`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    for (const a of rows) asgPorId.set(a.id, a);
  }

  const muertas = vivas
    .map(p => ({ p, motivo: porQueMuereLaPropuesta_(p, { vinesEnZona, finalizados, asgPorId }) }))
    .filter(x => x.motivo);

  // Agrupadas por motivo: el motivo es lo que permite entender después por qué
  // una propuesta murió, y un texto genérico para todas no sirve de nada.
  const porMotivo = new Map();
  for (const { p, motivo } of muertas) {
    if (!porMotivo.has(motivo)) porMotivo.set(motivo, []);
    porMotivo.get(motivo).push(p.id);
  }
  for (const [motivo, ids] of porMotivo) {
    await fetch(`${SB()}/rest/v1/despacho_propuestas?id=in.(${ids.join(",")})`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        estado: "EXPIRADA", decidida_at: new Date().toISOString(), motivo,
      }),
    }).catch(() => {});
  }

  const muertasIds = new Set(muertas.map(x => x.p.id));
  return vivas.filter(p => !muertasIds.has(p.id));
}

/** Cuántos carros lleva acreditado cada miembro DENTRO de su dupla. */
async function creditosPorDupla_(duplas, fecha) {
  const out = new Map();
  if (!duplas.length) return out;
  try {
    const ids = duplas.map(d => d.id).join(",");
    const r = await fetch(
      `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}` +
      `&unidad_dupla_id=in.(${encodeURIComponent(ids)})&select=unidad_dupla_id,user_id`,
      { headers: supabaseHeaders_() },
    );
    if (!r.ok) return out;
    for (const p of await r.json()) {
      if (!out.has(p.unidad_dupla_id)) out.set(p.unidad_dupla_id, new Map());
      const m = out.get(p.unidad_dupla_id);
      m.set(p.user_id, (m.get(p.user_id) || 0) + 1);
    }
  } catch { /* sin datos → arranca en cero */ }
  return out;
}

// ─── DUPLA AUTOMÁTICA DEL CARRO EXTRA ─────────────────────────────────────────

/**
 * Duplas de apoyo vivas, indexadas por el puesto al que cuelgan: "<vin>|<rol>".
 *
 * Un puesto admite UN ayudante. Con la clave puesta así, poner a otro es
 * encontrar el que había y deshacerlo — que es exactamente lo que hace falta
 * para reasignar sin dejar dos duplas colgando del mismo carro.
 */
export async function apoyosPorPuesto_(fecha) {
  const duplas = (await duplasDeJornada_(fecha, ["ACTIVA"])).filter(esDuplaApoyo_);
  const out = new Map();
  for (const d of duplas) {
    const vin = vinDeDuplaApoyo_(d);
    const ayudanteId = (d.miembros || []).find(id => id !== d.lider_user_id) || null;
    if (!vin || !ayudanteId) continue;
    out.set(`${vin}|${String(d.rol_trabajo || "").toUpperCase()}`, {
      duplaId: d.id, anclaId: d.lider_user_id, ayudanteId,
      manual: esAyudaManual_(d),
      // Desde cuándo comparten el carro: es lo que hace posible la nota
      // "Trabajó con X desde las 16:00" al cerrarlo. Las duplas de apoyo nacen
      // ya ACTIVAS (no hay invitación que confirmar), así que confirmada_at y
      // propuesta_at son el mismo instante; se toma la primera que exista.
      desde: d.confirmada_at || d.propuesta_at || null,
    });
  }
  return out;
}

/** Deshace una dupla de apoyo (automática o puesta a mano). */
async function disolverDuplaAuto_(id) {
  const h = supabaseHeaders_();
  await fetch(`${SB()}/rest/v1/despacho_dupla_miembros?dupla_id=eq.${id}`, {
    method: "PATCH", headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify({ activa: false }),
  });
  // `motivo` NO se toca: lleva dentro la marca AUTO_CARRO_EXTRA que impide que
  // estos dos vuelvan a emparejarse solos el resto de la jornada.
  await fetch(`${SB()}/rest/v1/despacho_duplas?id=eq.${id}`, {
    method: "PATCH", headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify({ estado: "DISUELTA", disuelta_at: new Date().toISOString() }),
  });
}

/**
 * Crea una dupla automática ya ACTIVA — sin invitación ni confirmación.
 *
 * La confirmación existe para las duplas que arman los técnicos porque afectan
 * el crédito de los dos. Aquí no hay nada que negociar: el carro es del ancla,
 * sigue a su nombre, y el ayudante no pierde ni gana un carro por entrar. Pedir
 * un tap sería dejar la regla a merced de un celular en el casillero.
 *
 * `ultimo_responsable_user_id` nace apuntando al ancla a propósito: si alguien
 * usara el botón de avanzar sobre esta dupla, la alternancia le daría el
 * siguiente al ayudante. Ese botón está cerrado para estas duplas (ver
 * derechoAAvanzar_), pero el dato correcto no cuesta nada.
 *
 * → id de la dupla, o null si no se pudo (alguien entró a otra dupla primero).
 */
async function crearDuplaAuto_(fecha, { rol, anclaId, ayudanteId, vin }, { manual = false } = {}) {
  const h = supabaseHeaders_();
  const ahora = new Date().toISOString();

  const dr = await fetch(`${SB()}/rest/v1/despacho_duplas`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify({
      jornada_fecha: fecha, rol_trabajo: rol,
      lider_user_id: anclaId, estado: "ACTIVA", confirmada_at: ahora,
      ultimo_responsable_user_id: anclaId, carros_asignados: 1,
      // Las dos marcas hacen lo mismo —deshacerse al cerrarse el carro y gastar
      // el turno de la regla—; cuál de las dos sea solo cambia lo que la consola
      // dice de esta pareja: "automático" o "puesto por ti".
      motivo: manual ? motivoAyudaManual_(vin) : motivoDuplaAuto_(vin),
    }),
  });
  if (!dr.ok) {
    console.warn(`[Despacho] dupla auto: ${(await dr.text()).slice(0, 160)}`);
    return null;
  }
  const dupla = (await dr.json())[0];
  if (!dupla?.id) return null;

  const mr = await fetch(`${SB()}/rest/v1/despacho_dupla_miembros`, {
    method: "POST",
    headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify([
      { dupla_id: dupla.id, user_id: anclaId,    jornada_fecha: fecha, activa: true },
      { dupla_id: dupla.id, user_id: ayudanteId, jornada_fecha: fecha, activa: true },
    ]),
  });
  if (!mr.ok) {
    // El índice único de miembros ganó: uno de los dos ya está en otra dupla.
    // La cabecera huérfana se borra en vez de quedarse — viva contaría como
    // "ya se emparejó hoy" y dejaría a ese técnico fuera de la regla sin que
    // ninguna dupla exista de verdad.
    console.warn(`[Despacho] dupla auto sin miembros: ${(await mr.text()).slice(0, 160)}`);
    await fetch(`${SB()}/rest/v1/despacho_duplas?id=eq.${dupla.id}`, {
      method: "DELETE", headers: { ...h, Prefer: "return=minimal" },
    }).catch(() => {});
    return null;
  }
  return dupla.id;
}

/**
 * Qué haría la regla del carro extra ahora mismo. SOLO LECTURAS.
 *
 * Separado de aplicarDuplasAuto_ para que el preview del motor —que no escribe
 * nada— pueda enseñarlo igual. Si el plan solo existiera dentro de la corrida
 * real, la única forma de saber si la regla funciona sería esperar a que
 * pasara: no habría dónde mirarla antes de encender el modo REAL.
 *
 * → { formar, disolver } · null si la regla está apagada.
 */
async function planDuplasAuto_(fecha, cfg, t) {
  if (String(cfg.DESPACHO_DUPLA_AUTO ?? "1") !== "1") return null;

  // Todas las de la jornada, incluidas las ya deshechas: son las que dicen
  // quién agotó su turno de emparejarse hoy.
  const historicas = await duplasDeJornada_(fecha,
    ["PENDIENTE", "ACTIVA", "RECHAZADA", "DISUELTA"]);

  return pareoCarroExtra_({
    tecnicos:    t.tecnicosCtx,
    duplasVivas: t.duplas,
    // Cuenta cualquier apoyo del día, no solo el automático: un ayudante puesto
    // por el supervisor gasta el turno igual. Para el taller la regla es "una
    // vez al día y ya", y si el apoyo manual no contara, el mismo técnico podría
    // pasar la tarde entera de ayudante — mitad por mando, mitad por regla.
    yaParearon:  new Set(historicas.filter(esDuplaApoyo_).flatMap(d => d.miembros)),
    abiertas:    t.abiertas,
    creditos:    t.ctx.creditosHoy,
    meta:        Number(cfg.META_CARROS_TEC) || 2,
    // El mismo TTL que usa el reparto: una invitación caducada no bloquea aquí
    // a quien allá ya volvió a la cola.
    ttlPendienteMin: Number(cfg.DESPACHO_TTL_DUPLA_MIN) || 10,
  });
}

/** El plan en castellano, para el resumen del motor y el panel del supervisor. */
function explicarDuplasAuto_(plan, t) {
  const nombre = id => t.tecnicosCtx.find(x => x.user_id === id)?.nombre || id;
  return {
    formaria: plan.formar.map(f => ({
      rol: f.rol, zona_id: f.zonaId, vin: f.vin,
      ancla: nombre(f.anclaId), ayudante: nombre(f.ayudanteId),
    })),
    disolveria: plan.disolver.map(d => ({
      dupla_id: d.id, vin: d.vin, miembros: d.miembros.map(nombre),
    })),
  };
}

/**
 * Ejecuta el plan: crea las duplas que tocan y deshace las que ya cumplieron su
 * carro. Corre ANTES del reparto, en cada corrida real del motor.
 *
 * → { cambio, formadas, disueltas }
 */
async function aplicarDuplasAuto_(fecha, { formar, disolver }, t) {
  if (!formar.length && !disolver.length) return { cambio: false, formadas: 0, disueltas: 0 };

  for (const d of disolver) {
    await disolverDuplaAuto_(d.id).catch(e =>
      console.warn(`[Despacho] no se pudo disolver la dupla auto ${d.id}: ${e.message}`));
  }

  const nombres = new Map(t.tecnicosCtx.map(x => [x.user_id, x.nombre]));
  const formadas = [];
  for (const f of formar) {
    const id = await crearDuplaAuto_(fecha, f);
    if (id) formadas.push({ ...f, id });
  }

  if (formadas.length) {
    // El ayudante tiene que enterarse AHORA: no va a recibir carro, y sin aviso
    // la única lectura posible es que el sistema se olvidó de él.
    const emails = await emailsDe_(formadas.flatMap(f => [f.anclaId, f.ayudanteId]));
    for (const f of formadas) {
      const ancla = nombres.get(f.anclaId) || "tu compañero";
      const ayuda = nombres.get(f.ayudanteId) || "tu compañero";
      const zona  = f.zonaId != null ? `zona ${f.zonaId}` : "su carro";
      await sendPushToEmails_([emails.get(f.ayudanteId)].filter(Boolean), {
        title: `🤝 Apoya a ${primerNombre_(ancla)}`,
        body: `${zona} · ${f.rol} · el carro queda a su nombre`,
      }).catch(() => {});
      await sendPushToEmails_([emails.get(f.anclaId)].filter(Boolean), {
        title: `🤝 ${primerNombre_(ayuda)} te apoya`,
        body: `${zona} · terminan juntos este carro y luego cada uno sigue solo`,
      }).catch(() => {});
    }
    emitEvent_("despacho", {
      tipo: "DUPLA_AUTO",
      duplas: formadas.map(f => ({
        dupla_id: f.id, user_ids: [f.anclaId, f.ayudanteId],
        zona_id: f.zonaId, vin: f.vin, rol_trabajo: f.rol,
      })),
    });
  }

  return {
    cambio: formadas.length > 0 || disolver.length > 0,
    formadas: formadas.length,
    disueltas: disolver.length,
  };
}

/** user_id → email, para los avisos. */
async function emailsDe_(userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const r = await fetch(
    `${SB()}/rest/v1/usuarios?id=in.(${encodeURIComponent(ids.join(","))})&select=id,email`,
    { headers: supabaseHeaders_() },
  );
  return new Map((r.ok ? await r.json() : []).map(u => [u.id, u.email]));
}

const primerNombre_ = n => String(n || "").trim().split(/\s+/)[0] || "";

/**
 * Crea la OT y la asignación real, como si el técnico la hubiera abierto.
 *
 * Réplica de lo que hace routes/trabajo.js al recibir el primer evento: la
 * asignación NACE INICIADA (TRABAJANDO, con el cronómetro corriendo), tal como
 * si el técnico la hubiera abierto a mano.
 *
 * Contrapartida asumida: el trayecto del técnico hasta la zona queda dentro
 * del tiempo del carro. Los tiempos de ciclo suben un poco de forma pareja
 * para todos, así que las comparaciones entre técnicos siguen siendo válidas.
 *
 * Se registra también el evento INICIO —marcado como automático— para que los
 * reportes que se construyen sobre `eventos` no vean carros que aparecen de
 * la nada.
 *
 * → { ok, asignacionId, error }
 */
export const NOTA_AUTO = "__DESPACHO_AUTO";
async function crearAsignacionReal_(p) {
  const h = supabaseHeaders_();
  try {
    // 1. Reutilizar la OT del VIN si ya existe. Crear una segunda OT para el
    //    mismo VIN duplicaría el carro en todos los reportes.
    let workOrderId = null;
    const wo = await fetch(
      `${SB()}/rest/v1/work_orders?vin=eq.${encodeURIComponent(p.vin)}&tipo_ot=eq.CONVERSION&select=id&limit=1`,
      { headers: h },
    ).then(r => r.ok ? r.json() : []).catch(() => []);

    if (wo.length) {
      workOrderId = wo[0].id;
    } else {
      const nueva = await fetch(`${SB()}/rest/v1/work_orders`, {
        method: "POST",
        headers: { ...h, Prefer: "return=representation" },
        body: JSON.stringify({ tipo_ot: "CONVERSION", vin: p.vin, estado_general: "PENDIENTE" }),
      });
      if (!nueva.ok) return { ok: false, error: (await nueva.text()).slice(0, 160) };
      workOrderId = (await nueva.json())[0]?.id;
    }
    if (!workOrderId) return { ok: false, error: "Sin work_order" };

    // 2. La asignación. El índice único (work_order_id, rol_trabajo) donde
    //    activo impide pisar a alguien que ya tomó ese puesto a mano.
    const ahora = new Date().toISOString();
    const asg = await fetch(`${SB()}/rest/v1/asignaciones`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify({
        work_order_id: workOrderId,
        user_id: p.user_id,
        tipo_ot: "CONVERSION",
        rol_trabajo: p.rol_trabajo,
        estado_actual: "TRABAJANDO",
        running_since: ahora,
        tiempo_trab_ms: 0,
        activo: true,
        last_nota: NOTA_AUTO,
        last_nota_ts: ahora,
      }),
    });

    if (!asg.ok) {
      const txt = await asg.text();
      if (/duplicate key|23505/.test(txt)) {
        return { ok: false, error: "Ese puesto ya lo tomó alguien" };
      }
      return { ok: false, error: txt.slice(0, 160) };
    }
    // El id es OBLIGATORIO, no un extra: la propuesta que se publica después lo
    // guarda en asignacion_id, y una propuesta sin él es inmortal — ver
    // reconciliarPropuestas_. Un solo INSERT que responda 2xx con el cuerpo
    // vacío deja al técnico congelado el resto de la jornada, en silencio.
    //
    // Antes de rendirse se busca la fila recién creada: el POST puede haber
    // funcionado y ser solo la respuesta la que vino sin representación. Si
    // tampoco aparece ahí, se trata como fallo: el motor lo apunta en
    // `fallidas` y reintenta a la corrida siguiente.
    let asignacionId = (await asg.json())[0]?.id || null;
    if (!asignacionId) {
      const rescate = await fetch(
        `${SB()}/rest/v1/asignaciones?work_order_id=eq.${workOrderId}` +
        `&rol_trabajo=eq.${encodeURIComponent(p.rol_trabajo)}&activo=is.true` +
        `&select=id,user_id&limit=1`,
        { headers: h },
      ).then(r => r.ok ? r.json() : []).catch(() => []);
      // Solo vale si es la asignación de ESTE técnico: si el puesto acabó en
      // manos de otro, adoptar su id ataría la propuesta a la persona
      // equivocada.
      if (rescate[0]?.user_id === p.user_id) asignacionId = rescate[0].id;
    }
    if (!asignacionId) return { ok: false, error: "La asignación no devolvió id" };

    // 3. El evento INICIO, para que los reportes basados en `eventos` cuadren.
    await fetch(`${SB()}/rest/v1/eventos`, {
      method: "POST",
      headers: { ...h, Prefer: "return=minimal" },
      body: JSON.stringify({
        timestamp: ahora, user_id: p.user_id, work_order_id: workOrderId,
        tipo_ot: "CONVERSION", rol_trabajo: p.rol_trabajo,
        accion: "INICIO", nota: NOTA_AUTO,
      }),
    }).catch(() => {});

    // 4. El work_order pasa a EN PROCESO, como en el flujo manual.
    await fetch(`${SB()}/rest/v1/work_orders?id=eq.${workOrderId}&estado_general=eq.PENDIENTE`, {
      method: "PATCH",
      headers: { ...h, Prefer: "return=minimal" },
      body: JSON.stringify({ estado_general: "EN PROCESO" }),
    }).catch(() => {});

    return { ok: true, asignacionId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/** Push a los técnicos que acaban de recibir carro. */
async function avisarAsignados_(propuestas, tecnicos) {
  const porId = new Map(tecnicos.map(t => [t.user_id, t]));
  const ids = [...new Set(propuestas.flatMap(p => p.miembros || [p.user_id]))];
  if (!ids.length) return;

  const r = await fetch(
    `${SB()}/rest/v1/usuarios?id=in.(${ids.join(",")})&select=id,email`,
    { headers: supabaseHeaders_() },
  );
  if (!r.ok) return;
  const emails = new Map((await r.json()).map(u => [u.id, u.email]));

  for (const p of propuestas) {
    const destinos = (p.miembros || [p.user_id]).map(id => emails.get(id)).filter(Boolean);
    if (!destinos.length) continue;
    const compa = (p.miembros || []).length > 1
      ? " · con " + (p.miembros.filter(m => m !== p.user_id)
          .map(m => porId.get(m)?.nombre).filter(Boolean).join(", "))
      : "";
    await sendPushToEmails_(destinos, {
      title: `🚗 Te toca la zona ${p.zona_id}`,
      body: `${p.rol_trabajo} · ${p.modelo || "Vehículo"}${compa}`,
    }).catch(() => {});
  }
}

/**
 * Corre el motor una vez.
 * @param {boolean} persistir  false = simulacro, no escribe nada.
 */
export async function correrMotor_({ persistir = true, simularAsistencia = false } = {}) {
  const cfg   = await getConfig_();
  const modo  = String(cfg.DESPACHO_MODO || "OFF").toUpperCase();
  const fecha = jornadaFecha_();

  const t = await contextoDelTaller_(cfg, fecha);

  // Antes de repartir: devolver a TRABAJANDO lo que cumplió su pausa, y cerrar
  // las invitaciones a dupla que nadie contestó — mientras viven, sus dos
  // técnicos están fuera del reparto.
  if (persistir && modo === "REAL") {
    await reanudarPausasVencidas_();
    await expirarDuplasPendientes_(Number(cfg.DESPACHO_TTL_DUPLA_MIN) || 10);
  }

  // La regla del carro extra, que también cambia quién puede recibir carro: el
  // que acaba de quedar de ayudante NO entra al reparto, entra al carro de su
  // compañero. Va antes de generar propuestas por eso mismo — un minuto más
  // tarde ya tendría carro propio y la regla no se cumpliría nunca.
  //
  // El plan se calcula SIEMPRE (son lecturas) y así el preview lo enseña sin
  // escribir; aplicarlo es lo que queda reservado al modo REAL.
  const planAuto = await planDuplasAuto_(fecha, cfg, t).catch(e => {
    console.warn(`[Despacho] dupla auto: ${e.message}`);
    return null;
  });
  let duplasAuto = planAuto ? explicarDuplasAuto_(planAuto, t) : null;

  if (planAuto && persistir && modo === "REAL") {
    const hecho = await aplicarDuplasAuto_(fecha, planAuto, t).catch(e => {
      console.warn(`[Despacho] dupla auto: ${e.message}`);
      return null;
    });
    if (hecho) duplasAuto = { ...duplasAuto, formadas: hecho.formadas, disueltas: hecho.disueltas };
    if (hecho?.cambio) {
      t.duplas   = await duplasDeJornada_(fecha, ["ACTIVA", "PENDIENTE"]);
      t.unidades = armarUnidades_(t.tecnicosCtx, t.duplas, cfg);
    }
  }

  // Simulacro: da por presentes a todos los técnicos. Sirve para evaluar el
  // CRITERIO DE REPARTO con carros y modelos reales antes de que exista una
  // sola marca de asistencia. Nunca se combina con persistir.
  if (simularAsistencia) {
    for (const u of t.unidades) u.asignable = true;
  }
  t.ctx.creditosDupla = await creditosPorDupla_(t.duplas, fecha);

  // Propuestas que siguen en pie. Ocupan puesto igual que una asignación real:
  // si no, cada corrida volvería a repartir los mismos carros.
  const vivas = persistir
    ? await reconciliarPropuestas_(fecha, { vinesEnZona: t.vinesEnZona, finalizados: t.finalizados })
    : [];

  const ocupadosConPropuestas = [
    ...t.ocupados,
    ...vivas.map(p => ({ vin: p.vin, rol_trabajo: p.rol_trabajo })),
  ];

  // Una unidad con propuesta viva ya tiene carro: no recibe otro.
  const conPropuesta = new Set(vivas.flatMap(p =>
    p.unidad_dupla_id
      ? (t.duplas.find(d => d.id === p.unidad_dupla_id)?.miembros || [p.user_id])
      : [p.user_id]));

  const unidades = t.unidades.map(u => ({
    ...u,
    asignable: u.asignable && !u.miembros.some(m => conPropuesta.has(m.user_id)),
  }));

  const pool = construirPool_({
    zonas: t.zonas, listaDiaria: t.listaDiaria, registrados: t.registrados,
    modelos: t.modelos, ocupados: ocupadosConPropuestas,
  });

  const { propuestas, unidadesLibres, carrosSinCubrir } =
    generarPropuestas_(pool, unidades, { ...t.ctx, nuevoId: () => randomUUID() });

  const resumen = {
    jornada: fecha, modo, hora: horaPeru_(),
    elegibles: pool.elegibles.length,
    excluidos: pool.excluidos,
    unidades: t.unidades.length,
    unidadesAsignables: t.unidades.filter(u => u.asignable).length,
    unidadesLibres, carrosSinCubrir,
    // Qué haría (preview) o qué hizo (corrida real) la regla del carro extra,
    // con nombres. Sin esto, una dupla que nace sola no deja rastro en ningún
    // lado salvo la tabla. `null` = la regla está apagada.
    duplasAuto,
    propuestas,
    fallidas: [],          // se llena al publicar; ver el bucle de CONFIRMADA
  };

  resumen.vivas = vivas.length;
  if (!persistir || modo === "OFF") return resumen;

  // SOMBRA: nacen y mueren como SOMBRA, nadie las ve.
  // REAL: se crea la OT de verdad y se publica. Operaciones decidió
  // auto-publicar; el supervisor corrige después, no aprueba antes.
  const estado = modo === "REAL" ? "CONFIRMADA" : "SOMBRA";

  if (propuestas.length && estado === "SOMBRA") {
    await fetch(`${SB()}/rest/v1/despacho_propuestas`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify(propuestas.map(p => ({
        jornada_fecha: fecha, carro_id: p.carro_id, vin: p.vin, zona_id: p.zona_id,
        user_id: p.user_id, unidad_dupla_id: p.unidad_dupla_id,
        rol_trabajo: p.rol_trabajo, estado: "SOMBRA",
        score: p.score, score_detalle: p.score_detalle, razon: p.razon,
      }))),
    }).catch(() => {});
  }

  if (propuestas.length && estado === "CONFIRMADA") {
    // Una por una: cada asignación puede fallar sola (alguien tomó el puesto
    // a mano un segundo antes) y eso no debe tumbar el resto del reparto.
    const publicadas = [];
    for (const p of propuestas) {
      const r = await crearAsignacionReal_(p);
      if (!r.ok) {
        // Además del log: al resumen. Un fallo que solo existe en stdout es un
        // fallo invisible — el motor puede pasarse horas reintentando lo mismo
        // sin que nada lo delate en pantalla ni en /motor/preview.
        console.warn(`[Despacho] Z${p.zona_id} ${p.rol_trabajo}: ${r.error}`);
        resumen.fallidas.push({
          zona_id: p.zona_id, vin: p.vin, rol_trabajo: p.rol_trabajo, error: r.error,
        });
        continue;
      }
      await fetch(`${SB()}/rest/v1/despacho_propuestas`, {
        method: "POST",
        headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
        body: JSON.stringify({
          jornada_fecha: fecha, carro_id: p.carro_id, vin: p.vin, zona_id: p.zona_id,
          user_id: p.user_id, unidad_dupla_id: p.unidad_dupla_id,
          rol_trabajo: p.rol_trabajo, estado: "CONFIRMADA",
          decidida_at: new Date().toISOString(),
          asignacion_id: r.asignacionId,
          score: p.score, score_detalle: p.score_detalle, razon: p.razon,
        }),
      }).catch(() => {});
      publicadas.push(p);
    }
    resumen.publicadas = publicadas.length;

    if (publicadas.length) {
      // Aviso al celular: nadie está mirando la TV en el segundo exacto en
      // que aparece su nombre.
      avisarAsignados_(publicadas, t.tecnicosCtx).catch(() => {});
      emitEvent_("asignaciones", { accion: "DESPACHO" });

      // Y el aviso dentro de la app, que es el que ve el técnico que YA la
      // tiene abierta — el push del sistema no aparece con la app en primer
      // plano. Va con los datos dentro para que el popup salga al instante,
      // sin esperar a que el sync le traiga la OT nueva.
      //
      // El SSE es broadcast: cada cliente filtra por su propio user_id. Solo
      // viajan ids opacos, ni nombres ni correos.
      emitEvent_("despacho", {
        tipo: "ASIGNADA",
        asignados: publicadas.map(p => ({
          user_ids: p.miembros?.length ? p.miembros : [p.user_id],
          zona_id: p.zona_id,
          vin: p.vin,
          modelo: p.modelo || "",
          rol_trabajo: p.rol_trabajo,
        })),
      });
    }
  }

  await fetch(`${SB()}/rest/v1/despacho_pool_snapshot`, {
    method: "POST",
    headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
    body: JSON.stringify({
      jornada_fecha: fecha,
      vins_elegibles: pool.elegibles.map(e => e.vin),
      vins_excluidos: pool.excluidos,
      tecnicos_libres: t.unidades.filter(u => u.asignable).map(u => u.miembros.map(m => m.nombre)),
      propuestas_gen: propuestas.length,
    }),
  }).catch(() => {});

  if (modo === "REAL" && propuestas.length) emitEvent_("despacho", { tipo: "PROPUESTAS" });
  return resumen;
}

// GET /api/despacho/motor/preview
// Simulacro: corre el motor y devuelve lo que haría, SIN escribir nada.
// Funciona con DESPACHO_MODO=OFF a propósito — sirve para evaluar el criterio
// de reparto antes de encender nada.
// ?simular=1 da por presentes a todos, para poder juzgar el reparto sin
// asistencia registrada.
router.get("/api/despacho/motor/preview", async (req, res) => {
  try {
    res.json({ ok: true, ...(await correrMotor_({
      persistir: false,
      simularAsistencia: req.query.simular === "1",
    })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/motor/correr — dispara una corrida real (supervisor)
router.post("/api/despacho/motor/correr", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (_req, res) => {
  try {
    res.json({ ok: true, ...(await dispararMotor_("supervisor")) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── DISPARO DEL MOTOR ────────────────────────────────────────────────────────
// El motor corre por dos vías: el intervalo de siempre y, desde ahora, el
// evento — un técnico marca FIN y el reparto ocurre en el acto, sin esperar
// hasta un minuto parado en el taller.
//
// Las dos vías comparten este candado, y no es opcional: una corrida lee el
// taller entero y DESPUÉS escribe. Dos corridas solapadas ven el mismo puesto
// libre, las dos lo proponen, y el índice único idx_asg_active deja a una en el
// suelo — que es exactamente el fallo silencioso que ya documenta
// contextoDelTaller_. Con dos técnicos terminando a la vez esto deja de ser
// hipotético.
//
// Un disparo que llega con el motor corriendo NO se descarta: se agenda otra
// corrida al terminar. La que está en vuelo sacó su foto del taller ANTES de
// ese FIN, así que el carro recién liberado no aparece en ella y descartar el
// disparo perdería el reparto hasta el siguiente intervalo.
let _motorCorriendo = false;
let _motorPendiente = false;

// Tope de corridas encadenadas por disparos entrantes. Sin él, un taller con
// mucho movimiento podría mantener el bucle girando; el intervalo recoge lo
// que quede fuera.
const MAX_CORRIDAS_ENCADENADAS = 3;

/**
 * Corre el motor respetando el candado. Si ya hay una corrida en curso,
 * encola una sola repetición.
 * @param {string} motivo  para el log: de dónde vino el disparo
 */
export async function dispararMotor_(motivo = "evento") {
  if (_motorCorriendo) {
    _motorPendiente = true;
    return { ok: true, encolado: true };
  }
  _motorCorriendo = true;
  try {
    let r = null;
    for (let i = 0; i < MAX_CORRIDAS_ENCADENADAS; i++) {
      _motorPendiente = false;
      r = await correrMotor_({ persistir: true });
      if (!_motorPendiente) break;
    }
    return { ok: true, ...r };
  } catch (e) {
    console.warn(`[Despacho] Motor (${motivo}) falló:`, e.message);
    return { ok: false, error: e.message };
  } finally {
    _motorCorriendo = false;
  }
}

/**
 * repartirTrasEvento_ — dispara el motor cuando alguien queda DISPONIBLE.
 *
 * Fire-and-forget, igual que los disparos de FIN y de registro en zona: la
 * respuesta HTTP no puede quedar colgada de una corrida que consulta media
 * base. Si falla, el intervalo lo recoge — el disparo es un atajo, nunca el
 * único camino.
 *
 * Por qué existe: hasta ahora solo dos cosas repartían por evento (el FIN de
 * una OT y registrar un carro en zona). Marcar INGRESO, aceptar una dupla,
 * revocar una propuesta o liberar un puesto dejaban a alguien disponible sin
 * avisar a nadie, y quedaba esperando al intervalo. Con el intervalo en 60 s
 * eso era un minuto y no se notaba; al subirlo a 5 minutos se convierte en
 * cinco minutos de técnico parado justo cuando acaba de llegar al taller.
 *
 * @param {string} motivo  para el log: de dónde vino el disparo
 */
export function repartirTrasEvento_(motivo) {
  despachoReparteAhora_()
    .then(puede => { if (puede) return dispararMotor_(motivo); })
    .catch(err => console.warn(`[Despacho] Disparo del motor falló (${motivo}):`, err.message));
}

/**
 * ¿Se puede repartir ahora mismo? Modo activo y dentro del turno.
 * La comparten el intervalo y el disparo por evento: un FIN a las 03:00 no
 * debe repartir carros con el turno cerrado.
 */
export async function despachoReparteAhora_() {
  const cfg = await getConfig_();
  if (String(cfg.DESPACHO_MODO || "OFF").toUpperCase() !== "REAL") return false;
  const iniMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
  const finMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
  // enTurno_ y no `ini <= ahora <= fin`: el turno cruza medianoche
  // (07:00 → 01:00) y la comparación directa daría falso todo el día.
  return enTurno_(minutosDelDia_(), iniMin, finMin);
}

// Suelo del intervalo del motor. Cada corrida son ~34 KB de lecturas a
// Supabase, así que el intervalo es directamente una factura: a 60 s son
// ~36 MB/día; a 15 s serían ~145 MB, casi el presupuesto diario entero del
// plan. El suelo existe para que un dedo en app_config no pueda convertir el
// motor en la mayor fuente de egress del sistema sin querer.
const MOTOR_INTERVALO_MIN_SEG = 30;

/**
 * El motor corre solo cada DESPACHO_INTERVALO_SEG. No-op si el modo es OFF.
 *
 * El intervalo se relee EN CADA VUELTA (setTimeout encadenado, no setInterval):
 * antes estaba clavado en 60 s y DESPACHO_INTERVALO_SEG no se leía en ningún
 * sitio — la clave existía en app_config, decía 15, y no hacía absolutamente
 * nada. Una config que miente es peor que no tenerla: el día que alguien
 * "arreglara" el hardcodeo, el motor se habría cuadruplicado en silencio.
 */
export function scheduleMotor_() {
  const vuelta_ = async () => {
    let esperaMs = 60_000;
    try {
      const cfg = await getConfig_();
      esperaMs = Math.max(MOTOR_INTERVALO_MIN_SEG, Number(cfg.DESPACHO_INTERVALO_SEG) || 60) * 1000;
      if (String(cfg.DESPACHO_MODO || "OFF").toUpperCase() !== "OFF") {
        const finMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
        const iniMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
        // Fuera de turno no reparte, pero sigue latiendo para recoger el
        // cambio de modo o de horario sin reiniciar el servidor.
        if (enTurno_(minutosDelDia_(), iniMin, finMin)) await dispararMotor_("intervalo");
      }
    } catch (e) {
      console.warn("[Despacho] Motor falló:", e.message);
    }
    const t = setTimeout(vuelta_, esperaMs);
    t.unref?.();
  };
  const t = setTimeout(vuelta_, 60_000);
  t.unref?.();
}

// ─── CONTROL DEL SUPERVISOR ───────────────────────────────────────────────────
// El motor auto-publica; el supervisor corrige DESPUÉS. Puede revocar,
// eliminar y reasignar en cualquier momento. Solo SUPERVISOR y ADMIN: es la
// única barrera entre "corregir una asignación" y "elegir mi propio carro".

// GET /api/despacho/panel — todo lo que necesita la consola, en una llamada
/**
 * El taller como plazas de estacionamiento: cada zona con sus DOS puestos
 * resueltos por separado — delantero (MOTOR) y tanquero (TANQUE).
 *
 * Quién ocupa un puesto lo dice la ASIGNACIÓN, no la propuesta. El técnico que
 * tomó el carro por su cuenta lo ocupa igual, y una consola que solo mirara lo
 * que repartió el motor ofrecería como libre un puesto que no lo está. La
 * propuesta solo aporta el porqué y el id con el que se revoca.
 *
 * Los dos puestos viajan SIEMPRE separados (uno puede venir en null): es lo que
 * permite agregar al tanquero de un carro que ya tiene delantero, que antes era
 * imposible porque el carro desaparecía de la cola en cuanto alguien lo tomaba.
 */
async function zonasConPuestos_(props) {
  const h = supabaseHeaders_();

  const zonaRows = await fetch(
    `${SB()}/rest/v1/conversion_zonas?select=zona_id,vin,registrado_at&order=zona_id.asc`,
    { headers: h },
  ).then(r => r.ok ? r.json() : []).catch(() => []);

  const vins = [...new Set([
    ...zonaRows.map(z => z.vin),
    ...props.map(p => p.vin),
  ].filter(Boolean))];

  const vacio = { MOTOR: null, TANQUE: null };
  if (!vins.length) {
    return { zonas: zonaRows.map(z => ({
      zona_id: z.zona_id, vin: null, modelo: "", registrado_at: null,
      espera: null, puestos: { ...vacio },
    })), sinZona: [] };
  }

  const vinQ = vins.map(encodeURIComponent).join(",");
  const [wos, modeloRows] = await Promise.all([
    fetch(`${SB()}/rest/v1/work_orders?vin=in.(${vinQ})&tipo_ot=eq.CONVERSION&select=id,vin`,
      { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${SB()}/rest/v1/vins?vin=in.(${vinQ})&select=vin,modelo_normalizado`,
      { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  const modelos = new Map(modeloRows.map(v => [v.vin, v.modelo_normalizado || ""]));
  const woVin   = new Map(wos.map(w => [w.id, w.vin]));

  let asgs = [];
  if (wos.length) {
    const ids = wos.map(w => encodeURIComponent(w.id)).join(",");
    // FINALIZADO incluido: el puesto de quien ya cerró su lado NO está vacío.
    // Mostrarlo como libre invitaba a poner a otro sobre trabajo ya hecho, y
    // borraba de la consola al responsable del carro.
    asgs = await fetch(
      `${SB()}/rest/v1/asignaciones?work_order_id=in.(${ids})&activo=eq.true` +
      `&estado_actual=in.(SIN_INICIAR,TRABAJANDO,PAUSADO,FINALIZADO)` +
      `&select=id,work_order_id,user_id,rol_trabajo,estado_actual,pausa_hasta,updated_at` +
      `&order=updated_at.desc`,
      { headers: h },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
  }

  // Los ayudantes del taller, para que la consola no tenga que preguntarlos
  // aparte: sin ellos el supervisor no puede ver a quién ya mandó a apoyar, y
  // reasignar a ciegas es peor que no poder reasignar.
  const apoyos = await apoyosPorPuesto_(jornadaFecha_()).catch(() => new Map());

  const nombres = await nombresDe_([
    ...asgs.map(a => a.user_id), ...props.map(p => p.user_id),
    ...[...apoyos.values()].map(a => a.ayudanteId),
  ]);

  // La propuesta se busca por su asignación; la clave (vin, rol) queda de
  // respaldo para las propuestas viejas que nacieron sin OT detrás.
  const propPorAsg    = new Map();
  const propPorPuesto = new Map();
  for (const p of props) {
    if (p.asignacion_id && !propPorAsg.has(p.asignacion_id)) propPorAsg.set(p.asignacion_id, p);
    const k = `${p.vin}|${p.rol_trabajo}`;
    if (!propPorPuesto.has(k)) propPorPuesto.set(k, p);
  }

  const puestos = new Map();
  const slotDe_ = vin => {
    if (!puestos.has(vin)) puestos.set(vin, { MOTOR: null, TANQUE: null });
    return puestos.get(vin);
  };

  for (const a of asgs) {
    const vin = woVin.get(a.work_order_id);
    const rol = String(a.rol_trabajo || "").toUpperCase();
    if (!vin || (rol !== "MOTOR" && rol !== "TANQUE")) continue;
    const s = slotDe_(vin);
    if (s[rol]) continue;                       // viene ordenado: la última manda
    const prop    = propPorAsg.get(a.id) || null;
    const pausado = a.estado_actual === "PAUSADO";
    const restan  = pausado && a.pausa_hasta
      ? Math.max(0, Math.round((new Date(a.pausa_hasta) - Date.now()) / 60000))
      : null;
    const apoyo = apoyos.get(`${vin}|${rol}`);
    s[rol] = {
      rol, user_id: a.user_id, nombre: nombres.get(a.user_id) || "",
      asignacionId: a.id, propuestaId: prop?.id || null,
      razon: prop?.razon || "", estadoOt: a.estado_actual, pausado,
      terminado: String(a.estado_actual || "").toUpperCase() === "FINALIZADO",
      pausaTxt: pausado ? (restan !== null ? `${restan} min restantes` : "pausa indefinida") : "",
      // El ayudante solo vale si el titular del puesto sigue siendo el mismo:
      // tras un cambio de técnico la dupla ya no describe a esta pareja, y el
      // motor la deshará en su próxima corrida.
      ayudante: apoyo && apoyo.anclaId === a.user_id ? {
        userId: apoyo.ayudanteId,
        nombre: nombres.get(apoyo.ayudanteId) || "",
        manual: apoyo.manual,
      } : null,
    };
  }

  // Propuesta viva sin OT detrás: en la TV ese puesto se ve tomado, así que
  // aquí también. Ofrecerlo como libre lo asignaría dos veces.
  for (const [k, p] of propPorPuesto) {
    const sep = k.lastIndexOf("|");
    const vin = k.slice(0, sep);
    const rol = k.slice(sep + 1);
    if (rol !== "MOTOR" && rol !== "TANQUE") continue;
    if (p.asignacion_id) continue;              // su OT ya no está activa → libre
    const s = slotDe_(vin);
    if (s[rol]) continue;
    // El ayudante también aquí: este puesto tiene dueño aunque su OT todavía no
    // exista, y es justo donde el supervisor va a querer meter apoyo — el carro
    // acaba de salir a la zona.
    const apoyo = apoyos.get(`${vin}|${rol}`);
    s[rol] = {
      rol, user_id: p.user_id, nombre: nombres.get(p.user_id) || "",
      asignacionId: null, propuestaId: p.id, razon: p.razon || "",
      estadoOt: null, pausado: false, pausaTxt: "", terminado: false,
      ayudante: apoyo && apoyo.anclaId === p.user_id ? {
        userId: apoyo.ayudanteId,
        nombre: nombres.get(apoyo.ayudanteId) || "",
        manual: apoyo.manual,
      } : null,
    };
  }

  const ahora  = Date.now();
  const enZona = new Set();
  const zonas  = zonaRows.map(z => {
    if (z.vin) enZona.add(z.vin);
    return {
      zona_id: z.zona_id,
      vin: z.vin || null,
      modelo: z.vin ? (modelos.get(z.vin) || "") : "",
      registrado_at: z.registrado_at || null,
      espera: z.vin && z.registrado_at
        ? Math.round((ahora - new Date(z.registrado_at)) / 60000) : null,
      puestos: z.vin ? (puestos.get(z.vin) || { ...vacio }) : { ...vacio },
    };
  });

  // Carros con gente encima pero sin plaza física: la zona 16.
  const sinZona = [...puestos.keys()]
    .filter(vin => !enZona.has(vin))
    .map(vin => ({
      zona_id: 16, vin, modelo: modelos.get(vin) || "",
      registrado_at: null, espera: null, puestos: puestos.get(vin),
    }));

  return { zonas, sinZona };
}

// El armado va aparte del handler porque se sirve CACHEADO: la consola queda
// abierta en el taller y se refrescaba cada 15 s con 30 consultas y ~59 KB de
// Supabase por ciclo — ~345 MB al día por pestaña abierta. Como todo lo que
// muestra se muta desde este mismo servidor, la invalidación por evento la
// mantiene al día y el poll deja de ser el que paga (lib/poll-cache.js).
async function armarPanelDespacho_() {
  {
    const fecha = jornadaFecha_();
    const cfg   = await getConfig_();
    const [{ asignaciones, cola }, t] = await Promise.all([
      asignacionesDeTV_(fecha),
      contextoDelTaller_(cfg, fecha),
    ]);

    const props = await fetch(
      `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}&estado=eq.CONFIRMADA` +
      `&select=id,vin,zona_id,user_id,rol_trabajo,razon,score,asignacion_id,decidida_at` +
      `&order=decidida_at.desc`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);

    // El mapa se arma con las propuestas ya leídas: son las mismas filas, y
    // pedirlas dos veces solo agregaría una carrera entre las dos vistas.
    const mapa = await zonasConPuestos_(props);

    const nombres = await nombresDe_([
      ...props.map(p => p.user_id),
      ...t.tecnicosCtx.map(x => x.user_id),
    ]);

    // Estado real de cada OT: sin esto la consola no sabría si mostrar los
    // botones de pausar o el de reanudar.
    const asgIds = props.map(p => p.asignacion_id).filter(Boolean);
    const estados = new Map();
    if (asgIds.length) {
      const rows = await fetch(
        `${SB()}/rest/v1/asignaciones?id=in.(${asgIds.join(",")})&select=id,estado_actual,pausa_hasta`,
        { headers: supabaseHeaders_() },
      ).then(r => r.ok ? r.json() : []).catch(() => []);
      for (const a of rows) estados.set(a.id, a);
    }

    return {
      ok: true, jornada: fecha,
      asignaciones, cola,
      zonas: mapa.zonas, sinZona: mapa.sinZona,
      propuestas: props.map(p => {
        const a = estados.get(p.asignacion_id);
        const pausado = a?.estado_actual === "PAUSADO";
        const restan = pausado && a.pausa_hasta
          ? Math.max(0, Math.round((new Date(a.pausa_hasta) - Date.now()) / 60000))
          : null;
        return {
          ...p, nombre: nombres.get(p.user_id) || "",
          estadoOt: a?.estado_actual || null,
          pausado,
          pausaTxt: pausado ? (restan !== null ? `${restan} min restantes` : "pausa indefinida") : "",
        };
      }),
      tecnicos: t.tecnicosCtx.map(x => ({
        user_id: x.user_id, nombre: x.nombre,
        especialidad: x.especialidad, estado: x.estadoEfectivo,
      })),
    };
  }
}

router.get("/api/despacho/panel", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const cfg = await getConfig_();
    const payload = await cachedByTopics_(
      `despacho:panel:${jornadaFecha_()}`, TOPICS_TV, cfg.SRV_CACHE_PANEL_MS,
      armarPanelDespacho_,
      { bypass: req.query.fresh === "1" },
    );
    // hora y modo NO se cachean: el reloj tiene que ir al día, y el modo lo
    // resuelve el middleware por petición.
    res.json({ ...payload, hora: horaPeru_(), modo: req.despachoModo });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/propuesta/revocar  { email, propuestaId, motivo }
// Libera el puesto: el motor lo volverá a repartir en la siguiente corrida.
router.post("/api/despacho/propuesta/revocar", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { email, propuestaId, motivo } = req.body || {};
    const sup = await userPorEmail_(email);

    // Se verifica ANTES de tocar nada: si el técnico ya arrancó, la operación
    // no procede y la propuesta debe quedar intacta.
    const prev = await fetch(
      `${SB()}/rest/v1/despacho_propuestas?id=eq.${encodeURIComponent(propuestaId || "")}&select=id,asignacion_id&limit=1`,
      { headers: supabaseHeaders_() },
    ).then(x => x.ok ? x.json() : []).catch(() => []);
    if (!prev.length) return res.status(404).json({ ok: false, error: "Propuesta no encontrada" });

    const asgId = prev[0].asignacion_id;
    if (asgId) {
      const asg = await fetch(
        `${SB()}/rest/v1/asignaciones?id=eq.${asgId}&select=estado_actual&limit=1`,
        { headers: supabaseHeaders_() },
      ).then(x => x.ok ? x.json() : []).catch(() => []);

      // Si ya está trabajando no se le arranca el carro de las manos: eso es
      // una reasignación, no una revocación.
      if (asg[0] && asg[0].estado_actual !== "SIN_INICIAR") {
        return res.status(409).json({
          ok: false,
          error: "El técnico ya empezó ese carro. Usa reasignar en vez de revocar.",
        });
      }
    }

    const r = await fetch(`${SB()}/rest/v1/despacho_propuestas?id=eq.${encodeURIComponent(propuestaId)}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        estado: "RECHAZADA",
        decidida_at: new Date().toISOString(),
        decidida_por: sup?.id || null,
        motivo: String(motivo || "Revocada por supervisión").slice(0, 200),
      }),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));

    // Soltar la OT real. Sin esto el carro queda bloqueado para siempre: la
    // pantalla lo daría por libre pero la asignación seguiría viva.
    if (asgId) {
      await fetch(`${SB()}/rest/v1/asignaciones?id=eq.${asgId}`, {
        method: "PATCH",
        headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
        body: JSON.stringify({ activo: false, updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }

    emitEvent_("despacho", { tipo: "REVOCADA" });
    emitEvent_("asignaciones", { accion: "REVOCADA" });
    repartirTrasEvento_("propuesta revocada");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/asignar-manual  { email, vin, zonaId, userId, rol }
// Asignación a dedo, saltándose el motor. Existe porque el taller siempre
// tiene un caso que el algoritmo no contempla.
//
// Crea la OT REAL, igual que el motor. Antes solo insertaba la propuesta: el
// técnico veía su carro en la TV pero no tenía nada abierto, y la propuesta
// quedaba sin asignacion_id — o sea inmortal (ver reconciliarPropuestas_), lo
// que lo dejaba sin recibir trabajo el resto de la jornada. Cada asignación a
// dedo fabricaba ese bloqueo.
router.post("/api/despacho/asignar-manual", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { email, vin, zonaId, userId, rol } = req.body || {};
    if (!vin || !userId || !rol) {
      return res.status(400).json({ ok: false, error: "Faltan vin, técnico o rol" });
    }
    const sup = await userPorEmail_(email);
    const fecha = jornadaFecha_();
    const rolTrabajo = String(rol).toUpperCase();

    // Primero la OT: si el puesto ya está tomado, no debe quedar rastro de una
    // propuesta que nunca fue.
    const real = await crearAsignacionReal_({ vin, user_id: userId, rol_trabajo: rolTrabajo });
    if (!real.ok) {
      const conflicto = /ya lo tomó|duplicate key|23505/.test(real.error || "");
      return res.status(conflicto ? 409 : 500).json({
        ok: false,
        error: conflicto ? "Ese puesto ya está asignado" : real.error,
      });
    }

    const r = await fetch(`${SB()}/rest/v1/despacho_propuestas`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
      body: JSON.stringify({
        jornada_fecha: fecha, carro_id: randomUUID(), vin,
        zona_id: zonaId || null, user_id: userId,
        rol_trabajo: rolTrabajo, estado: "CONFIRMADA",
        decidida_at: new Date().toISOString(), decidida_por: sup?.id || null,
        asignacion_id: real.asignacionId,
        score: 0, razon: "Asignado por supervisión",
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      if (/duplicate key|23505/.test(txt)) {
        return res.status(409).json({ ok: false, error: "Ese puesto ya está asignado" });
      }
      throw new Error(txt.slice(0, 200));
    }

    emitEvent_("despacho", { tipo: "MANUAL" });
    emitEvent_("asignaciones", { accion: "DESPACHO_MANUAL" });
    res.json({ ok: true, asignacionId: real.asignacionId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── AYUDANTES PUESTOS POR EL SUPERVISOR ──────────────────────────────────────
// La misma figura que arma sola la regla del carro extra, pero decidida a mano:
// un segundo técnico sobre un puesto que ya tiene dueño. El carro, la OT y el
// crédito siguen siendo del dueño; el ayudante solo trabaja.
//
// Aquí NO se piden las condiciones de la regla automática (meta cumplida, mismo
// rol, una vez al día): esto es el mando manual, y existe precisamente para los
// días en que el criterio automático no alcanza. Lo único que se protege es lo
// que rompería el modelo — ver validarAyudante_.

/**
 * Quién tiene este puesto ahora mismo, o null.
 *
 * Mira la asignación viva y, si no hay, la propuesta CONFIRMADA que todavía no
 * tiene OT detrás. Ese segundo caso es la razón por la que el mando manual no
 * servía antes: un puesto pasa un buen rato publicado sin asignación —y en la
 * consola se ve tomado, con nombre y todo—, así que exigir la asignación
 * dejaba el control muerto justo en los carros recién repartidos.
 */
async function titularDelPuesto_(vin, rol) {
  const h = supabaseHeaders_();
  const wo = await fetch(
    `${SB()}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}&tipo_ot=eq.CONVERSION&select=id&limit=1`,
    { headers: h },
  ).then(r => r.ok ? r.json() : []).catch(() => []);

  if (wo.length) {
    const rows = await fetch(
      `${SB()}/rest/v1/asignaciones?work_order_id=eq.${wo[0].id}` +
      `&rol_trabajo=eq.${rol}&activo=eq.true&estado_actual=in.(SIN_INICIAR,TRABAJANDO,PAUSADO)` +
      `&select=id,user_id&order=updated_at.desc&limit=1`,
      { headers: h },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    if (rows[0]) return { user_id: rows[0].user_id, asignacionId: rows[0].id };
  }

  const props = await fetch(
    `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${jornadaFecha_()}` +
    `&estado=eq.CONFIRMADA&vin=eq.${encodeURIComponent(vin)}&rol_trabajo=eq.${rol}` +
    `&select=user_id&order=decidida_at.desc&limit=1`,
    { headers: h },
  ).then(r => r.ok ? r.json() : []).catch(() => []);
  return props[0] ? { user_id: props[0].user_id, asignacionId: null } : null;
}

// POST /api/despacho/ayudante  { email, vin, rol, userId }
// Pone un ayudante en el puesto — y REASIGNA: si el puesto ya tenía uno, o si
// el elegido estaba apoyando otro carro, esas duplas se deshacen antes. Poner y
// mover son la misma operación a propósito: para el supervisor es un solo gesto
// ("que este vaya con aquel"), y partirlo en dos botones solo abre la ventana
// para dejarlo a medias.
router.post("/api/despacho/ayudante", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { vin, rol, userId } = req.body || {};
    const rolTrabajo = String(rol || "").toUpperCase();
    if (!vin || !userId || (rolTrabajo !== "MOTOR" && rolTrabajo !== "TANQUE")) {
      return res.status(400).json({ ok: false, error: "Faltan vin, rol o técnico" });
    }

    const fecha   = jornadaFecha_();
    const titular = await titularDelPuesto_(vin, rolTrabajo);
    if (!titular) {
      return res.status(409).json({
        ok: false,
        error: "Ese puesto no tiene a nadie — asigna primero al titular",
      });
    }

    const ur = await fetch(
      `${SB()}/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}&select=id,nombre,email,activo&limit=1`,
      { headers: supabaseHeaders_() },
    );
    const ayudante = ur.ok ? (await ur.json())[0] : null;
    if (!ayudante) return res.status(404).json({ ok: false, error: "Técnico no encontrado" });

    const vivas = await duplasDeJornada_(fecha, ["ACTIVA", "PENDIENTE"]);
    const suya  = vivas.find(d => (d.miembros || []).includes(ayudante.id)) || null;

    const v = validarAyudante_({
      ancla: { user_id: titular.user_id },
      ayudante: { user_id: ayudante.id, nombre: ayudante.nombre },
      duplaDelAyudante: suya,
    });
    if (!v.ok) return res.status(409).json({ ok: false, error: v.error });

    // Primero se libera: el índice único (jornada, user_id) donde activa
    // rechazaría la nueva dupla mientras la vieja siga en pie, y el error que
    // devuelve no le dice nada a nadie.
    const apoyos    = await apoyosPorPuesto_(fecha);
    const delPuesto = apoyos.get(`${vin}|${rolTrabajo}`);
    if (delPuesto) {
      if (delPuesto.ayudanteId === ayudante.id) {
        return res.json({ ok: true, sinCambios: true, duplaId: delPuesto.duplaId });
      }
      await disolverDuplaAuto_(delPuesto.duplaId);
    }
    if (v.moverDe && v.moverDe !== delPuesto?.duplaId) await disolverDuplaAuto_(v.moverDe);

    const duplaId = await crearDuplaAuto_(fecha, {
      rol: rolTrabajo, anclaId: titular.user_id, ayudanteId: ayudante.id, vin,
    }, { manual: true });
    if (!duplaId) {
      return res.status(409).json({ ok: false, error: "No se pudo emparejar — reintenta" });
    }

    const nombres = await nombresDe_([titular.user_id]);
    const nombreTitular = nombres.get(titular.user_id) || "su compañero";
    if (ayudante.email) {
      await sendPushToEmails_([ayudante.email], {
        title: `🤝 Apoya a ${primerNombre_(nombreTitular)}`,
        body: `${rolTrabajo} · el carro queda a nombre de él`,
      }).catch(() => {});
    }

    emitEvent_("despacho", {
      tipo: "AYUDANTE",
      duplas: [{ dupla_id: duplaId, user_ids: [titular.user_id, ayudante.id], vin, rol_trabajo: rolTrabajo }],
    });
    res.json({ ok: true, duplaId, ayudante: ayudante.nombre, titular: nombreTitular });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/ayudante/quitar  { email, vin, rol }
// El ayudante vuelve a la cola del reparto; el titular se queda con su carro.
//
// Su turno de la regla NO vuelve: la fila queda DISUELTA pero con la marca
// puesta, que es lo que cuenta como "ya apoyó hoy".
router.post("/api/despacho/ayudante/quitar", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { vin, rol } = req.body || {};
    const rolTrabajo = String(rol || "").toUpperCase();
    if (!vin || !rolTrabajo) return res.status(400).json({ ok: false, error: "Faltan vin o rol" });

    const fecha = jornadaFecha_();
    const apoyo = (await apoyosPorPuesto_(fecha)).get(`${vin}|${rolTrabajo}`);
    if (!apoyo) return res.status(404).json({ ok: false, error: "Ese puesto no tiene ayudante" });

    await disolverDuplaAuto_(apoyo.duplaId);
    emitEvent_("despacho", { tipo: "AYUDANTE_FUERA", duplas: [{ dupla_id: apoyo.duplaId, vin }] });
    // Al ayudante se le acaba de soltar del carro: vuelve a la cola y hay que
    // darle trabajo, no dejarlo esperando al intervalo.
    repartirTrasEvento_(`ayudante fuera de ${vin}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/puesto/liberar  { email, vin, rol, forzar }
// Deja vacío UN puesto del carro — el delantero o el tanquero, no los dos.
//
// Existe además de /propuesta/revocar porque revocar necesita una propuesta, y
// la mitad de los puestos ocupados del taller no tienen una: el técnico que
// abrió el carro por su cuenta ocupa el puesto igual. El supervisor no puede
// distinguir esos dos casos a simple vista, así que la consola no se lo pide:
// liberar un puesto es liberar un puesto, venga de donde venga.
router.post("/api/despacho/puesto/liberar", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { email, vin, rol, forzar } = req.body || {};
    if (!vin || !rol) return res.status(400).json({ ok: false, error: "Faltan vin o rol" });

    const rolTrabajo = String(rol).toUpperCase();
    if (rolTrabajo !== "MOTOR" && rolTrabajo !== "TANQUE") {
      return res.status(400).json({ ok: false, error: "Rol inválido" });
    }

    const sup   = await userPorEmail_(email);
    const h     = supabaseHeaders_();
    const fecha = jornadaFecha_();

    const wo = await fetch(
      `${SB()}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}&tipo_ot=eq.CONVERSION&select=id&limit=1`,
      { headers: h },
    ).then(r => r.ok ? r.json() : []).catch(() => []);

    let asg = null;
    if (wo.length) {
      const rows = await fetch(
        `${SB()}/rest/v1/asignaciones?work_order_id=eq.${wo[0].id}` +
        `&rol_trabajo=eq.${rolTrabajo}&activo=eq.true` +
        `&estado_actual=in.(SIN_INICIAR,TRABAJANDO,PAUSADO)` +
        `&select=id,estado_actual,running_since,tiempo_trab_ms&order=updated_at.desc&limit=1`,
        { headers: h },
      ).then(r => r.ok ? r.json() : []).catch(() => []);
      asg = rows[0] || null;
    }

    // Quitar a alguien que ya está con las manos en el carro no se hace de un
    // toque accidental: la consola vuelve a preguntar y reenvía con forzar.
    if (asg && asg.estado_actual !== "SIN_INICIAR" && !forzar) {
      return res.status(409).json({
        ok: false, requiereForzar: true,
        error: "Ese técnico ya empezó el carro. Confirma para quitarlo igual.",
      });
    }

    const ahoraIso = new Date().toISOString();

    // La propuesta muere aunque no haya OT: si sobrevive, el motor la sigue
    // dando por vigente y el puesto nunca se vuelve a repartir.
    await fetch(
      `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}` +
      `&vin=eq.${encodeURIComponent(vin)}&rol_trabajo=eq.${rolTrabajo}&estado=eq.CONFIRMADA`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({
          estado: "RECHAZADA", decidida_at: ahoraIso, decidida_por: sup?.id || null,
          motivo: "Puesto liberado por supervisión",
        }),
      },
    ).catch(() => {});

    if (asg) {
      // El reloj se cierra antes de soltar la OT: las horas corridas son suyas
      // aunque el carro deje de serlo.
      const corrido = asg.estado_actual === "TRABAJANDO" && asg.running_since
        ? Math.max(0, Date.now() - new Date(asg.running_since).getTime())
        : 0;
      const patch = { activo: false, updated_at: ahoraIso };
      if (asg.estado_actual !== "SIN_INICIAR") {
        patch.estado_actual  = "PAUSADO";
        patch.running_since  = null;
        patch.tiempo_trab_ms = (asg.tiempo_trab_ms || 0) + corrido;
        patch.last_nota      = "Puesto liberado por supervisión";
        patch.last_nota_ts   = ahoraIso;
      }
      const r = await fetch(`${SB()}/rest/v1/asignaciones?id=eq.${asg.id}`, {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.text()).slice(0, 200));
    }

    emitEvent_("despacho", { tipo: "PUESTO_LIBERADO" });
    emitEvent_("asignaciones", { accion: "PUESTO_LIBERADO" });
    repartirTrasEvento_("puesto liberado por supervisión");
    res.json({ ok: true, liberado: !!asg });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── AVANZAR EL SIGUIENTE CARRO ───────────────────────────────────────────────
// Una dupla puede adelantar trabajo: mientras uno cierra el carro en curso, el
// otro abre el siguiente. El motor NO puede repartir esto solo — desde fuera,
// una dupla con un carro abierto está ocupada, y darle un segundo por criterio
// automático sería exactamente el acaparamiento que el modelo de unidades
// existe para evitar. Aquí no lo decide el motor: lo piden ellos, y el crédito
// va al que le toca por alternancia (A, B, A, B…), no al que pulsa.
//
// Sin dupla también se puede, según DESPACHO_AVANCE_SOLO: es un permiso nominal
// para quien trabaja con ayudantes que no marcan asistencia, porque su situación
// real es la de una dupla que el sistema no puede ver. Ahí el crédito es de
// quien pulsa: no hay compañero registrado con quien alternarlo.
//
// La clave acepta "*" para abrirlo a todo el taller (se usó durante el desorden
// de agosto 2026). Está cerrado por defecto: el reparto lo hace el motor.

/**
 * ¿Puede este técnico avanzar un carro, y a quién le tocaría el crédito?
 * Barato a propósito: lo consulta la pantalla del técnico, no hace falta
 * reconstruir el taller entero para pintar un botón.
 */
async function derechoAAvanzar_(email, cfg) {
  const yo = await userPorEmail_(email);
  if (!yo) return { status: 403, error: "Usuario no encontrado" };

  const fecha = jornadaFecha_();
  const j = reconstruirJornada_(await marcasDeJornada_(fecha, yo.id));
  if (j.estado === "FUERA") {
    return { yo, fecha, puede: false, motivo: "Marca tu ingreso antes de avanzar un carro" };
  }

  const duplas = await duplasDeJornada_(fecha);
  const mia = duplas.find(d => d.miembros.includes(yo.id));

  if (mia && String(mia.estado).toUpperCase() === "PENDIENTE") {
    return { yo, fecha, puede: false, motivo: "Tienes una dupla sin confirmar" };
  }

  // La dupla del carro extra es POR ESE CARRO. Adelantar el siguiente con ella
  // sería estirarla a un segundo carro y, peor, mandarle el crédito al ayudante
  // por alternancia — justo lo que la regla no hace: el carro extra es del que
  // lo abrió. Al cerrarlo la dupla se deshace y el botón vuelve solo.
  if (mia && esDuplaApoyo_(mia)) {
    const nombres = await nombresDe_(mia.miembros);
    const otro = nombres.get(mia.miembros.find(id => id !== yo.id)) || "tu compañero";
    return {
      yo, fecha, puede: false,
      motivo: `Estás en el carro de ${otro} — al cerrarlo cada uno sigue por su cuenta`,
    };
  }

  if (mia) {
    const creditos = (await creditosPorDupla_([mia], fecha)).get(mia.id) || new Map();
    const tocaA = proximoResponsable_(
      { miembros: mia.miembros.map(id => ({ user_id: id })), ultimoResponsable: mia.ultimo_responsable_user_id },
      creditos,
    );
    const nombres = await nombresDe_(mia.miembros);
    return {
      yo, fecha, puede: true, modo: "DUPLA", dupla: mia,
      rol: mia.rol_trabajo, tocaA, tocaANombre: nombres.get(tocaA) || "",
      companeroNombre: nombres.get(mia.miembros.find(id => id !== yo.id)) || "",
    };
  }

  if (avanceSoloTodos_(cfg) || avanceSolo_(cfg).has(yo.id)) {
    // Sin dupla en el sistema: el crédito es suyo, no hay con quién alternarlo.
    return {
      yo, fecha, puede: true, modo: "SOLO", dupla: null,
      rol: String(yo.especialidad || "").toUpperCase(),
      tocaA: yo.id, tocaANombre: yo.nombre, companeroNombre: "",
    };
  }

  return { yo, fecha, puede: false, motivo: "El botón de avanzar es solo para duplas" };
}

// GET /api/despacho/avance?email= — ¿pinto el botón, y a nombre de quién?
router.get("/api/despacho/avance", requireModoActivo_, async (req, res) => {
  try {
    const d = await derechoAAvanzar_(req.query.email, req.despachoCfg);
    if (d.status) return res.status(d.status).json({ ok: false, error: d.error });
    res.json({
      ok: true, puede: !!d.puede, motivo: d.motivo || "",
      modo: d.modo || null, duplaId: d.dupla?.id || null, rol: d.rol || null,
      tocaA: d.tocaA || null, tocaANombre: d.tocaANombre || "",
      companeroNombre: d.companeroNombre || "",
      esMiTurno: d.tocaA === d.yo?.id,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/avanzar  { email }
// Toma el mejor carro libre del pool para el rol de la unidad y lo abre a
// nombre de quien toca. Mismo criterio que el motor: no es "el primero que
// haya", es el que el reparto habría elegido.
router.post("/api/despacho/avanzar", requireModoActivo_, async (req, res) => {
  try {
    const cfg = req.despachoCfg;
    const d = await derechoAAvanzar_(req.body?.email, cfg);
    if (d.status) return res.status(d.status).json({ ok: false, error: d.error });
    if (!d.puede) return res.status(403).json({ ok: false, error: d.motivo });

    const fecha = d.fecha;
    const t = await contextoDelTaller_(cfg, fecha);

    // La unidad real, con su zona y su historia — es lo que hace que el carro
    // elegido sea el de al lado y no el del otro extremo del taller.
    const unidad = t.unidades.find(u => u.miembros.some(m => m.user_id === d.yo.id))
      || { tipo: "SOLO", duplaId: null, rol: d.rol, miembros: [{ user_id: d.yo.id }], zonaUltima: null };

    // Las propuestas vivas reservan puesto igual que una asignación: sin esto
    // el botón entregaría un carro que el motor ya le prometió a otro.
    const vivas = await reconciliarPropuestas_(fecha, {
      vinesEnZona: t.vinesEnZona, finalizados: t.finalizados,
    });
    const pool = construirPool_({
      zonas: t.zonas, listaDiaria: t.listaDiaria, registrados: t.registrados,
      modelos: t.modelos,
      ocupados: [...t.ocupados, ...vivas.map(p => ({ vin: p.vin, rol_trabajo: p.rol_trabajo }))],
    });

    const roles = d.rol === "AMBOS" ? ["MOTOR", "TANQUE"] : [d.rol];
    let mejor = null;
    for (const carro of pool.elegibles) {
      for (const rol of roles) {
        if (!carro.rolesLibres.includes(rol)) continue;
        const otro = rol === "MOTOR" ? "TANQUE" : "MOTOR";
        const p = puntuar_(unidad, carro, { ...t.ctx, parejaDe: carro.ocupadoPor?.[otro] || null });
        if (!mejor || p.score > mejor.p.score) mejor = { carro, rol, p };
      }
    }
    if (!mejor) {
      return res.status(409).json({ ok: false, error: "No hay carros libres para adelantar ahora" });
    }

    const real = await crearAsignacionReal_({
      vin: mejor.carro.vin, user_id: d.tocaA, rol_trabajo: mejor.rol,
    });
    if (!real.ok) {
      const conflicto = /ya lo tomó|duplicate key|23505/.test(real.error || "");
      return res.status(conflicto ? 409 : 500).json({
        ok: false,
        error: conflicto ? "Ese puesto acaba de tomarlo alguien" : real.error,
      });
    }

    // La propuesta no es decorado: es lo que cuenta el carro dentro de la dupla
    // (creditosPorDupla_ suma por unidad_dupla_id + user_id), o sea lo que hace
    // que el SIGUIENTE avance le toque al otro. Sin ella la alternancia se
    // queda clavada en la misma persona.
    await fetch(`${SB()}/rest/v1/despacho_propuestas`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        jornada_fecha: fecha, carro_id: randomUUID(),
        vin: mejor.carro.vin, zona_id: mejor.carro.zona,
        user_id: d.tocaA, unidad_dupla_id: d.dupla?.id || null,
        rol_trabajo: mejor.rol, estado: "CONFIRMADA",
        decidida_at: new Date().toISOString(),
        asignacion_id: real.asignacionId,
        score: mejor.p.score, score_detalle: mejor.p.detalle,
        razon: d.modo === "DUPLA" ? "Adelantado por la dupla" : "Adelantado sin dupla",
      }),
    }).catch(() => {});

    if (d.dupla) {
      await fetch(`${SB()}/rest/v1/despacho_duplas?id=eq.${d.dupla.id}`, {
        method: "PATCH",
        headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
        body: JSON.stringify({
          ultimo_responsable_user_id: d.tocaA,
          carros_asignados: (Number(d.dupla.carros_asignados) || 0) + 1,
        }),
      }).catch(() => {});
    }

    emitEvent_("asignaciones", { accion: "DESPACHO_AVANCE" });
    emitEvent_("despacho", {
      tipo: "ASIGNADA",
      asignados: [{
        user_ids: d.dupla ? d.dupla.miembros : [d.yo.id],
        zona_id: mejor.carro.zona, vin: mejor.carro.vin,
        modelo: mejor.carro.modelo || "", rol_trabajo: mejor.rol,
      }],
    });

    res.json({
      ok: true, vin: mejor.carro.vin, zonaId: mejor.carro.zona,
      modelo: mejor.carro.modelo || "", rol: mejor.rol,
      userId: d.tocaA, nombre: d.tocaANombre,
      asignacionId: real.asignacionId,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PAUSAS CONTROLADAS POR SUPERVISIÓN ───────────────────────────────────────
// El técnico deja de manejar sus pausas: las pone el supervisor, con duración.
// Se apoya en lo que ya existía (sup-pausa-indefinida.js usaba /api/evento con
// nota __SUP_PAUSA_INDEFINIDA); lo nuevo es la duración y que el SERVIDOR
// reanude al vencer, en vez del temporizador del celular del técnico.

export const DURACIONES_PAUSA = [5, 10, 15, 0];   // 0 = indefinida

// POST /api/despacho/pausa-ot  { email, asignacionId, minutos, motivo }
router.post("/api/despacho/pausa-ot", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { email, asignacionId, minutos, motivo } = req.body || {};
    const mins = Number(minutos) || 0;
    if (!asignacionId) return res.status(400).json({ ok: false, error: "Falta la asignación" });
    if (!DURACIONES_PAUSA.includes(mins)) {
      return res.status(400).json({ ok: false, error: "Duración inválida (5, 10, 15 o 0=indefinida)" });
    }
    const sup = await userPorEmail_(email);

    const filas = await fetch(
      `${SB()}/rest/v1/asignaciones?id=eq.${encodeURIComponent(asignacionId)}` +
      `&select=id,user_id,work_order_id,tipo_ot,rol_trabajo,estado_actual,running_since,tiempo_trab_ms&limit=1`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    if (!filas.length) return res.status(404).json({ ok: false, error: "Asignación no encontrada" });

    const a = filas[0];
    if (a.estado_actual === "FINALIZADO") {
      return res.status(409).json({ ok: false, error: "Esa OT ya está finalizada" });
    }

    // Acumular lo corrido, igual que la pausa manual del flujo actual.
    const corrido = a.estado_actual === "TRABAJANDO" && a.running_since
      ? Math.max(0, Date.now() - new Date(a.running_since).getTime())
      : 0;
    const ahora = new Date();
    const nota = mins
      ? `Pausa de ${mins} min por supervisión`
      : "Pausa indefinida por supervisión";

    const up = await fetch(`${SB()}/rest/v1/asignaciones?id=eq.${a.id}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        estado_actual: "PAUSADO",
        running_since: null,
        tiempo_trab_ms: (a.tiempo_trab_ms || 0) + corrido,
        pausa_hasta: mins ? new Date(ahora.getTime() + mins * 60_000).toISOString() : null,
        updated_at: ahora.toISOString(),
        last_nota: `${nota}${motivo ? " · " + String(motivo).slice(0, 120) : ""}`,
        last_nota_ts: ahora.toISOString(),
      }),
    });
    if (!up.ok) throw new Error((await up.text()).slice(0, 200));

    await fetch(`${SB()}/rest/v1/eventos`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        timestamp: ahora.toISOString(), user_id: a.user_id,
        work_order_id: a.work_order_id, tipo_ot: a.tipo_ot,
        rol_trabajo: a.rol_trabajo, accion: "PAUSA",
        nota: `${nota}${sup?.nombre ? " (" + sup.nombre + ")" : ""}`,
      }),
    }).catch(() => {});

    emitEvent_("asignaciones", { accion: "PAUSA_SUPERVISOR", id: a.id });
    res.json({ ok: true, minutos: mins, hasta: mins ? new Date(ahora.getTime() + mins * 60_000) : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/reanudar-ot  { email, asignacionId }
router.post("/api/despacho/reanudar-ot", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { asignacionId } = req.body || {};
    const up = await fetch(`${SB()}/rest/v1/asignaciones?id=eq.${encodeURIComponent(asignacionId || "")}&estado_actual=eq.PAUSADO`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
      body: JSON.stringify({
        estado_actual: "TRABAJANDO",
        running_since: new Date().toISOString(),
        pausa_hasta: null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!up.ok) throw new Error((await up.text()).slice(0, 200));
    if (!(await up.json()).length) {
      return res.status(409).json({ ok: false, error: "Esa OT no está pausada" });
    }
    emitEvent_("asignaciones", { accion: "REANUDAR_SUPERVISOR" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Reanuda las pausas con duración que ya vencieron.
 *
 * Corre en el servidor a propósito: el auto-resume de 8 min que existe hoy
 * vive en el celular del técnico y solo funciona si tiene la app abierta.
 */
async function reanudarPausasVencidas_() {
  try {
    const vencidas = await fetch(
      `${SB()}/rest/v1/asignaciones?estado_actual=eq.PAUSADO&activo=eq.true` +
      `&pausa_hasta=not.is.null&pausa_hasta=lte.${new Date().toISOString()}&select=id`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    if (!vencidas.length) return 0;

    await fetch(`${SB()}/rest/v1/asignaciones?id=in.(${vencidas.map(v => v.id).join(",")})`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        estado_actual: "TRABAJANDO",
        running_since: new Date().toISOString(),
        pausa_hasta: null,
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {});

    emitEvent_("asignaciones", { accion: "REANUDAR_AUTO", n: vencidas.length });
    console.log(`[Despacho] ${vencidas.length} pausa(s) vencida(s) reanudadas.`);
    return vencidas.length;
  } catch { return 0; }
}

/**
 * Cierra las invitaciones a dupla que nadie contestó.
 *
 * El motor ya deja de contarlas al vencer el TTL (unidadesDeTrabajo_), así que
 * esto no desbloquea a nadie: lo que hace es que la pantalla no mienta. Sin
 * ello el invitado seguiría viendo "X quiere trabajar en dupla contigo" tres
 * horas después, y aceptarla armaría una dupla que el motor ya descartó.
 */
async function expirarDuplasPendientes_(ttlMin) {
  try {
    const limite = new Date(Date.now() - Math.max(0, ttlMin) * 60000).toISOString();
    const vencidas = await fetch(
      `${SB()}/rest/v1/despacho_duplas?jornada_fecha=eq.${jornadaFecha_()}` +
      `&estado=eq.PENDIENTE&propuesta_at=lte.${limite}&select=id`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);
    if (!vencidas.length) return 0;

    const ids = vencidas.map(v => v.id).join(",");
    await fetch(`${SB()}/rest/v1/despacho_dupla_miembros?dupla_id=in.(${ids})`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({ activa: false }),
    }).catch(() => {});
    await fetch(`${SB()}/rest/v1/despacho_duplas?id=in.(${ids})`, {
      method: "PATCH",
      headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
      body: JSON.stringify({
        estado: "RECHAZADA",
        disuelta_at: new Date().toISOString(),
        motivo: `Sin respuesta en ${ttlMin} min`,
      }),
    }).catch(() => {});

    emitEvent_("despacho", { tipo: "DUPLA_EXPIRADA", n: vencidas.length });
    // Al caducar, los dos técnicos que la dupla tenía bloqueados vuelven a ser
    // repartibles. Es justo el caso que motivó el TTL (ver DESPACHO_TTL_DUPLA_MIN).
    repartirTrasEvento_(`${vencidas.length} dupla(s) expirada(s)`);
    console.log(`[Despacho] ${vencidas.length} invitación(es) a dupla sin respuesta.`);
    return vencidas.length;
  } catch { return 0; }
}

// GET /despacho — consola del supervisor
router.get("/despacho", (_req, res) => {
  try {
    res.type("html").send(readFileSync(resolve("./public/despacho-admin.html"), "utf8"));
  } catch {
    res.status(404).send("despacho-admin.html no encontrado");
  }
});

// ─── PANTALLA TV ──────────────────────────────────────────────────────────────

/**
 * Producción de la jornada + ritmo contra el objetivo.
 *
 * El dato importante no es cuántos carros van, es si el ritmo alcanza. Un
 * "11 de 25" a las 10 am no dice nada; "vas 2 abajo del ritmo, proyectas 22"
 * sí, y todavía queda día para reaccionar. Es el equivalente al "on time /
 * delayed" de un tablero de aeropuerto.
 */
async function produccionJornada_(cfg, fecha) {
  const { desde } = jornadaRango_(fecha);
  let completos = 0;
  try {
    const r = await fetch(
      `${SB()}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO` +
      `&fecha_sin_calidad=gte.${desde.toISOString()}&select=id`,
      { headers: { ...supabaseHeaders_(), Prefer: "count=exact" } },
    );
    if (r.ok) completos = (await r.json()).length;
  } catch { /* sin datos → 0 */ }

  const objetivo = Number(cfg.META_DIARIA) || 25;
  const iniMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
  const finMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN)    ?? 60;

  // Fracción del turno productivo ya transcurrida (0 antes de empezar, 1 al final).
  //
  // Se mide sobre INSTANTES, no sobre minutos-del-día: con un turno que cruza
  // medianoche (07:00 → 01:00) restar `ahora - inicio` da negativo después de
  // las 00:00 y la barra de la TV se iría a cero en plena producción. `desde`
  // es el arranque de la jornada (06:00), así que el turno empieza a
  // `iniMin - 360` minutos de ahí y el resto es aritmética de fechas.
  const total     = duracionTurno_(iniMin, finMin);
  const inicioTurno = new Date(desde.getTime() + (iniMin - JORNADA_INICIO_H * 60) * 60_000);
  const corrido   = (Date.now() - inicioTurno.getTime()) / 60_000;
  const frac      = Math.min(1, Math.max(0, corrido / total));

  const esperado = Math.round(objetivo * frac);
  // Antes de que arranque el turno no hay ritmo que proyectar: proyectar
  // dividiendo por una fracción ~0 daría números absurdos.
  const proyeccion = frac > 0.15 ? Math.round(completos / frac) : null;

  return { completos, objetivo, esperado, diferencia: completos - esperado, proyeccion };
}

/** Últimas incidencias de la jornada (las de ayer en la TV solo confunden). */
async function incidenciasJornada_(fecha, limite = 3) {
  const { desde } = jornadaRango_(fecha);
  try {
    const r = await fetch(
      `${SB()}/rest/v1/incidencias?fecha_hora=gte.${desde.toISOString()}` +
      `&select=id,fecha_hora,vin,tecnico,tipo,nota&order=fecha_hora.desc&limit=${limite}`,
      { headers: supabaseHeaders_() },
    );
    if (!r.ok) return [];
    return (await r.json()).map(i => ({
      hora:    horaPeru_(new Date(i.fecha_hora)),
      vin:     i.vin || "",
      tecnico: i.tecnico || "",
      tipo:    i.tipo || "LEVE",
      // La nota trae saltos de línea del formulario; en una TV se aplanan.
      nota:    String(i.nota || "").replace(/\s+/g, " ").trim().slice(0, 90),
    }));
  } catch { return []; }
}

/** Carros que llevan demasiado tiempo en zona sin cerrarse. */
async function varados_(cfg) {
  const limite = Number(cfg.DESPACHO_VARADO_MIN) || 240;
  try {
    const r = await fetch(
      `${SB()}/rest/v1/conversion_zonas?vin=not.is.null&select=zona_id,vin,registrado_at`,
      { headers: supabaseHeaders_() },
    );
    if (!r.ok) return [];
    const ahora = Date.now();
    return (await r.json())
      .filter(z => z.registrado_at && (ahora - new Date(z.registrado_at)) / 60000 > limite)
      .map(z => ({
        zona: z.zona_id,
        vin: z.vin,
        minutos: Math.round((ahora - new Date(z.registrado_at)) / 60000),
      }))
      .sort((a, b) => b.minutos - a.minutos);
  } catch { return []; }
}

/**
 * Rellena los puestos vacíos de cada carro con quien figura en la OT y marca
 * cuáles ya terminaron.
 *
 * Muta el Map que recibe: busca la work_order de conversión de cada VIN y sus
 * asignaciones activas, pone el nombre del técnico que ocupa cada puesto y
 * anota en `motorFin` / `tanqueFin` si ese lado ya cerró.
 *
 * Las FINALIZADO cuentan. Antes se excluían —"un puesto cerrado no es quien
 * está trabajando ahora"— y el efecto era el contrario del buscado: al terminar
 * su lado, el nombre del técnico desaparecía de la pantalla y el carro quedaba
 * con un guión, como si nadie lo hubiera hecho. Quien lo hizo sigue siendo el
 * responsable; que ya acabó lo dice el color, no un hueco.
 *
 * Nunca lanza: es información de adorno para una pantalla: si Supabase no
 * responde, la TV sigue mostrando lo que ya tenía en vez de quedarse en blanco.
 */
async function completarPuestosDeOt_(porVin, h) {
  try {
    const carros = [...porVin.values()].filter(c => c.vin);
    if (!carros.length) return;

    const vins = [...new Set(carros.map(c => c.vin))].map(encodeURIComponent).join(",");
    const woRes = await fetch(
      `${SB()}/rest/v1/work_orders?vin=in.(${vins})&tipo_ot=eq.CONVERSION&select=id,vin`,
      { headers: h },
    );
    if (!woRes.ok) return;
    const wos = await woRes.json();
    if (!wos.length) return;

    const woVin = new Map(wos.map(w => [w.id, w.vin]));
    const ids = wos.map(w => encodeURIComponent(w.id)).join(",");
    // Las PAUSADO cuentan (el técnico sigue siendo suyo) y las FINALIZADO
    // también (el carro es suyo aunque ya lo haya cerrado).
    const asgRes = await fetch(
      `${SB()}/rest/v1/asignaciones?work_order_id=in.(${ids})&activo=eq.true` +
      `&estado_actual=in.(SIN_INICIAR,TRABAJANDO,PAUSADO,FINALIZADO)` +
      `&select=work_order_id,user_id,rol_trabajo,estado_actual,updated_at&order=updated_at.desc`,
      { headers: h },
    );
    if (!asgRes.ok) return;
    const asgs = await asgRes.json();
    if (!asgs.length) return;

    const nombres = await nombresDe_(asgs.map(a => a.user_id));
    const puestoVisto = new Set();
    for (const a of asgs) {
      const carro = porVin.get(woVin.get(a.work_order_id));
      if (!carro) continue;
      const rol = String(a.rol_trabajo || "").toUpperCase();
      if (rol !== "MOTOR" && rol !== "TANQUE") continue;
      // Viene ordenado por updated_at desc: la primera fila de cada puesto es
      // la vigente, y es la única que puede decir si ese lado terminó.
      const k = `${carro.vin}|${rol}`;
      if (puestoVisto.has(k)) continue;
      puestoVisto.add(k);

      const fin = String(a.estado_actual || "").toUpperCase() === "FINALIZADO";
      const nombre = nombres.get(a.user_id) || "";
      if (rol === "MOTOR") {
        if (nombre && !carro.motor) carro.motor = nombre;
        carro.motorFin = fin;
      } else {
        if (nombre && !carro.tanque) carro.tanque = nombre;
        carro.tanqueFin = fin;
      }
    }
  } catch { /* la TV se queda con lo que ya tenía */ }
}

/**
 * Lo que ve la TV: las asignaciones publicadas, agrupadas por carro (una
 * tarjeta con su MOTOR y su TANQUE), más los carros en zona que todavía no
 * tienen a nadie.
 */
async function asignacionesDeTV_(fecha) {
  const h = supabaseHeaders_();

  const [pRes, zRes] = await Promise.all([
    fetch(`${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}` +
      `&estado=eq.CONFIRMADA&select=carro_id,vin,zona_id,user_id,rol_trabajo,razon,decidida_at` +
      `&order=decidida_at.desc`, { headers: h }),
    fetch(`${SB()}/rest/v1/conversion_zonas?vin=not.is.null&select=zona_id,vin,registrado_at`, { headers: h }),
  ]);

  const props = pRes.ok ? await pRes.json() : [];
  const zonas = zRes.ok ? await zRes.json() : [];

  const nombres = await nombresDe_(props.map(p => p.user_id));
  const modelos = new Map();
  const vins = [...new Set(props.map(p => p.vin))];
  if (vins.length) {
    try {
      const r = await fetch(
        `${SB()}/rest/v1/vins?vin=in.(${vins.map(encodeURIComponent).join(",")})&select=vin,modelo_normalizado`,
        { headers: h });
      if (r.ok) for (const v of await r.json()) modelos.set(v.vin, v.modelo_normalizado);
    } catch { /* sin modelo */ }
  }

  // Agrupar por VIN, no por carro_id: la pantalla muestra el carro con sus DOS
  // puestos juntos, y `carro_id` no sirve para eso. Cada asignación manual nace
  // con su propio randomUUID(), así que el delantero y el tanquero del mismo
  // vehículo caían en tarjetas distintas — dos filas "Zona 8", cada una con la
  // mitad de la dupla y un guión donde debía ir el compañero.
  //
  // `props` viene ordenado por decidida_at DESC, así que el primero que se ve
  // de cada (vin, rol) es el vigente; los anteriores no lo pisan.
  const porVin = new Map();
  for (const p of props) {
    if (!porVin.has(p.vin)) {
      porVin.set(p.vin, {
        zona: p.zona_id, vin: p.vin, modelo: modelos.get(p.vin) || "",
        motor: "", tanque: "", motorFin: false, tanqueFin: false, razon: p.razon,
        estado: "TRABAJANDO", desde: horaPeru_(new Date(p.decidida_at)),
        ts: new Date(p.decidida_at).getTime(),
      });
    }
    const c = porVin.get(p.vin);
    if (c.zona == null) c.zona = p.zona_id;
    if (p.rol_trabajo === "MOTOR"  && !c.motor)  c.motor  = nombres.get(p.user_id) || "";
    if (p.rol_trabajo === "TANQUE" && !c.tanque) c.tanque = nombres.get(p.user_id) || "";
  }

  // El puesto que sigue vacío se busca en las asignaciones reales de la OT.
  // Despacho solo conoce lo que él repartió; quien tomó el carro por su cuenta
  // —o antes de que el módulo estuviera prendido— no tiene propuesta, pero sí
  // asignación. Esa tabla es la que manda sobre quién está en el carro.
  await completarPuestosDeOt_(porVin, h);

  const asignaciones = [...porVin.values()].sort((a, b) => b.ts - a.ts);
  // Los 2 min recién publicados salen marcados como NUEVO en la pantalla.
  const ahora = Date.now();
  for (const a of asignaciones) if (ahora - a.ts < 120_000) a.estado = "NUEVA";

  const conPropuesta = new Set(props.map(p => p.vin));
  const cola = zonas
    .filter(z => !conPropuesta.has(z.vin))
    .map(z => ({
      zona: z.zona_id, vin: z.vin, modelo: modelos.get(z.vin) || "",
      espera: z.registrado_at
        ? Math.round((ahora - new Date(z.registrado_at)) / 60000) + " min" : "",
      ts: z.registrado_at ? new Date(z.registrado_at).getTime() : ahora,
    }))
    .sort((a, b) => a.ts - b.ts)     // el que más espera, primero
    .slice(0, 6);

  return { asignaciones, cola };
}

// GET /api/despacho/tv?demo=1
// Payload único que alimenta la pantalla. En Fase 2 las asignaciones y la cola
// vienen vacías (las llena el motor en Fase 3); asistencia, producción,
// incidencias y varados ya son reales.
// Qué invalida la pantalla: el reparto y la asistencia (despacho), quién está
// en un carro (asignaciones), las OTs (work_orders), las plazas (zonas), las
// alertas (incidencias) y el propio modo de despacho (config).
const TOPICS_TV = ["despacho", "asignaciones", "work_orders", "zonas", "incidencias", "config"];

// El payload va aparte del handler porque se sirve CACHEADO. La TV del taller
// queda encendida y lo pedía cada 10 s sin cache: 14 consultas y ~24 KB de
// Supabase por ciclo, ~205 MB al día de una sola pantalla. Con el cache
// compartido, N pantallas cuestan lo mismo que una, y el SSE sigue borrando la
// entrada ante cualquier cambio real (lib/poll-cache.js).
async function armarPayloadTV_() {
  {
    const cfg  = await getConfig_();
    const modo = String(cfg.DESPACHO_MODO || "OFF").toUpperCase();
    if (modo === "OFF") {
      return {
        ok: true, modo: "OFF", jornada: jornadaFecha_(), hora: horaPeru_(),
        mensaje: "Despacho desactivado",
        asistencia: null, asignaciones: [], cola: [], libres: [],
      };
    }

    const fecha = jornadaFecha_();
    const turnoMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
    const turnoFin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
    const ahoraMin = minutosDelDia_();

    const [uResp, marcas, ocupados, produccion, incidencias, varados] = await Promise.all([
      fetch(`${SB()}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,especialidad`,
        { headers: supabaseHeaders_() }),
      marcasDeJornada_(fecha),
      tecnicosOcupados_(),
      produccionJornada_(cfg, fecha),
      incidenciasJornada_(fecha, 3),
      varados_(cfg),
    ]);
    const tecnicos = uResp.ok ? await uResp.json() : [];

    const porUser = new Map();
    for (const m of marcas) {
      if (!porUser.has(m.user_id)) porUser.set(m.user_id, []);
      porUser.get(m.user_id).push(m);
    }

    const ausentes = [];
    const libres   = [];
    let presentes  = 0;

    for (const t of tecnicos) {
      const j = reconstruirJornada_(porUser.get(t.id) || []);
      if (j.estado === "FUERA") { ausentes.push(t.nombre); continue; }
      presentes++;
      const ef = estadoEfectivo_(j.estado, {
        turnoInicioMin: turnoMin, turnoFinMin: turnoFin,
        ahoraMin, tieneTrabajo: ocupados.has(t.id),
      });
      if (ef === "DISPONIBLE") {
        libres.push({
          nombre: t.nombre, especialidad: t.especialidad,
          desde: j.ingresoAt ? horaPeru_(new Date(j.ingresoAt)) : "",
        });
      }
    }

    const { asignaciones, cola } = await asignacionesDeTV_(fecha);

    return {
      ok: true, modo, jornada: fecha, hora: horaPeru_(),
      asistencia: { presentes, esperados: tecnicos.length, ausentes },
      meta: produccion,
      incidencias, varados,
      asignaciones, cola, libres,
    };
  }
}

router.get("/api/despacho/tv", async (req, res) => {
  try {
    if (req.query.demo === "1") return res.json({ ok: true, ...payloadDemo_() });

    const cfg = await getConfig_();
    const payload = await cachedByTopics_(
      `despacho:tv:${jornadaFecha_()}`, TOPICS_TV, cfg.SRV_CACHE_TV_MS, armarPayloadTV_,
      { bypass: req.query.fresh === "1" },
    );
    // La hora se recalcula SIEMPRE: es un reloj, y servirlo desde el cache lo
    // dejaría atrasado hasta un TTL entero. Todo lo demás sí puede esperar.
    res.json({ ...payload, hora: horaPeru_() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /tv — la pantalla del taller.
// Se sirve desde public/ sin pasar por el build de Vite: es una página
// autónoma, no parte de la PWA, y así no se toca vite.config.js.
router.get("/tv", (_req, res) => {
  try {
    res.type("html").send(readFileSync(resolve("./public/tv.html"), "utf8"));
  } catch {
    res.status(404).send("tv.html no encontrado");
  }
});

export default router;
