import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { assessAffordability } from "../../lib/calc/affordability";

describe("assessAffordability (F3)", () => {
  it("computes the hand-verified case exactly", () => {
    // $8k take-home; $600 debts; $2,500 expenses; $50k savings; $2k proposed.
    const r = assessAffordability({
      debtsMonthlyCents: 60_000,
      expensesMonthlyCents: 250_000,
      proposedHousingMonthlyCents: 200_000,
      savingsCents: 5_000_000,
      takeHomeMonthlyCents: 800_000,
    });
    expect(r.totalMonthlyObligations).toBe(510_000);
    expect(r.housingRatioBps).toBe(2500); // 25%
    expect(r.obligationsRatioBps).toBe(6375); // 63.75%
    expect(r.residualMonthlyCents).toBe(290_000);
    expect(r.cushionMonthsX10).toBe(98); // floor(50M/510k) = 9.8 months
  });

  it("reports a shortfall as a valid negative residual", () => {
    const r = assessAffordability({
      debtsMonthlyCents: 300_000,
      expensesMonthlyCents: 200_000,
      proposedHousingMonthlyCents: 100_000,
      savingsCents: 100_000,
      takeHomeMonthlyCents: 500_000,
    });
    expect(r.totalMonthlyObligations).toBe(600_000);
    expect(r.residualMonthlyCents).toBe(-100_000);
    expect(r.obligationsRatioBps).toBe(12_000); // 120%
    expect(r.housingRatioBps).toBe(2000);
    expect(r.cushionMonthsX10).toBe(1); // floor(1M/600k)
  });

  it("accepts a zero proposed cost as maximum headroom", () => {
    const r = assessAffordability({
      debtsMonthlyCents: 0,
      expensesMonthlyCents: 0,
      proposedHousingMonthlyCents: 0,
      savingsCents: 0,
      takeHomeMonthlyCents: 500_000,
    });
    expect(r.housingRatioBps).toBe(0);
    expect(r.residualMonthlyCents).toBe(500_000);
  });

  it("returns a null cushion when there is no burn rate", () => {
    const r = assessAffordability({
      debtsMonthlyCents: 0,
      expensesMonthlyCents: 0,
      proposedHousingMonthlyCents: 0,
      savingsCents: 100_000,
      takeHomeMonthlyCents: 500_000,
    });
    expect(r.totalMonthlyObligations).toBe(0);
    expect(r.cushionMonthsX10).toBeNull();
  });

  it("returns a zero cushion for zero savings with positive burn", () => {
    const r = assessAffordability({
      debtsMonthlyCents: 100_000,
      expensesMonthlyCents: 100_000,
      proposedHousingMonthlyCents: 100_000,
      savingsCents: 0,
      takeHomeMonthlyCents: 500_000,
    });
    expect(r.totalMonthlyObligations).toBe(300_000);
    expect(r.residualMonthlyCents).toBe(200_000);
    expect(r.cushionMonthsX10).toBe(0);
  });

  it("emits ratios only: no thresholds, verdicts, or approvals", () => {
    const r = assessAffordability({
      debtsMonthlyCents: 0,
      expensesMonthlyCents: 0,
      proposedHousingMonthlyCents: 100_000,
      savingsCents: 0,
      takeHomeMonthlyCents: 500_000,
    });
    expect(Object.keys(r).sort()).toEqual(
      [
        "cushionMonthsX10",
        "housingRatioBps",
        "inputs",
        "obligationsRatioBps",
        "residualMonthlyCents",
        "totalMonthlyObligations",
      ].sort(),
    );
  });

  it("rejects zero or negative income without dividing", () => {
    const valid = {
      debtsMonthlyCents: 0,
      expensesMonthlyCents: 0,
      proposedHousingMonthlyCents: 0,
      savingsCents: 0,
      takeHomeMonthlyCents: 500_000,
    };
    expect(() =>
      assessAffordability({ ...valid, takeHomeMonthlyCents: 0 }),
    ).toThrow(ZodError);
    expect(() =>
      assessAffordability({ ...valid, takeHomeMonthlyCents: -5 }),
    ).toThrow(ZodError);
  });

  it("rejects negatives, NaN, and unknown keys", () => {
    const valid = {
      debtsMonthlyCents: 0,
      expensesMonthlyCents: 0,
      proposedHousingMonthlyCents: 0,
      savingsCents: 0,
      takeHomeMonthlyCents: 500_000,
    };
    expect(() =>
      assessAffordability({ ...valid, debtsMonthlyCents: -1 }),
    ).toThrow(ZodError);
    expect(() =>
      assessAffordability({ ...valid, savingsCents: Number.NaN }),
    ).toThrow(ZodError);
    expect(() =>
      assessAffordability({ ...valid, takeHomeMonthlyCents: 1.5 }),
    ).toThrow(ZodError);
    expect(() => assessAffordability({ ...valid, bogus: 1 })).toThrow(
      ZodError,
    );
  });
});
