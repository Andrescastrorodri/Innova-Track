import { NextRequest, NextResponse } from 'next/server';
import { ALERTS_JSON_SCHEMA, runStructured, validateWeeklyAlerts } from '@/lib/ai';
import {
  buildFallbackAlerts,
  computeExecutiveDashboard,
  type AiOperationalAlert,
} from '@/lib/analytics';
import { getFullDatasetForAnalytics } from '@/lib/data-store';
import { formatColones } from '@/lib/seed-data';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { empresa_id?: string };

  const dataset = await getFullDatasetForAnalytics();
  const dashboard = computeExecutiveDashboard(dataset, body.empresa_id);
  const fallbackAlertas: AiOperationalAlert[] = buildFallbackAlerts(dashboard);

  const resumenConsolidado = {
    empresa: dashboard.empresa.nombre,
    tipo_operacion: dashboard.empresa.tipo_operacion,
    flotilla: dashboard.resumenFlotilla,
    pyme: dashboard.resumenPyme,
    desvios_kilometraje: dashboard.auditorias.desviosKilometraje.slice(0, 5),
    esperas_criticas: dashboard.auditorias.esperasCriticas.slice(0, 5),
    devoluciones: dashboard.auditorias.devoluciones.slice(0, 6),
  };

  const ai = await runStructured(
    {
      system: `Eres el analista de operaciones de Innova Track en Costa Rica. Escribes para gerencia, en español de Costa Rica, sin tecnicismos.
Con el resumen operativo que recibes, devuelve exactamente 3 alertas de la semana, de la más grave a la menos grave.
- que_paso: una oración con las cifras del resumen (ruta, cliente, km, minutos o unidades).
- impacto_colones: un monto tomado o sumado de las cifras del resumen. No inventes montos; si no hay base, usa 0.
- accion_recomendada: una oración concreta que alguien pueda ejecutar esta semana.`,
      userText: `Resumen operativo consolidado:\n${JSON.stringify(resumenConsolidado)}`,
      schema: ALERTS_JSON_SCHEMA,
      toolName: 'registrar_alertas',
      toolDescription: 'Registra las alertas operativas de la semana.',
      maxOutputTokens: 2000,
    },
    validateWeeklyAlerts
  );

  const alertas: AiOperationalAlert[] = ai.data
    ? ai.data.map((a, idx) => ({
        id: `alerta-ia-${idx + 1}`,
        titulo: a.titulo,
        severidad: a.severidad,
        que_paso: a.que_paso,
        impacto_colones: a.impacto_colones,
        impacto_formateado: formatColones(a.impacto_colones),
        accion_recomendada: a.accion_recomendada,
      }))
    : fallbackAlertas;

  return NextResponse.json({
    alertas,
    motor: ai.data ? ai.modelo : 'respaldo_sql_local',
    motor_tipo: ai.motor,
    motor_etiqueta: ai.data ? ai.etiqueta : 'Respaldo analítico local',
    motor_intentos: ai.intentos,
    generado_en: new Date().toISOString(),
  });
}
