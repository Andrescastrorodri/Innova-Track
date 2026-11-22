import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOrderTextDeterministic } from './order-matching';
import { generateSeedDataset } from './seed-data';

// Mensajes tipo WhatsApp en español de Costa Rica, leídos SIN IA (plan B de la demo).
const dataset = generateSeedDataset('2026-11-06');
const DIST = dataset.empresas_config[0];
const PYME = dataset.empresas_config[1];

function leer(texto: string, empresa = DIST) {
  const r = parseOrderTextDeterministic(
    texto,
    dataset.clientes,
    dataset.productos_inventario,
    empresa.id,
    empresa.tipo_operacion
  );
  return {
    ...r,
    lineas: r.items.map((i) => `${i.cantidad} ${i.unidad} ${i.sku}`),
  };
}

test('1. dos productos unidos con "y" y cliente nuevo presentado con "soy"', () => {
  const r = leer('Hola, soy Pulpería La Esquina, mándenme 5 sacos de arroz y 2 cajas de aceite');
  assert.deepEqual(r.lineas, ['5 bultos ABR-101', '2 cajas ABR-102']);
  assert.equal(r.es_cliente_nuevo, true);
  assert.equal(r.cliente_detectado.nombre, 'Pulpería La Esquina');
  assert.deepEqual(r.lineas_no_entendidas, []);
});

test('2. abarrotes con faltas de ortografía, números en palabras y docenas', () => {
  const r = leer(
    'buenas soy del abastecedor la violeta pavas ocupo dos sacos de arros, una docena de cajas de aseite y media docena de cajas de cafe porfa'
  );
  assert.deepEqual(r.lineas, ['2 bultos ABR-101', '12 cajas ABR-102', '6 cajas ABR-104']);
  assert.equal(r.es_cliente_nuevo, false);
  assert.equal(r.cliente_detectado.nombre, 'Abastecedor La Violeta Pavas');
});

test('3. ferretería en lista con viñetas: quintal, "un par", cubeta, rollo y kilos', () => {
  const r = leer(
    'Pedido Ferreteria El Yunke Curridabat\n- 20 quintales de semento\n- un par de cubetas de pintura\n- 3 rollos de cable electrico\n• 15 kilos de alambre galvanizado'
  );
  assert.deepEqual(r.lineas, [
    '20 bultos FER-201',
    '2 unidades FER-204',
    '3 unidades FER-203',
    '15 kg FER-205',
  ]);
  assert.equal(r.es_cliente_nuevo, false);
  assert.equal(r.cliente_detectado.nombre, 'Ferretería El Yunque Curridabat');
});

test('4. insumos médicos con tildes faltantes y cantidad en palabras', () => {
  const r = leer(
    'Buenos dias, de la Clinica Santa Ana Salud. Necesitamos 10 cajas de guantes de nitrilo, 5 cajas de mascarillas y cuatro galones de alcohol.'
  );
  assert.deepEqual(r.lineas, ['10 cajas MED-301', '5 cajas MED-302', '4 unidades MED-303']);
  assert.equal(r.cliente_detectado.nombre, 'Clínica Santa Ana Salud');
});

test('5. reconoce al cliente por cédula jurídica aunque no diga el nombre', () => {
  const cliente = dataset.clientes.find((c) => c.nombre === 'Supermercado San Pedro Plaza')!;
  const r = leer(`Facturar a la cédula ${cliente.cedula_juridica}. 30 kg de azucar y 3 cajas de leche`);
  assert.equal(r.es_cliente_nuevo, false);
  assert.equal(r.cliente_detectado.id, cliente.id);
  assert.deepEqual(r.lineas, ['30 kg ABR-105', '3 cajas ALI-404']);
});

test('6. señala la línea que no entiende en vez de inventar un producto', () => {
  const r = leer('Soy del Minisuper Guadalupe: 4 sacos de arroz, 2 cajas de refrescos y 3 bultos de frijoles');
  assert.deepEqual(r.lineas, ['4 bultos ABR-101', '3 bultos ABR-103']);
  assert.equal(r.lineas_no_entendidas.length, 1);
  assert.match(r.lineas_no_entendidas[0], /2 cajas de refrescos/i);
  assert.equal(r.items.some((i) => i.sku === 'SKU-MANUAL'), false);
  assert.equal(r.cliente_detectado.nombre, 'Minisúper Guadalupe Centro');
});

test('7. no confunde fechas ni horas con cantidades', () => {
  const r = leer(
    'Hola! para el viernes 15 antes de las 10 am ocupo 8 sacos de harina y 12 kg de queso mozzarella, gracias. Panadería La Espiga Dorada'
  );
  assert.deepEqual(r.lineas, ['8 bultos ALI-402', '12 kg ALI-401']);
  assert.deepEqual(r.lineas_no_entendidas, []);
  assert.equal(r.cliente_detectado.nombre, 'Panadería La Espiga Dorada Belén');
});

test('8. PyME: farmacia existente con gasa y salsa de su propio catálogo', () => {
  const r = leer(
    'Hola, les escribe Farmacia Pozos Medical, me mandan 15 paquetes de gasa esteril y dos cajas de salsa de tomate',
    PYME
  );
  assert.deepEqual(r.lineas, ['15 unidades MED-305', '2 cajas ALI-405']);
  assert.equal(r.es_cliente_nuevo, false);
  assert.equal(r.cliente_detectado.nombre, 'Farmacia Pozos Medical');
  assert.match(r.sugerencia_logistica, /tercerizado/i);
});

test('9. PyME: cliente nuevo y producto que no está en su catálogo', () => {
  const r = leer('Soy Soda La Negrita, quiero 3 cajas de salsa de tomate y 5 sacos de arroz', PYME);
  assert.deepEqual(r.lineas, ['3 cajas ALI-405']);
  assert.equal(r.lineas_no_entendidas.length, 1);
  assert.match(r.lineas_no_entendidas[0], /5 sacos de arroz/i);
  assert.equal(r.es_cliente_nuevo, true);
  assert.equal(r.cliente_detectado.nombre, 'Soda La Negrita');
});

test('10. cantidad después del producto y unidad omitida', () => {
  const r = leer('arroz 5 sacos\naceite 2 cajas\ncemento x 10');
  assert.deepEqual(r.lineas, ['5 bultos ABR-101', '2 cajas ABR-102', '10 bultos FER-201']);
});

test('11. medias cantidades y totales con IVA', () => {
  const r = leer('Para Carnes y Embutidos Moravia: 2 y medio kilos de queso y medio kilo de pollo');
  assert.deepEqual(r.lineas, ['2.5 kg ALI-401', '0.5 kg ALI-403']);
  assert.equal(r.cliente_detectado.nombre, 'Carnes y Embutidos Moravia');
  assert.equal(r.subtotal, 2.5 * 4650 + 0.5 * 3420);
  assert.equal(r.total_estimado, Math.round(r.subtotal * 1.13 * 100) / 100);
});
