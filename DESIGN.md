# Sistema visual de Innova Track

Innova Track reúne pedidos, facturación electrónica y entregas para distribuidoras y PyMEs de Costa Rica. La interfaz prioriza la lectura de cifras, el avance por pasos y el uso del chofer en campo. El nombre tipográfico existente identifica el producto. El repositorio no incluye un archivo del logo oficial.

## Color y superficies

Los valores de marca viven en `src/app/globals.css`. Tailwind 4 expone sus roles mediante `@theme inline`.

| Rol | Token o valor | Uso |
| --- | --- | --- |
| Marca | `--brand-primary` #04D9D9, `--brand-secondary` #0388A6 | Acción primaria y base de tonos de interacción |
| Extremos | `--brand-black` #000000, `--brand-white` #FFFFFF | Texto de la acción primaria y base de superficies |
| Fondos | `--canvas`, `--surface`, `--surface-subtle`, `--surface-hover` | Lienzo, paneles, agrupación y respuesta al puntero |
| Contraste | `--ink`, `--ink-strong`, `--text-secondary`, `--text-muted` | Texto, títulos, metadatos y ayudas |
| Interacción | `--accent`, `--accent-hover`, `--accent-soft`, `--focus` | Enlaces, selección actual y anillo de teclado |
| Bordes | `--line`, `--line-strong`, `--control-border` | División, contención y límites de campos y botones |
| Inicio | `--feature`, `--feature-muted`, `--feature-line` | Superficie oscura de resumen y búsqueda |
| Estados | `--success*`, `--warning*`, `--danger*` | Resultados y alertas con etiqueta explícita |

Usa negro sobre el turquesa brillante. Para un enlace o indicador pequeño en una superficie clara, usa el acento oscurecido. El borde de controles se diferencia del divisor de paneles. Los resultados semánticos se identifican también con texto o icono. La aplicación parte de un tema claro. La superficie oscura de inicio tiene sus propios colores de texto, borde y foco.

## Tipografía, dimensiones y movimiento

- **Plus Jakarta Sans** para encabezados y nombre del producto. `.page-title` usa 30/35 px y `.section-title` 18/23 px. **DM Sans** para controles y texto. **JetBrains Mono** para códigos e identificadores. Usa cifras tabulares en valores comparables.
- Los márgenes de página y las separaciones entre secciones usan `--gutter` y `--space-stack`. Los radios son 8 px para controles, 12 px para paneles y 16 px para superficies destacadas. Las sombras de 1 px y de panel separan superficies cuando el borde solo resulta insuficiente.
- Botones y campos compartidos tienen una altura mínima de 44 px. Los campos usan al menos 16 px en pantallas pequeñas o con puntero táctil. El foco visible aparece inmediatamente.
- La respuesta al pulsar usa una escala de 0.98 durante 140 ms con salida rápida. La navegación frecuente y el cambio de paso muestran el contenido de inmediato. Las transiciones y el movimiento se desactivan con `prefers-reduced-motion`. El gráfico conserva sus datos y su navegación de teclado sin animar las series.

## Patrones de interfaz

| Patrón | Implementación | Comportamiento |
| --- | --- | --- |
| Navegación operativa | `WorkspaceShell` | Barra lateral en escritorio. Menú desplegable en móvil con `aria-expanded`, cierre por Escape y página actual marcada |
| Selección | `SegmentedControl`, `CompanySwitcher` | Grupos etiquetados, selección anunciada y opciones que se ajustan a varias líneas |
| Acciones y campos | `.ui-button`, `.ui-button-primary`, `.ui-button-secondary`, `.ui-field` | Jerarquía primaria/secundaria, foco y estados deshabilitados |
| Tablas | `TableScroll`, `.order-lines` | Desplazamiento local con teclado. Las líneas editables reorganizan sus campos en móvil y conservan sus encabezados |
| Pasos y seguimiento | `OrderCopilot`, `PublicTrackingView` | Secuencia ordenada, estado actual explícito y movimiento del foco al cambiar de paso en el copiloto |
| App chofer | `DriverApp`, `SignaturePad` | Controles grandes, espacio para la barra inferior y áreas seguras. La firma se traza con puntero y la opción de foto ofrece una vía accesible por teclado |

Consulta el [registro de auditoría y validación](docs/ui-review/README.md) para ver prioridades, decisiones y capturas.
