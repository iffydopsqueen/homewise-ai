import { trueCostInputSchema } from "../validation/calc";
import { calculateTrueCost, type TrueCostResult } from "./trueCost";
import type { CentsMonthly } from "./money";

export type FixedComponentKey =
  | "principalAndInterest"
  | "propertyTax"
  | "insurance"
  | "hoa"
  | "maintenance"
  | "pmi";

export interface FixedComponentDelta {
  key: FixedComponentKey;
  a: CentsMonthly;
  b: CentsMonthly;
  delta: number;
}

export type OtherLineStatus = "matched" | "added" | "removed";

export interface OtherLineDelta {
  // Normalized match key; original labels preserved for display.
  key: string;
  labelA: string | null;
  labelB: string | null;
  a: CentsMonthly;
  b: CentsMonthly;
  delta: number;
  status: OtherLineStatus;
}

export interface ComparisonResult {
  a: TrueCostResult;
  b: TrueCostResult;
  assumptionsDiffer: boolean;
  fixed: FixedComponentDelta[];
  otherLines: OtherLineDelta[];
  deltaMonthly: number;
  deltaAnnual: number;
  deltaUpfront: number;
}

// Match key for itemized lines: trim, collapse internal whitespace, lowercase.
// Display always uses the original labels; this key is only for matching.
export function normalizeExpenseLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function aggregateLines(
  lines: { label: string; monthly: CentsMonthly }[],
): Map<string, { label: string; total: number }> {
  const grouped = new Map<string, { label: string; total: number }>();
  for (const line of lines) {
    const key = normalizeExpenseLabel(line.label);
    const existing = grouped.get(key);
    if (existing) {
      existing.total += line.monthly;
    } else {
      grouped.set(key, { label: line.label, total: line.monthly });
    }
  }
  return grouped;
}

// F4: D.7 two-property comparison. Both sides are full validated inputs;
// a missing or malformed side is rejected, never defaulted.
export function compareProperties(rawA: unknown, rawB: unknown): ComparisonResult {
  const a = calculateTrueCost(trueCostInputSchema.parse(rawA));
  const b = calculateTrueCost(trueCostInputSchema.parse(rawB));
  const fixedPairs: [FixedComponentKey, CentsMonthly, CentsMonthly][] = [
    ["principalAndInterest", a.monthlyPI, b.monthlyPI],
    ["propertyTax", a.monthlyTax, b.monthlyTax],
    ["insurance", a.monthlyInsurance, b.monthlyInsurance],
    ["hoa", a.monthlyHoa, b.monthlyHoa],
    ["maintenance", a.monthlyMaintenance, b.monthlyMaintenance],
    ["pmi", a.monthlyPMI, b.monthlyPMI],
  ];
  const fixed: FixedComponentDelta[] = fixedPairs.map(([key, aVal, bVal]) => ({
    a: aVal,
    b: bVal,
    delta: bVal - aVal,
    key,
  }));
  // Duplicate labels aggregate per side BEFORE comparing, so "Lawn" + "lawn"
  // on one side matches "LAWN" on the other instead of misfiring.
  const linesA = aggregateLines(a.otherLines);
  const linesB = aggregateLines(b.otherLines);
  const keys = [...new Set([...linesA.keys(), ...linesB.keys()])].sort();
  const otherLines: OtherLineDelta[] = keys.map((key) => {
    const entryA = linesA.get(key);
    const entryB = linesB.get(key);
    const aVal = (entryA?.total ?? 0) as CentsMonthly;
    const bVal = (entryB?.total ?? 0) as CentsMonthly;
    return {
      a: aVal,
      b: bVal,
      delta: bVal - aVal,
      key,
      labelA: entryA?.label ?? null,
      labelB: entryB?.label ?? null,
      status:
        entryA && entryB ? "matched" : entryB ? "added" : "removed",
    };
  });
  return {
    a,
    assumptionsDiffer: a.inputs.assumptionSetId !== b.inputs.assumptionSetId,
    b,
    deltaAnnual: b.totalAnnual - a.totalAnnual,
    deltaMonthly: b.totalMonthly - a.totalMonthly,
    deltaUpfront: b.estimatedUpfrontCashCents - a.estimatedUpfrontCashCents,
    fixed,
    otherLines,
  };
}
