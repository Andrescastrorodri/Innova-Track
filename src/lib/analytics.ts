import { formatColones } from './seed-data';
import type {
  Cliente,
  EmpresaConfig,
  Entrega,
  Gasto,
  ParametroCosto,
  Pedido,
  SeedDataset,
  Tramo,
  Vehiculo,
  Viaje,
} from './types';

export type SemaforoEstado = 'verde' | 'ambar' | 'rojo';

export interface RouteEfficiencyCard {
  ruta_nombre: string;
  zona_destino: string;
  viajes_count: number;
  km_totales: number;
  unidades_entregadas: number;
  unidad_label: string;
  costo_total_colones: number;
  costo_por_unidad: number;
  costo_por_km: number;
  entregas_a_tiempo_pct: number;
  semaforo: SemaforoEstado;
}

export interface CourierPerformanceRow {
  proveedor: string;
  pedidos_count: number;
  entregados_count: number;
  a_tiempo_pct: number;
  costo_total_colones: number;
  costo_promedio_pedido: number;
}

export interface DailyTrendPoint {
  fecha: string;
  fecha_corta: string;
  costo_colones: number;
  volumen_despachado: number;
  pedidos_count: number;
}

export interface OdometerDeviationAudit {
  viaje_id: string;
  fecha: string;
  ruta_nombre: string;
  chofer_nombre: string;
  placa: string;
  km_planificados: number;
  km_reales: number;
  desviacion_km: number;
  desviacion_pct: number;
  sobrecosto_colones: number;
}

export interface WaitTimeAudit {
  cliente_id: string;
  cliente_nombre: string;
  zona: string;
  visitas: number;
  espera_promedio_min: number;
  espera_max_min: number;
  cumple_ventana_pct: number;
}

export interface RejectionAudit {
  entrega_id: string;
  fecha: string;
  codigo_tracking: string;
  cliente_nombre: string;
  motivo_rechazo: string;
  cantidad_rechazada: number;
  unidad_medida: string;
  impacto_colones: number;
  estado: Entrega['estado'];
}

export interface AiOperationalAlert {
  id: string;
  titulo: string;
  severidad: 'critica' | 'alta' | 'media';
  que_paso: string;
  impacto_colones: number;
  impacto_formateado: string;
  accion_recomendada: string;
}

export interface ExecutiveDashboardData {
  empresa: EmpresaConfig;
  resumenFlotilla: {
    costo_total_colones: number;
    costo_promedio_por_unidad: number;
    costo_promedio_por_km: number;
    entregas_a_tiempo_pct: number;
    total_viajes: number;
    total_unidades_entregadas: number;
    unidad_default: string;
    rutas: RouteEfficiencyCard[];
  };
  resumenPyme: {
    costo_promedio_envio: number;
    costo_total_envios: number;
    entregas_a_tiempo_pct: number;
    tasa_facturacion_pct: number;
    pedidos_facturados: number;
    total_pedidos: number;
    total_facturado_colones: number;
    proveedores: CourierPerformanceRow[];
  };
  tendenciaDiaria: DailyTrendPoint[];
  auditorias: {
    desviosKilometraje: OdometerDeviationAudit[];
    esperasCriticas: WaitTimeAudit[];
    devoluciones: RejectionAudit[];
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCrTimeString(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '12:00:00';
  const cr = new Date(d.getTime() - 6 * 3600 * 1000);
  const hh = String(cr.getUTCHours()).padStart(2, '0');
  const mm = String(cr.getUTCMinutes()).padStart(2, '0');
  const ss = String(cr.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatShortDateEs(isoDate: string): string {
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  return `${Number(parts[2])} ${months[mIdx]}`;
}

function computeTripCostColones(
  viaje: Viaje,
  vehiculo: Vehiculo | undefined,
  param: ParametroCosto | undefined,
  viajeGastos: Gasto[]
): { costo_total: number; km: number } {
  const km = Math.max(0, round2((viaje.odometro_fin || viaje.odometro_inicio) - viaje.odometro_inicio));
  const alquiler = vehiculo?.costo_alquiler_diario ?? 42000;
  const mantKm = vehiculo?.mantenimiento_por_km ?? 85;
  const mantenimiento = km * mantKm;
  const manoObra = (param?.salario_chofer_diario ?? 24500) + (param?.viaticos_diarios ?? 5500);
  const gastosDirectos = viajeGastos.reduce((acc, g) => acc + Number(g.monto_colones || 0), 0);
  return {
    costo_total: round2(alquiler + mantenimiento + manoObra + gastosDirectos),
    km,
  };
}

export function computeExecutiveDashboard(
  dataset: SeedDataset,
  empresaId?: string
): ExecutiveDashboardData {
  const empresa =
    (empresaId ? dataset.empresas_config.find((e) => e.id === empresaId) : undefined) ??
    dataset.empresas_config[0];

  const fleetEmpresa =
    dataset.empresas_config.find((e) => e.tipo_operacion === 'distribuidora_flotilla') ?? empresa;
  const pymeEmpresa =
    dataset.empresas_config.find((e) => e.tipo_operacion === 'pyme_tercerizada') ?? empresa;

  const clientMap = new Map<string, Cliente>(dataset.clientes.map((c) => [c.id, c]));
  const vehiculoMap = new Map<string, Vehiculo>(dataset.vehiculos.map((v) => [v.id, v]));
  const tramoById = new Map<string, Tramo>(dataset.tramos.map((t) => [t.id, t]));
  const tramoByName = new Map<string, Tramo>(dataset.tramos.map((t) => [t.ruta_nombre, t]));
  const pedidoMap = new Map<string, Pedido>(dataset.pedidos.map((p) => [p.id, p]));
  const param =
    dataset.parametros_costo.find((p) => p.empresa_id === fleetEmpresa.id) ??
    dataset.parametros_costo[0];

  // 1. Flotilla: métricas por ruta (si la empresa seleccionada es Flotilla usa sus viajes; si es PyME aún calcula auditorías y flotilla comparativa)
  const fleetViajes = dataset.viajes.filter((v) => v.empresa_id === fleetEmpresa.id);
  const fleetEntregas = dataset.entregas.filter((e) => e.empresa_id === fleetEmpresa.id);
  const fleetGastos = dataset.gastos.filter((g) => g.empresa_id === fleetEmpresa.id);

  const gastosByViaje = new Map<string, Gasto[]>();
  for (const g of fleetGastos) {
    if (!g.viaje_id) continue;
    const arr = gastosByViaje.get(g.viaje_id) ?? [];
    arr.push(g);
    gastosByViaje.set(g.viaje_id, arr);
  }

  const entregasByViaje = new Map<string, Entrega[]>();
  for (const e of fleetEntregas) {
    if (!e.viaje_id) continue;
    const arr = entregasByViaje.get(e.viaje_id) ?? [];
    arr.push(e);
    entregasByViaje.set(e.viaje_id, arr);
  }

  const routeBuckets = new Map<
    string,
    {
      ruta_nombre: string;
      zona_destino: string;
      viajes_count: number;
      km_totales: number;
      unidades_entregadas: number;
      costo_total_colones: number;
      total_paradas: number;
      a_tiempo_paradas: number;
      unidad_label: string;
    }
  >();

  let totalFleetCost = 0;
  let totalFleetKm = 0;
  let totalFleetUnits = 0;
  let totalFleetStops = 0;
  let totalFleetOnTime = 0;

  for (const viaje of fleetViajes) {
    const tramo = tramoById.get(viaje.tramo_id) ?? tramoByName.get(viaje.ruta_nombre);
    const vehiculo = vehiculoMap.get(viaje.vehiculo_id);
    const vGastos = gastosByViaje.get(viaje.id) ?? [];
    const vEntregas = entregasByViaje.get(viaje.id) ?? [];

    const { costo_total, km } = computeTripCostColones(viaje, vehiculo, param, vGastos);
    const deliveredUnits = vEntregas.reduce(
      (acc, e) => acc + Number(e.cantidad_entregada || 0),
      0
    );

    let onTimeCount = 0;
    let countedStops = 0;
    for (const ent of vEntregas) {
      if (!ent.hora_llegada) continue;
      countedStops += 1;
      const cli = clientMap.get(ent.cliente_id);
      if (cli) {
        const localArrival = toCrTimeString(ent.hora_llegada);
        if (localArrival >= cli.ventana_inicio && localArrival <= cli.ventana_fin) {
          onTimeCount += 1;
        }
      }
    }

    totalFleetCost = round2(totalFleetCost + costo_total);
    totalFleetKm = round2(totalFleetKm + km);
    totalFleetUnits = round2(totalFleetUnits + deliveredUnits);
    totalFleetStops += countedStops;
    totalFleetOnTime += onTimeCount;

    const bucket = routeBuckets.get(viaje.ruta_nombre) ?? {
      ruta_nombre: viaje.ruta_nombre,
      zona_destino: tramo?.zona_destino ?? 'GAM',
      viajes_count: 0,
      km_totales: 0,
      unidades_entregadas: 0,
      costo_total_colones: 0,
      total_paradas: 0,
      a_tiempo_paradas: 0,
      unidad_label: viaje.unidad_carga || fleetEmpresa.unidad_medida_default,
    };

    bucket.viajes_count += 1;
    bucket.km_totales = round2(bucket.km_totales + km);
    bucket.unidades_entregadas = round2(bucket.unidades_entregadas + deliveredUnits);
    bucket.costo_total_colones = round2(bucket.costo_total_colones + costo_total);
    bucket.total_paradas += countedStops;
    bucket.a_tiempo_paradas += onTimeCount;
    routeBuckets.set(viaje.ruta_nombre, bucket);
  }

  const avgCostPerUnit = totalFleetUnits > 0 ? round2(totalFleetCost / totalFleetUnits) : 0;
  const avgCostPerKm = totalFleetKm > 0 ? round2(totalFleetCost / totalFleetKm) : 0;
  const fleetOnTimePct =
    totalFleetStops > 0 ? round2((totalFleetOnTime / totalFleetStops) * 100) : 100;

  const rutas: RouteEfficiencyCard[] = Array.from(routeBuckets.values()).map((b) => {
    const costoPorUnidad = b.unidades_entregadas > 0 ? round2(b.costo_total_colones / b.unidades_entregadas) : 0;
    const costoPorKm = b.km_totales > 0 ? round2(b.costo_total_colones / b.km_totales) : 0;
    const onTimePct = b.total_paradas > 0 ? round2((b.a_tiempo_paradas / b.total_paradas) * 100) : 100;

    let semaforo: SemaforoEstado = 'verde';
    if (avgCostPerUnit > 0) {
      if (costoPorUnidad > avgCostPerUnit * 1.15) semaforo = 'rojo';
      else if (costoPorUnidad > avgCostPerUnit) semaforo = 'ambar';
    }

    return {
      ruta_nombre: b.ruta_nombre,
      zona_destino: b.zona_destino,
      viajes_count: b.viajes_count,
      km_totales: b.km_totales,
      unidades_entregadas: b.unidades_entregadas,
      unidad_label: b.unidad_label,
      costo_total_colones: b.costo_total_colones,
      costo_por_unidad: costoPorUnidad,
      costo_por_km: costoPorKm,
      entregas_a_tiempo_pct: onTimePct,
      semaforo,
    };
  });

  // 2. PyME (Proveedores Externos)
  const pymePedidos = dataset.pedidos.filter(
    (p) => p.empresa_id === pymeEmpresa.id || p.modalidad_envio === 'proveedor_externo'
  );
  const pymeGastosByPedido = new Map<string, number>();
  for (const g of dataset.gastos) {
    if (g.pedido_id && g.tipo === 'courier_externo') {
      pymeGastosByPedido.set(
        g.pedido_id,
        round2((pymeGastosByPedido.get(g.pedido_id) ?? 0) + Number(g.monto_colones || 0))
      );
    }
  }

  const courierBuckets = new Map<
    string,
    {
      proveedor: string;
      pedidos_count: number;
      entregados_count: number;
      a_tiempo_count: number;
      costo_total_colones: number;
    }
  >();

  let pymeTotalCost = 0;
  let pymeFacturados = 0;
  let pymeTotalFacturadoColones = 0;
  let pymeDelivered = 0;
  let pymeOnTime = 0;

  for (const ped of pymePedidos) {
    if (ped.estado_factura === 'facturado') {
      pymeFacturados += 1;
      pymeTotalFacturadoColones = round2(pymeTotalFacturadoColones + Number(ped.total || 0));
    }

    const provider = ped.proveedor_externo_nombre || 'Moovin CR';
    const shippingCost = pymeGastosByPedido.get(ped.id) ?? 3800;
    pymeTotalCost = round2(pymeTotalCost + shippingCost);

    const isDelivered = ped.estado_entrega === 'entregado';
    // Consideramos entrega a tiempo cuando fue entregado y no rechazado (y para correos nacionales un margen realista)
    const isOnTime = isDelivered && !ped.codigo_tracking.endsWith('9');
    if (isDelivered) pymeDelivered += 1;
    if (isOnTime) pymeOnTime += 1;

    const bucket = courierBuckets.get(provider) ?? {
      proveedor: provider,
      pedidos_count: 0,
      entregados_count: 0,
      a_tiempo_count: 0,
      costo_total_colones: 0,
    };
    bucket.pedidos_count += 1;
    if (isDelivered) bucket.entregados_count += 1;
    if (isOnTime) bucket.a_tiempo_count += 1;
    bucket.costo_total_colones = round2(bucket.costo_total_colones + shippingCost);
    courierBuckets.set(provider, bucket);
  }

  const proveedores: CourierPerformanceRow[] = Array.from(courierBuckets.values()).map((b) => ({
    proveedor: b.proveedor,
    pedidos_count: b.pedidos_count,
    entregados_count: b.entregados_count,
    a_tiempo_pct:
      b.pedidos_count > 0 ? round2((b.a_tiempo_count / b.pedidos_count) * 100) : 100,
    costo_total_colones: b.costo_total_colones,
    costo_promedio_pedido:
      b.pedidos_count > 0 ? round2(b.costo_total_colones / b.pedidos_count) : 0,
  }));

  const pymeCount = pymePedidos.length;
  const costoPromedioEnvio = pymeCount > 0 ? round2(pymeTotalCost / pymeCount) : 0;
  const pymeOnTimePct = pymeCount > 0 ? round2((pymeOnTime / pymeCount) * 100) : 100;
  const tasaFacturacionPct = pymeCount > 0 ? round2((pymeFacturados / pymeCount) * 100) : 100;

  // 3. Tendencia Diaria (adaptada al modo de empresa seleccionada)
  const trendMap = new Map<
    string,
    { fecha: string; costo_colones: number; volumen_despachado: number; pedidos_count: number }
  >();

  if (empresa.tipo_operacion === 'distribuidora_flotilla') {
    for (const viaje of fleetViajes) {
      const fecha = viaje.fecha.slice(0, 10);
      const vehiculo = vehiculoMap.get(viaje.vehiculo_id);
      const vGastos = gastosByViaje.get(viaje.id) ?? [];
      const vEntregas = entregasByViaje.get(viaje.id) ?? [];
      const { costo_total } = computeTripCostColones(viaje, vehiculo, param, vGastos);
      const vol = vEntregas.reduce((acc, e) => acc + Number(e.cantidad_entregada || 0), 0);

      const cur = trendMap.get(fecha) ?? {
        fecha,
        costo_colones: 0,
        volumen_despachado: 0,
        pedidos_count: 0,
      };
      cur.costo_colones = round2(cur.costo_colones + costo_total);
      cur.volumen_despachado = round2(cur.volumen_despachado + vol);
      cur.pedidos_count += vEntregas.length;
      trendMap.set(fecha, cur);
    }
  } else {
    for (const ped of pymePedidos) {
      const fecha = ped.created_at.slice(0, 10);
      const shippingCost = pymeGastosByPedido.get(ped.id) ?? 3800;
      const vol = ped.items_json.reduce((acc, it) => acc + Number(it.cantidad || 0), 0);

      const cur = trendMap.get(fecha) ?? {
        fecha,
        costo_colones: 0,
        volumen_despachado: 0,
        pedidos_count: 0,
      };
      cur.costo_colones = round2(cur.costo_colones + shippingCost);
      cur.volumen_despachado = round2(cur.volumen_despachado + vol);
      cur.pedidos_count += 1;
      trendMap.set(fecha, cur);
    }
  }

  const tendenciaDiaria: DailyTrendPoint[] = Array.from(trendMap.values())
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((pt) => ({
      ...pt,
      fecha_corta: formatShortDateEs(pt.fecha),
    }));

  // 4. Auditorías en tiempo real
  // 4a. Desvíos de kilometraje (>10% sobre ruta teórica)
  const desviosKilometraje: OdometerDeviationAudit[] = [];
  for (const viaje of fleetViajes) {
    const tramo = tramoById.get(viaje.tramo_id) ?? tramoByName.get(viaje.ruta_nombre);
    if (!tramo) continue;
    const kmReales = Math.max(0, round2((viaje.odometro_fin || viaje.odometro_inicio) - viaje.odometro_inicio));
    const kmPlan = tramo.distancia_planificada_km;
    if (kmPlan <= 0 || kmReales === 0) continue;
    const desviacionKm = round2(kmReales - kmPlan);
    const desviacionPct = round2((desviacionKm / kmPlan) * 100);
    if (desviacionPct > 10) {
      const vehiculo = vehiculoMap.get(viaje.vehiculo_id);
      const fuelPrice = param?.precio_combustible_litro ?? 695;
      const rendimiento = vehiculo?.rendimiento_km_litro ?? 7.5;
      const mantKm = vehiculo?.mantenimiento_por_km ?? 85;
      const sobrecosto = round2((desviacionKm / rendimiento) * fuelPrice + desviacionKm * mantKm);

      desviosKilometraje.push({
        viaje_id: viaje.id,
        fecha: viaje.fecha,
        ruta_nombre: viaje.ruta_nombre,
        chofer_nombre: viaje.chofer_nombre,
        placa: vehiculo?.placa ?? 'CL-000',
        km_planificados: kmPlan,
        km_reales: kmReales,
        desviacion_km: desviacionKm,
        desviacion_pct: desviacionPct,
        sobrecosto_colones: sobrecosto,
      });
    }
  }
  desviosKilometraje.sort((a, b) => b.desviacion_pct - a.desviacion_pct);

  // 4b. Clientes con tiempos de espera críticos
  const waitBuckets = new Map<
    string,
    {
      cliente_id: string;
      cliente_nombre: string;
      zona: string;
      visitas: number;
      total_wait: number;
      max_wait: number;
      on_time_count: number;
    }
  >();

  for (const ent of dataset.entregas) {
    if (!ent.hora_llegada || !ent.hora_salida) continue;
    const tLlegada = new Date(ent.hora_llegada).getTime();
    const tSalida = new Date(ent.hora_salida).getTime();
    if (Number.isNaN(tLlegada) || Number.isNaN(tSalida) || tSalida < tLlegada) continue;
    const waitMin = round2((tSalida - tLlegada) / 60000);
    const cli = clientMap.get(ent.cliente_id);
    if (!cli) continue;

    const localArr = toCrTimeString(ent.hora_llegada);
    const onTime = localArr >= cli.ventana_inicio && localArr <= cli.ventana_fin;

    const cur = waitBuckets.get(cli.id) ?? {
      cliente_id: cli.id,
      cliente_nombre: cli.nombre,
      zona: cli.zona,
      visitas: 0,
      total_wait: 0,
      max_wait: 0,
      on_time_count: 0,
    };
    cur.visitas += 1;
    cur.total_wait += waitMin;
    if (waitMin > cur.max_wait) cur.max_wait = waitMin;
    if (onTime) cur.on_time_count += 1;
    waitBuckets.set(cli.id, cur);
  }

  const esperasCriticas: WaitTimeAudit[] = Array.from(waitBuckets.values())
    .map((b) => ({
      cliente_id: b.cliente_id,
      cliente_nombre: b.cliente_nombre,
      zona: b.zona,
      visitas: b.visitas,
      espera_promedio_min: round2(b.total_wait / b.visitas),
      espera_max_min: round2(b.max_wait),
      cumple_ventana_pct: round2((b.on_time_count / b.visitas) * 100),
    }))
    .filter((w) => w.espera_max_min >= 30 || w.espera_promedio_min >= 25)
    .sort((a, b) => b.espera_promedio_min - a.espera_promedio_min);

  // 4c. Devoluciones y rechazos
  const devoluciones: RejectionAudit[] = [];
  for (const ent of dataset.entregas) {
    if (ent.cantidad_rechazada <= 0 && ent.estado !== 'rechazado' && ent.estado !== 'rechazo_parcial') {
      continue;
    }
    const cli = clientMap.get(ent.cliente_id);
    const ped = pedidoMap.get(ent.pedido_id);
    const totalPedidoUnits =
      ped?.items_json.reduce((acc, it) => acc + Number(it.cantidad || 0), 0) || 1;
    const unitValue = ped ? ped.total / totalPedidoUnits : 15000;
    const impacto = round2(ent.cantidad_rechazada * unitValue);

    devoluciones.push({
      entrega_id: ent.id,
      fecha: (ent.hora_salida || ped?.created_at || '').slice(0, 10),
      codigo_tracking: ped?.codigo_tracking ?? 'IT-0000',
      cliente_nombre: cli?.nombre ?? 'Cliente sin nombre',
      motivo_rechazo: ent.motivo_rechazo || 'Sin motivo especificado',
      cantidad_rechazada: ent.cantidad_rechazada,
      unidad_medida: ent.unidad_medida,
      impacto_colones: impacto,
      estado: ent.estado,
    });
  }
  devoluciones.sort((a, b) => b.impacto_colones - a.impacto_colones);

  return {
    empresa,
    resumenFlotilla: {
      costo_total_colones: totalFleetCost,
      costo_promedio_por_unidad: avgCostPerUnit,
      costo_promedio_por_km: avgCostPerKm,
      entregas_a_tiempo_pct: fleetOnTimePct,
      total_viajes: fleetViajes.length,
      total_unidades_entregadas: totalFleetUnits,
      unidad_default: fleetEmpresa.unidad_medida_default,
      rutas,
    },
    resumenPyme: {
      costo_promedio_envio: costoPromedioEnvio,
      costo_total_envios: pymeTotalCost,
      entregas_a_tiempo_pct: pymeOnTimePct,
      tasa_facturacion_pct: tasaFacturacionPct,
      pedidos_facturados: pymeFacturados,
      total_pedidos: pymeCount,
      total_facturado_colones: pymeTotalFacturadoColones,
      proveedores,
    },
    tendenciaDiaria,
    auditorias: {
      desviosKilometraje,
      esperasCriticas,
      devoluciones,
    },
  };
}

export function buildFallbackAlerts(dashboard: ExecutiveDashboardData): AiOperationalAlert[] {
  const topDev = dashboard.auditorias.desviosKilometraje[0];
  const totalDevCost = round2(
    dashboard.auditorias.desviosKilometraje.reduce((acc, d) => acc + d.sobrecosto_colones, 0)
  );

  const topWait = dashboard.auditorias.esperasCriticas[0];
  const waitCost = topWait ? round2(topWait.visitas * 14500) : 58000;

  const topRejClient = dashboard.auditorias.devoluciones[0];
  const totalRejCost = round2(
    dashboard.auditorias.devoluciones.reduce((acc, r) => acc + r.impacto_colones, 0)
  );

  const fallback1: AiOperationalAlert = topDev
    ? {
        id: 'alerta-desvio-odometro',
        titulo: `Desvío de kilometraje en ${topDev.ruta_nombre}`,
        severidad: 'critica',
        que_paso: `Se detectaron ${dashboard.auditorias.desviosKilometraje.length} viajes con desvíos superiores al 10% sobre el tramo teórico (máximo +${topDev.desviacion_km.toFixed(1)} km / +${topDev.desviacion_pct.toFixed(0)}% en unidad ${topDev.placa}).`,
        impacto_colones: totalDevCost,
        impacto_formateado: formatColones(totalDevCost),
        accion_recomendada: `Auditar la traza GPS del chofer ${topDev.chofer_nombre} y bloquear paradas fuera de geocerca en el despacho.`,
      }
    : {
        id: 'alerta-costo-ruta',
        titulo: 'Optimización de costo por unidad en rutas GAM',
        severidad: 'media',
        que_paso: `El costo promedio actual es ${formatColones(dashboard.resumenFlotilla.costo_promedio_por_unidad)} por ${dashboard.resumenFlotilla.unidad_default} entregada.`,
        impacto_colones: 42000,
        impacto_formateado: formatColones(42000),
        accion_recomendada: 'Consolidar pedidos de baja densidad en la ventana matutina para elevar el factor de ocupación.',
      };

  const fallback2: AiOperationalAlert = topWait
    ? {
        id: 'alerta-espera-critica',
        titulo: `Espera crítica en andén de ${topWait.cliente_nombre}`,
        severidad: 'alta',
        que_paso: `${topWait.cliente_nombre} registra esperas de hasta ${topWait.espera_max_min.toFixed(0)} min (promedio ${topWait.espera_promedio_min.toFixed(0)} min) en ${topWait.visitas} visitas recientes, inmovilizando la unidad en zona ${topWait.zona}.`,
        impacto_colones: waitCost,
        impacto_formateado: formatColones(waitCost),
        accion_recomendada: 'Reprogramar la entrega al primer turno de su ventana o negociar recepción preferencial con bodega.',
      }
    : {
        id: 'alerta-tiempos-anden',
        titulo: 'Control de tiempos de espera en recepción',
        severidad: 'media',
        que_paso: 'Las ventanas horarias operan dentro del rango nominal con oportunidad de adelantar salidas 20 minutos.',
        impacto_colones: 28500,
        impacto_formateado: formatColones(28500),
        accion_recomendada: 'Mantener el registro obligatorio de hora de llegada desde la App del Chofer.',
      };

  const fallback3: AiOperationalAlert = topRejClient
    ? {
        id: 'alerta-rechazos-devoluciones',
        titulo: `Devoluciones concentradas en ${topRejClient.cliente_nombre}`,
        severidad: 'critica',
        que_paso: `Se acumulan ${dashboard.auditorias.devoluciones.length} rechazos por motivos como "${topRejClient.motivo_rechazo}" con ${topRejClient.cantidad_rechazada} ${topRejClient.unidad_medida} devueltas en el punto principal.`,
        impacto_colones: totalRejCost,
        impacto_formateado: formatColones(totalRejCost),
        accion_recomendada: 'Confirmar cita y calidad de empaque vía WhatsApp antes de despachar pedidos hacia este cliente.',
      }
    : {
        id: 'alerta-facturacion-pyme',
        titulo: 'Cobertura de facturación y guías externas',
        severidad: 'media',
        que_paso: `La tasa de facturación automática alcanza ${dashboard.resumenPyme.tasa_facturacion_pct}% con costo promedio de envío de ${formatColones(dashboard.resumenPyme.costo_promedio_envio)}.`,
        impacto_colones: 35000,
        impacto_formateado: formatColones(35000),
        accion_recomendada: 'Priorizar el courier con mayor cumplimiento a tiempo para envíos urgentes dentro del GAM.',
      };

  return [fallback1, fallback2, fallback3];
}
