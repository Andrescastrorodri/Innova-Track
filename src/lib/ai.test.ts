import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiValidationError,
  describeAiError,
  getAiConfig,
  getEngineOrder,
  isRealKey,
  parseModelJson,
  runStructured,
  validateExtractedOrder,
  validateWeeklyAlerts,
  type AiConfig,
} from './ai';

const REQUEST = {
  system: 'sistema',
  userText: 'pedido',
  schema: {},
  toolName: 'registrar',
  toolDescription: 'registra',
};

function config(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    anthropicKey: 'clave-claude-de-prueba',
    geminiKey: 'clave-gemini-de-prueba',
    anthropicModel: 'modelo-claude',
    geminiModel: 'modelo-gemini',
    timeoutMs: 1000,
    ...overrides,
  };
}

test('isRealKey descarta valores vacíos y de ejemplo', () => {
  assert.equal(isRealKey(undefined), false);
  assert.equal(isRealKey(''), false);
  assert.equal(isRealKey('MY_GEMINI_API_KEY'), false);
  assert.equal(isRealKey('your-anthropic-api-key'), false);
  assert.equal(isRealKey('corta'), false);
  assert.equal(isRealKey('una-llave-con-largo-real-123'), true);
});

test('orden de motores: Claude, luego Gemini, luego solo respaldo local', () => {
  const both = getAiConfig({ ANTHROPIC_API_KEY: 'llave-anthropic-real-123', GEMINI_API_KEY: 'llave-gemini-real-123' });
  assert.deepEqual(getEngineOrder(both), ['claude', 'gemini']);

  const onlyGemini = getAiConfig({ ANTHROPIC_API_KEY: 'your-anthropic-api-key', GEMINI_API_KEY: 'llave-gemini-real-123' });
  assert.deepEqual(getEngineOrder(onlyGemini), ['gemini']);

  assert.deepEqual(getEngineOrder(getAiConfig({})), []);
});

test('los modelos salen de variables de entorno con valor por defecto', () => {
  const defaults = getAiConfig({});
  assert.equal(defaults.anthropicModel, 'claude-opus-5-5');
  assert.equal(defaults.geminiModel, 'gemini-3.5-flash-lite');
  assert.equal(defaults.timeoutMs, 20000);

  const custom = getAiConfig({ ANTHROPIC_MODEL: 'otro-claude', GEMINI_MODEL: 'otro-gemini', AI_TIMEOUT_MS: '5000' });
  assert.equal(custom.anthropicModel, 'otro-claude');
  assert.equal(custom.geminiModel, 'otro-gemini');
  assert.equal(custom.timeoutMs, 5000);
});

test('validateExtractedOrder limpia líneas inválidas y rechaza pedidos vacíos', () => {
  const order = validateExtractedOrder({
    cliente_nombre: '  Pulpería La Esquina ',
    cliente_cedula: '',
    items: [
      { sku: 'ABR-101', nombre: 'Arroz', cantidad: 5, unidad: 'bultos' },
      { nombre: 'Aceite', cantidad: '2', unidad: 'cajas' },
      { nombre: '', cantidad: 3 },
      { nombre: 'Frijol', cantidad: 0 },
      { nombre: 'Azúcar', cantidad: 'muchos' },
    ],
  });
  assert.equal(order.cliente_nombre, 'Pulpería La Esquina');
  assert.equal(order.cliente_cedula, undefined);
  assert.deepEqual(
    order.items.map((i) => [i.nombre, i.cantidad]),
    [['Arroz', 5], ['Aceite', 2]]
  );

  assert.throws(() => validateExtractedOrder({ items: [] }), AiValidationError);
  assert.throws(() => validateExtractedOrder({ cliente_nombre: 'x' }), AiValidationError);
  assert.throws(() => validateExtractedOrder('texto'), AiValidationError);
});

test('validateWeeklyAlerts exige textos e impacto numérico y devuelve máximo 3', () => {
  const alerta = { titulo: 'Desvío', severidad: 'CRITICA', que_paso: 'Pasó algo', impacto_colones: 1500.4, accion_recomendada: 'Hacer algo' };
  const result = validateWeeklyAlerts({
    alertas: [alerta, { ...alerta, severidad: 'rara' }, { ...alerta, impacto_colones: 'mucho' }, alerta, alerta],
  });
  assert.equal(result.length, 3);
  assert.equal(result[0].severidad, 'critica');
  assert.equal(result[0].impacto_colones, 1500);
  assert.equal(result[1].severidad, 'alta');
  assert.throws(() => validateWeeklyAlerts({ alertas: [{ titulo: 'sin datos' }] }), AiValidationError);
});

test('parseModelJson acepta JSON con cercas de código y rechaza texto', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseModelJson('no es json'), AiValidationError);
});

test('runStructured usa el primer motor que responde algo válido', async () => {
  const calls: string[] = [];
  const result = await runStructured(REQUEST, validateExtractedOrder, {
    config: config(),
    call: async (kind) => {
      calls.push(kind);
      return { items: [{ nombre: 'Arroz', cantidad: 1 }] };
    },
  });
  assert.deepEqual(calls, ['claude']);
  assert.equal(result.motor, 'claude');
  assert.equal(result.etiqueta, 'Claude (modelo-claude)');
});

test('runStructured cae a Gemini si Claude falla o responde algo inválido', async () => {
  for (const claudeBehaviour of ['throw', 'invalid'] as const) {
    const result = await runStructured(REQUEST, validateExtractedOrder, {
      config: config(),
      call: async (kind) => {
        if (kind === 'claude') {
          if (claudeBehaviour === 'throw') throw Object.assign(new Error('boom'), { status: 529 });
          return { items: [] };
        }
        return { items: [{ nombre: 'Aceite', cantidad: 2 }] };
      },
    });
    assert.equal(result.motor, 'gemini');
    assert.equal(result.modelo, 'modelo-gemini');
    // Un proveedor saturado (5xx) se reintenta una vez; una respuesta inválida no.
    const claudeAttempts = result.intentos.filter((i) => i.motor === 'claude');
    assert.equal(claudeAttempts.length, claudeBehaviour === 'throw' ? 2 : 1);
    assert.equal(claudeAttempts.every((i) => !i.ok), true);
    assert.deepEqual(result.intentos.at(-1) && [result.intentos.at(-1)!.motor, result.intentos.at(-1)!.ok], ['gemini', true]);
  }
});

test('runStructured corta por tiempo y devuelve respaldo local si todos fallan', async () => {
  const result = await runStructured(REQUEST, validateExtractedOrder, {
    config: config({ anthropicKey: null, timeoutMs: 30 }),
    call: () => new Promise((resolve) => setTimeout(() => resolve({ items: [{ nombre: 'x', cantidad: 1 }] }), 300)),
  });
  assert.equal(result.data, null);
  assert.equal(result.motor, 'local');
  assert.equal(result.etiqueta, 'Lector sin IA');
  assert.equal(result.intentos[0].error, 'Tiempo de espera agotado.');
});

test('sin llaves no se llama a ningún motor', async () => {
  let called = false;
  const result = await runStructured(REQUEST, validateExtractedOrder, {
    config: config({ anthropicKey: null, geminiKey: null }),
    call: async () => {
      called = true;
      return {};
    },
  });
  assert.equal(called, false);
  assert.equal(result.data, null);
  assert.deepEqual(result.intentos, []);
});

test('describeAiError nunca devuelve el mensaje crudo del proveedor', () => {
  const leaky = Object.assign(new Error('Request to https://x/?key=SECRETO-123 failed: API key not valid'), { status: 400 });
  const described = describeAiError(leaky);
  assert.equal(described.includes('SECRETO'), false);
  assert.equal(describeAiError(Object.assign(new Error('x'), { status: 503 })), 'El proveedor no está disponible en este momento.');
});
