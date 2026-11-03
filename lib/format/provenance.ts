// Display-provenance mapping (Phase 6, step 1). Pure data answering, per
// result field: which badge to show, and which contributors feed its source
// subtext so no calculated figure implies a single input when it depends on
// several. "Calculated" is UI-only vocabulary; the API provenance contract
// is untouched.
//
// Rules:
// - kind "calculated": engine-computed outputs (P&I, converted monthlies,
//   maintenance, summed totals, annual, upfront sum, ratios, residual,
//   cushion, every delta). sources lists ALL direct parents, each as
//   { scope, key } resolving to a value the UI already holds.
// - kind "input": verbatim echoes (HOA, PMI, other-cost lines). The badge
//   comes from the API provenance map; no subtext needed, so sources is [].
// - Scopes: "input" (request figures), "result" (same result object),
//   "propertyA"/"propertyB" (compare sides), "base"/"scenario" (what-if).
// - monthlyOther points at "otherLines": the UI renders "sum of N itemized
//   lines". Upfront lists closing costs too; the UI omits it when closing
//   was not supplied.

export type DisplayKind = "calculated" | "input";

export type DisplayScope =
  | "input"
  | "result"
  | "propertyA"
  | "propertyB"
  | "base"
  | "scenario";

export interface DisplaySource {
  scope: DisplayScope;
  key: string;
}

export interface DisplayProvenance {
  kind: DisplayKind;
  sources: readonly DisplaySource[];
}

const inp = (key: string): DisplaySource => ({ scope: "input", key });
const res = (key: string): DisplaySource => ({ scope: "result", key });

const inputOnly: DisplayProvenance = { kind: "input", sources: [] };

function calc(...sources: DisplaySource[]): DisplayProvenance {
  return { kind: "calculated", sources };
}

export const TRUE_COST_DISPLAY: Record<string, DisplayProvenance> = {
  monthlyPI: calc(
    inp("homePriceCents"),
    inp("downPaymentCents"),
    inp("annualRateMilliPct"),
    inp("termMonths"),
  ),
  monthlyTax: calc(inp("annualTaxCents")),
  monthlyInsurance: calc(inp("annualInsuranceCents")),
  monthlyHoa: inputOnly,
  monthlyMaintenance: calc(inp("homePriceCents"), inp("maintenanceRateBps")),
  monthlyPMI: inputOnly,
  monthlyOther: calc(res("otherLines")),
  otherLines: inputOnly,
  totalMonthly: calc(
    res("monthlyPI"),
    res("monthlyTax"),
    res("monthlyInsurance"),
    res("monthlyHoa"),
    res("monthlyMaintenance"),
    res("monthlyPMI"),
    res("monthlyOther"),
  ),
  totalAnnual: calc(res("totalMonthly")),
  estimatedUpfrontCashCents: calc(
    inp("downPaymentCents"),
    inp("closingCostsCents"),
  ),
};

export const AFFORDABILITY_DISPLAY: Record<string, DisplayProvenance> = {
  totalMonthlyObligations: calc(
    inp("debtsMonthlyCents"),
    inp("expensesMonthlyCents"),
    inp("proposedHousingMonthlyCents"),
  ),
  housingRatioBps: calc(
    inp("proposedHousingMonthlyCents"),
    inp("takeHomeMonthlyCents"),
  ),
  obligationsRatioBps: calc(
    res("totalMonthlyObligations"),
    inp("takeHomeMonthlyCents"),
  ),
  residualMonthlyCents: calc(
    inp("takeHomeMonthlyCents"),
    res("totalMonthlyObligations"),
  ),
  cushionMonthsX10: calc(
    inp("savingsCents"),
    res("totalMonthlyObligations"),
  ),
};

export function compareDeltaDisplay(key: string): DisplayProvenance {
  return {
    kind: "calculated",
    sources: [
      { scope: "propertyA", key },
      { scope: "propertyB", key },
    ],
  };
}

export function whatIfDeltaDisplay(key: string): DisplayProvenance {
  return {
    kind: "calculated",
    sources: [
      { scope: "base", key },
      { scope: "scenario", key },
    ],
  };
}
