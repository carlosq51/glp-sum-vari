// =========================
// routes/invitado.js
// Consulta pública de un VIN: ¿este carro puede salir del taller?
//
// El problema que resuelve: PDI estaba despachando carros al cliente sin GLP.
// No tienen cuenta en el sistema ni la van a tener, así que la consulta es
// abierta — cualquiera con el link escanea un VIN y ve el veredicto.
//
// Al ser público, este archivo es la única superficie de la app que un
// desconocido puede llamar a voluntad. Dos consecuencias que condicionan
// todo lo de abajo:
//
//   1. La respuesta lleva SOLO el veredicto y el estado de las dos etapas.
//      Nada de cliente, modelo, técnicos, fechas ni números de OT: quien
//      pregunta no está identificado y no tiene por qué recibir el padrón.
//   2. Cada consulta son 2 lecturas a Supabase. Sin freno, un bucle desde
//      fuera se come el egress del plan. De ahí el cache por VIN y el
//      límite por IP.
// =========================

import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";
import { isValidOT_ } from "../lib/utils.js";
import { getConfig_ } from "../lib/config.js";
import { cachedByTopics_ } from "../lib/poll-cache.js";

const router = Router();

// Un VIN es 17 caracteres alfanuméricos sin I, O ni Q. Se valida antes de
// tocar la base: así una URL con basura se responde sin gastar una consulta,
// que es justo lo que intentaría quien quiera hacer ruido desde fuera.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,17}$/;

// ─── Límite por IP ────────────────────────────────────────────────────
// Ventana deslizante simple, en memoria. No pretende parar un ataque
// distribuido: pretende que un script despistado o un scanner en bucle no
// deje sin egress al taller. Quien pase del límite recibe 429 y sigue
// pudiendo consultar un minuto después.
const RL_VENTANA_MS = 60_000;
const RL_MAX        = 40;   // consultas por IP y minuto
const _hits = new Map();    // ip → number[] (timestamps dentro de la ventana)

/**
 * @param {string} ip
 * @param {number} [coste]  cuánto cuenta esta petición. Un lote cuesta más que
 *   una consulta suelta: a la base le cuesta lo mismo (son las mismas dos
 *   consultas), pero deja mirar 100 VINs de una vez, y eso es lo que usaría
 *   quien quiera vaciar el padrón.
 */
function excedeLimite_(ip, coste) {
  const ahora = Date.now();
  const previas = (_hits.get(ip) || []).filter(t => ahora - t < RL_VENTANA_MS);
  for (let i = 0; i < (coste || 1); i++) previas.push(ahora);
  _hits.set(ip, previas);
  // El Map crece con cada IP nueva. Se poda cuando se hace grande, no en cada
  // petición: recorrerlo entero por consulta sería peor que el problema.
  if (_hits.size > 5000) {
    for (const [k, v] of _hits) {
      if (!v.length || ahora - v[v.length - 1] > RL_VENTANA_MS) _hits.delete(k);
    }
  }
  return previas.length > RL_MAX;
}

// ─── Veredictos ───────────────────────────────────────────────────────
// El texto vive aquí y no en la página: es lo que alguien de PDI lee para
// decidir si suelta un carro, y quiero poder corregirlo sin tocar el HTML.
const VEREDICTOS = {
  ANULADO: {
    tono: "ok",
    titulo: "NO LLEVA GLP",
    detalle: "La solicitud de conversión fue anulada. Este carro puede continuar.",
  },
  DELEGADO: {
    tono: "ok",
    titulo: "NO LLEVA GLP AQUÍ",
    detalle: "Este carro se convierte en otra sede. Puede continuar.",
  },
  LISTO: {
    tono: "ok",
    titulo: "GLP COMPLETO",
    detalle: "Conversión y revisión técnica terminadas. Este carro puede salir.",
  },
  FALTA_CALIDAD: {
    tono: "warn",
    titulo: "FALTA REVISIÓN TÉCNICA",
    detalle: "La conversión terminó, pero calidad todavía no lo aprueba. No lo despache.",
  },
  EN_PROCESO: {
    tono: "warn",
    titulo: "EN PROCESO DE GLP",
    detalle: "El carro está siendo convertido ahora mismo. No lo despache.",
  },
  FALTA_GLP: {
    tono: "danger",
    titulo: "FALTA GLP",
    detalle: "Este carro necesita conversión y todavía no ha empezado. No lo despache.",
  },
  NO_FIGURA: {
    tono: "duda",
    titulo: "NO FIGURA EN EL PADRÓN GLP",
    detalle: "Este VIN no está en la lista de carros GLP. Probablemente no lleva, pero conviene confirmar antes de despacharlo.",
  },
};

/**
 * Tono de una etapa, para pintarla.
 *
 * Tres estados y no más: gris (nadie la ha tocado), ámbar (alguien está
 * dentro) y verde (cerrada). Se decide aquí, pegado a la etiqueta, para que
 * color y texto no puedan contradecirse: si mañana aparece un estado nuevo,
 * los dos lo tratan igual en vez de divergir.
 */
function tonoEtapa_(estado) {
  if (!estado) return "sin";
  if (estado === "FINALIZADO") return "listo";
  return "proceso";
}

/** Etiqueta legible del estado de una OT (o "No iniciada" si no existe). */
function etiquetaEtapa_(estado) {
  if (!estado) return "No iniciada";
  if (estado === "FINALIZADO")  return "Finalizada";
  if (estado === "TRABAJANDO")  return "En proceso";
  if (estado === "EN PROCESO")  return "En proceso";
  if (estado === "PENDIENTE")   return "Pendiente";
  return estado;
}

/**
 * Decide el veredicto a partir del padrón y las dos OTs.
 *
 * El orden importa: ANULADO y DELEGADO mandan sobre todo lo demás. Un carro
 * anulado puede tener una OT de conversión a medias de antes de anularse, y
 * si mirásemos las OTs primero lo frenaríamos sin motivo.
 */
export function decidirVeredicto_(enPadron, estadoPadron, conv, cal) {
  const e = String(estadoPadron || "").trim().toUpperCase();
  if (e === "ANULADO")  return "ANULADO";
  if (e === "DELEGADO") return "DELEGADO";
  if (!enPadron)        return "NO_FIGURA";

  if (cal === "FINALIZADO")  return "LISTO";
  if (conv === "FINALIZADO") return "FALTA_CALIDAD";
  // Una OT de calidad abierta implica que la conversión ya terminó, aunque su
  // OT haya quedado sin cerrar: el carro está en manos de calidad, no parado.
  if (cal)                   return "FALTA_CALIDAD";
  if (conv === "EN PROCESO" || conv === "TRABAJANDO") return "EN_PROCESO";
  return "FALTA_GLP";
}

/**
 * Consulta N VINs con DOS lecturas, no con dos por VIN.
 *
 * Un lote de 100 le cuesta a Supabase lo mismo que uno suelto. Por eso la
 * versión suelta también pasa por aquí: un solo camino que probar, y el
 * veredicto no puede divergir entre la pantalla de escaneo y la de lista.
 *
 * @param {string[]} vins  ya validados y normalizados
 * @returns {Promise<object[]>} un resultado por VIN, en el mismo orden
 */
async function consultarVins_(vins) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const headers = supabaseHeaders_();
  const inList = vins.map(v => `"${v}"`).join(",");

  const [vinResp, woResp] = await Promise.all([
    // `select=*` y no `select=vin,estado` a propósito: si la columna `estado`
    // no existe (supabase/invitado.sql sin correr), pedirla por nombre hace
    // que PostgREST rechace la consulta entera. Eso devolvía "no figura en el
    // padrón" para carros que sí están — el peor error posible aquí, porque
    // suena a "puede salir". Las columnas de más no salen de este servidor.
    fetch(`${SUPABASE_URL}/rest/v1/vins?vin=in.(${inList})&select=*`,
      { method: "GET", headers }),
    // Sin filtro de fecha: un carro puede llevar meses parado y su OT seguir
    // siendo la que manda. Ordenado para que la primera de cada tipo gane.
    fetch(`${SUPABASE_URL}/rest/v1/work_orders?vin=in.(${inList})` +
      `&tipo_ot=in.(CONVERSION,CALIDAD)&select=vin,tipo_ot,estado_general,fecha_creacion` +
      `&order=fecha_creacion.desc`,
      { method: "GET", headers }),
  ]);

  // Una consulta que falla NO se degrada a veredicto: sin el padrón no se sabe
  // si el carro lleva GLP, y responder "no figura" sonaría a "puede salir". Se
  // prefiere el error, que la página muestra como "no se pudo consultar" y
  // obliga a preguntar al área de GLP.
  if (!vinResp.ok || !woResp.ok) {
    throw new Error(`Supabase respondió ${vinResp.status}/${woResp.status}`);
  }
  const vinRows = await vinResp.json();
  const woRows  = await woResp.json();

  const padron = new Map();
  for (const f of (vinRows || [])) if (f?.vin) padron.set(String(f.vin).toUpperCase(), f);

  // La OT más reciente de cada tipo manda: un carro re-trabajado tiene OTs
  // viejas que ya no dicen nada de dónde está ahora. Como vienen ordenadas por
  // fecha descendente, la primera que se ve de cada tipo es la buena.
  const ots = new Map(); // vin → { conv, cal }
  for (const wo of (woRows || [])) {
    if (!wo?.vin) continue;
    const k = String(wo.vin).toUpperCase();
    const e = ots.get(k) || { conv: null, cal: null };
    if (wo.tipo_ot === "CONVERSION" && e.conv === null) e.conv = wo.estado_general || "";
    if (wo.tipo_ot === "CALIDAD"    && e.cal  === null) e.cal  = wo.estado_general || "";
    ots.set(k, e);
  }

  return vins.map(vin => {
    const fila = padron.get(vin) || null;
    const e = ots.get(vin) || { conv: null, cal: null };
    // Mientras la migración no corra, `estado` simplemente no viene y el
    // veredicto sale de las OTs: sirve igual, solo sin ANULADO/DELEGADO.
    const clave = decidirVeredicto_(!!fila, fila?.estado || "", e.conv, e.cal);
    const v = VEREDICTOS[clave];
    return {
      vin,
      veredicto: clave,
      tono:    v.tono,
      titulo:  v.titulo,
      detalle: v.detalle,
      etapas: {
        conversion: etiquetaEtapa_(e.conv),
        calidad:    etiquetaEtapa_(e.cal),
      },
      // Campo aparte, y no dentro de `etapas`, a propósito: /invitado lee
      // `etapas.conversion` como texto y tiene que seguir leyéndolo igual.
      etapas_tono: {
        conversion: tonoEtapa_(e.conv),
        calidad:    tonoEtapa_(e.cal),
      },
    };
  });
}

// GET /api/invitado/vin/:vin — consulta pública, sin sesión.
router.get("/api/invitado/vin/:vin", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "?";
    if (excedeLimite_(ip)) {
      return res.status(429).json({ ok: false, error: "Demasiadas consultas seguidas. Espere un minuto." });
    }

    const vin = String(req.params.vin || "").replace(/\s+/g, "").trim().toUpperCase();
    if (!VIN_RE.test(vin)) {
      return res.status(400).json({ ok: false, error: "VIN inválido." });
    }

    // Cache por VIN. Los topics son los que mueven un veredicto: una OT que
    // cambia de estado ("work_orders") o el padrón que se resincroniza
    // ("vins"). Lo que llega desde Apps Script no emite evento, y para eso
    // está el TTL. Un carro recién terminado puede tardar un ciclo en verse
    // como LISTO; lo que nunca pasa es lo contrario — que uno sin GLP salga
    // como listo — porque para eso su OT tendría que cerrarse, y eso sí
    // invalida al instante.
    const { SRV_CACHE_PESADO_MS } = await getConfig_();
    const payload = await cachedByTopics_(
      `invitado:vin:${vin}`, ["work_orders", "vins"], SRV_CACHE_PESADO_MS,
      async () => ({ ok: true, ...(await consultarVins_([vin]))[0] }));

    return res.json(payload);
  } catch (e) {
    console.error("[INVITADO_VIN]", e.message);
    return res.status(500).json({ ok: false, error: "No se pudo consultar. Intente de nuevo." });
  }
});

// POST /api/invitado/lote — varios VINs de una vez.
// body: { vins: ["...", "..."] }
//
// PDI trabaja con listas pegadas desde un correo o un Excel, no de uno en uno.
// Sin esto tenían que escanear carro por carro, que es justo la fricción por
// la que se acaba despachando sin mirar.
const LOTE_MAX = 100;
router.post("/api/invitado/lote", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "?";
    // Un lote cuenta como varias consultas: ver arriba, en excedeLimite_.
    if (excedeLimite_(ip, 5)) {
      return res.status(429).json({ ok: false, error: "Demasiadas consultas seguidas. Espere un minuto." });
    }

    const crudos = Array.isArray(req.body?.vins) ? req.body.vins : [];
    if (!crudos.length) {
      return res.status(400).json({ ok: false, error: "No se recibió ningún VIN." });
    }

    // Se separan los que no son VIN en vez de rechazar el lote entero: quien
    // pega una lista casi siempre arrastra una cabecera o una celda vacía, y
    // tirar las 40 buenas por una mala sería absurdo. Los descartados se
    // devuelven para que la página los enseñe y nadie dé por consultado algo
    // que no lo fue.
    const vistos = new Set();
    const vins = [], invalidos = [];
    for (const c of crudos) {
      const v = String(c || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!VIN_RE.test(v)) { if (v) invalidos.push(v.slice(0, 20)); continue; }
      if (vistos.has(v)) continue;   // duplicados en la lista pegada
      vistos.add(v);
      vins.push(v);
    }

    if (vins.length > LOTE_MAX) {
      return res.status(400).json({
        ok: false,
        error: `Son demasiados de una vez (${vins.length}). El máximo es ${LOTE_MAX}.`,
      });
    }
    if (!vins.length) {
      return res.status(400).json({ ok: false, error: "Ningún VIN de la lista es válido.", invalidos });
    }

    // Cache por lista ordenada: dos personas que peguen la misma lista se
    // sirven de una sola lectura. Mismo patrón que /api/movilizador/revalidate-ot.
    const clave = [...vins].sort().join(",");
    const { SRV_CACHE_PESADO_MS } = await getConfig_();
    const resultados = await cachedByTopics_(
      `invitado:lote:${clave}`, ["work_orders", "vins"], SRV_CACHE_PESADO_MS,
      () => consultarVins_(vins));

    // El resumen es lo que de verdad se mira: de 40 carros, cuáles NO pueden
    // salir. Va calculado aquí para que la página no tenga que saber qué
    // veredictos frenan un despacho.
    const frenan = resultados.filter(r => r.tono === "warn" || r.tono === "danger").length;
    const dudosos = resultados.filter(r => r.tono === "duda").length;

    return res.json({
      ok: true,
      total: resultados.length,
      frenan,
      dudosos,
      pueden: resultados.length - frenan - dudosos,
      invalidos,
      resultados,
    });
  } catch (e) {
    console.error("[INVITADO_LOTE]", e.message);
    return res.status(500).json({ ok: false, error: "No se pudo consultar. Intente de nuevo." });
  }
});

// GET /api/invitado/sugerir?q= — autocompletado para la página pública.
//
// Existe aparte de /api/vin-suggest porque aquél acepta UNA letra y devuelve
// modelo y cliente de cada VIN: dentro de la app es lo que hace falta, pero
// colgado de una página pública es un enumerador del padrón — se teclea "A" y
// salen doce carros con su cliente.
//
// Aquí: mínimo 4 caracteres (los últimos del VIN, que es como se busca de
// verdad un carro), como mucho 8 resultados y SOLO el VIN. Basta para no
// escribir los 17 a mano y no sirve para llevarse la lista.
const SUG_MIN = 4;
const SUG_MAX = 8;
router.get("/api/invitado/sugerir", async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || "?";
    if (excedeLimite_(ip)) {
      return res.status(429).json({ ok: false, items: [] });
    }

    // Se limpia igual que un VIN: quien teclea un guion o un espacio busca lo
    // mismo, y así el patrón nunca lleva comodines de PostgREST.
    const q = String(req.query.q || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (q.length < SUG_MIN) return res.json({ ok: true, items: [] });

    const { SRV_CACHE_PESADO_MS } = await getConfig_();
    const payload = await cachedByTopics_(
      `invitado:sugerir:${q}`, ["vins"], SRV_CACHE_PESADO_MS, async () => {
        const url = `${process.env.SUPABASE_URL}/rest/v1/vins` +
          `?vin=ilike.${encodeURIComponent(`%${q}%`)}&select=vin&order=vin.asc&limit=${SUG_MAX}`;
        const r = await fetch(url, { method: "GET", headers: supabaseHeaders_() });
        if (!r.ok) return { ok: true, items: [] };
        const filas = await r.json();
        return { ok: true, items: (filas || []).map(v => v.vin).filter(Boolean) };
      });

    return res.json(payload);
  } catch (e) {
    console.error("[INVITADO_SUGERIR]", e.message);
    // El autocompletado es una comodidad: si falla, se calla y el usuario
    // sigue pudiendo escribir el VIN entero.
    return res.json({ ok: true, items: [] });
  }
});

// GET /api/vin/ficha/:vin — el mismo veredicto, con el detrás.
//
// Esto NO es la vista de invitado: alimenta la cartilla "Consulta de VIN" de
// dentro de la app, donde supervisión necesita saber en qué zona está el
// carro, quién lo trabajó y cuándo. Vive en este archivo porque el veredicto
// es el mismo y no quiero dos verdades sobre si un carro puede salir.
//
// Sobre el acceso: este servidor no autentica ninguna de sus rutas — ni las de
// admin. Quien filtra por rol es el cliente. Se mantiene esa (mala) costumbre
// aquí por coherencia, pero conviene saberlo: la cartilla se esconde a los
// técnicos, el endpoint no.
router.get("/api/vin/ficha/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").replace(/\s+/g, "").trim().toUpperCase();
    if (!VIN_RE.test(vin)) {
      return res.status(400).json({ ok: false, error: "VIN inválido." });
    }

    const { SRV_CACHE_PESADO_MS } = await getConfig_();
    const payload = await cachedByTopics_(
      `invitado:ficha:${vin}`, ["work_orders", "vins", "asignaciones", "zonas", "movilizador"],
      // lista_diaria_activa la escribe Apps Script cada 10 min y no emite
      // ningún topic, así que aquí manda el TTL. No pasa nada: una lista que
      // se vea un ciclo tarde no cambia ninguna decisión de taller.
      SRV_CACHE_PESADO_MS, async () => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const headers = supabaseHeaders_();
        const q = encodeURIComponent(vin);

        const [base, fichaResp, otsResp, zonaResp, movResp, listaResp] = await Promise.all([
          consultarVins_([vin]),
          fetch(`${SUPABASE_URL}/rest/v1/vins?vin=eq.${q}&select=*`, { headers }),
          // El embed trae las asignaciones y el nombre del técnico de una vez.
          // Aquí sí compensa: es UN VIN pedido a mano, no una lista que se
          // repinta sola, así que el peso del embed no se multiplica.
          fetch(`${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${q}` +
            `&select=id,tipo_ot,numero_ot,estado_general,fecha_creacion,observaciones,` +
            `asignaciones(rol_trabajo,estado_actual,tiempo_trab_ms,updated_at,activo,usuarios(nombre))` +
            `&order=fecha_creacion.desc`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/conversion_zonas?vin=eq.${q}` +
            `&select=zona_id,registrado_por,registrado_at`, { headers }),
          fetch(`${SUPABASE_URL}/rest/v1/movilizador_traslados?vin=eq.${q}&select=*`, { headers }),
          // ¿Está planificado para hoy? Es la pregunta que decide si el carro
          // se puede empezar: los que no están en lista diaria no tienen
          // equipos asignados todavía y hay que esperar a que almacén los
          // traiga. Sin este dato, la ficha decía "FALTA GLP" de un carro que
          // nadie podía tocar, y se empezaba igual.
          fetch(`${SUPABASE_URL}/rest/v1/lista_diaria_activa?vin=eq.${q}&select=vin`, { headers }),
        ]);

        if (!fichaResp.ok || !otsResp.ok) {
          throw new Error(`Supabase respondió ${fichaResp.status}/${otsResp.status}`);
        }
        const fichaRows = await fichaResp.json();
        const otsRows   = await otsResp.json();
        // Zona y traslado son adorno: si fallan, la ficha sale sin ellos en
        // vez de no salir. El veredicto no depende de ninguno de los dos.
        const zonaRows = zonaResp.ok ? await zonaResp.json().catch(() => []) : [];
        const movRows  = movResp.ok  ? await movResp.json().catch(() => [])  : [];
        // Si esta consulta falla no se inventa un "no planificado": eso frena
        // un carro que sí se podía trabajar. Se devuelve null y la página no
        // enseña el chip, que es lo que había antes de todo esto.
        const listaRows = listaResp.ok ? await listaResp.json().catch(() => null) : null;

        const f = (fichaRows || [])[0] || null;
        const z = (zonaRows  || [])[0] || null;
        const m = (movRows   || [])[0] || null;

        const ots = (otsRows || []).map(wo => ({
          tipo:    wo.tipo_ot,
          numero:  isValidOT_(wo.numero_ot) ? wo.numero_ot : "",
          estado:  wo.estado_general,
          fecha:   wo.fecha_creacion,
          nota:    wo.observaciones || "",
          trabajos: (wo.asignaciones || [])
            // Las anuladas se quedan: para supervisión, que alguien empezara
            // un carro y se le quitara es justo lo que quiere ver. Van
            // marcadas para que no se confundan con las vigentes.
            .map(a => ({
              rol:        a.rol_trabajo,
              estado:     a.estado_actual,
              tiempo_ms:  a.tiempo_trab_ms || 0,
              actualizado: a.updated_at,
              usuario:    a.usuarios?.nombre || "—",
              anulada:    a.activo === false,
            }))
            .sort((a, b) => new Date(a.actualizado || 0) - new Date(b.actualizado || 0)),
        }));

        return {
          ok: true,
          ...base[0],
          ficha: f ? {
            modelo:   f.modelo   || "",
            cliente:  f.cliente  || "",
            tanque:   f.tanque_asignado   || "",
            reductor: f.reductor_asignado || "",
            ubicacion: f.ultima_ubicacion || "",
            estado:   f.estado || "",
          } : null,
          lista_diaria: Array.isArray(listaRows) ? listaRows.length > 0 : null,
          // zona_id 16 es "zona libre" (desborde), no una plaza del taller.
          zona: z && z.zona_id ? {
            id: z.zona_id,
            nombre: z.zona_id === 16 ? "Zona Libre" : `Zona ${z.zona_id}`,
            por: z.registrado_por || "",
            desde: z.registrado_at || null,
          } : null,
          movilizador: m ? {
            estado:     m.estado || "",
            ingreso_at: m.trasladado_at || null,
            ingreso_por: m.trasladado_por || "",
            salida_at:  m.entregado_at || null,
            salida_por: m.entregado_por || "",
          } : null,
          ots,
        };
      });

    return res.json(payload);
  } catch (e) {
    console.error("[VIN_FICHA]", e.message);
    return res.status(500).json({ ok: false, error: "No se pudo consultar. Intente de nuevo." });
  }
});

export default router;
