import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeedDataset } from './seed-data';
import {
  calculateOrderTotals,
  matchClientFromText,
  matchItemsFromExtracted,
  parseOrderTextDeterministic,
} from './order-matching';
import {
  generateHaciendaKeyAndConsecutivo,
  quoteExternalCourier,
  selectOptimalFleetRoute,
} from './integrations';

test('matches existing Costa Rica client and detects new client cleanly', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const distId = dataset.empresas_config[0].id;

  const known = matchClientFromText(
    'Hola, somos Supermercado San Pedro Plaza, necesitamos 5 cajas de aceite vegetal',
    dataset.clientes,
    distId
  );
  assert.equal(known.es_cliente_nuevo, false);
  assert.equal(known.cliente_detectado.nombre, 'Supermercado San Pedro Plaza');
  assert.equal(known.cliente_detectado.zona, 'Este');

  const unknown = matchClientFromText(
    'Cliente: Pulpería La Amistad de Cartago, 3 bultos de arroz',
    dataset.clientes,
    distId
  );
  assert.equal(unknown.es_cliente_nuevo, true);
  assert.equal(unknown.cliente_detectado.zona, 'Este');
});

test('parses order text, matches catalog SKUs, validates stock, and computes 13% IVA', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const distId = dataset.empresas_config[0].id;

  const processed = parseOrderTextDeterministic(
    'Buenos días, para Ferretería Escazú Centro: 10 bultos de Cemento Gris, 4 cajas de Tornillo Drywall',
    dataset.clientes,
    dataset.productos_inventario,
    distId,
    'distribuidora_flotilla'
  );

  assert.equal(processed.es_cliente_nuevo, false);
  assert.equal(processed.items.length, 2);
  assert.equal(processed.items[0].sku, 'FER-201');
  assert.equal(processed.items[0].unidad, 'bultos');
  assert.equal(processed.items[0].disponible_en_inventario, true);

  const totals = calculateOrderTotals(processed.items);
  assert.equal(processed.total_estimado, totals.total_estimado);
  assert.equal(totals.iva, Math.round(totals.subtotal * 0.13 * 100) / 100);
});

test('flags insufficient stock when requested quantity exceeds inventory', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const distId = dataset.empresas_config[0].id;
  const matched = matchItemsFromExtracted(
    [{ sku: 'ABR-104', nombre: 'Café Molido Tarrazú', cantidad: 9999, unidad: 'cajas' }],
    dataset.productos_inventario,
    distId
  );

  assert.equal(matched.length, 1);
  assert.equal(matched[0].disponible_en_inventario, false);
});

test('generates 50-digit Costa Rica Hacienda key and 20-digit consecutivo', () => {
  const invoice = generateHaciendaKeyAndConsecutivo(42);
  assert.equal(invoice.clave_hacienda.length, 50);
  assert.ok(/^\d{50}$/.test(invoice.clave_hacienda));
  assert.equal(invoice.consecutivo.length, 20);
  assert.ok(invoice.clave_hacienda.startsWith('506'));
});

test('selects optimal fleet route by zone and quotes external courier accurately', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const clienteEste = dataset.clientes.find((c) => c.zona === 'Este')!;

  const fleet = selectOptimalFleetRoute(
    clienteEste,
    dataset.tramos,
    dataset.viajes,
    dataset.vehiculos,
    12
  );
  assert.ok(fleet.ruta_nombre.includes('Este'));
  assert.equal(fleet.capacidad_disponible, true);

  const quote = quoteExternalCourier(
    clienteEste,
    [{ cantidad: 8, unidad: 'unidades' }],
    'IT-9101',
    'Moovin CR'
  );
  assert.equal(quote.proveedor, 'Moovin CR');
  assert.ok(quote.tarifa_colones > 3200);
  assert.ok(quote.guia_externa.startsWith('CR-MO-'));
});
