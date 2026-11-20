import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFallbackAlerts, computeExecutiveDashboard } from './analytics';
import { generateSeedDataset } from './seed-data';

test('computes fleet KPIs per route with semaforo and unit economics', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const distEmpresa = dataset.empresas_config.find(
    (e) => e.tipo_operacion === 'distribuidora_flotilla'
  )!;
  const dashboard = computeExecutiveDashboard(dataset, distEmpresa.id);

  assert.equal(dashboard.resumenFlotilla.rutas.length, 3);
  assert.ok(dashboard.resumenFlotilla.costo_total_colones > 0);
  assert.ok(dashboard.resumenFlotilla.costo_promedio_por_unidad > 0);
  assert.ok(dashboard.resumenFlotilla.costo_promedio_por_km > 0);
  for (const r of dashboard.resumenFlotilla.rutas) {
    assert.ok(['verde', 'ambar', 'rojo'].includes(r.semaforo));
  }
});

test('computes PyME outsourced courier KPIs and automatic invoicing rate', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const pymeEmpresa = dataset.empresas_config.find(
    (e) => e.tipo_operacion === 'pyme_tercerizada'
  )!;
  const dashboard = computeExecutiveDashboard(dataset, pymeEmpresa.id);

  assert.ok(dashboard.resumenPyme.total_pedidos >= 7);
  assert.ok(dashboard.resumenPyme.costo_promedio_envio > 0);
  assert.ok(dashboard.resumenPyme.tasa_facturacion_pct >= 80);
  assert.ok(dashboard.resumenPyme.proveedores.length >= 2);
  assert.ok(dashboard.tendenciaDiaria.length >= 7);
});

test('detects >10% odometer deviations, critical wait times, rejections, and builds 3 fallback alerts in CRC', () => {
  const dataset = generateSeedDataset('2026-11-06');
  const distEmpresa = dataset.empresas_config.find(
    (e) => e.tipo_operacion === 'distribuidora_flotilla'
  )!;
  const dashboard = computeExecutiveDashboard(dataset, distEmpresa.id);

  assert.ok(dashboard.auditorias.desviosKilometraje.length >= 2);
  assert.ok(dashboard.auditorias.desviosKilometraje[0].desviacion_pct > 10);
  assert.ok(dashboard.auditorias.esperasCriticas.length >= 1);
  assert.ok(dashboard.auditorias.esperasCriticas[0].espera_max_min >= 60);
  assert.ok(dashboard.auditorias.devoluciones.length >= 3);

  const alerts = buildFallbackAlerts(dashboard);
  assert.equal(alerts.length, 3);
  for (const alert of alerts) {
    assert.ok(alert.impacto_colones > 0);
    assert.ok(alert.impacto_formateado.startsWith('₡'));
    assert.ok(alert.que_paso.length > 10);
    assert.ok(alert.accion_recomendada.length > 10);
  }
});
