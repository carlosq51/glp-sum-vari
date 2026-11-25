-- ============================================================
--  016 · ZONAS DE EMERGENCIA E16, E17, E18
--  Correr en el SQL editor (después de 015).
-- ============================================================
--
--  Por qué existe
--  --------------
--  El taller se está desbordando de carros: las 15 plazas no alcanzan y lo
--  que no cabe termina en Zona Libre, donde no hay orden de plaza. Se agregan
--  tres plazas de emergencia ENCIMA de la Z15, con nombre E16, E17, E18.
--
--  Son plazas como las otras (un carro cada una, entran al reparto del motor
--  de despacho), no un área de desborde como Zona Libre.
--
--  Por qué se guardan como 116, 117, 118 y no 16, 17, 18
--  ------------------------------------------------------
--  El 16 ya significa "Zona Libre" en zonas_historial, en el despacho y en el
--  código. Usar 16 para E16 mezclaría la historia de los dos sitios. La app
--  muestra id − 100 con una E delante (lib/zonas-nombre.js y su copia
--  public/js/core/zona-nombre.js).
--
--  Qué cambia
--  ----------
--    · El CHECK de conversion_zonas pasa de 1..15 a 1..15 ∪ 116..118.
--    · Tres filas nuevas, vacías.
--  Las llaves de zonas_historial y despacho_propuestas apuntan a
--  conversion_zonas, así que las tres plazas nuevas quedan cubiertas solas.
-- ============================================================

BEGIN;

ALTER TABLE conversion_zonas DROP CONSTRAINT IF EXISTS conversion_zonas_zona_id_check;
ALTER TABLE conversion_zonas ADD CONSTRAINT conversion_zonas_zona_id_check
  CHECK ((zona_id >= 1 AND zona_id <= 15) OR (zona_id >= 116 AND zona_id <= 118));

INSERT INTO conversion_zonas (zona_id)
VALUES (116), (117), (118)
ON CONFLICT (zona_id) DO NOTHING;

COMMENT ON COLUMN conversion_zonas.zona_id IS
  'Plaza del taller. 1-15 = plazas normales; 116-118 = zonas de emergencia, se muestran como E16-E18 (id - 100). El 16 no es una plaza: es Zona Libre (tabla zona_libre).';

COMMIT;

-- Verificación:
--   SELECT zona_id FROM conversion_zonas ORDER BY zona_id;
--   → 1..15, 116, 117, 118 (18 filas).
