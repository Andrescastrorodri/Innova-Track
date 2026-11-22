import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { AiConfig, AiEngineKind } from './config';
import { AiValidationError, parseModelJson } from './schemas';

/** Archivo adjunto al pedido (foto, PDF o audio). */
export interface AiAttachment {
  mimeType: string;
  base64: string;
}

export interface StructuredRequest {
  /** Instrucciones estables: rol, catálogo, reglas. */
  system: string;
  /** Contenido variable: el mensaje del cliente o el resumen a analizar. */
  userText: string;
  attachment?: AiAttachment | null;
  /** JSON Schema de la respuesta. */
  schema: Record<string, unknown>;
  /** Nombre y descripción de la herramienta que Claude usa para responder. */
  toolName: string;
  toolDescription: string;
  maxOutputTokens?: number;
}

export class AiUnsupportedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnsupportedInputError';
  }
}

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

/**
 * Claude responde llamando a una herramienta con esquema estricto (tool use).
 * Devuelve el `input` de la herramienta sin validar: la validación de negocio la hace quien llama.
 */
async function callClaude(config: AiConfig, req: StructuredRequest, signal: AbortSignal): Promise<unknown> {
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  const file = req.attachment;

  if (file) {
    if (file.mimeType.startsWith('audio/')) {
      throw new AiUnsupportedInputError('Claude no recibe audio; se usa el siguiente motor.');
    }
    if (file.mimeType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: file.base64 },
      });
    } else if ((CLAUDE_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: file.mimeType as ClaudeImageType, data: file.base64 },
      });
    } else {
      throw new AiUnsupportedInputError(`Claude no admite archivos ${file.mimeType}.`);
    }
  }
  content.push({ type: 'text', text: req.userText });

  const client = new Anthropic({ apiKey: config.anthropicKey ?? undefined, maxRetries: 0 });
  const response = await client.messages.create(
    {
      model: config.anthropicModel,
      max_tokens: req.maxOutputTokens ?? 4000,
      system: `${req.system}\n\nResponde siempre llamando a la herramienta ${req.toolName}; no escribas texto fuera de ella.`,
      // Los modelos actuales rechazan forzar la herramienta con tool_choice; se usa auto + esquema estricto.
      tool_choice: { type: 'auto' },
      tools: [
        {
          name: req.toolName,
          description: req.toolDescription,
          strict: true,
          input_schema: req.schema as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content }],
    },
    { signal, timeout: config.timeoutMs }
  );

  if (response.stop_reason === 'refusal') {
    throw new AiValidationError('Claude rechazó la solicitud.');
  }
  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === 'tool_use' && block.name === req.toolName
  );
  if (!toolUse) {
    throw new AiValidationError('Claude no devolvió la herramienta esperada.');
  }
  return toolUse.input;
}

/** Gemini responde con JSON restringido por esquema (salida estructurada). */
async function callGemini(config: AiConfig, req: StructuredRequest, signal: AbortSignal): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: config.geminiKey ?? undefined });
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  if (req.attachment) {
    parts.push({ inlineData: { mimeType: req.attachment.mimeType, data: req.attachment.base64 } });
  }
  parts.push({ text: req.userText });

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: req.system,
      responseMimeType: 'application/json',
      responseJsonSchema: req.schema,
      maxOutputTokens: req.maxOutputTokens ?? 4000,
      abortSignal: signal,
      httpOptions: { timeout: config.timeoutMs },
    },
  });

  const text = response.text;
  if (!text) {
    throw new AiValidationError('Gemini devolvió una respuesta vacía.');
  }
  return parseModelJson(text);
}

export function callEngine(
  kind: AiEngineKind,
  config: AiConfig,
  req: StructuredRequest,
  signal: AbortSignal
): Promise<unknown> {
  return kind === 'claude' ? callClaude(config, req, signal) : callGemini(config, req, signal);
}
