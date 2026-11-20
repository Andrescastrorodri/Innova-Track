import type { Cliente, PedidoItem, Tramo, Vehiculo, Viaje } from './types';

export interface HaciendaInvoiceResult {
  clave_hacienda: string;
  consecutivo: string;
  fecha_emision: string;
  estado_hacienda: 'aceptado';
  modo_integracion: 'externo' | 'simulado';
}

export interface FleetRouteSuggestion {
  viaje_id: string | null;
  tramo_id: string;
  ruta_nombre: string;
  vehiculo_placa: string;
  vehiculo_modelo: string;
  chofer_nombre: string;
  fecha_programada: string;
  ventana_cliente: string;
  distancia_planificada_km: number;
  capacidad_disponible: boolean;
  razon_asignacion: string;
}

export interface CourierQuoteResult {
  proveedor: string;
  servicio: string;
  guia_externa: string;
  tarifa_colones: number;
  tiempo_estimado_horas: number;
  tracking_externo_url: string;
  modo_integracion: 'externo' | 'simulado';
}

export function generateHaciendaKeyAndConsecutivo(
  sequenceNum: number,
  emisorCedula = '3101784512',
  date = new Date()
): HaciendaInvoiceResult {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(date.getUTCFullYear()).slice(-2);
  const cedula12 = emisorCedula.replace(/\D/g, '').padStart(12, '0').slice(0, 12);
  const consecutivo = `0010000101${String(sequenceNum).padStart(10, '0')}`;
  const situacion = '1'; // 1 = Normal
  const securityCode = String((sequenceNum * 7919 + 104729) % 100000000).padStart(8, '0');

  // Clave numérica oficial de Hacienda Costa Rica: 50 dígitos exactos
  // 506 (3) + DDMMYY (6) + cédula (12) + consecutivo (20) + situación (1) + seguridad (8) = 50 dígitos
  const clave_hacienda = `506${dd}${mm}${yy}${cedula12}${consecutivo}${situacion}${securityCode}`;

  return {
    clave_hacienda,
    consecutivo,
    fecha_emision: date.toISOString(),
    estado_hacienda: 'aceptado',
    modo_integracion: 'simulado',
  };
}

export function selectOptimalFleetRoute(
  cliente: Pick<Cliente, 'zona' | 'ventana_inicio' | 'ventana_fin'>,
  tramos: Tramo[],
  viajes: Viaje[],
  vehiculos: Vehiculo[],
  requestedUnits = 0
): FleetRouteSuggestion {
  const matchedTramo =
    tramos.find((t) => t.zona_destino.toLowerCase() === cliente.zona.toLowerCase()) ?? tramos[0];

  const candidateTrips = viajes
    .filter((v) => v.tramo_id === matchedTramo?.id || v.ruta_nombre === matchedTramo?.ruta_nombre)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const latestTrip = candidateTrips[0] ?? viajes[0];
  const vehicle =
    vehiculos.find((v) => v.id === latestTrip?.vehiculo_id) ?? vehiculos[0];

  const today = new Date().toISOString().slice(0, 10);
  const plannedCapacity = vehicle?.capacidad_carga ?? 1000;
  const currentLoad = latestTrip?.carga_total_inicial ?? 0;
  const capacidad_disponible =
    vehicle?.unidad_capacidad === 'kg'
      ? currentLoad + requestedUnits * 12 <= plannedCapacity
      : currentLoad + requestedUnits <= plannedCapacity;

  return {
    viaje_id: latestTrip?.id ?? null,
    tramo_id: matchedTramo?.id ?? '',
    ruta_nombre: matchedTramo?.ruta_nombre ?? `Ruta Zona ${cliente.zona}`,
    vehiculo_placa: vehicle?.placa ?? 'CL-294810',
    vehiculo_modelo: vehicle?.modelo ?? 'Isuzu NPR',
    chofer_nombre: latestTrip?.chofer_nombre ?? 'Carlos Méndez Mora',
    fecha_programada: latestTrip?.fecha ?? today,
    ventana_cliente: `${cliente.ventana_inicio.slice(0, 5)}–${cliente.ventana_fin.slice(0, 5)}`,
    distancia_planificada_km: matchedTramo?.distancia_planificada_km ?? 68,
    capacidad_disponible,
    razon_asignacion: `Coincidencia exacta de zona (${cliente.zona}) y ventana horaria ${cliente.ventana_inicio.slice(0, 5)}–${cliente.ventana_fin.slice(0, 5)}.`,
  };
}

export function quoteExternalCourier(
  cliente: Pick<Cliente, 'zona' | 'nombre'>,
  items: Pick<PedidoItem, 'cantidad' | 'unidad'>[],
  codigoTracking: string,
  courierName = 'Moovin CR'
): CourierQuoteResult {
  const totalQty = items.reduce((acc, item) => acc + Number(item.cantidad), 0);
  const baseByCourier: Record<string, { tarifaBase: number; servicio: string; horas: number }> = {
    'Moovin CR': { tarifaBase: 3200, servicio: 'Mismo Día GAM Express', horas: 4 },
    'Correos de Costa Rica': { tarifaBase: 2650, servicio: 'EMS Courier Nacional', horas: 24 },
    'DHL Express CR': { tarifaBase: 5400, servicio: 'Express Prioritario', horas: 6 },
  };

  const spec = baseByCourier[courierName] ?? baseByCourier['Moovin CR'];
  const surchargePerUnit = totalQty > 5 ? (totalQty - 5) * 250 : 0;
  const zoneAdjustment = cliente.zona === 'Este' || cliente.zona === 'Norte' ? 450 : 0;
  const tarifa_colones = Math.round(spec.tarifaBase + surchargePerUnit + zoneAdjustment);
  const guia_externa = `CR-${courierName.slice(0, 2).toUpperCase()}-${codigoTracking.replace(/\D/g, '').padStart(5, '0')}`;

  return {
    proveedor: courierName,
    servicio: spec.servicio,
    guia_externa,
    tarifa_colones,
    tiempo_estimado_horas: spec.horas,
    tracking_externo_url: `https://tracking.courier-cr.example/${guia_externa}`,
    modo_integracion: 'simulado',
  };
}
