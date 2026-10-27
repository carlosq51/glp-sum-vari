-- ============================================================
--  011 · LO QUE EL INSPECTOR MARCÓ EN SU HOJA DE CALIDAD
--  Correr en el SQL editor (después de 010).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Hasta la 010 la hoja salía con las marcas fijas del modelo. Ahora el
--  inspector la valida en un modal antes de pedirla y puede poner ok en las
--  casillas que el modelo deja en blanco (o quitar alguna). Se guarda solo
--  lo que cambió respecto del modelo: { "22": "ok", "53": "ok" }.
--
--  Quién escribe: routes/hojas-calidad.js al pedir la hoja.
-- ============================================================

BEGIN;

ALTER TABLE hojas_calidad ADD COLUMN IF NOT EXISTS marcas jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN hojas_calidad.marcas IS
  'Casillas que el inspector cambió respecto del modelo: { "número de punto": "ok" | "x" | "" }. Lo que no está sale como manda CC_MODELOS.';

COMMIT;
