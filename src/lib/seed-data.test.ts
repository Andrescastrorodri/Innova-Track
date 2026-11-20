import test from 'node:test';
import assert from 'node:assert/strict';
import { formatColones, formatInt, generateSeedDataset } from './seed-data';

test('generates multisector clients, 3 vehicles, 3 routes, and 2 weeks of operation', () => {
  const dataset = generateSeedDataset('2026-11-06');

  assert.equal(dataset.empresas_config.length, 2);
  assert.equal(dataset.clientes.length, 30);
  assert.equal(dataset.vehiculos.length, 3);
  assert.equal(dataset.tramos.length, 3);

  const sectors = new Set(dataset.clientes.map((c) => c.sector));
  assert.ok(sectors.has('abarrotes'));
  assert.ok(sectors.has('ferreteria'));
  assert.ok(sectors.has('insumos_medicos'));
  assert.ok(sectors.has('alimentos'));

  const units = new Set(dataset.productos_inventario.map((p) => p.unidad_medida));
  assert.ok(units.has('unidades'));
  assert.ok(units.has('cajas'));
  assert.ok(units.has('bultos'));
  assert.ok(units.has('kg'));

  const uniqueDates = new Set(dataset.viajes.map((v) => v.fecha));
  assert.equal(uniqueDates.size, 14);
});

test('plants excessive wait time, +40km odometer deviation, and recurring rejections', () => {
  const dataset = generateSeedDataset('2026-11-06');

  // 1. Esperas excesivas en un cliente (> 60 min)
  assert.ok(dataset.anomaliesSummary.excessiveWaitDeliveries >= 3);
  assert.ok(dataset.anomaliesSummary.maxWaitMinutes >= 65);

  // 2. Desvío de +40 km en una ruta
  assert.ok(dataset.anomaliesSummary.odometerDeviationMaxKm >= 40);
  const deviatedTrips = dataset.viajes.filter((v) => {
    const tramo = dataset.tramos.find((t) => t.id === v.tramo_id);
    if (!tramo) return false;
    return v.odometro_fin - v.odometro_inicio - tramo.distancia_planificada_km >= 40;
  });
  assert.ok(deviatedTrips.length >= 2);

  // 3. Rechazos recurrentes en un cliente
  assert.ok(dataset.anomaliesSummary.recurringRejectionCount >= 3);
  const clientRejections = dataset.entregas.filter(
    (e) =>
      e.cliente_id === dataset.anomaliesSummary.recurringRejectionClientId &&
      (e.estado === 'rechazado' || e.estado === 'rechazo_parcial')
  );
  assert.ok(clientRejections.length >= 3);
});

test('enforces Costa Rica 13% IVA financial precision and colones formatting', () => {
  const dataset = generateSeedDataset('2026-11-06');

  for (const pedido of dataset.pedidos) {
    const expectedTotal = Math.round((pedido.subtotal + pedido.iva) * 100) / 100;
    assert.equal(pedido.total, expectedTotal);
    assert.ok(pedido.iva > 0);
  }

  assert.equal(formatColones(104500), '₡104.500');
  assert.equal(formatInt(4500), '4.500');
});
