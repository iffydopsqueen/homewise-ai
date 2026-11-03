import { formatDollars } from "./money";

// Signed-delta display helpers (Phase 6, step 4). Comparison deltas are
// always B-minus-A engine outputs that may be negative; these helpers only
// describe them for neutral direction sentences ("higher" / "lower" / "the
// same"). Display only: no financial math, no verdicts.

export type DeltaDirection = "higher" | "lower" | "same";

function checkedDelta(delta: number, fn: string): number {
  if (!Number.isInteger(delta) || !Number.isFinite(delta)) {
    throw new RangeError(`${fn}: expected integer cents`);
  }
  return delta;
}

export function deltaDirection(delta: number): DeltaDirection {
  const value = checkedDelta(delta, "deltaDirection");
  if (value > 0) {
    return "higher";
  }
  if (value < 0) {
    return "lower";
  }
  return "same";
}

export function formatDeltaMagnitude(delta: number): string {
  const value = checkedDelta(delta, "formatDeltaMagnitude");
  // Math.abs on an integer is exact; formatting reuses the money display.
  return formatDollars(Math.abs(value));
}
