-- ============================================================
--  008 · HUELLA DE CADA FOTO, PARA HALLAR LAS REPETIDAS
--  Correr en el SQL editor (después de 007).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Los técnicos suben la MISMA foto en carros distintos (o en el ANTES y el
--  DESPUÉS del mismo carro). Medido el 2026-10-21 sobre registro/2026-10/:
--  1 794 fotos, 463 eran copia de otra, en 154 de 191 carros. Las fotos están
--  en R2 y R2 no sabe comparar: hace falta guardar algo comparable de cada una.
--
--  La huella es un dHash de 256 bits (lib/image-optimize.js · huellaImagen):
--  la foto en 17×16 grises, un bit por "este píxel es más claro que el de la
--  derecha". La misma foto recomprimida o reenviada por WhatsApp a otro tamaño
--  queda a 0-16 bits de distancia; dos fotos distintas, aunque sean del mismo
--  manómetro, a 28 o más. Las fotos tapadas o borrosas (todo un color) también
--  salen "iguales" entre sí: tampoco sirven, así que está bien que salten.
--
--  Quién escribe: el servidor, al subir cada foto de registro o calidad
--  (r2UploadOne), y scripts/fotos-huella-backfill.js para las anteriores.
--  La clave es la de R2: volver a subir una casilla reemplaza su fila.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fotos_huella (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave               text NOT NULL UNIQUE,
  vin                 text NOT NULL,
  slot                text NOT NULL,
  huella              bit(256) NOT NULL,
  subido_por          text,
  subido_por_user_id  uuid REFERENCES usuarios(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fotos_huella_vin_idx ON fotos_huella (vin);

ALTER TABLE fotos_huella ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE fotos_huella IS
  'Huella visual (dHash 256 bits) de cada foto de registro/calidad en R2, para hallar fotos repetidas. La escribe el servidor al subir (r2UploadOne) y scripts/fotos-huella-backfill.js.';
COMMENT ON COLUMN fotos_huella.clave IS 'Clave del objeto en R2 (registro/AAAA-MM/VIN/slot.jpg).';
COMMENT ON COLUMN fotos_huella.slot IS 'Casilla de la foto: comp_1, sold_sensor_antes, calidad_2…';
COMMENT ON COLUMN fotos_huella.huella IS 'dHash 16×16: bits distintos entre dos huellas = cuán distintas son las fotos (≤16 = la misma).';
COMMENT ON COLUMN fotos_huella.subido_por IS 'Correo de quien subió la foto (el mismo del metadato subido-por de R2).';
COMMENT ON COLUMN fotos_huella.created_at IS 'Cuándo se subió la foto (para las del backfill, la fecha del objeto en R2).';

DROP TRIGGER IF EXISTS trg_user_ids ON fotos_huella;
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON fotos_huella FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('subido_por','subido_por_user_id');

-- Para cada foto del VIN, las OTRAS fotos que se le parecen. No cuenta la
-- misma casilla del mismo carro en otro mes: es la foto vuelta a subir.
CREATE OR REPLACE FUNCTION glp_fotos_repetidas(p_vin text, p_umbral int DEFAULT 16)
RETURNS TABLE (
  clave            text,
  slot             text,
  igual_clave      text,
  igual_vin        text,
  igual_slot       text,
  igual_subido_por text,
  igual_nombre     text,
  igual_created_at timestamptz,
  distancia        int
)
LANGUAGE sql STABLE
AS $$
  SELECT f.clave, f.slot, g.clave, g.vin, g.slot, g.subido_por, u.nombre, g.created_at,
         bit_count(f.huella # g.huella)::int
  FROM fotos_huella f
  JOIN fotos_huella g
    ON g.clave <> f.clave
   AND NOT (g.vin = f.vin AND g.slot = f.slot)
   AND bit_count(f.huella # g.huella) <= p_umbral
  LEFT JOIN usuarios u ON u.id = g.subido_por_user_id
  WHERE f.vin = upper(btrim(p_vin))
  ORDER BY f.clave, 9, g.created_at
$$;

REVOKE EXECUTE ON FUNCTION glp_fotos_repetidas(text, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION glp_fotos_repetidas(text, int) TO service_role;

COMMIT;
