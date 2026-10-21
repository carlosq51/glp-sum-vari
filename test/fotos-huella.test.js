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

  it("cuenta el % de carros con copias por jornada, mes y general (009)", async () => {
    const db = new PGlite();
    await db.exec(PRELUDIO);
    for (const f of archivosMigracion()) {
      await db.exec(fs.readFileSync(path.join("supabase/migrations", f), "utf8"));
    }
    await db.exec(`INSERT INTO usuarios (email, nombre) VALUES ('ana@x.com', 'ANA PEREZ')`);
    const fila = (clave, vin, slot, at, copia = null) =>
      db.query(
        `INSERT INTO fotos_huella (clave, vin, slot, huella, subido_por, created_at, copia_de)
         VALUES ($1, $2, $3, $4::bit(256), 'ana@x.com', $5, $6)`,
        [clave, vin, slot, BASE, at, copia]
      );
    // 15:00 UTC = 10:00 en Lima: la jornada es ese mismo día.
    await fila("r/09/A/comp_1.jpg", "A", "comp_1", "2026-09-20T15:00:00Z");
    await fila("r/10/B/comp_1.jpg", "B", "comp_1", "2026-10-05T15:00:00Z", "r/09/A/comp_1.jpg");
    await fila("r/10/C/comp_1.jpg", "C", "comp_1", "2026-10-21T15:00:00Z");
    await fila("r/10/C/voltaje.jpg", "C", "voltaje", "2026-10-21T15:00:00Z");
    await fila("r/10/D/comp_1.jpg", "D", "comp_1", "2026-10-21T15:00:00Z", "r/10/B/comp_1.jpg");
    await fila("r/10/D/sold_sensor_antes.jpg", "D", "sold_sensor_antes", "2026-10-21T15:00:00Z", "r/10/C/comp_1.jpg");
    await fila("r/10/E/calidad_1.jpg", "E", "calidad_1", "2026-10-21T15:00:00Z", "r/10/C/comp_1.jpg");

    const { rows } = await db.query(
      `SELECT alcance, grupo, carros, carros_con_copia, fotos, fotos_copiadas
       FROM glp_fotos_copias_resumen('2026-10-21') ORDER BY alcance, grupo`
    );
    expect(rows).toEqual([
      { alcance: "general", grupo: "parametros", carros: 4, carros_con_copia: 2, fotos: 5, fotos_copiadas: 2 },
      { alcance: "general", grupo: "soldadura",  carros: 1, carros_con_copia: 1, fotos: 1, fotos_copiadas: 1 },
      { alcance: "jornada", grupo: "parametros", carros: 2, carros_con_copia: 1, fotos: 3, fotos_copiadas: 1 },
      { alcance: "jornada", grupo: "soldadura",  carros: 1, carros_con_copia: 1, fotos: 1, fotos_copiadas: 1 },
      { alcance: "mes",     grupo: "parametros", carros: 3, carros_con_copia: 2, fotos: 4, fotos_copiadas: 2 },
      { alcance: "mes",     grupo: "soldadura",  carros: 1, carros_con_copia: 1, fotos: 1, fotos_copiadas: 1 },
    ]);

    const det = await db.query(
      `SELECT vin, slot, nombre, igual_vin, igual_slot FROM glp_fotos_copias_detalle('2026-10-21')
       WHERE grupo = 'parametros' ORDER BY created_at`
    );
    expect(det.rows).toEqual([
      { vin: "B", slot: "comp_1", nombre: "ANA PEREZ", igual_vin: "A", igual_slot: "comp_1" },
      { vin: "D", slot: "comp_1", nombre: "ANA PEREZ", igual_vin: "B", igual_slot: "comp_1" },
    ]);
    await db.close();
  }, 60_000);
});
