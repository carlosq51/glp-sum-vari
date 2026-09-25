-- ============================================================
--  ZONAS · HISTORIAL DE MAPEO
--  Ejecutar una vez en el SQL editor de Supabase.
-- ============================================================
--
--  Por qué existe
--  --------------
--  `conversion_zonas` es UNA fila por plaza y solo guarda al ocupante de
--  ahora: `registrado_por` y `registrado_at` se sobrescriben con cada
--  asignación. Eso significa que el mapeo no deja rastro — en cuanto otro
--  carro entra en la plaza, quién puso al anterior desaparece.
--
--  El 25-09-2026 se preguntó quién había mapeado LVTDB21B7VH515110 en la
--  Zona 7. No se pudo responder: a las 09:05 esa plaza se re-registró con
--  LVTDB21B7VH515124 y el dato se perdió. El carro desplazado se quedó con
--  su OT abierta y sin plaza — un "carro fantasma" que el mapa ya no muestra
--  y que nadie sabe de dónde salió.
--
--  Esta tabla es el libro de actas del mapa: cada asignar / liberar /
--  desplazamiento escribe una fila y NADA la actualiza después. Es append
--  only a propósito — un historial que se puede editar no sirve de prueba.
--
--  Qué se guarda de cada movimiento
--  --------------------------------
--    · Quién: email, nombre y rol resueltos en el servidor contra `usuarios`,
--      no el texto que mandó el cliente. Ver identidadZona_() en routes/zonas.js.
--    · Qué carro y a qué plaza (zona_id 16 = Zona Libre).
--    · De dónde venía (`zona_anterior`) y a quién echó (`vin_relacionado`).
--
--  Un desplazamiento genera DOS filas: la ASIGNAR del que entra y una
--  DESPLAZADO a nombre del que sale. Sin la segunda, preguntar por el
--  historial del carro expulsado no devolvería nada — que es exactamente
--  el caso que motivó la tabla.

CREATE TABLE IF NOT EXISTS zonas_historial (
  id              BIGSERIAL    PRIMARY KEY,
  ocurrido_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- ASIGNAR · LIBERAR · DESPLAZADO
  accion          TEXT         NOT NULL,
  -- 1..15 plazas físicas, 16 = Zona Libre. Sin CHECK: si mañana hay 18
  -- plazas, el historial viejo tiene que seguir leyéndose.
  zona_id         SMALLINT,
  vin             TEXT         NOT NULL DEFAULT '',
  -- El otro carro implicado: al que se desplazó (en ASIGNAR) o el que
  -- desplazó (en DESPLAZADO).
  vin_relacionado TEXT         NOT NULL DEFAULT '',
  -- Plaza en la que estaba el VIN antes de este movimiento, si estaba en alguna.
  zona_anterior   SMALLINT,
  usuario_email   TEXT         NOT NULL DEFAULT '',
  usuario_nombre  TEXT         NOT NULL DEFAULT '',
  usuario_rol     TEXT         NOT NULL DEFAULT '',
  -- Vista desde la que se hizo (mapa, picker, movilizador…). Orientativo.
  origen          TEXT         NOT NULL DEFAULT ''
);

-- Las tres preguntas que se le hacen al historial: por carro, por plaza y
-- "qué pasó en el taller esta mañana".
CREATE INDEX IF NOT EXISTS idx_zh_vin    ON zonas_historial (vin, ocurrido_at DESC);
CREATE INDEX IF NOT EXISTS idx_zh_zona   ON zonas_historial (zona_id, ocurrido_at DESC);
CREATE INDEX IF NOT EXISTS idx_zh_fecha  ON zonas_historial (ocurrido_at DESC);

ALTER TABLE zonas_historial ENABLE ROW LEVEL SECURITY;

-- Solo el service_role escribe (el servidor). Nadie borra ni actualiza:
-- las políticas de UPDATE y DELETE no existen a propósito.
DROP POLICY IF EXISTS "service_insert" ON zonas_historial;
CREATE POLICY "service_insert" ON zonas_historial FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "service_select" ON zonas_historial;
CREATE POLICY "service_select" ON zonas_historial FOR SELECT USING (true);
