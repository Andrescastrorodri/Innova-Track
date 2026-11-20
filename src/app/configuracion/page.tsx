import { ConfigPanel } from '@/components/ConfigPanel';
import { getFullDatasetForAnalytics } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const dataset = await getFullDatasetForAnalytics();
  return <ConfigPanel initialEmpresas={dataset.empresas_config} />;
}
