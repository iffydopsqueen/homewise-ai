import {
  affordabilityInputSchema,
  type AffordabilityInput,
} from "../validation/calc";
import { divFloor, divRoundHalfUp, type CentsMonthly } from "./money";

export interface AffordabilityResult {
  inputs: AffordabilityInput;
  totalMonthlyObligations: CentsMonthly;
  // Ratios in basis points of take-home pay (2500 = 25%). Raw outputs only:
  // the engine renders no thresholds, pass/fail, or verdicts.
  housingRatioBps: number;
  obligationsRatioBps: number;
  // Signed cents; negative means obligations exceed income (a shortfall).
  residualMonthlyCents: number;
  // Floored tenths of months the savings cover total obligations at the
  // current burn rate (98 = 9.8 months). Null when there is no burn.
  cushionMonthsX10: number | null;
}

// F3: D.6 affordability assessment on a take-home-pay basis.
export function assessAffordability(raw: unknown): AffordabilityResult {
  const inputs = affordabilityInputSchema.parse(raw);
  const total =
    inputs.debtsMonthlyCents +
    inputs.expensesMonthlyCents +
    inputs.proposedHousingMonthlyCents;
  return {
    cushionMonthsX10:
      total === 0 ? null : divFloor(inputs.savingsCents * 10, total),
    housingRatioBps: divRoundHalfUp(
      inputs.proposedHousingMonthlyCents * 10_000,
      inputs.takeHomeMonthlyCents,
    ),
    inputs,
    obligationsRatioBps: divRoundHalfUp(
      total * 10_000,
      inputs.takeHomeMonthlyCents,
    ),
    residualMonthlyCents: inputs.takeHomeMonthlyCents - total,
    totalMonthlyObligations: total as CentsMonthly,
  };
}
