import assert from 'node:assert/strict';
import test from 'node:test';
import { STORE_TABLES, buildDemoStore, diffStore, rowFromDb, rowToDb } from './data-store';
import type { SeedDataset, Viaje } from './types';

function snapshotOf(data: SeedDataset): Map<string, string> {
  const snap = new Map<string, string>();
  for (const table of STORE_TABLES) {
    for (const row of data[table] as unknown as Array<{ id: string }>) {
      snap.set(`${table}:${row.id}`, JSON.stringify(row));
    }
  }
  return snap;
}

test('sin cambios no se envía nada a la base', () => {
  const data = buildDemoStore(new Date('2026-11-22T18:00:00Z'));
  assert.deepEqual(diffStore(snapshotOf(data), data), []);
});

test('solo se envían las filas nuevas o modificadas, en orden de dependencias', () => {
  const data = buildDemoStore(new Date('2026-11-22T18:00:00Z'));
  const snap = snapshotOf(data);

  data.productos_inventario[0].stock_actual -= 5;
  data.pedidos[3].estado_entrega = 'rechazado';
  const nuevoViaje: Viaje = { ...data.viajes[0], id: 'aaaaaaaa-0000-4000-8000-000000000001', estado: 'en_curso' };
  data.viajes.push(nuevoViaje);
  data.entregas[0].viaje_id = nuevoViaje.id;

  const changes = diffStore(snap, data);
  assert.deepEqual(
    changes.map((c) => [c.table, c.rows.length]),
    [['productos_inventario', 1], ['viajes', 1], ['pedidos', 1], ['entregas', 1]]
  );
  // El viaje nuevo va antes que la entrega que lo referencia.
  const order = changes.map((c) => c.table);
  assert.ok(order.indexOf('viajes') < order.indexOf('entregas'));
});

test('un viaje en curso se guarda con NULL y se lee de vuelta sin perder datos', () => {
  const viaje = {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    odometro_inicio: 48250,
    odometro_fin: 48250,
    foto_odometro_inicio: '/api/evidencias/x.png',
    hora_salida: '2026-11-22T14:00:00.000Z',
    foto_odometro_fin: '',
    hora_regreso: '',
    tramo_id: 't1',
    gps_salida: { lat: 9.9, lng: -84, timestamp: 'x' },
    gps_regreso: { lat: 9.9, lng: -84, timestamp: 'x' },
  };
  const db = rowToDb('viajes', viaje);
  assert.equal(db.hora_regreso, null);
  assert.equal(db.foto_odometro_fin, null);
  assert.equal(db.hora_salida, '2026-11-22T14:00:00.000Z');

  // Postgres devuelve además columnas propias que la app no usa.
  const back = rowFromDb('viajes', { ...db, created_at: '2026-11-22T14:00:01Z' });
  assert.deepEqual(back, viaje);
});

test('rowFromDb tolera los NULL de la base en campos que la app espera llenos', () => {
  const viaje = rowFromDb('viajes', {
    id: 'v', odometro_inicio: null, odometro_fin: null, foto_odometro_inicio: null, hora_salida: null,
    foto_odometro_fin: null, hora_regreso: null, gps_salida: null, gps_regreso: null, tramo_id: null,
  });
  assert.equal(viaje.odometro_fin, 0);
  assert.equal(viaje.hora_regreso, '');
  assert.deepEqual(viaje.gps_salida, { lat: 0, lng: 0, timestamp: '' });

  assert.equal(rowFromDb('clientes', { id: 'c', telefono: null }).telefono, '');
  // created_at solo forma parte del pedido.
  assert.equal('created_at' in rowFromDb('clientes', { id: 'c', created_at: 'x' }), false);
  assert.equal(rowFromDb('pedidos', { id: 'p', created_at: 'x' }).created_at, 'x');
});

test('los datos de demostración son estables: cargarlos dos veces no duplica pedidos', () => {
  const now = new Date('2026-11-22T18:00:00Z');
  const a = buildDemoStore(now);
  const b = buildDemoStore(now);
  assert.deepEqual(a.pedidos.map((p) => p.id), b.pedidos.map((p) => p.id));
  assert.equal(new Set(a.pedidos.map((p) => p.id)).size, a.pedidos.length);
  assert.equal(new Set(a.pedidos.map((p) => p.codigo_tracking)).size, a.pedidos.length);
  assert.equal(a.pedidos.filter((p) => p.estado_entrega === 'pendiente_ruta').length, 3);
  // Dos semanas que terminan ayer (hora de Costa Rica).
  const ultimaFecha = a.viajes.map((v) => v.fecha).sort().at(-1) ?? '';
  assert.equal(ultimaFecha < '2026-11-22' && ultimaFecha >= '2026-11-20', true);
});
