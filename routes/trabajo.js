import { Router } from "express";
import {
  supabaseHeaders_,
  supabaseGet_,
  supabasePost_,
  supabasePatch_,
  getCachedUserIdByEmail_,
  setCachedUserIdByEmail_,
} from "../lib/supabase.js";
import { addServerTiming_ } from "../lib/timing.js";
import { r2GetStatus } from "../r2-uploads.js";
import { pendingSuggestions_ } from "../lib/ml-state.js";
import { emitEvent_ } from "../lib/events.js";
import { getConfig_ } from "../lib/config.js";
import { esOtDeUnSoloRol_, estadoGeneralDeAsignacion_ } from "../lib/utils.js";
import { dispararMotor_, despachoReparteAhora_, apoyosPorPuesto_, duplaDeTrabajoDe_ } from "./despacho.js";
import { jornadaFecha_ } from "../lib/despacho.js";
import { puedeColaborar_, notaApoyo_, notaDupla_, notaCierreAjeno_, combinarNotas_ } from "../lib/colaboracion.js";

const router = Router();

// ── Helpers compartidos por mis-activas y mis-finalizadas ────────────────────

const ASG_SELECT = [
  "id,work_order_id,tipo_ot,rol_trabajo,estado_actual",
  "running_since,tiempo_trab_ms,updated_at,last_nota,user_id",
  "usuarios!inner(id,email,nombre)",
  "work_orders(id,vin,tipo_ramal,fecha_creacion,vins(reductor_asignado,tanque_asignado))",
].join(",");

// Resuelve user_id desde email (con cache). Lanza { status, error } si no existe.
async function resolveUserId_(email, userId) {
  let finalUserId = userId;
  let tecnicoEmail = email;
  if (!finalUserId && email) {
    finalUserId = getCachedUserIdByEmail_(email);
    if (!finalUserId) {
      const usuarios = await supabaseGet_("usuarios", { email });
      if (!usuarios?.length) throw { status: 404, error: "Usuario no encontrado" };
      finalUserId = usuarios[0].id;
      tecnicoEmail = usuarios[0].email;
      setCachedUserIdByEmail_(email, finalUserId);
    }
  } else if (finalUserId) {
    const usuarios = await supabaseGet_("usuarios", { id: `eq.${finalUserId}` });
    if (usuarios?.length) tecnicoEmail = usuarios[0].email;
  }
  return { finalUserId, tecnicoEmail };
}

// Consulta asignaciones y normaliza el resultado.
// filtro: string que va directo en la querystring de Supabase (ej. "estado_actual=eq.FINALIZADO&limit=5000")
async function fetchAsignacionesByUser_(finalUserId, tecnicoEmail, filtro) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const headers = supabaseHeaders_();
  const url = `${SUPABASE_URL}/rest/v1/asignaciones?user_id=eq.${finalUserId}&${filtro}&select=${ASG_SELECT}&order=updated_at.desc`;
  const r = await fetch(url, { method: "GET", headers });
  if (!r.ok) throw new Error(`Supabase asignaciones ${r.status}`);

  const asignaciones = await r.json();
  return asignaciones.map(asg => {
    const wo = Array.isArray(asg.work_orders) ? asg.work_orders[0] : asg.work_orders;
    return {
      id:                 asg.id,
      work_order_id:      asg.work_order_id,
      tipo_ot:            asg.tipo_ot,
      rol_trabajo:        asg.rol_trabajo,
      estado_actual:      asg.estado_actual,
      running_since:      asg.running_since,
      created_at:         asg.running_since || wo?.fecha_creacion || "",
      fecha_creacion:     wo?.fecha_creacion || "",
      tiempo_trab_ms:     asg.tiempo_trab_ms || 0,
      updated_at:         asg.updated_at,
      last_nota:          asg.last_nota || "",
      vin:                wo?.vin || "",
      tipo_ramal:         wo?.tipo_ramal || "",
      tipoRamal:          wo?.tipo_ramal || "",
      estado:             asg.estado_actual,
      tiempo_ms:          asg.tiempo_trab_ms || 0,
      reductor_asignado:  wo?.vins?.reductor_asignado || "",
      tanque_asignado:    wo?.vins?.tanque_asignado   || "",
      tecnico_id:         asg.user_id,
      tecnico_email:      asg.usuarios?.[0]?.email   || tecnicoEmail || "",
      tecnico_nombre:     asg.usuarios?.[0]?.nombre  || "",
    };
  });
}

/** Nombre de un usuario por id. Devuelve "" si no se puede: una nota sin
 *  nombre es preferible a romper el cierre de un carro. */
async function nombreDeUsuario_(userId) {
  if (!userId) return "";
  try {
    const u = await supabaseGet_("usuarios", { id: userId });
    return String(u?.[0]?.nombre || "").trim();
  } catch { return ""; }
}

// Registra omisión en Supabase (tabla pairing_omisiones).
// Reglas:
//   mode="pair"    → omisión solo si el complementario del carro NO está en los IDs sugeridos.
//   mode="new_car" → omisión si el carro ya tiene un complementario trabajando.
//   sin sugerencia → complementario activo = omisión directa.
async function checkAndRecordOmision_(userId, nombre, rolTrabajo, workOrderId, vin) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const hdrs         = supabaseHeaders_();
    const complemento  = rolTrabajo === "MOTOR" ? "TANQUE" : rolTrabajo === "TANQUE" ? "MOTOR" : null;
    if (!complemento) return;

    // ¿Hay un complementario ACTIVO en este work_order?
    const rComp = await fetch(
      `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=eq.${workOrderId}&rol_trabajo=eq.${complemento}&activo=eq.true&estado_actual=neq.FINALIZADO&select=id,user_id`,
      { method: "GET", headers: hdrs }
    );
    const compRows = rComp.ok ? await rComp.json() : [];

    if (!compRows.length) { pendingSuggestions_.delete(userId); return; }

    const complementUserId = compRows[0]?.user_id;
    const suggestion = pendingSuggestions_.get(userId);
    const TWO_HOURS  = 2 * 60 * 60 * 1000;
    const isRecent   = suggestion && (Date.now() - suggestion.ts) < TWO_HOURS;

    let isOmision = false;
    let modeUsed  = "sin_sugerencia";

    if (isRecent) {
      modeUsed = suggestion.mode;
      isOmision = suggestion.mode === "new_car"
        ? true
        : !suggestion.suggestedIds.includes(complementUserId);
    } else {
      isOmision = true;
    }

    pendingSuggestions_.delete(userId);
    if (!isOmision) {
      console.log(`[OMISION] ${nombre} ok — complementario sugerido (modo: ${modeUsed})`);
      return;
    }

    // Obtener modelo del VIN para enriquecer el registro
    let modelo = null;
    try {
      const rVin = await fetch(
        `${SUPABASE_URL}/rest/v1/vins?vin=eq.${encodeURIComponent(vin)}&select=modelo&limit=1`,
        { method: "GET", headers: hdrs }
      );
      modelo = rVin.ok ? (await rVin.json())[0]?.modelo || null : null;
    } catch {}

    await fetch(`${SUPABASE_URL}/rest/v1/pairing_omisiones`, {
      method:  "POST",
      headers: { ...hdrs, "Prefer": "return=minimal" },
      body:    JSON.stringify({
        user_id:       userId,
        nombre,
        rol_trabajo:   rolTrabajo,
        work_order_id: workOrderId,
        vin,
        modelo,
        mode:          modeUsed,
        suggested_ids: suggestion?.suggestedIds || [],
        complement_id: complementUserId || null,
      }),
    });
    console.log(`[OMISION] ${nombre} (${rolTrabajo}) VIN=${vin} modelo=${modelo} modo=${modeUsed}`);
  } catch (err) {
    console.warn("[OMISION] Error al registrar:", err.message);
  }
}

// endpoint Node → Supabase (me) - LECTURA SOLO
router.get("/api/me", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const timings = [];

    if (!email) {
      addServerTiming_(res, timings);
      return res.status(400).json({ ok: false, error: "Falta ?email=" });
    }

    // ?? LECTURA DESDE SUPABASE
    const t1 = Date.now();
    const usuarios = await supabaseGet_("usuarios", { email });
    timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });

    if (!usuarios || !usuarios.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }

    const usuario = usuarios[0];

    // Obtener módulos del usuario
    const t2 = Date.now();
    const modulos = await supabaseGet_("usuario_modulos", { user_id: usuario.id });
    timings.push({ label: "user_modulos", duration: Date.now() - t2 });

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      profile: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        especialidad: usuario.especialidad,
        activo: usuario.activo,
        modulos: Array.isArray(modulos) ? modulos.map(m => m.modulo) : [],
      }
    });
  } catch (e) {
    console.error("[GET /api/me]", e.message);
    addServerTiming_(res, timings || []);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.get("/api/mis-activas", async (req, res) => {
  try {
    const email  = String(req.query.email  || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();
    if (!email && !userId) return res.status(400).json({ ok: false, error: "Envía ?email= o ?userId=" });

    const t1 = Date.now();
    const { finalUserId, tecnicoEmail } = await resolveUserId_(email, userId);
    const items = await fetchAsignacionesByUser_(finalUserId, tecnicoEmail, "activo=eq.true&estado_actual=neq.FINALIZADO");
    const duration = Date.now() - t1;

    res.set("Server-Timing", `query;dur=${duration}`);
    return res.json({ ok: true, items, count: items.length, _timing: `${duration}ms` });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ ok: false, error: e.error });
    console.error("[GET /api/mis-activas]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.get("/api/mis-finalizadas", async (req, res) => {
  try {
    const email  = String(req.query.email  || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();
    if (!email && !userId) return res.status(400).json({ ok: false, error: "Envía ?email= o ?userId=" });

    const t1 = Date.now();
    const { finalUserId, tecnicoEmail } = await resolveUserId_(email, userId);

    // Acotado por VENTANA y TOPE, no "todo el histórico del técnico".
    //
    // Estaba en limit=5000 sin filtro de fecha, que es tanto como no tener
    // tope: devolvía 141 KB para un ramalero y 277 KB para un técnico veterano,
    // y crecía sola cada mes. La lista la pinta "Mi rendimiento" y los
    // finalizados del ramalero — pantallas donde nadie revisa carros de hace
    // cuatro meses desde el celular. Para eso está el reporte del supervisor.
    //
    // Mismos límites que la ruta directa a Supabase del navegador
    // (public/js/core/supabase-client.js): si divergieran, el técnico vería una
    // lista distinta según si Supabase está configurado o no.
    const { LIM_FINALIZADOS_DIAS, LIM_FINALIZADOS } = await getConfig_();
    const dias  = Math.max(1, Number(LIM_FINALIZADOS_DIAS) || 30);
    const tope  = Math.max(1, Number(LIM_FINALIZADOS) || 100);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    // Sin `order` aquí: fetchAsignacionesByUser_ ya lo añade (updated_at.desc),
    // y dos parámetros `order` en la misma URL de PostgREST no son idempotentes.
    const items = await fetchAsignacionesByUser_(
      finalUserId, tecnicoEmail,
      `estado_actual=eq.FINALIZADO&updated_at=gte.${encodeURIComponent(desde)}&limit=${tope}`,
    );
    const duration = Date.now() - t1;

    res.set("Server-Timing", `query;dur=${duration}`);
    return res.json({ ok: true, items, count: items.length, _timing: `${duration}ms` });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ ok: false, error: e.error });
    console.error("[GET /api/mis-finalizadas]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.post("/api/evento", async (req, res) => {
  try {
    const body = req.body || {};

    const email = body.email;
    let vin = String(body.vin || "").trim().toUpperCase();
    const rolTrabajo = String(body.rolTrabajo || "").trim().toUpperCase();
    const accion = String(body.accion || "").trim().toUpperCase();
    const nota = String(body.nota || "").trim();
    const tipoRamal = String(body.tipoRamal || "").trim();
    const conversionIdBody = String(body.conversionId || "").trim();

    // RAMALERO no usa VIN: generar pseudo-VIN o buscar por conversionId
    const isRamalero = rolTrabajo === "RAMALERO";
    // Para RAMALERO con WO existente, resolver VIN o generar uno
    if (isRamalero && !vin && conversionIdBody) {
      const woExist = await supabaseGet_("work_orders", { id: conversionIdBody });
      if (woExist?.length) {
        vin = woExist[0].vin || "";
        // Si el WO existe pero no tiene VIN, generar pseudo-VIN y actualizar el WO
        if (!vin) {
          vin = `RAMAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          // Asegurar que el VIN existe en la tabla vins
          try {
            await supabasePost_("vins", { vin, modelo: "RAMAL" });
          } catch (e) {
            if (!String(e.message || e).includes("23505") && !String(e.message || e).includes("duplicate")) throw e;
          }
          // Actualizar el work_order con el VIN generado
          try {
            await supabasePatch_("work_orders", { id: conversionIdBody }, { vin });
            console.log(`[EVENTO] VIN generado y asignado a WO ${conversionIdBody}: ${vin}`);
          } catch (e) {
            console.warn(`[EVENTO] No se pudo actualizar WO con VIN:`, e.message);
          }
        }
      }
    }
    if (isRamalero && !vin && accion === "INICIO") {
      // Nuevo ramal: generar pseudo-VIN único
      vin = `RAMAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }

    if (!email || !vin || !rolTrabajo || !accion) {
      return res.status(400).json({
        ok: false,
        error: "Faltan campos: email, vin, rolTrabajo, accion"
      });
    }

    const t1 = Date.now();

    // 1?? Obtener user_id
    const usuarios = await supabaseGet_("usuarios", { email });
    if (!usuarios || !usuarios.length) {
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }
    const userId = usuarios[0].id;

    // 2️⃣ Mapear rolTrabajo → tipo_ot para buscar el work_order correcto
    const ROL_TO_TIPO_OT = {
      "MOTOR": "CONVERSION",
      "TANQUE": "CONVERSION",
      "CALIDAD": "CALIDAD",
      "RAMALERO": "RAMALERO",
    };
    const tipoOtBuscado = ROL_TO_TIPO_OT[rolTrabajo] || "CONVERSION";

    // Buscar work_order por VIN + tipo_ot (evita tomar el WO equivocado)
    let workOrders = await supabaseGet_("work_orders", { vin, tipo_ot: tipoOtBuscado });
    let workOrderId, tipoOt;

    if (!workOrders || !workOrders.length) {
      // Verificar si el VIN existe en la lista de VINs válidos
      let vins = await supabaseGet_("vins", { vin });

      if (!vins || !vins.length) {
        // ⚠️ VIN NO EXISTE EN LA LISTA
        // Para RAMALERO: crear pseudo-VIN automáticamente (ya generado arriba)
        // Para otros roles: ERROR - VIN debe existir en la lista
        if (isRamalero) {
          // RAMALERO puede crear VINs automáticamente (pseudo-VINs)
          try {
            const vinData = {
              vin: vin,
              modelo: "RAMAL",
            };
            await supabasePost_("vins", vinData);
            console.log(`[EVENTO] Pseudo-VIN RAMALERO creado: ${vin}`);
          } catch (vinErr) {
            const errMsg = String(vinErr.message || vinErr);
            // Si ya existe (duplicate), está bien
            if (!errMsg.includes("23505") && !errMsg.includes("duplicate") && !errMsg.includes("already exists")) {
              console.error(`[EVENTO] Error creando pseudo-VIN RAMALERO:`, errMsg);
              throw new Error(`No se pudo crear pseudo-VIN RAMALERO: ${errMsg}`);
            }
          }
        } else {
          // ❌ ERROR: VIN no existe en la lista - NO se debe crear automáticamente
          console.warn(`[EVENTO] VIN inválido: ${vin} no existe en la lista de VINs`);
          return res.status(404).json({
            ok: false,
            error: `El VIN "${vin}" no existe en la lista de vehículos registrados. Verifica que el VIN sea correcto.`,
            errorType: "VIN_NOT_FOUND",
            vin: vin,
          });
        }
      }

      // ✅ Ahora sí CREAR work_order con el tipo_ot correcto
      try {
        const woData = {
          tipo_ot: tipoOtBuscado,
          vin: vin,
          estado_general: "PENDIENTE",
        };
        // RAMALERO: guardar tipo_ramal en el work_order
        if (isRamalero && tipoRamal) woData.tipo_ramal = tipoRamal;
        const createdWO = await supabasePost_("work_orders", woData);
        const wo = Array.isArray(createdWO) ? createdWO[0] : createdWO;
        workOrderId = wo.id;
        tipoOt = wo.tipo_ot;
        console.log(`[EVENTO] Work Order creado: ${workOrderId} para VIN ${vin}, tipo_ot=${tipoOt}`);
      } catch (woErr) {
        const errMsg = String(woErr.message || woErr);
        console.error(`[EVENTO] CRÍTICO - No se pudo crear Work Order:`, errMsg);
        throw new Error(`No se pudo crear Work Order para VIN ${vin}: ${errMsg}`);
      }
    } else {
      workOrderId = workOrders[0].id;
      tipoOt = workOrders[0].tipo_ot;
      console.log(`[EVENTO] Work Order existente encontrado: ${workOrderId} (tipo_ot=${tipoOt})`);
    }

    // 3?? Buscar asignación ACTIVA por (work_order_id, rol_trabajo) - SIN filtrar user_id
    // Esto devuelve la asignación activa EXISTENTE, sea de quien sea
    let query = `${process.env.SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `work_order_id=eq.${workOrderId}&rol_trabajo=eq.${rolTrabajo}&activo=eq.true`;

    const headers = supabaseHeaders_();
    const res_asg = await fetch(query, { method: "GET", headers });
    const asignacionesActivas = (await res_asg.json()) || [];
    const asignacionActiva = asignacionesActivas.length > 0 ? asignacionesActivas[0] : null;

    // 4?? ¿Es de otro? Antes de rebotar, mirar si puede COLABORAR.
    //
    // La regla "cada OT tiene un dueño y solo él la mueve" sigue siendo la de
    // por defecto — sin dueño, dos técnicos se pisan el mismo carro y el tiempo
    // trabajado deja de significar nada. Pero tiene dos excepciones que el
    // taller ya resolvía por fuera del sistema (ver lib/colaboracion.js):
    // el AYUDANTE del carro extra, y el segundo inspector de CALIDAD.
    //
    // En ninguna de las dos se mueve el user_id: el crédito sigue siendo de
    // quien la registró. Lo que se abre es quién la acciona, no de quién es.
    let apoyoDelPuesto = null;   // dupla de apoyo, si quien pide es el ayudante
    let colaborando = false;     // acciona una OT ajena con permiso

    if (asignacionActiva && asignacionActiva.user_id !== userId) {
      try {
        const apoyos = await apoyosPorPuesto_(jornadaFecha_());
        const a = apoyos.get(`${vin}|${rolTrabajo}`);
        if (a && a.ayudanteId === userId && a.anclaId === asignacionActiva.user_id) {
          apoyoDelPuesto = a;
        }
      } catch (e) {
        // Si no se puede leer el apoyo, NO se asume que lo hay: se cae al
        // rechazo de siempre. Un fallo de lectura no debe abrir una puerta.
        console.warn("[EVENTO] No se pudo leer el apoyo del puesto:", e.message);
      }

      const permiso = puedeColaborar_({
        tipoOt,
        estadoTitular: asignacionActiva.estado_actual,
        esApoyo: !!apoyoDelPuesto,
      });

      if (!permiso.permitido) {
        // Obtener nombre del usuario que tiene asignada
        let otroUsuario = "otro usuario";
        let otroEmail = "";
        try {
          const otrosUsuarios = await supabaseGet_("usuarios", { id: asignacionActiva.user_id });
          if (otrosUsuarios && otrosUsuarios.length) {
            otroUsuario = `${otrosUsuarios[0].nombre || ""}`.trim() || otrosUsuarios[0].email;
            otroEmail = otrosUsuarios[0].email || "";
          }
        } catch (e) { /* ignore */ }

        // El motivo viaja para que la vista pueda explicar POR QUÉ no puede.
        // "CALIDAD_SIN_INICIAR" no es lo mismo que "no es tuya": es "todavía no".
        return res.status(409).json({
          ok: false,
          error: permiso.motivo === "CALIDAD_SIN_INICIAR"
            ? `${otroUsuario} registró esta OT pero aún no la ha empezado. Podrás entrar cuando la inicie.`
            : `Esta OT ya está asignada a ${otroUsuario} en rol ${rolTrabajo}`,
          errorType: "ALREADY_ASSIGNED",
          motivoColaboracion: permiso.motivo,
          assignedTo: otroUsuario,
          assignedEmail: otroEmail,
          assignedRol: rolTrabajo,
          vin: vin,
        });
      }

      colaborando = true;
      console.log(`[EVENTO] Colaboración permitida (${permiso.motivo}): ${email} sobre OT de ${asignacionActiva.user_id}`);
    }

    // 5?? Si existe asignación del usuario actual, usarla; si no, será null (crearemos nueva).
    // Al colaborar se opera sobre la ajena SIN tocar su user_id: por eso entra
    // aquí como si fuera propia, pero el dueño en la base no cambia.
    let asignacion = asignacionActiva && (asignacionActiva.user_id === userId || colaborando)
      ? asignacionActiva
      : null;

    // 5b?? DESPACHO EN MODO REAL — dos restricciones sobre el técnico:
    //   · No puede ABRIR un carro nuevo de conversión: lo reparte la pantalla.
    //   · No puede PAUSAR: las pausas las pone el supervisor, con duración
    //     (5/10/15/indefinida), vía /api/despacho/pausa-ot.
    // INICIO, REANUDAR, FIN y NOTA siguen siendo suyos. Con el módulo en OFF o
    // SOMBRA no cambia absolutamente nada del flujo actual.
    //
    // REANUDAR estuvo bloqueado junto con PAUSA y era una trampa: al marcar
    // salida, pausarTrabajoDe_ deja sus carros en PAUSADO SIN pausa_hasta, así
    // que reanudarPausasVencidas_ no los toca nunca y el técnico tampoco podía.
    // Volvía al taller y dependía de que el supervisor se lo levantara a mano.
    // Poner una pausa es decisión de supervisión; volver al trabajo no lo es.
    if (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE") {
      const cfgDesp = await getConfig_();
      const enReal  = String(cfgDesp.DESPACHO_MODO || "OFF").toUpperCase() === "REAL";
      const deSupervisor = String(nota || "").includes("supervisión")
        || String(nota || "").startsWith("__SUP_")
        || String(nota || "").startsWith("__ADMIN_");

      if (enReal && !asignacion) {
        return res.status(409).json({
          ok: false,
          error: "El taller está en despacho dirigido: espera a que la pantalla te asigne el carro. Si necesitas este vehículo, pídeselo al supervisor.",
          errorType: "DESPACHO_DIRIGIDO",
          vin,
        });
      }

      if (enReal && !deSupervisor && accion === "PAUSA") {
        return res.status(409).json({
          ok: false,
          error: "Las pausas las maneja el supervisor. Pídele que la registre desde su consola.",
          errorType: "PAUSA_SOLO_SUPERVISOR",
          vin,
        });
      }
    }

    // 6?? Calcular nuevo estado según acción
    const estadoActual = asignacion?.estado_actual || "SIN_INICIAR";
    let nuevoEstado = estadoActual;
    let runningSince = asignacion?.running_since || null;
    let tiempoAgregado = 0;

    // ? VALIDACIÓN DE TRANSICIÓN DE ESTADO (lado servidor)
    // Definir transiciones válidas
    const transicionesValidas = {
      "SIN_INICIAR": ["INICIO", "NOTA"],
      "TRABAJANDO": ["PAUSA", "FIN", "NOTA"],
      "PAUSADO": ["REANUDAR", "FIN", "NOTA"],
      "FINALIZADO": ["NOTA"],
    };

    const accionesValidas = transicionesValidas[estadoActual] || ["INICIO", "NOTA"];
    if (!accionesValidas.includes(accion)) {
      console.warn(
        `[EVENTO] Acción no permitida: estado=${estadoActual}, accion=${accion}. ` +
        `Permitidas: ${accionesValidas.join(", ")}`
      );
      return res.status(400).json({
        ok: false,
        error: `Acción ${accion} no permitida desde estado ${estadoActual}`,
        estadoActual: estadoActual,
        accionesPermitidas: accionesValidas,
      });
    }

    switch (accion) {
      case "INICIO":
        nuevoEstado = "TRABAJANDO";
        runningSince = new Date().toISOString();
        break;
      case "PAUSA":
        nuevoEstado = "PAUSADO";
        if (estadoActual === "TRABAJANDO" && runningSince) {
          tiempoAgregado = Date.now() - new Date(runningSince).getTime();
        }
        runningSince = null;
        break;
      case "REANUDAR":
        nuevoEstado = "TRABAJANDO";
        runningSince = new Date().toISOString();
        break;
      case "FIN":
        nuevoEstado = "FINALIZADO";
        if (estadoActual === "TRABAJANDO" && runningSince) {
          tiempoAgregado = Date.now() - new Date(runningSince).getTime();
        }
        runningSince = null;
        break;
      case "NOTA":
        // No cambia estado, solo agrega nota
        break;
    }

    // 7?? Crear evento en Supabase
    const eventoData = {
      timestamp: new Date().toISOString(),
      user_id: userId,
      work_order_id: workOrderId,
      tipo_ot: tipoOt,
      rol_trabajo: rolTrabajo,
      accion: accion,
      nota: nota || "",
    };

    await supabasePost_("eventos", eventoData);

    // 8?? Si no existe asignación, crearla
    if (!asignacion) {
      const asgData = {
        work_order_id: workOrderId,
        user_id: userId,
        tipo_ot: tipoOt,
        rol_trabajo: rolTrabajo,
        estado_actual: nuevoEstado,
        running_since: runningSince,
        tiempo_trab_ms: 0,
        activo: true,
      };
      asignacion = await supabasePost_("asignaciones", asgData);
      if (Array.isArray(asignacion)) asignacion = asignacion[0];
    } else {
      // 9?? Actualizar asignación existente
      const updateData = {
        estado_actual: nuevoEstado,
        running_since: runningSince,
        tiempo_trab_ms: (asignacion.tiempo_trab_ms || 0) + tiempoAgregado,
        updated_at: new Date().toISOString(),
      };
      if (accion === "NOTA") {
        updateData.last_nota = nota;
        updateData.last_nota_ts = new Date().toISOString();
      }

      // Al CERRAR, el sistema deja constancia de que el carro no lo hizo uno
      // solo. Se arma con lo que ya sabe —quién apoyó a quién y desde cuándo—
      // en vez de pedírsela a quien cierra: una nota que hay que escribir se
      // olvida, se escribe distinta cada vez y no sirve para sumar horas.
      //
      // Va en last_nota porque es el campo que el reporte del supervisor ya
      // trae consigo; no hace falta columna nueva para que se vea.
      if (accion === "FIN") {
        const extras = [];

        if (apoyoDelPuesto) {
          // Cierra el AYUDANTE: la nota nombra al ancla, que es el dueño del
          // carro y con quien estuvo trabajando.
          const nombreAncla = await nombreDeUsuario_(apoyoDelPuesto.anclaId);
          extras.push(notaApoyo_({ companero: nombreAncla, desdeIso: apoyoDelPuesto.desde }));
        } else {
          // Cierra el ANCLA: si su puesto tuvo ayudante, la nota lo nombra a él.
          try {
            const apoyos = await apoyosPorPuesto_(jornadaFecha_());
            const a = apoyos.get(`${vin}|${rolTrabajo}`);
            if (a && a.anclaId === asignacion.user_id) {
              const nombreAyudante = await nombreDeUsuario_(a.ayudanteId);
              extras.push(notaApoyo_({ companero: nombreAyudante, desdeIso: a.desde }));
            }
          } catch (e) {
            console.warn("[EVENTO] No se pudo anotar el apoyo al cerrar:", e.message);
          }
        }

        // DUPLA DE TRABAJO: distinta del apoyo y se anota distinto. En el apoyo
        // el carro es del ancla; aquí los dos se emparejaron toda la jornada y
        // el crédito se reparte por alternancia. Leer "trabajó con X" en los dos
        // casos borraría esa diferencia en la pantalla donde se mide a la gente.
        if (!apoyoDelPuesto) {
          try {
            const dup = await duplaDeTrabajoDe_(jornadaFecha_(), asignacion.user_id);
            if (dup?.companeroId) {
              const nombreCompa = await nombreDeUsuario_(dup.companeroId);
              extras.push(notaDupla_({ companero: nombreCompa, desdeIso: dup.desde }));
            }
          } catch (e) {
            console.warn("[EVENTO] No se pudo anotar la dupla al cerrar:", e.message);
          }
        }

        // Colaboración de CALIDAD: el reporte tiene que poder decir "registró
        // Flores, cerró Wilmer". Sin esto el cierre colaborativo borra la
        // diferencia y nadie reconstruye quién hizo qué.
        if (colaborando && !apoyoDelPuesto) {
          extras.push(notaCierreAjeno_({ cerradoPor: usuarios[0]?.nombre || email }));
        }

        const nueva = combinarNotas_(nota, asignacion.last_nota, ...extras);
        if (nueva && nueva !== asignacion.last_nota) {
          updateData.last_nota = nueva;
          updateData.last_nota_ts = new Date().toISOString();
        }
      }
      // Al volver al trabajo, la pausa dejó de existir: si venía con reloj
      // (pausa de supervisión de 5/10/15 min), su vencimiento ya no aplica.
      // Sin esto queda un pausa_hasta futuro sobre una OT que está TRABAJANDO.
      if (accion === "REANUDAR") updateData.pausa_hasta = null;

      const updateResult = await supabasePatch_("asignaciones",
        { id: asignacion.id },
        updateData
      );
      asignacion = Array.isArray(updateResult) ? updateResult[0] : updateResult;
    }

    // 9b. Verificar omisión al hacer INICIO (fire-and-forget, no bloquea respuesta)
    if (accion === "INICIO" && (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE")) {
      const nombreTech = usuarios[0]?.nombre || email;
      checkAndRecordOmision_(userId, nombreTech, rolTrabajo, workOrderId, vin).catch(() => {});
    }

    // 10️⃣ Actualizar estado_general del work_order (MOTOR/TANQUE)
    // Solo FINALIZADO si AMBAS asignaciones (MOTOR y TANQUE) existen y están FINALIZADO
    if ((rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE") && tipoOt === "CONVERSION") {
      try {
        const allAsg = await supabaseGet_("asignaciones", {
          work_order_id: workOrderId,
          activo: true,
        });
        let motor = null, tanque = null;
        for (const a of (allAsg || [])) {
          const rol = String(a.rol_trabajo || "").toUpperCase();
          const est = String(a.estado_actual || "").toUpperCase();
          if (rol === "MOTOR") motor = est;
          if (rol === "TANQUE") tanque = est;
        }
        // Requiere AMBAS asignaciones finalizadas
        const estadoGeneral = (motor === "FINALIZADO" && tanque === "FINALIZADO")
          ? "FINALIZADO"
          : (motor || tanque) ? "EN PROCESO" : "PENDIENTE";

        const woPatch = { estado_general: estadoGeneral };
        // Registrar fecha en que el último técnico (motor o tanque) finalizó.
        // Solo se escribe la primera vez (cuando transiciona a FINALIZADO).
        if (estadoGeneral === "FINALIZADO") {
          woPatch.fecha_sin_calidad = new Date().toISOString();
        }
        await supabasePatch_("work_orders", { id: workOrderId }, woPatch);
        console.log(`[EVENTO] estado_general actualizado: ${estadoGeneral} (motor=${motor}, tanque=${tanque})`);
      } catch (err) {
        console.warn("[EVENTO] No se pudo actualizar estado_general:", err.message);
      }
    }

    // 10b. estado_general de las OTs de UN SOLO ROL (CALIDAD y RAMALERO).
    //
    // A diferencia de CONVERSION —que espera a MOTOR *y* TANQUE— aquí la OT
    // tiene una única asignación, así que su estado ES el de esa asignación.
    //
    // RAMALERO faltaba en esta lista y por eso sus OTs no se cerraban NUNCA:
    // el ramalero terminaba, su asignación pasaba a FINALIZADO, y el
    // work_order se quedaba con el "PENDIENTE" que le puso el alta. Se
    // acumularon 695 OTs dadas por vivas con el trabajo hecho —algunas de hace
    // más de tres meses— ensuciando la consola del supervisor, que es
    // justamente donde se mira qué falta por hacer.
    if (esOtDeUnSoloRol_(tipoOt, rolTrabajo)) {
      try {
        const estadoGeneral = estadoGeneralDeAsignacion_(nuevoEstado);
        await supabasePatch_("work_orders", { id: workOrderId }, { estado_general: estadoGeneral });
        console.log(`[EVENTO] ${tipoOt} estado_general actualizado: ${estadoGeneral}`);
      } catch (err) {
        console.warn(`[EVENTO] No se pudo actualizar estado_general ${tipoOt}:`, err.message);
      }
    }

    // ?? Retornar asignación actualizada - CON TODOS LOS CAMPOS ESPERADOS Y NORMALIZADOS
    const duration = Date.now() - t1;

    // ? NORMALIZACIÓN GARANTIZADA
    const respuesta = {
      ok: true,
      // Campos de asignación
      id: asignacion.id,
      work_order_id: workOrderId,
      user_id: userId,
      tipo_ot: tipoOt,
      rol_trabajo: rolTrabajo,
      estado_actual: asignacion.estado_actual,
      running_since: asignacion.running_since,
      tiempo_trab_ms: asignacion.tiempo_trab_ms || 0,
      activo: asignacion.activo,
      created_at: asignacion.created_at,
      updated_at: asignacion.updated_at,
      last_nota: asignacion.last_nota || "",
      last_nota_ts: asignacion.last_nota_ts,

      // Campos mapeados para compatibilidad con frontend
      vin: vin,  // ? VIN GARANTIZADO
      conversionId: workOrderId,  // Alias
      estado: asignacion.estado_actual,  // Alias
      tiempo_ms: asignacion.tiempo_trab_ms || 0,  // Alias
      rolTrabajo: rolTrabajo,  // camelCase
      tipoRamal: tipoRamal || "",  // Para RAMALERO

      // Metadata
      _timing: `${duration}ms`,
      _source: "supabase",
      _debugInfo: {
        nuevoEstado,
        estadoActualAnterior: estadoActual,
        accion,
      },
    };

    console.log(`[EVENTO] ? Exitoso: ${accion} para VIN=${vin}, ROL=${rolTrabajo}, ESTADO=${nuevoEstado}`);
    // Aviso en vivo a todas las vistas conectadas (supervisor live, mapas, colas)
    emitEvent_("asignaciones", { vin, rol: rolTrabajo, accion, estado: nuevoEstado });

    // Un FIN libera al técnico: el motor reparte YA, no en el próximo intervalo.
    // Sin esto se queda parado hasta un minuto en medio del taller, que es el
    // tiempo muerto que el despacho dirigido venía a eliminar.
    //
    // Fire-and-forget a propósito: la respuesta del FIN no puede quedar colgada
    // de una corrida del motor, que consulta media base. Si falla, el intervalo
    // lo recoge igual — el disparo es un atajo, nunca el único camino.
    if (accion === "FIN" && tipoOt === "CONVERSION" &&
        (rolTrabajo === "MOTOR" || rolTrabajo === "TANQUE")) {
      despachoReparteAhora_()
        .then(puede => { if (puede) return dispararMotor_(`FIN de ${vin}`); })
        .catch(err => console.warn("[EVENTO] Disparo del motor falló:", err.message));
    }

    return res.json(respuesta);
  } catch (e) {
    console.error("[POST /api/evento]", e.message, e.stack);

    // ? Retornar error más informativo y categorizado
    const errorMsg = String(e.message || e);
    let statusCode = 500;
    let errorType = "INTERNAL_ERROR";
    let userMsg = "Error al registrar evento";

    if (errorMsg.includes("404") || errorMsg.includes("no encontrado")) {
      statusCode = 404;
      errorType = "NOT_FOUND";
      userMsg = "Usuario, VIN o  elemento no encontrado";
    } else if (errorMsg.includes("Usuario")) {
      statusCode = 404;
      errorType = "USER_NOT_FOUND";
      userMsg = "Usuario no encontrado";
    } else if (errorMsg.includes("Constraint") || errorMsg.includes("conflict")) {
      statusCode = 409;
      errorType = "CONFLICT";
      userMsg = "Conflicto al crear/actualizar registro";
    } else if (errorMsg.includes("permission") || errorMsg.includes("forbidden")) {
      statusCode = 403;
      errorType = "FORBIDDEN";
      userMsg = "Permiso denegado";
    } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out")) {
      statusCode = 504;
      errorType = "TIMEOUT";
      userMsg = "La operación tardó demasiado. Intenta de nuevo.";
    }

    res.status(statusCode).json({
      ok: false,
      error: userMsg,
      errorType: errorType,
      details: errorMsg,
      _debug: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
});

// endpoint Node → Supabase (estado) - LECTURA SOLO
router.get("/api/estado", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const rolTrabajo = String(req.query.rolTrabajo || "").trim().toUpperCase();
    const timings = [];

    if (!email) return res.status(400).json({ ok:false, error:"Falta email" });
    if (!vin) return res.status(400).json({ ok:false, error:"Falta vin" });
    if (!rolTrabajo) return res.status(400).json({ ok:false, error:"Falta rolTrabajo" });

    // ?? LECTURA DESDE SUPABASE
    // 1. Obtener usuario
    const t1 = Date.now();
    const usuarios = await supabaseGet_("usuarios", { email });
    timings.push({ label: "usuarios_by_email", duration: Date.now() - t1 });

    if (!usuarios || !usuarios.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
    }
    const userId = usuarios[0].id;

    // 2. Obtener work_order por VIN
    const t2 = Date.now();
    const workOrders = await supabaseGet_("work_orders", { vin });
    timings.push({ label: "work_order_by_vin", duration: Date.now() - t2 });

    if (!workOrders || !workOrders.length) {
      addServerTiming_(res, timings);
      return res.status(404).json({ ok: false, error: "VIN no encontrado" });
    }
    const workOrder = workOrders[0];

    // 3. Obtener asignación activa para este usuario + rol
    const t3 = Date.now();
    const asignaciones = await supabaseGet_("asignaciones", {
      work_order_id: workOrder.id,
      user_id: userId,
      rol_trabajo: rolTrabajo,
    });
    timings.push({ label: "asignacion_by_triple", duration: Date.now() - t3 });

    const asignacion = asignaciones && asignaciones.length ? asignaciones[0] : null;

    addServerTiming_(res, timings);
    return res.json({
      ok: true,
      vin,
      rolTrabajo,
      estado: asignacion?.estado_actual || "SIN_INICIAR",
      tiempoMs: asignacion?.tiempo_trab_ms || 0,
      asignacion: asignacion || null,
    });
  } catch (e) {
    console.error("[GET /api/estado]", e.message);
    addServerTiming_(res, timings || []);
    res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

// =========================
// ?? SYNC optimizado — Supabase directo (SIN AppScript = RÁPIDO)
// =========================
router.post("/api/sync", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const userId = String(req.body?.userId || "").trim();
    const since = req.body?.since ?? null;
    const excludeFinalizados = req.body?.excludeFinalizados ?? true;
    const t1 = Date.now();

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Envía email o userId" });
    }

    // 1?? Obtén user_id si viene email
    let finalUserId = userId;
    if (!finalUserId && email) {
      const usuarios = await supabaseGet_("usuarios", { email });
      if (!usuarios?.length) {
        return res.status(404).json({ ok: false, error: "Usuario no encontrado" });
      }
      finalUserId = usuarios[0].id;
    }

    // 2?? Query asignaciones ACTIVAS + work_orders (paralelo)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    let query = `${SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `user_id=eq.${finalUserId}&activo=eq.true`;

    if (excludeFinalizados) {
      query += `&estado_actual=neq.FINALIZADO`;
    }

    query += `&select=*,work_orders(*,vins(reductor_asignado,tanque_asignado))&order=updated_at.desc&limit=50`;

    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) {
      throw new Error(`Supabase ${res_data.status}`);
    }

    const asignaciones = await res_data.json();
    const duration = Date.now() - t1;

    // Mapea a formato que espera el frontend
    const items = asignaciones.map(asg => ({
      asignacion_id: asg.id,
      vin: asg.work_orders?.vin || "",
      conversion_id: asg.work_order_id,
      rol_trabajo: asg.rol_trabajo,
      estado_actual: asg.estado_actual,
      tiempo_ms: asg.tiempo_trab_ms || 0,
      running_since: asg.running_since,
      created_at: asg.running_since || asg.work_orders?.fecha_creacion || "",
      fecha_creacion: asg.work_orders?.fecha_creacion || "",
      last_nota: asg.last_nota || "",
      work_orders: asg.work_orders || {},
    }));

    return res.json({
      ok: true,
      items,
      count: items.length,
      full: false,
      server_time: new Date().toISOString(),
      rev: null,
      mode: "sync_supabase",
      _timing: `${duration}ms`,
      _source: "supabase_optimized",
    });

  } catch (e) {
    console.error("[POST /api/sync]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


router.post("/api/equipo-conformidad", async (req, res) => {
  try {
    const body = req.body || {};

    // Obtener user_id si viene email
    let userId = body.userId || body.user_id;
    if (!userId && body.email) {
      const usuarios = await supabaseGet_("usuarios", { email: body.email });
      if (usuarios && usuarios.length) userId = usuarios[0].id;
    }

    // Leer checks del payload (frontend envía ck1/ck2/ck3 o checks.ck1)
    const checks = body.checks || {};
    const ck1 = !!(body.ck1 ?? body.conf_ck1 ?? checks.ck1);
    const ck2 = !!(body.ck2 ?? body.conf_ck2 ?? checks.ck2);
    const ck3 = !!(body.ck3 ?? body.conf_ck3 ?? checks.ck3);

    if (!ck1 || !ck2 || !ck3) {
      return res.json({ ok: false, error: "Debes marcar los 3 checks de conformidad." });
    }

    const conformidadData = {
      conf_ck1: ck1,
      conf_ck2: ck2,
      conf_ck3: ck3,
      conf_ts: new Date().toISOString(),
      conf_by: body.email || userId,
    };

    const equipoTipo  = String(body.equipoTipo  || "").trim().toUpperCase();
    const equipoCodigo = String(body.equipoCodigo || "").trim().toUpperCase();
    if (equipoCodigo) {
      if (equipoTipo === "TANQUE")   conformidadData.tanque_registrado   = equipoCodigo;
      if (equipoTipo === "REDUCTOR") conformidadData.reductor_registrado = equipoCodigo;
    }

    await supabasePatch_("work_orders", { id: body.conversionId }, conformidadData);

    return res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/equipo-conformidad]", e.message);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// =========================
// FIN PREREQUISITES — valida antes de finalizar OT
// POST /api/fin-prerequisites
// Body: { vin, rol, workOrderId, dateStr }
// Returns: { ok, canFin, blockers: string[] }
// =========================
router.post("/api/fin-prerequisites", async (req, res) => {
  try {
    const { vin, rol, workOrderId, dateStr } = req.body || {};
    const rolUp = String(rol || "").trim().toUpperCase();
    const blockers = [];

    // Solo aplica a MOTOR y TANQUE
    if (rolUp !== "MOTOR" && rolUp !== "TANQUE") {
      return res.json({ ok: true, canFin: true, blockers: [] });
    }

    // 1) Conformidad de equipos
    if (workOrderId) {
      try {
        const wos = await supabaseGet_("work_orders", { id: workOrderId });
        const wo = wos?.[0] || {};

        if (rolUp === "TANQUE" && !wo.tanque_registrado) {
          blockers.push("Falta registrar la serie del TANQUE (Conformidad equipo → TANQUE).");
        }

        if (rolUp === "MOTOR" && !wo.reductor_registrado) {
          blockers.push("Falta registrar la serie del REDUCTOR (Conformidad equipo → REDUCTOR).");
        }
      } catch (e) {
        console.warn("[FIN-PREREQ] Error consultando work_order:", e.message);
      }
    }

    // 2) Fotos de soldadura en R2
    if (vin) {
      // Usar siempre hora Lima para evitar desfase UTC vs Peru (bug al finalizar después de 7 PM)
      const limaToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Lima" }).format(new Date());
      // Mes anterior como fallback: trabajos iniciados el último día del mes previo
      const prevMonthDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
      prevMonthDate.setDate(0); // día 0 = último día del mes anterior
      const limaPrev = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-${String(prevMonthDate.getDate()).padStart(2, "0")}`;

      try {
        const [r2Cur, r2Prev] = await Promise.all([
          r2GetStatus({ vin, dateStr: limaToday }),
          r2GetStatus({ vin, dateStr: limaPrev }),
        ]);
        // Combinar: foto presente en cualquiera de los dos meses cuenta
        const s = {};
        for (const key of Object.keys(r2Cur.status || {})) {
          s[key] = !!(r2Cur.status[key] || (r2Prev.status || {})[key]);
        }

        if (rolUp === "MOTOR") {
          if (!s.sold_cabina_antes || !s.sold_cabina_post) {
            blockers.push("Falta registrar fotos de soldadura de CABINA (antes y después).");
          }
        }

        if (rolUp === "TANQUE") {
          if (!s.sold_sensor_antes || !s.sold_sensor_post) {
            blockers.push("Falta registrar fotos de soldadura del SENSOR DE NIVEL (antes y después).");
          }
        }
      } catch (e) {
        console.warn("[FIN-PREREQ] Error consultando R2 status:", e.message);
      }
    }

    return res.json({
      ok: true,
      canFin: blockers.length === 0,
      blockers,
    });
  } catch (e) {
    console.error("[POST /api/fin-prerequisites]", e.message);
    res.status(500).json({ ok: false, canFin: true, blockers: [], error: String(e.message || e) });
  }
});

router.get("/api/tecnicos-list", async (req, res) => {
  try {
    const t1 = Date.now();

    // ?? LECTURA DIRECTA DE SUPABASE: técnicos activos
    let query = `${process.env.SUPABASE_URL}/rest/v1/usuarios?`;
    query += `rol=eq.TECNICO&activo=eq.true`;
    query += `&select=id,nombre,email,rol,especialidad,created_at`;
    query += `&order=nombre.asc`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// -----------------------------------------------------------------
// ? ENDPOINTS OPTIMIZADOS SUPABASE (queries ultra-rápidas)
// -----------------------------------------------------------------

// 1?? GET /api/asignaciones-activas — Por rol (MOTOR, TANQUE, CALIDAD)
router.get("/api/asignaciones-activas", async (req, res) => {
  try {
    const rol = String(req.query.rol || "MOTOR").toUpperCase();
    const t1 = Date.now();

    // Obtén asignaciones ACTIVAS por rol (ENUM = super rápido)
    let query = `${process.env.SUPABASE_URL}/rest/v1/asignaciones?`;
    query += `rol_trabajo=eq.${rol}&activo=eq.true`;
    query += `&estado_actual=neq.FINALIZADO`;
    query += `&order=running_since.desc&limit=100`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/asignaciones-activas]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 2?? GET /api/work-orders — Por estado + tipo (ENUM filtering)
router.get("/api/work-orders", async (req, res) => {
  try {
    const estado = String(req.query.estado || "EN PROCESO").trim();
    const tipo = String( req.query.tipo || "CONVERSION").toUpperCase();
    const limit = Math.min(parseInt(req.query.limit || "50"), 500);
    const t1 = Date.now();

    let query = `${process.env.SUPABASE_URL}/rest/v1/work_orders?`;
    query += `estado_general=eq.${encodeURIComponent(estado)}&tipo_ot=eq.${tipo}`;
    query += `&select=*,asignaciones(*)&order=created_at.desc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/work-orders]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 3?? GET /api/eventos — Timeline (últimas X horas)
router.get("/api/eventos", async (req, res) => {
  try {
    const horasAtras = Math.min(parseInt(req.query.horas || "24"), 365 * 24);
    const limit = Math.min(parseInt(req.query.limit || "50"), 500);
    const t1 = Date.now();

    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - horasAtras);

    let query = `${process.env.SUPABASE_URL}/rest/v1/eventos?`;
    query += `timestamp=gte.${sinceDate.toISOString()}`;
    query += `&select=*,usuarios(*),work_orders(vin,tipo_ot)`;
    query += `&order=timestamp.desc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const items = await res_data.json();
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/eventos]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// 4?? GET /api/usuarios-activos — Con módulos
router.get("/api/usuarios-activos", async (req, res) => {
  try {
    const t1 = Date.now();

    let query = `${process.env.SUPABASE_URL}/rest/v1/usuarios?`;
    query += `activo=eq.true&select=id,email,nombre,rol,especialidad,usuario_modulos(modulo)`;
    query += `&order=nombre.asc`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const usuarios = await res_data.json();
    const duration = Date.now() - t1;

    // Transforma lookup en array
    const items = usuarios.map(u => ({
      ...u,
      modulos: u.usuario_modulos?.map(m => m.modulo) || [],
    }));

    return res.json({
      ok: true,
      items,
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/usuarios-activos]", e.message);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
