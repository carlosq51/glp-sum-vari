// =========================
// scripts/dev-despacho.js
// Servidor de vista previa del módulo de despacho. SOLO desarrollo.
//
// Por qué existe: index.js importa toda la app, incluido `sharp`, que exige
// Node >= 20.10. En un Node más viejo el servidor completo no arranca y no
// hay forma de ver la pantalla. Esto levanta únicamente routes/despacho.js,
// que no depende de sharp.
//
// Además corre en el puerto 3010 a propósito: el puerto forma parte del
// origen, así que el service worker registrado en localhost:3000 NO intercepta
// nada aquí. Sin caché de la PWA de por medio.
//
//   node scripts/dev-despacho.js     →  http://localhost:3010/tv?demo=1
// =========================

import express from "express";
import dotenv from "dotenv";
import despachoRouter from "../routes/despacho.js";
import zonasRouter from "../routes/zonas.js";
import { sseHandler_ } from "../lib/events.js";

dotenv.config();   // index.js lo hace por su cuenta; aquí hay que repetirlo

const app = express();
const PORT = process.env.DESPACHO_PORT || 3010;

app.use(express.json());
app.get("/api/events", sseHandler_);
app.use(despachoRouter);
app.use(zonasRouter);   // la escena del mapa consume GET /api/zonas

app.get("/", (_req, res) => res.redirect("/tv?demo=1"));

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  Vista previa del módulo de despacho");
  console.log("  ───────────────────────────────────────────────");
  console.log(`  Pantalla TV (demo):  http://localhost:${PORT}/tv?demo=1`);
  console.log(`  Pantalla TV (real):  http://localhost:${PORT}/tv`);
  console.log(`  Marcar asistencia:   http://localhost:${PORT}/marcar`);
  console.log("");
  console.log("  Ctrl+C para detener.");
  console.log("");
});
