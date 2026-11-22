import { resetDemoStore } from '../src/lib/data-store';

// Uso: npm run demo:reset
// Restaura los datos semilla en .data/innova-track-store.json y borra .data/evidencias.
const result = resetDemoStore();
console.log('Demo reiniciada.');
console.log(`- Pedidos: ${result.pedidos} (3 de hoy esperando ruta)`);
console.log(`- Viajes cerrados: ${result.viajes}`);
console.log(`- Evidencias borradas: ${result.evidencias_borradas}`);
console.log('Si el servidor está abierto, recarga la página en el navegador.');
