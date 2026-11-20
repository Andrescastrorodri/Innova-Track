import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getOperationalContext } from '@/lib/data-store';
import {
  calculateOrderTotals,
  matchClientFromText,
  matchItemsFromExtracted,
  parseOrderTextDeterministic,
  type ExtractedRawItem,
} from '@/lib/order-matching';

interface AiExtractionShape {
  cliente_nombre?: string;
  cliente_cedula?: string;
  cliente_zona?: string;
  texto_extraido?: string;
  items: ExtractedRawItem[];
  sugerencia_logistica?: string;
}

function isRealKey(val: string | undefined, placeholderPrefix: string): val is string {
  return Boolean(val && val.trim().length > 10 && !val.startsWith(placeholderPrefix));
}

function parseJsonFromModelText(raw: string): AiExtractionShape {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned) as AiExtractionShape;
}

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

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const hasAnthropic = isRealKey(anthropicKey, 'your-anthropic');
    const hasGemini = isRealKey(geminiKey, 'MY_GEMINI');

    let workingText = textoLibre;
    let fileBuffer: Buffer | null = null;
    let mimeType = archivo?.type || '';
    const fileName = archivo?.name?.toLowerCase() || '';

    if (archivo) {
      const arrayBuf = await archivo.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
      if (!mimeType) {
        if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (fileName.endsWith('.png')) mimeType = 'image/png';
        else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (fileName.endsWith('.webp')) mimeType = 'image/webp';
        else if (fileName.endsWith('.mp3')) mimeType = 'audio/mpeg';
        else if (fileName.endsWith('.wav')) mimeType = 'audio/wav';
        else if (fileName.endsWith('.ogg')) mimeType = 'audio/ogg';
        else if (fileName.endsWith('.webm')) mimeType = 'audio/webm';
        else if (fileName.endsWith('.m4a')) mimeType = 'audio/mp4';
      }
    }

    const isAudio = mimeType.startsWith('audio/');
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';

    // Paso A: Si hay audio, transcribir primero con Gemini audio transcription
    if (isAudio && fileBuffer) {
      if (!hasGemini) {
        return NextResponse.json(
          {
            error:
              'Para transcribir archivos o notas de audio se requiere GEMINI_API_KEY configurada en el servidor.',
          },
          { status: 503 }
        );
      }

      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const transcriptRes = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: fileBuffer.toString('base64'),
              },
            },
            {
              text: 'Transcribe literalmente este pedido comercial de Costa Rica en español, conservando cantidades, unidades, nombres de productos y nombre del cliente.',
            },
          ],
        },
      });

      const transcribed = (transcriptRes.text ?? '').trim();
      workingText = [workingText, transcribed].filter(Boolean).join('\n');
    }

    const systemPrompt = `Eres el Copiloto IA de Innova Track en Costa Rica.
Extrae los datos del pedido del mensaje, imagen o PDF y haz matching con el catálogo y clientes de la empresa "${activeEmpresa.nombre}" (${activeEmpresa.tipo_operacion}).

CATÁLOGO DE PRODUCTOS (SKU | Nombre | Unidad | Precio CRC | Stock):
${catalogSummary}

CLIENTES REGISTRADOS (Nombre | Cédula | Zona | Ventana):
${clientsSummary}

Devuelve ÚNICAMENTE JSON válido con esta estructura:
{
  "cliente_nombre": "string",
  "cliente_cedula": "string opcional",
  "cliente_zona": "Oeste | Este | Norte",
  "texto_extraido": "resumen limpio del pedido",
  "items": [
    { "sku": "SKU si coincide o vacío", "nombre": "nombre producto", "cantidad": number, "unidad": "unidades|cajas|bultos|kg" }
  ],
  "sugerencia_logistica": "recomendación breve de ruta o courier"
}`;

    let extracted: AiExtractionShape | null = null;
    let motor_ia = 'parser-estructurado';

    // Paso B: Usar Claude (claude-3-5-sonnet-latest) como motor principal si ANTHROPIC_API_KEY está configurada
    if (hasAnthropic) {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

      if (isImage && fileBuffer) {
        const supportedImageType = (
          ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
            ? mimeType
            : 'image/jpeg'
        ) as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: supportedImageType,
            data: fileBuffer.toString('base64'),
          },
        });
      } else if (isPdf && fileBuffer) {
        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        });
      }

      contentBlocks.push({
        type: 'text',
        text: workingText
          ? `Contenido del pedido:\n${workingText}`
          : 'Extrae el cliente, los ítems con cantidades/unidades y la sugerencia logística del documento adjunto.',
      });

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: contentBlocks }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        extracted = parseJsonFromModelText(textBlock.text);
        motor_ia = 'claude-3-5-sonnet-latest';
      }
    } else if (hasGemini) {
      // Alternativa multimodal nativa cuando no hay ANTHROPIC_API_KEY configurada
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      if ((isImage || isPdf) && fileBuffer) {
        parts.push({
          inlineData: {
            mimeType,
            data: fileBuffer.toString('base64'),
          },
        });
      }

      parts.push({
        text: `${systemPrompt}\n\nPedido recibido:\n${workingText || '(Ver archivo adjunto)'}`,
      });

      const gemRes = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cliente_nombre: { type: Type.STRING },
              cliente_cedula: { type: Type.STRING },
              cliente_zona: { type: Type.STRING },
              texto_extraido: { type: Type.STRING },
              sugerencia_logistica: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sku: { type: Type.STRING },
                    nombre: { type: Type.STRING },
                    cantidad: { type: Type.NUMBER },
                    unidad: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      if (gemRes.text) {
        extracted = parseJsonFromModelText(gemRes.text);
        motor_ia = 'gemini-4-hydrogen';
      }
    } else if (isImage || isPdf) {
      return NextResponse.json(
        {
          error:
            'Para procesar imágenes o PDFs se requiere ANTHROPIC_API_KEY o GEMINI_API_KEY en el entorno del servidor.',
        },
        { status: 503 }
      );
    }

    // Si hay texto sin llaves externas o como consolidación determinística:
    if (!extracted) {
      const deterministic = parseOrderTextDeterministic(
        workingText,
        context.clientes,
        context.inventario,
        activeEmpresa.id,
        activeEmpresa.tipo_operacion
      );
      return NextResponse.json(deterministic);
    }

    const clientHint = [
      extracted.cliente_nombre,
      extracted.cliente_cedula,
      extracted.cliente_zona,
      workingText,
    ]
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
    if (es_cliente_nuevo && extracted.cliente_zona) {
      cliente_detectado.zona = extracted.cliente_zona;
    }

    const items = matchItemsFromExtracted(
      extracted.items ?? [],
      context.inventario,
      activeEmpresa.id
    );
    const { subtotal, iva, total_estimado } = calculateOrderTotals(items);

    const sugerencia_logistica =
      extracted.sugerencia_logistica ||
      (activeEmpresa.tipo_operacion === 'pyme_tercerizada'
        ? `Cotizar despacho tercerizado hacia zona ${cliente_detectado.zona} (${cliente_detectado.ventana_inicio.slice(0, 5)}–${cliente_detectado.ventana_fin.slice(0, 5)}).`
        : `Asignar a ruta flotilla zona ${cliente_detectado.zona} (${cliente_detectado.ventana_inicio.slice(0, 5)}–${cliente_detectado.ventana_fin.slice(0, 5)}).`);

    return NextResponse.json({
      cliente_detectado,
      es_cliente_nuevo,
      items,
      subtotal,
      iva,
      total_estimado,
      sugerencia_logistica,
      texto_extraido: extracted.texto_extraido || workingText,
      motor_ia,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error procesando el pedido con IA multimodal.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
