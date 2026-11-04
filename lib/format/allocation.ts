// Chart-percentage display helpers (T3b-R). These convert already-verified
// engine amounts (integer cents) into chart proportions. Display only: no
// financial math, no thresholds, no verdicts.
//
// Unlike stricter engine-adjacent helpers, these clamp defensively instead
// of throwing: a chart must never crash rendering. Non-finite, negative,
// or otherwise unusable inputs produce a 0% share, and every output is
// bounded to [0, 100].

// Usable chart magnitude: finite positive numbers pass through, everything
// else becomes zero. Fractional cents are tolerated (display only).
function magnitude(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

// Percentage share of each value against a caller-supplied total.
// Zero or unusable totals yield all-zero shares (no division by zero).
// Individual shares clamp to [0, 100], so an over-total value fills its
// segment without overflowing the bar.
export function segmentPercents(values: number[], total: number): number[] {
  const denominator = magnitude(total);
  if (denominator === 0) {
    return values.map(() => 0);
  }
  return values.map((value) => {
    const share = (magnitude(value) / denominator) * 100;
    return Math.min(100, Math.max(0, share));
  });
}

// Marker position as a percentage of a scale maximum (e.g. an income-limit
// line against an obligations-scaled bar). Clamped to [0, 100]; zero or
// unusable scales yield 0.
export function markerPercent(value: number, scaleMax: number): number {
  const scale = magnitude(scaleMax);
  if (scale === 0) {
    return 0;
  }
  const position = (magnitude(value) / scale) * 100;
  return Math.min(100, Math.max(0, position));
}
