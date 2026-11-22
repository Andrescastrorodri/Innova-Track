import type { SeedDataset } from './types';

// Indicadores de impacto para gerencia. Todo lo que sale de `computeImpactMetrics`
// se mide de los datos registrados; lo que no se puede medir se declara como supuesto
// en `SavingsAssumptions` y se puede editar en pantalla.

export interface RouteKmComparison {
  ruta_nombre: string;
  viajes: number;
  km_planificados: number;
  km_reales: number;
  exceso_km: number;
  exceso_pct: number;
}

export interface ImpactMetrics {
  /** Días con al menos un viaje cerrado. */
  dias_operados: number;
  viajes_cerrados: number;
  entregas_realizadas: number;
  costo_total_colones: number;
  costo_por_km: number;
  costo_por_entrega: number;
  /** Combustible + mantenimiento por km, según vehículos y precio de combustible vigentes. */
  costo_variable_por_km: number;
  km_planificados: number;
  km_reales: number;
  exceso_km: number;
  exceso_pct: number;
  rutas: RouteKmComparison[];
  entregas_con_llegada: number;
  entregas_fuera_ventana: number;
  fuera_ventana_pct: number;
  /** Horas entre la entrada del pedido y la salida del camión que lo lleva. null si no hay datos. */
  horas_pedido_a_despacho: number | null;
  pedidos_medidos_despacho: number;
  km_por_dia: number;
  pedidos_por_dia: number;
}

export interface SavingsAssumptions {
  costo_variable_por_km: number;
  km_por_dia: number;
  dias_operativos_anio: number;
  reduccion_km_pct: number;
  pedidos_por_dia: number;
  minutos_digitacion_por_pedido: number;
  salario_hora_colones: number;
}

export interface SavingsResult {
  km_evitados_anio: number;
  ahorro_km_colones: number;
  horas_digitacion_anio: number;
  ahorro_digitacion_colones: number;
  ahorro_total_colones: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function crTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - 6 * 3600 * 1000).toISOString().slice(11, 19);
}

function isFinishedTrip(estado: string): boolean {
  return estado === 'completado' || estado === 'con_incidencia';
}

export function computeImpactMetrics(dataset: SeedDataset, empresaId?: string): ImpactMetrics {
  const empresa =
    (empresaId ? dataset.empresas_config.find((e) => e.id === empresaId) : undefined) ??
    dataset.empresas_config.find((e) => e.tipo_operacion === 'distribuidora_flotilla') ??
    dataset.empresas_config[0];

  const viajes = dataset.viajes.filter((v) => v.empresa_id === empresa?.id && isFinishedTrip(v.estado));
  const viajeById = new Map(viajes.map((v) => [v.id, v]));
  const tramoById = new Map(dataset.tramos.map((t) => [t.id, t]));
  const vehiculoById = new Map(dataset.vehiculos.map((v) => [v.id, v]));
  const clienteById = new Map(dataset.clientes.map((c) => [c.id, c]));
  const pedidoById = new Map(dataset.pedidos.map((p) => [p.id, p]));
  const param = dataset.parametros_costo.find((p) => p.empresa_id === empresa?.id) ?? dataset.parametros_costo[0];

  const gastosPorViaje = new Map<string, number>();
  for (const g of dataset.gastos) {
    if (g.viaje_id) gastosPorViaje.set(g.viaje_id, (gastosPorViaje.get(g.viaje_id) ?? 0) + Number(g.monto_colones || 0));
  }

  let costoTotal = 0;
  let kmReales = 0;
  let kmPlan = 0;
  const rutas = new Map<string, RouteKmComparison>();
  const dias = new Set<string>();

  for (const v of viajes) {
    const vehiculo = vehiculoById.get(v.vehiculo_id);
    const tramo = tramoById.get(v.tramo_id);
    const km = Math.max(0, (v.odometro_fin || v.odometro_inicio) - v.odometro_inicio);
    const plan = tramo?.distancia_planificada_km ?? km;
    costoTotal +=
      (vehiculo?.costo_alquiler_diario ?? 0) +
      km * (vehiculo?.mantenimiento_por_km ?? 0) +
      (param?.salario_chofer_diario ?? 0) +
      (param?.viaticos_diarios ?? 0) +
      (gastosPorViaje.get(v.id) ?? 0);
    kmReales += km;
    kmPlan += plan;
    dias.add(v.fecha.slice(0, 10));

    const r = rutas.get(v.ruta_nombre) ?? {
      ruta_nombre: v.ruta_nombre,
      viajes: 0,
      km_planificados: 0,
      km_reales: 0,
      exceso_km: 0,
      exceso_pct: 0,
    };
    r.viajes += 1;
    r.km_planificados += plan;
    r.km_reales += km;
    rutas.set(v.ruta_nombre, r);
  }

  const rutasList = Array.from(rutas.values()).map((r) => ({
    ...r,
    km_planificados: round2(r.km_planificados),
    km_reales: round2(r.km_reales),
    exceso_km: round2(r.km_reales - r.km_planificados),
    exceso_pct: r.km_planificados > 0 ? round2(((r.km_reales - r.km_planificados) / r.km_planificados) * 100) : 0,
  }));

  // Entregas: realizadas, fuera de ventana y tiempo de pedido a despacho.
  let entregasRealizadas = 0;
  let conLlegada = 0;
  let fueraVentana = 0;
  let horasDespacho = 0;
  let pedidosMedidos = 0;

  for (const e of dataset.entregas) {
    const viaje = e.viaje_id ? viajeById.get(e.viaje_id) : undefined;
    if (!viaje) continue;
    if (e.estado === 'entregado' || e.estado === 'rechazo_parcial') entregasRealizadas += 1;

    if (e.hora_llegada) {
      const cliente = clienteById.get(e.cliente_id);
      const llegada = crTime(e.hora_llegada);
      if (cliente && llegada) {
        conLlegada += 1;
        if (llegada < cliente.ventana_inicio || llegada > cliente.ventana_fin) fueraVentana += 1;
      }
    }

    const pedido = pedidoById.get(e.pedido_id);
    if (pedido && viaje.hora_salida) {
      const entrada = new Date(pedido.created_at).getTime();
      const salida = new Date(viaje.hora_salida).getTime();
      if (Number.isFinite(entrada) && Number.isFinite(salida) && salida >= entrada) {
        horasDespacho += (salida - entrada) / 3_600_000;
        pedidosMedidos += 1;
      }
    }
  }

  const vehiculosEmpresa = dataset.vehiculos.filter((v) => v.empresa_id === empresa?.id);
  const costoVariableKm =
    vehiculosEmpresa.length > 0 && param
      ? vehiculosEmpresa.reduce(
          (acc, v) => acc + param.precio_combustible_litro / v.rendimiento_km_litro + v.mantenimiento_por_km,
          0
        ) / vehiculosEmpresa.length
      : 0;

  const diasOperados = dias.size;

  // Pedidos por día: todos los pedidos de la empresa, repartidos en los días en que entraron.
  const pedidosEmpresa = dataset.pedidos.filter((p) => p.empresa_id === empresa?.id);
  const diasConPedidos = new Set(
    pedidosEmpresa.map((p) => {
      const t = new Date(p.created_at).getTime();
      return Number.isFinite(t) ? new Date(t - 6 * 3600 * 1000).toISOString().slice(0, 10) : '';
    })
  );
  diasConPedidos.delete('');

  return {
    dias_operados: diasOperados,
    viajes_cerrados: viajes.length,
    entregas_realizadas: entregasRealizadas,
    costo_total_colones: round2(costoTotal),
    costo_por_km: kmReales > 0 ? round2(costoTotal / kmReales) : 0,
    costo_por_entrega: entregasRealizadas > 0 ? round2(costoTotal / entregasRealizadas) : 0,
    costo_variable_por_km: round2(costoVariableKm),
    km_planificados: round2(kmPlan),
    km_reales: round2(kmReales),
    exceso_km: round2(kmReales - kmPlan),
    exceso_pct: kmPlan > 0 ? round2(((kmReales - kmPlan) / kmPlan) * 100) : 0,
    rutas: rutasList,
    entregas_con_llegada: conLlegada,
    entregas_fuera_ventana: fueraVentana,
    fuera_ventana_pct: conLlegada > 0 ? round2((fueraVentana / conLlegada) * 100) : 0,
    horas_pedido_a_despacho: pedidosMedidos > 0 ? round2(horasDespacho / pedidosMedidos) : null,
    pedidos_medidos_despacho: pedidosMedidos,
    km_por_dia: diasOperados > 0 ? round2(kmReales / diasOperados) : 0,
    pedidos_por_dia: diasConPedidos.size > 0 ? round2(pedidosEmpresa.length / diasConPedidos.size) : 0,
  };
}

/**
 * Supuestos iniciales del ahorro. Los tres primeros salen de los datos medidos;
 * los demás son supuestos de negocio que gerencia debe ajustar a su realidad.
 */
export function defaultSavingsAssumptions(m: ImpactMetrics): SavingsAssumptions {
  return {
    costo_variable_por_km: Math.round(m.costo_variable_por_km),
    km_por_dia: Math.round(m.km_por_dia),
    pedidos_por_dia: Math.round(m.pedidos_por_dia),
    // Se propone recuperar el exceso de km que hoy se recorre sobre lo planificado (tope 15 %).
    reduccion_km_pct: Math.min(15, Math.max(0, Math.round(m.exceso_pct))),
    dias_operativos_anio: 300,
    minutos_digitacion_por_pedido: 4,
    salario_hora_colones: 2500,
  };
}

function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeAnnualSavings(a: SavingsAssumptions): SavingsResult {
  const dias = nonNegative(a.dias_operativos_anio);
  const pct = Math.min(100, nonNegative(a.reduccion_km_pct)) / 100;
  const kmEvitados = nonNegative(a.km_por_dia) * dias * pct;
  const ahorroKm = kmEvitados * nonNegative(a.costo_variable_por_km);
  const horas = (nonNegative(a.pedidos_por_dia) * dias * nonNegative(a.minutos_digitacion_por_pedido)) / 60;
  const ahorroDigitacion = horas * nonNegative(a.salario_hora_colones);
  return {
    km_evitados_anio: Math.round(kmEvitados),
    ahorro_km_colones: Math.round(ahorroKm),
    horas_digitacion_anio: Math.round(horas),
    ahorro_digitacion_colones: Math.round(ahorroDigitacion),
    ahorro_total_colones: Math.round(ahorroKm + ahorroDigitacion),
  };
}
