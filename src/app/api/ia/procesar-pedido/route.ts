import { NextRequest, NextResponse } from 'next/server';
import {
  ORDER_JSON_SCHEMA,
  getAiConfig,
  getEngineOrder,
  runStructured,
  validateExtractedOrder,
  type AiAttachment,
} from '@/lib/ai';
import { getOperationalContext } from '@/lib/data-store';
import {
  calculateOrderTotals,
  matchClientFromText,
  matchItemsFromExtracted,
  parseOrderTextDeterministic,
} from '@/lib/order-matching';

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const empresaId = (formData.get('empresa_id') as string | null) ?? undefined;
    const textoLibre = ((formData.get('texto') as string | null) ?? '').trim();
    const archivo = formData.get('archivo') as File | null;

    if (!textoLibre && !archivo) {
      return NextResponse.json(
        { error: 'Debes ingresar texto del pedido o adjuntar una imagen, PDF o audio.' },
        { status: 400 }
      );
    }

    let attachment: AiAttachment | null = null;
    if (archivo) {
      if (archivo.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: 'El archivo supera los 15 MB. Envía una foto o un audio más corto.' },
          { status: 413 }
        );
      }
      const extension = archivo.name?.toLowerCase().split('.').pop() ?? '';
      // "audio/webm;codecs=opus" → "audio/webm"
      const mimeType = (archivo.type || MIME_BY_EXTENSION[extension] || '').split(';')[0].trim();
      const supported =
        mimeType.startsWith('audio/') || mimeType.startsWith('image/') || mimeType === 'application/pdf';
      if (!supported) {
        return NextResponse.json(
          { error: 'Formato no admitido. Usa una imagen, un PDF o un audio.' },
          { status: 415 }
        );
      }
      attachment = {
        mimeType,
        base64: Buffer.from(await archivo.arrayBuffer()).toString('base64'),
      };
    }

    const context = await getOperationalContext(empresaId);
    const activeEmpresa = context.empresa;
    const empresaClientes = context.clientes.filter((c) => c.empresa_id === activeEmpresa.id);
    const empresaInventario = context.inventario.filter((p) => p.empresa_id === activeEmpresa.id);

    const catalogSummary = empresaInventario
      .map((p) => `${p.sku} | ${p.nombre} | ${p.unidad_medida} | ₡${p.precio_unitario} | stock:${p.stock_actual}`)
      .join('\n');
    const clientsSummary = empresaClientes
      .map((c) => `${c.nombre} | ${c.cedula_juridica} | Zona ${c.zona} | ${c.ventana_inicio}-${c.ventana_fin}`)
      .join('\n');

    const isAudio = Boolean(attachment?.mimeType.startsWith('audio/'));
    const system = `Eres el copiloto de pedidos de Innova Track en Costa Rica. Recibes pedidos tal como llegan por WhatsApp: texto informal, fotos de listas escritas a mano, PDFs o notas de voz.
Extrae el cliente y cada producto pedido, y relaciónalos con el catálogo y los clientes de "${activeEmpresa.nombre}" (${activeEmpresa.tipo_operacion}).

Reglas:
- Una línea por producto, con la cantidad y la unidad que pidió el cliente (unidades, cajas, bultos o kg). "saco" y "quintal" son bultos; "kilo" es kg.
- Si el producto coincide con el catálogo, usa su SKU y su nombre exactos. Si no coincide, deja el SKU vacío y escribe el nombre como lo dijo el cliente.
- No inventes productos ni cantidades. Si algo no se entiende, no lo incluyas en items y menciónalo en texto_extraido.
- cliente_nombre: usa el nombre exacto del cliente registrado si coincide; si no, el nombre que aparece en el pedido.
- texto_extraido: ${isAudio ? 'la transcripción literal del audio' : 'el pedido en limpio, en una o dos líneas'}.
- sugerencia_logistica: una frase sobre la ruta o el courier según la zona y la ventana horaria del cliente.

CATÁLOGO (SKU | Nombre | Unidad | Precio CRC | Stock):
${catalogSummary}

CLIENTES REGISTRADOS (Nombre | Cédula | Zona | Ventana):
${clientsSummary}`;

    const userText = textoLibre
      ? `Pedido recibido:\n${textoLibre}`
      : isAudio
        ? 'Transcribe la nota de voz adjunta y extrae el pedido.'
        : 'Extrae el pedido del archivo adjunto.';

    const ai = await runStructured(
      {
        system,
        userText,
        attachment,
        schema: ORDER_JSON_SCHEMA,
        toolName: 'registrar_pedido',
        toolDescription: 'Registra el pedido extraído del mensaje del cliente.',
      },
      validateExtractedOrder
    );

    const motorMeta = {
      motor_ia: ai.modelo ?? 'parser-estructurado',
      motor_tipo: ai.motor,
      motor_etiqueta: ai.etiqueta,
      motor_intentos: ai.intentos,
    };

    // Sin respuesta válida de IA: el texto se lee con el parser local.
    if (!ai.data) {
      if (!textoLibre) {
        const motivo = ai.intentos.find((i) => !i.ok)?.error;
        const sinMotores = getEngineOrder(getAiConfig()).length === 0;
        return NextResponse.json(
          {
            error: sinMotores
              ? 'Para leer fotos, PDFs o audios se necesita una llave de IA (GEMINI_API_KEY o ANTHROPIC_API_KEY). Mientras tanto, escribe el pedido como texto.'
              : `La IA no pudo leer el archivo${motivo ? ` (${motivo})` : ''}. Intenta de nuevo o escribe el pedido como texto.`,
            ...motorMeta,
          },
          { status: 503 }
        );
      }

      const deterministic = parseOrderTextDeterministic(
        textoLibre,
        context.clientes,
        context.inventario,
        activeEmpresa.id,
        activeEmpresa.tipo_operacion
      );
      return NextResponse.json({ ...deterministic, ...motorMeta });
    }

    const extracted = ai.data;
    const clientHint = [extracted.cliente_nombre, extracted.cliente_cedula, textoLibre]
      .filter(Boolean)
      .join(' ');

    const { cliente_detectado, es_cliente_nuevo } = matchClientFromText(
      clientHint,
      context.clientes,
      activeEmpresa.id
    );

    if (es_cliente_nuevo && extracted.cliente_nombre) {
      cliente_detectado.nombre = extracted.cliente_nombre;
    }
    if (es_cliente_nuevo && extracted.cliente_zona && ['Oeste', 'Este', 'Norte'].includes(extracted.cliente_zona)) {
      cliente_detectado.zona = extracted.cliente_zona;
    }

    const items = matchItemsFromExtracted(extracted.items, context.inventario, activeEmpresa.id);
    const { subtotal, iva, total_estimado } = calculateOrderTotals(items);

    const ventana = `${cliente_detectado.ventana_inicio.slice(0, 5)}–${cliente_detectado.ventana_fin.slice(0, 5)}`;
    const sugerencia_logistica =
      extracted.sugerencia_logistica ||
      (activeEmpresa.tipo_operacion === 'pyme_tercerizada'
        ? `Cotizar despacho tercerizado hacia zona ${cliente_detectado.zona} (${ventana}).`
        : `Asignar a ruta flotilla zona ${cliente_detectado.zona} (${ventana}).`);

    return NextResponse.json({
      cliente_detectado,
      es_cliente_nuevo,
      items,
      subtotal,
      iva,
      total_estimado,
      sugerencia_logistica,
      texto_extraido: extracted.texto_extraido || textoLibre,
      lineas_no_entendidas: [],
      ...motorMeta,
    });
  } catch (error) {
    console.error('[procesar-pedido]', error instanceof Error ? error.name : 'error');
    return NextResponse.json(
      { error: 'No se pudo procesar el pedido. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
