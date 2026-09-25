import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { emitEvent_ } from "../lib/events.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { getConfig_ } from "../lib/config.js";
import { fechaPeruMenosDias_ } from "../lib/utils.js";
import { dispararMotor_, despachoReparteAhora_ } from "./despacho.js";
import { getUsuarioByEmail_ } from "../lib/authz.js";

const router = Router();

// Topics que invalidan el mapa: quién ocupa una plaza cambia al asignar o
// liberar zona (zonas), al abrir o cerrar una OT (work_orders), al entrar o
// salir un técnico del carro (asignaciones) y al repartir el motor (despacho).
const TOPICS_ZONAS = ["zonas", "work_orders", "asignaciones", "despacho"];

// ─── QUIÉN MUEVE EL MAPA ───────────────────────────────────────────────────
// Hasta el 25-09-2026 el nombre de quien mapeaba venía en el body como texto
// libre (`usuario`), y el mapa lo mandaba vacío: las 15 plazas decían
// "Sistema". Cuando se preguntó quién había puesto un carro en la Zona 7 no
// había a quién señalar.
//
// Ahora el nombre NO se acepta del cliente: se resuelve en el servidor contra
// `usuarios` a partir del email de la sesión, igual que lib/authz.js. Un
// `usuario` en el body se ignora — si se leyera, cualquiera podría firmar
// con el nombre de otro y el historial no probaría nada.
//
// Alcance honesto, el mismo de lib/authz.js: el email sigue viniendo del
// cliente y no hay contraseña que lo pruebe. Esto no impide que alguien
// suplante a otro a propósito; sí garantiza que toda acción queda a nombre de
// una cuenta real y activa, que es lo que faltaba.
async function identidadZona_(req) {
  const email = String(
    req.body?.email || req.query?.email || req.get("x-user-email") || ""
  ).trim().toLowerCase();

  // El motivo del rechazo se dice explícito, como en requireRol_: a quien está
  // en piso no le sirve un "No autorizado" pelado.
  if (!email) return { ok: false, motivo: "SIN_EMAIL",
    error: "Tu sesión no envió tu identidad. Cierra sesión y vuelve a entrar." };

  const u = await getUsuarioByEmail_(email);
  if (!u)        return { ok: false, motivo: "SIN_CUENTA", error: `La cuenta ${email} no existe en el sistema.` };
  if (!u.activo) return { ok: false, motivo: "INACTIVO",   error: `La cuenta ${email} está desactivada.` };

  return { ok: true, email, nombre: u.nombre || email, rol: u.rol };
}

// Estado actual de las plazas implicadas en un movimiento: dónde está AHORA
// el VIN que entra y quién ocupa AHORA la plaza de destino. Se lee ANTES de
// escribir porque el PATCH pisa el dato — que es justo por lo que no había
// historial.
async function estadoPrevioZonas_(vin, zonaNum) {
  try {
    // Liberar no trae VIN —se libera la plaza, no un carro concreto—, así que
    // el filtro se arma solo con lo que hay.
    const cond = [];
    if (vin) cond.push(`vin.eq.${encodeURIComponent(vin)}`);
    if (zonaNum >= 1 && zonaNum <= 15) cond.push(`zona_id.eq.${zonaNum}`);
    if (!cond.length) return { dondeEstaba: null, ocupante: "" };
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/conversion_zonas?or=(${cond.join(",")})&select=zona_id,vin`,
      { method: "GET", headers: supabaseHeaders_() },
    );
    const rows = r.ok ? await r.json() : [];
    const dondeEstaba = rows.find(x => x.vin === vin)?.zona_id ?? null;
    const ocupante    = rows.find(x => x.zona_id === zonaNum)?.vin || "";
    return { dondeEstaba, ocupante: ocupante === vin ? "" : ocupante };
  } catch {
    return { dondeEstaba: null, ocupante: "" };
  }
}

// Libro de actas del mapa (supabase/zonas-historial.sql). Append only: nada
// de lo que entra aquí se actualiza después.
//
// Se ESPERA a que termine, al revés que los otros efectos secundarios de este
// archivo. Un historial que se pierde cuando hay prisa no sirve de prueba, y
// es un INSERT pequeño. Si aun así falla, la acción NO se deshace —el carro ya
// está en su plaza y negarlo sería peor— pero la respuesta lo dice con
// `historial: false` en vez de callarlo.
async function registrarHistorial_(filas) {
  const rows = filas.filter(Boolean);
  if (!rows.length) return true;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/zonas_historial`, {
      method: "POST",
      headers: { ...supabaseHeaders_(), "Prefer": "return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[ZONAS_HIST]", r.status, t.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ZONAS_HIST]", e.message);
    return false;
  }
}

// ─── CONVERSION ZONAS ──────────────────────────────────────────────────────
// GET /api/zonas
// 15 zonas físicas + zona 16 virtual (VINs sin zona asignada).
// El estado de cada zona se computa desde work_orders en tiempo real.
//
// El armado va aparte del handler porque la respuesta se sirve CACHEADA: la
// pantalla del taller la pide cada pocos segundos y el mapa del movilizador
// otra vez por su cuenta, y cada pase cuesta 7 consultas (~18 KB) a Supabase.
// La invalidación es por evento, así que registrar un carro se sigue viendo al
// instante — ver lib/poll-cache.js.
async function armarMapaZonas_() {
  {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    // Fetch zones + active conversion OTs in parallel
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Tope de antigüedad en las OTs abiertas: sin él la consulta crecía sola
    // con las que nadie cerró y el mapa arrastraba carros de hace meses.
    // Ver MAPA_VENTANA_DIAS en lib/config.js.
    const { MAPA_VENTANA_DIAS } = await getConfig_();
    const corteMapa = fechaPeruMenosDias_(Number(MAPA_VENTANA_DIAS) || 30);

    const [zResp, libreResp, convResp, finResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/conversion_zonas?select=zona_id,vin,registrado_por,registrado_at&order=zona_id.asc`, { method: "GET", headers }),
      // Zona Libre ya no se deduce: es una tabla, y un carro solo está ahí si
      // alguien lo puso. Ver supabase/zona-libre.sql.
      fetch(`${SUPABASE_URL}/rest/v1/zona_libre?select=vin,registrado_por,registrado_at`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=neq.FINALIZADO&fecha_creacion=gte.${corteMapa}T00:00:00&select=id,vin,estado_general&limit=200`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&fecha_sin_calidad=gte.${todayStart.toISOString()}&select=id,vin,estado_general&limit=100`, { method: "GET", headers }),
    ]);

    const zonaRows = zResp.ok ? await zResp.json() : [];
    // Si la tabla aún no existe (migración sin correr), Zona Libre sale vacía
    // y el resto del mapa funciona igual.
    const libreRows = libreResp.ok ? await libreResp.json() : [];
    const convRows = convResp.ok ? await convResp.json() : [];
    const finRows  = finResp.ok  ? await finResp.json()  : [];

    // Build VIN → work_order estado map (latest OT wins)
    const woEstadoMap = new Map();
    const woRows = [...convRows, ...finRows];
    for (const wo of woRows) {
      if (wo.vin && !woEstadoMap.has(wo.vin)) woEstadoMap.set(wo.vin, wo.estado_general);
    }

    // Carro estacionado cuya OT no cayó en ninguna de las dos ventanas: se
    // terminó un día anterior y sigue en su plaza. Sin esta consulta la zona lo
    // daba por ESPERANDO y sin técnicos — el carro estaba listo pero la
    // pantalla decía que nadie lo había tocado, que es justo lo que confunde.
    // Zona Libre entra en el rescate igual que las plazas: un carro que
    // alguien colocó a mano tiene que mostrar su estado real aunque su OT
    // quede fuera de la ventana de fechas. Lo colocó una persona; no es un
    // arrastre del cálculo.
    const vinsHuerfanos = [...new Set(
      [...zonaRows.map(z => z.vin), ...libreRows.map(l => l.vin)]
        .filter(v => v && !woEstadoMap.has(v))
    )];
    if (vinsHuerfanos.length) {
      try {
        const q = vinsHuerfanos.map(encodeURIComponent).join(",");
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&vin=in.(${q})` +
          `&select=id,vin,estado_general&order=fecha_creacion.desc&limit=100`,
          { method: "GET", headers }
        );
        for (const wo of (r.ok ? await r.json() : [])) {
          if (!wo.vin || woEstadoMap.has(wo.vin)) continue;
          woEstadoMap.set(wo.vin, wo.estado_general);
          woRows.push(wo);
        }
      } catch {}
    }

    // Todos los VINs activos (en zonas físicas + en zona libre)
    const allVins = [...new Set([
      ...zonaRows.map(z => z.vin).filter(Boolean),
      ...[...woEstadoMap.keys()],
    ])];
    // Una OT por VIN: con dos abiertas para el mismo carro las asignaciones de
    // la vieja pisarían los nombres de la que está en curso.
    const vistas_ = new Set();
    const allWos = woRows.filter(w => {
      if (!w.id || !w.vin || vistas_.has(w.vin)) return false;
      vistas_.add(w.vin);
      return true;
    });

    // Fetch en paralelo: asignaciones activas + modelo_normalizado de VINs
    const [tecnicosMap, modeloMap] = await Promise.all([
      // VIN → { delantero, tanquero, delantero_fin, tanquero_fin }
      //
      // `*_fin` dice si ESE puesto ya cerró su trabajo. Es lo que pinta el
      // carro por mitades en el mapa (arriba delantero, abajo tanquero): el
      // nombre se queda aunque haya terminado — quien hizo el carro sigue
      // siendo el responsable — y el color es el que dice que ya acabó.
      (async () => {
        const map = new Map();
        if (!allWos.length) return map;
        try {
          const woIds = allWos.map(w => w.id).join(",");
          const asgResp = await fetch(
            `${SUPABASE_URL}/rest/v1/asignaciones?work_order_id=in.(${encodeURIComponent(woIds)})&activo=eq.true&select=work_order_id,user_id,rol_trabajo,estado_actual`,
            { method: "GET", headers }
          );
          const asgs = asgResp.ok ? await asgResp.json() : [];
          if (asgs.length) {
            const userIds = [...new Set(asgs.map(a => a.user_id))].join(",");
            const usrResp = await fetch(
              `${SUPABASE_URL}/rest/v1/usuarios?id=in.(${encodeURIComponent(userIds)})&select=id,nombre`,
              { method: "GET", headers }
            );
            const usrs = usrResp.ok ? await usrResp.json() : [];
            const userNombreMap = new Map(usrs.map(u => [u.id, u.nombre]));
            const woIdToVin = new Map(allWos.map(w => [w.id, w.vin]));
            for (const a of asgs) {
              const vin = woIdToVin.get(a.work_order_id);
              const nombre = userNombreMap.get(a.user_id);
              if (!vin || !nombre) continue;
              const primerNombre = String(nombre).trim().split(/\s+/)[0];
              const rol = String(a.rol_trabajo || "").toUpperCase();
              const fin = String(a.estado_actual || "").toUpperCase() === "FINALIZADO";
              if (!map.has(vin)) map.set(vin, {});
              const entry = map.get(vin);
              if (rol === "MOTOR") { entry.delantero = primerNombre; entry.delantero_fin = fin; }
              else if (rol === "TANQUE") { entry.tanquero = primerNombre; entry.tanquero_fin = fin; }
            }
          }
        } catch {}
        return map;
      })(),

      // VIN → modelo_normalizado
      (async () => {
        const map = new Map();
        if (!allVins.length) return map;
        try {
          const vinQ = allVins.map(v => encodeURIComponent(v)).join(",");
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/vins?vin=in.(${vinQ})&select=vin,modelo_normalizado&limit=200`,
            { method: "GET", headers }
          );
          const rows = r.ok ? await r.json() : [];
          for (const row of rows) {
            if (row.vin && row.modelo_normalizado) map.set(row.vin, row.modelo_normalizado);
          }
        } catch {}
        return map;
      })(),
    ]);

    // Compute estado for a zone
    function zonaEstado_(vin) {
      if (!vin) return "LIBRE";
      const eg = (woEstadoMap.get(vin) || "").toUpperCase();
      if (!eg) return "ESPERANDO";
      if (eg === "FINALIZADO") return "FINALIZADO";
      return "EN_CONVERSION";
    }

    const vinZonaSet = new Set();
    const zonas = zonaRows.map(z => {
      if (z.vin) vinZonaSet.add(z.vin);
      return {
        zona_id:       z.zona_id,
        vin:           z.vin || null,
        estado:        zonaEstado_(z.vin),
        registrado_por: z.registrado_por || "",
        registrado_at: z.registrado_at || null,
        tecnicos:      z.vin ? (tecnicosMap.get(z.vin) || null) : null,
        modelo:        z.vin ? (modeloMap.get(z.vin) || null) : null,
      };
    });

    // Zone 16: VINs in conversion flow but not assigned to any physical zone
    // ─── Zona Libre ───────────────────────────────────────────────────
    //
    // Antes esto era una RESTA: todo VIN con OT viva que no ocupara plaza
    // caía aquí solo. Por eso había carros que nadie había visto nunca y
    // otros que llevaban meses sin poder salir. Ahora es una lista: está
    // quien alguien puso, y punto.
    //
    // Se cae de la lista por dos motivos:
    //   · El carro ya entró en calidad — se fue del área de conversión.
    //   · Se le dio una plaza de las 15 — no puede estar en dos sitios.
    const vinsLibre = [...new Set(libreRows.map(l => l.vin).filter(Boolean))];

    // Quién ya está en manos de calidad. Consulta acotada a los de Zona
    // Libre, que son unos pocos.
    let enCalidad = new Set();
    if (vinsLibre.length) {
      try {
        const q = vinsLibre.map(v => `"${v}"`).join(",");
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CALIDAD&vin=in.(${q})&select=vin`,
          { method: "GET", headers }
        );
        if (r.ok) enCalidad = new Set((await r.json()).map(w => w.vin).filter(Boolean));
      } catch {}
    }

    const sin_zona = [];
    const aSoltar = [];
    for (const l of libreRows) {
      const vin = l.vin;
      if (!vin) continue;
      if (enCalidad.has(vin) || vinZonaSet.has(vin)) { aSoltar.push(vin); continue; }
      const eg = woEstadoMap.get(vin);
      sin_zona.push({
        vin,
        estado: (eg || "").toUpperCase() === "FINALIZADO" ? "FINALIZADO" : "EN_CONVERSION",
        tecnicos: tecnicosMap.get(vin) || null,
        modelo:   modeloMap.get(vin) || null,
        registrado_por: l.registrado_por || "",
        registrado_at:  l.registrado_at || null,
      });
    }
    sin_zona.sort((a, b) => new Date(a.registrado_at || 0) - new Date(b.registrado_at || 0));

    // Los que ya no pintan nada aquí se borran, para que la tabla no crezca
    // con carros que se fueron hace meses. Va suelto y sin esperar: quien
    // manda es el filtro de arriba, y si el borrado falla el carro sigue sin
    // salir en el mapa. Un GET que escribe no puede retrasar la respuesta.
    if (aSoltar.length) {
      fetch(`${SUPABASE_URL}/rest/v1/zona_libre?vin=in.(${aSoltar.map(v => `"${v}"`).join(",")})`,
        { method: "DELETE", headers })
        .catch(() => {});
    }

    return { ok: true, zonas, sin_zona };
  }
}

router.get("/api/zonas", async (req, res) => {
  try {
    const cfg = await getConfig_();
    // La fecha peruana entra en la clave: el payload separa las OTs cerradas
    // HOY de las de ayer, y al cruzar la medianoche la entrada vieja ya no
    // corresponde a lo que se está pidiendo.
    const payload = await cachedByTopics_(
      `zonas:mapa:${fechaPeruMenosDias_(0)}`, TOPICS_ZONAS, cfg.SRV_CACHE_MAPA_MS,
      armarMapaZonas_,
      { bypass: req.query.fresh === "1" },
    );
    return res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/zonas/asignar
// body: { zona_id (1-15 o 16=sin ubicación), vin, email, origen? }
//
// `usuario` ya no se lee: el nombre sale de la cuenta, no del body.
// Ver identidadZona_().
router.post("/api/zonas/asignar", async (req, res) => {
  try {
    const { vin, zona_id, origen } = req.body || {};
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });

    const quien = await identidadZona_(req);
    if (!quien.ok) return res.status(403).json({ ok: false, error: quien.error, motivo: quien.motivo });

    const vinNorm = String(vin).trim().toUpperCase();
    const zonaNum = Number(zona_id);
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();
    const userName = quien.nombre;

    // Foto del antes: quién ocupaba el destino y de dónde viene este VIN. Se
    // lee ahora porque los PATCH de abajo borran ambas cosas.
    const previo = await estadoPrevioZonas_(vinNorm, zonaNum);

    // 1. Quitar el VIN de cualquier zona donde esté actualmente
    await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?vin=eq.${encodeURIComponent(vinNorm)}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ vin: null, registrado_por: "", registrado_at: null, updated_at: now }),
      }
    );

    // 2. Si zona 1-15, asignar a esa zona (desplaza al anterior si la ocupa)
    if (zonaNum >= 1 && zonaNum <= 15) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/conversion_zonas?zona_id=eq.${zonaNum}`,
        {
          method: "PATCH",
          headers: { ...headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ vin: vinNorm, registrado_por: userName, registrado_at: now, updated_at: now }),
        }
      );
      if (!r.ok) throw new Error("Error al asignar zona");
    }

    // 3. Zona Libre (16) es ahora un sitio, no la ausencia de sitio: se
    // registra igual que una plaza. Antes aquí no se hacía nada y el carro
    // "aparecía" en Zona Libre solo porque el mapa la calculaba restando.
    if (zonaNum === 16) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/zona_libre?on_conflict=vin`, {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ vin: vinNorm, registrado_por: userName, registrado_at: now }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("[ZONA_LIBRE]", r.status, t);
        return res.status(502).json({
          ok: false,
          error: "No se pudo registrar en Zona Libre. ¿Falta correr supabase/zona-libre.sql?",
        });
      }
    } else {
      // Una plaza de las 15 lo saca de Zona Libre: no puede estar en dos
      // sitios, y sin esto se quedaría duplicado en el mapa.
      await fetch(`${SUPABASE_URL}/rest/v1/zona_libre?vin=eq.${encodeURIComponent(vinNorm)}`,
        { method: "DELETE", headers }).catch(() => {});
    }

    // Dos filas cuando hay desplazamiento: la del que entra y la del que sale.
    // Sin la segunda, el historial del carro expulsado saldría vacío — y ese
    // es el carro que acaba siendo "fantasma": OT viva y ninguna plaza.
    const zonaFinal = zonaNum >= 1 && zonaNum <= 15 ? zonaNum : 16;
    const comun = {
      ocurrido_at: now,
      usuario_email:  quien.email,
      usuario_nombre: quien.nombre,
      usuario_rol:    quien.rol,
      origen: String(origen || "").slice(0, 40),
    };
    const historialOk = await registrarHistorial_([
      { ...comun, accion: "ASIGNAR", zona_id: zonaFinal, vin: vinNorm,
        vin_relacionado: previo.ocupante, zona_anterior: previo.dondeEstaba },
      previo.ocupante
        ? { ...comun, accion: "DESPLAZADO", zona_id: zonaFinal, vin: previo.ocupante,
            vin_relacionado: vinNorm, zona_anterior: zonaFinal }
        : null,
    ]);

    emitEvent_("zonas", { accion: "ASIGNADA" });

    // Un carro que entra a una zona física es trabajo nuevo, y el motor solo
    // ve los carros que están en conversion_zonas: hasta que este VIN no cae
    // ahí, para el reparto no existe. Se dispara YA en vez de esperar al
    // intervalo, que es el mismo atajo que ya toma el FIN de un técnico.
    //
    // Zona 16 no dispara: ahí el carro SALE del mapa, no aparece trabajo.
    //
    // Fire-and-forget a propósito: la respuesta del registro no puede quedar
    // colgada de una corrida del motor, que consulta media base. Si falla, el
    // intervalo lo recoge igual — el disparo es un atajo, nunca el único camino.
    if (zonaNum >= 1 && zonaNum <= 15) {
      despachoReparteAhora_()
        .then(puede => { if (puede) return dispararMotor_(`registro de ${vinNorm} en Z${zonaNum}`); })
        .catch(err => console.warn("[Zonas] Disparo del motor falló:", err.message));
    }

    return res.json({
      ok: true,
      zona_id: zonaFinal,
      registrado_por: quien.nombre,
      // El que se quedó sin plaza: el cliente avisa en vez de tragárselo.
      desplazado: previo.ocupante || null,
      historial: historialOk,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/zonas/liberar
// body: { zona_id (1-15), email, origen? }
router.post("/api/zonas/liberar", async (req, res) => {
  try {
    const { zona_id, origen } = req.body || {};
    const zonaNum = Number(zona_id);
    if (!zonaNum || zonaNum < 1 || zonaNum > 15)
      return res.status(400).json({ ok: false, error: "zona_id inválido (1-15)" });

    const quien = await identidadZona_(req);
    if (!quien.ok) return res.status(403).json({ ok: false, error: quien.error, motivo: quien.motivo });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();

    // A quién se está sacando. El PATCH lo borra, así que se lee antes.
    const previo = await estadoPrevioZonas_("", zonaNum);

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?zona_id=eq.${zonaNum}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ vin: null, registrado_por: "", registrado_at: null, updated_at: now }),
      }
    );
    if (!r.ok) throw new Error("Error al liberar zona");

    const historialOk = await registrarHistorial_([{
      ocurrido_at: now,
      accion: "LIBERAR",
      zona_id: zonaNum,
      vin: previo.ocupante,
      zona_anterior: zonaNum,
      usuario_email:  quien.email,
      usuario_nombre: quien.nombre,
      usuario_rol:    quien.rol,
      origen: String(origen || "").slice(0, 40),
    }]);

    emitEvent_("zonas", { accion: "LIBERADA", zona_id: zonaNum });
    return res.json({ ok: true, vin: previo.ocupante || null, historial: historialOk });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/zonas/vin/:vin
// Devuelve la zona asignada a un VIN (null = zona 16 / sin ubicación)
router.get("/api/zonas/vin/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").trim().toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?vin=eq.${encodeURIComponent(vin)}&select=zona_id`,
      { method: "GET", headers }
    );
    const rows = r.ok ? await r.json() : [];
    return res.json({ ok: true, vin, zona_id: rows.length ? rows[0].zona_id : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET /api/zonas/historial?vin=&zona_id=&desde=&limit=
// Quién movió qué en el mapa. Sin filtros devuelve los últimos movimientos
// del taller; con `vin` responde la pregunta que dejó esto en evidencia —
// "¿quién mapeó este carro?"— incluidas las veces que lo desplazaron.
//
// `vin` acepta el VIN completo o el trozo final que se lee en el carro: en
// piso nadie dicta 17 caracteres, y buscar "515110" tenía que funcionar.
router.get("/api/zonas/historial", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const vin    = String(req.query.vin || "").trim().toUpperCase();
    const zonaId = Number(req.query.zona_id);
    const desde  = String(req.query.desde || "").trim();
    const limit  = Math.min(Number(req.query.limit) || 100, 500);

    let q = `${SUPABASE_URL}/rest/v1/zonas_historial?select=*&order=ocurrido_at.desc&limit=${limit}`;
    if (vin) {
      // El carro desplazado aparece en `vin`; el que lo desplazó, en
      // `vin_relacionado`. Los dos lados cuentan la misma historia.
      const p = encodeURIComponent(`*${vin}*`);
      q += `&or=(vin.like.${p},vin_relacionado.like.${p})`;
    }
    if (zonaId >= 1 && zonaId <= 16) q += `&zona_id=eq.${zonaId}`;
    if (desde) q += `&ocurrido_at=gte.${encodeURIComponent(desde)}`;

    const r = await fetch(q, { method: "GET", headers: supabaseHeaders_() });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      // El 404 de PostgREST cuando la tabla no existe se dice con todas las
      // letras: lo que falta es correr la migración, no reintentar.
      if (r.status === 404) {
        return res.status(503).json({
          ok: false,
          error: "El historial de zonas aún no existe. Falta correr supabase/zonas-historial.sql.",
        });
      }
      throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`);
    }
    return res.json({ ok: true, movimientos: await r.json() });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
