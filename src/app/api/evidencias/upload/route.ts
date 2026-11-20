import { NextRequest, NextResponse } from 'next/server';
import { saveEvidenceFile } from '@/lib/data-store';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        dataUrl?: string;
        fileName?: string;
        folder?: string;
      };

      if (!body.dataUrl || !body.dataUrl.startsWith('data:')) {
        return NextResponse.json(
          { error: 'Se requiere un archivo o firma en formato válido.' },
          { status: 400 }
        );
      }

      const match = body.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ error: 'Formato dataUrl inválido.' }, { status: 400 });
      }

      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const result = await saveEvidenceFile({
        buffer,
        originalName: body.fileName || 'firma.png',
        mimeType,
        folder: body.folder || 'firmas',
      });

      return NextResponse.json(result, { status: 201 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string | null) || 'evidencias';

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const result = await saveEvidenceFile({
      buffer,
      originalName: file.name || 'evidencia.jpg',
      mimeType: file.type || 'image/jpeg',
      folder,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error subiendo evidencia.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
