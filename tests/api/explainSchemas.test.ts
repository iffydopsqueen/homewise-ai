import { describe, expect, it } from "vitest";

import { explainRequestSchema } from "../../lib/validation/explain";

// Explanation request-envelope tests. Envelopes carry engine inputs for
// server-side recomputation — never precomputed figures — and What-If
// stays rejected until its UI exists.

const AFFORDABILITY_DATA = {
  takeHomeMonthlyCents: 800_000,
  proposedHousingMonthlyCents: 200_000,
  debtsMonthlyCents: 60_000,
  expensesMonthlyCents: 250_000,
  savingsCents: 5_000_000,
};

const HOME_DATA = {
  homePriceCents: 36_000_000,
  downPaymentCents: 6_000_000,
  annualRateMilliPct: 0,
  termMonths: 360,
  annualTaxCents: 120_000,
  annualInsuranceCents: 0,
  hoaMonthlyCents: 0,
  maintenanceRateBps: 0,
  otherCosts: [],
};

describe("explainRequestSchema", () => {
  it("accepts an affordability request", () => {
    const parsed = explainRequestSchema.safeParse({
      workflow: "affordability",
      data: { ...AFFORDABILITY_DATA },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a true-cost request with defaulted provenance claims", () => {
    const parsed = explainRequestSchema.safeParse({
      workflow: "true-cost",
      data: { ...HOME_DATA },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.workflow === "true-cost") {
      expect(parsed.data.provenance).toEqual({});
    } else {
      throw new Error("test setup: expected true-cost parse");
    }
  });

  it("accepts a compare request with both sides", () => {
    const parsed = explainRequestSchema.safeParse({
      workflow: "compare",
      a: { data: { ...HOME_DATA } },
      b: { data: { ...HOME_DATA, downPaymentCents: 3_000_000 } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects what-if and unknown workflows", () => {
    for (const workflow of ["what-if", "dashboard", ""]) {
      const parsed = explainRequestSchema.safeParse({
        workflow,
        data: { ...AFFORDABILITY_DATA },
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("rejects unknown keys and invalid inputs", () => {
    const unknownKey = explainRequestSchema.safeParse({
      workflow: "affordability",
      data: { ...AFFORDABILITY_DATA },
      figures: { total: 1 },
    });
    expect(unknownKey.success).toBe(false);

    const badData = explainRequestSchema.safeParse({
      workflow: "true-cost",
      data: { ...HOME_DATA, homePriceCents: -1 },
    });
    expect(badData.success).toBe(false);

    const badSide = explainRequestSchema.safeParse({
      workflow: "compare",
      a: { data: { ...HOME_DATA } },
      b: { data: { ...HOME_DATA, termMonths: 999 } },
    });
    expect(badSide.success).toBe(false);
  });

  it("rejects non-object and missing inputs", () => {
    expect(explainRequestSchema.safeParse(null).success).toBe(false);
    expect(
      explainRequestSchema.safeParse({ workflow: "affordability" }).success,
    ).toBe(false);
  });
});
