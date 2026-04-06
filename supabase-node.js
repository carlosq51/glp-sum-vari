// =========================
// Supabase integration module para Node.js
// Exporta funciones para leer/escribir en Supabase desde backend
// =========================

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";

function supabaseEnabled() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function buildQuery(filter = {}) {
  const parts = [];
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    parts.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(String(value))}`);
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

async function supabaseGet(table, filter = {}) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_URL}/rest/v1/${table}${buildQuery(filter)}`;
  
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

async function supabasePost(table, data) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  
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

async function supabasePatch(table, filter = {}, data) {
  if (!supabaseEnabled()) throw new Error("Supabase no configurado");

  const url = `${SUPABASE_URL}/rest/v1/${table}${buildQuery(filter)}`;
  
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

module.exports = {
  supabaseEnabled,
  supabaseGet,
  supabasePost,
  supabasePatch,
};
