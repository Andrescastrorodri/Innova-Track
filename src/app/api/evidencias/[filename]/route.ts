import { NextRequest, NextResponse } from 'next/server';
import { readLocalEvidenceFile } from '@/lib/data-store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const found = readLocalEvidenceFile(filename);

  if (!found) {
    return NextResponse.json({ error: 'Evidencia no encontrada.' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(found.buffer), {
    status: 200,
    headers: {
      'Content-Type': found.mimeType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
