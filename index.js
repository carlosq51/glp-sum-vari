import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ping local
app.get("/ping", (req, res) => res.json({ ok: true, msg: "pong" }));

// función para llamar Apps Script
async function callAppsScript(action, payload = {}) {
  const APS_URL = process.env.APS_URL;
  const APS_KEY = process.env.APS_KEY;

  if (!APS_URL) throw new Error("Falta APS_URL en .env");
  if (!APS_KEY) throw new Error("Falta APS_KEY en .env");

  const r = await fetch(APS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, key: APS_KEY, ...payload }),
  });

  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("Respuesta no-JSON desde Apps Script: " + text.slice(0, 200));
  }

  if (!j.ok) throw new Error(j.error || "Error Apps Script");
  return j;
}

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
      outItems = rows.filter(r => String(r.rol || "").toUpperCase() === "RAMALERO");
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




app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
