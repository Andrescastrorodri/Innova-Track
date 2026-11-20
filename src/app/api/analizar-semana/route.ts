import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildFallbackAlerts,
  computeExecutiveDashboard,
  type AiOperationalAlert,
} from '@/lib/analytics';
import { getFullDatasetForAnalytics } from '@/lib/data-store';
import { formatColones } from '@/lib/seed-data';

function isRealKey(val: string | undefined, placeholderPrefix: string): val is string {
  return Boolean(val && val.trim().length > 10 && !val.startsWith(placeholderPrefix));
}

export async function POST(req: NextRequest) {
  let empresaId: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { empresa_id?: string };
    empresaId = body.empresa_id;
  } catch {
    empresaId = undefined;
  }

  const dataset = await getFullDatasetForAnalytics();
  const dashboard = computeExecutiveDashboard(dataset, empresaId);
  const FALLBACK_ALERTAS: AiOperationalAlert[] = buildFallbackAlerts(dashboard);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!isRealKey(anthropicKey, 'your-anthropic')) {
    return NextResponse.json({
      alertas: FALLBACK_ALERTAS,
      motor: 'respaldo_sql_local',
      generado_en: new Date().toISOString(),
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const resumenConsolidado = {
      empresa: dashboard.empresa.nombre,
      tipo_operacion: dashboard.empresa.tipo_operacion,
      flotilla: dashboard.resumenFlotilla,
      pyme: dashboard.resumenPyme,
      desvios_kilometraje: dashboard.auditorias.desviosKilometraje.slice(0, 5),
      esperas_criticas: dashboard.auditorias.esperasCriticas.slice(0, 5),
      devoluciones: dashboard.auditorias.devoluciones.slice(0, 6),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await anthropic.messages.create(
        {
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 900,
          system: `Eres el Analista IA de Innova Track en Costa Rica. Responde únicamente en español costarricense ejecutivo y en formato JSON válido.
Analiza el resumen operativo SQL consolidado y devuelve exactamente 3 alertas críticas de la semana.
Cada alerta debe explicar qué pasó, su impacto exacto en colones (₡) y la acción recomendada en máximo 2 oraciones en total.
Formato JSON:
{
  "alertas": [
    {
      "id": "string",
      "titulo": "string corto",
      "severidad": "critica" | "alta" | "media",
      "que_paso": "1 oración clara con cifras",
      "impacto_colones": number,
      "accion_recomendada": "1 oración accionable"
    }
  ]
}`,
          messages: [
            {
              role: 'user',
              content: `Resumen operativo consolidado:\n${JSON.stringify(resumenConsolidado)}`,
            },
          ],
        },
        { signal: controller.signal }
      );

      clearTimeout(timer);
      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const cleaned = textBlock.text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned) as {
          alertas?: Array<{
            id?: string;
            titulo: string;
            severidad: 'critica' | 'alta' | 'media';
            que_paso: string;
            impacto_colones: number;
            accion_recomendada: string;
          }>;
        };

        if (parsed.alertas && parsed.alertas.length > 0) {
          const alertas: AiOperationalAlert[] = parsed.alertas.slice(0, 3).map((a, idx) => ({
            id: a.id || `alerta-ia-${idx + 1}`,
            titulo: a.titulo,
            severidad: a.severidad || 'alta',
            que_paso: a.que_paso,
            impacto_colones: Number(a.impacto_colones || 0),
            impacto_formateado: formatColones(Number(a.impacto_colones || 0)),
            accion_recomendada: a.accion_recomendada,
          }));

          return NextResponse.json({
            alertas,
            motor: 'claude-3-5-sonnet-latest',
            generado_en: new Date().toISOString(),
          });
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Fallback resiliente si falla la red o el SDK en demo
  }

  return NextResponse.json({
    alertas: FALLBACK_ALERTAS,
    motor: 'respaldo_sql_local',
    generado_en: new Date().toISOString(),
  });
}
