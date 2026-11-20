import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeedDataset } from './seed-data';
import {
  buildRouteStopsForDispatch,
  computeDriverTripSummary,
  validateDeliveryInput,
} from './driver-logic';

test('builds ordered route stops from pending fleet orders matching route zone', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const distId = dataset.empresas_config[0].id;
  const tramoEste = dataset.tramos[1]; // Zona Este
  const clienteEste = dataset.clientes.find((c) => c.empresa_id === distId && c.zona === 'Este')!;

  const pendingPedido = {
    ...dataset.pedidos[0],
    id: 'ped-test-1',
    codigo_tracking: 'IT-9901',
    cliente_id: clienteEste.id,
    modalidad_envio: 'flotilla_propia' as const,
    estado_entrega: 'pendiente_ruta' as const,
  };

  const stops = buildRouteStopsForDispatch(
    tramoEste,
    [pendingPedido],
    dataset.clientes,
    distId
  );

  assert.equal(stops.length, 1);
  assert.equal(stops[0].pedido.codigo_tracking, 'IT-9901');
  assert.equal(stops[0].orden, 1);
});

test('validates delivery quantities, mandatory rejection reason, and proof requirement', () => {
  const missingReason = validateDeliveryInput({
    cantidadEsperada: 10,
    cantidadEntregada: 8,
    cantidadRechazada: 2,
    motivoRechazo: '',
    hasProof: true,
  });
  assert.equal(missingReason.valid, false);

  const missingProof = validateDeliveryInput({
    cantidadEsperada: 10,
    cantidadEntregada: 10,
    cantidadRechazada: 0,
    hasProof: false,
  });
  assert.equal(missingProof.valid, false);

  const partialSuccess = validateDeliveryInput({
    cantidadEsperada: 10,
    cantidadEntregada: 7,
    cantidadRechazada: 3,
    motivoRechazo: 'Daño en empaque',
    hasProof: true,
  });
  assert.equal(partialSuccess.valid, true);
  assert.equal(partialSuccess.estado_parada, 'rechazo_parcial');
  assert.equal(partialSuccess.estado_pedido, 'entregado');

  const fullReject = validateDeliveryInput({
    cantidadEsperada: 10,
    cantidadEntregada: 0,
    cantidadRechazada: 10,
    motivoRechazo: 'Local cerrado',
    hasProof: true,
  });
  assert.equal(fullReject.valid, true);
  assert.equal(fullReject.estado_parada, 'rechazado');
  assert.equal(fullReject.estado_pedido, 'rechazado');
});

test('computes instant driver close-out summary with km deviation and Costa Rica window compliance', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const viaje = { ...dataset.viajes[0], odometro_inicio: 42000, odometro_fin: 42072 };
  const tramo = dataset.tramos.find((t) => t.id === viaje.tramo_id);
  const entregas = dataset.entregas.filter((e) => e.viaje_id === viaje.id);
  const gastos = dataset.gastos.filter((g) => g.viaje_id === viaje.id);

  const summary = computeDriverTripSummary(viaje, tramo, entregas, dataset.clientes, gastos);

  assert.equal(summary.km_recorridos, 72);
  assert.equal(summary.km_planificados, 68);
  assert.equal(summary.desviacion_km, 4);
  assert.equal(summary.total_paradas, entregas.length);
  assert.ok(summary.total_gastos_colones > 0);
  assert.ok(summary.carga_entregada > 0);
});
