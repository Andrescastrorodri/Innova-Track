import { NextRequest, NextResponse } from 'next/server';
import { createPedidoWithClient, getOperationalContext } from '@/lib/data-store';
import type { ModalidadEnvio, OrigenInput, PedidoItem } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const empresaId = req.nextUrl.searchParams.get('empresa_id') ?? undefined;
    const context = await getOperationalContext(empresaId);
    return NextResponse.json(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error cargando contexto operativo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      empresa_id: string;
      cliente: {
        id: string | null;
        nombre: string;
        cedula_juridica: string;
        correo_facturacion: string;
        telefono: string;
        zona: string;
        ventana_inicio: string;
        ventana_fin: string;
      };
      origen_input: OrigenInput;
      items: PedidoItem[];
      subtotal: number;
      iva: number;
      total: number;
      modalidad_envio: ModalidadEnvio;
    };

    if (!body.empresa_id || !body.cliente?.nombre || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Datos incompletos: se requiere empresa_id, cliente y al menos un producto.' },
        { status: 400 }
      );
    }

    const result = await createPedidoWithClient(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error creando pedido.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
