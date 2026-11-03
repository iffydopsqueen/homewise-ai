import {
  trueCostInputSchema,
  whatIfOverridesSchema,
  type TrueCostInput,
  type WhatIfOverrides,
} from "../validation/calc";
import { calculateTrueCost, type TrueCostResult } from "./trueCost";

export interface WhatIfResult {
  base: TrueCostResult;
  scenario: TrueCostResult;
  overrides: WhatIfOverrides;
  deltaMonthly: number;
  deltaAnnual: number;
  deltaUpfront: number;
}

// F5: D.8 what-if recomputation. Overrides are validated independently of the
// base, and only defined keys merge: omitted fields always retain base values,
// so changing one assumption can never reset unrelated ones. PMI, other
// costs, and term are not D.8 override fields and always carry from base.
export function runWhatIf(rawBase: unknown, rawOverrides: unknown): WhatIfResult {
  const baseInput: TrueCostInput = trueCostInputSchema.parse(rawBase);
  const overrides: WhatIfOverrides = whatIfOverridesSchema.parse(rawOverrides);
  const merged: Record<string, unknown> = { ...baseInput };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  const scenarioInput = trueCostInputSchema.parse(merged);
  const base = calculateTrueCost(baseInput);
  const scenario = calculateTrueCost(scenarioInput);
  return {
    base,
    deltaAnnual: scenario.totalAnnual - base.totalAnnual,
    deltaMonthly: scenario.totalMonthly - base.totalMonthly,
    deltaUpfront:
      scenario.estimatedUpfrontCashCents - base.estimatedUpfrontCashCents,
    overrides,
    scenario,
  };
}
