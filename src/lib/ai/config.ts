// Configuración compartida de los motores de IA.
// Orden: Claude (si hay ANTHROPIC_API_KEY) → Gemini (si hay GEMINI_API_KEY) → respaldo local.

export type AiEngineKind = 'claude' | 'gemini';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_AI_TIMEOUT_MS = 20_000;

const PLACEHOLDER_PREFIXES = ['your-', 'MY_', 'tu-', '<'];

export function isRealKey(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length <= 10) return false;
  return !PLACEHOLDER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export interface AiConfig {
  anthropicKey: string | null;
  geminiKey: string | null;
  anthropicModel: string;
  geminiModel: string;
  timeoutMs: number;
}

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const timeout = Number(env.AI_TIMEOUT_MS);
  return {
    anthropicKey: isRealKey(env.ANTHROPIC_API_KEY) ? env.ANTHROPIC_API_KEY.trim() : null,
    geminiKey: isRealKey(env.GEMINI_API_KEY) ? env.GEMINI_API_KEY.trim() : null,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    geminiModel: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? timeout : DEFAULT_AI_TIMEOUT_MS,
  };
}

/** Motores disponibles en orden de preferencia. Vacío = solo respaldo local. */
export function getEngineOrder(config: AiConfig): AiEngineKind[] {
  const order: AiEngineKind[] = [];
  if (config.anthropicKey) order.push('claude');
  if (config.geminiKey) order.push('gemini');
  return order;
}

export function engineLabel(kind: AiEngineKind | 'local', model?: string): string {
  if (kind === 'claude') return `Claude (${model})`;
  if (kind === 'gemini') return `Gemini (${model})`;
  return 'Lector sin IA';
}
