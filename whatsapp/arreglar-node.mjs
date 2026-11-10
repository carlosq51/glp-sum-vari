// Corre solo después de `npm install` (postinstall).
//
// Baileys importa su JSON con `with { type: 'json' }`, que Node entiende
// desde la 20.10. La laptop de la oficina tiene la 20.9, que solo entiende la
// forma vieja `assert { ... }`. En esas versiones se cambia la palabra; en
// Node 20.10+ no se toca nada (ahí `assert` ya no existe).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [ma, mi] = process.versions.node.split(".").map(Number);
const entiendeWith = ma > 20 || (ma === 20 && mi >= 10) || (ma === 18 && mi >= 20);
if (entiendeWith) process.exit(0);

const base = new URL("./node_modules/@whiskeysockets/baileys/lib/", import.meta.url);
for (const f of ["Defaults/index.js", "Utils/generics.js"]) {
  const u = new URL(f, base);
  if (!existsSync(u)) continue;
  const s = readFileSync(u, "utf8");
  const t = s.replace(/\bwith\s*\{\s*type:\s*'json'\s*\}/g, "assert { type: 'json' }");
  if (t !== s) { writeFileSync(u, t); console.log(`[arreglar-node] ${f}: with → assert (Node ${process.versions.node})`); }
}
