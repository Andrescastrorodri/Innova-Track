import { OrderCopilot } from '@/components/OrderCopilot';
import { getOperationalContext } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

export default async function NuevoPedidoPage() {
  const context = await getOperationalContext();

  return (
    <OrderCopilot
      initialEmpresas={context.empresas}
      initialEmpresa={context.empresa}
      initialClientes={context.clientes}
      initialInventario={context.inventario}
    />
  );
}
