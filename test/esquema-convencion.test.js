import { describe, it, expect } from "vitest";
import { revisarConvencion } from "../scripts/esquema-convencion.mjs";

// Aplica todas las migraciones en PGlite: tarda unos segundos.
describe("convención de nombres de la base (solo lo nuevo)", () => {
  it("las migraciones posteriores a la 005 la cumplen", async () => {
    expect(await revisarConvencion()).toEqual([]);
  }, 60_000);

  it("una tabla nueva bien hecha pasa", async () => {
    const faltas = await revisarConvencion({
      extraSql: `
        CREATE TYPE estado_prueba AS ENUM ('ABIERTO', 'CERRADO');
        CREATE TABLE prueba_bien (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          vin text NOT NULL,
          estado estado_prueba NOT NULL DEFAULT 'ABIERTO',
          jornada_fecha date NOT NULL,
          tecnico_email text,
          tecnico_user_id uuid REFERENCES usuarios(id),
          creado_por_user_id uuid REFERENCES usuarios(id),
          created_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE prueba_bien ENABLE ROW LEVEL SECURITY;
        COMMENT ON TABLE prueba_bien IS 'Prueba.';`,
    });
    expect(faltas).toEqual([]);
  }, 60_000);

  it("detecta las faltas en lo nuevo, también en tablas viejas", async () => {
    const faltas = await revisarConvencion({
      extraSql: `
        CREATE TABLE "PruebaMal" (x int);
        CREATE TABLE prueba_mal (
          id serial PRIMARY KEY,
          estado text,
          registrado_por text,
          fecha_hora timestamp,
          cerrado timestamptz,
          aprobado_user_id text
        );
        ALTER TABLE usuarios ADD COLUMN ultimo_login timestamptz;`,
    });
    const texto = faltas.join("\n");
    expect(texto).toMatch(/PruebaMal: nombre en snake_case/);
    expect(texto).toMatch(/PruebaMal: falta PRIMARY KEY/);
    expect(texto).toMatch(/prueba_mal: falta ENABLE ROW LEVEL SECURITY/);
    expect(texto).toMatch(/prueba_mal: falta COMMENT/);
    expect(texto).toMatch(/prueba_mal\.id: uuid/);
    expect(texto).toMatch(/prueba_mal\.estado: valores fijos/);
    expect(texto).toMatch(/prueba_mal\.registrado_por: persona como texto/);
    expect(texto).toMatch(/prueba_mal\.fecha_hora: usar timestamptz/);
    expect(texto).toMatch(/prueba_mal\.cerrado: un momento se llama \*_at/);
    expect(texto).toMatch(/prueba_mal\.aprobado_user_id: \*_user_id debe ser uuid/);
    expect(texto).toMatch(/usuarios\.ultimo_login: un momento se llama \*_at/);
    // Lo existente hasta la 005 no se revisa.
    expect(texto).not.toMatch(/asignaciones\.running_since/);
  }, 60_000);
});
