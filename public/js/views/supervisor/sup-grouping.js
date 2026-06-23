// =========================
// public/js/views/supervisor/sup-grouping.js
// GROUPING: agrupar conversion por VIN (MOTOR + TANQUE)
// =========================

export function isConvRole_(r) {
  const x = String(r || "").toUpperCase();
  return x === "MOTOR" || x === "TANQUE" || x === "TANQUERO";
}

export function groupByVinForUI_(rows) {
  const map = new Map();

  for (const it of rows) {
    const rol = String(it.rol || it.rolTrabajo || "").toUpperCase();

    if (!isConvRole_(rol)) {
      const k = `RAW|${Math.random()}`;
      map.set(k, { _kind:"raw", it });
      continue;
    }

    const vin = String(it.vin || "").trim().toUpperCase();
    if (!vin) {
      const k = `NOVIN|${(it.workId||"")}|${rol}|${Math.random()}`;
      map.set(k, { _kind:"raw", it });
      continue;
    }

    const g = map.get(vin) || {
      _kind: "group",
      vin,
      estado: "SIN_DATO",
      motor: null,
      tanque: null,
      sortTs: 0,
    };

    if (rol === "MOTOR") g.motor = it;
    else g.tanque = it;

    const estM = String(g.motor?.estado || "").toUpperCase();
    const estT = String(g.tanque?.estado || "").toUpperCase();
    const ests = [estM, estT].filter(Boolean);

    const motorFin  = estM === "FINALIZADO" || estM === "FIN" || estM === "COMPLETADO";
    const tanqueFin = estT === "FINALIZADO" || estT === "FIN" || estT === "COMPLETADO";

    // FINALIZADO solo cuando los DOS roles están terminados
    if (g.motor && g.tanque && motorFin && tanqueFin) {
      g.estado = "FINALIZADO";
    } else if (motorFin || tanqueFin) {
      g.estado = "EN_PROCESO";
    } else if (ests.includes("TRABAJANDO")) {
      g.estado = "TRABAJANDO";
    } else if (ests.includes("PAUSADO")) {
      g.estado = "PAUSADO";
    } else {
      g.estado = ests[0] || "SIN_DATO";
    }

    const t1 = Date.parse(String(it.updated_at || "")) || 0;
    const t2 = Date.parse(String(it.fecha_asignacion || it.fecha_inicio || "")) || 0;
    g.sortTs = Math.max(g.sortTs, t1, t2);

    map.set(vin, g);
  }

  const out = Array.from(map.values());
  out.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));
  return out;
}