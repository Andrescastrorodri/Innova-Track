# Sistema visual de Innova Track

Innova Track reúne pedidos, facturación electrónica y entregas para distribuidoras y PyMEs de Costa Rica. La captura es el espacio más despejado del producto. Las pantallas de seguimiento y operación priorizan la lectura de estados, cifras y evidencias.

## Color y superficies

Los tokens viven en `src/app/globals.css` y se exponen a Tailwind 4 mediante `@theme inline`. Los patrones flotantes y la composición de captura viven en `src/app/workspace.css`.

| Rol | Token o valor | Uso |
| --- | --- | --- |
| Lienzo | `--aura-ice` #F4F9FF, `--aura-sky` #DCEBFA, `--aura-cyan` #B8F2F5 | Radiales suaves y tres trazos SVG blancos al 35% |
| Cristal | `--glass-background`, `--glass-border`, `--glass-shadow` | Blanco al 55%, borde al 85%, desenfoque de 20 px y sombra ambiental |
| Controles internos | `--glass-inset-shadow` | Borde especular y sombra interior en búsqueda, selector y avatar |
| Lectura | `--ink` #0B1938, `--text-secondary` #3B5278 | Titulares, texto de acciones y contenido secundario |
| Acción | `--accent-gradient`, `--accent-glow` | Cian #00D2DF a turquesa #00A8B8 a 135°, con resplandor en envío y destino activo |
| Contraste | `--accent-highlight` #00B8C4, `--accent`, `--focus` | El acento de texto combina el cian con el marino para mantener la legibilidad. El foco usa un tono sólido |
| Estado | `--success*`, `--warning*`, `--danger*` | Resultados y alertas con etiquetas explícitas |

Mantén opacas las superficies de datos de alta densidad y usa cristal en la navegación y los paneles destacados. Los botones con texto sobre el degradado usan azul marino. Los iconos blancos de envío y del dock activo llevan un contorno oscuro para conservar su definición.

El nombre Innova Track conserva su función de marca tipográfica junto a un símbolo geométrico de la aplicación.

## Tipografía, dimensiones y movimiento

- **Plus Jakarta Sans** en títulos y marca. El título principal combina peso alto y una palabra clave cian en cursiva con tracking de aproximadamente −0.03 em. **DM Sans** se usa en controles y texto. **JetBrains Mono** identifica códigos y medidas tabulares.
- La barra superior de escritorio mide 60 px como mínimo. El dock mide 56 px de ancho y sus botones circulares, 40 px. En móvil, el dock se convierte en un menú con texto y controles de 44 px.
- La barra de comando mide 56 px al inicio y crece al pegar texto de varias líneas. La zona de carga tiene radio de 24 px y un borde discontinuo reforzado.
- Las cápsulas flotantes responden al puntero con una elevación de 1 px en 300 ms. Enviar y navegar tienen una escala de 0.95 al pulsar. `prefers-reduced-motion` desactiva el desplazamiento y acorta las transiciones.

## Patrones de interfaz

| Patrón | Implementación | Comportamiento |
| --- | --- | --- |
| Barra y dock | `WorkspaceShell`, `BrandWordmark` | Busca guías, marca el destino actual y ofrece navegación responsive. Escape cierra los paneles y devuelve el foco al disparador |
| Contexto | `CompanySwitcher` | Selector nativo que reutiliza el cambio de empresa. El avatar abre el menú del espacio operativo y enlaza a configuración |
| Captura | `OrderCopilot`, `.command-pill`, `.copilot-dropzone` | Texto multilínea, selección o arrastre de archivo, grabación y ejemplos. La validación comienza al enviar |
| Datos | `TableScroll`, `.order-lines` | Desplazamiento local con teclado. Las líneas editables se reorganizan en móvil y conservan sus encabezados |
| Operación en campo | `DriverApp`, `SignaturePad` | Encabezado flotante, acciones de tamaño táctil, barra de ruta y espacio para áreas seguras |

Consulta la [revisión de cristal claro](docs/ui-review/cristal/README.md) y la [auditoría anterior](docs/ui-review/README.md).
