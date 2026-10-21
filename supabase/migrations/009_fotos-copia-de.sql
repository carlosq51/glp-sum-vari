-- ============================================================
--  009 · DE QUÉ FOTO ES COPIA CADA FOTO, Y EL % DE COPIAS PARA EL LIVE
--  Correr en el SQL editor (después de 008).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Con la 008 se puede preguntar "¿a qué se parece esta foto?", pero solo de
--  a un VIN: cada pregunta compara contra las 40 000 fotos. El LIVE quiere el
--  % de carros con fotos copiadas de la jornada, del mes y desde siempre, y
--  eso no se puede recalcular comparando todo en cada vistazo.
--
--  Así que la respuesta se guarda una vez: `copia_de` es la clave R2 de la
--  foto ANTERIOR a la que esta es igual. La pone el servidor al subir
--  (r2UploadOne) y scripts/fotos-huella-backfill.js para las anteriores. La
--  original queda en NULL: copiar es subir después, no haber sido copiado.
--
--  Los grupos son los de la app: "parámetros" es la pantalla de parámetros
--  (compresión 1-4, VIN, amperaje antes/después, voltaje, scan) y
--  "soldadura" las cuatro de soldadura. Calidad no entra: sus fotos las toma
--  el inspector, no el técnico.
-- ============================================================

BEGIN;

ALTER TABLE fotos_huella ADD COLUMN IF NOT EXISTS copia_de text;

COMMENT ON COLUMN fotos_huella.copia_de IS
  'Clave R2 de la foto subida ANTES a la que esta es igual (≤16 bits). NULL = no es copia. La escriben r2UploadOne y el backfill.';

CREATE INDEX IF NOT EXISTS fotos_huella_copias_idx
  ON fotos_huella (glp_jornada_fecha(created_at)) WHERE copia_de IS NOT NULL;

CREATE OR REPLACE FUNCTION glp_fotos_grupo(p_slot text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_slot IN ('comp_1','comp_2','comp_3','comp_4','vin','corr_pre','corr_post','voltaje','scan_carro') THEN 'parametros'
    WHEN p_slot IN ('sold_sensor_antes','sold_sensor_post','sold_cabina_antes','sold_cabina_post') THEN 'soldadura'
  END
$$;

-- % de copias en tres alcances, contados hasta la jornada pedida: esa
-- jornada, el mes de esa jornada y todo lo anterior. Un carro cuenta en la
-- jornada en que se subieron sus fotos.
CREATE OR REPLACE FUNCTION glp_fotos_copias_resumen(p_jornada date)
RETURNS TABLE (
  alcance          text,
  grupo            text,
  carros           int,
  carros_con_copia int,
  fotos            int,
  fotos_copiadas   int
)
LANGUAGE sql STABLE
AS $$
  WITH f AS (
    SELECT vin, copia_de, glp_jornada_fecha(created_at) AS jornada, glp_fotos_grupo(slot) AS grupo
    FROM fotos_huella
  ), a AS (
    SELECT 'general' AS alcance, * FROM f WHERE jornada <= p_jornada
    UNION ALL
    SELECT 'mes', * FROM f
    WHERE jornada <= p_jornada AND date_trunc('month', jornada) = date_trunc('month', p_jornada)
    UNION ALL
    SELECT 'jornada', * FROM f WHERE jornada = p_jornada
  )
  SELECT a.alcance, a.grupo,
         count(DISTINCT a.vin)::int,
         count(DISTINCT a.vin) FILTER (WHERE a.copia_de IS NOT NULL)::int,
         count(*)::int,
         count(*) FILTER (WHERE a.copia_de IS NOT NULL)::int
  FROM a
  WHERE a.grupo IS NOT NULL
  GROUP BY a.alcance, a.grupo
$$;

-- Las copias una por una, del mes de la jornada pedida (hasta esa jornada):
-- qué carro, qué foto, quién la subió y de qué carro salió.
CREATE OR REPLACE FUNCTION glp_fotos_copias_detalle(p_jornada date)
RETURNS TABLE (
  jornada          date,
  vin              text,
  slot             text,
  grupo            text,
  subido_por       text,
  nombre           text,
  igual_vin        text,
  igual_slot       text,
  igual_subido_por text,
  igual_nombre     text,
  created_at       timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT glp_jornada_fecha(f.created_at), f.vin, f.slot, glp_fotos_grupo(f.slot),
         f.subido_por, u.nombre, o.vin, o.slot, o.subido_por, uo.nombre, f.created_at
  FROM fotos_huella f
  LEFT JOIN fotos_huella o ON o.clave = f.copia_de
  LEFT JOIN usuarios u  ON u.id  = f.subido_por_user_id
  LEFT JOIN usuarios uo ON uo.id = o.subido_por_user_id
  WHERE f.copia_de IS NOT NULL
    AND glp_jornada_fecha(f.created_at) <= p_jornada
    AND date_trunc('month', glp_jornada_fecha(f.created_at)) = date_trunc('month', p_jornada)
    AND glp_fotos_grupo(f.slot) IS NOT NULL
  ORDER BY f.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION glp_fotos_grupo(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION glp_fotos_copias_resumen(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION glp_fotos_copias_detalle(date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION glp_fotos_grupo(text) TO service_role;
GRANT  EXECUTE ON FUNCTION glp_fotos_copias_resumen(date) TO service_role;
GRANT  EXECUTE ON FUNCTION glp_fotos_copias_detalle(date) TO service_role;

COMMIT;
