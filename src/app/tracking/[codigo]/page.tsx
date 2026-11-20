import Link from 'next/link';
import { PublicTrackingView } from '@/components/PublicTrackingView';
import { getTrackingDetailsByCode } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const details = await getTrackingDetailsByCode(codigo);

  if (!details) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-slate-900">Código no encontrado</h1>
          <p className="text-sm text-slate-600">
            No encontramos un pedido registrado con el código <span className="font-mono font-medium">{codigo}</span>.
          </p>
          <div className="pt-2">
            <Link
              href="/pedidos/nuevo"
              className="inline-flex px-4 py-2 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
            >
              Ir al Copiloto de Pedidos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <PublicTrackingView
      pedido={details.pedido}
      empresa={details.empresa}
      cliente={details.cliente}
      entrega={details.entrega}
      viaje={details.viaje}
      vehiculo={details.vehiculo}
    />
  );
}
