import { NextRequest, NextResponse } from 'next/server';
import { dispatchPedido, getOperationalContext, getTrackingDetailsByCode } from '@/lib/data-store';
import { quoteExternalCourier, selectOptimalFleetRoute } from '@/lib/integrations';
import type { ModalidadEnvio } from '@/lib/types';

function hasLiveCourierApi(url: string | undefined): url is string {
  return Boolean(url && url.startsWith('http') && !url.includes('courier-cr.example'));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pedido_id: string;
      codigo_tracking: string;
      empresa_id: string;
      action?: 'cotizar' | 'despachar';
      modalidad_envio?: ModalidadEnvio;
      proveedor_externo_nombre?: string;
      viaje_id?: string | null;
    };

    if (!body.pedido_id && !body.codigo_tracking) {
      return NextResponse.json(
        { error: 'Se requiere pedido_id o codigo_tracking.' },
        { status: 400 }
      );
    }

    const context = await getOperationalContext(body.empresa_id);
    const details = await getTrackingDetailsByCode(body.codigo_tracking || body.pedido_id);

    if (!details) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }

    const modalidad: ModalidadEnvio =
      body.modalidad_envio ??
      (context.empresa.tipo_operacion === 'pyme_tercerizada'
        ? 'proveedor_externo'
        : 'flotilla_propia');

    const action = body.action ?? 'despachar';

    if (modalidad === 'proveedor_externo') {
      const proveedor = body.proveedor_externo_nombre || 'Moovin CR';
      let quote = quoteExternalCourier(
        details.cliente,
        details.pedido.items_json,
        details.pedido.codigo_tracking,
        proveedor
      );

      const courierUrl = process.env.EXTERNAL_COURIER_API_URL;
      if (action === 'despachar' && hasLiveCourierApi(courierUrl)) {
        const extRes = await fetch(courierUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo_tracking: details.pedido.codigo_tracking,
            proveedor,
            destino: {
              nombre: details.cliente.nombre,
              zona: details.cliente.zona,
              lat: details.cliente.lat,
              lng: details.cliente.lng,
            },
            items: details.pedido.items_json,
          }),
        });
        if (!extRes.ok) {
          return NextResponse.json(
            { error: `El API del courier externo respondió con estado ${extRes.status}.` },
            { status: 502 }
          );
        }
        const extJson = (await extRes.json()) as Partial<typeof quote>;
        quote = {
          ...quote,
          guia_externa: extJson.guia_externa || quote.guia_externa,
          tracking_externo_url: extJson.tracking_externo_url || quote.tracking_externo_url,
          tarifa_colones: extJson.tarifa_colones ?? quote.tarifa_colones,
          modo_integracion: 'externo',
        };
      }

      if (action === 'cotizar') {
        return NextResponse.json({
          ok: true,
          modalidad_envio: 'proveedor_externo',
          cotizacion: quote,
        });
      }

      const dispatched = await dispatchPedido({
        pedidoId: details.pedido.id,
        modalidad_envio: 'proveedor_externo',
        proveedor_externo_nombre: `${quote.proveedor} (${quote.guia_externa})`,
        tracking_externo_url: quote.tracking_externo_url,
        courier_tarifa_colones: quote.tarifa_colones,
      });

      return NextResponse.json({
        ok: true,
        modalidad_envio: 'proveedor_externo',
        cotizacion: quote,
        pedido: dispatched?.pedido,
      });
    }

    // Distribuidora / Flotilla Propia
    const requestedUnits = details.pedido.items_json.reduce((acc, it) => acc + it.cantidad, 0);
    const fleetSuggestion = selectOptimalFleetRoute(
      details.cliente,
      context.tramos,
      context.viajes,
      context.vehiculos,
      requestedUnits
    );

    if (action === 'cotizar') {
      return NextResponse.json({
        ok: true,
        modalidad_envio: 'flotilla_propia',
        asignacion_flotilla: fleetSuggestion,
      });
    }

    const dispatched = await dispatchPedido({
      pedidoId: details.pedido.id,
      modalidad_envio: 'flotilla_propia',
      viaje_id: body.viaje_id ?? fleetSuggestion.viaje_id,
    });

    return NextResponse.json({
      ok: true,
      modalidad_envio: 'flotilla_propia',
      asignacion_flotilla: fleetSuggestion,
      pedido: dispatched?.pedido,
      entrega: dispatched?.entrega,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error coordinando despacho.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
