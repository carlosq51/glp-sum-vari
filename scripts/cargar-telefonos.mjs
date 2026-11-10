// =========================
// scripts/cargar-telefonos.mjs
// Carga una vez los celulares de whatsapp/telefonos.json (email → número)
// en usuarios.telefono. Requiere la migración 014 y SUPABASE_SERVICE_KEY.
//
//   node --env-file=.env scripts/cargar-telefonos.mjs          (muestra qué haría)
//   node --env-file=.env scripts/cargar-telefonos.mjs --escribir
//
// Solo llena a quien no tiene celular: no pisa lo que se puso en Admin.
// =========================
import { readFileSync } from "node:fs";

const ESCRIBIR = process.argv.includes("--escribir");
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL_ = process.env.SUPABASE_URL;
if (!KEY || !URL_) { console.error("Falta SUPABASE_URL / SUPABASE_SERVICE_KEY en .env"); process.exit(1); }
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const tel = JSON.parse(readFileSync(new URL("../whatsapp/telefonos.json", import.meta.url), "utf8"));
const r = await fetch(`${URL_}/rest/v1/usuarios?select=id,email,nombre,telefono`, { headers: h });
if (!r.ok) {
  const t = await r.text();
  console.error(/telefono/.test(t) ? "Falta correr supabase/migrations/014_usuarios-telefono.sql" : t);
  process.exit(1);
}
const porEmail = new Map((await r.json()).map(u => [String(u.email).toLowerCase(), u]));

let n = 0;
for (const [email, t] of Object.entries(tel)) {
  const numero = String(t.numero || "").replace(/\D/g, "");
  const u = porEmail.get(email.toLowerCase());
  if (!numero) { console.log(`· ${t.nombre}: sin número en el archivo`); continue; }
  if (!u) { console.log(`· ${t.nombre}: ${email} no existe en la app`); continue; }
  if (u.telefono) { console.log(`· ${u.nombre}: ya tiene ${u.telefono}`); continue; }
  console.log(`${ESCRIBIR ? "✔" : "→"} ${u.nombre}: ${numero}`);
  if (ESCRIBIR) {
    const p = await fetch(`${URL_}/rest/v1/usuarios?id=eq.${u.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ telefono: numero }) });
    if (!p.ok) console.log(`  ✖ ${p.status} ${await p.text()}`);
  }
  n++;
}
console.log(ESCRIBIR ? `Listo: ${n} celulares cargados.` : `${n} por cargar. Agrega --escribir para guardarlos.`);
