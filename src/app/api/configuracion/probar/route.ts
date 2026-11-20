import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as {
      tipo: 'inventario' | 'facturacion' | 'courier';
      url: string;
    };

    const url = (body.url || '').trim();
    if (!url) {
      return NextResponse.json(
        {
          ok: false,
          estado: 'sin_url',
          latencia_ms: 0,
          mensaje: 'Ingresa una dirección HTTP o HTTPS antes de probar la conexión.',
        },
        { status: 400 }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Protocolo inválido');
      }
    } catch {
      return NextResponse.json(
        {
          ok: false,
          estado: 'url_invalida',
          latencia_ms: Date.now() - startedAt,
          mensaje: 'El formato de la URL no es válido. Usa https://...',
        },
        { status: 400 }
      );
    }

    const isDemoHost =
      parsed.hostname.endsWith('.demo') ||
      parsed.hostname.includes('example.com') ||
      parsed.hostname.includes('vallecentral.cr') ||
      parsed.hostname.includes('hacienda-adapter.cr') ||
      parsed.hostname.includes('couriers-cr.com') ||
      parsed.hostname.includes('innopyme.cr') ||
      parsed.hostname === 'localhost';

    if (isDemoHost) {
      const labels: Record<'inventario' | 'facturacion' | 'courier', string> = {
        inventario: 'Conexión verificada con adaptador ERP de inventario (modo demostrativo).',
        facturacion: 'Conexión verificada con conector Hacienda CR v4.3 (modo demostrativo).',
        courier: 'Conexión verificada con API de mensajería externa (modo demostrativo).',
      };
      return NextResponse.json({
        ok: true,
        estado: 'simulado',
        latencia_ms: Math.max(18, Date.now() - startedAt + 24),
        mensaje: labels[body.tipo] ?? 'Conexión de adaptador verificada.',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });
      const latencia = Date.now() - startedAt;
      return NextResponse.json({
        ok: res.status < 500,
        estado: res.status < 500 ? 'conectado' : 'error_remoto',
        latencia_ms: latencia,
        mensaje:
          res.status < 500
            ? `Respuesta HTTP ${res.status} recibida en ${latencia} ms.`
            : `El servidor remoto respondió HTTP ${res.status}.`,
      });
    } catch {
      const latencia = Date.now() - startedAt;
      return NextResponse.json({
        ok: false,
        estado: 'sin_respuesta',
        latencia_ms: latencia,
        mensaje:
          'No se obtuvo respuesta del servidor externo; el sistema utilizará el adaptador local de respaldo.',
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error verificando conectividad de API.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
