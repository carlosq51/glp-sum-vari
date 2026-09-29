// =========================
// public/js/core/domain-meta.js
// VOCABULARIO VISUAL ÚNICO del dominio: roles y estados de trabajo.
//
// Regla: ninguna vista define sus propios colores/iconos/labels de rol
// o estado. Todas importan de aquí, y los colores son SIEMPRE tokens
// (var(--…)) del tema activo — nunca hex sueltos. Así day/night funciona
// en todas las vistas sin re-render y el taller habla un solo idioma:
// Motor es SIEMPRE el mismo azul, Tanque el mismo naranja, en el mapa,
// el live, los reportes y los badges.
// =========================

// ── Roles / especialidades (tracks del taller, tokens en 00-token.css) ──
export const ROL_META = {
  MOTOR:    { label: "Motor",    icon: "🔧", color: "var(--track-motor)" },
  TANQUE:   { label: "Tanque",   icon: "⛽", color: "var(--track-tanque)" },
  CALIDAD:  { label: "Calidad",  icon: "✅", color: "var(--track-calidad)" },
  RAMALERO: { label: "Ramal",    icon: "🔗", color: "var(--track-ramal)" },
};

/** Meta de un rol con fallback seguro para roles desconocidos. */
export function rolMeta(rol) {
  return ROL_META[String(rol || "").toUpperCase()]
    || { label: rol || "—", icon: "👤", color: "var(--muted)" };
}

// ── Oficios: cómo se agrupa la producción del día ────────────────────────────
//
// Las tres unidades NO son comparables. Una fila de conversión es media carro
// (el motor, o el tanque); una de calidad es una inspección; una de ramales es
// un ramal armado. Mezcladas en una sola lista ordenada por total, el ramalero
// que armó 8 sale por encima del motorista que cerró 3 y parece que produjo
// más — cuando no están midiendo lo mismo.
//
// El orden es el de la conversación del taller: primero los carros, después
// quien los aprueba, después quien surte la línea.
export const GRUPOS_OFICIO = [
  { id: "CONVERSION", label: "Conversión", icon: "🔧", unidad: "mitades de carro", roles: ["MOTOR", "TANQUE"] },
  { id: "CALIDAD",    label: "Calidad",    icon: "✅", unidad: "inspecciones",     roles: ["CALIDAD"] },
  { id: "RAMALES",    label: "Ramales",    icon: "🔗", unidad: "ramales armados",  roles: ["RAMALERO"] },
];

/** A qué oficio pertenece un rol de trabajo. null si no encaja en ninguno. */
export function grupoDeRol_(rol) {
  const r = String(rol || "").toUpperCase();
  return GRUPOS_OFICIO.find(g => g.roles.includes(r)) || null;
}

// ── Estados de asignación ──
// color  = tinta principal (texto/dot)   bg = fondo suave del badge
export const ESTADO_META = {
  TRABAJANDO:    { label: "TRABAJANDO",    badge: "badge-trabajando",    color: "var(--ok)",     bg: "var(--okBg)",     live: true  },
  PAUSADO:       { label: "PAUSADO",       badge: "badge-pausado",       color: "var(--warn)",   bg: "var(--warnBg)",   live: false },
  SIN_INICIAR:   { label: "SIN INICIAR",   badge: "badge-sin-iniciar",   color: "var(--muted)",  bg: "var(--pillBg)",   live: false },
  FINALIZADO:    { label: "FINALIZADO",    badge: "badge-finalizado",    color: "var(--note)",   bg: "var(--noteBg)",   live: false },
  SIN_ACTIVIDAD: { label: "SIN ACTIVIDAD", badge: "badge-sin-actividad", color: "var(--muted)",  bg: "var(--pillBg)",   live: false },
  DESCONECTADO:  { label: "DESCON.",       badge: "badge-desconectado",  color: "var(--muted)",  bg: "var(--pillBg)",   live: false },
};

/** Meta de un estado con fallback seguro. */
export function estadoMeta(estado) {
  return ESTADO_META[String(estado || "").toUpperCase()]
    || { label: estado || "—", badge: "", color: "var(--muted)", bg: "var(--pillBg)", live: false };
}

// ── Semáforo de progreso (0..1 → token de color de data-viz) ──
// Un solo criterio para gauges, barras y números en toda la app.
export function progressTone(fraction) {
  const f = Number(fraction) || 0;
  if (f >= 1)   return "var(--dv-good)";
  if (f >= 0.7) return "var(--dv-warn)";
  return "var(--accent)";
}
