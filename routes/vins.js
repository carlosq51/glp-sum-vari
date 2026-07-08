import { Router } from "express";
import { supabaseHeaders_ } from "../lib/supabase.js";

const router = Router();

// =========================
// NAME SUGGEST (FAST: cache + local filter)
// =========================
let NAME_CACHE = { ts: 0, items: [] };
const NAME_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function norm_(s) {
  return String(s || "").trim().toLowerCase();
}

function hay_(u) {
  return norm_([u.name, u.email, u.label].filter(Boolean).join(" "));
}

// endpoint Node ? Supabase (vin_suggest) - BÚSQUEDA CONTAINS CON ILIKE
router.get("/api/vin-suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toUpperCase();
    const limit = Number(req.query.limit || 12);

    if (!q || q.length < 1) {
      return res.json({ ok: true, items: [] });
    }

    const t1 = Date.now();

    // ?? BÚSQUEDA CONTAINS: busca cualquier VIN que contenga el patrón
    // Ejemplo: "213" encuentra "TH500213"
    const searchPattern = encodeURIComponent(`%${q}%`);
    let query = `${process.env.SUPABASE_URL}/rest/v1/vins?`;
    query += `vin=ilike.${searchPattern}`;
    query += `&select=vin,modelo,cliente`;
    query += `&order=vin.asc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`Status ${res_data.status}`);

    const items = (await res_data.json()) || [];
    const duration = Date.now() - t1;

    return res.json({
      ok: true,
      items: items.map(v => ({ vin: v.vin, modelo: v.modelo, cliente: v.cliente })),
      count: items.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    console.error("[GET /api/vin-suggest]", e.message);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

router.get("/api/name-suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 12)));

    const t1 = Date.now();

    // ?? BÚSQUEDA DIRECTA EN SUPABASE (sin cache)
    let query = `${process.env.SUPABASE_URL}/rest/v1/usuarios?`;
    query += `activo=eq.true`;

    if (q && q !== ".") {
      // Busca en nombre email (ILIKE case-insensitive)
      const searchPattern = encodeURIComponent(`%${q}%`);
      query += `&or=(nombre.ilike.${searchPattern},email.ilike.${searchPattern})`;
    }

    query += `&select=id,nombre,email,rol,especialidad`;
    query += `&order=nombre.asc&limit=${limit}`;

    const headers = supabaseHeaders_();
    const res_data = await fetch(query, { method: "GET", headers });

    if (!res_data.ok) throw new Error(`${res_data.status}`);

    const items = await res_data.json();
    const duration = Date.now() - t1;

    // Mapea al formato esperado por frontend
    const mapped = items.map(u => ({
      userId: String(u.id || ""),
      name: String(u.nombre || ""),
      email: String(u.email || ""),
      label: `${u.nombre} (${u.email})`,
    }));

    return res.json({
      ok: true,
      items: mapped,
      count: mapped.length,
      _timing: `${duration}ms`,
      _source: "supabase",
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ── GET /api/vins-sin-modelo ──────────────────────────────────────────────────
router.get("/api/vins-sin-modelo", async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/vins?modelo=is.null&select=vin,cliente&limit=200&order=vin.asc`,
      { method: "GET", headers: supabaseHeaders_() }
    );
    const items = r.ok ? await r.json() : [];
    return res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

export default router;
