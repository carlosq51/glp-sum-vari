import {
  CORE,
  getRolTecnico_,
  vinCacheGet_,
  vinCacheSet_,
  ramalCacheGet_,
  ramalCacheSet_,
} from "../core/core.js";

/**
 * zonaDe_ — plaza donde está aparcado el carro.
 *
 * Devuelve tres cosas distintas a propósito:
 *   número     → está en esa plaza
 *   null       → el servidor dice que no tiene plaza asignada
 *   undefined  → este payload no habla de zonas
 *
 * La diferencia entre los dos últimos importa. La zona solo viaja en
 * /api/mis-activas; la respuesta de un evento (iniciar, pausar, finalizar) trae
 * la OT sin ese campo. Si ahí devolviéramos null, la plaza desaparecería de la
 * tarjeta en cuanto el técnico tocara cualquier botón, y volvería sola en el
 * siguiente refresco: un parpadeo sin explicación. Con `undefined`,
 * mergePrevAndCache_ sabe que debe conservar la que ya tenía.
 *
 * No se pasa por `pickFirst_` porque ese devuelve "" cuando no encuentra nada,
 * y `Number("")` es 0 — la tarjeta acabaría anunciando una "ZONA 0" que no
 * existe en el taller.
 */
function zonaDe_(raw) {
  if (!raw || !("zona" in raw || "zona_id" in raw || "zonaId" in raw)) return undefined;

  const v = raw.zona ?? raw.zona_id ?? raw.zonaId;
  if (v === undefined || v === null || v === "") return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeItem_(raw) {
  const pickFirst_ = (...xs) => {
    for (const x of xs) {
      if (x !== undefined && x !== null && String(x).trim() !== "") return x;
    }
    return "";
  };

  const it = {
    conversionId: String(pickFirst_(raw?.conversionId, raw?.conversion_id, raw?.work_order_id, raw?.CONVERSION_ID, raw?.ID, raw?.id)).trim(),
    vin: String(pickFirst_(raw?.vin, raw?.VIN)).trim().toUpperCase(),
    tipoRamal: String(pickFirst_(raw?.tipoRamal, raw?.tipo_ramal, raw?.tipo, raw?.TIPO_RAMAL, raw?.TIPO)).trim(),
    created_at: raw?.fecha_asignacion ?? raw?.FECHA_ASIGNACION ?? raw?.fecha_inicio ?? raw?.inicio_at ?? raw?.FECHA_INICIO ??
               raw?.created_at ?? raw?.fecha_creacion ?? raw?.FECHA_CREACION ?? null,

    rolTrabajo: String(pickFirst_(raw?.rolTrabajo, raw?.rol_trabajo, raw?.rol, raw?.ROL_TRABAJO, raw?.ROL)).trim().toUpperCase(),
    estado: String(pickFirst_(raw?.estado, raw?.estado_actual, raw?.estadoActual, raw?.ESTADO_ACTUAL, raw?.ESTADO)).trim().toUpperCase(),

    tiempo_ms: Number(pickFirst_(raw?.tiempo_ms, raw?.tiempoMs, raw?.tiempo_trab_ms, raw?.TIEMPO_TRAB_MS, raw?.TIEMPO_MS, 0)) || 0,
    running_since: raw?.running_since ?? raw?.RUNNING_SINCE ?? null,

    last_nota: String(pickFirst_(raw?.last_nota, raw?.LAST_NOTA, "")),
    last_nota_ts: raw?.last_nota_ts ?? raw?.LAST_NOTA_TS ?? null,
    updated_at: raw?.updated_at ?? raw?.UPDATED_AT ?? null,

    tanque_asignado: String(pickFirst_(raw?.tanque_asignado, raw?.tanqueAsignado, raw?.TANQUE_ASIGNADO, "")).trim(),
    reductor_asignado: String(pickFirst_(raw?.reductor_asignado, raw?.reductorAsignado, raw?.REDUCTOR_ASIGNADO, "")).trim(),

    tanque_registrado: String(pickFirst_(raw?.tanque_registrado, raw?.tanqueRegistrado, raw?.TANQUE_REGISTRADO, "")).trim(),
    reductor_registrado: String(pickFirst_(raw?.reductor_registrado, raw?.reductorRegistrado, raw?.REDUCTOR_REGISTRADO, "")).trim(),

    inc_leve: Number(pickFirst_(raw?.inc_leve, raw?.INC_LEVE, 0)) || 0,
    inc_moderada: Number(pickFirst_(raw?.inc_moderada, raw?.INC_MODERADA, 0)) || 0,
    inc_critica: Number(pickFirst_(raw?.inc_critica, raw?.INC_CRITICA, 0)) || 0,
    zona: zonaDe_(raw),
    // OT de CALIDAD registrada por el OTRO inspector: se puede accionar, pero
    // el crédito es de quien la abrió y la tarjeta lo tiene que decir.
    ajena: raw?.ajena === true,
    titularNombre: String(pickFirst_(raw?.titularNombre, raw?.titular_nombre, "")).trim(),
    motorNombre: String(pickFirst_(raw?.motorNombre, raw?.motor_nombre, raw?.MOTOR_NOMBRE, "")).trim(),
    tanqueroNombre: String(pickFirst_(raw?.tanqueroNombre, raw?.tanquero_nombre, raw?.TANQUERO_NOMBRE, "")).trim(),
  };

  if (!it.rolTrabajo) {
    if (it.tipoRamal) it.rolTrabajo = "RAMALERO";
    else if (CORE.state.currentModule === "CALIDAD") it.rolTrabajo = "CALIDAD";
    else it.rolTrabajo = String(getRolTecnico_() || "MOTOR").toUpperCase();
  }
  if (!it.estado) it.estado = "SIN_INICIAR";

  if (it.conversionId && it.rolTrabajo && it.vin) vinCacheSet_(it.conversionId, it.rolTrabajo, it.vin);
  if (it.conversionId && it.rolTrabajo === "RAMALERO" && it.tipoRamal) ramalCacheSet_(it.conversionId, it.tipoRamal);

  return it;
}
