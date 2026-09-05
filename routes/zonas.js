import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { emitEvent_ } from "../lib/events.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";
import { getConfig_ } from "../lib/config.js";
import { fechaPeruMenosDias_ } from "../lib/utils.js";
import { dispararMotor_, despachoReparteAhora_ } from "./despacho.js";

const router = Router();

// Topics que invalidan el mapa: quién ocupa una plaza cambia al asignar o
// liberar zona (zonas), al abrir o cerrar una OT (work_orders), al entrar o
// salir un técnico del carro (asignaciones) y al repartir el motor (despacho).
const TOPICS_ZONAS = ["zonas", "work_orders", "asignaciones", "despacho"];

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

    const [zResp, convResp, finResp] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/conversion_zonas?select=zona_id,vin,registrado_por,registrado_at&order=zona_id.asc`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=neq.FINALIZADO&select=id,vin,estado_general&limit=200`, { method: "GET", headers }),
      fetch(`${SUPABASE_URL}/rest/v1/work_orders?tipo_ot=eq.CONVERSION&estado_general=eq.FINALIZADO&fecha_sin_calidad=gte.${todayStart.toISOString()}&select=id,vin,estado_general&limit=100`, { method: "GET", headers }),
    ]);

    const zonaRows = zResp.ok ? await zResp.json() : [];
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
    const vinsHuerfanos = [...new Set(
      zonaRows.map(z => z.vin).filter(v => v && !woEstadoMap.has(v))
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
    const sin_zona = [];
    for (const [vin, eg] of woEstadoMap) {
      if (!vinZonaSet.has(vin)) {
        sin_zona.push({
          vin,
          estado: (eg || "").toUpperCase() === "FINALIZADO" ? "FINALIZADO" : "EN_CONVERSION",
          tecnicos: tecnicosMap.get(vin) || null,
          modelo:   modeloMap.get(vin) || null,
        });
      }
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
// body: { zona_id (1-15 o 16=sin ubicación), vin, usuario }
router.post("/api/zonas/asignar", async (req, res) => {
  try {
    const { vin, zona_id, usuario } = req.body || {};
    if (!vin) return res.status(400).json({ ok: false, error: "Falta vin" });
    const vinNorm = String(vin).trim().toUpperCase();
    const zonaNum = Number(zona_id);
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();
    const userName = String(usuario || "").trim() || "Sistema";

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
    // zona_id=16 = sin ubicación → ya se limpió en paso 1, no hay más acción

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

    return res.json({ ok: true, zona_id: zonaNum >= 1 && zonaNum <= 15 ? zonaNum : 16 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST /api/zonas/liberar
// body: { zona_id (1-15), usuario }
router.post("/api/zonas/liberar", async (req, res) => {
  try {
    const { zona_id } = req.body || {};
    const zonaNum = Number(zona_id);
    if (!zonaNum || zonaNum < 1 || zonaNum > 15)
      return res.status(400).json({ ok: false, error: "zona_id inválido (1-15)" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const headers = supabaseHeaders_();
    const now = new Date().toISOString();

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/conversion_zonas?zona_id=eq.${zonaNum}`,
      {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ vin: null, registrado_por: "", registrado_at: null, updated_at: now }),
      }
    );
    if (!r.ok) throw new Error("Error al liberar zona");
    emitEvent_("zonas", { accion: "LIBERADA", zona_id: zonaNum });
    return res.json({ ok: true });
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

export default router;
