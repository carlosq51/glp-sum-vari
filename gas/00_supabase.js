function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    url: String(props.getProperty("SUPABASE_URL") || "").replace(/\/+$/, ""),
    key: String(props.getProperty("SUPABASE_KEY") || "").trim(),
  };
}

function supabaseEnabled_() {
  const cfg = getSupabaseConfig_();
  return !!(cfg.url && cfg.key);
}

function supabaseHeaders_(prefer) {
  const cfg = getSupabaseConfig_();
  return {
    apikey: cfg.key,
    Authorization: "Bearer " + cfg.key,
    "Content-Type": "application/json",
    Prefer: prefer || "return=representation",
  };
}

function supabaseQueryString_(query) {
  const parts = [];
  Object.keys(query || {}).forEach(function(key) {
    const value = query[key];
    if (value === null || value === undefined || value === "") return;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  });
  return parts.length ? ("?" + parts.join("&")) : "";
}

function supabaseRequest_(method, path, opts) {
  if (!supabaseEnabled_()) throw new Error("Supabase no configurado.");

  const cfg = getSupabaseConfig_();
  const url = cfg.url + "/rest/v1/" + String(path || "").replace(/^\/+/, "") + supabaseQueryString_(opts?.query);
  const resp = UrlFetchApp.fetch(url, {
    method: method,
    contentType: "application/json",
    headers: supabaseHeaders_(opts?.prefer),
    payload: opts && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  const text = resp.getContentText() || "";
  if (code < 200 || code >= 300) {
    throw new Error("Supabase " + method + " " + path + " => " + code + " " + text);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Respuesta JSON inválida de Supabase en " + path + ": " + err.message);
  }
}

function supabaseSelect_(table, query) {
  return supabaseRequest_("GET", table, { query: query || {}, prefer: "return=representation" }) || [];
}

function supabaseInsertRows_(table, rows, prefer) {
  if (!rows || !rows.length) return [];
  return supabaseRequest_("POST", table, {
    body: rows,
    prefer: prefer || "return=representation",
  }) || [];
}

function supabaseInsertOne_(table, row, prefer) {
  const out = supabaseInsertRows_(table, [row], prefer);
  return out[0] || null;
}

function supabasePatch_(table, query, patch, prefer) {
  return supabaseRequest_("PATCH", table, {
    query: query || {},
    body: patch || {},
    prefer: prefer || "return=representation",
  }) || [];
}

function supabaseUpsertRows_(table, rows, onConflict) {
  if (!rows || !rows.length) return [];
  const query = onConflict ? { on_conflict: onConflict } : {};
  return supabaseRequest_("POST", table, {
    query: query,
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  }) || [];
}

function supabaseRpcNotAvailable_() {
  return false;
}
