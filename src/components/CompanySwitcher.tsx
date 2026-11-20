import { SegmentedControl } from '@/components/SegmentedControl';
import type { EmpresaConfig } from '@/lib/types';

interface CompanySwitcherProps {
  companies: readonly EmpresaConfig[];
  current?: string;
  onChange: (company: EmpresaConfig) => void;
  shortLabels?: boolean;
}

export function CompanySwitcher({ companies, current, onChange, shortLabels }: CompanySwitcherProps) {
  return (
    <SegmentedControl
      label="Cambiar empresa"
      options={companies.map((company) => ({
        id: company.id,
        label: shortLabels
          ? `${company.nombre.split(' ')[0]} · ${company.tipo_operacion === 'distribuidora_flotilla' ? 'Flotilla' : 'PyME'}`
          : company.tipo_operacion === 'distribuidora_flotilla' ? 'Distribuidora Flotilla' : 'PyME Tercerizada',
      }))}
      value={current ?? ''}
      onChange={(id) => {
        const company = companies.find((item) => item.id === id);
        if (company) onChange(company);
      }}
    />
  );
}
