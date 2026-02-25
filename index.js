import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
app.use(express.static("public"));

// ping local
app.get("/ping", (req, res) => res.json({ ok: true, msg: "pong" }));

// función para llamar Apps Script
async function callAppsScript(action, payload = {}) {
  const APS_URL = process.env.APS_URL;
  const APS_KEY = process.env.APS_KEY;

  if (!APS_URL) throw new Error("Falta APS_URL en .env");
  if (!APS_KEY) throw new Error("Falta APS_KEY en .env");

  const reqBody = { action, key: APS_KEY, ...payload };

  const r = await fetch(APS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(reqBody),
  });

  const text = await r.text();

  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("Respuesta no-JSON desde Apps Script: " + text.slice(0, 500));
  }

  if (!j.ok) {
    throw new Error(`[APS:${action}] ${j.error || "Error Apps Script"}`);
  }

  return j;
}

// =========================
// UPLOADER PROXY (frontend -> Node -> Apps Script)
// =========================
const UPLOADER_ACTIONS = new Set([
  "getStatus",
  "uploadOne",
  "uploadFalla",
  "uploadCalidad",
  "uploadConformidad",
]);

app.post("/api/uploader/proxy", async (req, res) => {
  try {
    const body = req.body || {};
    const action = String(body.action || "").trim();

    console.log("[UPLOADER_PROXY] action:", action);
    console.log("[UPLOADER_PROXY] keys:", Object.keys(body || {}));

    if (!UPLOADER_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "Acción uploader no permitida" });
    }

    const { action: _omit, ...payload } = body;
    const j = await callAppsScript(action, payload);

    return res.json(j);
  } catch (e) {
    console.error("[UPLOADER_PROXY] ERROR:", e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Apps Script (me)
app.get("/api/me", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: "Falta ?email=" });

    const j = await callAppsScript("me", { email });
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// endpoint Node → Apps Script (mis_activas)
app.get("/api/mis-activas", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const userId = String(req.query.userId || "").trim();

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Envía ?email= o ?userId=" });
    }

    const j = await callAppsScript("mis_activas", { email, userId });
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/evento", async (req, res) => {
  try {
    // req.body debe traer: email o userId, vin, rolTrabajo, accion, nota
    const j = await callAppsScript("evento", req.body);
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/estado", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const vin = String(req.query.vin || "").trim().toUpperCase();
    const rolTrabajo = String(req.query.rolTrabajo || "").trim().toUpperCase();

    if (!email) return res.status(400).json({ ok:false, error:"Falta email" });
    if (!vin) return res.status(400).json({ ok:false, error:"Falta vin" });
    if (!rolTrabajo) return res.status(400).json({ ok:false, error:"Falta rolTrabajo" });

    const j = await callAppsScript("estado", { email, vin, rolTrabajo });
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

// =========================
// SUPERVISOR REPORT
// =========================
app.post("/api/supervisor/report", async (req, res) => {
  try {
    // filtros opcionales: role, q (nombre/email), from, to, month
    const payload = req.body || {};
    const j = await callAppsScript("supervisor_report", payload);
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Alias GET para que el frontend actual (GET) funcione sin cambiar app.js
app.get("/api/supervisor/report", async (req, res) => {
  try {
    // =========================
    // 1) leer filtros
    // =========================
    const payload = {
      q: String(req.query.q || "").trim(),
      from: String(req.query.from || "").trim(),
      to: String(req.query.to || "").trim(),
      month: String(req.query.month || "").trim(),

      // ✅ NUEVO: viene del frontend cuando track=RAMAL
      tipoRamal: String(req.query.tipoRamal || "").trim(),
    };


    const track = String(req.query.track || "CONVERSION").toUpperCase();

    // =========================
    // 2) llamar Apps Script
    // =========================
    const j = await callAppsScript("supervisor_report", payload);
    if (!j.ok) return res.json(j);

    let rows = Array.isArray(j.items) ? j.items : [];

    // =========================
    // 3) AGRUPACIÓN POR TRACK
    // =========================
    let outItems = [];

    if (track === "CONVERSION") {
      // ✅ NO agrupar aquí. Devuelve filas MOTOR y TANQUE tal cual.
      outItems = rows.filter(r => ["MOTOR", "TANQUE"].includes(String(r.rol || "").toUpperCase()));
    }


    else if (track === "CALIDAD") {
      outItems = rows.filter(r => String(r.rol || "").toUpperCase() === "CALIDAD");
    }

    else if (track === "RAMAL") {
      const qMarca = String(req.query.tipoRamal || "").trim().toUpperCase();

      outItems = rows.filter(r => {
        const rol = String(r.rol || "").toUpperCase();
        if (rol !== "RAMALERO") return false;

        // si no hay filtro de marca, devuelve todos los RAMALERO
        if (!qMarca) return true;

        const tipo = String(r.tipoRamal || r.tipo_ramal || r.tipo || "").trim().toUpperCase();

        // ✅ match flexible: contiene (JETOUR, X5, KYC V3, etc.)
        return tipo.includes(qMarca);
      });
    }


    else {
      outItems = rows;
    }

    // =========================
    // 4) RESPUESTA FINAL
    // =========================
    return res.json({ ok: true, items: outItems });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// =========================
// SUPERVISOR: CONVERSION DETAIL (INICIO / FIN por MOTOR y TANQUE)
// =========================
app.get("/api/supervisor/conversion-detail", async (req, res) => {
  try {
    const vin = String(req.query.vin || "").trim().toUpperCase();
    if (!vin) return res.status(400).json({ ok: false, error: "Falta ?vin=" });

    // ✅ Esto lo implementamos en Apps Script como action:
    // action: "supervisor_conversion_detail"
    // payload: { vin }
    const j = await callAppsScript("supervisor_conversion_detail", { vin });

    // esperamos algo como:
    // { ok:true, vin, motor:{ tecnico,inicio,fin }, tanque:{ tecnico,inicio,fin } }
    return res.json(j);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/vin-suggest", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toUpperCase();
    const limit = Number(req.query.limit || 12);

    if (!q) return res.json({ ok: true, items: [] });

    const j = await callAppsScript("vin_suggest", { q, limit });
    return res.json(j);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


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

async function ensureNameCache_() {
  const now = Date.now();
  if (NAME_CACHE.items.length && (now - NAME_CACHE.ts) < NAME_CACHE_TTL_MS) return;

  // ✅ pide TODO una vez (q="." o all:true)
  const j = await callAppsScript("name_suggest", { q: ".", limit: 200, all: true });

  const items = Array.isArray(j.items) ? j.items : [];
  NAME_CACHE.items = items.map(x => ({
    userId: String(x.userId || x.id || ""),
    name: String(x.name || x.nombre || ""),
    email: String(x.email || ""),
    label: String(x.label || ""),
  }));
  NAME_CACHE.ts = now;
}

app.get("/api/name-suggest", async (req, res) => {
  try {
    const q = norm_(req.query.q);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 12)));

    await ensureNameCache_();

    // ✅ si q vacío o "." => devuelve lista base
    if (!q || q === ".") {
      return res.json({ ok: true, items: NAME_CACHE.items.slice(0, limit) });
    }

    // ✅ filtro local instantáneo
    const out = [];
    for (const u of NAME_CACHE.items) {
      if (hay_(u).includes(q)) {
        out.push(u);
        if (out.length >= limit) break;
      }
    }
    return res.json({ ok: true, items: out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// =========================
// SYNC (frontend espera POST /api/sync)
// =========================
app.post("/api/sync", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const userId = String(req.body?.userId || "").trim();
    const since = req.body?.since ?? null;

    if (!email && !userId) {
      return res.status(400).json({ ok: false, error: "Envía email o userId" });
    }

    // intenta action "sync" si existe en tu .gs
    try {
      const j = await callAppsScript("sync", { email, userId, since });
      return res.json(j);
    } catch (e1) {
      // fallback: usa mis_activas y envuelve como sync
      const j2 = await callAppsScript("mis_activas", { email, userId });
      const items = Array.isArray(j2.items) ? j2.items : [];
      return res.json({
        ok: true,
        full: true,
        items,
        server_time: new Date().toISOString(),
        rev: null,
        mode: "wrapped_mis_activas",
      });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


// =========================
// CONFORMIDAD EQUIPO (guardar)
// =========================
app.post("/api/equipo-conformidad", async (req, res) => {
  try {
    // espera: email, conversionId, vin, rolTrabajo, equipoCodigo, checks
    const j = await callAppsScript("equipo_conformidad", req.body);
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/tecnicos-list", async (req, res) => {
  try {
    const j = await callAppsScript("tecnicos_list", {});
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/incidencia", async (req, res) => {
  try {
    const j = await callAppsScript("incidencia_add", req.body);
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
