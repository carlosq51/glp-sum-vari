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
// Las dos usan la service key. supabaseHeaders_ mandaba la anon key, y casi
// todas las rutas la usan: el día que la base le cerró la puerta a la anon
// key (supabase/migrations/001_cerrar-acceso-anon.sql), eso habría tumbado
// el servidor entero. Se conservan los dos nombres para no tocar 30 archivos.
export function supabaseHeaders_() {
  return supabaseServiceHeaders_();
}

export function supabaseServiceHeaders_() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!process.env.SUPABASE_URL || !key) return null;
  return {
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Content-Type":  "application/json",
  };
}

// ─── Lectura paginada ─────────────────────────────────────────────────────────
/**
 * supabaseFetchAll_ — GET a PostgREST trayendo TODAS las filas.
 *
 * PostgREST recorta silenciosamente en db-max-rows (1000 en Supabase hosted):
 * un `fetch` normal devuelve 200 OK con 1000 filas y nada indica que faltan más.
 * Aquí se pide de a páginas con el header Range hasta agotar el resultado.
 *
 * Devuelve { ok, status, rows, error, truncated }.
 * `truncated` avisa si se llegó al tope duro maxRows (no es un error, pero el
 * resultado está incompleto y el caller debería saberlo).
 */
export async function supabaseFetchAll_(url, headers, { pageSize, maxRows } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const hasta = Math.min(offset + pageSize, maxRows) - 1;
    const res = await fetch(url, {
      method: "GET",
      headers: { ...headers, "Range-Unit": "items", "Range": `${offset}-${hasta}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, rows, error: text.slice(0, 300), truncated: false };
    }
    const page = await res.json().catch(() => []);
    rows.push(...(page || []));
    if (!page || page.length < (hasta - offset + 1)) {
      return { ok: true, status: res.status, rows, error: "", truncated: false };
    }
  }
  return { ok: true, status: 206, rows, error: "", truncated: true };
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
