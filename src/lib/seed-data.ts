import type {
  Cliente,
  EmpresaConfig,
  Entrega,
  Gasto,
  OrigenInput,
  ParametroCosto,
  Pedido,
  PedidoItem,
  ProductoInventario,
  SectorCliente,
  SeedDataset,
  Tramo,
  UnidadMedida,
  Vehiculo,
  Viaje,
} from './types';

function uuid(namespaceHex: string, index: number): string {
  const suffix = index.toString(16).padStart(12, '0');
  return `${namespaceHex}-0000-4000-8000-${suffix}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDaysIso(baseDate: string, days: number): string {
  const d = new Date(`${baseDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function crTimestamp(dateStr: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  // Costa Rica is UTC-6 year-round (no DST)
  return `${dateStr}T${hh}:${mm}:00-06:00`;
}

function addMinutesCr(dateStr: string, hour: number, minute: number, deltaMin: number): string {
  const totalMin = hour * 60 + minute + deltaMin;
  const nextHour = Math.floor(totalMin / 60) % 24;
  const nextMin = totalMin % 60;
  return crTimestamp(dateStr, nextHour, nextMin);
}

export function formatColones(amount: number): string {
  const rounded = Math.round(amount);
  const absFormatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rounded < 0 ? `-₡${absFormatted}` : `₡${absFormatted}`;
}

export function formatInt(value: number): string {
  const rounded = Math.round(value);
  const absFormatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rounded < 0 ? `-${absFormatted}` : absFormatted;
}

export function generateSeedDataset(referenceStartDate = '2026-11-06'): SeedDataset {
  const EMPRESA_DIST_ID = uuid('10000000', 1);
  const EMPRESA_PYME_ID = uuid('10000000', 2);

  const empresas_config: EmpresaConfig[] = [
    {
      id: EMPRESA_DIST_ID,
      nombre: 'Distribuidora del Valle Central S.A.',
      tipo_operacion: 'distribuidora_flotilla',
      unidad_medida_default: 'cajas',
      api_inventario_url: 'https://erp.vallecentral.cr/api/v2/inventario/sync',
      api_facturacion_url: 'https://facturacion.vallecentral.cr/hacienda/v4/emitir',
      api_courier_url: 'https://api.correos.go.cr/v1/envios',
    },
    {
      id: EMPRESA_PYME_ID,
      nombre: 'Innova PyME Express S.R.L.',
      tipo_operacion: 'pyme_tercerizada',
      unidad_medida_default: 'unidades',
      api_inventario_url: 'https://erp.innovapyme.cr/webhooks/stock',
      api_facturacion_url: 'https://facturacion.innovapyme.cr/api/comprobantes',
      api_courier_url: 'https://api.moovin.cr/v1/ordenes',
    },
  ];

  // 20 productos multisector con unidades mixtas (cajas, unidades, bultos, kg)
  const rawProducts: Array<{
    sku: string;
    nombre: string;
    sector: SectorCliente;
    unidad_medida: UnidadMedida;
    precio_unitario: number;
    stock_actual: number;
    empresa_id?: string;
  }> = [
    // Abarrotes
    { sku: 'ABR-101', nombre: 'Arroz Grano Entero 99% (Saco 25kg)', sector: 'abarrotes', unidad_medida: 'bultos', precio_unitario: 19800, stock_actual: 240 },
    { sku: 'ABR-102', nombre: 'Aceite Vegetal 1L (Caja x12)', sector: 'abarrotes', unidad_medida: 'cajas', precio_unitario: 22400, stock_actual: 185 },
    { sku: 'ABR-103', nombre: 'Frijol Negro Nacional (Paquete 10x900g)', sector: 'abarrotes', unidad_medida: 'bultos', precio_unitario: 14500, stock_actual: 310 },
    { sku: 'ABR-104', nombre: 'Café Molido Tarrazú 500g (Caja x20)', sector: 'abarrotes', unidad_medida: 'cajas', precio_unitario: 38900, stock_actual: 96 },
    { sku: 'ABR-105', nombre: 'Azúcar Refinada Doña María', sector: 'abarrotes', unidad_medida: 'kg', precio_unitario: 790, stock_actual: 2400 },
    // Ferretería
    { sku: 'FER-201', nombre: 'Cemento Gris Uso General 50kg', sector: 'ferreteria', unidad_medida: 'bultos', precio_unitario: 6150, stock_actual: 520 },
    { sku: 'FER-202', nombre: 'Tornillo Drywall #6x1" (Caja 1000 und)', sector: 'ferreteria', unidad_medida: 'cajas', precio_unitario: 8400, stock_actual: 145 },
    { sku: 'FER-203', nombre: 'Cable Eléctrico THHN #12 (Rollo 100m)', sector: 'ferreteria', unidad_medida: 'unidades', precio_unitario: 27900, stock_actual: 78 },
    { sku: 'FER-204', nombre: 'Pintura Látex Acrílica Cubeta 5 Gal', sector: 'ferreteria', unidad_medida: 'unidades', precio_unitario: 34200, stock_actual: 64 },
    { sku: 'FER-205', nombre: 'Alambre Galvanizado Calibre 14', sector: 'ferreteria', unidad_medida: 'kg', precio_unitario: 1650, stock_actual: 890 },
    // Insumos médicos
    { sku: 'MED-301', nombre: 'Guantes Nitrilo Azul Talla M (Caja x100)', sector: 'insumos_medicos', unidad_medida: 'cajas', precio_unitario: 4850, stock_actual: 430 },
    { sku: 'MED-302', nombre: 'Mascarilla Quirúrgica 3 Capas (Caja x50)', sector: 'insumos_medicos', unidad_medida: 'cajas', precio_unitario: 3200, stock_actual: 610 },
    { sku: 'MED-303', nombre: 'Alcohol Antiséptico 70% Galón', sector: 'insumos_medicos', unidad_medida: 'unidades', precio_unitario: 5900, stock_actual: 190 },
    { sku: 'MED-304', nombre: 'Suero Fisiológico 0.9% 500ml (Caja x24)', sector: 'insumos_medicos', unidad_medida: 'cajas', precio_unitario: 18600, stock_actual: 120 },
    { sku: 'MED-305', nombre: 'Gasa Estéril Hospitalaria (Paquete)', sector: 'insumos_medicos', unidad_medida: 'unidades', precio_unitario: 2750, stock_actual: 340, empresa_id: EMPRESA_PYME_ID },
    // Alimentos
    { sku: 'ALI-401', nombre: 'Queso Mozzarella Bloque Industrial', sector: 'alimentos', unidad_medida: 'kg', precio_unitario: 4650, stock_actual: 620 },
    { sku: 'ALI-402', nombre: 'Harina Fuerte Panificación (Saco 25kg)', sector: 'alimentos', unidad_medida: 'bultos', precio_unitario: 15900, stock_actual: 280 },
    { sku: 'ALI-403', nombre: 'Pechuga de Pollo Congelada IQF', sector: 'alimentos', unidad_medida: 'kg', precio_unitario: 3420, stock_actual: 940 },
    { sku: 'ALI-404', nombre: 'Leche UHT Entera 1L (Caja x12)', sector: 'alimentos', unidad_medida: 'cajas', precio_unitario: 11800, stock_actual: 350 },
    { sku: 'ALI-405', nombre: 'Salsa Tomate Foodservice (Caja x6 Gal)', sector: 'alimentos', unidad_medida: 'cajas', precio_unitario: 16400, stock_actual: 112, empresa_id: EMPRESA_PYME_ID },
  ];

  const productos_inventario: ProductoInventario[] = rawProducts.map((p, idx) => ({
    id: uuid('20000000', idx + 1),
    empresa_id: p.empresa_id ?? EMPRESA_DIST_ID,
    sku: p.sku,
    nombre: p.nombre,
    sector: p.sector,
    unidad_medida: p.unidad_medida,
    precio_unitario: p.precio_unitario,
    stock_actual: p.stock_actual,
    ultima_sincronizacion_api: crTimestamp(referenceStartDate, 6, 30),
  }));

  // 30 clientes en Costa Rica repartidos en 3 zonas/rutas principales y 4 sectores
  // Cliente #3: Supermercado Mayorista La Sabana -> ANOMALÍA 1: esperas excesivas (68–92 min)
  // Cliente #22: Abastecedor El Progreso Tibás -> ANOMALÍA 3: rechazos recurrentes
  const rawClients: Array<{
    nombre: string;
    sector: SectorCliente;
    zona: 'Oeste' | 'Este' | 'Norte';
    ventana_inicio: string;
    ventana_fin: string;
    lat: number;
    lng: number;
    empresa_id?: string;
  }> = [
    // Ruta Oeste (10 clientes)
    { nombre: 'Abastecedor La Violeta Pavas', sector: 'abarrotes', zona: 'Oeste', ventana_inicio: '07:30:00', ventana_fin: '11:30:00', lat: 9.9432, lng: -84.1294 },
    { nombre: 'Ferretería Escazú Centro', sector: 'ferreteria', zona: 'Oeste', ventana_inicio: '08:00:00', ventana_fin: '12:00:00', lat: 9.9189, lng: -84.1398 },
    { nombre: 'Supermercado Mayorista La Sabana', sector: 'abarrotes', zona: 'Oeste', ventana_inicio: '07:30:00', ventana_fin: '13:00:00', lat: 9.9355, lng: -84.1045 },
    { nombre: 'Clínica Santa Ana Salud', sector: 'insumos_medicos', zona: 'Oeste', ventana_inicio: '08:00:00', ventana_fin: '12:30:00', lat: 9.9324, lng: -84.1818 },
    { nombre: 'Panadería La Espiga Dorada Belén', sector: 'alimentos', zona: 'Oeste', ventana_inicio: '07:00:00', ventana_fin: '11:00:00', lat: 9.9788, lng: -84.1852 },
    { nombre: 'Constructora Los Robles Lindora', sector: 'ferreteria', zona: 'Oeste', ventana_inicio: '08:00:00', ventana_fin: '15:00:00', lat: 9.9562, lng: -84.1931 },
    { nombre: 'Restaurante El Trapiche Escazú', sector: 'alimentos', zona: 'Oeste', ventana_inicio: '08:30:00', ventana_fin: '12:00:00', lat: 9.9228, lng: -84.1489 },
    { nombre: 'Farmacia Pozos Medical', sector: 'insumos_medicos', zona: 'Oeste', ventana_inicio: '09:00:00', ventana_fin: '16:00:00', lat: 9.9491, lng: -84.1795, empresa_id: EMPRESA_PYME_ID },
    { nombre: 'Minisúper Rohrmoser Norte', sector: 'abarrotes', zona: 'Oeste', ventana_inicio: '08:00:00', ventana_fin: '14:00:00', lat: 9.9465, lng: -84.1156 },
    { nombre: 'Soda & Catering Ciudad Colón', sector: 'alimentos', zona: 'Oeste', ventana_inicio: '08:00:00', ventana_fin: '13:00:00', lat: 9.9144, lng: -84.2421, empresa_id: EMPRESA_PYME_ID },

    // Ruta Este (10 clientes)
    { nombre: 'Supermercado San Pedro Plaza', sector: 'abarrotes', zona: 'Este', ventana_inicio: '07:30:00', ventana_fin: '12:00:00', lat: 9.9327, lng: -84.0517 },
    { nombre: 'Ferretería El Yunque Curridabat', sector: 'ferreteria', zona: 'Este', ventana_inicio: '08:00:00', ventana_fin: '13:00:00', lat: 9.9154, lng: -84.0342 },
    { nombre: 'Hospital Metropolitano Sede Este', sector: 'insumos_medicos', zona: 'Este', ventana_inicio: '08:00:00', ventana_fin: '12:00:00', lat: 9.9211, lng: -84.0389 },
    { nombre: 'Distribuidora Gastronómica Tres Ríos', sector: 'alimentos', zona: 'Este', ventana_inicio: '07:30:00', ventana_fin: '11:30:00', lat: 9.9073, lng: -83.9871 },
    { nombre: 'Abastecedor Brumas de Cartago', sector: 'abarrotes', zona: 'Este', ventana_inicio: '08:00:00', ventana_fin: '14:00:00', lat: 9.8644, lng: -83.9194 },
    { nombre: 'Depósito Materiales Cartago Centro', sector: 'ferreteria', zona: 'Este', ventana_inicio: '08:00:00', ventana_fin: '15:00:00', lat: 9.8621, lng: -83.9248 },
    { nombre: 'Laboratorio Clínico San José Este', sector: 'insumos_medicos', zona: 'Este', ventana_inicio: '08:30:00', ventana_fin: '13:30:00', lat: 9.9289, lng: -84.0462, empresa_id: EMPRESA_PYME_ID },
    { nombre: 'Panificadora Irazú', sector: 'alimentos', zona: 'Este', ventana_inicio: '07:00:00', ventana_fin: '11:30:00', lat: 9.8742, lng: -83.9355 },
    { nombre: 'Mercado Orgánico Zapote', sector: 'alimentos', zona: 'Este', ventana_inicio: '08:00:00', ventana_fin: '13:00:00', lat: 9.9225, lng: -84.0604, empresa_id: EMPRESA_PYME_ID },
    { nombre: 'Ferretería La Unión', sector: 'ferreteria', zona: 'Este', ventana_inicio: '08:00:00', ventana_fin: '14:30:00', lat: 9.9052, lng: -83.9896 },

    // Ruta Norte (10 clientes)
    { nombre: 'Minisúper Guadalupe Centro', sector: 'abarrotes', zona: 'Norte', ventana_inicio: '07:30:00', ventana_fin: '12:00:00', lat: 9.9469, lng: -84.0558 },
    { nombre: 'Abastecedor El Progreso Tibás', sector: 'abarrotes', zona: 'Norte', ventana_inicio: '08:00:00', ventana_fin: '11:00:00', lat: 9.9621, lng: -84.0792 },
    { nombre: 'Clínica Dental Heredia Norte', sector: 'insumos_medicos', zona: 'Norte', ventana_inicio: '08:30:00', ventana_fin: '13:00:00', lat: 9.9985, lng: -84.1165 },
    { nombre: 'Ferretería Santo Domingo', sector: 'ferreteria', zona: 'Norte', ventana_inicio: '08:00:00', ventana_fin: '14:00:00', lat: 9.9794, lng: -84.0902 },
    { nombre: 'Restaurante La Casona Heredia', sector: 'alimentos', zona: 'Norte', ventana_inicio: '08:00:00', ventana_fin: '12:30:00', lat: 9.9972, lng: -84.1201 },
    { nombre: 'Supermercado Mango Alajuela', sector: 'abarrotes', zona: 'Norte', ventana_inicio: '07:30:00', ventana_fin: '13:00:00', lat: 10.0162, lng: -84.2116 },
    { nombre: 'Insumos Médicos Coyol', sector: 'insumos_medicos', zona: 'Norte', ventana_inicio: '08:00:00', ventana_fin: '15:00:00', lat: 10.0021, lng: -84.2625 },
    { nombre: 'Carnes y Embutidos Moravia', sector: 'alimentos', zona: 'Norte', ventana_inicio: '07:30:00', ventana_fin: '12:00:00', lat: 9.9617, lng: -84.0481 },
    { nombre: 'Ferretería El Constructor Alajuela', sector: 'ferreteria', zona: 'Norte', ventana_inicio: '08:00:00', ventana_fin: '14:00:00', lat: 10.0189, lng: -84.2155 },
    { nombre: 'Farmacia San Vicente Moravia', sector: 'insumos_medicos', zona: 'Norte', ventana_inicio: '09:00:00', ventana_fin: '16:00:00', lat: 9.9632, lng: -84.0504, empresa_id: EMPRESA_PYME_ID },
  ];

  const clientes: Cliente[] = rawClients.map((c, idx) => ({
    id: uuid('30000000', idx + 1),
    empresa_id: c.empresa_id ?? EMPRESA_DIST_ID,
    nombre: c.nombre,
    cedula_juridica: `3-101-${String(412000 + idx * 137).padStart(6, '0')}`,
    correo_facturacion: `facturacion${idx + 1}@${c.nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 14)}.cr`,
    telefono: `+506 2${String(240 + idx).padStart(3, '0')}-${String(1100 + idx * 31).slice(0, 4)}`,
    sector: c.sector,
    zona: c.zona,
    ventana_inicio: c.ventana_inicio,
    ventana_fin: c.ventana_fin,
    lat: c.lat,
    lng: c.lng,
  }));

  const vehiculos: Vehiculo[] = [
    {
      id: uuid('40000000', 1),
      empresa_id: EMPRESA_DIST_ID,
      placa: 'CL-294810',
      modelo: 'Isuzu NPR 4.5T Refrigerado',
      capacidad_carga: 4500,
      unidad_capacidad: 'kg',
      rendimiento_km_litro: 7.8,
      costo_alquiler_diario: 48000,
      mantenimiento_por_km: 85,
    },
    {
      id: uuid('40000000', 2),
      empresa_id: EMPRESA_DIST_ID,
      placa: 'CL-318402',
      modelo: 'Hino 300 Serie 616 Furgón',
      capacidad_carga: 320,
      unidad_capacidad: 'cajas',
      rendimiento_km_litro: 9.2,
      costo_alquiler_diario: 42000,
      mantenimiento_por_km: 72,
    },
    {
      id: uuid('40000000', 3),
      empresa_id: EMPRESA_DIST_ID,
      placa: 'CL-405119',
      modelo: 'Hyundai H100 Panel Urbana',
      capacidad_carga: 1200,
      unidad_capacidad: 'kg',
      rendimiento_km_litro: 11.4,
      costo_alquiler_diario: 34000,
      mantenimiento_por_km: 58,
    },
  ];

  const tramos: Tramo[] = [
    {
      id: uuid('50000000', 1),
      empresa_id: EMPRESA_DIST_ID,
      ruta_nombre: 'Ruta Oeste — Pavas / Escazú / Santa Ana',
      zona_origen: 'CEDIS La Uruca',
      zona_destino: 'Oeste',
      distancia_planificada_km: 68.0,
      tiempo_estimado_min: 195,
      peajes_estimados_colones: 1400,
    },
    {
      id: uuid('50000000', 2),
      empresa_id: EMPRESA_DIST_ID,
      ruta_nombre: 'Ruta Este — Curridabat / Tres Ríos / Cartago',
      zona_origen: 'CEDIS La Uruca',
      zona_destino: 'Este',
      distancia_planificada_km: 74.0,
      tiempo_estimado_min: 210,
      peajes_estimados_colones: 1100,
    },
    {
      id: uuid('50000000', 3),
      empresa_id: EMPRESA_DIST_ID,
      ruta_nombre: 'Ruta Norte — Tibás / Heredia / Alajuela',
      zona_origen: 'CEDIS La Uruca',
      zona_destino: 'Norte',
      distancia_planificada_km: 82.0,
      tiempo_estimado_min: 230,
      peajes_estimados_colones: 1850,
    },
  ];

  const parametros_costo: ParametroCosto[] = [
    {
      id: uuid('60000000', 1),
      empresa_id: EMPRESA_DIST_ID,
      salario_chofer_diario: 28500,
      salario_ayudante_diario: 21000,
      viaticos_diarios: 8500,
      precio_combustible_litro: 685,
      iva_porcentaje: 13.0,
      vigente_desde: addDaysIso(referenceStartDate, -30),
    },
    {
      id: uuid('60000000', 2),
      empresa_id: EMPRESA_PYME_ID,
      salario_chofer_diario: 0,
      salario_ayudante_diario: 0,
      viaticos_diarios: 0,
      precio_combustible_litro: 685,
      iva_porcentaje: 13.0,
      vigente_desde: addDaysIso(referenceStartDate, -30),
    },
  ];

  const choferes = ['Carlos Méndez Mora', 'Kendall Jiménez Vargas', 'Minor Solís Alvarado'];
  const origenes: OrigenInput[] = ['texto', 'imagen_ocr', 'pdf', 'audio'];
  const couriers = ['Correos de Costa Rica', 'Moovin CR', 'DHL Express CR'];

  const viajes: Viaje[] = [];
  const pedidos: Pedido[] = [];
  const entregas: Entrega[] = [];
  const gastos: Gasto[] = [];

  const excessiveWaitClient = clientes[2]; // Supermercado Mayorista La Sabana
  const recurringRejectionClient = clientes[21]; // Abastecedor El Progreso Tibás

  const distClientsByZona: Record<'Oeste' | 'Este' | 'Norte', Cliente[]> = {
    Oeste: clientes.filter((c) => c.empresa_id === EMPRESA_DIST_ID && c.zona === 'Oeste'),
    Este: clientes.filter((c) => c.empresa_id === EMPRESA_DIST_ID && c.zona === 'Este'),
    Norte: clientes.filter((c) => c.empresa_id === EMPRESA_DIST_ID && c.zona === 'Norte'),
  };

  const pymeClients = clientes.filter((c) => c.empresa_id === EMPRESA_PYME_ID);

  let pedidoCounter = 1;
  let entregaCounter = 1;
  let viajeCounter = 1;
  let gastoCounter = 1;

  // Seguimiento de odómetros acumulados por vehículo
  const odometros = [42180, 31450, 18920];
  let excessiveWaitDeliveries = 0;
  let maxWaitMinutes = 0;
  let odometerDeviationMaxKm = 0;
  let recurringRejectionCount = 0;

  // 14 días de operación (2 semanas completas)
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const fecha = addDaysIso(referenceStartDate, dayOffset);
    const dayOfWeek = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0=Dom, 6=Sab
    const routesForDay = dayOfWeek === 0 ? [0] : dayOfWeek === 6 ? [0, 1] : [0, 1, 2];

    for (const routeIdx of routesForDay) {
      const tramo = tramos[routeIdx];
      const vehiculo = vehiculos[routeIdx];
      const chofer = choferes[routeIdx];
      const viajeId = uuid('70000000', viajeCounter);

      // ANOMALÍA 2 PLANTADA: Desvío de +40 km (específicamente +46.4 km y +43.8 km) en Ruta Este los días 5 y 10
      const isOdometerDeviationAnomaly = routeIdx === 1 && (dayOffset === 5 || dayOffset === 10);
      const deviationKm = isOdometerDeviationAnomaly
        ? dayOffset === 5
          ? 46.4
          : 43.8
        : ((dayOffset * 3 + routeIdx * 2) % 7) - 2; // Variación normal de -2 a +4 km

      const kmReales = round2(tramo.distancia_planificada_km + deviationKm);
      if (deviationKm > odometerDeviationMaxKm) {
        odometerDeviationMaxKm = round2(deviationKm);
      }

      const odoInicio = round2(odometros[routeIdx]);
      const odoFin = round2(odoInicio + kmReales);
      odometros[routeIdx] = odoFin;

      const zonaKey = tramo.zona_destino as 'Oeste' | 'Este' | 'Norte';
      const zonaClientes = distClientsByZona[zonaKey];

      // Seleccionar 3 paradas por viaje (asegurando inclusión frecuente de los clientes con anomalía)
      const stopsClients: Cliente[] = [];
      for (let s = 0; s < 3; s++) {
        const candidate = zonaClientes[(dayOffset + s) % zonaClientes.length];
        if (!stopsClients.some((x) => x.id === candidate.id)) {
          stopsClients.push(candidate);
        }
      }
      if (zonaKey === 'Oeste' && dayOffset % 2 === 0 && !stopsClients.some((x) => x.id === excessiveWaitClient.id)) {
        stopsClients[1] = excessiveWaitClient;
      }
      if (zonaKey === 'Norte' && dayOffset % 2 === 1 && !stopsClients.some((x) => x.id === recurringRejectionClient.id)) {
        stopsClients[1] = recurringRejectionClient;
      }

      let cargaTotalInicial = 0;
      let hasViajeIncidence = isOdometerDeviationAnomaly;

      const salidaHour = 7;
      const salidaMin = 15 + routeIdx * 10;

      // Crear pedidos y entregas asociadas al viaje
      stopsClients.forEach((cliente, stopIdx) => {
        const sectorProducts = productos_inventario.filter(
          (p) => p.empresa_id === EMPRESA_DIST_ID && p.sector === cliente.sector
        );
        const prodA = sectorProducts[0] ?? productos_inventario[0];
        const prodB = sectorProducts[1] ?? prodA;

        const qtyA = 4 + ((dayOffset + stopIdx) % 6);
        const qtyB = 2 + ((dayOffset + stopIdx) % 4);
        const items: PedidoItem[] = [
          {
            sku: prodA.sku,
            nombre: prodA.nombre,
            cantidad: qtyA,
            unidad: prodA.unidad_medida,
            precio: prodA.precio_unitario,
          },
          {
            sku: prodB.sku,
            nombre: prodB.nombre,
            cantidad: qtyB,
            unidad: prodB.unidad_medida,
            precio: prodB.precio_unitario,
          },
        ];

        const totalUnits = qtyA + qtyB;
        cargaTotalInicial += totalUnits;

        const subtotal = round2(items.reduce((acc, item) => acc + item.cantidad * item.precio, 0));
        const iva = round2(subtotal * 0.13);
        const total = round2(subtotal + iva);

        const pedidoId = uuid('80000000', pedidoCounter);
        const trackingCode = `IT-${8900 + pedidoCounter}`;
        const origen = origenes[(pedidoCounter + dayOffset) % origenes.length];

        // ANOMALÍA 1 PLANTADA: Esperas excesivas en Supermercado Mayorista La Sabana (68 - 92 min)
        const isExcessiveWait = cliente.id === excessiveWaitClient.id;
        const waitMinutes = isExcessiveWait ? 68 + ((dayOffset * 5) % 25) : 11 + ((stopIdx * 4 + dayOffset) % 12);

        // ANOMALÍA 3 PLANTADA: Rechazos recurrentes en Abastecedor El Progreso Tibás
        const isRecurringRejection = cliente.id === recurringRejectionClient.id;
        const isIsolatedRejection = !isRecurringRejection && dayOffset === 8 && routeIdx === 0 && stopIdx === 2;

        let estadoParada: Entrega['estado'] = 'entregado';
        let estadoPedido: Pedido['estado_entrega'] = 'entregado';
        let cantEntregada = totalUnits;
        let cantRechazada = 0;
        let motivoRechazo: string | null = null;

        if (isRecurringRejection) {
          hasViajeIncidence = true;
          recurringRejectionCount += 1;
          const fullReject = recurringRejectionCount % 2 === 1;
          estadoParada = fullReject ? 'rechazado' : 'rechazo_parcial';
          estadoPedido = fullReject ? 'rechazado' : 'entregado';
          cantRechazada = fullReject ? totalUnits : qtyB;
          cantEntregada = totalUnits - cantRechazada;
          motivoRechazo = fullReject
            ? 'Bodega cerrada fuera de ventana / Sin encargado de recepción'
            : 'Diferencia en orden de compra y empaque golpeado en estiba';
        } else if (isIsolatedRejection) {
          hasViajeIncidence = true;
          estadoParada = 'rechazo_parcial';
          cantRechazada = 1;
          cantEntregada = totalUnits - 1;
          motivoRechazo = 'Unidad con sello de garantía abierto';
        }

        if (isExcessiveWait) {
          excessiveWaitDeliveries += 1;
          if (waitMinutes > maxWaitMinutes) {
            maxWaitMinutes = waitMinutes;
          }
        }

        const arrivalMinOffset = 45 + stopIdx * 55 + (isRecurringRejection ? 95 : 0);
        const horaLlegada = addMinutesCr(fecha, salidaHour, salidaMin, arrivalMinOffset);
        const horaSalida = addMinutesCr(fecha, salidaHour, salidaMin, arrivalMinOffset + waitMinutes);

        pedidos.push({
          id: pedidoId,
          empresa_id: EMPRESA_DIST_ID,
          codigo_tracking: trackingCode,
          cliente_id: cliente.id,
          origen_input: origen,
          raw_input_url:
            origen === 'texto'
              ? null
              : `https://storage.supabase.co/object/public/evidencias/ingesta/${trackingCode.toLowerCase()}.${origen === 'pdf' ? 'pdf' : origen === 'audio' ? 'ogg' : 'jpg'}`,
          items_json: items,
          subtotal,
          iva,
          total,
          estado_factura: 'facturado',
          numero_factura_externa: `FE-CR-00100001${String(1000 + pedidoCounter).padStart(4, '0')}`,
          modalidad_envio: 'flotilla_propia',
          proveedor_externo_nombre: null,
          tracking_externo_url: null,
          estado_entrega: estadoPedido,
          created_at: addMinutesCr(fecha, 6, 0, pedidoCounter % 45),
        });

        entregas.push({
          id: uuid('90000000', entregaCounter),
          empresa_id: EMPRESA_DIST_ID,
          viaje_id: viajeId,
          pedido_id: pedidoId,
          cliente_id: cliente.id,
          orden: stopIdx + 1,
          hora_llegada: horaLlegada,
          gps_llegada: { lat: cliente.lat, lng: cliente.lng, timestamp: horaLlegada },
          hora_salida: horaSalida,
          cantidad_entregada: cantEntregada,
          cantidad_rechazada: cantRechazada,
          unidad_medida: prodA.unidad_medida,
          motivo_rechazo: motivoRechazo,
          foto_comprobante: `https://storage.supabase.co/object/public/evidencias/comprobantes/${trackingCode.toLowerCase()}.jpg`,
          estado: estadoParada,
        });

        pedidoCounter += 1;
        entregaCounter += 1;
      });

      const horaSalidaViaje = crTimestamp(fecha, salidaHour, salidaMin);
      const returnMinOffset = 220 + (isOdometerDeviationAnomaly ? 75 : 15);
      const horaRegresoViaje = addMinutesCr(fecha, salidaHour, salidaMin, returnMinOffset);

      viajes.push({
        id: viajeId,
        empresa_id: EMPRESA_DIST_ID,
        fecha,
        ruta_nombre: tramo.ruta_nombre,
        tramo_id: tramo.id,
        vehiculo_id: vehiculo.id,
        chofer_nombre: chofer,
        estado: hasViajeIncidence ? 'con_incidencia' : 'completado',
        odometro_inicio: odoInicio,
        foto_odometro_inicio: `https://storage.supabase.co/object/public/evidencias/odometros/v${viajeCounter}-inicio.jpg`,
        hora_salida: horaSalidaViaje,
        gps_salida: { lat: 9.9512, lng: -84.0998, timestamp: horaSalidaViaje },
        carga_total_inicial: cargaTotalInicial,
        unidad_carga: 'cajas',
        odometro_fin: odoFin,
        foto_odometro_fin: `https://storage.supabase.co/object/public/evidencias/odometros/v${viajeCounter}-fin.jpg`,
        hora_regreso: horaRegresoViaje,
        gps_regreso: { lat: 9.9512, lng: -84.0998, timestamp: horaRegresoViaje },
      });

      // Gastos del viaje: combustible y peaje
      const litros = round2(kmReales / vehiculo.rendimiento_km_litro);
      const montoCombustible = round2(litros * 685);
      gastos.push({
        id: uuid('a0000000', gastoCounter++),
        empresa_id: EMPRESA_DIST_ID,
        viaje_id: viajeId,
        pedido_id: null,
        tipo: 'combustible',
        litros,
        monto_colones: montoCombustible,
        foto_factura: `https://storage.supabase.co/object/public/evidencias/gastos/comb-${viajeCounter}.jpg`,
        fecha_gasto: addMinutesCr(fecha, 12, 10, 0),
      });

      if (tramo.peajes_estimados_colones > 0) {
        gastos.push({
          id: uuid('a0000000', gastoCounter++),
          empresa_id: EMPRESA_DIST_ID,
          viaje_id: viajeId,
          pedido_id: null,
          tipo: 'peaje',
          litros: null,
          monto_colones: tramo.peajes_estimados_colones,
          foto_factura: `https://storage.supabase.co/object/public/evidencias/gastos/peaje-${viajeCounter}.jpg`,
          fecha_gasto: addMinutesCr(fecha, 10, 30, 0),
        });
      }

      viajeCounter += 1;
    }

    // Pedidos diarios de PyME tercerizada (envío vía proveedor externo)
    if (dayOffset % 2 === 0) {
      const pymeClient = pymeClients[dayOffset % pymeClients.length];
      const pymeProducts = productos_inventario.filter((p) => p.empresa_id === EMPRESA_PYME_ID);
      const prod = pymeProducts[dayOffset % pymeProducts.length] ?? productos_inventario[14];
      const qty = 3 + (dayOffset % 5);
      const items: PedidoItem[] = [
        {
          sku: prod.sku,
          nombre: prod.nombre,
          cantidad: qty,
          unidad: prod.unidad_medida,
          precio: prod.precio_unitario,
        },
      ];
      const subtotal = round2(qty * prod.precio_unitario);
      const iva = round2(subtotal * 0.13);
      const total = round2(subtotal + iva);
      const pedidoId = uuid('80000000', pedidoCounter);
      const trackingCode = `IT-${8900 + pedidoCounter}`;
      const courier = couriers[dayOffset % couriers.length];

      pedidos.push({
        id: pedidoId,
        empresa_id: EMPRESA_PYME_ID,
        codigo_tracking: trackingCode,
        cliente_id: pymeClient.id,
        origen_input: origenes[dayOffset % origenes.length],
        raw_input_url: null,
        items_json: items,
        subtotal,
        iva,
        total,
        estado_factura: 'facturado',
        numero_factura_externa: `FE-PYME-0020${String(pedidoCounter).padStart(4, '0')}`,
        modalidad_envio: 'proveedor_externo',
        proveedor_externo_nombre: courier,
        tracking_externo_url: `https://tracking.courier-cr.example/${trackingCode}`,
        estado_entrega: dayOffset === 12 ? 'en_ruta' : 'entregado',
        created_at: crTimestamp(fecha, 9, 15),
      });

      gastos.push({
        id: uuid('a0000000', gastoCounter++),
        empresa_id: EMPRESA_PYME_ID,
        viaje_id: null,
        pedido_id: pedidoId,
        tipo: 'courier_externo',
        litros: null,
        monto_colones: 3800 + (dayOffset % 3) * 650,
        foto_factura: `https://storage.supabase.co/object/public/evidencias/gastos/courier-${trackingCode.toLowerCase()}.pdf`,
        fecha_gasto: crTimestamp(fecha, 10, 0),
      });

      pedidoCounter += 1;
    }
  }

  return {
    empresas_config,
    productos_inventario,
    clientes,
    vehiculos,
    tramos,
    parametros_costo,
    pedidos,
    viajes,
    entregas,
    gastos,
    anomaliesSummary: {
      excessiveWaitClientId: excessiveWaitClient.id,
      excessiveWaitClientName: excessiveWaitClient.nombre,
      excessiveWaitDeliveries,
      maxWaitMinutes,
      odometerDeviationRoute: tramos[1].ruta_nombre,
      odometerDeviationMaxKm: odometerDeviationMaxKm,
      recurringRejectionClientId: recurringRejectionClient.id,
      recurringRejectionClientName: recurringRejectionClient.nombre,
      recurringRejectionCount,
    },
  };
}
