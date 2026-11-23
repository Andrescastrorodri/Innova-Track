import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAnnualSavings,
  computeImpactMetrics,
  defaultSavingsAssumptions,
  type SavingsAssumptions,
} from './impact';
import { generateSeedDataset } from './seed-data';

const dataset = generateSeedDataset('2026-11-06');
const metrics = computeImpactMetrics(dataset);

const BASE: SavingsAssumptions = {
  costo_variable_por_km: 200,
  km_por_dia: 100,
  dias_operativos_anio: 300,
  reduccion_km_pct: 10,
  pedidos_por_dia: 20,
  minutos_digitacion_por_pedido: 6,
  salario_hora_colones: 2000,
};

test('el ahorro anual sale de la fórmula declarada', () => {
  const r = computeAnnualSavings(BASE);
  // km: 100 km/día × 300 días × 10 % = 3 000 km × ₡200 = ₡600 000
  assert.equal(r.km_evitados_anio, 3000);
  assert.equal(r.ahorro_km_colones, 600_000);
  // digitación: 20 pedidos × 300 días × 6 min = 600 h × ₡2 000 = ₡1 200 000
  assert.equal(r.horas_digitacion_anio, 600);
  assert.equal(r.ahorro_digitacion_colones, 1_200_000);
  assert.equal(r.ahorro_total_colones, 1_800_000);
});

test('cambiar un supuesto cambia el ahorro en la proporción esperada', () => {
  const base = computeAnnualSavings(BASE);
  assert.equal(computeAnnualSavings({ ...BASE, reduccion_km_pct: 20 }).ahorro_km_colones, base.ahorro_km_colones * 2);
  assert.equal(computeAnnualSavings({ ...BASE, costo_variable_por_km: 100 }).ahorro_km_colones, base.ahorro_km_colones / 2);
  assert.equal(
    computeAnnualSavings({ ...BASE, salario_hora_colones: 4000 }).ahorro_digitacion_colones,
    base.ahorro_digitacion_colones * 2
  );
  assert.equal(
    computeAnnualSavings({ ...BASE, minutos_digitacion_por_pedido: 0 }).ahorro_total_colones,
    base.ahorro_km_colones
  );
  // Un supuesto de km no toca el ahorro de digitación.
  assert.equal(
    computeAnnualSavings({ ...BASE, km_por_dia: 500 }).ahorro_digitacion_colones,
    base.ahorro_digitacion_colones
  );
});

test('valores vacíos, negativos o absurdos no producen ahorros negativos ni NaN', () => {
  const r = computeAnnualSavings({ ...BASE, km_por_dia: Number.NaN, salario_hora_colones: -5, reduccion_km_pct: 250 });
  assert.equal(r.ahorro_km_colones, 0);
  assert.equal(r.ahorro_digitacion_colones, 0);
  assert.equal(computeAnnualSavings({ ...BASE, reduccion_km_pct: 250 }).km_evitados_anio, 100 * 300);
});

test('los indicadores medidos cuadran con los datos semilla', () => {
  const viajes = dataset.viajes.filter((v) => v.estado === 'completado' || v.estado === 'con_incidencia');
  const kmReales = viajes.reduce((a, v) => a + (v.odometro_fin - v.odometro_inicio), 0);
  assert.equal(metrics.viajes_cerrados, viajes.length);
  assert.equal(metrics.km_reales, Math.round(kmReales * 100) / 100);
  assert.equal(metrics.dias_operados, 14);

  // Por ruta: la suma de rutas es el total y el exceso es real menos plan.
  const sumReal = metrics.rutas.reduce((a, r) => a + r.km_reales, 0);
  const sumPlan = metrics.rutas.reduce((a, r) => a + r.km_planificados, 0);
  assert.ok(Math.abs(sumReal - metrics.km_reales) < 0.05);
  assert.ok(Math.abs(sumPlan - metrics.km_planificados) < 0.05);
  for (const r of metrics.rutas) {
    assert.ok(Math.abs(r.exceso_km - (r.km_reales - r.km_planificados)) < 0.05);
  }
  // La semilla trae un desvío plantado de más de 40 km: debe verse como exceso.
  assert.ok(metrics.exceso_km > 40);

  assert.ok(metrics.costo_por_km > 0);
  assert.ok(metrics.costo_por_entrega > metrics.costo_por_km);
  assert.ok(metrics.entregas_fuera_ventana >= 0 && metrics.entregas_fuera_ventana <= metrics.entregas_con_llegada);
  assert.equal(
    metrics.fuera_ventana_pct,
    Math.round((metrics.entregas_fuera_ventana / metrics.entregas_con_llegada) * 10000) / 100
  );
});

test('los supuestos iniciales toman de los datos lo medible y declaran el resto', () => {
  const a = defaultSavingsAssumptions(metrics);
  assert.equal(a.km_por_dia, Math.round(metrics.km_por_dia));
  assert.equal(a.pedidos_por_dia, Math.round(metrics.pedidos_por_dia));
  assert.equal(a.costo_variable_por_km, Math.round(metrics.costo_variable_por_km));
  assert.ok(a.reduccion_km_pct >= 0 && a.reduccion_km_pct <= 15);
  assert.equal(a.dias_operativos_anio, 300);
  assert.ok(computeAnnualSavings(a).ahorro_total_colones > 0);
});

test('sin viajes no hay división por cero', () => {
  const vacio = computeImpactMetrics({ ...dataset, viajes: [], entregas: [], gastos: [] });
  assert.equal(vacio.costo_por_km, 0);
  assert.equal(vacio.costo_por_entrega, 0);
  assert.equal(vacio.horas_pedido_a_despacho, null);
  assert.equal(vacio.fuera_ventana_pct, 0);
});
