-- ============================================================
--  010 · HOJAS DE CONTROL DE CALIDAD PEDIDAS A LA OFICINA
--  Correr en el SQL editor (después de 009).
-- ============================================================
--
--  Por qué existe
--  --------------
--  El inspector de calidad (Wilmer, Uribe…) imprimía a mano la hoja
--  "CC WILMER" de CERTIFICADOS GLP.xlsx: CONTROL FINAL con 75 puntos ya
--  marcados según el modelo. Ahora la pide desde su tarjeta y la oficina
--  imprime todas las pendientes con un botón.
--
--  Una fila = una hoja pedida. No guarda las marcas: salen del modelo del
--  carro (public/js/templates/views/hoja-cc-view.js). Solo hay una PENDIENTE
--  por VIN: pedirla otra vez antes de imprimir no duplica el papel.
--
--  Quién escribe: routes/hojas-calidad.js (pedir, imprimir, anular).
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE estado_hoja_calidad AS ENUM ('PENDIENTE', 'IMPRESA', 'ANULADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS hojas_calidad (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                     text NOT NULL,
  estado                  estado_hoja_calidad NOT NULL DEFAULT 'PENDIENTE',
  solicitado_por          text NOT NULL,
  solicitado_por_user_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  impresa_at              timestamptz,
  impresa_por             text,
  impresa_por_user_id     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hojas_calidad_vin_pendiente_idx
  ON hojas_calidad (vin) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS hojas_calidad_vin_idx ON hojas_calidad (vin, created_at DESC);

ALTER TABLE hojas_calidad ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE hojas_calidad IS
  'Hojas CONTROL FINAL (CC WILMER) que un inspector de calidad pidió imprimir. La escribe routes/hojas-calidad.js; las marcas salen del modelo del carro, no se guardan.';
COMMENT ON COLUMN hojas_calidad.solicitado_por IS 'Correo del inspector que la pidió. Su nombre va en TÉCNICO: del papel.';
COMMENT ON COLUMN hojas_calidad.created_at IS 'Cuándo se pidió. Es la FECHA: del papel.';
COMMENT ON COLUMN hojas_calidad.impresa_por IS 'Correo de quien la imprimió en la oficina (la última vez, si se reimprimió).';

CREATE OR REPLACE FUNCTION glp_hojas_calidad_touch_()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hojas_calidad_touch ON hojas_calidad;
CREATE TRIGGER hojas_calidad_touch BEFORE UPDATE ON hojas_calidad FOR EACH ROW
  EXECUTE FUNCTION glp_hojas_calidad_touch_();

DROP TRIGGER IF EXISTS trg_user_ids ON hojas_calidad;
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON hojas_calidad FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('solicitado_por','solicitado_por_user_id', 'impresa_por','impresa_por_user_id');

COMMIT;
