// =========================
// public/js/core/supabase-client.js
// Cliente Supabase para lectura/escritura
// Migración paralela: AppScript + Supabase
// =========================

export const SUPABASE_CONFIG = {
  URL: import.meta.env.VITE_SUPABASE_URL || "",
  ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
};

/**
 * Chequea si Supabase está configurado
 */
export function supabaseEnabled() {
  return !!(SUPABASE_CONFIG.URL && SUPABASE_CONFIG.ANON_KEY);
}

/**
 * Headers estándar para Supabase
 */
function supabaseHeaders() {
  return {
    "apikey": SUPABASE_CONFIG.ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
}

/**
 * Construye query string para Supabase REST API
 */
function buildQuery(filter = {}) {
  const parts = [];
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    parts.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(String(value))}`);
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

/**
 * GET desde Supabase
 */
export async function supabaseGet(table, filter = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${buildQuery(filter)}`;
  
  const res = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET ${table}: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * POST a Supabase (insertar)
 */
export async function supabasePost(table, data) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase POST ${table}: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * PATCH a Supabase (actualizar)
 */
export async function supabasePatch(table, filter = {}, data) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${buildQuery(filter)}`;
  
  const res = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase PATCH ${table}: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * DELETE a Supabase
 */
export async function supabaseDelete(table, filter = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}${buildQuery(filter)}`;
  
  const res = await fetch(url, {
    method: "DELETE",
    headers: supabaseHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase DELETE ${table}: ${res.status} ${text}`);
  }

  return { ok: true };
}

/**
 * RPC a Supabase (edge functions)
 */
export async function supabaseRPC(funcName, data = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_CONFIG.URL}/rest/v1/rpc/${funcName}`;
  
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${funcName}: ${res.status} ${text}`);
  }

  return await res.json();
}
