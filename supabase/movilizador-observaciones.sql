-- ============================================================
--  MOVILIZADOR · OBSERVACIONES DE LA LISTA DEL DÍA
--  Ejecutar una vez en el SQL editor de Supabase.
-- ============================================================
--
--  Por qué existe
--  --------------
--  La lista del día trae VINs que el movilizador todavía no ha traído al
--  taller, y a veces no es descuido: el carro está desarmado, lo tiene otra
--  área o está en otra zona del patio. Sin un sitio donde anotarlo, cada
--  turno volvía a preguntar por el mismo carro.
--
--  UNA fila por VIN: la nota es el estado de ahora ("desarmado"), no un
--  historial. Escribir de nuevo la reemplaza; dejarla vacía la borra.
--
--  No se guarda en `movilizador_traslados` porque ahí una fila significa
--  "el carro ya ingresó": anotar algo sobre un pendiente lo sacaría de la
--  lista. Tampoco en `lista_diaria_activa`, que la reescribe la sincronización
--  con la hoja cada 10 minutos.

CREATE TABLE IF NOT EXISTS movilizador_observaciones (
  vin              TEXT         PRIMARY KEY,
  texto            TEXT         NOT NULL DEFAULT '',
  actualizado_por  TEXT         NOT NULL DEFAULT '',
  actualizado_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- RLS encendido y SIN políticas: solo el service_role (el servidor) lee y
-- escribe. A diferencia de las tablas viejas, aquí la anon key del bundle no
-- puede tocar nada. Ver routes/movilizador.js.
ALTER TABLE movilizador_observaciones ENABLE ROW LEVEL SECURITY;
