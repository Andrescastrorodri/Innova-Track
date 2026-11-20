import { DriverApp } from '@/components/DriverApp';
import { getDriverContext } from '@/lib/data-store';

export const metadata = { title: 'App chofer | Innova Track' };

export const dynamic = 'force-dynamic';

export default async function ChoferPage() {
  const initialContext = await getDriverContext();
  return <DriverApp initialContext={initialContext} />;
}
