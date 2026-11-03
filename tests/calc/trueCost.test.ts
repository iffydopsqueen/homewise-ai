import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { calculateTrueCost } from "../../lib/calc/trueCost";

// Fully hand-computed fixture: $360k price, $60k down, 0% / 360mo.
// P&I = 30,000,000 / 360 = 83,333.33 -> 83,333. Tax $1,200/yr -> 10,000/mo.
const BASE = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 120_000,
  downPaymentCents: 6_000_000,
  hoaMonthlyCents: 0,
  homePriceCents: 36_000_000,
  maintenanceRateBps: 0,
  otherCosts: [],
  termMonths: 360,
} as const;

describe("calculateTrueCost (F2)", () => {
  it("computes the hand-verified base case exactly", () => {
    const r = calculateTrueCost(structuredClone(BASE));
    expect(r.monthlyPI).toBe(83_333);
    expect(r.monthlyTax).toBe(10_000);
    expect(r.monthlyInsurance).toBe(0);
    expect(r.monthlyHoa).toBe(0);
    expect(r.monthlyMaintenance).toBe(0);
    expect(r.monthlyPMI).toBe(0);
    expect(r.monthlyOther).toBe(0);
    expect(r.totalMonthly).toBe(93_333);
    expect(r.totalAnnual).toBe(93_333 * 12);
    expect(r.estimatedUpfrontCashCents).toBe(6_000_000);
  });

  it("reconciles totals as exact sums of rounded components", () => {
    const r = calculateTrueCost({
      ...structuredClone(BASE),
      annualInsuranceCents: 180_000, // -> 15,000/mo
      hoaMonthlyCents: 25_000,
      maintenanceRateBps: 100, // 1% of $360k/yr -> 30,000/mo
      otherCosts: [{ label: "Pest control", monthly: 5_000 }],
      pmiMonthlyCents: 12_000,
    });
    expect(r.monthlyMaintenance).toBe(30_000);
    expect(
      r.monthlyPI +
        r.monthlyTax +
        r.monthlyInsurance +
        r.monthlyHoa +
        r.monthlyMaintenance +
        r.monthlyPMI +
        r.monthlyOther,
    ).toBe(r.totalMonthly);
    expect(r.totalMonthly * 12).toBe(r.totalAnnual);
  });

  it("computes maintenance as price x bps without float drift", () => {
    const r = calculateTrueCost({
      ...structuredClone(BASE),
      homePriceCents: 30_000_000,
      maintenanceRateBps: 100,
    });
    expect(r.monthlyMaintenance).toBe(25_000); // 3e9 / 120000 exactly
  });

  it("adds provided closing costs to upfront cash", () => {
    const r = calculateTrueCost({
      ...structuredClone(BASE),
      closingCostsCents: 900_000,
    });
    expect(r.closingCostsProvided).toBe(true);
    expect(r.estimatedUpfrontCashCents).toBe(6_900_000);
    expect(r.warnings).not.toContain("closing-costs-not-provided");
  });

  it("warns when closing costs are absent instead of silently using zero", () => {
    const r = calculateTrueCost(structuredClone(BASE));
    expect(r.closingCostsProvided).toBe(false);
    expect(r.estimatedUpfrontCashCents).toBe(6_000_000);
    expect(r.warnings).toContain("closing-costs-not-provided");
  });

  it("keeps PMI on its own labeled line, out of the misc total", () => {
    const r = calculateTrueCost({
      ...structuredClone(BASE),
      pmiMonthlyCents: 15_000,
    });
    expect(r.pmiProvided).toBe(true);
    expect(r.monthlyPMI).toBe(15_000);
    expect(r.monthlyOther).toBe(0);
    expect(r.totalMonthly).toBe(93_333 + 15_000);
  });

  it("echoes itemized other-cost lines with user labels", () => {
    const r = calculateTrueCost({
      ...structuredClone(BASE),
      otherCosts: [
        { label: "Pest control", monthly: 5_000 },
        { label: "Alarm", monthly: 3_000 },
      ],
    });
    expect(r.otherLines).toEqual([
      { label: "Pest control", monthly: 5_000 },
      { label: "Alarm", monthly: 3_000 },
    ]);
    expect(r.monthlyOther).toBe(8_000);
  });

  it("flags zero tax, HOA, and maintenance for confirmation", () => {
    const r = calculateTrueCost({
      ...structuredClone(BASE),
      annualTaxCents: 0,
    });
    expect(r.warnings).toEqual([
      "closing-costs-not-provided",
      "zero-property-tax-confirm",
      "zero-hoa-confirm",
      "zero-maintenance-confirm",
    ]);
  });

  it("does not warn on zero insurance (spec asymmetry, documented)", () => {
    const r = calculateTrueCost(structuredClone(BASE));
    expect(r.monthlyInsurance).toBe(0);
    expect(r.warnings).toEqual([
      "closing-costs-not-provided",
      "zero-hoa-confirm",
      "zero-maintenance-confirm",
    ]);
  });

  it("treats down payment equal to or above price as no mortgage", () => {
    const equal = calculateTrueCost({
      ...structuredClone(BASE),
      downPaymentCents: 36_000_000,
    });
    expect(equal.monthlyPI).toBe(0);
    expect(equal.totalMonthly).toBe(10_000);
    const above = calculateTrueCost({
      ...structuredClone(BASE),
      downPaymentCents: 40_000_000,
    });
    expect(above.monthlyPI).toBe(0);
  });

  it("stays exact at maximum-scale inputs", () => {
    const r = calculateTrueCost({
      annualInsuranceCents: 1_000_000_000,
      annualRateMilliPct: 100_000,
      annualTaxCents: 1_000_000_000,
      closingCostsCents: 1_000_000_000,
      downPaymentCents: 0,
      hoaMonthlyCents: 1_000_000_000,
      homePriceCents: 1_000_000_000,
      maintenanceRateBps: 10_000,
      otherCosts: Array.from({ length: 100 }, (_, i) => ({
        label: `line ${i}`,
        monthly: 1_000_000_000,
      })),
      pmiMonthlyCents: 1_000_000_000,
      termMonths: 12,
    });
    // Hand-verified exact components at the cap.
    expect(r.monthlyTax).toBe(83_333_333); // 1e9 / 12 = 83,333,333.33
    expect(r.monthlyInsurance).toBe(83_333_333);
    expect(r.monthlyMaintenance).toBe(83_333_333); // 1e13 / 120000
    expect(r.monthlyOther).toBe(100_000_000_000); // 100 x 1e9
    expect(r.estimatedUpfrontCashCents).toBe(1_000_000_000);
    expect(r.warnings).toEqual([]);
    for (const value of [
      r.monthlyPI,
      r.monthlyTax,
      r.monthlyInsurance,
      r.monthlyHoa,
      r.monthlyMaintenance,
      r.monthlyPMI,
      r.monthlyOther,
      r.totalMonthly,
      r.totalAnnual,
      r.estimatedUpfrontCashCents,
    ]) {
      expect(Number.isSafeInteger(value)).toBe(true);
    }
    expect(
      r.monthlyPI +
        r.monthlyTax +
        r.monthlyInsurance +
        r.monthlyHoa +
        r.monthlyMaintenance +
        r.monthlyPMI +
        r.monthlyOther,
    ).toBe(r.totalMonthly);
    expect(r.totalMonthly * 12).toBe(r.totalAnnual);
  });

  it("is deterministic", () => {
    expect(calculateTrueCost(structuredClone(BASE))).toEqual(
      calculateTrueCost(structuredClone(BASE)),
    );
  });

  it("rejects invalid money, rates, labels, and shapes", () => {
    expect(() =>
      calculateTrueCost({ ...structuredClone(BASE), homePriceCents: 0 }),
    ).toThrow(ZodError);
    expect(() =>
      calculateTrueCost({ ...structuredClone(BASE), annualTaxCents: -1 }),
    ).toThrow(ZodError);
    expect(() =>
      calculateTrueCost({ ...structuredClone(BASE), closingCostsCents: -5 }),
    ).toThrow(ZodError);
    expect(() =>
      calculateTrueCost({
        ...structuredClone(BASE),
        otherCosts: [{ label: "   ", monthly: 100 }],
      }),
    ).toThrow(ZodError);
    expect(() =>
      calculateTrueCost({
        ...structuredClone(BASE),
        otherCosts: [{ label: "x".repeat(61), monthly: 100 }],
      }),
    ).toThrow(ZodError);
    expect(() =>
      calculateTrueCost({
        ...structuredClone(BASE),
        otherCosts: Array.from({ length: 101 }, (_, i) => ({
          label: `line ${i}`,
          monthly: 100,
        })),
      }),
    ).toThrow(ZodError);
    expect(() =>
      calculateTrueCost({ ...structuredClone(BASE), bogus: 1 }),
    ).toThrow(ZodError);
    expect(() => calculateTrueCost(undefined)).toThrow(ZodError);
  });
});
