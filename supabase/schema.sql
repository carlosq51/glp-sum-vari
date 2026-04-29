-- ============================================================
--  GLP-UI  ·  Supabase (PostgreSQL) Schema
--  Migración desde Google Sheets
--  Generado: 2026-03-09
-- ============================================================

-- ────────────────────────────────────────────
--  ENUMS
-- ────────────────────────────────────────────
CREATE TYPE rol_usuario    AS ENUM ('TECNICO','SUPERVISOR','ADMIN','CALIDAD','MOVILIZADOR','RAMALERO');
CREATE TYPE especialidad   AS ENUM ('AMBOS','MOTOR','TANQUE');
CREATE TYPE modulo         AS ENUM ('TECNICO','RAMALERO','CALIDAD','MOVILIZADOR','SUPERVISOR','ADMIN');
CREATE TYPE tipo_ot        AS ENUM ('CONVERSION','CALIDAD','RAMALERO');
CREATE TYPE estado_general AS ENUM ('PENDIENTE','EN PROCESO','TRABAJANDO','FINALIZADO');
CREATE TYPE estado_actual  AS ENUM ('SIN_INICIAR','TRABAJANDO','PAUSADO','FINALIZADO');
CREATE TYPE rol_trabajo    AS ENUM ('MOTOR','TANQUE','CALIDAD','RAMALERO','MOVILIZADOR');
CREATE TYPE accion_evento  AS ENUM ('INICIO','PAUSA','REANUDAR','FIN','NOTA');
CREATE TYPE severidad      AS ENUM ('LEVE','MODERADA','CRITICA');
CREATE TYPE tipo_ramal     AS ENUM ('JETOUR','VOLKSWAGEN','KYC V3','KYC V5','KYC V7','KYC X5');

-- ────────────────────────────────────────────
--  1. VINS  (antes: LISTA DE VIN GLP)
-- ────────────────────────────────────────────
CREATE TABLE vins (
  vin                TEXT        PRIMARY KEY,
  modelo             TEXT,
  dua                TEXT,
  cliente            TEXT,
  reductor_asignado  TEXT        DEFAULT '',
  tanque_asignado    TEXT        DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vins_cliente ON vins (cliente);

-- ────────────────────────────────────────────
--  2. USUARIOS  (antes: USUARIOS)
-- ────────────────────────────────────────────
CREATE TABLE usuarios (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT           UNIQUE NOT NULL,
  nombre         TEXT           NOT NULL DEFAULT '',
  rol            rol_usuario    NOT NULL DEFAULT 'TECNICO',
  especialidad   especialidad   NOT NULL DEFAULT 'AMBOS',
  activo         BOOLEAN        NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ    DEFAULT now()
);

CREATE INDEX idx_usuarios_email  ON usuarios (email);
CREATE INDEX idx_usuarios_activo ON usuarios (activo) WHERE activo = true;

-- ────────────────────────────────────────────
--  2b. USUARIO_MODULOS  (normalizado de CSV)
--      antes: columna MODULOS = "TECNICO,RAMALERO,CALIDAD"
-- ────────────────────────────────────────────
CREATE TABLE usuario_modulos (
  user_id  UUID    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modulo   modulo  NOT NULL,
  PRIMARY KEY (user_id, modulo)
);

-- ────────────────────────────────────────────
--  3. WORK_ORDERS  (unifica CONV121 + CALIDAD1 + RAMALERO1)
--     TIPO_OT discrimina el tipo de OT
-- ────────────────────────────────────────────
CREATE TABLE work_orders (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_ot               tipo_ot        NOT NULL,
  -- VIN (CONVERSION / CALIDAD)
  vin                   TEXT           REFERENCES vins(vin),
  -- RAMALERO: no tiene VIN, tiene user_id + tipo_ramal
  user_id               UUID           REFERENCES usuarios(id),
  tipo_ramal            tipo_ramal,
  -- Campos comunes
  fecha_creacion        TIMESTAMPTZ    DEFAULT now(),
  estado_general        estado_general NOT NULL DEFAULT 'PENDIENTE',
  observaciones         TEXT           DEFAULT '',
  -- Equipos registrados (CONV / CALIDAD)
  tanque_registrado     TEXT           DEFAULT '',
  reductor_registrado   TEXT           DEFAULT '',
  -- Conformidad (solo CONVERSION)
  conf_ck1              BOOLEAN        DEFAULT false,
  conf_ck2              BOOLEAN        DEFAULT false,
  conf_ck3              BOOLEAN        DEFAULT false,
  conf_ck4              BOOLEAN        DEFAULT false,
  conf_ts               TIMESTAMPTZ,
  conf_by               TEXT,
  created_at            TIMESTAMPTZ    DEFAULT now()
);

-- Constraints
ALTER TABLE work_orders ADD CONSTRAINT chk_conv_has_vin
  CHECK (tipo_ot != 'CONVERSION' OR vin IS NOT NULL);
ALTER TABLE work_orders ADD CONSTRAINT chk_calidad_has_vin
  CHECK (tipo_ot != 'CALIDAD' OR vin IS NOT NULL);
ALTER TABLE work_orders ADD CONSTRAINT chk_ramalero_has_tipo
  CHECK (tipo_ot != 'RAMALERO' OR tipo_ramal IS NOT NULL);

CREATE INDEX idx_wo_vin      ON work_orders (vin)     WHERE vin IS NOT NULL;
CREATE INDEX idx_wo_tipo     ON work_orders (tipo_ot);
CREATE INDEX idx_wo_estado   ON work_orders (estado_general);
CREATE INDEX idx_wo_user     ON work_orders (user_id)  WHERE user_id IS NOT NULL;

-- ────────────────────────────────────────────
--  4. ASIGNACIONES  (antes: ASIGNACIONES)
-- ────────────────────────────────────────────
CREATE TABLE asignaciones (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id     UUID           NOT NULL REFERENCES work_orders(id),
  user_id           UUID           NOT NULL REFERENCES usuarios(id),
  tipo_ot           tipo_ot        NOT NULL,
  rol_trabajo       rol_trabajo    NOT NULL,
  activo            BOOLEAN        NOT NULL DEFAULT true,
  fecha_asignacion  TIMESTAMPTZ    DEFAULT now(),
  tiempo_trab_ms    BIGINT         NOT NULL DEFAULT 0,
  estado_actual     estado_actual  NOT NULL DEFAULT 'SIN_INICIAR',
  updated_at        TIMESTAMPTZ    DEFAULT now(),
  running_since     TIMESTAMPTZ,
  last_nota         TEXT           DEFAULT '',
  last_nota_ts      TIMESTAMPTZ
);

-- Solo 1 asignación activa por work_order + rol
CREATE UNIQUE INDEX idx_asg_active
  ON asignaciones (work_order_id, rol_trabajo)
  WHERE activo = true;

CREATE INDEX idx_asg_user     ON asignaciones (user_id);
CREATE INDEX idx_asg_estado   ON asignaciones (estado_actual);
CREATE INDEX idx_asg_updated  ON asignaciones (updated_at);

-- ────────────────────────────────────────────
--  5. EVENTOS  (antes: MARCA_EVENTOS)
-- ────────────────────────────────────────────
CREATE TABLE eventos (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  user_id        UUID           NOT NULL REFERENCES usuarios(id),
  work_order_id  UUID           NOT NULL REFERENCES work_orders(id),
  tipo_ot        tipo_ot        NOT NULL,
  rol_trabajo    rol_trabajo    NOT NULL,
  accion         accion_evento  NOT NULL,
  nota           TEXT           DEFAULT ''
);

CREATE INDEX idx_evt_wo   ON eventos (work_order_id);
CREATE INDEX idx_evt_user ON eventos (user_id);
CREATE INDEX idx_evt_ts   ON eventos (timestamp DESC);

-- ────────────────────────────────────────────
--  6. INCIDENCIAS  (antes: INCIDENCIAS)
--     Solo FOTO_FILE_ID — URLs se computan en la app
-- ────────────────────────────────────────────
CREATE TABLE incidencias (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_hora       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  mes              TEXT           NOT NULL,  -- 'yyyy-MM'
  work_order_id    UUID           REFERENCES work_orders(id),
  vin              TEXT           REFERENCES vins(vin),
  tecnico          TEXT           NOT NULL,
  tipo             severidad      NOT NULL,
  registrado_por   TEXT           NOT NULL,
  nota             TEXT           DEFAULT '',
  -- Solo file IDs (URLs se computan con driveUrls_)
  foto_file_id     TEXT           DEFAULT '',
  foto_folder_id   TEXT           DEFAULT '',
  foto_batch_id    TEXT           DEFAULT ''
);

CREATE INDEX idx_inc_vin  ON incidencias (vin) WHERE vin IS NOT NULL;
CREATE INDEX idx_inc_wo   ON incidencias (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_inc_mes  ON incidencias (mes);
CREATE INDEX idx_inc_tipo ON incidencias (tipo);

-- ────────────────────────────────────────────
--  7. SOLICITUDES_RAMAL
--     Técnico MOTOR solicita un ramal al RAMALERO.
-- ────────────────────────────────────────────
CREATE TYPE estado_solicitud_ramal AS ENUM ('PENDIENTE', 'ENTREGADO');

CREATE TABLE solicitudes_ramal (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  vin              TEXT             REFERENCES vins(vin),
  work_order_id    UUID             REFERENCES work_orders(id),
  tecnico_nombre   TEXT             NOT NULL DEFAULT '',
  tecnico_email    TEXT             NOT NULL DEFAULT '',
  nota             TEXT             DEFAULT '',
  estado           estado_solicitud_ramal NOT NULL DEFAULT 'PENDIENTE',
  entregado_at     TIMESTAMPTZ,
  entregado_por    TEXT             DEFAULT ''
);

CREATE INDEX idx_sol_ramal_estado ON solicitudes_ramal (estado);
CREATE INDEX idx_sol_ramal_vin    ON solicitudes_ramal (vin) WHERE vin IS NOT NULL;
CREATE INDEX idx_sol_ramal_ts     ON solicitudes_ramal (created_at DESC);
CREATE INDEX idx_inc_tecnico_email ON incidencias (tecnico_email) WHERE tecnico_email IS NOT NULL AND tecnico_email <> '';

-- ────────────────────────────────────────────
--  7. REVISION (sync counter, reemplaza Script Properties REV/REV_TS)
-- ────────────────────────────────────────────
CREATE TABLE app_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO app_config (key, value) VALUES ('REV', '0');
INSERT INTO app_config (key, value) VALUES ('REV_TS', '0');
INSERT INTO app_config (key, value) VALUES ('FECHA_CORTE_MOVILIZADOR', '');
INSERT INTO app_config (key, value) VALUES ('PAUSA_GLOBAL_ACTIVA', '0');
-- Horario de comida: HH:MM formato 24h
INSERT INTO app_config (key, value) VALUES ('HORARIO_COMIDA_INICIO', '13:00');
INSERT INTO app_config (key, value) VALUES ('HORARIO_COMIDA_FIN', '14:00');
-- Horario nocturno (pausa infinita): desde HH:MM hasta HH:MM (puede cruzar medianoche)
INSERT INTO app_config (key, value) VALUES ('HORARIO_DESCANSO_INICIO', '16:30');
INSERT INTO app_config (key, value) VALUES ('HORARIO_DESCANSO_FIN', '07:00');

-- ────────────────────────────────────────────
--  9. MOVILIZADOR_TRASLADOS
--     Rastrea el movimiento físico de vehículos desde
--     zona de conversión → zona de espera → calidad.
--     Disparado por el MOVILIZADOR en la app.
-- ────────────────────────────────────────────
CREATE TABLE movilizador_traslados (
  vin            TEXT        PRIMARY KEY REFERENCES vins(vin),
  estado         TEXT        NOT NULL DEFAULT 'TRASLADADO',
  -- 'TRASLADADO'       = movilizador movió de conversión a zona de espera
  -- 'ENTREGADO_CALIDAD' = movilizador entregó a zona de calidad
  trasladado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  trasladado_por TEXT        NOT NULL DEFAULT '',
  entregado_at   TIMESTAMPTZ,
  entregado_por  TEXT        DEFAULT ''
);

CREATE INDEX idx_mov_traslados_estado ON movilizador_traslados (estado);
ALTER TABLE movilizador_traslados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_full_access" ON movilizador_traslados FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────
--  8. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────
ALTER TABLE vins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_modulos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_ramal ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para el service_role (backend)
-- Tu API de Apps Script o backend usará la service_role key
CREATE POLICY "service_full_access" ON vins             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON usuarios         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON usuario_modulos  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON work_orders      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON asignaciones     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON eventos          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON incidencias      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON solicitudes_ramal FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────
--  MAPEO SHEET → DB (referencia)
-- ────────────────────────────────────────────
--  LISTA DE VIN GLP  →  vins
--  USUARIOS          →  usuarios + usuario_modulos
--  CONV121           →  work_orders (tipo_ot = 'CONVERSION')
--  CALIDAD1          →  work_orders (tipo_ot = 'CALIDAD')
--  RAMALERO1         →  work_orders (tipo_ot = 'RAMALERO')
--  ASIGNACIONES      →  asignaciones
--  MARCA_EVENTOS     →  eventos
--  INCIDENCIAS       →  incidencias
--
--  Columnas eliminadas (se computan en app):
--    TIEMPO_TRAB     →  se calcula desde tiempo_trab_ms
--    FOTO_URL        →  se calcula con driveUrls_(foto_file_id)
--    FOTO_THUMB_URL  →  se calcula con driveUrls_(foto_file_id)
--    FOTO_IMG_URL    →  se calcula con driveUrls_(foto_file_id)
--
--  Columnas renombradas:
--    CONVERSION_ID / CALIDAD_ID / RAMAL_ID  →  work_orders.id
--    CHASIS_ID                              →  work_orders.vin
--    ASIGNACION_ID                          →  asignaciones.id
--    EVENTO_ID                              →  eventos.id
--    CONVERSION_ID (en asignaciones)        →  asignaciones.work_order_id
-- ============================================================
