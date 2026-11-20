import 'dotenv/config';
import { getSupabaseAdminClient } from '../src/lib/supabase';
import { generateSeedDataset } from '../src/lib/seed-data';

async function upsertInBatches(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id',
  batchSize = 100
) {
  const supabase = getSupabaseAdminClient();
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`Error al insertar en ${table}: ${error.message}`);
    }
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const dataset = generateSeedDataset();

  console.log('Innova Track — Seed Multisector Costa Rica (Fase 1)');
  console.log(`- Empresas configuradas: ${dataset.empresas_config.length}`);
  console.log(`- Productos inventario: ${dataset.productos_inventario.length}`);
  console.log(`- Clientes: ${dataset.clientes.length}`);
  console.log(`- Vehículos: ${dataset.vehiculos.length}`);
  console.log(`- Tramos / Rutas: ${dataset.tramos.length}`);
  console.log(`- Viajes (2 semanas): ${dataset.viajes.length}`);
  console.log(`- Pedidos: ${dataset.pedidos.length}`);
  console.log(`- Entregas: ${dataset.entregas.length}`);
  console.log(`- Gastos: ${dataset.gastos.length}`);
  console.log('Anomalías plantadas:');
  console.log(
    `  1) Esperas excesivas: ${dataset.anomaliesSummary.excessiveWaitClientName} (${dataset.anomaliesSummary.excessiveWaitDeliveries} visitas, máx ${dataset.anomaliesSummary.maxWaitMinutes} min)`
  );
  console.log(
    `  2) Desvío odómetro: ${dataset.anomaliesSummary.odometerDeviationRoute} (+${dataset.anomaliesSummary.odometerDeviationMaxKm} km)`
  );
  console.log(
    `  3) Rechazos recurrentes: ${dataset.anomaliesSummary.recurringRejectionClientName} (${dataset.anomaliesSummary.recurringRejectionCount} incidencias)`
  );

  if (isDryRun) {
    console.log('Modo --dry-run completado sin escribir en Supabase.');
    return;
  }

  await upsertInBatches('empresas_config', dataset.empresas_config as unknown as Record<string, unknown>[]);
  await upsertInBatches('productos_inventario', dataset.productos_inventario as unknown as Record<string, unknown>[]);
  await upsertInBatches('clientes', dataset.clientes as unknown as Record<string, unknown>[]);
  await upsertInBatches('vehiculos', dataset.vehiculos as unknown as Record<string, unknown>[]);
  await upsertInBatches('tramos', dataset.tramos as unknown as Record<string, unknown>[]);
  await upsertInBatches('parametros_costo', dataset.parametros_costo as unknown as Record<string, unknown>[]);
  await upsertInBatches('viajes', dataset.viajes as unknown as Record<string, unknown>[]);
  await upsertInBatches('pedidos', dataset.pedidos as unknown as Record<string, unknown>[]);
  await upsertInBatches('entregas', dataset.entregas as unknown as Record<string, unknown>[]);
  await upsertInBatches('gastos', dataset.gastos as unknown as Record<string, unknown>[]);

  console.log('Seed completado exitosamente en Supabase.');
}

main().catch((err) => {
  console.error('Fallo en scripts/seed.ts:', err);
  process.exit(1);
});
