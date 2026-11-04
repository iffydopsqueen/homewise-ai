import {
  markerPercent,
  segmentPercents,
} from "../lib/format/allocation";

export interface AllocationSegment {
  label: string;
  // Preformatted by the caller (e.g. "$2,000.00"). Nonnegative cents in
  // `value`; unusable values render as zero-share legend entries only.
  displayValue: string;
  value: number;
}

export interface AllocationLimitMark {
  // Reference value (e.g. monthly income) drawn as a vertical line at its
  // position within the bar scale. Must be mathematically consistent with
  // `total`: position = value / total.
  value: number;
  displayValue: string;
  label: string;
}

interface AllocationBarProps {
  segments: AllocationSegment[];
  // Denominator in the same units as segment values (normally the bar sums
  // to this; in shortfall mode it is the larger obligations sum).
  total: number;
  limitMark?: AllocationLimitMark;
  // Accessible bar summary. Defaults to "Label value, …" from the legend.
  summary?: string;
  emptyLabel?: string;
}

// Fixed categorical palette using existing semantic tokens only (no new
// theme colors). Full literal class names so Tailwind detects them. Order
// alternates dark and mid tones for adjacent-segment distinction; callers
// with more segments than colors cycle. Color is never the only channel:
// every segment also appears in the value legend and the bar summary.
const PALETTE = [
  "bg-t-action",
  "bg-t-est-ink",
  "bg-t-calc-bg",
  "bg-t-warn-ink",
  "bg-t-prov-ink",
  "bg-t-line-strong",
  "bg-t-caption",
] as const;

// Horizontal stacked allocation bar (T3b-R). Presentational only: all
// amounts and formatting come from the caller; percentages derive from the
// allocation helper. Zero-share segments are omitted from the bar but kept
// in the legend; negative amounts are never rendered as negative widths.
export default function AllocationBar({
  segments,
  total,
  limitMark,
  summary,
  emptyLabel = "No amounts to show.",
}: AllocationBarProps) {
  const hasData =
    Number.isFinite(total) &&
    total > 0 &&
    segments.some((s) => Number.isFinite(s.value) && s.value > 0);
  const percents = segmentPercents(
    segments.map((s) => s.value),
    total,
  );
  const mark =
    limitMark === undefined
      ? null
      : markerPercent(limitMark.value, total);
  const accessibleSummary =
    summary ??
    segments.map((s) => `${s.label} ${s.displayValue}`).join(", ");

  if (!hasData) {
    return (
      <div>
        <div
          role="img"
          aria-label={emptyLabel}
          className="h-3.5 rounded-full bg-t-line-soft"
        />
        <p className="mt-2 text-sm text-t-muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div
          role="img"
          aria-label={accessibleSummary}
          className="flex h-3.5 gap-0.5 overflow-hidden rounded-full"
        >
          {segments.map((segment, index) =>
            percents[index] === 0 ? null : (
              <div
                key={`${segment.label}-${index}`}
                aria-hidden="true"
                title={`${segment.label} ${segment.displayValue}`}
                style={{ width: `${percents[index]}%` }}
                className={`h-full shrink-0 grow-0 ${PALETTE[index % PALETTE.length]}`}
              />
            ),
          )}
        </div>
        {mark !== null && (
          <div
            aria-hidden="true"
            title={
              limitMark === undefined
                ? undefined
                : `${limitMark.label} ${limitMark.displayValue}`
            }
            style={{ left: `${mark}%` }}
            className="absolute -inset-y-1 w-0.5 bg-t-ink"
          />
        )}
      </div>
      {limitMark !== undefined && (
        <p className="mt-2 flex items-center gap-2 text-sm text-t-muted">
          <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-t-ink" />
          {limitMark.label}:{" "}
          <span className="font-semibold text-t-ink tabular-nums">
            {limitMark.displayValue}
          </span>
        </p>
      )}
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {segments.map((segment, index) => (
          <li
            key={`${segment.label}-${index}`}
            className="flex items-center gap-2 text-sm"
          >
            <span
              aria-hidden="true"
              className={`h-3 w-3 shrink-0 rounded-sm ${PALETTE[index % PALETTE.length]}`}
            />
            <span className="text-t-body">{segment.label}</span>
            <span className="ml-auto font-semibold text-t-ink tabular-nums">
              {segment.displayValue}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
