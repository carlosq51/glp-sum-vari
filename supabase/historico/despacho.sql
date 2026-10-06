-- ============================================================
--  GLP-UI  ·  MÓDULO DESPACHO  (asistencia + asignación dirigida)
--  Fase 1 — cimientos. Generado: 2026-08-06.
--
--  AISLAMIENTO: este archivo SOLO crea objetos nuevos. No altera
--  ninguna tabla existente ni ningún flujo de producción. Mientras
--  DESPACHO_MODO = 'OFF' el sistema actual se comporta idéntico.
--
--  Ejecutar en el SQL Editor de Supabase cuando se quiera habilitar
--  el desarrollo del módulo. Es idempotente (IF NOT EXISTS).
-- ============================================================

-- ────────────────────────────────────────────
--  ENUMS
-- ────────────────────────────────────────────

-- Máquina de estados del técnico dentro de una jornada:
--   FUERA      → no ha marcado ingreso, o ya marcó salida
--   PRESENTE   → marcó ingreso pero aún no es elegible (no arranca el turno)
--   DISPONIBLE → elegible para recibir vehículo
--   OCUPADO    → tiene al menos un vehículo asignado en curso
--   PAUSA      → presente pero no asignable (comida, permiso, reunión)
DO $$ BEGIN
  CREATE TYPE estado_tecnico AS ENUM ('FUERA','PRESENTE','DISPONIBLE','OCUPADO','PAUSA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipo de marca en la bitácora de asistencia.
--   INGRESO / SALIDA        → cruce de la puerta del taller
--   PAUSA_INI / PAUSA_FIN   → suspensión temporal de elegibilidad
--   CIERRE_AUTO             → salida sintética generada al cerrar la jornada
DO $$ BEGIN
  CREATE TYPE tipo_marca AS ENUM ('INGRESO','SALIDA','PAUSA_INI','PAUSA_FIN','CIERRE_AUTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cómo se registró la marca (para auditar marcas por terceros).
DO $$ BEGIN
  CREATE TYPE origen_marca AS ENUM ('QR','MANUAL_SUPERVISOR','AUTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ciclo de vida de una propuesta de asignación.
--   SOMBRA     → modo sombra: se registró lo que el motor habría asignado,
--                nunca se mostró a nadie. Es el estado terminal en Fase 3.
--   PROPUESTA  → esperando confirmación del supervisor
--   CONFIRMADA → publicada en la TV, notificada al técnico
--   RECHAZADA  → el supervisor o el técnico la descartó (con motivo)
--   PERMUTADA  → reemplazada por otra propuesta (con motivo)
--   EXPIRADA   → venció sin decisión, o el vehículo/técnico dejó de ser elegible
DO $$ BEGIN
  CREATE TYPE estado_propuesta AS ENUM
    ('SOMBRA','PROPUESTA','CONFIRMADA','RECHAZADA','PERMUTADA','EXPIRADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  JORNADA
--  La jornada operativa corre 06:00 → 05:00 del día siguiente,
--  en hora Perú (America/Lima, UTC-5 fijo, sin horario de verano).
--  Un evento a las 02:00 del martes pertenece a la jornada del lunes.
--
--  Se marca IMMUTABLE para poder usarla en columnas generadas e índices.
--  Estrictamente, `AT TIME ZONE` es STABLE (depende de la tzdata), así que
--  esto es una concesión deliberada: es segura porque Perú es UTC-5 fijo
--  sin horario de verano. Si el país adoptara DST, habría que recalcular
--  las columnas generadas.
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION glp_jornada_fecha(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  -- Restar 6 h a la hora local desplaza el corte de medianoche a las 06:00.
  SELECT ((ts AT TIME ZONE 'America/Lima') - INTERVAL '6 hours')::DATE;
$$;

-- ────────────────────────────────────────────
--  1. ASISTENCIA_MARCAS  (bitácora append-only)
--
--  NUNCA se borra ni se actualiza. La "limpieza diaria" del registro
--  es la partición por jornada_fecha, no un DELETE: el histórico
--  alimenta el modelo de emparejamiento y las métricas de ausentismo.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_marcas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES usuarios(id),
  tipo           tipo_marca    NOT NULL,
  origen         origen_marca  NOT NULL DEFAULT 'QR',
  ts             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  jornada_fecha  DATE          GENERATED ALWAYS AS (glp_jornada_fecha(ts)) STORED,

  -- Anti-replay del QR rotativo: la TV emite un token por ventana de N
  -- segundos; token_slot es el número de ventana. El índice único impide
  -- que dos técnicos usen la misma captura de pantalla del mismo slot.
  token_slot     BIGINT,

  -- Quién registró la marca. Si origen = MANUAL_SUPERVISOR, este es el
  -- supervisor, no el técnico: así queda auditado quién marcó por quién.
  registrado_por UUID          REFERENCES usuarios(id),
  motivo         TEXT          NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asis_jornada ON asistencia_marcas (jornada_fecha, user_id);
CREATE INDEX IF NOT EXISTS idx_asis_user_ts ON asistencia_marcas (user_id, ts DESC);

-- Un técnico no puede consumir DOS VECES el mismo código, pero varios
-- técnicos sí pueden usar el mismo: todos los que están frente a la pantalla
-- ven el mismo QR. Hacerlo único solo por token_slot dejaría marcar a una
-- sola persona por ventana y trancaría la fila de la mañana.
CREATE UNIQUE INDEX IF NOT EXISTS idx_asis_token_slot
  ON asistencia_marcas (token_slot, user_id)
  WHERE token_slot IS NOT NULL;

-- ────────────────────────────────────────────
--  2. ASISTENCIA_JORNADA  (estado derivado, 1 fila por técnico/jornada)
--
--  Proyección materializada de asistencia_marcas para no recalcular la
--  máquina de estados en cada request. Se reconstruye desde la bitácora
--  si alguna vez se corrompe — asistencia_marcas es la fuente de verdad.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_jornada (
  jornada_fecha    DATE            NOT NULL,
  user_id          UUID            NOT NULL REFERENCES usuarios(id),
  estado           estado_tecnico  NOT NULL DEFAULT 'FUERA',
  ingreso_at       TIMESTAMPTZ,
  salida_at        TIMESTAMPTZ,
  -- true si la salida la puso el cierre automático nocturno y no el técnico.
  salida_auto      BOOLEAN         NOT NULL DEFAULT false,
  minutos_pausa    INTEGER         NOT NULL DEFAULT 0,
  pausa_desde      TIMESTAMPTZ,
  -- Contadores del día, para el criterio de equidad del motor de despacho.
  carros_asignados SMALLINT        NOT NULL DEFAULT 0,
  carros_completos SMALLINT        NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  PRIMARY KEY (jornada_fecha, user_id)
);

CREATE INDEX IF NOT EXISTS idx_asisj_estado
  ON asistencia_jornada (jornada_fecha, estado);

-- ────────────────────────────────────────────
--  3. DUPLAS DE TRABAJO
--
--  Dos técnicos del MISMO rol que trabajan juntos un carro. No es un concepto
--  nuevo: sup-duplas.js ya lo modela para el cierre del día (dos técnicos que
--  cumplieron su meta sacan un carro entero juntos, 0.5 para cada uno). Aquí
--  se generaliza para que pueda formarse en cualquier momento de la jornada.
--
--  Existe para resolver el acaparamiento: el motor asigna por UNIDAD DE
--  TRABAJO, y una unidad es un técnico solo o una dupla. Cada unidad ocupa
--  un solo puesto de carro a la vez, así que dos tanqueros juntos ya no
--  pueden retener dos zonas.
--
--  CRÉDITO POR TURNOS (no fracciones). Cada carro tiene UN responsable y le
--  cuenta entero; el responsable alterna carro a carro: el 1 para A, el 2
--  para B, el 3 para A… Sobre varios carros reparte igual que dar 0.5 a cada
--  uno, pero mantiene el carro completo como unidad medible, que es la regla
--  del negocio (medio carro no es medible).
--
--  El líder es solo quien PROPUSO la dupla y a quién se le habla; el
--  responsable del carro va rotando y puede ser cualquiera de los dos.
-- ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE estado_dupla AS ENUM ('PENDIENTE','ACTIVA','RECHAZADA','DISUELTA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS despacho_duplas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_fecha  DATE          NOT NULL DEFAULT glp_jornada_fecha(now()),
  rol_trabajo    rol_trabajo   NOT NULL,
  lider_user_id  UUID          NOT NULL REFERENCES usuarios(id),
  estado         estado_dupla  NOT NULL DEFAULT 'PENDIENTE',

  -- Alternancia del crédito: a quién le tocó el último carro. El siguiente
  -- va para el otro. Se guarda en vez de contar filas para que la rotación
  -- sobreviva a carros anulados o reasignados.
  ultimo_responsable_user_id UUID REFERENCES usuarios(id),
  carros_asignados           SMALLINT NOT NULL DEFAULT 0,

  propuesta_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  confirmada_at  TIMESTAMPTZ,
  disuelta_at    TIMESTAMPTZ,
  disuelta_por   UUID          REFERENCES usuarios(id),
  motivo         TEXT          NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_dupla_jornada ON despacho_duplas (jornada_fecha, estado);

-- Membresía normalizada. jornada_fecha y `activa` se repiten aquí a
-- propósito: son lo que permite el índice único de abajo.
CREATE TABLE IF NOT EXISTS despacho_dupla_miembros (
  dupla_id       UUID     NOT NULL REFERENCES despacho_duplas(id) ON DELETE CASCADE,
  user_id        UUID     NOT NULL REFERENCES usuarios(id),
  jornada_fecha  DATE     NOT NULL,
  activa         BOOLEAN  NOT NULL DEFAULT false,   -- true solo si la dupla está ACTIVA
  PRIMARY KEY (dupla_id, user_id)
);

-- Un técnico no puede estar en DOS duplas activas la misma jornada. Es la
-- garantía que sostiene todo el modelo: sin esto, alguien podría emparejarse
-- dos veces y volver a acaparar carros por la puerta de atrás.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dupla_miembro_unico
  ON despacho_dupla_miembros (jornada_fecha, user_id)
  WHERE activa;

CREATE INDEX IF NOT EXISTS idx_dupla_miembro_dupla ON despacho_dupla_miembros (dupla_id);

-- Máximo 2 miembros por dupla. Se valida también en la app, pero la BD es la
-- que no se puede saltar por un bug de la capa de arriba.
CREATE OR REPLACE FUNCTION glp_dupla_max_dos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM despacho_dupla_miembros WHERE dupla_id = NEW.dupla_id) > 2 THEN
    RAISE EXCEPTION 'Una dupla admite máximo 2 técnicos';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dupla_max_dos ON despacho_dupla_miembros;
CREATE TRIGGER trg_dupla_max_dos
  AFTER INSERT ON despacho_dupla_miembros
  FOR EACH ROW EXECUTE FUNCTION glp_dupla_max_dos();

-- ────────────────────────────────────────────
--  4. DESPACHO_PROPUESTAS
--
--  Una fila por asignación que el motor propone. En modo sombra nacen y
--  mueren como SOMBRA; en modo real pasan a PROPUESTA → CONFIRMADA.
--
--  El vehículo se identifica por VIN (no por work_order_id) porque la OT
--  puede no existir todavía cuando el movilizador mapea el carro.
--
--  El carro se modela como DOS filas (una MOTOR, una TANQUE) unidas por
--  carro_id: cuando un técnico termina antes que su compañero vuelve a la
--  cola por su cuenta, sin arrastrar la fila del otro.
--
--  OJO con el vocabulario: carro_id agrupa los DOS ROLES de un mismo carro.
--  unidad_dupla_id es otra cosa — apunta a despacho_duplas, la pareja del
--  MISMO rol que trabaja junta. Un carro puede tener ambas.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS despacho_propuestas (
  id             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_fecha  DATE              NOT NULL DEFAULT glp_jornada_fecha(now()),
  carro_id       UUID              NOT NULL DEFAULT gen_random_uuid(),
  vin            TEXT              NOT NULL,
  zona_id        SMALLINT,
  -- Quién trabaja. Si el puesto lo cubre una dupla, user_id es el RESPONSABLE
  -- del carro (el que se lleva el crédito por turno) y unidad_dupla_id dice
  -- con quién lo trabaja. Si es un técnico solo, unidad_dupla_id va NULL.
  user_id          UUID            NOT NULL REFERENCES usuarios(id),
  unidad_dupla_id  UUID            REFERENCES despacho_duplas(id),
  rol_trabajo    rol_trabajo       NOT NULL,
  estado         estado_propuesta  NOT NULL DEFAULT 'SOMBRA',

  -- Score total y desglose por criterio. El desglose NO es telemetría:
  -- se muestra en la TV como la razón de la asignación ("Zona 4 · su
  -- modelo más rápido"). Un algoritmo que no explica su decisión no se
  -- obedece.
  score          NUMERIC(6,3)      NOT NULL DEFAULT 0,
  score_detalle  JSONB             NOT NULL DEFAULT '{}'::jsonb,
  razon          TEXT              NOT NULL DEFAULT '',

  propuesta_at   TIMESTAMPTZ       NOT NULL DEFAULT now(),
  decidida_at    TIMESTAMPTZ,
  decidida_por   UUID              REFERENCES usuarios(id),
  motivo         TEXT              NOT NULL DEFAULT '',

  -- Si se confirmó, la asignación real que se creó a partir de esta
  -- propuesta. Permite medir cumplimiento: ¿lo confirmado se trabajó?
  asignacion_id  UUID              REFERENCES asignaciones(id),

  -- Modo sombra: qué eligió la realidad. Se rellena al cierre de jornada
  -- comparando contra asignaciones reales. Esta columna es el experimento.
  real_user_id   UUID              REFERENCES usuarios(id),
  acierto        BOOLEAN,

  created_at     TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prop_jornada ON despacho_propuestas (jornada_fecha, estado);
CREATE INDEX IF NOT EXISTS idx_prop_vin     ON despacho_propuestas (vin);
CREATE INDEX IF NOT EXISTS idx_prop_user    ON despacho_propuestas (user_id, jornada_fecha);
CREATE INDEX IF NOT EXISTS idx_prop_carro   ON despacho_propuestas (carro_id);
CREATE INDEX IF NOT EXISTS idx_prop_unidad  ON despacho_propuestas (unidad_dupla_id)
  WHERE unidad_dupla_id IS NOT NULL;

-- Un VIN no puede tener dos propuestas vivas para el mismo rol.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_viva
  ON despacho_propuestas (vin, rol_trabajo)
  WHERE estado IN ('PROPUESTA','CONFIRMADA');

-- ────────────────────────────────────────────
--  5. DESPACHO_POOL_SNAPSHOT
--
--  Foto del pool de vehículos asignables en cada corrida del motor.
--  Sirve para depurar por qué el motor no asignó nada ("no había carros
--  elegibles" vs. "no había técnicos libres") sin tener que reconstruir
--  el estado del taller a posteriori.
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS despacho_pool_snapshot (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_fecha   DATE         NOT NULL DEFAULT glp_jornada_fecha(now()),
  ts              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  vins_elegibles  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  -- VINs descartados con su motivo: {"LSJ...": "SIN_OT", "LSJ...": "RAMAL_PENDIENTE"}
  vins_excluidos  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  tecnicos_libres JSONB        NOT NULL DEFAULT '[]'::jsonb,
  propuestas_gen  SMALLINT     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pool_jornada ON despacho_pool_snapshot (jornada_fecha, ts DESC);

-- ────────────────────────────────────────────
--  6. RLS  (mismo criterio que el resto del esquema: el backend usa
--     service_role y es quien autoriza; la BD no filtra por usuario)
-- ────────────────────────────────────────────
ALTER TABLE asistencia_marcas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_jornada       ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_propuestas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_pool_snapshot   ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_duplas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_dupla_miembros  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_full_access" ON despacho_duplas         FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON despacho_dupla_miembros FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_full_access" ON asistencia_marcas      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON asistencia_jornada     FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON despacho_propuestas    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON despacho_pool_snapshot FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  7. FLAGS DE CONFIGURACIÓN
--
--  DESPACHO_MODO es el kill switch del módulo entero:
--    OFF     → nada corre. El taller opera exactamente como hoy.
--    SOMBRA  → el motor calcula y registra, nadie lo ve. (Fase 3)
--    REAL    → propuestas visibles, supervisor confirma, TV publica. (Fase 5)
--
--  Se insertan en OFF a propósito: aplicar esta migración no enciende nada.
-- ────────────────────────────────────────────
INSERT INTO app_config (key, value) VALUES
  ('DESPACHO_MODO',            'OFF'),
  -- Jornada operativa (hora Perú). Debe coincidir con glp_jornada_fecha().
  ('DESPACHO_JORNADA_INICIO',  '06:00'),
  ('DESPACHO_TURNO_INICIO',    '07:00'),  -- desde aquí se reparte trabajo
  ('DESPACHO_JORNADA_FIN',     '05:00'),
  -- QR rotativo de la TV: duración de cada ventana de token, en segundos.
  ('DESPACHO_QR_VENTANA_SEG',  '300'),
  -- '1' = QR fijo, para el taller que todavía no tiene la TV montada: el
  -- código deja de rotar y el papel impreso vale para entrada y salida. La
  -- marca deja de probar presencia física — volver a '0' al montar la TV.
  ('DESPACHO_QR_ESTATICO',     '0'),
  -- Minutos que una propuesta espera confirmación antes de EXPIRAR.
  ('DESPACHO_TTL_PROPUESTA_MIN', '10'),
  -- Cada cuánto corre el motor de despacho, en segundos.
  ('DESPACHO_INTERVALO_SEG',   '60')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────
--  8. PAUSAS CON DURACIÓN
--
--  Única modificación a una tabla existente en todo el módulo: una columna
--  nullable en `asignaciones`. Sin default y sin uso fuera del despacho, así
--  que el flujo actual no la ve.
--
--  Guarda hasta cuándo dura una pausa puesta por el supervisor (5/10/15 min).
--  NULL con estado PAUSADO = pausa indefinida, que es el comportamiento que ya
--  existía. El servidor reanuda al vencer, no el celular del técnico: el
--  auto-resume del cliente depende de que la app esté abierta, y no lo está.
-- ────────────────────────────────────────────
ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS pausa_hasta TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_asg_pausa_hasta
  ON asignaciones (pausa_hasta)
  WHERE pausa_hasta IS NOT NULL;

-- ────────────────────────────────────────────
--  9. MÓDULO DE ACCESO
--
--  'DESPACHO' entra al enum modulo para poder darlo por usuario_modulos
--  a una sola persona durante el desarrollo, sin exponerlo al resto.
-- ────────────────────────────────────────────
-- Va a nivel superior: ALTER TYPE ... ADD VALUE no corre dentro de un
-- bloque DO/función. Ejecutar esta sentencia sola si el editor la agrupa.
ALTER TYPE modulo ADD VALUE IF NOT EXISTS 'DESPACHO';

-- ============================================================
--  ROLLBACK (para desarrollo — destruye los datos del módulo)
-- ============================================================
-- DROP TABLE IF EXISTS despacho_pool_snapshot, despacho_propuestas,
--                      despacho_dupla_miembros, despacho_duplas,
--                      asistencia_jornada, asistencia_marcas CASCADE;
-- DROP FUNCTION IF EXISTS glp_jornada_fecha(TIMESTAMPTZ), glp_dupla_max_dos();
-- DROP TYPE IF EXISTS estado_propuesta, origen_marca, tipo_marca, estado_tecnico, estado_dupla;
-- DELETE FROM app_config WHERE key LIKE 'DESPACHO_%';
-- (el valor 'DESPACHO' del enum modulo no se puede quitar sin recrear el tipo)
