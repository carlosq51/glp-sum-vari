import express from "express";
import dotenv from "dotenv";
import { existsSync } from "fs";
import webpush from "web-push";

import uploaderRouter from "./routes/uploader.js";
import pushRouter from "./routes/push.js";
import ramalRouter from "./routes/ramal.js";
import incidenciasRouter from "./routes/incidencias.js";
import supervisorRouter from "./routes/supervisor.js";
import trabajoRouter from "./routes/trabajo.js";
import adminRouter, { scheduleAutoNormalize_ } from "./routes/admin.js";
import movilizadorRouter from "./routes/movilizador.js";
import tecnicoRouter from "./routes/tecnico.js";
import mlRouter, { scheduleAutoRetrain_, loadPairingModelFromSupabase_ } from "./routes/ml.js";
import vinsRouter from "./routes/vins.js";
import zonasRouter from "./routes/zonas.js";

dotenv.config();

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────
if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  console.warn("[WebPush] VAPID keys not set — push notifications disabled. Add VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY to env.");
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Inyecta variables VITE_* como window.__ENV__ para que funcione sin Vite
app.get("/env-config.js", (_req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__ENV__=${JSON.stringify({
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "",
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || "",
    })};`
  );
});

// Serve Vite build output if available, otherwise fallback to source
const staticDir = existsSync("dist") ? "dist" : "public";

// Headers especiales para PWA (Service Worker + Manifest)
app.get(["/sw.js", "/sw-custom.js"], (_req, res, next) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache");
  next();
});
app.use((_req, res, next) => {
  if (/^\/workbox-[^/]+\.js$/.test(_req.path)) {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (_req.path === "/manifest.webmanifest") {
    res.setHeader("Content-Type", "application/manifest+json");
  }
  next();
});

app.use(express.static(staticDir));

// ── Route modules ─────────────────────────────────────────────────────────────
app.use(uploaderRouter);
app.use(pushRouter);
app.use(ramalRouter);
app.use(incidenciasRouter);
app.use(supervisorRouter);
app.use(trabajoRouter);
app.use(adminRouter);
app.use(movilizadorRouter);
app.use(tecnicoRouter);
app.use(mlRouter);
app.use(vinsRouter);
app.use(zonasRouter);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`Ábrelo desde tu celular con: http://192.168.18.121:${PORT}`);
  if (!existsSync("./pairing-model.json")) {
    loadPairingModelFromSupabase_().catch(() => {});
  }
  scheduleAutoRetrain_();
  scheduleAutoNormalize_();
});
