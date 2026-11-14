-- ============================================================
--  015 · REGISTRO DE OT POR CALIDAD
--  Correr en el SQL editor (después de 014).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Antes el #OT lo escribía la oficina a mano en ASIGNACIONES (col E) y de
--  ahí bajaba a work_orders.numero_ot. Ahora lo pone el inspector de
--  Calidad desde el modal "Registro" del carro, y en el mismo paso confirma
--  que el tanque y el reductor que lleva el carro son los del equipo virtual
--  (vins.tanque_asignado / reductor_asignado).
--
--  Una fila por carro (vin único). Al aprobar:
--    · routes/ot-calidad.js escribe la fila y work_orders.numero_ot
--      (la OT de CONVERSION), así Salida ya no pide el #OT a la hoja.
--    · Apps Script (REPORTE_PRINCIPAL, subirOtsCalidadAsignaciones_) toma
--      las que tienen hoja_at vacío y escribe en la hoja mensual de
--      ASIGNACIONES: E = OT, F = fecha, AC = técnicos, AE = FINALIZADO.
--      Luego marca hoja_at (o hoja_error si no encontró el VIN).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ot_calidad (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                    text NOT NULL UNIQUE,
  work_order_id          uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  numero_ot              text NOT NULL,
  tanque_virtual         text NOT NULL DEFAULT '',
  reductor_virtual       text NOT NULL DEFAULT '',
  tanque_ok              boolean NOT NULL DEFAULT false,
  reductor_ok            boolean NOT NULL DEFAULT false,
  tecnicos               text NOT NULL DEFAULT '',
  fecha_aprobacion       date NOT NULL,
  aprobado_por           text NOT NULL,
  aprobado_por_user_id   uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  hoja_at                timestamptz,
  hoja_error             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Lo que Apps Script pregunta cada 5 min: lo aprobado que falta en la hoja.
CREATE INDEX IF NOT EXISTS ot_calidad_sin_hoja_idx ON ot_calidad (created_at)
  WHERE hoja_at IS NULL;

ALTER TABLE ot_calidad ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ot_calidad IS
  'OT registrada y aprobada por Calidad (modal Registro). La escribe routes/ot-calidad.js; Apps Script la sube a ASIGNACIONES y marca hoja_at.';
COMMENT ON COLUMN ot_calidad.tecnicos IS '"1er nombre DELANTERO - 1er nombre TANQUERO", tal como va en ASIGNACIONES col AC.';
COMMENT ON COLUMN ot_calidad.fecha_aprobacion IS 'Día de la aprobación en Lima: va a ASIGNACIONES col F (FECHA DE CONVERSION).';
COMMENT ON COLUMN ot_calidad.hoja_at IS 'Cuándo Apps Script la escribió en ASIGNACIONES. NULL = pendiente. Se vuelve NULL si Calidad corrige la OT.';
COMMENT ON COLUMN ot_calidad.hoja_error IS 'Por qué Apps Script no pudo escribirla (p. ej. el VIN no está en ninguna hoja mensual).';

CREATE OR REPLACE FUNCTION glp_ot_calidad_touch_()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ot_calidad_touch ON ot_calidad;
CREATE TRIGGER ot_calidad_touch BEFORE UPDATE ON ot_calidad FOR EACH ROW
  EXECUTE FUNCTION glp_ot_calidad_touch_();

DROP TRIGGER IF EXISTS trg_user_ids ON ot_calidad;
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON ot_calidad FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('aprobado_por','aprobado_por_user_id');

COMMIT;
