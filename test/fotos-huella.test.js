import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PRELUDIO, archivosMigracion } from "../scripts/esquema-convencion.mjs";

// glp_fotos_repetidas (migración 008) en un Postgres en memoria.
const bits = (fn) => Array.from({ length: 256 }, (_, k) => (fn(k) ? "1" : "0")).join("");
const BASE = bits((k) => k % 3 === 0);
const cambiar = (h, n) => h.split("").map((c, k) => (k < n ? (c === "1" ? "0" : "1") : c)).join("");

describe("fotos repetidas (glp_fotos_repetidas)", () => {
  it("halla la misma foto en otro carro y en otra casilla, no la casilla vuelta a subir", async () => {
    const db = new PGlite();
    await db.exec(PRELUDIO);
    for (const f of archivosMigracion()) {
      await db.exec(fs.readFileSync(path.join("supabase/migrations", f), "utf8"));
    }
    await db.exec(`INSERT INTO usuarios (email, nombre) VALUES ('ana@x.com', 'ANA PEREZ')`);

    const fila = (clave, vin, slot, huella, por = "ana@x.com") =>
      db.query(
        `INSERT INTO fotos_huella (clave, vin, slot, huella, subido_por) VALUES ($1, $2, $3, $4::bit(256), $5)`,
        [clave, vin, slot, huella, por]
      );
    await fila("registro/2026-10/VIN1/comp_1.jpg", "VIN1", "comp_1", BASE);
    await fila("registro/2026-10/VIN2/comp_1.jpg", "VIN2", "comp_1", cambiar(BASE, 10)); // otra resolución
    await fila("registro/2026-10/VIN1/comp_2.jpg", "VIN1", "comp_2", cambiar(BASE, 3));  // misma foto, otra casilla
    await fila("registro/2026-09/VIN1/comp_1.jpg", "VIN1", "comp_1", BASE);              // misma casilla, otro mes
    await fila("registro/2026-10/VIN3/comp_1.jpg", "VIN3", "comp_1", cambiar(BASE, 40)); // otra foto

    const { rows } = await db.query(
      `SELECT clave, igual_vin, igual_slot, igual_nombre, distancia
       FROM glp_fotos_repetidas('vin1', 16) WHERE clave = 'registro/2026-10/VIN1/comp_1.jpg'`
    );
    expect(rows).toEqual([
      { clave: "registro/2026-10/VIN1/comp_1.jpg", igual_vin: "VIN1", igual_slot: "comp_2", igual_nombre: "ANA PEREZ", distancia: 3 },
      { clave: "registro/2026-10/VIN1/comp_1.jpg", igual_vin: "VIN2", igual_slot: "comp_1", igual_nombre: "ANA PEREZ", distancia: 10 },
    ]);
    await db.close();
  }, 60_000);
});
