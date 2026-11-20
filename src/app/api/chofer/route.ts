import { NextRequest, NextResponse } from 'next/server';
import { getDriverContext } from '@/lib/data-store';

export async function GET(req: NextRequest) {
  try {
    const empresaId = req.nextUrl.searchParams.get('empresa_id') ?? undefined;
    const context = await getDriverContext(empresaId);
    return NextResponse.json(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error cargando datos del chofer.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
