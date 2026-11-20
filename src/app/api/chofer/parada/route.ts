import { NextRequest, NextResponse } from 'next/server';
import { addDriverExpense, recordStopArrival, recordStopDelivery } from '@/lib/data-store';
import type { GpsPoint } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: 'llegada' | 'entregar' | 'gasto';
      entrega_id?: string;
      gps_llegada?: GpsPoint;
      cantidad_entregada?: number;
      cantidad_rechazada?: number;
      motivo_rechazo?: string | null;
      foto_comprobante?: string;
      empresa_id?: string;
      viaje_id?: string;
      tipo?: 'combustible' | 'peaje';
      litros?: number | null;
      monto_colones?: number;
      foto_factura?: string | null;
    };

    if (body.action === 'llegada') {
      if (!body.entrega_id) {
        return NextResponse.json({ error: 'Se requiere entrega_id.' }, { status: 400 });
      }
      const updated = await recordStopArrival({
        entrega_id: body.entrega_id,
        gps_llegada: body.gps_llegada ?? {
          lat: 9.9347,
          lng: -84.0875,
          timestamp: new Date().toISOString(),
        },
      });
      return NextResponse.json({ entrega: updated });
    }

    if (body.action === 'entregar') {
      if (!body.entrega_id || !body.foto_comprobante) {
        return NextResponse.json(
          { error: 'Se requiere entrega_id y comprobante (foto o firma).' },
          { status: 400 }
        );
      }
      const result = await recordStopDelivery({
        entrega_id: body.entrega_id,
        cantidad_entregada: Number(body.cantidad_entregada ?? 0),
        cantidad_rechazada: Number(body.cantidad_rechazada ?? 0),
        motivo_rechazo: body.motivo_rechazo ?? null,
        foto_comprobante: body.foto_comprobante,
      });
      return NextResponse.json(result);
    }

    if (body.action === 'gasto') {
      if (!body.empresa_id || !body.viaje_id || !body.tipo || body.monto_colones === undefined) {
        return NextResponse.json(
          { error: 'Se requiere viaje_id, tipo y monto en colones.' },
          { status: 400 }
        );
      }
      const gasto = await addDriverExpense({
        empresa_id: body.empresa_id,
        viaje_id: body.viaje_id,
        tipo: body.tipo,
        litros: body.litros ?? null,
        monto_colones: Number(body.monto_colones),
        foto_factura: body.foto_factura ?? null,
      });
      return NextResponse.json({ gasto }, { status: 201 });
    }

    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error registrando parada o gasto.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
