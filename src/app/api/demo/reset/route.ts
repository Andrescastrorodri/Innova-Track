import { NextResponse } from 'next/server';
import { resetDemoStore } from '@/lib/data-store';

// Restaura los datos de demostración del almacén local (.data) y borra las evidencias generadas.
export async function POST() {
  try {
    const result = resetDemoStore();
    return NextResponse.json({ ok: true, ...result, reiniciado_en: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'No se pudieron restaurar los datos de demostración.' },
      { status: 500 }
    );
  }
}
