import { NextRequest, NextResponse } from 'next/server';
import { getFullDatasetForAnalytics, updateEmpresaConfig } from '@/lib/data-store';
import type { TipoOperacion, UnidadMedida } from '@/lib/types';

export async function GET() {
  try {
    const dataset = await getFullDatasetForAnalytics();
    return NextResponse.json({ empresas: dataset.empresas_config });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error consultando configuración de empresas.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      nombre?: string;
      tipo_operacion?: TipoOperacion;
      unidad_medida_default?: UnidadMedida;
      api_inventario_url?: string | null;
      api_facturacion_url?: string | null;
      api_courier_url?: string | null;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: 'Se requiere el identificador de la empresa.' },
        { status: 400 }
      );
    }

    const updated = await updateEmpresaConfig(body);
    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error guardando la configuración.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
