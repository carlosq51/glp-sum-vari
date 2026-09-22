-- ============================================================
--  GLP-UI  ·  INFORMES DE TALLER  (las 3 hojas que hoy van a mano)
--  Generado: 2026-09-21.
--
--  AISLAMIENTO: este archivo SOLO crea objetos nuevos. No altera
--  ninguna tabla existente ni ningún flujo de producción.
--
--  Ejecutar en el SQL Editor de Supabase. Es idempotente.
--
--  QUÉ GUARDA
--  Un informe = las tres hojas de un carro: Informe de Taller,
--  Lista de Chequeo y Registro de Producción. El técnico lo llena
--  desde el taller y en la oficina lo imprimen.
--
--  POR QUÉ UN JSONB Y NO 60 COLUMNAS
--  Los tres papeles son un formulario que cambia cuando la empresa
--  cambia el Excel: hoy son 32 puntos de chequeo, mañana 34. Con una
--  columna por casilla, cada cambio del papel sería una migración.
--  En `datos` va el formulario tal cual lo llenó el técnico, y fuera
--  quedan solo los campos por los que se BUSCA o se FILTRA.
-- ============================================================

-- ────────────────────────────────────────────
--  ENUM: ciclo de vida del informe
-- ────────────────────────────────────────────
--   BORRADOR → el técnico lo empezó pero no lo mandó
--   ENVIADO  → esperando en la cola de la oficina
--   IMPRESO  → ya salió por la impresora; sale de la cola
--   ANULADO  → se descartó (carro que no se entregó, duplicado…)
DO $$ BEGIN
  CREATE TYPE estado_informe AS ENUM ('BORRADOR','ENVIADO','IMPRESO','ANULADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  TABLA
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS informes_taller (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación del carro. Se sacan de la asignación, pero se copian
  -- aquí a propósito: el informe es un documento y tiene que seguir
  -- diciendo lo mismo aunque mañana cambie la OT o se borre el VIN.
  work_order_id   text        NOT NULL,
  vin             text        NOT NULL DEFAULT '',
  placa           text        NOT NULL DEFAULT '',

  estado          estado_informe NOT NULL DEFAULT 'ENVIADO',

  -- El formulario completo: tareas marcadas, batería, cilindros,
  -- observaciones, personas con sus horas y etapas. Ver la forma en
  -- public/js/views/informe/informe-taller.js (función datos_).
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Quién lo mandó. El email es la clave con la que la app identifica
  -- al usuario en todo el resto del sistema.
  creado_por      text        NOT NULL DEFAULT '',
  creado_nombre   text        NOT NULL DEFAULT '',

  -- Quién lo imprimió y cuándo. Sirve para responder "¿este papel de
  -- quién salió?" sin tener que preguntar en la oficina.
  impreso_por     text,
  impreso_at      timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
--  ÍNDICES
-- ────────────────────────────────────────────

-- La consulta que corre todo el día: la cola de la oficina, lo más
-- nuevo arriba. Es un índice parcial porque los IMPRESOS no se
-- consultan nunca desde la cola y no vale la pena indexarlos.
CREATE INDEX IF NOT EXISTS informes_taller_cola_idx
  ON informes_taller (created_at DESC)
  WHERE estado = 'ENVIADO';

-- Para "¿ya mandaron el informe de esta OT?" y para el histórico.
CREATE INDEX IF NOT EXISTS informes_taller_ot_idx
  ON informes_taller (work_order_id);

CREATE INDEX IF NOT EXISTS informes_taller_creador_idx
  ON informes_taller (creado_por, created_at DESC);

-- Una OT no debería tener dos informes vivos a la vez: si el técnico
-- manda dos por error, en la oficina no sabrían cuál imprimir. Los
-- anulados quedan fuera para poder rehacer uno descartado.
CREATE UNIQUE INDEX IF NOT EXISTS informes_taller_ot_vivo_idx
  ON informes_taller (work_order_id)
  WHERE estado IN ('BORRADOR','ENVIADO');

-- ────────────────────────────────────────────
--  updated_at automático
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION informes_taller_touch_() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS informes_taller_touch ON informes_taller;
CREATE TRIGGER informes_taller_touch
  BEFORE UPDATE ON informes_taller
  FOR EACH ROW EXECUTE FUNCTION informes_taller_touch_();

-- ────────────────────────────────────────────
--  RLS
-- ────────────────────────────────────────────
-- Igual que el resto de tablas del proyecto: la app entra siempre por
-- el backend con la service key, nunca desde el navegador. Dejar RLS
-- deshabilitado aquí es lo mismo que ya se hace en push_subscriptions.
ALTER TABLE informes_taller DISABLE ROW LEVEL SECURITY;
