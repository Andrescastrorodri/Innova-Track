import { Building2, ChevronDown } from 'lucide-react';
import type { EmpresaConfig } from '@/lib/types';

interface CompanySwitcherProps {
  companies: readonly EmpresaConfig[];
  current?: string;
  onChange: (company: EmpresaConfig) => void;
}

export function CompanySwitcher({ companies, current, onChange }: CompanySwitcherProps) {
  if (companies.length === 0) return null;

  return (
    <div className="company-control glass-inset">
      <Building2 aria-hidden="true" size={16} strokeWidth={1.6} />
      <select
        aria-label="Cambiar empresa"
        value={current}
        title={companies.find((company) => company.id === current)?.nombre}
        onChange={(event) => {
          const company = companies.find((item) => item.id === event.target.value);
          if (company) onChange(company);
        }}
      >
        {companies.map((company) => {
          const mode = company.tipo_operacion === 'distribuidora_flotilla' ? 'Flotilla propia' : 'PyME tercerizada';
          const sameMode = companies.some((item) => item.id !== company.id && item.tipo_operacion === company.tipo_operacion);
          return (
            <option key={company.id} value={company.id}>
              {sameMode ? company.nombre : mode}
            </option>
          );
        })}
      </select>
      <ChevronDown aria-hidden="true" size={14} strokeWidth={1.7} />
    </div>
  );
}
