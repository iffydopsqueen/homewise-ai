interface EstimateToggleProps {
  id: string;
  checked: boolean;
  disabled: boolean;
  helperText: string;
  onChange: (checked: boolean) => void;
}

// "This is an estimate" checkbox for tax, insurance, HOA, and closing
// costs. Presentational only: the parent owns the checked state and turns
// it into a provenance claim at submit time.
export default function EstimateToggle({
  id,
  checked,
  disabled,
  helperText,
  onChange,
}: EstimateToggleProps) {
  const helperId = `${id}-helper`;
  return (
    <div className="mt-2 flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={helperId}
        className="mt-1 h-4 w-4 rounded border-slate-300 accent-slate-900"
      />
      <div>
        <label
          htmlFor={id}
          className="text-sm font-medium text-slate-900"
        >
          This is an estimate
        </label>
        <p id={helperId} className="text-sm text-slate-600">
          {helperText}
        </p>
      </div>
    </div>
  );
}
