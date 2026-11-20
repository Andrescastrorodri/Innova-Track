import { NextRequest, NextResponse } from 'next/server';
import { closeDriverRoute, startDriverRoute } from '@/lib/data-store';
import type { GpsPoint } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: 'iniciar' | 'cerrar';
      empresa_id?: string;
      chofer_nombre?: string;
      vehiculo_id?: string;
      tramo_id?: string;
      odometro_inicio?: number;
      foto_odometro_inicio?: string;
      gps_salida?: GpsPoint;
      viaje_id?: string;
      odometro_fin?: number;
      foto_odometro_fin?: string;
      gps_regreso?: GpsPoint;
    };

    if (body.action === 'iniciar') {
      if (
        !body.empresa_id ||
        !body.chofer_nombre ||
        !body.vehiculo_id ||
        !body.tramo_id ||
        body.odometro_inicio === undefined ||
        !body.foto_odometro_inicio
      ) {
        return NextResponse.json(
          { error: 'Completa chofer, vehículo, ruta, odómetro inicial y foto del odómetro.' },
          { status: 400 }
        );
      }

      const started = await startDriverRoute({
        empresa_id: body.empresa_id,
        chofer_nombre: body.chofer_nombre,
        vehiculo_id: body.vehiculo_id,
        tramo_id: body.tramo_id,
        odometro_inicio: Number(body.odometro_inicio),
        foto_odometro_inicio: body.foto_odometro_inicio,
        gps_salida: body.gps_salida ?? {
          lat: 9.9512,
          lng: -84.0998,
          timestamp: new Date().toISOString(),
        },
      });
      return NextResponse.json(started, { status: 201 });
    }

    if (body.action === 'cerrar') {
      if (!body.viaje_id || body.odometro_fin === undefined || !body.foto_odometro_fin) {
        return NextResponse.json(
          { error: 'Se requiere viaje_id, odómetro final y foto del odómetro final.' },
          { status: 400 }
        );
      }

      const closed = await closeDriverRoute({
        viaje_id: body.viaje_id,
        odometro_fin: Number(body.odometro_fin),
        foto_odometro_fin: body.foto_odometro_fin,
        gps_regreso: body.gps_regreso ?? {
          lat: 9.9512,
          lng: -84.0998,
          timestamp: new Date().toISOString(),
        },
      });
      return NextResponse.json(closed);
    }

    return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error gestionando ruta del chofer.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
