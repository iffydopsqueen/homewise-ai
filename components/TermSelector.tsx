interface TermSelectorProps {
  name: string;
  value: 15 | 30;
  disabled: boolean;
  onChange: (years: 15 | 30) => void;
}

const OPTIONS = [
  { years: 15, label: "15 years (180 months)" },
  { years: 30, label: "30 years (360 months)" },
] as const;

// 15/30-year loan-term radio group. Presentational only: the parent owns
// the selection and maps it to term months at submit time.
export default function TermSelector({
  name,
  value,
  disabled,
  onChange,
}: TermSelectorProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-t-ink">
        Loan term
      </legend>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {OPTIONS.map((option) => (
          <label
            key={option.years}
            className="flex items-center gap-2 text-sm text-t-ink"
          >
            <input
              type="radio"
              name={name}
              value={option.years}
              checked={value === option.years}
              disabled={disabled}
              onChange={() => onChange(option.years)}
              className="h-4 w-4 border-t-line-strong accent-t-accent"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
