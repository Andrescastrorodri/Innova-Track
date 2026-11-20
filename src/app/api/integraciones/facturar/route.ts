import { NextRequest, NextResponse } from 'next/server';
import { updatePedidoInvoice } from '@/lib/data-store';
import { generateHaciendaKeyAndConsecutivo } from '@/lib/integrations';

function hasLiveInvoicingApi(url: string | undefined): url is string {
  return Boolean(url && url.startsWith('http') && !url.includes('facturacion-electronica.cr'));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pedido_id: string;
      omitir?: boolean;
      cliente_nombre?: string;
      cliente_cedula?: string;
      cliente_correo?: string;
      subtotal?: number;
      iva?: number;
      total?: number;
    };

    if (!body.pedido_id) {
      return NextResponse.json({ error: 'Se requiere pedido_id.' }, { status: 400 });
    }

    if (body.omitir) {
      const updated = await updatePedidoInvoice(body.pedido_id, 'no_requiere', null);
      if (!updated) {
        return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        estado_factura: 'no_requiere',
        pedido: updated,
      });
    }

    const invoicingUrl = process.env.INVOICING_API_URL;
    let fiscal = generateHaciendaKeyAndConsecutivo(Math.floor(100000 + Math.random() * 899999));

    if (hasLiveInvoicingApi(invoicingUrl)) {
      const extRes = await fetch(invoicingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: body.pedido_id,
          receptor: {
            nombre: body.cliente_nombre,
            cedula_juridica: body.cliente_cedula,
            correo: body.cliente_correo,
          },
          subtotal: body.subtotal,
          iva: body.iva,
          total: body.total,
        }),
      });

      if (!extRes.ok) {
        return NextResponse.json(
          { error: `El API de facturación respondió con estado ${extRes.status}.` },
          { status: 502 }
        );
      }

      const extJson = (await extRes.json()) as Partial<typeof fiscal>;
      fiscal = {
        clave_hacienda: extJson.clave_hacienda || fiscal.clave_hacienda,
        consecutivo: extJson.consecutivo || fiscal.consecutivo,
        fecha_emision: extJson.fecha_emision || fiscal.fecha_emision,
        estado_hacienda: 'aceptado',
        modo_integracion: 'externo',
      };
    }

    const numeroFacturaExterna = `FE-CR-${fiscal.consecutivo.slice(-10)}`;
    const updated = await updatePedidoInvoice(body.pedido_id, 'facturado', numeroFacturaExterna);

    if (!updated) {
      return NextResponse.json({ error: 'Pedido no encontrado para facturar.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      estado_factura: 'facturado',
      numero_factura_externa: numeroFacturaExterna,
      ...fiscal,
      pedido: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error emitiendo factura electrónica.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
