-- ============================================================
--  PRODUCCIÓN · HORAS EXTRA DEL DÍA
--  Ejecutar una vez en el SQL editor de Supabase.
-- ============================================================
--
--  Por qué existe
--  --------------
--  La proyección del LIVE (lib/proyeccion.js) estima los carros del turno
--  normal con la gente que marcó asistencia, pero lo que sale después de las
--  16:30 depende de QUIÉN se queda y HASTA CUÁNDO, y eso no lo sabe nadie más
--  que el admin: casi ningún técnico marca su salida real, así que la
--  asistencia no sirve para deducirlo.
--
--  UNA fila por técnico y jornada: es el plan de hoy ("Pepe se queda hasta
--  las 19:30"), no un historial. Escribir de nuevo lo reemplaza; quitarlo
--  borra la fila.
--
--  `hasta` es texto HH:MM y no un timestamptz porque puede ser madrugada del
--  día siguiente (01:00) y sigue siendo de ESTA jornada: el servidor lo
--  interpreta sobre la jornada, igual que los cortes del LIVE.

CREATE TABLE IF NOT EXISTS produccion_horas_extra (
  jornada_fecha    DATE         NOT NULL,
  user_id          UUID         NOT NULL REFERENCES usuarios(id),
  hasta            TEXT         NOT NULL,
  actualizado_por  TEXT         NOT NULL DEFAULT '',
  actualizado_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (jornada_fecha, user_id)
);

-- RLS encendido y SIN políticas: solo el service_role (el servidor) lee y
-- escribe. La anon key del bundle no puede tocar nada. Ver routes/produccion.js.
ALTER TABLE produccion_horas_extra ENABLE ROW LEVEL SECURITY;
