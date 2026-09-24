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

function excedeLimite_(ip) {
  const ahora = Date.now();
  const previas = (_hits.get(ip) || []).filter(t => ahora - t < RL_VENTANA_MS);
  previas.push(ahora);
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

    const { SRV_CACHE_PESADO_MS } = await getConfig_();

    // Cache por VIN. Los topics son los que mueven un veredicto: una OT que
    // cambia de estado ("work_orders") o el padrón que se resincroniza
    // ("vins"). Lo que llega desde Apps Script no emite evento, y para eso
    // está el TTL. Un carro recién terminado puede tardar un ciclo en verse
    // como LISTO; lo que nunca pasa es lo contrario — que uno sin GLP salga
    // como listo — porque para eso su OT tendría que cerrarse, y eso sí
    // invalida al instante.
    const payload = await cachedByTopics_(
      `invitado:vin:${vin}`, ["work_orders", "vins"], SRV_CACHE_PESADO_MS, async () => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const headers = supabaseHeaders_();

        const [vinResp, woResp] = await Promise.all([
          // `select=*` y no `select=vin,estado` a propósito: hasta que no se
          // corra supabase/invitado.sql la columna `estado` no existe, y
          // pedirla por nombre hace que PostgREST rechace la consulta entera.
          // Eso devolvía "no figura en el padrón" para carros que sí están —
          // el peor error posible aquí, porque suena a "puede salir".
          // Es una sola fila; las columnas de más no se mandan al cliente.
          fetch(`${SUPABASE_URL}/rest/v1/vins?vin=eq.${encodeURIComponent(vin)}&select=*`,
            { method: "GET", headers }),
          // Sin filtro de fecha: un carro puede llevar meses parado y su OT
          // seguir siendo la que manda. Son pocas filas por VIN.
          fetch(`${SUPABASE_URL}/rest/v1/work_orders?vin=eq.${encodeURIComponent(vin)}` +
            `&tipo_ot=in.(CONVERSION,CALIDAD)&select=tipo_ot,estado_general,fecha_creacion` +
            `&order=fecha_creacion.desc`,
            { method: "GET", headers }),
        ]);

        // Una consulta que falla NO se degrada a veredicto: sin el padrón no
        // se sabe si el carro lleva GLP, y responder "no figura" sonaría a
        // "puede salir". Se prefiere el error, que la página muestra como
        // "no se pudo consultar" y obliga a preguntar al área de GLP.
        if (!vinResp.ok || !woResp.ok) {
          throw new Error(`Supabase respondió ${vinResp.status}/${woResp.status}`);
        }
        const vinRows = await vinResp.json();
        const woRows  = await woResp.json();

        const fila = (vinRows || [])[0] || null;
        // Mientras la migración no corra, `estado` simplemente no viene y el
        // veredicto sale de las OTs: la página sirve desde el primer día,
        // solo sin distinguir ANULADO/DELEGADO.
        const enPadron = !!fila;
        const estadoPadron = fila?.estado || "";

        // La más reciente de cada tipo manda: un carro re-trabajado tiene OTs
        // viejas que ya no dicen nada de dónde está ahora.
        let conv = null, cal = null;
        for (const wo of (woRows || [])) {
          if (wo.tipo_ot === "CONVERSION" && conv === null) conv = wo.estado_general || "";
          if (wo.tipo_ot === "CALIDAD"    && cal  === null) cal  = wo.estado_general || "";
        }

        const clave = decidirVeredicto_(enPadron, estadoPadron, conv, cal);
        const v = VEREDICTOS[clave];

        return {
          ok: true,
          vin,
          veredicto: clave,
          tono: v.tono,
          titulo: v.titulo,
          detalle: v.detalle,
          etapas: {
            conversion: etiquetaEtapa_(conv),
            calidad:    etiquetaEtapa_(cal),
          },
        };
      });

    return res.json(payload);
  } catch (e) {
    console.error("[INVITADO_VIN]", e.message);
    return res.status(500).json({ ok: false, error: "No se pudo consultar. Intente de nuevo." });
  }
});

export default router;
