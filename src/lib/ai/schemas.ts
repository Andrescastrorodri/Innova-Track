// Formas que se le piden a la IA (salida estructurada) y su validación.
// Nada de lo que devuelve un modelo se usa sin pasar por estas funciones.

export interface AiExtractedItem {
  sku?: string;
  nombre: string;
  cantidad: number;
  unidad?: string;
}

export interface AiExtractedOrder {
  cliente_nombre?: string;
  cliente_cedula?: string;
  cliente_zona?: string;
  texto_extraido?: string;
  sugerencia_logistica?: string;
  items: AiExtractedItem[];
}

export interface AiWeeklyAlert {
  titulo: string;
  severidad: 'critica' | 'alta' | 'media';
  que_paso: string;
  impacto_colones: number;
  accion_recomendada: string;
}

export class AiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiValidationError';
  }
}

/** JSON Schema compartido por Gemini (responseJsonSchema) y Claude (input_schema de la herramienta). */
export const ORDER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cliente_nombre: { type: 'string', description: 'Nombre del cliente tal como aparece en el pedido. Vacío si no se menciona.' },
    cliente_cedula: { type: 'string', description: 'Cédula jurídica si aparece. Vacío si no.' },
    cliente_zona: { type: 'string', description: 'Oeste, Este o Norte. Vacío si no se puede inferir.' },
    texto_extraido: { type: 'string', description: 'Transcripción o resumen limpio del pedido.' },
    sugerencia_logistica: { type: 'string', description: 'Recomendación breve de ruta o courier.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sku: { type: 'string', description: 'SKU del catálogo si coincide; vacío si no.' },
          nombre: { type: 'string', description: 'Nombre del producto.' },
          cantidad: { type: 'number', description: 'Cantidad pedida, mayor que cero.' },
          unidad: { type: 'string', description: 'unidades, cajas, bultos o kg.' },
        },
        required: ['sku', 'nombre', 'cantidad', 'unidad'],
      },
    },
  },
  required: ['cliente_nombre', 'cliente_cedula', 'cliente_zona', 'texto_extraido', 'sugerencia_logistica', 'items'],
} as const;

export const ALERTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    alertas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          titulo: { type: 'string', description: 'Título corto de la alerta.' },
          severidad: { type: 'string', enum: ['critica', 'alta', 'media'] },
          que_paso: { type: 'string', description: 'Una oración clara con cifras del resumen.' },
          impacto_colones: { type: 'number', description: 'Impacto en colones tomado o sumado del resumen.' },
          accion_recomendada: { type: 'string', description: 'Una oración accionable.' },
        },
        required: ['titulo', 'severidad', 'que_paso', 'impacto_colones', 'accion_recomendada'],
      },
    },
  },
  required: ['alertas'],
} as const;

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiValidationError(`${what}: se esperaba un objeto.`);
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, max = 600): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function parseModelJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiValidationError('La respuesta del modelo no es JSON válido.');
  }
}

/**
 * Valida y limpia el pedido extraído. Descarta líneas sin nombre o sin cantidad válida;
 * si no queda ninguna línea, se considera respuesta inválida para caer al siguiente motor.
 */
export function validateExtractedOrder(value: unknown): AiExtractedOrder {
  const obj = asRecord(value, 'Pedido');
  if (!Array.isArray(obj.items)) {
    throw new AiValidationError('Pedido: falta la lista de productos.');
  }

  const items: AiExtractedItem[] = [];
  for (const rawItem of obj.items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const nombre = optionalText(item.nombre, 160);
    const cantidad = typeof item.cantidad === 'string' ? Number(item.cantidad.replace(',', '.')) : Number(item.cantidad);
    if (!nombre || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100_000) continue;
    items.push({
      sku: optionalText(item.sku, 40),
      nombre,
      cantidad,
      unidad: optionalText(item.unidad, 20),
    });
  }

  if (items.length === 0) {
    throw new AiValidationError('Pedido: el modelo no devolvió ningún producto con cantidad válida.');
  }

  return {
    cliente_nombre: optionalText(obj.cliente_nombre, 120),
    cliente_cedula: optionalText(obj.cliente_cedula, 30),
    cliente_zona: optionalText(obj.cliente_zona, 20),
    texto_extraido: optionalText(obj.texto_extraido, 2000),
    sugerencia_logistica: optionalText(obj.sugerencia_logistica, 400),
    items,
  };
}

const SEVERIDADES = new Set(['critica', 'alta', 'media']);

/** Valida las alertas semanales: entre 1 y 3, con textos y un impacto numérico no negativo. */
export function validateWeeklyAlerts(value: unknown): AiWeeklyAlert[] {
  const obj = asRecord(value, 'Alertas');
  if (!Array.isArray(obj.alertas)) {
    throw new AiValidationError('Alertas: falta la lista de alertas.');
  }

  const alertas: AiWeeklyAlert[] = [];
  for (const rawAlert of obj.alertas) {
    if (!rawAlert || typeof rawAlert !== 'object') continue;
    const a = rawAlert as Record<string, unknown>;
    const titulo = optionalText(a.titulo, 120);
    const que_paso = optionalText(a.que_paso, 500);
    const accion_recomendada = optionalText(a.accion_recomendada, 500);
    const impacto = Number(a.impacto_colones);
    const severidad = typeof a.severidad === 'string' ? a.severidad.trim().toLowerCase() : '';
    if (!titulo || !que_paso || !accion_recomendada) continue;
    if (!Number.isFinite(impacto) || impacto < 0) continue;
    alertas.push({
      titulo,
      severidad: (SEVERIDADES.has(severidad) ? severidad : 'alta') as AiWeeklyAlert['severidad'],
      que_paso,
      impacto_colones: Math.round(impacto),
      accion_recomendada,
    });
  }

  if (alertas.length === 0) {
    throw new AiValidationError('Alertas: el modelo no devolvió ninguna alerta utilizable.');
  }
  return alertas.slice(0, 3);
}
