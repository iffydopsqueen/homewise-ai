interface CurrencyFieldProps {
  id: string;
  label: string;
  description: string;
  value: string;
  placeholder: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export default function CurrencyField({
  id,
  label,
  description,
  value,
  placeholder,
  error,
  disabled,
  onChange,
}: CurrencyFieldProps) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-slate-900"
      >
        {label}
      </label>
      <p id={descriptionId} className="mt-1 text-sm text-slate-600">
        {description}
      </p>
      <div className="relative mt-2">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-600"
        >
          $
        </span>
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
          className="block w-full rounded-md border border-slate-300 py-2 pl-7 pr-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100"
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
