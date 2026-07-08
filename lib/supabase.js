// ─── Cache en memoria ────────────────────────────────────────────────────────
export const CACHE = {
  work_orders:   { data: [], ts: 0 },
  usuarios:      { data: [], ts: 0 },
  asignaciones:  { data: [], ts: 0 },
  usersByEmail:  {},
  TTL_MS:             2  * 60 * 1000,
  TTL_USERS_EMAIL:    30 * 60 * 1000,
};

export function getCachedData_(table) {
  const cache = CACHE[table];
  if (!cache) return null;
  const age = Date.now() - cache.ts;
  if (age < CACHE.TTL_MS && cache.data.length > 0) {
    console.log(`[CACHE HIT] ${table} (${age}ms old)`);
    return cache.data;
  }
  return null;
}

export function setCachedData_(table, data) {
  if (CACHE[table]) {
    CACHE[table].data = data;
    CACHE[table].ts = Date.now();
    console.log(`[CACHE SET] ${table} (${data.length} items)`);
  }
}

export function getCachedUserIdByEmail_(email) {
  const entry = CACHE.usersByEmail[email];
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  if (age < CACHE.TTL_USERS_EMAIL) {
    console.log(`[CACHE HIT] user_id para email (${age}ms old)`);
    return entry.userId;
  }
  delete CACHE.usersByEmail[email];
  return null;
}

export function setCachedUserIdByEmail_(email, userId) {
  CACHE.usersByEmail[email] = { userId, ts: Date.now() };
  console.log(`[CACHE SET] user_id para ${email}`);
}

// ─── Headers ─────────────────────────────────────────────────────────────────
export function supabaseHeaders_() {
  const SUPABASE_URL     = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return {
    "apikey":        SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type":  "application/json",
  };
}

export function supabaseServiceHeaders_() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return supabaseHeaders_();
  return {
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Content-Type":  "application/json",
  };
}

// ─── Query builder ────────────────────────────────────────────────────────────
export function buildSupabaseQuery_(filter = {}) {
  const parts = [];
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    parts.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(String(value))}`);
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────
export async function supabaseGet_(table, filter = {}, opts = {}) {
  if (Object.keys(filter).length === 0 && opts.useCache !== false) {
    const cached = getCachedData_(table);
    if (cached) return cached;
  }
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}${buildSupabaseQuery_(filter)}`;
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase GET ${table}: ${res.status} ${text.slice(0, 200)}`);
  }
  const result = await res.json();
  if (Object.keys(filter).length === 0) setCachedData_(table, result);
  return result;
}

export async function supabasePost_(table, data) {
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { ...headers, "Prefer": "return=representation" },
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase POST ${table}: ${res.status} ${text.slice(0, 200)}`);
  }
  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

export async function supabasePatch_(table, filter = {}, data) {
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}${buildSupabaseQuery_(filter)}`;
  const res = await fetch(url, {
    method:  "PATCH",
    headers: { ...headers, "Prefer": "return=representation" },
    body:    JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase PATCH ${table}: ${res.status} ${text.slice(0, 200)}`);
  }
  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

export async function supabaseDelete_(table, filter = {}) {
  const headers = supabaseHeaders_();
  if (!headers) throw new Error("Supabase no configurado (.env)");
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}${buildSupabaseQuery_(filter)}`;
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase DELETE ${table}: ${res.status} ${text.slice(0, 200)}`);
  }
}
