import type {
  Cliente,
  Entrega,
  EstadoParada,
  Gasto,
  Pedido,
  Tramo,
  Viaje,
} from './types';

export interface RouteStopCandidate {
  pedido: Pedido;
  cliente: Cliente;
  orden: number;
  total_unidades: number;
  unidad_principal: string;
}

export interface DeliveryValidationResult {
  valid: boolean;
  error?: string;
  estado_parada: EstadoParada;
  estado_pedido: Pedido['estado_entrega'];
}

export interface DriverTripSummary {
  viaje_id: string;
  ruta_nombre: string;
  chofer_nombre: string;
  km_recorridos: number;
  km_planificados: number;
  desviacion_km: number;
  total_paradas: number;
  paradas_completadas: number;
  entregas_a_tiempo: number;
  carga_entregada: number;
  carga_rechazada: number;
  total_gastos_colones: number;
  total_litros_combustible: number;
  estado_cierre: Viaje['estado'];
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function buildRouteStopsForDispatch(
  tramo: Tramo,
  pedidos: Pedido[],
  clientes: Cliente[],
  empresaId?: string
): RouteStopCandidate[] {
  const clientMap = new Map(clientes.map((c) => [c.id, c]));

  const matchingPedidos = pedidos.filter((p) => {
    if (empresaId && p.empresa_id !== empresaId) return false;
    if (p.modalidad_envio !== 'flotilla_propia') return false;
    if (p.estado_entrega !== 'pendiente_ruta' && p.estado_entrega !== 'en_ruta') return false;
    const cli = clientMap.get(p.cliente_id);
    if (!cli) return false;
    return cli.zona.toLowerCase() === tramo.zona_destino.toLowerCase();
  });

  const sorted = [...matchingPedidos].sort((a, b) => {
    const ca = clientMap.get(a.cliente_id);
    const cb = clientMap.get(b.cliente_id);
    const wa = ca?.ventana_inicio ?? '08:00:00';
    const wb = cb?.ventana_inicio ?? '08:00:00';
    return wa.localeCompare(wb);
  });

  return sorted.map((pedido, index) => {
    const cliente = clientMap.get(pedido.cliente_id)!;
    const total_unidades = round2(
      pedido.items_json.reduce((acc, it) => acc + Number(it.cantidad), 0)
    );
    const unidad_principal = pedido.items_json[0]?.unidad ?? 'unidades';
    return {
      pedido,
      cliente,
      orden: index + 1,
      total_unidades,
      unidad_principal,
    };
  });
}

export function validateDeliveryInput(params: {
  cantidadEsperada: number;
  cantidadEntregada: number;
  cantidadRechazada: number;
  motivoRechazo?: string | null;
  hasProof: boolean;
}): DeliveryValidationResult {
  const { cantidadEsperada, cantidadEntregada, cantidadRechazada, motivoRechazo, hasProof } =
    params;

  if (cantidadEntregada < 0 || cantidadRechazada < 0) {
    return {
      valid: false,
      error: 'Las cantidades entregadas y rechazadas no pueden ser negativas.',
      estado_parada: 'pendiente',
      estado_pedido: 'en_ruta',
    };
  }

  if (round2(cantidadEntregada + cantidadRechazada) === 0) {
    return {
      valid: false,
      error: 'Debes confirmar al menos la cantidad entregada o rechazada.',
      estado_parada: 'pendiente',
      estado_pedido: 'en_ruta',
    };
  }

  if (cantidadEsperada > 0 && round2(cantidadEntregada + cantidadRechazada) > round2(cantidadEsperada)) {
    return {
      valid: false,
      error: `La suma (${cantidadEntregada + cantidadRechazada}) supera la cantidad del pedido (${cantidadEsperada}).`,
      estado_parada: 'pendiente',
      estado_pedido: 'en_ruta',
    };
  }

  if (cantidadRechazada > 0 && (!motivoRechazo || !motivoRechazo.trim())) {
    return {
      valid: false,
      error: 'Selecciona el motivo del rechazo antes de cerrar la parada.',
      estado_parada: 'pendiente',
      estado_pedido: 'en_ruta',
    };
  }

  if (!hasProof) {
    return {
      valid: false,
      error: 'Captura una foto de comprobante o firma digital para completar la entrega.',
      estado_parada: 'pendiente',
      estado_pedido: 'en_ruta',
    };
  }

  if (cantidadEntregada === 0 && cantidadRechazada > 0) {
    return {
      valid: true,
      estado_parada: 'rechazado',
      estado_pedido: 'rechazado',
    };
  }

  if (cantidadRechazada > 0) {
    return {
      valid: true,
      estado_parada: 'rechazo_parcial',
      estado_pedido: 'entregado',
    };
  }

  return {
    valid: true,
    estado_parada: 'entregado',
    estado_pedido: 'entregado',
  };
}

function toCrTimeString(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '12:00:00';
  // Costa Rica is permanently UTC-6
  const utcMs = d.getTime() - 6 * 3600 * 1000;
  const cr = new Date(utcMs);
  const hh = String(cr.getUTCHours()).padStart(2, '0');
  const mm = String(cr.getUTCMinutes()).padStart(2, '0');
  const ss = String(cr.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function computeDriverTripSummary(
  viaje: Viaje,
  tramo: Tramo | undefined,
  entregas: Entrega[],
  clientes: Cliente[],
  gastos: Gasto[]
): DriverTripSummary {
  const clientMap = new Map(clientes.map((c) => [c.id, c]));
  const km_recorridos = round2(Math.max(0, (viaje.odometro_fin || 0) - (viaje.odometro_inicio || 0)));
  const km_planificados = tramo?.distancia_planificada_km ?? km_recorridos;
  const desviacion_km = round2(km_recorridos - km_planificados);

  const paradas_completadas = entregas.filter((e) =>
    ['entregado', 'rechazo_parcial', 'rechazado'].includes(e.estado)
  ).length;

  let entregas_a_tiempo = 0;
  let carga_entregada = 0;
  let carga_rechazada = 0;
  let hasRejections = false;

  for (const e of entregas) {
    const stopFinished = ['entregado', 'rechazo_parcial', 'rechazado'].includes(e.estado);
    if (stopFinished) {
      carga_entregada = round2(carga_entregada + Number(e.cantidad_entregada || 0));
      carga_rechazada = round2(carga_rechazada + Number(e.cantidad_rechazada || 0));
    }
    if (e.estado === 'rechazado' || e.estado === 'rechazo_parcial') {
      hasRejections = true;
    }

    if (e.hora_llegada) {
      const cli = clientMap.get(e.cliente_id);
      if (cli) {
        const localTime = toCrTimeString(e.hora_llegada);
        if (localTime >= cli.ventana_inicio && localTime <= cli.ventana_fin) {
          entregas_a_tiempo += 1;
        }
      }
    }
  }

  const total_gastos_colones = round2(
    gastos.reduce((acc, g) => acc + Number(g.monto_colones || 0), 0)
  );
  const total_litros_combustible = round2(
    gastos.reduce((acc, g) => acc + Number(g.litros || 0), 0)
  );

  const estado_cierre: Viaje['estado'] =
    hasRejections || desviacion_km >= 40 ? 'con_incidencia' : 'completado';

  return {
    viaje_id: viaje.id,
    ruta_nombre: viaje.ruta_nombre,
    chofer_nombre: viaje.chofer_nombre,
    km_recorridos,
    km_planificados,
    desviacion_km,
    total_paradas: entregas.length,
    paradas_completadas,
    entregas_a_tiempo,
    carga_entregada,
    carga_rechazada,
    total_gastos_colones,
    total_litros_combustible,
    estado_cierre,
  };
}
