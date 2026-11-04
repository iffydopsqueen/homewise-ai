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

// Direction-aware comparison wording (T5b.3). Engine deltas stay signed
// B-minus-A everywhere; these helpers only translate the sign into an
// explicit higher-side statement so readers never decode a negative.
// Display only: no financial math, no verdicts, no recommendations.

export type HigherSide = "A" | "B" | null;

export type ComparisonUnit = "monthly" | "annual" | "upfront";

// Which property holds the higher verified amount. Positive B-minus-A
// means B is higher; negative means A is higher; zero (including -0)
// means neither.
export function higherSide(delta: number): HigherSide {
  const value = checkedDelta(delta, "higherSide");
  if (value > 0) {
    return "B";
  }
  if (value < 0) {
    return "A";
  }
  return null;
}

const UNIT_PHRASES: Record<
  ComparisonUnit,
  { more: string; same: string }
> = {
  monthly: {
    more: "more per month than",
    same: "Both properties have the same estimated monthly cost.",
  },
  annual: {
    more: "more per year than",
    same: "Both properties have the same estimated annual cost.",
  },
  upfront: {
    more: "more upfront cash than",
    same: "Both properties require the same estimated upfront cash.",
  },
};

// Full neutral sentence naming the higher-cost property and the absolute
// difference, e.g. "Property A costs $619.78 more per month than Property
// B." Upfront uses "requires"; equal values use the shared same-cost
// wording. Never implies the lower-cost side is better.
export function differenceSentence(
  delta: number,
  unit: ComparisonUnit,
): string {
  const side = higherSide(delta);
  if (side === null) {
    return UNIT_PHRASES[unit].same;
  }
  const other = side === "A" ? "B" : "A";
  const verb = unit === "upfront" ? "requires" : "costs";
  return `Property ${side} ${verb} ${formatDeltaMagnitude(delta)} ${UNIT_PHRASES[unit].more} Property ${other}.`;
}

// Compact category-row difference: absolute magnitude plus the higher
// side, e.g. "$619.78 · Property A costs more". Equal values read
// "Same cost" with no magnitude shown.
export function categoryDifference(delta: number): string {
  const side = higherSide(delta);
  if (side === null) {
    return "Same cost";
  }
  return `${formatDeltaMagnitude(delta)} · Property ${side} costs more`;
}
