import { HomeHub } from '@/components/HomeHub';
import { computeExecutiveDashboard, type ExecutiveDashboardData } from '@/lib/analytics';
import { getFullDatasetForAnalytics } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const dataset = await getFullDatasetForAnalytics();

  const dashboardsByEmpresa: Record<string, ExecutiveDashboardData> = {};
  for (const emp of dataset.empresas_config) {
    dashboardsByEmpresa[emp.id] = computeExecutiveDashboard(dataset, emp.id);
  }

  const pedidosRecientes = [...dataset.pedidos]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  return (
    <HomeHub
      empresas={dataset.empresas_config}
      pedidosRecientes={pedidosRecientes}
      dashboardsByEmpresa={dashboardsByEmpresa}
    />
  );
}
