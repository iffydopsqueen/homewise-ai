import type { OtherCostLineErrors } from "../lib/api/trueCostRequest";
import CurrencyField from "./CurrencyField";

export interface OtherCostLineValue {
  key: string;
  label: string;
  monthly: string;
}

interface OtherCostsEditorProps {
  lines: OtherCostLineValue[];
  lineErrors: OtherCostLineErrors[];
  disabled: boolean;
  onLineChange: (index: number, line: { label: string; monthly: string }) => void;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
}

// Matches the API schema's 100-line cap: the Add button disables there so
// the form can never assemble an over-long list.
const MAX_LINES = 100;

// Dynamic label + monthly-amount list. Presentational only: the parent owns
// line values, stable keys, and error mapping; this renders and reports.
export default function OtherCostsEditor({
  lines,
  lineErrors,
  disabled,
  onLineChange,
  onAddLine,
  onRemoveLine,
}: OtherCostsEditorProps) {
  const atCap = lines.length >= MAX_LINES;
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-t-ink">
        Other monthly costs
      </legend>
      <p className="mt-1 text-sm text-t-muted">
        Optional extras, such as lawn care or a security system. Each entry
        needs a label and a monthly amount.
      </p>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-t-muted">
          No other monthly costs added.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {lines.map((line, index) => {
            const errors = lineErrors[index] ?? {};
            const removeName =
              line.label.trim() === ""
                ? `Remove line ${index + 1}`
                : `Remove ${line.label.trim()}`;
            return (
              <div
                key={line.key}
                className="rounded-md border border-t-line p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`other-label-${line.key}`}
                      className="block text-sm font-semibold text-t-ink"
                    >
                      Label
                    </label>
                    <input
                      id={`other-label-${line.key}`}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Lawn care"
                      value={line.label}
                      disabled={disabled}
                      maxLength={80}
                      onChange={(event) =>
                        onLineChange(index, {
                          label: event.target.value,
                          monthly: line.monthly,
                        })
                      }
                      aria-invalid={errors.label !== undefined}
                      aria-describedby={
                        errors.label
                          ? `other-label-${line.key}-error`
                          : undefined
                      }
                      className="mt-2 block w-full rounded-md border border-t-line-strong bg-t-field py-2 pl-3 pr-3 text-t-ink placeholder:text-t-placeholder focus:border-t-focus focus:outline-none focus:ring-1 focus:ring-t-focus disabled:bg-t-field-disabled"
                    />
                    {errors.label && (
                      <p
                        id={`other-label-${line.key}-error`}
                        className="mt-1 text-sm font-medium text-t-error"
                      >
                        {errors.label}
                      </p>
                    )}
                  </div>
                  <CurrencyField
                    id={`other-monthly-${line.key}`}
                    label="Monthly amount"
                    description="Cost per month for this entry."
                    placeholder="75.00"
                    value={line.monthly}
                    error={errors.monthly}
                    disabled={disabled}
                    onChange={(value) =>
                      onLineChange(index, { label: line.label, monthly: value })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveLine(index)}
                  disabled={disabled}
                  className="mt-3 text-sm font-medium text-t-body underline hover:text-t-ink disabled:opacity-60"
                >
                  {removeName}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <button
          type="button"
          onClick={onAddLine}
          disabled={disabled || atCap}
          className="rounded-md border border-t-line-strong px-4 py-2 text-sm font-semibold text-t-ink hover:bg-t-secondary-hover disabled:opacity-60"
        >
          Add another cost
        </button>
        <p className="mt-1 text-sm text-t-muted">
          {atCap ? "Line limit reached (100)." : "Up to 100 lines."}
        </p>
      </div>
    </fieldset>
  );
}
