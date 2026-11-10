-- ============================================================
--  013 · CALIBRACIONES STAG LANZADAS DESDE LA APP
--  Correr en el SQL editor (después de 012).
-- ============================================================
--
--  Por qué existe
--  --------------
--  La calibración la hace stag-auto (Python, en la laptop de calibración):
--  conecta AC STAG, carga el mapa, autocalibra y toma las 5 fotos. Antes
--  había que escribir VIN y km en la laptop. Ahora el inspector la inicia
--  desde su tarjeta de Calidad (el VIN ya lo tiene la app; solo pone el
--  km) y ve el avance en el celular.
--
--  Una fila = una calibración pedida. El avance en vivo (presión, G1–G4,
--  paso en curso) NO se guarda aquí: vive en memoria del servidor mientras
--  dura (routes/calibracion.js). Aquí queda el pedido, en qué paso iba y,
--  al final, el resumen (tiempos, fotos, presión, avisos de gas).
--
--  Quién escribe: routes/calibracion.js.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE estado_calibracion AS ENUM
    ('PENDIENTE', 'EN_CURSO', 'TERMINADA', 'DETENIDA', 'CANCELADA', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS calibraciones (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                     text NOT NULL,
  kilometraje             integer NOT NULL CHECK (kilometraje >= 0),
  mapa                    text NOT NULL,
  modelo                  text,
  estado                  estado_calibracion NOT NULL DEFAULT 'PENDIENTE',
  solicitado_por          text NOT NULL,
  solicitado_por_user_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  paso_actual             text,
  iniciada_at             timestamptz,
  terminada_at            timestamptz,
  resumen                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calibraciones_vin_idx ON calibraciones (vin, created_at DESC);
CREATE INDEX IF NOT EXISTS calibraciones_modelo_idx ON calibraciones (modelo, created_at DESC);
CREATE INDEX IF NOT EXISTS calibraciones_abiertas_idx ON calibraciones (estado)
  WHERE estado IN ('PENDIENTE', 'EN_CURSO');

ALTER TABLE calibraciones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE calibraciones IS
  'Calibraciones STAG pedidas desde la vista de Calidad y hechas por stag-auto en la laptop. La escribe routes/calibracion.js; el avance en vivo está en memoria del servidor.';
COMMENT ON COLUMN calibraciones.mapa IS 'Archivo .set (ruta relativa a Escritorio\SUM de la laptop).';
COMMENT ON COLUMN calibraciones.modelo IS 'modelo normalizado del carro al pedirla: sirve para sugerir el mapa la próxima vez.';
COMMENT ON COLUMN calibraciones.paso_actual IS 'Último paso de stag-auto del que se tuvo noticia (Conectar, Autocalibración, Foto 3…).';
COMMENT ON COLUMN calibraciones.resumen IS 'Al terminar: total_s, esperas, splits por paso, fotos, presion_final, avisos y alertas de gas, carpeta de fotos en la laptop.';

CREATE OR REPLACE FUNCTION glp_calibraciones_touch_()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS calibraciones_touch ON calibraciones;
CREATE TRIGGER calibraciones_touch BEFORE UPDATE ON calibraciones FOR EACH ROW
  EXECUTE FUNCTION glp_calibraciones_touch_();

DROP TRIGGER IF EXISTS trg_user_ids ON calibraciones;
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON calibraciones FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('solicitado_por','solicitado_por_user_id');

COMMIT;
