import { config } from 'dotenv';
import { buildDemoStore } from '../src/lib/data-store';
import { getSupabaseAdminClient } from '../src/lib/supabase';

// Uso: npm run seed            → carga los datos de demostración en Supabase
//      npm run seed -- --dry-run → solo muestra qué se cargaría
// Lee las credenciales de .env.local (y de .env si existe). Para la demo local sin Supabase
// no hace falta este script: usa `npm run demo:reset`.
config({ path: ['.env.local', '.env'], quiet: true });

async function upsertInBatches(table: string, rows: object[], batchSize = 100) {
  const supabase = getSupabaseAdminClient();
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + batchSize), { onConflict: 'id' });
    if (error) {
      throw new Error(`Error al insertar en ${table}: ${error.message}`);
    }
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const dataset = buildDemoStore();

  console.log('Innova Track — datos de demostración');
  console.log(`- Empresas: ${dataset.empresas_config.length}`);
  console.log(`- Productos: ${dataset.productos_inventario.length}`);
  console.log(`- Clientes: ${dataset.clientes.length}`);
  console.log(`- Vehículos: ${dataset.vehiculos.length} · Rutas: ${dataset.tramos.length}`);
  console.log(`- Viajes (2 semanas): ${dataset.viajes.length}`);
  console.log(`- Pedidos: ${dataset.pedidos.length} · Entregas: ${dataset.entregas.length} · Gastos: ${dataset.gastos.length}`);

  if (isDryRun) {
    console.log('Modo --dry-run: no se escribió nada en Supabase.');
    return;
  }

  // El orden respeta las llaves foráneas de supabase/schema.sql.
  await upsertInBatches('empresas_config', dataset.empresas_config);
  await upsertInBatches('productos_inventario', dataset.productos_inventario);
  await upsertInBatches('clientes', dataset.clientes);
  await upsertInBatches('vehiculos', dataset.vehiculos);
  await upsertInBatches('tramos', dataset.tramos);
  await upsertInBatches('parametros_costo', dataset.parametros_costo);
  await upsertInBatches('viajes', dataset.viajes);
  await upsertInBatches('pedidos', dataset.pedidos);
  await upsertInBatches('entregas', dataset.entregas);
  await upsertInBatches('gastos', dataset.gastos);

  console.log('Datos cargados en Supabase.');
}

main().catch((err) => {
  console.error('Fallo en scripts/seed.ts:', err instanceof Error ? err.message : err);
  process.exit(1);
});
