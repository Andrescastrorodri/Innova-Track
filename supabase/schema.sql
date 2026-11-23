-- ============================================================================
-- Innova Track — Esquema SQL Multi-Empresa (Supabase / PostgreSQL)
-- Plataforma SaaS de ingesta inteligente, facturación, despacho y logística
-- Agnóstico al tipo de carga: unidades, cajas, bultos o kg
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Configuración Multi-Empresa
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresas_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo_operacion text NOT NULL CHECK (tipo_operacion IN ('distribuidora_flotilla', 'pyme_tercerizada')),
  unidad_medida_default text NOT NULL DEFAULT 'unidades' CHECK (unidad_medida_default IN ('unidades', 'cajas', 'bultos', 'kg')),
  api_inventario_url text,
  api_facturacion_url text,
  api_courier_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Inventario de Productos (Sincronizable vía API ERP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.productos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  sku text NOT NULL,
  nombre text NOT NULL,
  sector text NOT NULL DEFAULT 'abarrotes' CHECK (sector IN ('abarrotes', 'ferreteria', 'insumos_medicos', 'alimentos')),
  unidad_medida text NOT NULL CHECK (unidad_medida IN ('unidades', 'cajas', 'bultos', 'kg')),
  precio_unitario numeric(12, 2) NOT NULL CHECK (precio_unitario >= 0),
  stock_actual numeric(12, 2) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  ultima_sincronizacion_api timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, sku)
);

-- ----------------------------------------------------------------------------
-- 3. Clientes y Ventanas Horarias
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cedula_juridica text NOT NULL,
  correo_facturacion text NOT NULL,
  telefono text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT 'abarrotes' CHECK (sector IN ('abarrotes', 'ferreteria', 'insumos_medicos', 'alimentos')),
  zona text NOT NULL,
  ventana_inicio time NOT NULL DEFAULT '08:00:00',
  ventana_fin time NOT NULL DEFAULT '17:00:00',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Pedidos (Ingesta multimodal + Facturación + Modalidad de envío)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  codigo_tracking text NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  origen_input text NOT NULL CHECK (origen_input IN ('texto', 'imagen_ocr', 'pdf', 'audio')),
  raw_input_url text,
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  iva numeric(12, 2) NOT NULL DEFAULT 0 CHECK (iva >= 0),
  total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  estado_factura text NOT NULL DEFAULT 'pendiente' CHECK (estado_factura IN ('pendiente', 'facturado', 'no_requiere')),
  numero_factura_externa text,
  modalidad_envio text NOT NULL CHECK (modalidad_envio IN ('flotilla_propia', 'proveedor_externo')),
  proveedor_externo_nombre text,
  tracking_externo_url text,
  estado_entrega text NOT NULL DEFAULT 'pendiente_ruta' CHECK (estado_entrega IN ('pendiente_ruta', 'en_ruta', 'entregado', 'rechazado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. Flotilla de Vehículos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  placa text NOT NULL,
  modelo text NOT NULL,
  capacidad_carga numeric(12, 2) NOT NULL CHECK (capacidad_carga > 0),
  unidad_capacidad text NOT NULL DEFAULT 'kg' CHECK (unidad_capacidad IN ('unidades', 'cajas', 'bultos', 'kg')),
  rendimiento_km_litro numeric(6, 2) NOT NULL CHECK (rendimiento_km_litro > 0),
  costo_alquiler_diario numeric(12, 2) NOT NULL DEFAULT 0 CHECK (costo_alquiler_diario >= 0),
  mantenimiento_por_km numeric(10, 2) NOT NULL DEFAULT 0 CHECK (mantenimiento_por_km >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, placa)
);

-- ----------------------------------------------------------------------------
-- 6. Tramos Planificados y Parámetros de Costo Operativo
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tramos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  ruta_nombre text NOT NULL,
  zona_origen text NOT NULL,
  zona_destino text NOT NULL,
  distancia_planificada_km numeric(8, 2) NOT NULL CHECK (distancia_planificada_km > 0),
  tiempo_estimado_min integer NOT NULL CHECK (tiempo_estimado_min > 0),
  peajes_estimados_colones numeric(10, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ruta_nombre)
);

CREATE TABLE IF NOT EXISTS public.parametros_costo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  salario_chofer_diario numeric(12, 2) NOT NULL CHECK (salario_chofer_diario >= 0),
  salario_ayudante_diario numeric(12, 2) NOT NULL DEFAULT 0 CHECK (salario_ayudante_diario >= 0),
  viaticos_diarios numeric(12, 2) NOT NULL DEFAULT 0 CHECK (viaticos_diarios >= 0),
  precio_combustible_litro numeric(10, 2) NOT NULL CHECK (precio_combustible_litro > 0),
  iva_porcentaje numeric(5, 2) NOT NULL DEFAULT 13.00,
  vigente_desde date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. Viajes de Flotilla Propia
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.viajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  ruta_nombre text NOT NULL,
  tramo_id uuid REFERENCES public.tramos(id) ON DELETE SET NULL,
  vehiculo_id uuid NOT NULL REFERENCES public.vehiculos(id) ON DELETE RESTRICT,
  chofer_nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'planificado' CHECK (estado IN ('planificado', 'en_curso', 'completado', 'con_incidencia')),
  odometro_inicio numeric(10, 1),
  foto_odometro_inicio text,
  hora_salida timestamptz,
  gps_salida jsonb,
  carga_total_inicial numeric(12, 2) NOT NULL DEFAULT 0,
  unidad_carga text NOT NULL DEFAULT 'unidades' CHECK (unidad_carga IN ('unidades', 'cajas', 'bultos', 'kg')),
  odometro_fin numeric(10, 1),
  foto_odometro_fin text,
  hora_regreso timestamptz,
  gps_regreso jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. Entregas (Vincula Viaje, Pedido y Cliente)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  viaje_id uuid REFERENCES public.viajes(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  orden integer NOT NULL DEFAULT 1,
  hora_llegada timestamptz,
  gps_llegada jsonb,
  hora_salida timestamptz,
  cantidad_entregada numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_entregada >= 0),
  cantidad_rechazada numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cantidad_rechazada >= 0),
  unidad_medida text NOT NULL DEFAULT 'unidades' CHECK (unidad_medida IN ('unidades', 'cajas', 'bultos', 'kg')),
  motivo_rechazo text,
  foto_comprobante text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_sitio', 'entregado', 'rechazo_parcial', 'rechazado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 9. Gastos Operativos y Courier Externo
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas_config(id) ON DELETE CASCADE,
  viaje_id uuid REFERENCES public.viajes(id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('combustible', 'peaje', 'courier_externo')),
  litros numeric(8, 2),
  monto_colones numeric(12, 2) NOT NULL CHECK (monto_colones >= 0),
  foto_factura text,
  fecha_gasto timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Seguridad: Row Level Security
-- La app escribe y lee desde el servidor con SUPABASE_SERVICE_ROLE_KEY, que no pasa por RLS.
-- Con RLS activo y sin políticas, la llave pública (anon) no puede leer ni modificar estas tablas.
-- Nota: los campos de viaje que types.ts declara obligatorios (odómetros, fotos, horas, GPS)
-- son anulables aquí porque un viaje en curso todavía no tiene datos de cierre.
-- ----------------------------------------------------------------------------
ALTER TABLE public.empresas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tramos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros_costo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Índices de Desempeño
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_productos_empresa ON public.productos_inventario(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_zona ON public.clientes(empresa_id, zona);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_estado ON public.pedidos(empresa_id, estado_entrega);
CREATE INDEX IF NOT EXISTS idx_pedidos_tracking ON public.pedidos(codigo_tracking);
CREATE INDEX IF NOT EXISTS idx_viajes_empresa_fecha ON public.viajes(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_entregas_viaje ON public.entregas(viaje_id, orden);
CREATE INDEX IF NOT EXISTS idx_entregas_cliente ON public.entregas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_viaje ON public.gastos(viaje_id);

-- ----------------------------------------------------------------------------
-- 10. Vistas SQL Analíticas
-- ----------------------------------------------------------------------------

-- Vista A: Métricas de Entrega (Tiempos de espera y cumplimiento de ventana)
CREATE OR REPLACE VIEW public.vista_metricas_entrega AS
SELECT
  e.id AS entrega_id,
  e.empresa_id,
  e.viaje_id,
  v.fecha,
  v.ruta_nombre,
  v.chofer_nombre,
  e.pedido_id,
  p.codigo_tracking,
  e.cliente_id,
  c.nombre AS cliente_nombre,
  c.zona,
  c.sector,
  c.ventana_inicio,
  c.ventana_fin,
  e.orden,
  e.hora_llegada,
  e.hora_salida,
  (e.hora_llegada AT TIME ZONE 'America/Costa_Rica')::time AS hora_llegada_local,
  ROUND(
    EXTRACT(EPOCH FROM (e.hora_salida - e.hora_llegada)) / 60.0,
    1
  ) AS tiempo_espera_min,
  CASE
    WHEN e.hora_llegada IS NULL THEN NULL
    WHEN (e.hora_llegada AT TIME ZONE 'America/Costa_Rica')::time BETWEEN c.ventana_inicio AND c.ventana_fin THEN true
    ELSE false
  END AS cumple_ventana,
  CASE
    WHEN e.hora_llegada IS NULL THEN 0
    WHEN (e.hora_llegada AT TIME ZONE 'America/Costa_Rica')::time > c.ventana_fin
      THEN ROUND(EXTRACT(EPOCH FROM ((e.hora_llegada AT TIME ZONE 'America/Costa_Rica')::time - c.ventana_fin)) / 60.0, 1)
    ELSE 0
  END AS retraso_ventana_min,
  e.cantidad_entregada,
  e.cantidad_rechazada,
  e.unidad_medida,
  CASE
    WHEN (e.cantidad_entregada + e.cantidad_rechazada) > 0
      THEN ROUND((e.cantidad_rechazada / (e.cantidad_entregada + e.cantidad_rechazada)) * 100.0, 2)
    ELSE 0
  END AS tasa_rechazo_pct,
  e.motivo_rechazo,
  e.estado
FROM public.entregas e
JOIN public.clientes c ON c.id = e.cliente_id
JOIN public.pedidos p ON p.id = e.pedido_id
LEFT JOIN public.viajes v ON v.id = e.viaje_id;

-- Vista B: Costos de Operación (Costo/km, Costo/unidad-bulto-kg y desviación de odómetro)
CREATE OR REPLACE VIEW public.vista_costos_operacion AS
WITH entregas_agg AS (
  SELECT
    viaje_id,
    COUNT(*) AS total_paradas,
    COALESCE(SUM(cantidad_entregada), 0) AS total_entregado,
    COALESCE(SUM(cantidad_rechazada), 0) AS total_rechazado,
    COUNT(*) FILTER (WHERE estado IN ('rechazado', 'rechazo_parcial')) AS entregas_con_rechazo
  FROM public.entregas
  WHERE viaje_id IS NOT NULL
  GROUP BY viaje_id
),
gastos_agg AS (
  SELECT
    viaje_id,
    COALESCE(SUM(monto_colones) FILTER (WHERE tipo = 'combustible'), 0) AS gasto_combustible_colones,
    COALESCE(SUM(litros) FILTER (WHERE tipo = 'combustible'), 0) AS litros_combustible,
    COALESCE(SUM(monto_colones) FILTER (WHERE tipo = 'peaje'), 0) AS gasto_peajes_colones,
    COALESCE(SUM(monto_colones) FILTER (WHERE tipo = 'courier_externo'), 0) AS gasto_courier_colones,
    COALESCE(SUM(monto_colones), 0) AS total_gastos_directos_colones
  FROM public.gastos
  WHERE viaje_id IS NOT NULL
  GROUP BY viaje_id
)
SELECT
  v.id AS viaje_id,
  v.empresa_id,
  v.fecha,
  v.ruta_nombre,
  v.chofer_nombre,
  v.estado,
  veh.placa,
  veh.modelo,
  v.unidad_carga,
  v.carga_total_inicial,
  COALESCE(ea.total_paradas, 0) AS total_paradas,
  COALESCE(ea.total_entregado, 0) AS total_entregado,
  COALESCE(ea.total_rechazado, 0) AS total_rechazado,
  COALESCE(ea.entregas_con_rechazo, 0) AS entregas_con_rechazo,
  v.odometro_inicio,
  v.odometro_fin,
  COALESCE(v.odometro_fin - v.odometro_inicio, 0) AS km_recorridos,
  COALESCE(t.distancia_planificada_km, 0) AS km_planificados,
  ROUND(
    COALESCE(v.odometro_fin - v.odometro_inicio, 0) - COALESCE(t.distancia_planificada_km, 0),
    2
  ) AS desviacion_odometro_km,
  veh.costo_alquiler_diario AS costo_alquiler_colones,
  ROUND(COALESCE(v.odometro_fin - v.odometro_inicio, 0) * veh.mantenimiento_por_km, 2) AS costo_mantenimiento_colones,
  COALESCE(pc.salario_chofer_diario, 0) + COALESCE(pc.salario_ayudante_diario, 0) + COALESCE(pc.viaticos_diarios, 0) AS costo_mano_obra_colones,
  COALESCE(ga.gasto_combustible_colones, 0) AS gasto_combustible_colones,
  COALESCE(ga.litros_combustible, 0) AS litros_combustible,
  COALESCE(ga.gasto_peajes_colones, 0) AS gasto_peajes_colones,
  COALESCE(ga.total_gastos_directos_colones, 0) AS total_gastos_directos_colones,
  ROUND(
    veh.costo_alquiler_diario
    + (COALESCE(v.odometro_fin - v.odometro_inicio, 0) * veh.mantenimiento_por_km)
    + COALESCE(pc.salario_chofer_diario, 0)
    + COALESCE(pc.salario_ayudante_diario, 0)
    + COALESCE(pc.viaticos_diarios, 0)
    + COALESCE(ga.total_gastos_directos_colones, 0),
    2
  ) AS costo_total_colones,
  ROUND(
    (
      veh.costo_alquiler_diario
      + (COALESCE(v.odometro_fin - v.odometro_inicio, 0) * veh.mantenimiento_por_km)
      + COALESCE(pc.salario_chofer_diario, 0)
      + COALESCE(pc.salario_ayudante_diario, 0)
      + COALESCE(pc.viaticos_diarios, 0)
      + COALESCE(ga.total_gastos_directos_colones, 0)
    ) / NULLIF(v.odometro_fin - v.odometro_inicio, 0),
    2
  ) AS costo_por_km,
  ROUND(
    (
      veh.costo_alquiler_diario
      + (COALESCE(v.odometro_fin - v.odometro_inicio, 0) * veh.mantenimiento_por_km)
      + COALESCE(pc.salario_chofer_diario, 0)
      + COALESCE(pc.salario_ayudante_diario, 0)
      + COALESCE(pc.viaticos_diarios, 0)
      + COALESCE(ga.total_gastos_directos_colones, 0)
    ) / NULLIF(ea.total_entregado, 0),
    2
  ) AS costo_por_unidad_entregada
FROM public.viajes v
JOIN public.vehiculos veh ON veh.id = v.vehiculo_id
LEFT JOIN public.tramos t ON t.id = v.tramo_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.parametros_costo p
  WHERE p.empresa_id = v.empresa_id AND p.vigente_desde <= v.fecha
  ORDER BY p.vigente_desde DESC
  LIMIT 1
) pc ON true
LEFT JOIN entregas_agg ea ON ea.viaje_id = v.id
LEFT JOIN gastos_agg ga ON ga.viaje_id = v.id;

-- ----------------------------------------------------------------------------
-- 11. Bucket Público de Storage: evidencias
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidencias', 'evidencias', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de acceso para el bucket público 'evidencias'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'evidencias_public_read'
  ) THEN
    CREATE POLICY "evidencias_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'evidencias');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'evidencias_authenticated_insert'
  ) THEN
    CREATE POLICY "evidencias_authenticated_insert"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'evidencias');
  END IF;
END $$;
