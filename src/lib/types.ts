export type TipoOperacion = 'distribuidora_flotilla' | 'pyme_tercerizada';

export type UnidadMedida = 'unidades' | 'cajas' | 'bultos' | 'kg';

export type OrigenInput = 'texto' | 'imagen_ocr' | 'pdf' | 'audio';

export type EstadoFactura = 'pendiente' | 'facturado' | 'no_requiere';

export type ModalidadEnvio = 'flotilla_propia' | 'proveedor_externo';

export type EstadoEntregaPedido = 'pendiente_ruta' | 'en_ruta' | 'entregado' | 'rechazado';

export type EstadoViaje = 'planificado' | 'en_curso' | 'completado' | 'con_incidencia';

export type EstadoParada = 'pendiente' | 'en_sitio' | 'entregado' | 'rechazo_parcial' | 'rechazado';

export type TipoGasto = 'combustible' | 'peaje' | 'courier_externo';

export type SectorCliente = 'abarrotes' | 'ferreteria' | 'insumos_medicos' | 'alimentos';

export interface EmpresaConfig {
  id: string;
  nombre: string;
  tipo_operacion: TipoOperacion;
  unidad_medida_default: UnidadMedida;
  api_inventario_url: string | null;
  api_facturacion_url: string | null;
  api_courier_url: string | null;
}

export interface ProductoInventario {
  id: string;
  empresa_id: string;
  sku: string;
  nombre: string;
  sector: SectorCliente;
  unidad_medida: UnidadMedida;
  precio_unitario: number;
  stock_actual: number;
  ultima_sincronizacion_api: string;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  nombre: string;
  cedula_juridica: string;
  correo_facturacion: string;
  telefono: string;
  sector: SectorCliente;
  zona: string;
  ventana_inicio: string;
  ventana_fin: string;
  lat: number;
  lng: number;
}

export interface PedidoItem {
  sku: string;
  nombre: string;
  cantidad: number;
  unidad: UnidadMedida;
  precio: number;
}

export interface Pedido {
  id: string;
  empresa_id: string;
  codigo_tracking: string;
  cliente_id: string;
  origen_input: OrigenInput;
  raw_input_url: string | null;
  items_json: PedidoItem[];
  subtotal: number;
  iva: number;
  total: number;
  estado_factura: EstadoFactura;
  numero_factura_externa: string | null;
  modalidad_envio: ModalidadEnvio;
  proveedor_externo_nombre: string | null;
  tracking_externo_url: string | null;
  estado_entrega: EstadoEntregaPedido;
  created_at: string;
}

export interface Vehiculo {
  id: string;
  empresa_id: string;
  placa: string;
  modelo: string;
  capacidad_carga: number;
  unidad_capacidad: UnidadMedida;
  rendimiento_km_litro: number;
  costo_alquiler_diario: number;
  mantenimiento_por_km: number;
}

export interface Tramo {
  id: string;
  empresa_id: string;
  ruta_nombre: string;
  zona_origen: string;
  zona_destino: string;
  distancia_planificada_km: number;
  tiempo_estimado_min: number;
  peajes_estimados_colones: number;
}

export interface ParametroCosto {
  id: string;
  empresa_id: string;
  salario_chofer_diario: number;
  salario_ayudante_diario: number;
  viaticos_diarios: number;
  precio_combustible_litro: number;
  iva_porcentaje: number;
  vigente_desde: string;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface Viaje {
  id: string;
  empresa_id: string;
  fecha: string;
  ruta_nombre: string;
  tramo_id: string;
  vehiculo_id: string;
  chofer_nombre: string;
  estado: EstadoViaje;
  odometro_inicio: number;
  foto_odometro_inicio: string;
  hora_salida: string;
  gps_salida: GpsPoint;
  carga_total_inicial: number;
  unidad_carga: UnidadMedida;
  odometro_fin: number;
  foto_odometro_fin: string;
  hora_regreso: string;
  gps_regreso: GpsPoint;
}

export interface Entrega {
  id: string;
  empresa_id: string;
  viaje_id: string | null;
  pedido_id: string;
  cliente_id: string;
  orden: number;
  hora_llegada: string | null;
  gps_llegada: GpsPoint | null;
  hora_salida: string | null;
  cantidad_entregada: number;
  cantidad_rechazada: number;
  unidad_medida: UnidadMedida;
  motivo_rechazo: string | null;
  foto_comprobante: string | null;
  estado: EstadoParada;
}

export interface Gasto {
  id: string;
  empresa_id: string;
  viaje_id: string | null;
  pedido_id: string | null;
  tipo: TipoGasto;
  litros: number | null;
  monto_colones: number;
  foto_factura: string | null;
  fecha_gasto: string;
}

export interface SeedDataset {
  empresas_config: EmpresaConfig[];
  productos_inventario: ProductoInventario[];
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  tramos: Tramo[];
  parametros_costo: ParametroCosto[];
  pedidos: Pedido[];
  viajes: Viaje[];
  entregas: Entrega[];
  gastos: Gasto[];
  anomaliesSummary: {
    excessiveWaitClientId: string;
    excessiveWaitClientName: string;
    excessiveWaitDeliveries: number;
    maxWaitMinutes: number;
    odometerDeviationRoute: string;
    odometerDeviationMaxKm: number;
    recurringRejectionClientId: string;
    recurringRejectionClientName: string;
    recurringRejectionCount: number;
  };
}
