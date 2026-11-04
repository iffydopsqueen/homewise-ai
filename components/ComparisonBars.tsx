import { segmentPercents } from "../lib/format/allocation";

interface ComparisonBarsProps {
  aLabel: string;
  // Preformatted by the caller; raw cents in `aValue`/`bValue`.
  aDisplayValue: string;
  aValue: number;
  bLabel: string;
  bDisplayValue: string;
  bValue: number;
  // Accessible bar summary. Defaults to "A-label A-value, B-label B-value".
  summary?: string;
  emptyLabel?: string;
}

// Side-by-side two-bar comparison (T3c C2). Presentational only: both bars
// share the scale of the larger verified total, so lengths are directly
// comparable. Both bars use the same neutral fill — identity comes from
// the adjacent labels and values, never from color, and nothing implies a
// ranking. Equal totals render equal full bars; zero totals render empty
// tracks with an honest empty-state caption. Percentages derive from the
// tested allocation helper: no negative widths, NaN, or Infinity.
export default function ComparisonBars({
  aLabel,
  aDisplayValue,
  aValue,
  bLabel,
  bDisplayValue,
  bValue,
  summary,
  emptyLabel = "No monthly costs to compare.",
}: ComparisonBarsProps) {
  const usable = (value: number): number =>
    Number.isFinite(value) && value > 0 ? value : 0;
  const scale = Math.max(usable(aValue), usable(bValue));
  const [aPercent, bPercent] = segmentPercents([aValue, bValue], scale);
  const accessibleSummary =
    summary ?? `${aLabel} ${aDisplayValue}, ${bLabel} ${bDisplayValue}`;
  const rows = [
    { label: aLabel, displayValue: aDisplayValue, percent: aPercent ?? 0 },
    { label: bLabel, displayValue: bDisplayValue, percent: bPercent ?? 0 },
  ];

  return (
    <div>
      <div
        role="img"
        aria-label={scale === 0 ? emptyLabel : accessibleSummary}
        className="space-y-3"
      >
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-medium text-t-body">
              {row.label}
            </span>
            <span className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-t-line-soft">
              <span
                aria-hidden="true"
                style={{ width: `${row.percent}%` }}
                className="block h-full rounded-full bg-t-action"
              />
            </span>
            <span className="shrink-0 text-sm font-semibold text-t-ink tabular-nums">
              {row.displayValue}
            </span>
          </div>
        ))}
      </div>
      {scale === 0 && (
        <p className="mt-2 text-sm text-t-muted">{emptyLabel}</p>
      )}
    </div>
  );
}
