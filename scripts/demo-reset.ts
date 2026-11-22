import { config } from 'dotenv';
import { resetDemoStore } from '../src/lib/data-store';

// Uso: npm run demo:reset
// Sin Supabase: restaura .data/innova-track-store.json y borra .data/evidencias.
// Con Supabase configurado en .env.local: vacía las tablas y vuelve a cargar los datos de demostración.
config({ path: ['.env.local', '.env'], quiet: true });

resetDemoStore()
  .then((result) => {
    console.log(`Demo reiniciada (${result.almacenamiento === 'supabase' ? 'Supabase' : 'archivo local'}).`);
    console.log(`- Pedidos: ${result.pedidos} (3 de hoy esperando ruta)`);
    console.log(`- Viajes cerrados: ${result.viajes}`);
    console.log(`- Evidencias borradas: ${result.evidencias_borradas}`);
    console.log('Si el servidor está abierto, recarga la página en el navegador.');
  })
  .catch((err) => {
    console.error('No se pudo reiniciar la demo:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
