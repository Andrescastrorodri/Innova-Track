# Guion de demo: 3 minutos

## Antes de subir al escenario

1. `npm run demo:reset` y luego `npm run dev`. Deja el servidor corriendo.
2. Abre cuatro pestañas en este orden: `/pedidos/nuevo`, `/chofer`, `/tracking/IT-9104` (cargará después del paso 2) y `/gerente`.
3. Ten a mano la carpeta `docs/demo/` con los tres archivos de ejemplo.
4. Selector de empresa arriba a la derecha: **Distribuidora del Valle Central** (flotilla propia).
5. Pon el navegador al 100 % de zoom y cierra notificaciones.

Archivos de ejemplo:

| Archivo | Qué es | Qué debe leer la IA |
| --- | --- | --- |
| `docs/demo/mensaje-whatsapp.txt` | Mensaje de texto | Abastecedor La Violeta Pavas: 5 bultos de arroz, 2 cajas de aceite, 12 bultos de frijol |
| `docs/demo/pedido-manuscrito.png` | Foto de lista a mano | Minisúper Guadalupe Centro: 8 bultos de arroz, 3 cajas de aceite, 4 cajas de café, 25 kg de azúcar |
| `docs/demo/nota-de-voz.wav` | Nota de voz | Ferretería Escazú Centro: 20 bultos de cemento, 5 cajas de tornillo, 2 rollos de cable |

## Minuto a minuto

### 0:00 a 0:25. El problema (sin tocar la pantalla)

> "Una distribuidora en Costa Rica recibe sus pedidos así: un WhatsApp mal escrito, la foto de una lista a mano, una nota de voz. Alguien los digita, alguien factura, el camión sale, y gerencia se entera de lo que pasó cuando el chofer vuelve. Nadie sabe cuánto cuesta cada entrega ni qué ruta recorre kilómetros de más. Innova Track cubre ese recorrido completo."

### 0:25 a 1:10. Un pedido por WhatsApp entra con IA (`/pedidos/nuevo`)

1. Pega el texto de `mensaje-whatsapp.txt` y pulsa **Procesar con Copiloto IA**. Tarda de 2 a 3 segundos.
2. Señala en pantalla: cliente reconocido ("Abastecedor La Violeta Pavas"), tres líneas con SKU, stock disponible y, en letra pequeña, **"Leído con: Gemini"**.

> "Escribió 'sacos', 'una docena', 'porfa'. La IA lo convirtió en un pedido con nuestro catálogo, nuestros precios y el cliente que ya existía."

3. Pulsa **Confirmar Pedido y Reservar Stock**, luego emite la factura y despacha. Anota el código que aparece: será **IT-9104**.

> "Reserva inventario, emite la factura electrónica y lo asigna a la ruta de su zona. Estos tres conectores están en modo demostración; en producción apuntan al ERP y a Hacienda."

Si sobra tiempo (10 s): vuelve a captura, adjunta `pedido-manuscrito.png` y muestra que lee la letra a mano. No lo confirmes.

### 1:10 a 1:55. El chofer en ruta (`/chofer`, idealmente en el teléfono o con la ventana angosta)

1. Chofer y vehículo ya vienen elegidos. Ruta: **Ruta Oeste**. Verás 2 pedidos pendientes: el nuevo y uno que ya esperaba.
2. Odómetro inicial `48250`, toma o adjunta la foto y pulsa iniciar ruta.
3. En la primera parada: **Llegué**, cantidad completa, firma con el dedo en el recuadro, confirmar.
4. Registra un gasto de combustible: 22 litros, ₡15 290.
5. Cierra la ruta con odómetro `48322`.

> "El chofer no llena papeles. Odómetro con foto, llegada con hora y ubicación, firma del cliente en pantalla y cada gasto con su factura."

Para no pasarte de tiempo, entrega solo la primera parada en vivo y di que la segunda es igual.

### 1:55 a 2:15. El cliente sigue su pedido (`/tracking/IT-9104`)

Recarga la pestaña.

> "El cliente no llama a preguntar. Con este enlace ve que su pedido salió, quién lo lleva y, al entregarse, la firma de recibido y su factura."

### 2:15 a 2:50. Gerencia ve el dinero (`/gerente`)

1. Baja a **Impacto**. Señala: costo por km, costo por entrega y la tabla de rutas.

> "La Ruta Este recorre 11 % más kilómetros de lo planificado. Eso antes no se veía."

2. Cambia **Km que se dejan de recorrer** de 5 a 10. El ahorro anual se recalcula.

> "Con sus propios números, cada distribuidora ve cuánto ahorra. Esta de ejemplo tiene 3 camiones; con 20 camiones y 150 pedidos al día, la cifra cambia de escala."

Para mostrarlo, edita **Km recorridos por día** a `1300` y **Pedidos por día** a `150`.

3. Pulsa **Analizar operación**: la IA resume las tres alertas de la semana.

### 2:50 a 3:00. Cierre

> "Del WhatsApp a la firma de recibido, y de ahí al costo por entrega, sin digitar nada. Eso es Innova Track."

## Tiempos medidos

El recorrido se ejecutó dos veces seguidas con `npm run demo:reset` entre cada una. Las dos dieron el mismo resultado: pedido IT-9104, 2 paradas, cierre de 72 km contra 68 planificados y el tablero pasando de 36 a 37 viajes.

| Paso | Tiempo de respuesta del sistema |
| --- | --- |
| `npm run demo:reset` | 0,5 s |
| Leer el texto con IA | 1,4 a 2,5 s |
| Leer la foto con IA | 3 a 4 s |
| Leer la nota de voz con IA | 2,5 a 5,6 s |
| Alertas de gerencia | 1,7 a 2,7 s |
| Recorrido completo de las dos empresas, sin pausas humanas | 5 a 7 s |

Estos son tiempos de la aplicación, medidos llamando a los mismos servicios que usa la pantalla. **El tiempo humano del guion (hablar, hacer clic, firmar) no está cronometrado: ensáyenlo con reloj al menos dos veces.** La parte del chofer es la más larga en clics; si se pasa de 45 segundos, entreguen una sola parada.

## Plan B

### Falla el internet

- **Qué pasa:** la IA no responde. El pedido de texto se lee solo con el lector local; en pantalla dirá "Leído con: Lector sin IA". Las fotos y audios mostrarán un mensaje pidiendo escribir el pedido.
- **Qué hacer:** usar solo `mensaje-whatsapp.txt`. El lector local lo lee igual (5 bultos de arroz, 2 cajas de aceite, 12 bultos de frijol). El resto del flujo no necesita internet. En gerencia, "Analizar operación" usa el respaldo local.
- **Qué decir:** "Sin conexión, el sistema sigue leyendo pedidos de texto con reglas propias. La bodega no se detiene."
- **Opcional:** compartir internet desde un teléfono antes de empezar.

### Falla la IA con internet (saturación o llave rechazada)

- **Qué pasa:** el sistema reintenta una vez y, si sigue fallando, pasa al lector local sin mostrar error.
- **Qué hacer:** seguir el guion. Si necesitan la foto o el audio y no salen, volver a pulsar procesar una vez; si no, seguir con el texto.
- **Antes de presentar:** probar la llave con el mensaje de texto. Si dice "Lector sin IA" con internet, revisar `GEMINI_API_KEY` en `.env.local` y reiniciar `npm run dev`.

### Falla la laptop

- **Preparación:** tener el repo clonado en una segunda computadora con `npm install` hecho y `.env.local` copiado a mano (no por chat). Probar ahí `npm run dev` el día anterior.
- **Último recurso:** grabar el recorrido completo en video el día anterior y tenerlo en un USB y en el teléfono.
- **Si se cuelga a medias:** `Ctrl+C`, `npm run demo:reset`, `npm run dev` y retomar desde el paso del chofer usando el pedido `IT-9101`, que ya viene esperando ruta.

### Se equivocan en un paso

`npm run demo:reset` (o el botón en `/configuracion`) devuelve todo al inicio en medio segundo.
