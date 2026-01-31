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



app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
