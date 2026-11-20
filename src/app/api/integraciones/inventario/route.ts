import { NextRequest, NextResponse } from 'next/server';
import { getOperationalContext, reserveInventoryStock } from '@/lib/data-store';

function hasLiveWebhook(url: string | undefined): url is string {
  return Boolean(url && url.startsWith('http') && !url.includes('erp-ejemplo.cr'));
}

export async function GET(req: NextRequest) {
  try {
    const empresaId = req.nextUrl.searchParams.get('empresa_id') ?? undefined;
    const context = await getOperationalContext(empresaId);
    const items = context.inventario.filter((p) => p.empresa_id === context.empresa.id);

    return NextResponse.json({
      fuente: hasLiveWebhook(process.env.ERP_INVENTORY_WEBHOOK_URL) ? 'erp_externo' : 'simulado_erp',
      empresa_id: context.empresa.id,
      productos: items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error consultando inventario.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      empresa_id: string;
      items: Array<{ sku: string; cantidad: number }>;
      codigo_tracking?: string;
    };

    if (!body.empresa_id || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere empresa_id y la lista de SKUs a reservar.' },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.ERP_INVENTORY_WEBHOOK_URL;
    let modo_integracion: 'externo' | 'simulado' = 'simulado';

    if (hasLiveWebhook(webhookUrl)) {
      const externalRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'reservar_stock',
          empresa_id: body.empresa_id,
          referencia: body.codigo_tracking ?? null,
          items: body.items,
        }),
      });
      if (!externalRes.ok) {
        return NextResponse.json(
          { error: `El webhook ERP de inventario respondió con estado ${externalRes.status}.` },
          { status: 502 }
        );
      }
      modo_integracion = 'externo';
    }

    const reservation = await reserveInventoryStock(body.empresa_id, body.items);

    return NextResponse.json({
      ok: true,
      modo_integracion,
      endpoint_configurado: webhookUrl || 'simulador-local-erp',
      ...reservation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error reservando stock en ERP.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
