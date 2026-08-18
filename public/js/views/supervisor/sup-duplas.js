// =========================
// public/js/views/supervisor/sup-duplas.js
// Cierre por duplas: qué pasa con los técnicos de conversión que ya cerraron su
// meta de carros COMPLETOS del día.
//
// Hay DOS cosas distintas en este panel y conviene no confundirlas:
//
//   EN CURSO  — duplas reales, que el módulo de despacho armó solo cuando
//               alguien cerró su meta y un compañero de su rol ya estaba en su
//               carro extra. No son propuestas: están pasando ahora, el carro
//               va a nombre del que lo abrió y al cerrarlo se deshacen.
//   SUGERIDAS — el emparejamiento a ojo de siempre, para cuando el despacho
//               automático no está encendido. Nadie las ejecuta por sí solas.
//
// Y una tercera lista que existe solo para responder una pregunta que el
// supervisor se hace mirando la pantalla: "¿por qué no vuelven a juntar a
// ese?". Porque la regla es de UNA vez por jornada — quien ya hizo su dupla
// trabaja solo el resto del día, y aquí se dice con todas sus letras.
// =========================

import { escapeHtml } from "../../core/format.js";
import { rolMeta } from "../../core/domain-meta.js";

// Solo conversión: motoristas y tanqueros. Calidad/ramal no entran al modelo.
export const ROLES_DUPLA = ["MOTOR", "TANQUE"];

function carsOf_(t)   { return Number(t.carsHoy ?? t.finalizadosHoy ?? 0) || 0; }
function activosOf_(t){ return Number(t.virtualHoy ?? t.activosHoy ?? 0) || 0; }

export function fmtCarros_(n) {
  const v = Number(n) || 0;
  return v === Math.floor(v) ? String(v) : v.toFixed(1);
}

/** ¿Este técnico ya cerró su meta de carros completos? */
export function cumplioMeta_(tech, meta) {
  if (!ROLES_DUPLA.includes(String(tech?.rol || "").toUpperCase())) return false;
  if (tech?.estadoActivo === "DESCONECTADO") return false;
  return carsOf_(tech) >= meta;
}

/** Nombre para pintar, venga del tech del LIVE o solo del payload de la dupla. */
function nombreDe_(tech, fallback) {
  return String(tech?.nombre || fallback || "Técnico");
}

/**
 * Duplas automáticas vivas de un rol, una fila por dupla (no por técnico).
 *
 * Los dos miembros traen el mismo `duplaId`, así que sin deduplicar la misma
 * dupla se pintaría dos veces. Y el compañero puede no estar en `delRol` —el
 * LIVE agrupa por técnico + rol de sus asignaciones—, por eso el nombre cae al
 * que viene dentro de `duplaAuto`.
 */
function duplasEnCurso_(delRol, lista, rol) {
  const out = [];
  const vistas = new Set();

  for (const t of delRol) {
    const d = t.duplaAuto;
    if (!d || vistas.has(d.duplaId)) continue;
    vistas.add(d.duplaId);

    const otro = lista.find(x => x.userId === d.conUserId) || null;
    const [ancla, ayudante] = d.soyAncla ? [t, otro] : [otro, t];
    const nombreOtro = d.conNombre;

    out.push({
      rol,
      duplaId: d.duplaId,
      zonaId: d.zonaId ?? null,
      anclaNombre:    nombreDe_(ancla,    d.soyAncla ? null : nombreOtro),
      ayudanteNombre: nombreDe_(ayudante, d.soyAncla ? nombreOtro : null),
      carrosAncla:    ancla    ? carsOf_(ancla)    : null,
      carrosAyudante: ayudante ? carsOf_(ayudante) : null,
    });
  }
  return out;
}

/**
 * clasificarDuplas_ — modelo del panel a partir de los techs del LIVE.
 *
 * Por cada rol de conversión:
 *   enCurso  → duplas automáticas trabajando ahora (reales, no propuestas)
 *   yaPareo  → hicieron su dupla hoy y trabajan SOLOS el resto de la jornada
 *   libres   → llegaron a la meta y NO tienen trabajo en curso ⇒ emparejables
 *   enExtra  → llegaron a la meta pero siguen con un trabajo abierto (carro extra)
 *   cerca    → les falta 1 carro para la meta
 *   duplas   → pares SUGERIDOS sobre `libres` (ordenados por carros desc)
 *   sinPareja→ el impar que quedó esperando compañero
 *
 * Quien está en `enCurso` o en `yaPareo` no entra a los demás grupos: el
 * primero ya tiene con quién, y al segundo la regla no lo vuelve a emparejar.
 * Sugerirlo igual sería mandar al supervisor a pelear contra el sistema.
 */
export function clasificarDuplas_(techs, meta = 2) {
  const lista = Array.isArray(techs) ? techs : [];
  const porRol = [];
  let totalMeta = 0, totalLibres = 0, totalDuplas = 0, totalEnCurso = 0;

  for (const rol of ROLES_DUPLA) {
    const delRol = lista.filter(t =>
      String(t.rol || "").toUpperCase() === rol && t.estadoActivo !== "DESCONECTADO"
    );

    const enCurso = duplasEnCurso_(delRol, lista, rol);
    const yaPareo = delRol.filter(t => t.duplaAutoUsada && !t.duplaAuto);
    const pendientes = delRol.filter(t => !t.duplaAuto && !t.duplaAutoUsada);

    const libres = [], enExtra = [], cerca = [];
    for (const t of pendientes) {
      const cars = carsOf_(t);
      if (cars >= meta) {
        (activosOf_(t) > 0 ? enExtra : libres).push(t);
      } else if (cars >= meta - 1) {
        cerca.push(t);
      }
    }

    // Orden determinista: más carros primero, luego alfabético
    const ordenar = (a, b) =>
      (carsOf_(b) - carsOf_(a)) || String(a.nombre || "").localeCompare(String(b.nombre || ""));
    libres.sort(ordenar);
    enExtra.sort(ordenar);
    cerca.sort(ordenar);

    const duplas = [];
    for (let i = 0; i + 1 < libres.length; i += 2) {
      const a = libres[i], b = libres[i + 1];
      const base = carsOf_(a) + carsOf_(b);
      duplas.push({
        rol,
        a, b,
        carrosA: carsOf_(a),
        carrosB: carsOf_(b),
        carrosBase: base,
        proyectado: base + 1,      // el carro entero que sacan juntos
        finalA: carsOf_(a) + 0.5,
        finalB: carsOf_(b) + 0.5,
      });
    }
    const sinPareja = libres.length % 2 === 1 ? libres[libres.length - 1] : null;

    // "En meta" se cuenta sobre TODO el rol, no sobre los emparejables: el chip
    // del pulso filtra por cumplioMeta_, y si este número dejara fuera a los que
    // están en dupla, el filtro mostraría más gente de la que anuncia.
    totalMeta    += delRol.filter(t => carsOf_(t) >= meta).length;
    totalLibres  += libres.length;
    totalDuplas  += duplas.length;
    totalEnCurso += enCurso.length;

    porRol.push({ rol, enCurso, yaPareo, libres, enExtra, cerca, duplas, sinPareja });
  }

  return {
    meta,
    porRol,
    totalMeta,
    totalLibres,
    totalDuplas,
    totalEnCurso,
    // Solo las sugeridas proyectan carro: el de una dupla en curso ya está
    // abierto y contado como trabajo del taller.
    carrosProyectados: totalDuplas,
  };
}

// ── Render ────────────────────────────────────────────────────────────
function cortar_(nombre, maxLen = 12) {
  const first = String(nombre || "Técnico").trim().split(/\s+/)[0] || "Técnico";
  return first.length > maxLen ? first.slice(0, maxLen) : first;
}

function nombreCorto_(t, maxLen = 12) {
  return cortar_(t?.nombre || t?.email, maxLen);
}

function duplaHTML_(d) {
  const meta = rolMeta(d.rol);
  return `
  <div class="dupla-card" data-rol="${escapeHtml(d.rol)}" style="border-left:3px solid ${meta.color};">
    <span class="dupla-rol" style="color:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</span>
    <span class="dupla-names">
      ${escapeHtml(nombreCorto_(d.a))} <b>${fmtCarros_(d.carrosA)}</b>
      <span class="dupla-plus">+</span>
      ${escapeHtml(nombreCorto_(d.b))} <b>${fmtCarros_(d.carrosB)}</b>
    </span>
    <span class="dupla-goal">
      🚗 <b>${fmtCarros_(d.proyectado)}</b>
      <span class="dupla-split">(${fmtCarros_(d.finalA)} / ${fmtCarros_(d.finalB)} c/u)</span>
    </span>
  </div>`;
}

/**
 * Fila de una dupla que está pasando de verdad. Se distingue a propósito de las
 * sugeridas: dice la zona (ahí hay que ir a mirar) y a nombre de quién va el
 * carro, que es la primera pregunta cuando dos personas trabajan en uno solo.
 */
function enCursoHTML_(d) {
  const meta = rolMeta(d.rol);
  const cars = n => (n == null ? "" : ` <b>${fmtCarros_(n)}</b>`);
  return `
  <div class="dupla-card dupla-card--live" data-rol="${escapeHtml(d.rol)}" style="border-left:3px solid ${meta.color};">
    <span class="dupla-rol" style="color:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</span>
    <span class="dupla-names">
      ${escapeHtml(cortar_(d.anclaNombre))}${cars(d.carrosAncla)}
      <span class="dupla-plus">+</span>
      ${escapeHtml(cortar_(d.ayudanteNombre))}${cars(d.carrosAyudante)}
    </span>
    <span class="dupla-goal dupla-goal--live" title="El carro va a nombre de ${escapeHtml(d.anclaNombre)}; al cerrarlo cada uno sigue solo">
      ${d.zonaId != null ? `🅿️ zona <b>${escapeHtml(String(d.zonaId))}</b> · ` : ""}EN CURSO
    </span>
  </div>`;
}

function esperaHTML_(t, rol) {
  const meta = rolMeta(rol);
  return `
  <div class="dupla-card dupla-card--wait" data-rol="${escapeHtml(rol)}" style="border-left:3px solid ${meta.color};">
    <span class="dupla-rol" style="color:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</span>
    <span class="dupla-names">⏳ ${escapeHtml(nombreCorto_(t))} <b>${fmtCarros_(carsOf_(t))}</b></span>
    <span class="dupla-goal dupla-goal--wait">esperando pareja</span>
  </div>`;
}

/**
 * renderDuplasPanel_ — HTML del panel. Devuelve "" si no hay nada que mostrar
 * (nadie llegó a la meta ni está cerca).
 */
export function renderDuplasPanel_(model) {
  if (!model) return "";
  const { meta, porRol, totalMeta, totalDuplas, totalEnCurso = 0, carrosProyectados } = model;
  const hayCerca = porRol.some(r => r.cerca.length > 0);
  if (!totalMeta && !hayCerca) return "";

  // Primero lo que está pasando, después lo que se sugiere, al final el impar.
  const filas = [
    ...porRol.flatMap(r => r.enCurso.map(enCursoHTML_)),
    ...porRol.flatMap(r => r.duplas.map(duplaHTML_)),
    ...porRol.filter(r => r.sinPareja).map(r => esperaHTML_(r.sinPareja, r.rol)),
  ];

  // "En carro extra": ya cerraron meta y siguen trabajando (probable dupla en curso)
  const enExtra = porRol.flatMap(r => r.enExtra.map(t => ({ t, rol: r.rol })));
  const cerca   = porRol.flatMap(r => r.cerca.map(t => ({ t, rol: r.rol })));
  const yaPareo = porRol.flatMap(r => r.yaPareo.map(t => ({ t, rol: r.rol })));

  const cuenta = [
    totalEnCurso > 0 ? `${totalEnCurso} en curso` : "",
    totalDuplas  > 0 ? `${totalDuplas} sugerida${totalDuplas !== 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(" · ");

  return `
  <div class="live-duplas" id="liveDuplas">
    <div class="live-duplas-head">
      <span class="live-duplas-title">🤝 CIERRE POR DUPLAS</span>
      <span class="live-duplas-sub">meta ${meta} carros completos / técnico</span>
      <span class="live-duplas-count" title="Duplas trabajando ahora y pares que se podrían armar">
        ${cuenta || "sin duplas"}${carrosProyectados > 0 ? ` · +${carrosProyectados} 🚗` : ""}
      </span>
    </div>

    ${filas.length
      ? `<div class="live-duplas-list">${filas.join("")}</div>`
      : `<div class="live-duplas-empty small">Nadie libre todavía para emparejar.</div>`}

    ${yaPareo.length ? `
    <div class="live-duplas-foot small">
      <span class="live-duplas-foot-label" title="La dupla del carro extra es de una vez por jornada: ya la hicieron y siguen solos">
        ✅ Ya hicieron su dupla (trabajan solos):</span>
      ${yaPareo.map(({ t, rol }) =>
        `<span class="dupla-chip dupla-chip--done" title="${escapeHtml(rolMeta(rol).label)} — no se vuelve a emparejar hoy">${escapeHtml(nombreCorto_(t))} ${fmtCarros_(carsOf_(t))}</span>`
      ).join("")}
    </div>` : ""}

    ${enExtra.length ? `
    <div class="live-duplas-foot small">
      <span class="live-duplas-foot-label">⚙️ En carro extra:</span>
      ${enExtra.map(({ t, rol }) =>
        `<span class="dupla-chip" title="${escapeHtml(rolMeta(rol).label)} — ya cerró su meta y sigue trabajando">${escapeHtml(nombreCorto_(t))} ${fmtCarros_(carsOf_(t))}</span>`
      ).join("")}
    </div>` : ""}

    ${cerca.length ? `
    <div class="live-duplas-foot small">
      <span class="live-duplas-foot-label">⏱ A 1 carro de la meta:</span>
      ${cerca.map(({ t, rol }) =>
        `<span class="dupla-chip dupla-chip--near" title="${escapeHtml(rolMeta(rol).label)}">${escapeHtml(nombreCorto_(t))} ${fmtCarros_(carsOf_(t))}/${meta}</span>`
      ).join("")}
    </div>` : ""}
  </div>`;
}
