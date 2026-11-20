# Auditoría de interfaz y verificación

## Alcance y prioridades

La versión inicial usa Next.js App Router, React, TypeScript, Tailwind CSS 4, Lucide, Recharts y Motion. El layout carga Plus Jakarta Sans, DM Sans y JetBrains Mono. Las rutas operativas consumen las APIs existentes y se pueden ejecutar con el conjunto de demostración del repositorio. `PhaseOneOverview` sigue en el código sin una ruta asignada.

| Prioridad | Hallazgo inicial | Intervención |
| --- | --- | --- |
| P1 | La navegación duplicaba destinos y exigía desplazarse horizontalmente en móvil. El foco era inconsistente en formularios y pasos. | Unificar el layout, mostrar un menú de móvil con Escape y página actual, añadir salto al contenido y llevar el foco al encabezado del paso. |
| P1 | La revisión de cantidades y unidades exigía desplazamiento lateral en una tabla de ocho columnas. Las opciones del chofer y los códigos largos se recortaban. | Reorganizar las líneas editables en móvil, mantener la semántica de tabla y mostrar completas las referencias seleccionadas. |
| P2 | Los azules, grises, radios y controles se repetían con valores distintos. Axe detectó cinco textos con contraste insuficiente en inicio. | Introducir tokens semánticos de marca, acciones coherentes, bordes de campos y foco contrastados. |
| P2 | El tablero ocultaba fallos de actualización o análisis. Algunos estados seleccionados dependían del color. | Mostrar errores con opción de reintento, anunciar las selecciones y etiquetar los estados de seguimiento. |
| P3 | Los módulos de inicio competían por atención y las animaciones de salida retrasaban los cambios de vista. | Priorizar búsqueda, indicadores y navegación en ese orden. Hacer inmediatos los cambios frecuentes y reservar la respuesta animada para el gesto de pulsar. |

## Revisión del movimiento

| Antes | Después | Motivo |
| --- | --- | --- |
| Salida y entrada secuenciales de 200 ms en el copiloto, chofer y gerencia | Cambio de contenido inmediato, con foco en el nuevo encabezado donde aplica | Mantiene el ritmo al repetir acciones y al usar teclado |
| `transition-all` en controles y cambios de superficie | Transiciones acotadas a color, borde o transformación | Evita animar propiedades de layout por accidente |
| Series de Recharts animadas al montar | Series estáticas con navegación por teclado y tooltip | Las cifras se leen al aparecer y la actualización evita movimiento innecesario |
| Sin tratamiento común de reducción de movimiento | `prefers-reduced-motion` en CSS, incluidas transiciones y spinners | Conserva el texto de carga con movimiento mínimo |

## Capturas comparables

Las imágenes muestran la versión base y el build refinado con los mismos datos de demostración en Chromium.

| Pantalla | Resolución | Antes | Después |
| --- | --- | --- | --- |
| Inicio | 1440 × 900 | [Ver](antes/inicio-1440.png) | [Ver](despues/inicio-1440.png) |
| Inicio | 390 × 844 | [Ver](antes/inicio-390.png) | [Ver](despues/inicio-390.png) |
| Copiloto de pedidos | 390 × 844 | [Ver](antes/pedidos-390.png) | [Ver](despues/pedidos-390.png) |
| App chofer | 390 × 844 | [Ver](antes/chofer-390.png) | [Ver](despues/chofer-390.png) |
| Tablero gerencial | 1440 × 900 | [Ver](antes/gerencia-1440.png) | [Ver](despues/gerencia-1440.png) |
| Configuración de APIs | 1440 × 900 | [Ver](antes/configuracion-1440.png) | [Ver](despues/configuracion-1440.png) |
| Seguimiento público | 390 × 844 | [Ver](antes/seguimiento-390.png) | [Ver](despues/seguimiento-390.png) |

## Verificación

- `npm run lint` y `npm run build` completaron correctamente.
- `node --import tsx --test src/lib/*.test.ts` pasó 14 de 14 pruebas.
- Chromium y axe evaluaron inicio, copiloto, chofer, gerencia, configuración, seguimiento y código inexistente a 320, 390, 820 y 1440 px. Las 28 vistas respondieron correctamente, sin desplazamiento horizontal de página, errores JavaScript ni infracciones en las reglas WCAG A/AA ejecutadas por axe.
- La revisión en Chrome compartido comprobó el selector de empresa y el avance de captura a validación, incluido el foco en el encabezado.
- La página 404 conservó su código HTTP y pasó las comprobaciones de salto al contenido y axe a 390 px.
- En un almacén local aislado se comprobó a 320 px el pedido de flotilla y PyME desde la captura hasta el seguimiento, la copia del enlace, la auditoría y el reintento de gerencia, las pruebas y el guardado de conectores, y la ruta del chofer con fotos de odómetro, llegada, firma, gasto y resumen de cierre.
- `git diff --check` completó correctamente. Las rutas de API, la capa de datos, el esquema, las evidencias de ejemplo y las dependencias quedan fuera del diff.

## Metodología y límites

- **Impeccable.** Las revisiones de auditoría y crítica priorizaron accesibilidad y claridad. Los playbooks de tipografía, layout, adaptación, simplificación, robustez, extracción y pulido guiaron los cambios compartidos. El detector oficial en fuentes informó cero hallazgos. En el render de seis rutas a 390 y 1440 px quedaron cuatro avisos de paneles anidados. Corresponden al bloque de GPS del chofer y al marco de evidencia en seguimiento, conservados para agrupar los datos y la acción de ubicación y para delimitar la vista de la evidencia.
- **Emil Kowalski.** Se revisó si cada animación aportaba respuesta, orientación o estado y se eliminaron las esperas al repetir tareas. La tabla anterior resume el repaso de duraciones, propiedades y reducción de movimiento.
- **Taste Skill.** Se aplicaron alineación, jerarquía, tipografía y verificación en navegador a un espacio de trabajo operativo. Su gate oficial informó `GATE: ERROR` al arrancar Chromium. La comprobación de layout ejecutada por separado señaló que el workspace usa su propio contenedor en lugar de la clase `.wrap` de la plantilla. Playwright verificó la anchura real del viewport, incluido móvil. Las reglas sobre héroes de pantalla completa, fotografías y escenas corresponden a páginas de marketing.
- El conjunto de demostración permite verificar las interacciones y los adaptadores locales. Las conexiones de producción y el comportamiento en Safari/iOS nativo quedan pendientes. El proyecto ofrece tema claro y una superficie oscura de marca en inicio. El logo oficial sigue pendiente como archivo de marca.

Referencias metodológicas [Impeccable](https://github.com/pbakaus/impeccable) · [Emil Kowalski](https://github.com/emilkowalski/skills) · [Taste Skill](https://github.com/leonxlnx/taste-skill)
