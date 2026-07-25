-- ============================================================
--  GLP-UI · Módulo de INVENTARIO DE HERRAMIENTAS
--  Ejecutar UNA VEZ en Supabase Dashboard → SQL Editor.
--  Idempotente: se puede correr de nuevo sin romper nada.
--
--  Modelo (3 conceptos separados):
--    1. herramientas_catalogo   → nombre "oficial" de cada herramienta
--    2. inventario_kits (+items) → kit estándar por especialidad (formato NUEVO)
--    3. inventario_tecnico (+items) → lo que REALMENTE tiene cada técnico
--
--  El formato ANTIGUO (lista libre por técnico) se respeta guardando el ítem
--  en `descripcion_libre` cuando no está en el catálogo.
-- ============================================================

-- ────────────────────────────────────────────
--  ENUMS
-- ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE estado_herramienta AS ENUM ('OK','FALTA','MAL','NO_STOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE formato_inventario AS ENUM ('NUEVO','ANTIGUO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────
--  1. CATÁLOGO DE HERRAMIENTAS
--     Nombre canónico de cada herramienta (una sola vez).
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS herramientas_catalogo (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT          NOT NULL,
  categoria      TEXT          DEFAULT '',
  especialidad   especialidad  NOT NULL DEFAULT 'AMBOS',
  activo         BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   DEFAULT now()
);
-- nombre único (case-insensitive) para poder deduplicar entre formatos
CREATE UNIQUE INDEX IF NOT EXISTS idx_hcat_nombre_lower
  ON herramientas_catalogo (lower(nombre));

-- ────────────────────────────────────────────
--  2. KITS ESTÁNDAR (formato NUEVO) — plantillas por especialidad
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_kits (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT          NOT NULL,
  especialidad   especialidad  NOT NULL DEFAULT 'AMBOS',
  activo         BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventario_kit_items (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id             UUID    NOT NULL REFERENCES inventario_kits(id) ON DELETE CASCADE,
  herramienta_id     UUID    NOT NULL REFERENCES herramientas_catalogo(id) ON DELETE CASCADE,
  cantidad_esperada  INT     NOT NULL DEFAULT 1,
  orden              INT     NOT NULL DEFAULT 0,
  UNIQUE (kit_id, herramienta_id)
);
CREATE INDEX IF NOT EXISTS idx_kit_items_kit ON inventario_kit_items (kit_id);

-- ────────────────────────────────────────────
--  3. INVENTARIO POR TÉCNICO  (la "hoja" de cada técnico)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario_tecnico (
  id             UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID                NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  formato        formato_inventario  NOT NULL DEFAULT 'NUEVO',
  kit_id         UUID                REFERENCES inventario_kits(id) ON DELETE SET NULL,
  fecha_entrega  DATE,
  tomado_por     TEXT                DEFAULT '',
  observacion    TEXT                DEFAULT '',
  created_at     TIMESTAMPTZ         DEFAULT now(),
  updated_at     TIMESTAMPTZ         DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_tec_user ON inventario_tecnico (user_id);

CREATE TABLE IF NOT EXISTS inventario_tecnico_items (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id     UUID                NOT NULL REFERENCES inventario_tecnico(id) ON DELETE CASCADE,
  -- Si viene del catálogo → herramienta_id. Si es libre (formato antiguo) → descripcion_libre.
  herramienta_id    UUID                REFERENCES herramientas_catalogo(id) ON DELETE SET NULL,
  descripcion_libre TEXT                DEFAULT '',
  marca             TEXT                DEFAULT '',
  cantidad          INT                 NOT NULL DEFAULT 1,
  estado            estado_herramienta  NOT NULL DEFAULT 'OK',
  nota              TEXT                DEFAULT '',
  orden             INT                 NOT NULL DEFAULT 0,
  CHECK (herramienta_id IS NOT NULL OR descripcion_libre <> '')
);
CREATE INDEX IF NOT EXISTS idx_inv_tec_items_inv ON inventario_tecnico_items (inventario_id);
CREATE INDEX IF NOT EXISTS idx_inv_tec_items_estado ON inventario_tecnico_items (estado);

-- ────────────────────────────────────────────
--  RLS  (mismo patrón permisivo que el resto del schema)
-- ────────────────────────────────────────────
ALTER TABLE herramientas_catalogo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_kits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_kit_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_tecnico        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_tecnico_items  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_full_access" ON herramientas_catalogo    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_kits          FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_kit_items     FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_tecnico       FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "service_full_access" ON inventario_tecnico_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
--  SEED · Catálogo + los 2 kits del formato NUEVO (fotos 2026-07)
-- ============================================================

-- 1) Catálogo: todos los nombres distintos de ambos kits.
INSERT INTO herramientas_catalogo (nombre, especialidad) VALUES
  ('cautil',                                              'AMBOS'),
  ('desarmador tipo thorx #20',                           'MOTOR'),
  ('alicate tipo pinzas para obstruir mangueras de agua', 'MOTOR'),
  ('alicate de corte',                                    'AMBOS'),
  ('alicate de presion',                                  'AMBOS'),
  ('alicate de punta',                                    'MOTOR'),
  ('alicate universal',                                   'AMBOS'),
  ('alicate mecanico stanley',                            'MOTOR'),
  ('alicate mecanico',                                    'TANQUE'),
  ('cortador de tubo 3-32 mm',                            'AMBOS'),
  ('martillo de carpintero o tipo bola',                 'MOTOR'),
  ('martillo tipo bola',                                  'TANQUE'),
  ('flexometro (wincha 5m)',                              'MOTOR'),
  ('flexometro (wincha)',                                 'TANQUE'),
  ('llave mixta 07',                                      'MOTOR'),
  ('llave mixta 08',                                      'MOTOR'),
  ('desarmador tipo torx 30',                             'MOTOR'),
  ('desarmador torx 30',                                  'TANQUE'),
  ('iman tipo antena',                                    'MOTOR'),
  ('iman tipo flexible',                                  'TANQUE'),
  ('desarmador corto estrella de 6 x 38mm',              'MOTOR'),
  ('desarmador corto plano de 6 x 38mm',                 'MOTOR'),
  ('cuter',                                               'AMBOS'),
  ('juego de desarmadores (3 planos - 03 estrellas)',    'MOTOR'),
  ('juego de desarmadores (incluido perilleros y conguitos)', 'TANQUE'),
  ('alicate para cortar manguera',                       'AMBOS'),
  ('llave mixta 13-14mm largos',                          'MOTOR'),
  ('kit taladro bosch 12v (cargador, 01 baterias)',      'MOTOR'),
  ('kit taladro makita 18 v (cargador, 02 baterias)',    'TANQUE'),
  ('dado punta allen #4 de 3/8"',                        'AMBOS'),
  ('llave 10 y 13 tipo ratche',                           'MOTOR'),
  ('01 maletin completo tooltech',                        'AMBOS'),
  ('palanca de 1/2 x 10"',                               'TANQUE'),
  ('brocha fina',                                         'TANQUE'),
  ('lima media luna',                                     'TANQUE'),
  ('lima redonda',                                        'TANQUE'),
  ('lima plana',                                          'TANQUE'),
  ('llave de ruedas',                                     'TANQUE'),
  ('nivel de mano',                                       'TANQUE'),
  ('remachadora',                                         'TANQUE'),
  ('camilla',                                             'TANQUE')
ON CONFLICT (lower(nombre)) DO NOTHING;

-- 2) Kits estándar (idempotente por nombre).
INSERT INTO inventario_kits (nombre, especialidad)
SELECT 'Mecánica delantera (MOTOR)', 'MOTOR'
WHERE NOT EXISTS (SELECT 1 FROM inventario_kits WHERE nombre = 'Mecánica delantera (MOTOR)');

INSERT INTO inventario_kits (nombre, especialidad)
SELECT 'Tanquero (TANQUE)', 'TANQUE'
WHERE NOT EXISTS (SELECT 1 FROM inventario_kits WHERE nombre = 'Tanquero (TANQUE)');

-- 3) Ítems del kit MOTOR (en orden de la foto).
INSERT INTO inventario_kit_items (kit_id, herramienta_id, orden)
SELECT k.id, h.id, v.orden
FROM (VALUES
  ('cautil',1),
  ('desarmador tipo thorx #20',2),
  ('alicate tipo pinzas para obstruir mangueras de agua',3),
  ('alicate de corte',4),
  ('alicate de presion',5),
  ('alicate de punta',6),
  ('alicate universal',7),
  ('alicate mecanico stanley',8),
  ('cortador de tubo 3-32 mm',9),
  ('martillo de carpintero o tipo bola',10),
  ('flexometro (wincha 5m)',11),
  ('llave mixta 07',12),
  ('llave mixta 08',13),
  ('desarmador tipo torx 30',14),
  ('iman tipo antena',15),
  ('desarmador corto estrella de 6 x 38mm',16),
  ('desarmador corto plano de 6 x 38mm',17),
  ('cuter',18),
  ('juego de desarmadores (3 planos - 03 estrellas)',19),
  ('alicate para cortar manguera',20),
  ('llave mixta 13-14mm largos',21),
  ('kit taladro bosch 12v (cargador, 01 baterias)',22),
  ('dado punta allen #4 de 3/8"',23),
  ('llave 10 y 13 tipo ratche',24),
  ('01 maletin completo tooltech',25)
) AS v(nombre,orden)
JOIN herramientas_catalogo h ON lower(h.nombre) = lower(v.nombre)
JOIN inventario_kits k ON k.nombre = 'Mecánica delantera (MOTOR)'
ON CONFLICT (kit_id, herramienta_id) DO NOTHING;

-- 4) Ítems del kit TANQUE (en orden de la foto).
INSERT INTO inventario_kit_items (kit_id, herramienta_id, orden)
SELECT k.id, h.id, v.orden
FROM (VALUES
  ('cautil',1),
  ('martillo tipo bola',2),
  ('palanca de 1/2 x 10"',3),
  ('cortador de tubo 3-32 mm',4),
  ('alicate de presion',5),
  ('alicate universal',6),
  ('brocha fina',7),
  ('lima media luna',8),
  ('lima redonda',9),
  ('lima plana',10),
  ('juego de desarmadores (incluido perilleros y conguitos)',11),
  ('cuter',12),
  ('flexometro (wincha)',13),
  ('alicate de corte',14),
  ('alicate mecanico',15),
  ('alicate para cortar manguera',16),
  ('desarmador torx 30',17),
  ('iman tipo flexible',18),
  ('kit taladro makita 18 v (cargador, 02 baterias)',19),
  ('llave de ruedas',20),
  ('dado punta allen #4 de 3/8"',21),
  ('nivel de mano',22),
  ('remachadora',23),
  ('01 maletin completo tooltech',24),
  ('camilla',25)
) AS v(nombre,orden)
JOIN herramientas_catalogo h ON lower(h.nombre) = lower(v.nombre)
JOIN inventario_kits k ON k.nombre = 'Tanquero (TANQUE)'
ON CONFLICT (kit_id, herramienta_id) DO NOTHING;

-- ============================================================
--  Verificación rápida (opcional):
--    SELECT k.nombre, count(*) FROM inventario_kit_items i
--    JOIN inventario_kits k ON k.id = i.kit_id GROUP BY k.nombre;
-- ============================================================

-- ============================================================
--  CATEGORÍAS (2026-07) · agrupa el catálogo por tipo de herramienta.
--  Idempotente: re-ejecutable. Backfilea la columna `categoria` por
--  nombre. No cambia `nombre` (sigue siendo el nombre completo único),
--  solo etiqueta cada herramienta con su grupo para poder agruparlas
--  en la UI y no reescribir "alicate" cada vez.
-- ============================================================
UPDATE herramientas_catalogo SET categoria='ALICATE' WHERE lower(nombre) IN (
  'alicate tipo pinzas para obstruir mangueras de agua','alicate de corte','alicate de presion',
  'alicate de punta','alicate universal','alicate mecanico stanley','alicate mecanico','alicate para cortar manguera');

UPDATE herramientas_catalogo SET categoria='DESARMADOR' WHERE lower(nombre) IN (
  'desarmador tipo thorx #20','desarmador tipo torx 30','desarmador torx 30',
  'desarmador corto estrella de 6 x 38mm','desarmador corto plano de 6 x 38mm',
  'juego de desarmadores (3 planos - 03 estrellas)','juego de desarmadores (incluido perilleros y conguitos)');

UPDATE herramientas_catalogo SET categoria='LLAVE MIXTA' WHERE lower(nombre) IN (
  'llave mixta 07','llave mixta 08','llave mixta 13-14mm largos');

UPDATE herramientas_catalogo SET categoria='LLAVE' WHERE lower(nombre) IN (
  'llave 10 y 13 tipo ratche','llave de ruedas');

UPDATE herramientas_catalogo SET categoria='MARTILLO' WHERE lower(nombre) IN (
  'martillo de carpintero o tipo bola','martillo tipo bola');

UPDATE herramientas_catalogo SET categoria='FLEXOMETRO' WHERE lower(nombre) IN (
  'flexometro (wincha 5m)','flexometro (wincha)');

UPDATE herramientas_catalogo SET categoria='IMAN' WHERE lower(nombre) IN (
  'iman tipo antena','iman tipo flexible');

UPDATE herramientas_catalogo SET categoria='DADO' WHERE lower(nombre) IN (
  'dado punta allen #4 de 3/8"');

UPDATE herramientas_catalogo SET categoria='TALADRO' WHERE lower(nombre) IN (
  'kit taladro bosch 12v (cargador, 01 baterias)','kit taladro makita 18 v (cargador, 02 baterias)');

UPDATE herramientas_catalogo SET categoria='LIMA' WHERE lower(nombre) IN (
  'lima media luna','lima redonda','lima plana');

UPDATE herramientas_catalogo SET categoria='CORTATUBO'   WHERE lower(nombre)='cortador de tubo 3-32 mm';
UPDATE herramientas_catalogo SET categoria='PALANCA'     WHERE lower(nombre)='palanca de 1/2 x 10"';
UPDATE herramientas_catalogo SET categoria='BROCHA'      WHERE lower(nombre)='brocha fina';
UPDATE herramientas_catalogo SET categoria='NIVEL'       WHERE lower(nombre)='nivel de mano';
UPDATE herramientas_catalogo SET categoria='CAUTIN'      WHERE lower(nombre)='cautil';
UPDATE herramientas_catalogo SET categoria='CUTER'       WHERE lower(nombre)='cuter';
UPDATE herramientas_catalogo SET categoria='MALETIN'     WHERE lower(nombre)='01 maletin completo tooltech';
UPDATE herramientas_catalogo SET categoria='REMACHADORA' WHERE lower(nombre)='remachadora';
UPDATE herramientas_catalogo SET categoria='CAMILLA'     WHERE lower(nombre)='camilla';

-- Verificación: SELECT categoria, count(*) FROM herramientas_catalogo GROUP BY categoria ORDER BY categoria;
