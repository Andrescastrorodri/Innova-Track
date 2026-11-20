# Cristal claro en Innova Track

La dirección visual lleva el lienzo luminoso y las cápsulas de cristal a la navegación. El copiloto presenta un lienzo centrado para capturar el pedido y conserva las vistas de revisión, facturación y despacho. El inicio y la gerencia mantienen los indicadores y las tablas en superficies de lectura estable.

## Capturas

| Pantalla | Resolución | Captura |
| --- | --- | --- |
| Captura del copiloto | 1440 × 900 | [Escritorio](pedidos-1440.png) |
| Captura del copiloto | 390 × 844 | [Móvil](pedidos-390.png) · [Versión anterior](../despues/pedidos-390.png) |
| Inicio | 1440 × 900 | [Escritorio](inicio-1440.png) |
| Gerencia | 1440 × 900 | [Escritorio](gerencia-1440.png) |
| Chofer | 390 × 844 | [Móvil](chofer-390.png) |

## Verificación

- `npm run lint`, `npm run build` y las 14 pruebas existentes pasaron.
- Chromium y axe comprobaron 28 vistas a 320, 390, 820 y 1440 px. Las pantallas conservaron el ancho del viewport y pasaron las reglas automatizadas de axe ejecutadas.
- Las pruebas de interacción verificaron el menú móvil y el avatar con Escape, el cambio de empresa, la búsqueda de seguimiento y la selección, el arrastre y la retirada de archivos. También verificaron la expansión del campo con texto multilínea y la reducción de movimiento.
- El pedido de flotilla y el de PyME pasaron por validación, reserva, factura y despacho hasta seguimiento. Se repitieron los flujos de gerencia, configuración y chofer con datos de demostración aislados.
- El dock se comprobó centrado y fuera del área de contenido a 1024, 1440 y 1920 px.

El cian de los titulares se oscureció para mantener el contraste. El avatar abre el menú del espacio operativo porque el producto carece de un perfil de usuario. La grabación con micrófono físico, las integraciones externas y Safari/iOS nativo quedan pendientes de verificación.
