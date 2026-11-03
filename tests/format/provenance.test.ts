import { describe, expect, it } from "vitest";

import {
  AFFORDABILITY_DISPLAY,
  TRUE_COST_DISPLAY,
  compareDeltaDisplay,
  whatIfDeltaDisplay,
} from "../../lib/format/provenance";

describe("TRUE_COST_DISPLAY", () => {
  it("covers exactly the displayed true-cost figure fields", () => {
    expect(Object.keys(TRUE_COST_DISPLAY).sort()).toEqual(
      [
        "monthlyPI",
        "monthlyTax",
        "monthlyInsurance",
        "monthlyHoa",
        "monthlyMaintenance",
        "monthlyPMI",
        "monthlyOther",
        "otherLines",
        "totalMonthly",
        "totalAnnual",
        "estimatedUpfrontCashCents",
      ].sort(),
    );
  });

  it("marks computed fields calculated with all contributing inputs", () => {
    expect(TRUE_COST_DISPLAY.monthlyPI).toEqual({
      kind: "calculated",
      sources: [
        { scope: "input", key: "homePriceCents" },
        { scope: "input", key: "downPaymentCents" },
        { scope: "input", key: "annualRateMilliPct" },
        { scope: "input", key: "termMonths" },
      ],
    });
    expect(TRUE_COST_DISPLAY.monthlyMaintenance).toEqual({
      kind: "calculated",
      sources: [
        { scope: "input", key: "homePriceCents" },
        { scope: "input", key: "maintenanceRateBps" },
      ],
    });
    expect(TRUE_COST_DISPLAY.totalMonthly).toEqual({
      kind: "calculated",
      sources: [
        { scope: "result", key: "monthlyPI" },
        { scope: "result", key: "monthlyTax" },
        { scope: "result", key: "monthlyInsurance" },
        { scope: "result", key: "monthlyHoa" },
        { scope: "result", key: "monthlyMaintenance" },
        { scope: "result", key: "monthlyPMI" },
        { scope: "result", key: "monthlyOther" },
      ],
    });
    expect(TRUE_COST_DISPLAY.totalAnnual).toEqual({
      kind: "calculated",
      sources: [{ scope: "result", key: "totalMonthly" }],
    });
    expect(TRUE_COST_DISPLAY.estimatedUpfrontCashCents).toEqual({
      kind: "calculated",
      sources: [
        { scope: "input", key: "downPaymentCents" },
        { scope: "input", key: "closingCostsCents" },
      ],
    });
  });

  it("marks verbatim echoes as input with no subtext sources", () => {
    for (const key of ["monthlyHoa", "monthlyPMI", "otherLines"]) {
      expect(TRUE_COST_DISPLAY[key]).toEqual({ kind: "input", sources: [] });
    }
  });
});

describe("AFFORDABILITY_DISPLAY", () => {
  it("covers exactly the displayed affordability figure fields", () => {
    expect(Object.keys(AFFORDABILITY_DISPLAY).sort()).toEqual(
      [
        "totalMonthlyObligations",
        "housingRatioBps",
        "obligationsRatioBps",
        "residualMonthlyCents",
        "cushionMonthsX10",
      ].sort(),
    );
  });

  it("lists every contributing input per figure", () => {
    expect(AFFORDABILITY_DISPLAY).toEqual({
      totalMonthlyObligations: {
        kind: "calculated",
        sources: [
          { scope: "input", key: "debtsMonthlyCents" },
          { scope: "input", key: "expensesMonthlyCents" },
          { scope: "input", key: "proposedHousingMonthlyCents" },
        ],
      },
      housingRatioBps: {
        kind: "calculated",
        sources: [
          { scope: "input", key: "proposedHousingMonthlyCents" },
          { scope: "input", key: "takeHomeMonthlyCents" },
        ],
      },
      obligationsRatioBps: {
        kind: "calculated",
        sources: [
          { scope: "result", key: "totalMonthlyObligations" },
          { scope: "input", key: "takeHomeMonthlyCents" },
        ],
      },
      residualMonthlyCents: {
        kind: "calculated",
        sources: [
          { scope: "input", key: "takeHomeMonthlyCents" },
          { scope: "result", key: "totalMonthlyObligations" },
        ],
      },
      cushionMonthsX10: {
        kind: "calculated",
        sources: [
          { scope: "input", key: "savingsCents" },
          { scope: "result", key: "totalMonthlyObligations" },
        ],
      },
    });
  });
});

describe("delta display descriptors", () => {
  it("marks compare deltas calculated with both sides as sources", () => {
    expect(compareDeltaDisplay("totalMonthly")).toEqual({
      kind: "calculated",
      sources: [
        { scope: "propertyA", key: "totalMonthly" },
        { scope: "propertyB", key: "totalMonthly" },
      ],
    });
  });

  it("marks what-if deltas calculated with base and scenario as sources", () => {
    expect(whatIfDeltaDisplay("totalMonthly")).toEqual({
      kind: "calculated",
      sources: [
        { scope: "base", key: "totalMonthly" },
        { scope: "scenario", key: "totalMonthly" },
      ],
    });
  });
});
