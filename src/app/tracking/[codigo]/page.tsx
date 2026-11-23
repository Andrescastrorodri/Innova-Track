import Link from 'next/link';
import { PublicTrackingView } from '@/components/PublicTrackingView';
import { getTrackingDetailsByCode } from '@/lib/data-store';

export const metadata = { title: 'Seguimiento de pedido | Innova Track' };

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
      <main id="contenido" tabIndex={-1} className="grid min-h-dvh place-items-center p-4">
        <div className="max-w-md w-full bg-surface border border-line rounded-2xl p-6 shadow-md space-y-4 sm:p-8">
          <h1 className="page-title">Código no encontrado</h1>
          <p className="text-sm text-secondary">
            No encontramos un pedido registrado con el código <span className="font-mono font-medium [overflow-wrap:anywhere]">{codigo}</span>.
          </p>
          <div className="pt-2">
            <Link
              href="/pedidos/nuevo"
              className="ui-button ui-button-primary"
            >
              Ir al Copiloto de Pedidos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Misma regla que /api/integraciones/facturar: sin un emisor real configurado, la factura es de demostración.
  const invoicingUrl = process.env.INVOICING_API_URL;
  const facturaSimulada = !(
    invoicingUrl &&
    invoicingUrl.startsWith('http') &&
    !invoicingUrl.includes('facturacion-electronica.cr')
  );

  return (
    <PublicTrackingView
      pedido={details.pedido}
      empresa={details.empresa}
      cliente={details.cliente}
      entrega={details.entrega}
      viaje={details.viaje}
      vehiculo={details.vehiculo}
      facturaSimulada={facturaSimulada}
    />
  );
}
