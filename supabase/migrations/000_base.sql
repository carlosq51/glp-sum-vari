-- ============================================================
--  000 · ESQUEMA BASE
--  Foto de producción tomada el 2026-10-06, después de la poda de la
--  fase 1. Generado con scripts/esquema-dump.mjs; NO editar a mano.
-- ============================================================
--
--  Hasta aquí la base se armó con 15 .sql sueltos que se corrían a mano,
--  sin orden y con siembras que ya no coincidían con producción (están en
--  supabase/historico/, como referencia de POR QUÉ existe cada cosa).
--  Desde esta foto, todo cambio entra como una migración numerada:
--  ver supabase/migrations/README.md.
--
--  Validado con scripts/esquema-validar.mjs: aplicado sobre una base vacía
--  reproduce producción línea por línea.
--
--  En un proyecto Supabase nuevo: los roles anon/authenticated/service_role
--  y la publicación supabase_realtime ya existen. Los DATOS no van aquí
--  (app_config, usuarios, plazas de conversion_zonas).

-- ────────────────────────────────────────────────────────────
--  Extensiones activas (las gestiona Supabase; aquí solo como referencia)
-- ────────────────────────────────────────────────────────────
--   pg_stat_statements (schema extensions)
--   pgcrypto (schema extensions)
--   supabase_vault (schema vault)
--   uuid-ossp (schema extensions)

-- ────────────────────────────────────────────────────────────
--  Tipos enumerados (21)
-- ────────────────────────────────────────────────────────────
CREATE TYPE accion_evento AS ENUM ('INICIO', 'PAUSA', 'REANUDAR', 'FIN', 'NOTA');
CREATE TYPE especialidad AS ENUM ('AMBOS', 'MOTOR', 'TANQUE');
CREATE TYPE estado_actual AS ENUM ('SIN_INICIAR', 'TRABAJANDO', 'PAUSADO', 'FINALIZADO');
CREATE TYPE estado_dupla AS ENUM ('PENDIENTE', 'ACTIVA', 'RECHAZADA', 'DISUELTA');
CREATE TYPE estado_general AS ENUM ('PENDIENTE', 'EN PROCESO', 'TRABAJANDO', 'PAUSADO', 'FINALIZADO');
CREATE TYPE estado_herramienta AS ENUM ('OK', 'FALTA', 'MAL', 'NO_STOCK');
CREATE TYPE estado_informe AS ENUM ('BORRADOR', 'ENVIADO', 'IMPRESO', 'ANULADO');
CREATE TYPE estado_lote_ramal AS ENUM ('RECIBIDO', 'REVISANDO', 'REVISADO', 'REPARTIDO', 'CERRADO');
CREATE TYPE estado_propuesta AS ENUM ('SOMBRA', 'PROPUESTA', 'CONFIRMADA', 'RECHAZADA', 'PERMUTADA', 'EXPIRADA');
CREATE TYPE estado_solicitud_ramal AS ENUM ('PENDIENTE', 'ENTREGADO');
CREATE TYPE estado_tecnico AS ENUM ('FUERA', 'PRESENTE', 'DISPONIBLE', 'OCUPADO', 'PAUSA');
CREATE TYPE formato_inventario AS ENUM ('NUEVO', 'ANTIGUO');
CREATE TYPE modulo AS ENUM ('TECNICO', 'RAMALERO', 'CALIDAD', 'MOVILIZADOR', 'SUPERVISOR', 'ADMIN', 'DESPACHO');
CREATE TYPE origen_marca AS ENUM ('QR', 'MANUAL_SUPERVISOR', 'AUTO');
CREATE TYPE rol_trabajo AS ENUM ('MOTOR', 'TANQUE', 'CALIDAD', 'RAMALERO', 'MOVILIZADOR');
CREATE TYPE rol_usuario AS ENUM ('TECNICO', 'SUPERVISOR', 'ADMIN', 'CALIDAD', 'MOVILIZADOR', 'RAMALERO');
CREATE TYPE severidad AS ENUM ('LEVE', 'MODERADA', 'CRITICA');
CREATE TYPE tipo_marca AS ENUM ('INGRESO', 'SALIDA', 'PAUSA_INI', 'PAUSA_FIN', 'CIERRE_AUTO');
CREATE TYPE tipo_mov_ramal AS ENUM ('ARMADO', 'ENTREGA', 'DEVOLUCION', 'MERMA', 'AJUSTE');
CREATE TYPE tipo_ot AS ENUM ('CONVERSION', 'CALIDAD', 'RAMALERO');
CREATE TYPE tipo_ramal AS ENUM ('JETOUR', 'VOLKSWAGEN', 'KYC V3', 'KYC V5', 'KYC V7', 'KYC X5');

-- ────────────────────────────────────────────────────────────
--  Funciones (4)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.glp_dupla_max_dos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (SELECT COUNT(*) FROM despacho_dupla_miembros WHERE dupla_id = NEW.dupla_id) > 2 THEN
    RAISE EXCEPTION 'Una dupla admite máximo 2 técnicos';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.glp_jornada_fecha(ts timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Restar 6 h a la hora local desplaza el corte de medianoche a las 06:00.
  SELECT ((ts AT TIME ZONE 'America/Lima') - INTERVAL '6 hours')::DATE;
$function$;

CREATE OR REPLACE FUNCTION public.informes_taller_touch_()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.inventario_stock_autocrear_()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO inventario_stock (herramienta_id, cantidad_almacen)
  VALUES (NEW.id, 0)
  ON CONFLICT (herramienta_id) DO NOTHING;
  RETURN NEW;
END; $function$;

-- ────────────────────────────────────────────────────────────
--  Tablas (40)
-- ────────────────────────────────────────────────────────────
CREATE TABLE app_config (
  key text NOT NULL,
  value text NOT NULL,
  CONSTRAINT app_config_pkey PRIMARY KEY (key)
);

CREATE TABLE asignaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tipo_ot tipo_ot NOT NULL,
  rol_trabajo rol_trabajo NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  fecha_asignacion timestamp with time zone DEFAULT now(),
  tiempo_trab_ms bigint DEFAULT 0 NOT NULL,
  estado_actual estado_actual DEFAULT 'SIN_INICIAR'::estado_actual NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  running_since timestamp with time zone,
  last_nota text DEFAULT ''::text,
  last_nota_ts timestamp with time zone,
  pausa_hasta timestamp with time zone,
  CONSTRAINT asignaciones_pkey PRIMARY KEY (id)
);

CREATE TABLE asistencia_jornada (
  jornada_fecha date NOT NULL,
  user_id uuid NOT NULL,
  estado estado_tecnico DEFAULT 'FUERA'::estado_tecnico NOT NULL,
  ingreso_at timestamp with time zone,
  salida_at timestamp with time zone,
  salida_auto boolean DEFAULT false NOT NULL,
  minutos_pausa integer DEFAULT 0 NOT NULL,
  pausa_desde timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT asistencia_jornada_pkey PRIMARY KEY (jornada_fecha, user_id)
);

CREATE TABLE asistencia_marcas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tipo tipo_marca NOT NULL,
  origen origen_marca DEFAULT 'QR'::origen_marca NOT NULL,
  ts timestamp with time zone DEFAULT now() NOT NULL,
  jornada_fecha date GENERATED ALWAYS AS (glp_jornada_fecha(ts)) STORED,
  token_slot bigint,
  registrado_por uuid,
  motivo text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT asistencia_marcas_pkey PRIMARY KEY (id)
);

CREATE TABLE conversion_zonas (
  zona_id smallint NOT NULL,
  vin text,
  registrado_por text DEFAULT ''::text NOT NULL,
  registrado_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversion_zonas_zona_id_check CHECK (((zona_id >= 1) AND (zona_id <= 15))),
  CONSTRAINT conversion_zonas_pkey PRIMARY KEY (zona_id)
);

CREATE TABLE despacho_dupla_miembros (
  dupla_id uuid NOT NULL,
  user_id uuid NOT NULL,
  jornada_fecha date NOT NULL,
  activa boolean DEFAULT false NOT NULL,
  CONSTRAINT despacho_dupla_miembros_pkey PRIMARY KEY (dupla_id, user_id)
);

CREATE TABLE despacho_duplas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jornada_fecha date DEFAULT glp_jornada_fecha(now()) NOT NULL,
  rol_trabajo rol_trabajo NOT NULL,
  lider_user_id uuid NOT NULL,
  estado estado_dupla DEFAULT 'PENDIENTE'::estado_dupla NOT NULL,
  ultimo_responsable_user_id uuid,
  carros_asignados smallint DEFAULT 0 NOT NULL,
  propuesta_at timestamp with time zone DEFAULT now() NOT NULL,
  confirmada_at timestamp with time zone,
  disuelta_at timestamp with time zone,
  disuelta_por uuid,
  motivo text DEFAULT ''::text NOT NULL,
  CONSTRAINT despacho_duplas_pkey PRIMARY KEY (id)
);

CREATE TABLE despacho_pool_snapshot (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jornada_fecha date DEFAULT glp_jornada_fecha(now()) NOT NULL,
  ts timestamp with time zone DEFAULT now() NOT NULL,
  vins_elegibles jsonb DEFAULT '[]'::jsonb NOT NULL,
  vins_excluidos jsonb DEFAULT '{}'::jsonb NOT NULL,
  tecnicos_libres jsonb DEFAULT '[]'::jsonb NOT NULL,
  propuestas_gen smallint DEFAULT 0 NOT NULL,
  CONSTRAINT despacho_pool_snapshot_pkey PRIMARY KEY (id)
);

CREATE TABLE despacho_propuestas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  jornada_fecha date DEFAULT glp_jornada_fecha(now()) NOT NULL,
  carro_id uuid DEFAULT gen_random_uuid() NOT NULL,
  vin text NOT NULL,
  zona_id smallint,
  user_id uuid NOT NULL,
  unidad_dupla_id uuid,
  rol_trabajo rol_trabajo NOT NULL,
  estado estado_propuesta DEFAULT 'SOMBRA'::estado_propuesta NOT NULL,
  score numeric(6,3) DEFAULT 0 NOT NULL,
  score_detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
  razon text DEFAULT ''::text NOT NULL,
  propuesta_at timestamp with time zone DEFAULT now() NOT NULL,
  decidida_at timestamp with time zone,
  decidida_por uuid,
  motivo text DEFAULT ''::text NOT NULL,
  asignacion_id uuid,
  real_user_id uuid,
  acierto boolean,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT despacho_propuestas_pkey PRIMARY KEY (id)
);

CREATE TABLE eventos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  timestamp timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  tipo_ot tipo_ot NOT NULL,
  rol_trabajo rol_trabajo NOT NULL,
  accion accion_evento NOT NULL,
  nota text DEFAULT ''::text,
  CONSTRAINT eventos_pkey PRIMARY KEY (id)
);

CREATE TABLE herramientas_catalogo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  categoria text DEFAULT ''::text,
  especialidad especialidad DEFAULT 'AMBOS'::especialidad NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  descontinuada_motivo text DEFAULT ''::text NOT NULL,
  descontinuada_at timestamp with time zone,
  CONSTRAINT herramientas_catalogo_pkey PRIMARY KEY (id)
);

CREATE TABLE incidencias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  fecha_hora timestamp with time zone DEFAULT now() NOT NULL,
  mes text NOT NULL,
  work_order_id uuid,
  vin text,
  tecnico text NOT NULL,
  tipo severidad NOT NULL,
  registrado_por text NOT NULL,
  nota text DEFAULT ''::text,
  foto_file_id text DEFAULT ''::text,
  foto_folder_id text DEFAULT ''::text,
  foto_batch_id text DEFAULT ''::text,
  tiempo_inicio timestamp with time zone,
  tiempo_fin timestamp with time zone,
  resuelta_por text,
  CONSTRAINT incidencias_pkey PRIMARY KEY (id)
);

CREATE TABLE informes_taller (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  work_order_id text NOT NULL,
  vin text DEFAULT ''::text NOT NULL,
  placa text DEFAULT ''::text NOT NULL,
  estado estado_informe DEFAULT 'ENVIADO'::estado_informe NOT NULL,
  datos jsonb DEFAULT '{}'::jsonb NOT NULL,
  creado_por text DEFAULT ''::text NOT NULL,
  creado_nombre text DEFAULT ''::text NOT NULL,
  impreso_por text,
  impreso_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  ot_fisica text DEFAULT ''::text NOT NULL,
  CONSTRAINT informes_taller_pkey PRIMARY KEY (id)
);

CREATE TABLE inventario_kit_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kit_id uuid NOT NULL,
  herramienta_id uuid NOT NULL,
  cantidad_esperada integer DEFAULT 1 NOT NULL,
  orden integer DEFAULT 0 NOT NULL,
  CONSTRAINT inventario_kit_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventario_kit_items_kit_id_herramienta_id_key UNIQUE (kit_id, herramienta_id)
);

CREATE TABLE inventario_kits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre text NOT NULL,
  especialidad especialidad DEFAULT 'AMBOS'::especialidad NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventario_kits_pkey PRIMARY KEY (id)
);

CREATE TABLE inventario_movimientos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tipo text DEFAULT 'TRASPASO'::text NOT NULL,
  herramienta_id uuid,
  descripcion text DEFAULT ''::text NOT NULL,
  marca text DEFAULT ''::text,
  serie text DEFAULT ''::text,
  codigo text DEFAULT ''::text,
  cantidad integer DEFAULT 1 NOT NULL,
  origen_user_id uuid,
  destino_user_id uuid,
  origen_nombre text DEFAULT ''::text,
  destino_nombre text DEFAULT ''::text,
  nota text DEFAULT ''::text,
  hecho_por text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventario_movimientos_pkey PRIMARY KEY (id)
);

CREATE TABLE inventario_stock (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  herramienta_id uuid NOT NULL,
  cantidad_almacen integer DEFAULT 0 NOT NULL,
  stock_minimo integer DEFAULT 0 NOT NULL,
  ubicacion text DEFAULT ''::text NOT NULL,
  nota text DEFAULT ''::text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  cantidad_malogrado integer DEFAULT 0 NOT NULL,
  CONSTRAINT inventario_stock_pkey PRIMARY KEY (id),
  CONSTRAINT inventario_stock_herramienta_id_key UNIQUE (herramienta_id)
);

CREATE TABLE inventario_stock_lotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  herramienta_id uuid NOT NULL,
  cantidad integer DEFAULT 0 NOT NULL,
  estado estado_herramienta DEFAULT 'OK'::estado_herramienta NOT NULL,
  ubicacion text DEFAULT ''::text NOT NULL,
  marca text DEFAULT ''::text NOT NULL,
  nota text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventario_stock_lotes_pkey PRIMARY KEY (id)
);

CREATE TABLE inventario_stock_unidades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  herramienta_id uuid NOT NULL,
  marca text DEFAULT ''::text NOT NULL,
  codigo text DEFAULT ''::text NOT NULL,
  serie text DEFAULT ''::text NOT NULL,
  estado estado_herramienta DEFAULT 'OK'::estado_herramienta NOT NULL,
  ubicacion text DEFAULT ''::text NOT NULL,
  nota text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventario_stock_unidades_pkey PRIMARY KEY (id)
);

CREATE TABLE inventario_tecnico (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  formato formato_inventario DEFAULT 'NUEVO'::formato_inventario NOT NULL,
  kit_id uuid,
  fecha_entrega date,
  tomado_por text DEFAULT ''::text,
  observacion text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventario_tecnico_pkey PRIMARY KEY (id)
);

CREATE TABLE inventario_tecnico_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  inventario_id uuid NOT NULL,
  herramienta_id uuid,
  descripcion_libre text DEFAULT ''::text,
  marca text DEFAULT ''::text,
  cantidad integer DEFAULT 1 NOT NULL,
  estado estado_herramienta DEFAULT 'OK'::estado_herramienta NOT NULL,
  nota text DEFAULT ''::text,
  orden integer DEFAULT 0 NOT NULL,
  serie text DEFAULT ''::text,
  codigo text DEFAULT ''::text,
  CONSTRAINT inventario_tecnico_items_check CHECK (((herramienta_id IS NOT NULL) OR (descripcion_libre <> ''::text))),
  CONSTRAINT inventario_tecnico_items_pkey PRIMARY KEY (id)
);

CREATE TABLE lista_diaria_activa (
  vin text NOT NULL,
  fecha_asignacion date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lista_diaria_activa_pkey PRIMARY KEY (vin)
);

CREATE TABLE ml_models (
  key text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ml_models_pkey PRIMARY KEY (key)
);

CREATE TABLE movilizador_observaciones (
  vin text NOT NULL,
  texto text DEFAULT ''::text NOT NULL,
  actualizado_por text DEFAULT ''::text NOT NULL,
  actualizado_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT movilizador_observaciones_pkey PRIMARY KEY (vin)
);

CREATE TABLE movilizador_traslados (
  vin text NOT NULL,
  estado text DEFAULT 'TRASLADADO'::text NOT NULL,
  trasladado_at timestamp with time zone DEFAULT now() NOT NULL,
  trasladado_por text DEFAULT ''::text NOT NULL,
  entregado_at timestamp with time zone,
  entregado_por text DEFAULT ''::text,
  CONSTRAINT movilizador_traslados_pkey PRIMARY KEY (vin)
);

CREATE TABLE pairing_omisiones (
  id bigserial NOT NULL,
  user_id uuid,
  nombre text,
  rol_trabajo text,
  work_order_id text,
  vin text,
  modelo text,
  mode text,
  suggested_ids jsonb,
  complement_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pairing_omisiones_pkey PRIMARY KEY (id)
);

CREATE TABLE produccion_horas_extra (
  jornada_fecha date NOT NULL,
  user_id uuid NOT NULL,
  hasta text NOT NULL,
  actualizado_por text DEFAULT ''::text NOT NULL,
  actualizado_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT produccion_horas_extra_pkey PRIMARY KEY (jornada_fecha, user_id)
);

CREATE TABLE push_subscriptions (
  id serial NOT NULL,
  email text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE TABLE ramal_lote_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lote_id uuid NOT NULL,
  tipo_ramal tipo_ramal NOT NULL,
  cantidad integer DEFAULT 0 NOT NULL,
  nota text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ramal_lote_items_pkey PRIMARY KEY (id)
);

CREATE TABLE ramal_lotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  codigo text DEFAULT ''::text NOT NULL,
  fecha date DEFAULT CURRENT_DATE NOT NULL,
  cantidad_equipos integer DEFAULT 0 NOT NULL,
  estado estado_lote_ramal DEFAULT 'RECIBIDO'::estado_lote_ramal NOT NULL,
  encargado_user_id uuid,
  encargado_sugerido_id uuid,
  revision_inicio_at timestamp with time zone,
  revision_inicio_por text DEFAULT ''::text NOT NULL,
  revision_aviso_at timestamp with time zone,
  revision_fin_at timestamp with time zone,
  revision_fin_por text DEFAULT ''::text NOT NULL,
  revision_conformes integer DEFAULT 0 NOT NULL,
  revision_observados integer DEFAULT 0 NOT NULL,
  revision_nota text DEFAULT ''::text NOT NULL,
  cerrado_at timestamp with time zone,
  cerrado_por text DEFAULT ''::text NOT NULL,
  merma integer DEFAULT 0 NOT NULL,
  merma_motivo text DEFAULT ''::text NOT NULL,
  nota text DEFAULT ''::text NOT NULL,
  creado_por text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ramal_lotes_pkey PRIMARY KEY (id)
);

CREATE TABLE ramal_movimientos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tipo tipo_mov_ramal NOT NULL,
  tipo_ramal tipo_ramal,
  cantidad integer DEFAULT 0 NOT NULL,
  lote_id uuid,
  reparto_id uuid,
  solicitud_id uuid,
  user_id uuid,
  user_nombre text DEFAULT ''::text NOT NULL,
  destino text DEFAULT ''::text NOT NULL,
  vin text,
  nota text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by text DEFAULT ''::text NOT NULL,
  CONSTRAINT ramal_movimientos_pkey PRIMARY KEY (id)
);

CREATE TABLE ramal_repartos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lote_id uuid NOT NULL,
  user_id uuid NOT NULL,
  cantidad_asignada integer DEFAULT 0 NOT NULL,
  cantidad_devuelta integer DEFAULT 0 NOT NULL,
  cantidad_rechazada integer DEFAULT 0 NOT NULL,
  asignado_at timestamp with time zone DEFAULT now() NOT NULL,
  asignado_por text DEFAULT ''::text NOT NULL,
  devuelto_at timestamp with time zone,
  nota text DEFAULT ''::text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tipo_ramal tipo_ramal,
  CONSTRAINT ramal_repartos_pkey PRIMARY KEY (id)
);

CREATE TABLE ramal_stock_config (
  tipo_ramal tipo_ramal NOT NULL,
  stock_minimo integer DEFAULT 0 NOT NULL,
  ubicacion text DEFAULT ''::text NOT NULL,
  nota text DEFAULT ''::text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ramal_stock_config_pkey PRIMARY KEY (tipo_ramal)
);

CREATE TABLE solicitudes_ramal (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  vin text,
  work_order_id uuid,
  tecnico_nombre text,
  tecnico_email text,
  nota text,
  estado estado_solicitud_ramal DEFAULT 'PENDIENTE'::estado_solicitud_ramal NOT NULL,
  entregado_at timestamp with time zone,
  entregado_por text,
  notificado_at timestamp with time zone,
  tipo_ramal tipo_ramal,
  lote_id uuid,
  entregado_por_user_id uuid,
  CONSTRAINT solicitudes_ramal_pkey PRIMARY KEY (id)
);

CREATE TABLE usuario_modulos (
  user_id uuid NOT NULL,
  modulo modulo NOT NULL,
  CONSTRAINT usuario_modulos_pkey PRIMARY KEY (user_id, modulo)
);

CREATE TABLE usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  nombre text DEFAULT ''::text NOT NULL,
  rol rol_usuario DEFAULT 'TECNICO'::rol_usuario NOT NULL,
  especialidad especialidad DEFAULT 'AMBOS'::especialidad NOT NULL,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  avatar_url text DEFAULT ''::text,
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_email_key UNIQUE (email)
);

CREATE TABLE vins (
  vin text NOT NULL,
  modelo text,
  dua text,
  cliente text,
  reductor_asignado text DEFAULT ''::text,
  tanque_asignado text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  ultima_ubicacion text DEFAULT ''::text,
  modelo_normalizado text,
  estado text DEFAULT ''::text,
  CONSTRAINT vins_pkey PRIMARY KEY (vin)
);

CREATE TABLE work_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tipo_ot tipo_ot NOT NULL,
  vin text,
  user_id uuid,
  tipo_ramal tipo_ramal,
  fecha_creacion timestamp with time zone DEFAULT now(),
  estado_general estado_general DEFAULT 'PENDIENTE'::estado_general NOT NULL,
  observaciones text DEFAULT ''::text,
  tanque_registrado text DEFAULT ''::text,
  reductor_registrado text DEFAULT ''::text,
  conf_ck1 boolean DEFAULT false,
  conf_ck2 boolean DEFAULT false,
  conf_ck3 boolean DEFAULT false,
  conf_ck4 boolean DEFAULT false,
  conf_ts timestamp with time zone,
  conf_by text,
  created_at timestamp with time zone DEFAULT now(),
  numero_ot text DEFAULT ''::text NOT NULL,
  fecha_sin_calidad timestamp with time zone,
  CONSTRAINT chk_calidad_has_vin CHECK (((tipo_ot <> 'CALIDAD'::tipo_ot) OR (vin IS NOT NULL))),
  CONSTRAINT chk_conv_has_vin CHECK (((tipo_ot <> 'CONVERSION'::tipo_ot) OR (vin IS NOT NULL))),
  CONSTRAINT chk_ramalero_has_tipo CHECK (((tipo_ot <> 'RAMALERO'::tipo_ot) OR (tipo_ramal IS NOT NULL))),
  CONSTRAINT work_orders_pkey PRIMARY KEY (id)
);

CREATE TABLE zona_libre (
  vin text NOT NULL,
  registrado_por text DEFAULT ''::text NOT NULL,
  registrado_at timestamp with time zone DEFAULT now(),
  CONSTRAINT zona_libre_pkey PRIMARY KEY (vin)
);

CREATE TABLE zonas_historial (
  id bigserial NOT NULL,
  ocurrido_at timestamp with time zone DEFAULT now() NOT NULL,
  accion text NOT NULL,
  zona_id smallint,
  vin text DEFAULT ''::text NOT NULL,
  vin_relacionado text DEFAULT ''::text NOT NULL,
  zona_anterior smallint,
  usuario_email text DEFAULT ''::text NOT NULL,
  usuario_nombre text DEFAULT ''::text NOT NULL,
  usuario_rol text DEFAULT ''::text NOT NULL,
  origen text DEFAULT ''::text NOT NULL,
  CONSTRAINT zonas_historial_pkey PRIMARY KEY (id)
);

-- ────────────────────────────────────────────────────────────
--  Llaves foráneas (50)
-- ────────────────────────────────────────────────────────────
ALTER TABLE asignaciones ADD CONSTRAINT asignaciones_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE asignaciones ADD CONSTRAINT asignaciones_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE asistencia_jornada ADD CONSTRAINT asistencia_jornada_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE asistencia_marcas ADD CONSTRAINT asistencia_marcas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id);
ALTER TABLE asistencia_marcas ADD CONSTRAINT asistencia_marcas_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE despacho_dupla_miembros ADD CONSTRAINT despacho_dupla_miembros_dupla_id_fkey FOREIGN KEY (dupla_id) REFERENCES despacho_duplas(id) ON DELETE CASCADE;
ALTER TABLE despacho_dupla_miembros ADD CONSTRAINT despacho_dupla_miembros_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE despacho_duplas ADD CONSTRAINT despacho_duplas_disuelta_por_fkey FOREIGN KEY (disuelta_por) REFERENCES usuarios(id);
ALTER TABLE despacho_duplas ADD CONSTRAINT despacho_duplas_lider_user_id_fkey FOREIGN KEY (lider_user_id) REFERENCES usuarios(id);
ALTER TABLE despacho_duplas ADD CONSTRAINT despacho_duplas_ultimo_responsable_user_id_fkey FOREIGN KEY (ultimo_responsable_user_id) REFERENCES usuarios(id);
ALTER TABLE despacho_propuestas ADD CONSTRAINT despacho_propuestas_asignacion_id_fkey FOREIGN KEY (asignacion_id) REFERENCES asignaciones(id);
ALTER TABLE despacho_propuestas ADD CONSTRAINT despacho_propuestas_decidida_por_fkey FOREIGN KEY (decidida_por) REFERENCES usuarios(id);
ALTER TABLE despacho_propuestas ADD CONSTRAINT despacho_propuestas_real_user_id_fkey FOREIGN KEY (real_user_id) REFERENCES usuarios(id);
ALTER TABLE despacho_propuestas ADD CONSTRAINT despacho_propuestas_unidad_dupla_id_fkey FOREIGN KEY (unidad_dupla_id) REFERENCES despacho_duplas(id);
ALTER TABLE despacho_propuestas ADD CONSTRAINT despacho_propuestas_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE eventos ADD CONSTRAINT eventos_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE eventos ADD CONSTRAINT eventos_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE incidencias ADD CONSTRAINT incidencias_vin_fkey FOREIGN KEY (vin) REFERENCES vins(vin);
ALTER TABLE incidencias ADD CONSTRAINT incidencias_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE inventario_kit_items ADD CONSTRAINT inventario_kit_items_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES herramientas_catalogo(id) ON DELETE CASCADE;
ALTER TABLE inventario_kit_items ADD CONSTRAINT inventario_kit_items_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES inventario_kits(id) ON DELETE CASCADE;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_destino_user_id_fkey FOREIGN KEY (destino_user_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES herramientas_catalogo(id) ON DELETE SET NULL;
ALTER TABLE inventario_movimientos ADD CONSTRAINT inventario_movimientos_origen_user_id_fkey FOREIGN KEY (origen_user_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE inventario_stock ADD CONSTRAINT inventario_stock_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES herramientas_catalogo(id) ON DELETE CASCADE;
ALTER TABLE inventario_stock_lotes ADD CONSTRAINT inventario_stock_lotes_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES herramientas_catalogo(id) ON DELETE CASCADE;
ALTER TABLE inventario_stock_unidades ADD CONSTRAINT inventario_stock_unidades_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES herramientas_catalogo(id) ON DELETE CASCADE;
ALTER TABLE inventario_tecnico ADD CONSTRAINT inventario_tecnico_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES inventario_kits(id) ON DELETE SET NULL;
ALTER TABLE inventario_tecnico ADD CONSTRAINT inventario_tecnico_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE inventario_tecnico_items ADD CONSTRAINT inventario_tecnico_items_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES herramientas_catalogo(id) ON DELETE SET NULL;
ALTER TABLE inventario_tecnico_items ADD CONSTRAINT inventario_tecnico_items_inventario_id_fkey FOREIGN KEY (inventario_id) REFERENCES inventario_tecnico(id) ON DELETE CASCADE;
ALTER TABLE movilizador_traslados ADD CONSTRAINT movilizador_traslados_vin_fkey FOREIGN KEY (vin) REFERENCES vins(vin);
ALTER TABLE produccion_horas_extra ADD CONSTRAINT produccion_horas_extra_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE ramal_lote_items ADD CONSTRAINT ramal_lote_items_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES ramal_lotes(id) ON DELETE CASCADE;
ALTER TABLE ramal_lotes ADD CONSTRAINT ramal_lotes_encargado_sugerido_id_fkey FOREIGN KEY (encargado_sugerido_id) REFERENCES usuarios(id);
ALTER TABLE ramal_lotes ADD CONSTRAINT ramal_lotes_encargado_user_id_fkey FOREIGN KEY (encargado_user_id) REFERENCES usuarios(id);
ALTER TABLE ramal_movimientos ADD CONSTRAINT ramal_movimientos_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES ramal_lotes(id) ON DELETE SET NULL;
ALTER TABLE ramal_movimientos ADD CONSTRAINT ramal_movimientos_reparto_id_fkey FOREIGN KEY (reparto_id) REFERENCES ramal_repartos(id) ON DELETE SET NULL;
ALTER TABLE ramal_movimientos ADD CONSTRAINT ramal_movimientos_solicitud_id_fkey FOREIGN KEY (solicitud_id) REFERENCES solicitudes_ramal(id) ON DELETE SET NULL;
ALTER TABLE ramal_movimientos ADD CONSTRAINT ramal_movimientos_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE ramal_repartos ADD CONSTRAINT ramal_repartos_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES ramal_lotes(id) ON DELETE CASCADE;
ALTER TABLE ramal_repartos ADD CONSTRAINT ramal_repartos_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE solicitudes_ramal ADD CONSTRAINT solicitudes_ramal_entregado_por_user_id_fkey FOREIGN KEY (entregado_por_user_id) REFERENCES usuarios(id);
ALTER TABLE solicitudes_ramal ADD CONSTRAINT solicitudes_ramal_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES ramal_lotes(id) ON DELETE SET NULL;
ALTER TABLE solicitudes_ramal ADD CONSTRAINT solicitudes_ramal_vin_fkey FOREIGN KEY (vin) REFERENCES vins(vin);
ALTER TABLE solicitudes_ramal ADD CONSTRAINT solicitudes_ramal_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE usuario_modulos ADD CONSTRAINT usuario_modulos_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id);
ALTER TABLE work_orders ADD CONSTRAINT work_orders_vin_fkey FOREIGN KEY (vin) REFERENCES vins(vin);
ALTER TABLE zona_libre ADD CONSTRAINT zona_libre_vin_fkey FOREIGN KEY (vin) REFERENCES vins(vin);

-- ────────────────────────────────────────────────────────────
--  Índices (86)
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX idx_asg_active ON asignaciones USING btree (work_order_id, rol_trabajo) WHERE (activo = true);
CREATE INDEX idx_asg_estado ON asignaciones USING btree (estado_actual);
CREATE INDEX idx_asg_pausa_hasta ON asignaciones USING btree (pausa_hasta) WHERE (pausa_hasta IS NOT NULL);
CREATE INDEX idx_asg_updated ON asignaciones USING btree (updated_at);
CREATE INDEX idx_asg_user ON asignaciones USING btree (user_id);
CREATE INDEX idx_asisj_estado ON asistencia_jornada USING btree (jornada_fecha, estado);
CREATE INDEX idx_asis_jornada ON asistencia_marcas USING btree (jornada_fecha, user_id);
CREATE UNIQUE INDEX idx_asis_token_slot ON asistencia_marcas USING btree (token_slot, user_id) WHERE (token_slot IS NOT NULL);
CREATE INDEX idx_asis_user_ts ON asistencia_marcas USING btree (user_id, ts DESC);
CREATE INDEX idx_cz_vin ON conversion_zonas USING btree (vin) WHERE (vin IS NOT NULL);
CREATE INDEX idx_dupla_miembro_dupla ON despacho_dupla_miembros USING btree (dupla_id);
CREATE UNIQUE INDEX idx_dupla_miembro_unico ON despacho_dupla_miembros USING btree (jornada_fecha, user_id) WHERE activa;
CREATE INDEX idx_dupla_jornada ON despacho_duplas USING btree (jornada_fecha, estado);
CREATE INDEX idx_pool_jornada ON despacho_pool_snapshot USING btree (jornada_fecha, ts DESC);
CREATE INDEX idx_prop_carro ON despacho_propuestas USING btree (carro_id);
CREATE INDEX idx_prop_jornada ON despacho_propuestas USING btree (jornada_fecha, estado);
CREATE INDEX idx_prop_unidad ON despacho_propuestas USING btree (unidad_dupla_id) WHERE (unidad_dupla_id IS NOT NULL);
CREATE INDEX idx_prop_user ON despacho_propuestas USING btree (user_id, jornada_fecha);
CREATE INDEX idx_prop_vin ON despacho_propuestas USING btree (vin);
CREATE UNIQUE INDEX idx_prop_viva ON despacho_propuestas USING btree (vin, rol_trabajo) WHERE (estado = ANY (ARRAY['PROPUESTA'::estado_propuesta, 'CONFIRMADA'::estado_propuesta]));
CREATE INDEX idx_evt_ts ON eventos USING btree ("timestamp" DESC);
CREATE INDEX idx_evt_user ON eventos USING btree (user_id);
CREATE INDEX idx_evt_wo ON eventos USING btree (work_order_id);
CREATE UNIQUE INDEX idx_hcat_nombre_lower ON herramientas_catalogo USING btree (lower(nombre));
CREATE INDEX idx_inc_mes ON incidencias USING btree (mes);
CREATE INDEX idx_inc_tipo ON incidencias USING btree (tipo);
CREATE INDEX idx_inc_vin ON incidencias USING btree (vin) WHERE (vin IS NOT NULL);
CREATE INDEX idx_inc_wo ON incidencias USING btree (work_order_id) WHERE (work_order_id IS NOT NULL);
CREATE INDEX informes_taller_cola_idx ON informes_taller USING btree (created_at DESC) WHERE (estado = 'ENVIADO'::estado_informe);
CREATE INDEX informes_taller_creador_idx ON informes_taller USING btree (creado_por, created_at DESC);
CREATE INDEX informes_taller_ot_fisica_idx ON informes_taller USING btree (ot_fisica) WHERE (ot_fisica <> ''::text);
CREATE INDEX informes_taller_ot_idx ON informes_taller USING btree (work_order_id);
CREATE UNIQUE INDEX informes_taller_ot_vivo_idx ON informes_taller USING btree (work_order_id) WHERE (estado = ANY (ARRAY['BORRADOR'::estado_informe, 'ENVIADO'::estado_informe]));
CREATE INDEX idx_kit_items_kit ON inventario_kit_items USING btree (kit_id);
CREATE INDEX idx_inv_mov_destino ON inventario_movimientos USING btree (destino_user_id);
CREATE INDEX idx_inv_mov_fecha ON inventario_movimientos USING btree (created_at DESC);
CREATE INDEX idx_inv_mov_origen ON inventario_movimientos USING btree (origen_user_id);
CREATE INDEX idx_inv_stock_herr ON inventario_stock USING btree (herramienta_id);
CREATE INDEX idx_inv_lote_estado ON inventario_stock_lotes USING btree (estado);
CREATE INDEX idx_inv_lote_herr ON inventario_stock_lotes USING btree (herramienta_id);
CREATE UNIQUE INDEX idx_inv_stku_codigo_uniq ON inventario_stock_unidades USING btree (lower(codigo)) WHERE (codigo <> ''::text);
CREATE INDEX idx_inv_stku_estado ON inventario_stock_unidades USING btree (estado);
CREATE INDEX idx_inv_stku_herr ON inventario_stock_unidades USING btree (herramienta_id);
CREATE UNIQUE INDEX idx_inv_stku_serie_uniq ON inventario_stock_unidades USING btree (lower(serie)) WHERE (serie <> ''::text);
CREATE INDEX idx_inv_tec_user ON inventario_tecnico USING btree (user_id);
CREATE INDEX idx_inv_items_codigo ON inventario_tecnico_items USING btree (lower(codigo)) WHERE (codigo <> ''::text);
CREATE UNIQUE INDEX idx_inv_items_codigo_uniq ON inventario_tecnico_items USING btree (lower(codigo)) WHERE (codigo <> ''::text);
CREATE INDEX idx_inv_items_serie ON inventario_tecnico_items USING btree (lower(serie)) WHERE (serie <> ''::text);
CREATE UNIQUE INDEX idx_inv_items_serie_uniq ON inventario_tecnico_items USING btree (lower(serie)) WHERE (serie <> ''::text);
CREATE INDEX idx_inv_tec_items_estado ON inventario_tecnico_items USING btree (estado);
CREATE INDEX idx_inv_tec_items_inv ON inventario_tecnico_items USING btree (inventario_id);
CREATE INDEX idx_mov_traslados_estado ON movilizador_traslados USING btree (estado);
CREATE INDEX idx_po_fecha ON pairing_omisiones USING btree (created_at DESC);
CREATE INDEX idx_po_user ON pairing_omisiones USING btree (user_id);
CREATE INDEX idx_ramal_item_tipo ON ramal_lote_items USING btree (tipo_ramal);
CREATE UNIQUE INDEX idx_ramal_item_uniq ON ramal_lote_items USING btree (lote_id, tipo_ramal);
CREATE UNIQUE INDEX idx_ramal_lote_codigo ON ramal_lotes USING btree (codigo) WHERE (codigo <> ''::text);
CREATE INDEX idx_ramal_lote_enc ON ramal_lotes USING btree (encargado_user_id);
CREATE INDEX idx_ramal_lote_estado ON ramal_lotes USING btree (estado);
CREATE INDEX idx_ramal_lote_fecha ON ramal_lotes USING btree (fecha DESC);
CREATE INDEX idx_ramal_mov_lote ON ramal_movimientos USING btree (lote_id);
CREATE INDEX idx_ramal_mov_tipo ON ramal_movimientos USING btree (tipo);
CREATE INDEX idx_ramal_mov_tr ON ramal_movimientos USING btree (tipo_ramal);
CREATE INDEX idx_ramal_mov_ts ON ramal_movimientos USING btree (created_at DESC);
CREATE INDEX idx_ramal_mov_user ON ramal_movimientos USING btree (user_id);
CREATE INDEX idx_ramal_reparto_lote ON ramal_repartos USING btree (lote_id);
CREATE UNIQUE INDEX idx_ramal_reparto_uniq ON ramal_repartos USING btree (lote_id, user_id, tipo_ramal) WHERE (tipo_ramal IS NOT NULL);
CREATE UNIQUE INDEX idx_ramal_reparto_uniq_sin_marca ON ramal_repartos USING btree (lote_id, user_id) WHERE (tipo_ramal IS NULL);
CREATE INDEX idx_ramal_reparto_user ON ramal_repartos USING btree (user_id);
CREATE INDEX idx_sol_ramal_estado ON solicitudes_ramal USING btree (estado);
CREATE INDEX idx_sol_ramal_ts ON solicitudes_ramal USING btree (created_at DESC);
CREATE INDEX idx_sol_ramal_vin ON solicitudes_ramal USING btree (vin);
CREATE INDEX idx_usuarios_activo ON usuarios USING btree (activo) WHERE (activo = true);
CREATE INDEX idx_usuarios_email ON usuarios USING btree (email);
CREATE INDEX idx_vins_cliente ON vins USING btree (cliente);
CREATE INDEX idx_vins_estado ON vins USING btree (estado) WHERE (estado <> ''::text);
CREATE INDEX idx_vins_modelo_normalizado ON vins USING btree (modelo_normalizado);
CREATE INDEX idx_wo_estado ON work_orders USING btree (estado_general);
CREATE INDEX idx_wo_fecha_sin_cal ON work_orders USING btree (fecha_sin_calidad) WHERE (fecha_sin_calidad IS NOT NULL);
CREATE INDEX idx_wo_ot ON work_orders USING btree (numero_ot) WHERE (numero_ot <> ''::text);
CREATE INDEX idx_wo_tipo ON work_orders USING btree (tipo_ot);
CREATE INDEX idx_wo_user ON work_orders USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_wo_vin ON work_orders USING btree (vin) WHERE (vin IS NOT NULL);
CREATE INDEX idx_zh_fecha ON zonas_historial USING btree (ocurrido_at DESC);
CREATE INDEX idx_zh_vin ON zonas_historial USING btree (vin, ocurrido_at DESC);
CREATE INDEX idx_zh_zona ON zonas_historial USING btree (zona_id, ocurrido_at DESC);

-- ────────────────────────────────────────────────────────────
--  Vistas (4)
-- ────────────────────────────────────────────────────────────
CREATE VIEW v_ramal_desempeno AS
 SELECT u.id AS user_id,
    u.nombre,
    u.email,
    COALESCE(d.lotes, 0::bigint) AS lotes_revisados,
    round(d.revision_min_prom, 1) AS revision_min_prom,
    COALESCE(p.repartos, 0::bigint) AS repartos,
    COALESCE(p.asignados, 0::bigint) AS ramales_asignados,
    COALESCE(p.devueltos, 0::bigint) AS ramales_devueltos,
    COALESCE(p.rechazados, 0::bigint) AS ramales_rechazados,
    round(p.armado_min_prom, 1) AS armado_min_por_ramal,
        CASE
            WHEN COALESCE(p.devueltos, 0::bigint) > 0 THEN round(100.0 * p.rechazados::numeric / p.devueltos::numeric, 1)
            ELSE 0::numeric
        END AS pct_rechazo,
    COALESCE(e.entregas, 0::bigint) AS entregas_a_tecnicos
   FROM usuarios u
     JOIN usuario_modulos um ON um.user_id = u.id AND um.modulo = 'RAMALERO'::modulo
     LEFT JOIN ( SELECT ramal_lotes.encargado_user_id AS uid,
            count(*) AS lotes,
            avg(EXTRACT(epoch FROM ramal_lotes.revision_fin_at - ramal_lotes.revision_inicio_at) / 60.0) AS revision_min_prom
           FROM ramal_lotes
          WHERE ramal_lotes.encargado_user_id IS NOT NULL AND ramal_lotes.revision_inicio_at IS NOT NULL AND ramal_lotes.revision_fin_at IS NOT NULL
          GROUP BY ramal_lotes.encargado_user_id) d ON d.uid = u.id
     LEFT JOIN ( SELECT ramal_repartos.user_id AS uid,
            count(*) AS repartos,
            sum(ramal_repartos.cantidad_asignada) AS asignados,
            sum(ramal_repartos.cantidad_devuelta) AS devueltos,
            sum(ramal_repartos.cantidad_rechazada) AS rechazados,
            avg(
                CASE
                    WHEN ramal_repartos.cantidad_devuelta > 0 AND ramal_repartos.devuelto_at IS NOT NULL THEN EXTRACT(epoch FROM ramal_repartos.devuelto_at - ramal_repartos.asignado_at) / 60.0 / ramal_repartos.cantidad_devuelta::numeric
                    ELSE NULL::numeric
                END) AS armado_min_prom
           FROM ramal_repartos
          GROUP BY ramal_repartos.user_id) p ON p.uid = u.id
     LEFT JOIN ( SELECT ramal_movimientos.user_id AS uid,
            count(*) AS entregas
           FROM ramal_movimientos
          WHERE ramal_movimientos.tipo = 'ENTREGA'::tipo_mov_ramal AND ramal_movimientos.user_id IS NOT NULL
          GROUP BY ramal_movimientos.user_id) e ON e.uid = u.id
  WHERE u.activo = true;

CREATE VIEW v_ramal_lote_items AS
 SELECT i.lote_id,
    l.codigo,
    l.fecha,
    l.estado,
    i.tipo_ramal,
    i.cantidad,
    COALESCE(r.asignados, 0::bigint) AS repartidos,
    COALESCE(r.devueltos, 0::bigint) AS devueltos,
    COALESCE(r.rechazados, 0::bigint) AS rechazados,
    COALESCE(r.asignados, 0::bigint) - COALESCE(r.devueltos, 0::bigint) AS en_proceso,
    i.cantidad - COALESCE(r.asignados, 0::bigint) AS sin_repartir
   FROM ramal_lote_items i
     JOIN ramal_lotes l ON l.id = i.lote_id
     LEFT JOIN ( SELECT ramal_repartos.lote_id,
            ramal_repartos.tipo_ramal,
            sum(ramal_repartos.cantidad_asignada) AS asignados,
            sum(ramal_repartos.cantidad_devuelta) AS devueltos,
            sum(ramal_repartos.cantidad_rechazada) AS rechazados
           FROM ramal_repartos
          WHERE ramal_repartos.tipo_ramal IS NOT NULL
          GROUP BY ramal_repartos.lote_id, ramal_repartos.tipo_ramal) r ON r.lote_id = i.lote_id AND r.tipo_ramal = i.tipo_ramal;

CREATE VIEW v_ramal_stock AS
 SELECT c.tipo_ramal,
    COALESCE(m.saldo, 0::bigint) AS disponible,
    COALESCE(t.trabajando, 0::bigint) AS trabajando,
    COALESCE(m.saldo, 0::bigint) + COALESCE(t.trabajando, 0::bigint) AS total,
    COALESCE(m.armados, 0::bigint) AS armados_hist,
    COALESCE(m.entregados, 0::bigint) AS entregados_hist,
    c.stock_minimo,
    COALESCE(m.saldo, 0::bigint) < c.stock_minimo AS bajo_minimo,
    c.ubicacion
   FROM ramal_stock_config c
     LEFT JOIN ( SELECT ramal_movimientos.tipo_ramal,
            sum(ramal_movimientos.cantidad) AS saldo,
            COALESCE(sum(ramal_movimientos.cantidad) FILTER (WHERE ramal_movimientos.tipo = 'ARMADO'::tipo_mov_ramal), 0::bigint) AS armados,
            - COALESCE(sum(ramal_movimientos.cantidad) FILTER (WHERE ramal_movimientos.tipo = 'ENTREGA'::tipo_mov_ramal), 0::bigint) AS entregados
           FROM ramal_movimientos
          WHERE ramal_movimientos.tipo_ramal IS NOT NULL
          GROUP BY ramal_movimientos.tipo_ramal) m ON m.tipo_ramal = c.tipo_ramal
     LEFT JOIN ( SELECT ramal_repartos.tipo_ramal,
            sum(ramal_repartos.cantidad_asignada - ramal_repartos.cantidad_devuelta) AS trabajando
           FROM ramal_repartos
          WHERE ramal_repartos.devuelto_at IS NULL AND ramal_repartos.tipo_ramal IS NOT NULL
          GROUP BY ramal_repartos.tipo_ramal) t ON t.tipo_ramal = c.tipo_ramal;

CREATE VIEW v_ramal_lote_arqueo AS
 SELECT l.id AS lote_id,
    l.codigo,
    l.fecha,
    l.estado,
    l.cantidad_equipos,
    ue.nombre AS encargado,
    COALESCE(it.marcas, ''::text) AS marcas,
    COALESCE(it.lineas, 0::bigint) AS lineas,
    COALESCE(r.asignados, 0::bigint) AS repartidos,
    COALESCE(r.devueltos, 0::bigint) AS devueltos,
    COALESCE(r.rechazados, 0::bigint) AS rechazados,
    l.merma,
    l.merma_motivo,
    l.revision_inicio_at,
    l.revision_aviso_at,
    l.revision_fin_at,
    l.revision_conformes,
    l.revision_observados,
    l.revision_nota,
    COALESCE(r.asignados, 0::bigint) - COALESCE(r.devueltos, 0::bigint) AS en_proceso,
    l.cantidad_equipos - COALESCE(r.asignados, 0::bigint) - l.merma AS sin_repartir,
        CASE
            WHEN (l.cantidad_equipos - COALESCE(r.asignados, 0::bigint) - l.merma) < 0 THEN (l.cantidad_equipos - COALESCE(r.asignados, 0::bigint) - l.merma)::numeric
            WHEN COALESCE(r.devueltos, 0::bigint) > COALESCE(r.asignados, 0::bigint) THEN (COALESCE(r.asignados, 0::bigint) - COALESCE(r.devueltos, 0::bigint))::numeric
            WHEN COALESCE(it.exceso_marca, 0::numeric) > 0::numeric THEN - COALESCE(it.exceso_marca, 0::numeric)
            ELSE 0::numeric
        END AS descuadre,
    EXTRACT(epoch FROM l.revision_fin_at - l.revision_inicio_at) / 60.0 AS revision_min,
    EXTRACT(epoch FROM l.revision_aviso_at - l.revision_inicio_at) / 60.0 AS revision_declarada_min,
    l.encargado_sugerido_id IS NOT NULL AND l.encargado_user_id IS DISTINCT FROM l.encargado_sugerido_id AS turno_pisado
   FROM ramal_lotes l
     LEFT JOIN usuarios ue ON ue.id = l.encargado_user_id
     LEFT JOIN ( SELECT ramal_repartos.lote_id,
            sum(ramal_repartos.cantidad_asignada) AS asignados,
            sum(ramal_repartos.cantidad_devuelta) AS devueltos,
            sum(ramal_repartos.cantidad_rechazada) AS rechazados
           FROM ramal_repartos
          GROUP BY ramal_repartos.lote_id) r ON r.lote_id = l.id
     LEFT JOIN ( SELECT v_ramal_lote_items.lote_id,
            count(*) AS lineas,
            string_agg((v_ramal_lote_items.cantidad || ' '::text) || v_ramal_lote_items.tipo_ramal, ' · '::text ORDER BY v_ramal_lote_items.tipo_ramal) AS marcas,
            sum(GREATEST(0::bigint, - v_ramal_lote_items.sin_repartir)) AS exceso_marca
           FROM v_ramal_lote_items
          GROUP BY v_ramal_lote_items.lote_id) it ON it.lote_id = l.id;

-- ────────────────────────────────────────────────────────────
--  Triggers (3)
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_dupla_max_dos AFTER INSERT ON despacho_dupla_miembros FOR EACH ROW EXECUTE FUNCTION glp_dupla_max_dos();
CREATE TRIGGER trg_inventario_stock_autocrear AFTER INSERT ON herramientas_catalogo FOR EACH ROW EXECUTE FUNCTION inventario_stock_autocrear_();
CREATE TRIGGER informes_taller_touch BEFORE UPDATE ON informes_taller FOR EACH ROW EXECUTE FUNCTION informes_taller_touch_();

-- ────────────────────────────────────────────────────────────
--  Seguridad por fila (RLS) y políticas (35)
-- ────────────────────────────────────────────────────────────
ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_jornada ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_dupla_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_duplas ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_pool_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE despacho_propuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE herramientas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE informes_taller ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_kit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_stock_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_stock_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_tecnico ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_tecnico_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_diaria_activa ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE movilizador_observaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE movilizador_traslados ENABLE ROW LEVEL SECURITY;
ALTER TABLE produccion_horas_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramal_lote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramal_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramal_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramal_repartos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramal_stock_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_ramal ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE vins ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE zona_libre ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonas_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_full_access ON asignaciones AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON asistencia_jornada AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON asistencia_marcas AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON conversion_zonas AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON despacho_dupla_miembros AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON despacho_duplas AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON despacho_pool_snapshot AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON despacho_propuestas AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON eventos AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON herramientas_catalogo AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON incidencias AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_kit_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_kits AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_movimientos AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_stock AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_stock_lotes AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_stock_unidades AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_tecnico AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON inventario_tecnico_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON lista_diaria_activa AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON ml_models AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON movilizador_traslados AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON ramal_lote_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON ramal_lotes AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON ramal_movimientos AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON ramal_repartos AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON ramal_stock_config AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON solicitudes_ramal AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON usuario_modulos AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON usuarios AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON vins AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON work_orders AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_full_access ON zona_libre AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY service_insert ON zonas_historial AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY service_select ON zonas_historial AS PERMISSIVE FOR SELECT TO public USING (true);

-- ────────────────────────────────────────────────────────────
--  Comentarios
-- ────────────────────────────────────────────────────────────
COMMENT ON COLUMN vins.estado IS 'ESTADO de ASIGNACIONES col AE. ANULADO / DELEGADO sacan al carro del flujo GLP; vacío u otro valor = normal.';
COMMENT ON TABLE zona_libre IS 'Carros en el área de desborde. Se asigna a mano, como las 15 plazas. Un carro sale de aquí al entrar en calidad o al colocarse en una plaza.';
