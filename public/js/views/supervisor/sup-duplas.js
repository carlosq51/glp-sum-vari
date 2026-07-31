// =========================
// public/js/views/supervisor/sup-duplas.js
// Cierre por duplas: identifica a los técnicos de conversión que ya cerraron
// su meta de carros COMPLETOS del día y sugiere juntarlos de a dos para
// avanzar un carro entero más hasta la salida.
//
// Regla del negocio: medio carro no es medible. Un técnico que llegó a la meta
// (2 carros) queda "libre"; dos libres del mismo rol se emparejan y sacan
// 1 carro entero juntos → 0.5 para cada uno (ej. 2 + 2 + 1 = 5, 2.5 c/u).
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

/**
 * clasificarDuplas_ — modelo del panel a partir de los techs del LIVE.
 *
 * Por cada rol de conversión:
 *   libres   → llegaron a la meta y NO tienen trabajo en curso ⇒ emparejables
 *   enExtra  → llegaron a la meta pero siguen con un trabajo abierto (carro extra)
 *   cerca    → les falta 1 carro para la meta
 *   duplas   → pares armados sobre `libres` (ordenados por carros desc)
 *   sinPareja→ el impar que quedó esperando compañero
 */
export function clasificarDuplas_(techs, meta = 2) {
  const lista = Array.isArray(techs) ? techs : [];
  const porRol = [];
  let totalMeta = 0, totalLibres = 0, totalDuplas = 0;

  for (const rol of ROLES_DUPLA) {
    const delRol = lista.filter(t =>
      String(t.rol || "").toUpperCase() === rol && t.estadoActivo !== "DESCONECTADO"
    );

    const libres = [], enExtra = [], cerca = [];
    for (const t of delRol) {
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

    totalMeta   += libres.length + enExtra.length;
    totalLibres += libres.length;
    totalDuplas += duplas.length;

    porRol.push({ rol, libres, enExtra, cerca, duplas, sinPareja });
  }

  return {
    meta,
    porRol,
    totalMeta,
    totalLibres,
    totalDuplas,
    carrosProyectados: totalDuplas, // 1 carro entero por dupla
  };
}

// ── Render ────────────────────────────────────────────────────────────
function nombreCorto_(t, maxLen = 12) {
  const first = String(t?.nombre || t?.email || "Técnico").trim().split(/\s+/)[0] || "Técnico";
  return first.length > maxLen ? first.slice(0, maxLen) : first;
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
  const { meta, porRol, totalMeta, totalDuplas, carrosProyectados } = model;
  const hayCerca = porRol.some(r => r.cerca.length > 0);
  if (!totalMeta && !hayCerca) return "";

  // Primero las duplas armadas, después los que esperan pareja
  const filas = [
    ...porRol.flatMap(r => r.duplas.map(duplaHTML_)),
    ...porRol.filter(r => r.sinPareja).map(r => esperaHTML_(r.sinPareja, r.rol)),
  ];

  // "En carro extra": ya cerraron meta y siguen trabajando (probable dupla en curso)
  const enExtra = porRol.flatMap(r => r.enExtra.map(t => ({ t, rol: r.rol })));
  const cerca   = porRol.flatMap(r => r.cerca.map(t => ({ t, rol: r.rol })));

  return `
  <div class="live-duplas" id="liveDuplas">
    <div class="live-duplas-head">
      <span class="live-duplas-title">🤝 CIERRE POR DUPLAS</span>
      <span class="live-duplas-sub">meta ${meta} carros completos / técnico</span>
      <span class="live-duplas-count" title="Duplas sugeridas y carros enteros que se pueden sumar">
        ${totalDuplas} dupla${totalDuplas !== 1 ? "s" : ""}${carrosProyectados > 0 ? ` · +${carrosProyectados} 🚗` : ""}
      </span>
    </div>

    ${filas.length
      ? `<div class="live-duplas-list">${filas.join("")}</div>`
      : `<div class="live-duplas-empty small">Nadie libre todavía para emparejar.</div>`}

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
