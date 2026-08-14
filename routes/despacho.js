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
import { sendPushToEmails_ } from "../lib/push.js";
import {
  jornadaFecha_, jornadaRango_, horaPeru_, minutosDelDia_, hhmmAMinutos_,
  slotActual_, firmarSlot_, verificarToken_,
  aplicarMarca_, reconstruirJornada_, estadoEfectivo_,
  validarDupla_, unidadesDeTrabajo_, payloadDemo_,
  enTurno_, duracionTurno_, JORNADA_INICIO_H,
} from "../lib/despacho.js";
import { construirPool_, generarPropuestas_ } from "../lib/despacho-motor.js";

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

// GET /api/despacho/qr
// La TV pide un token nuevo cada ventana y lo pinta como QR. El técnico lo
// escanea desde su celular — así la marca prueba que estuvo en el taller.
router.get("/api/despacho/qr", async (req, res) => {
  const cfg = await getConfig_();
  const ventana = Number(cfg.DESPACHO_QR_VENTANA_SEG) || 30;
  const slot = slotActual_(ventana);
  const expiraEn = ventana - Math.floor((Date.now() / 1000) % ventana);
  res.json({ ok: true, token: firmarSlot_(slot), ventanaSeg: ventana, expiraEn });
});

// GET /api/despacho/qr.svg — el QR ya renderizado, para que la TV solo tenga
// que refrescar un <img> y no necesite librería de QR en el cliente.
// El código apunta a /marcar?t=<token>: el celular abre esa página y marca.
router.get("/api/despacho/qr.svg", async (req, res) => {
  try {
    const cfg = await getConfig_();
    const ventana = Number(cfg.DESPACHO_QR_VENTANA_SEG) || 30;
    const token = firmarSlot_(slotActual_(ventana));
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

// ─── ASISTENCIA ───────────────────────────────────────────────────────────────

// POST /api/despacho/marcar  { email, token, tipo? }
// Sin `tipo` alterna según el estado: fuera → INGRESO, dentro → SALIDA.
router.post("/api/despacho/marcar", requireModoActivo_, async (req, res) => {
  try {
    const { email, token, tipo } = req.body || {};
    const cfg = req.despachoCfg;

    const ver = verificarToken_(token, Number(cfg.DESPACHO_QR_VENTANA_SEG) || 30);
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
        token_slot: ver.slot, registrado_por: user.id,
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
    emitEvent_("despacho", { tipo, user_id: targetUserId });
    res.json({ ok: true, estado: j.estado });
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
    `&select=id,rol_trabajo,lider_user_id,estado,ultimo_responsable_user_id,carros_asignados,propuesta_at`,
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
    miembros: miembros.filter(m => m.dupla_id === d.id).map(m => m.user_id),
  }));
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
    res.json({
      ok: true, jornada: fecha,
      duplas: duplas.map(d => ({
        ...d,
        miembrosNombres: d.miembros.map(id => nombres.get(id) || ""),
      })),
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
      fetch(`${SB()}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,especialidad&order=nombre.asc`,
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

/** Todo lo que el motor necesita saber del taller, en una sola pasada. */
async function contextoDelTaller_(cfg, fecha) {
  const { desde } = jornadaRango_(fecha);
  const h = supabaseHeaders_();

  // ── Ronda 1: lo que no depende de nada ──
  // OJO: las OTs y las asignaciones NO se pueden traer con un `limit` a secas.
  // work_orders tiene años de historia y sin ORDER BY el límite devuelve un
  // subconjunto arbitrario: las OTs de los carros que están AHORA en el taller
  // pueden no venir. Se filtran por los VINs en zona, que son ~15.
  const [zRes, ldRes, uRes, marcas, duplas] = await Promise.all([
    fetch(`${SB()}/rest/v1/conversion_zonas?select=zona_id,vin,registrado_at&order=zona_id.asc`, { headers: h }),
    fetch(`${SB()}/rest/v1/lista_diaria_activa?select=vin`, { headers: h }),
    fetch(`${SB()}/rest/v1/usuarios?rol=eq.TECNICO&activo=eq.true&select=id,nombre,especialidad`, { headers: h }),
    marcasDeJornada_(fecha),
    duplasDeJornada_(fecha, ["ACTIVA"]),
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

  const woVin = new Map(wos.map(w => [w.id, w.vin]));
  const vinEstado = new Map();
  for (const w of wos) if (w.vin) vinEstado.set(w.vin, String(w.estado_general || "").toUpperCase());

  // ── Ronda 3: asignaciones de esas OTs (quién ocupa qué puesto y dónde está) ──
  let asgs = [];
  if (wos.length) {
    const ids = wos.map(w => w.id).map(encodeURIComponent).join(",");
    const r = await fetch(
      `${SB()}/rest/v1/asignaciones?work_order_id=in.(${ids})` +
      `&select=work_order_id,user_id,rol_trabajo,activo,estado_actual,updated_at&order=updated_at.desc`,
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

  // Puestos ya tomados: asignaciones activas sin terminar.
  const ocupados = asgs
    .filter(a => a.activo && a.estado_actual !== "FINALIZADO" && woVin.get(a.work_order_id))
    .map(a => ({ vin: woVin.get(a.work_order_id), rol_trabajo: a.rol_trabajo }));

  // Carros acreditados hoy: se cuentan de la consulta acotada por fecha, que
  // abarca TODA la jornada (incluidos carros que ya salieron del taller).
  const creditosHoy = new Map();
  for (const a of finHoy) {
    creditosHoy.set(a.user_id, (creditosHoy.get(a.user_id) || 0) + 1);
  }

  // Dónde está cada técnico: la zona del carro que tiene o tuvo más
  // recientemente. Es lo que alimenta el criterio de cercanía.
  const zonaUltima = new Map();
  const vinZona = new Map(zonasRaw.filter(z => z.vin).map(z => [z.vin, z.zona_id]));
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
  const ocupadosIds = new Set(
    asgs.filter(a => a.activo && a.estado_actual !== "FINALIZADO").map(a => a.user_id));
  const turnoMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
  const turnoFin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
  const ahoraMin = minutosDelDia_();

  const tecnicosCtx = tecnicos.map(t => {
    const j = reconstruirJornada_(porUser.get(t.id) || []);
    return {
      user_id: t.id, nombre: t.nombre, especialidad: t.especialidad,
      estadoEfectivo: estadoEfectivo_(j.estado, {
        turnoInicioMin: turnoMin, turnoFinMin: turnoFin,
        ahoraMin, tieneTrabajo: ocupadosIds.has(t.id),
      }),
      zonaUltima: zonaUltima.get(t.id) || null,
    };
  });

  const unidades = unidadesDeTrabajo_(tecnicosCtx, duplas).map(u => ({
    ...u,
    // La unidad hereda la zona del miembro que la tenga más reciente.
    zonaUltima: u.miembros.map(m => m.zonaUltima).find(Boolean) || null,
  }));

  const modelo = leerPairingModel_();
  const techsPorId = Object.fromEntries((modelo?.techs || []).map(t => [t.user_id, t]));

  // Puestos ya cerrados: "<vin>|<rol>". Sirven para matar propuestas que la
  // realidad ya resolvió.
  const finalizados = new Set(
    asgs.filter(a => a.estado_actual === "FINALIZADO" && woVin.get(a.work_order_id))
        .map(a => `${woVin.get(a.work_order_id)}|${a.rol_trabajo}`));

  return {
    zonas, modelos, ocupados, unidades, duplas, tecnicosCtx,
    finalizados,
    vinesEnZona: new Set(vinsEnZona),
    listaDiaria: lista.length ? new Set(lista.map(l => l.vin)) : null,
    ctx: {
      indiceModelos: modelo?.modelFeaturesIndex || {},
      techsPorId,
      creditosHoy,
      metaCarros: Number(cfg.META_CARROS_TEC) || 2,
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
 * Una propuesta muere cuando el carro sale de zona o cuando ese puesto ya
 * quedó FINALIZADO. Todo lo demás sigue vivo y ocupa su puesto.
 */
async function reconciliarPropuestas_(fecha, { vinesEnZona, finalizados }) {
  let vivas = [];
  try {
    const r = await fetch(
      `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}` +
      `&estado=in.(PROPUESTA,CONFIRMADA)` +
      `&select=id,vin,rol_trabajo,user_id,unidad_dupla_id,zona_id,razon,score,propuesta_at`,
      { headers: supabaseHeaders_() },
    );
    if (r.ok) vivas = await r.json();
  } catch { return []; }
  if (!vivas.length) return [];

  const muertas = vivas.filter(p =>
    !vinesEnZona.has(p.vin) || finalizados.has(`${p.vin}|${p.rol_trabajo}`));

  if (muertas.length) {
    await fetch(
      `${SB()}/rest/v1/despacho_propuestas?id=in.(${muertas.map(m => m.id).join(",")})`,
      {
        method: "PATCH",
        headers: { ...supabaseHeaders_(), Prefer: "return=minimal" },
        body: JSON.stringify({
          estado: "EXPIRADA", decidida_at: new Date().toISOString(),
          motivo: "El carro salió de zona o el puesto ya se cerró",
        }),
      },
    ).catch(() => {});
  }

  const muertasIds = new Set(muertas.map(m => m.id));
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
    const asignacionId = (await asg.json())[0]?.id || null;

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

  // Simulacro: da por presentes a todos los técnicos. Sirve para evaluar el
  // CRITERIO DE REPARTO con carros y modelos reales antes de que exista una
  // sola marca de asistencia. Nunca se combina con persistir.
  if (simularAsistencia) {
    for (const u of t.unidades) u.asignable = true;
  }
  t.ctx.creditosDupla = await creditosPorDupla_(t.duplas, fecha);

  // Antes de repartir: devolver a TRABAJANDO lo que cumplió su pausa.
  if (persistir && modo === "REAL") await reanudarPausasVencidas_();

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
    zonas: t.zonas, listaDiaria: t.listaDiaria,
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
    propuestas,
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
        console.warn(`[Despacho] Z${p.zona_id} ${p.rol_trabajo}: ${r.error}`);
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
    res.json({ ok: true, ...(await correrMotor_({ persistir: true })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** El motor corre solo cada DESPACHO_INTERVALO_SEG. No-op si el modo es OFF. */
export function scheduleMotor_() {
  let corriendo = false;
  setInterval(async () => {
    if (corriendo) return;                    // una corrida a la vez
    try {
      const cfg = await getConfig_();
      if (String(cfg.DESPACHO_MODO || "OFF").toUpperCase() === "OFF") return;
      const finMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_FIN) ?? 60;
      const iniMin = hhmmAMinutos_(cfg.DESPACHO_TURNO_INICIO) ?? 420;
      // enTurno_ y no `ini <= ahora <= fin`: el turno cruza medianoche
      // (07:00 → 01:00) y la comparación directa daría falso todo el día.
      if (!enTurno_(minutosDelDia_(), iniMin, finMin)) return;   // fuera de turno no reparte
      corriendo = true;
      await correrMotor_({ persistir: true });
    } catch (e) {
      console.warn("[Despacho] Motor falló:", e.message);
    } finally {
      corriendo = false;
    }
  }, 60_000).unref?.();
}

// ─── CONTROL DEL SUPERVISOR ───────────────────────────────────────────────────
// El motor auto-publica; el supervisor corrige DESPUÉS. Puede revocar,
// eliminar y reasignar en cualquier momento. Solo SUPERVISOR y ADMIN: es la
// única barrera entre "corregir una asignación" y "elegir mi propio carro".

// GET /api/despacho/panel — todo lo que necesita la consola, en una llamada
router.get("/api/despacho/panel", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const fecha = jornadaFecha_();
    const cfg   = await getConfig_();
    const [{ asignaciones, cola }, t] = await Promise.all([
      asignacionesDeTV_(fecha),
      contextoDelTaller_(cfg, fecha),
    ]);

    const props = await fetch(
      `${SB()}/rest/v1/despacho_propuestas?jornada_fecha=eq.${fecha}&estado=eq.CONFIRMADA` +
      `&select=id,vin,zona_id,user_id,rol_trabajo,razon,score,asignacion_id`,
      { headers: supabaseHeaders_() },
    ).then(r => r.ok ? r.json() : []).catch(() => []);

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

    res.json({
      ok: true, jornada: fecha, hora: horaPeru_(), modo: req.despachoModo,
      asignaciones, cola,
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
    });
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
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/despacho/asignar-manual  { email, vin, zonaId, userId, rol }
// Asignación a dedo, saltándose el motor. Existe porque el taller siempre
// tiene un caso que el algoritmo no contempla.
router.post("/api/despacho/asignar-manual", requireModoActivo_,
  requireRol_("SUPERVISOR", "ADMIN"), async (req, res) => {
  try {
    const { email, vin, zonaId, userId, rol } = req.body || {};
    if (!vin || !userId || !rol) {
      return res.status(400).json({ ok: false, error: "Faltan vin, técnico o rol" });
    }
    const sup = await userPorEmail_(email);
    const fecha = jornadaFecha_();

    const r = await fetch(`${SB()}/rest/v1/despacho_propuestas`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), Prefer: "return=representation" },
      body: JSON.stringify({
        jornada_fecha: fecha, carro_id: randomUUID(), vin,
        zona_id: zonaId || null, user_id: userId,
        rol_trabajo: String(rol).toUpperCase(), estado: "CONFIRMADA",
        decidida_at: new Date().toISOString(), decidida_por: sup?.id || null,
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
    res.json({ ok: true });
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

  // Agrupar por carro: la pantalla muestra la dupla MOTOR + TANQUE junta.
  const porCarro = new Map();
  for (const p of props) {
    if (!porCarro.has(p.carro_id)) {
      porCarro.set(p.carro_id, {
        zona: p.zona_id, vin: p.vin, modelo: modelos.get(p.vin) || "",
        motor: "", tanque: "", razon: p.razon,
        estado: "TRABAJANDO", desde: horaPeru_(new Date(p.decidida_at)),
        ts: new Date(p.decidida_at).getTime(),
      });
    }
    const c = porCarro.get(p.carro_id);
    if (p.rol_trabajo === "MOTOR")  c.motor  = nombres.get(p.user_id) || "";
    if (p.rol_trabajo === "TANQUE") c.tanque = nombres.get(p.user_id) || "";
  }

  const asignaciones = [...porCarro.values()].sort((a, b) => b.ts - a.ts);
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
router.get("/api/despacho/tv", async (req, res) => {
  try {
    if (req.query.demo === "1") return res.json({ ok: true, ...payloadDemo_() });

    const cfg  = await getConfig_();
    const modo = String(cfg.DESPACHO_MODO || "OFF").toUpperCase();
    if (modo === "OFF") {
      return res.json({
        ok: true, modo: "OFF", jornada: jornadaFecha_(), hora: horaPeru_(),
        mensaje: "Despacho desactivado",
        asistencia: null, asignaciones: [], cola: [], libres: [],
      });
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

    res.json({
      ok: true, modo, jornada: fecha, hora: horaPeru_(),
      asistencia: { presentes, esperados: tecnicos.length, ausentes },
      meta: produccion,
      incidencias, varados,
      asignaciones, cola, libres,
    });
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
