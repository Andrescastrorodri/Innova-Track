interface SegmentedControlProps<Id extends string> {
  label: string;
  options: readonly { id: Id; label: string }[];
  value: Id;
  onChange: (id: Id) => void;
}

export function SegmentedControl<Id extends string>({ label, options, value, onChange }: SegmentedControlProps<Id>) {
  if (options.length === 0) return null;

  return (
    <div role="group" aria-label={label} className="ui-segments">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="ui-segment"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
