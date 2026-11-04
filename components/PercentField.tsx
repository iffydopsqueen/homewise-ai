interface PercentFieldProps {
  id: string;
  label: string;
  description: string;
  value: string;
  placeholder: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

// Text input for percentages (rate, maintenance reserve). Mirrors
// CurrencyField; the trailing "%" is display-only and never submitted.
export default function PercentField({
  id,
  label,
  description,
  value,
  placeholder,
  error,
  disabled,
  onChange,
}: PercentFieldProps) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-t-ink"
      >
        {label}
      </label>
      <p id={descriptionId} className="mt-1 text-sm text-t-muted">
        {description}
      </p>
      <div className="relative mt-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error !== undefined}
          aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
          className="block w-full rounded-md border border-t-line-strong bg-t-field py-2 pl-3 pr-8 text-t-ink placeholder:text-t-placeholder focus:border-t-focus focus:outline-none focus:ring-1 focus:ring-t-focus disabled:bg-t-field-disabled"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-t-muted"
        >
          %
        </span>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-t-error">
          {error}
        </p>
      )}
    </div>
  );
}
