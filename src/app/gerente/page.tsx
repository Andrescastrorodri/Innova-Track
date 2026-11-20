import { ManagerDashboard } from '@/components/ManagerDashboard';
import { computeExecutiveDashboard } from '@/lib/analytics';
import { getFullDatasetForAnalytics } from '@/lib/data-store';

export const metadata = { title: 'Tablero gerencial | Innova Track' };

export const dynamic = 'force-dynamic';

export default async function GerentePage() {
  const dataset = await getFullDatasetForAnalytics();
  const initialDashboard = computeExecutiveDashboard(dataset);

  return (
    <ManagerDashboard
      initialEmpresas={dataset.empresas_config}
      initialDashboard={initialDashboard}
    />
  );
}
