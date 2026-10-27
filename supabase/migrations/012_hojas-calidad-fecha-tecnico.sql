-- ============================================================
--  012 · FECHA Y TÉCNICO DE LA HOJA DE CALIDAD, A ELECCIÓN
--  Correr en el SQL editor (después de 011).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Se está regularizando el papeleo con la hoja nueva: un inspector (Luchito)
--  hace hoy las hojas de carros que cerró otro (Jesús) hace días. La hoja
--  tiene que llevar la fecha del control y el nombre de quien lo hizo, no la
--  de hoy ni la de quien la pide.
--
--    · fecha_hoja       — la FECHA: del papel. Por defecto hoy; NULL en las
--                         pedidas antes de esta migración (sale created_at).
--    · tecnico_user_id  — quién va en TÉCNICO:. Por defecto el inspector que
--                         cerró la OT de calidad; NULL = quien la pidió.
--
--  Quién escribe: routes/hojas-calidad.js al pedir la hoja.
-- ============================================================

BEGIN;

ALTER TABLE hojas_calidad
  ADD COLUMN IF NOT EXISTS fecha_hoja date,
  ADD COLUMN IF NOT EXISTS tecnico_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN hojas_calidad.fecha_hoja IS
  'La FECHA: impresa. La elige el inspector (por defecto hoy). NULL = la del pedido (created_at).';
COMMENT ON COLUMN hojas_calidad.tecnico_user_id IS
  'Quién va en TÉCNICO: del papel. Por defecto quien cerró la OT de calidad. NULL = quien la pidió.';

COMMIT;
