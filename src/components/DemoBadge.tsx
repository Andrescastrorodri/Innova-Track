/** Etiqueta discreta para lo que está simulado: factura electrónica, ERP y courier. */
export function DemoBadge({ label = 'Modo demostración' }: { label?: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted">
      {label}
    </span>
  );
}
