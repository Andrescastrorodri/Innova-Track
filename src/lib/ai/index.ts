import {
  engineLabel,
  getAiConfig,
  getEngineOrder,
  type AiConfig,
  type AiEngineKind,
} from './config';
import { callEngine, type StructuredRequest } from './engines';

export * from './config';
export * from './schemas';
export type { AiAttachment, StructuredRequest } from './engines';

export interface AiAttempt {
  motor: AiEngineKind;
  modelo: string;
  ok: boolean;
  ms: number;
  /** Motivo resumido del fallo, sin datos sensibles. */
  error?: string;
}

export interface AiRunResult<T> {
  /** null cuando ningún motor de IA respondió algo válido: quien llama usa su respaldo local. */
  data: T | null;
  motor: AiEngineKind | 'local';
  modelo: string | null;
  etiqueta: string;
  intentos: AiAttempt[];
}

/** Convierte cualquier error en un motivo corto y sin secretos (nunca incluye llaves ni URLs con llave). */
export function describeAiError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number } | null)?.status;

  if (name === 'AiValidationError' || name === 'AiUnsupportedInputError') return message;
  if (name === 'AbortError' || /abort|timed? ?out|timeout/i.test(message)) return 'Tiempo de espera agotado.';
  if (status === 401 || status === 403 || /API key|permission|unauthori[sz]ed/i.test(message)) {
    return 'La llave fue rechazada por el proveedor.';
  }
  if (status === 404 || /not found|is not supported/i.test(message)) return 'El modelo configurado no está disponible.';
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) return 'Límite de uso alcanzado.';
  if ((status && status >= 500) || /UNAVAILABLE|overloaded|high demand/i.test(message)) {
    return 'El proveedor no está disponible en este momento.';
  }
  if (/fetch failed|ENOTFOUND|ECONN|network/i.test(message)) return 'Sin conexión con el proveedor.';
  return status ? `Error del proveedor (HTTP ${status}).` : 'Error al consultar el modelo.';
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error('timeout');
      err.name = 'AbortError';
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ejecuta la solicitud en cada motor disponible, en orden, hasta que uno devuelva
 * una respuesta que pase `validate`. Si la llamada falla, se agota el tiempo o la
 * respuesta no es válida, pasa al siguiente. Nunca lanza: si todos fallan devuelve
 * `data: null` para que la ruta use su respaldo local.
 */
export async function runStructured<T>(
  req: StructuredRequest,
  validate: (raw: unknown) => T,
  options: { config?: AiConfig; call?: typeof callEngine } = {}
): Promise<AiRunResult<T>> {
  const config = options.config ?? getAiConfig();
  const call = options.call ?? callEngine;
  const intentos: AiAttempt[] = [];

  for (const motor of getEngineOrder(config)) {
    const modelo = motor === 'claude' ? config.anthropicModel : config.geminiModel;
    const startedAt = Date.now();
    try {
      const raw = await withTimeout(config.timeoutMs, (signal) => call(motor, config, req, signal));
      const data = validate(raw);
      intentos.push({ motor, modelo, ok: true, ms: Date.now() - startedAt });
      return { data, motor, modelo, etiqueta: engineLabel(motor, modelo), intentos };
    } catch (err) {
      intentos.push({ motor, modelo, ok: false, ms: Date.now() - startedAt, error: describeAiError(err) });
    }
  }

  return { data: null, motor: 'local', modelo: null, etiqueta: engineLabel('local'), intentos };
}
