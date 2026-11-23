import { NextRequest, NextResponse } from 'next/server';
import { computeExecutiveDashboard } from '@/lib/analytics';
import { getFullDatasetForAnalytics } from '@/lib/data-store';
import { computeImpactMetrics } from '@/lib/impact';

export async function GET(req: NextRequest) {
  try {
    const empresaId = req.nextUrl.searchParams.get('empresa_id') ?? undefined;
    const dataset = await getFullDatasetForAnalytics();
    const dashboard = computeExecutiveDashboard(dataset, empresaId);

    return NextResponse.json({
      empresas: dataset.empresas_config,
      dashboard,
      impacto: computeImpactMetrics(dataset, empresaId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error cargando el tablero gerencial.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
