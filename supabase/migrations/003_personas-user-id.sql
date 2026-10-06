-- ============================================================
--  003 · QUIÉN HIZO CADA COSA: user_id AL LADO DE CADA PERSONA-TEXTO
--  Fase 4 del orden de la base. Correr en el SQL editor (después de 002).
-- ============================================================
--
--  Por qué existe
--  --------------
--  Unas 20 columnas guardan a la persona como TEXTO —a veces el nombre,
--  a veces el correo— en vez de su id: incidencias.tecnico,
--  work_orders.conf_by, movilizador_traslados.trasladado_por, etc. Eso
--  impide cruzar por técnico (un "JOSE INOÑAN" y un "INOÑAN JOSE" son dos
--  personas para un GROUP BY) y deja el historial con el nombre viejo si
--  alguien se renombra.
--
--  Cada una gana una columna *_user_id que apunta a usuarios. Y para no
--  tocar los ~20 sitios del código que escriben esos textos, la base la
--  rellena sola con un trigger: al insertar o al cambiar el texto, busca a
--  la persona (glp_usuario_id) y guarda su id. El texto se queda tal cual,
--  como histórico de lo que se escribió.
--
--  Cómo se empareja (glp_usuario_id): primero por correo exacto; si no,
--  por nombre comparando las PALABRAS sin importar orden ni mayúsculas
--  ("JOSE INOÑAN" = "Inoñan José"... salvo tildes distintas). Si el nombre
--  coincide con más de una persona, no adivina: deja NULL.
--
--  Al escribir esto, el 99,8 % de las filas con texto se emparejaron. Las
--  que no: "RONDOY LEYCESTER" (17 incidencias, el usuario se llama
--  "RONDOY LEYSESTER": se corrige a mano abajo) y un cerrado_por
--  "automático" en ramal_lotes, que no es una persona.

BEGIN;

-- ── 1. Buscar a una persona por correo o nombre ──
CREATE OR REPLACE FUNCTION glp_usuario_id(quien text)
RETURNS uuid
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  q        text := lower(btrim(coalesce(quien, '')));
  palabras text;
  ids      uuid[];
BEGIN
  IF q = '' THEN RETURN NULL; END IF;

  SELECT array_agg(id) INTO ids FROM usuarios WHERE lower(email) = q;
  IF array_length(ids, 1) = 1 THEN RETURN ids[1]; END IF;

  SELECT string_agg(w, ' ' ORDER BY w) INTO palabras
  FROM regexp_split_to_table(q, '\s+') AS w;

  SELECT array_agg(u.id) INTO ids
  FROM usuarios u
  WHERE (SELECT string_agg(w, ' ' ORDER BY w)
         FROM regexp_split_to_table(lower(btrim(u.nombre)), '\s+') AS w) = palabras;
  IF array_length(ids, 1) = 1 THEN RETURN ids[1]; END IF;

  RETURN NULL;   -- nadie, o más de uno: no se adivina
END $$;

-- ── 2. Trigger genérico: argumentos en pares (columna_texto, columna_id) ──
--  Rellena la columna id cuando está vacía, o la recalcula si el texto
--  cambió en un UPDATE. Si el código ya mandó el id, se respeta.
CREATE OR REPLACE FUNCTION glp_rellenar_user_ids_()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  i       int;
  nuevo   jsonb := to_jsonb(NEW);
  viejo   jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  cambios jsonb := '{}'::jsonb;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 BY 2 LOOP
    IF coalesce(nuevo->>TG_ARGV[i], '') <> ''
       AND (nuevo->>TG_ARGV[i+1] IS NULL
            -- cambió el texto y el código NO mandó un id nuevo con él
            OR (viejo IS NOT NULL
                AND nuevo->>TG_ARGV[i]   IS DISTINCT FROM viejo->>TG_ARGV[i]
                AND nuevo->>TG_ARGV[i+1] IS NOT DISTINCT FROM viejo->>TG_ARGV[i+1]))
    THEN
      cambios := cambios || jsonb_build_object(TG_ARGV[i+1], glp_usuario_id(nuevo->>TG_ARGV[i]));
    END IF;
  END LOOP;
  IF cambios <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, cambios);
  END IF;
  RETURN NEW;
END $$;

-- ── 3. Columnas nuevas (ON DELETE SET NULL: el historial no impide borrar a nadie) ──
ALTER TABLE incidencias
  ADD COLUMN IF NOT EXISTS tecnico_user_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registrado_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resuelta_por_user_id   uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE solicitudes_ramal
  ADD COLUMN IF NOT EXISTS tecnico_user_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL;
  -- entregado_por_user_id ya existía; solo se rellena lo que faltaba.
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS conf_by_user_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE movilizador_traslados
  ADD COLUMN IF NOT EXISTS trasladado_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entregado_por_user_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE movilizador_observaciones
  ADD COLUMN IF NOT EXISTS actualizado_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE conversion_zonas
  ADD COLUMN IF NOT EXISTS registrado_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE zona_libre
  ADD COLUMN IF NOT EXISTS registrado_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE zonas_historial
  ADD COLUMN IF NOT EXISTS usuario_user_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE informes_taller
  ADD COLUMN IF NOT EXISTS creado_por_user_id     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impreso_por_user_id    uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ramal_lotes
  ADD COLUMN IF NOT EXISTS creado_por_user_id          uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_inicio_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_fin_por_user_id    uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cerrado_por_user_id         uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ramal_repartos
  ADD COLUMN IF NOT EXISTS asignado_por_user_id   uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ramal_movimientos
  ADD COLUMN IF NOT EXISTS created_by_user_id     uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE inventario_tecnico
  ADD COLUMN IF NOT EXISTS tomado_por_user_id     uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE inventario_movimientos
  ADD COLUMN IF NOT EXISTS hecho_por_user_id      uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE produccion_horas_extra
  ADD COLUMN IF NOT EXISTS actualizado_por_user_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id                uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- ── 4. Rellenar lo que ya existe ──
--  informes_taller tiene un trigger que toca updated_at en cada UPDATE; se
--  apaga mientras se rellena para no fingir que alguien editó los informes.
ALTER TABLE informes_taller DISABLE TRIGGER informes_taller_touch;

UPDATE incidencias SET tecnico_user_id        = glp_usuario_id(tecnico)        WHERE tecnico_user_id IS NULL;
UPDATE incidencias SET registrado_por_user_id = glp_usuario_id(registrado_por) WHERE registrado_por_user_id IS NULL;
UPDATE incidencias SET resuelta_por_user_id   = glp_usuario_id(resuelta_por)   WHERE resuelta_por_user_id IS NULL AND resuelta_por <> '';
-- El usuario se llama "RONDOY LEYSESTER"; 17 incidencias lo escribieron con C.
UPDATE incidencias SET tecnico_user_id = u.id
FROM usuarios u
WHERE incidencias.tecnico_user_id IS NULL
  AND upper(btrim(incidencias.tecnico)) = 'RONDOY LEYCESTER'
  AND upper(btrim(u.nombre)) = 'RONDOY LEYSESTER';

UPDATE solicitudes_ramal SET tecnico_user_id       = glp_usuario_id(coalesce(nullif(tecnico_email, ''), tecnico_nombre)) WHERE tecnico_user_id IS NULL;
UPDATE solicitudes_ramal SET entregado_por_user_id = glp_usuario_id(entregado_por) WHERE entregado_por_user_id IS NULL AND entregado_por <> '';
UPDATE work_orders           SET conf_by_user_id        = glp_usuario_id(conf_by)        WHERE conf_by_user_id IS NULL AND conf_by <> '';
UPDATE movilizador_traslados SET trasladado_por_user_id = glp_usuario_id(trasladado_por) WHERE trasladado_por_user_id IS NULL AND trasladado_por <> '';
UPDATE movilizador_traslados SET entregado_por_user_id  = glp_usuario_id(entregado_por)  WHERE entregado_por_user_id IS NULL AND entregado_por <> '';
UPDATE movilizador_observaciones SET actualizado_por_user_id = glp_usuario_id(actualizado_por) WHERE actualizado_por_user_id IS NULL;
UPDATE conversion_zonas SET registrado_por_user_id = glp_usuario_id(registrado_por) WHERE registrado_por_user_id IS NULL AND registrado_por <> '';
UPDATE zona_libre       SET registrado_por_user_id = glp_usuario_id(registrado_por) WHERE registrado_por_user_id IS NULL AND registrado_por <> '';
UPDATE zonas_historial  SET usuario_user_id        = glp_usuario_id(usuario_email)  WHERE usuario_user_id IS NULL AND usuario_email <> '';
UPDATE informes_taller  SET creado_por_user_id     = glp_usuario_id(creado_por)     WHERE creado_por_user_id IS NULL;
UPDATE informes_taller  SET impreso_por_user_id    = glp_usuario_id(impreso_por)    WHERE impreso_por_user_id IS NULL AND impreso_por <> '';
UPDATE ramal_lotes SET creado_por_user_id          = glp_usuario_id(creado_por)          WHERE creado_por_user_id IS NULL;
UPDATE ramal_lotes SET revision_inicio_por_user_id = glp_usuario_id(revision_inicio_por) WHERE revision_inicio_por_user_id IS NULL;
UPDATE ramal_lotes SET revision_fin_por_user_id    = glp_usuario_id(revision_fin_por)    WHERE revision_fin_por_user_id IS NULL;
UPDATE ramal_lotes SET cerrado_por_user_id         = glp_usuario_id(cerrado_por)         WHERE cerrado_por_user_id IS NULL;
UPDATE ramal_repartos         SET asignado_por_user_id    = glp_usuario_id(asignado_por)    WHERE asignado_por_user_id IS NULL;
UPDATE ramal_movimientos      SET created_by_user_id      = glp_usuario_id(created_by)      WHERE created_by_user_id IS NULL;
UPDATE inventario_tecnico     SET tomado_por_user_id      = glp_usuario_id(tomado_por)      WHERE tomado_por_user_id IS NULL AND tomado_por <> '';
UPDATE inventario_movimientos SET hecho_por_user_id       = glp_usuario_id(hecho_por)       WHERE hecho_por_user_id IS NULL AND hecho_por <> '';
UPDATE produccion_horas_extra SET actualizado_por_user_id = glp_usuario_id(actualizado_por) WHERE actualizado_por_user_id IS NULL;
UPDATE push_subscriptions     SET user_id                 = glp_usuario_id(email)           WHERE user_id IS NULL;

ALTER TABLE informes_taller ENABLE TRIGGER informes_taller_touch;

-- ── 5. Y de aquí en adelante, la base los mantiene sola ──
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON incidencias FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('tecnico','tecnico_user_id', 'registrado_por','registrado_por_user_id', 'resuelta_por','resuelta_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON solicitudes_ramal FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('tecnico_email','tecnico_user_id', 'entregado_por','entregado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON work_orders FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('conf_by','conf_by_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON movilizador_traslados FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('trasladado_por','trasladado_por_user_id', 'entregado_por','entregado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON movilizador_observaciones FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('actualizado_por','actualizado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON conversion_zonas FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('registrado_por','registrado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON zona_libre FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('registrado_por','registrado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT ON zonas_historial FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('usuario_email','usuario_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON informes_taller FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('creado_por','creado_por_user_id', 'impreso_por','impreso_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON ramal_lotes FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('creado_por','creado_por_user_id', 'revision_inicio_por','revision_inicio_por_user_id',
                                          'revision_fin_por','revision_fin_por_user_id', 'cerrado_por','cerrado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON ramal_repartos FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('asignado_por','asignado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT ON ramal_movimientos FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('created_by','created_by_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON inventario_tecnico FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('tomado_por','tomado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT ON inventario_movimientos FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('hecho_por','hecho_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON produccion_horas_extra FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('actualizado_por','actualizado_por_user_id');
CREATE TRIGGER trg_user_ids BEFORE INSERT OR UPDATE ON push_subscriptions FOR EACH ROW
  EXECUTE FUNCTION glp_rellenar_user_ids_('email','user_id');

-- Las funciones nuevas: solo para el servidor (la 002 ya cerró PUBLIC).
REVOKE EXECUTE ON FUNCTION glp_usuario_id(text), glp_rellenar_user_ids_() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION glp_usuario_id(text), glp_rellenar_user_ids_() TO service_role;

COMMIT;

-- Verificación: cuántas filas con texto quedaron sin id (debería ser ~0).
--   SELECT count(*) FROM incidencias WHERE tecnico_user_id IS NULL;       -- 0
--   SELECT count(*) FROM work_orders  WHERE conf_by <> '' AND conf_by_user_id IS NULL;  -- 0
