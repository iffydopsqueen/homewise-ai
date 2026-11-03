import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { compareProperties } from "../../lib/calc/compare";
import { runWhatIf } from "../../lib/calc/whatIf";

// Hand-computed 0%-rate fixtures.
// A: $300k, $60k down -> P&I 24M/360 = 66,666.67 -> 66,667; tax 10,000;
// other Lawn 5,000 + "lawn " 3,000. Total A = 84,667.
// B: $300k, $30k down -> P&I 27M/360 = 75,000; tax 20,000; HOA 5,000;
// other LAWN 9,000 + Gym 7,000. Total B = 116,000.
const INPUT_A = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 120_000,
  downPaymentCents: 6_000_000,
  hoaMonthlyCents: 0,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [
    { label: "Lawn", monthly: 5_000 },
    { label: "lawn ", monthly: 3_000 },
  ],
  termMonths: 360,
} as const;

const INPUT_B = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 240_000,
  downPaymentCents: 3_000_000,
  hoaMonthlyCents: 5_000,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [
    { label: "LAWN", monthly: 9_000 },
    { label: "Gym", monthly: 7_000 },
  ],
  termMonths: 360,
} as const;

describe("compareProperties (F4)", () => {
  it("computes hand-verified fixed deltas and totals", () => {
    const r = compareProperties(
      structuredClone(INPUT_A),
      structuredClone(INPUT_B),
    );
    expect(r.a.totalMonthly).toBe(84_667);
    expect(r.b.totalMonthly).toBe(116_000);
    const byKey = Object.fromEntries(r.fixed.map((f) => [f.key, f.delta]));
    expect(byKey).toEqual({
      hoa: 5_000,
      insurance: 0,
      maintenance: 0,
      pmi: 0,
      principalAndInterest: 8_333,
      propertyTax: 10_000,
    });
    expect(r.deltaMonthly).toBe(31_333);
    expect(r.deltaAnnual).toBe(31_333 * 12);
    expect(r.deltaUpfront).toBe(-3_000_000);
  });

  it("aggregates duplicate labels before matching", () => {
    const r = compareProperties(
      structuredClone(INPUT_A),
      structuredClone(INPUT_B),
    );
    const lawn = r.otherLines.find((l) => l.key === "lawn");
    expect(lawn).toMatchObject({
      a: 8_000,
      b: 9_000,
      delta: 1_000,
      labelA: "Lawn",
      labelB: "LAWN",
      status: "matched",
    });
  });

  it("reports unmatched items as additions or removals", () => {
    const r = compareProperties(
      structuredClone(INPUT_A),
      structuredClone(INPUT_B),
    );
    expect(r.otherLines.find((l) => l.key === "gym")).toMatchObject({
      a: 0,
      b: 7_000,
      delta: 7_000,
      labelA: null,
      labelB: "Gym",
      status: "added",
    });
    const flipped = compareProperties(
      structuredClone(INPUT_B),
      structuredClone(INPUT_A),
    );
    expect(flipped.otherLines.find((l) => l.key === "gym")).toMatchObject({
      a: 7_000,
      b: 0,
      delta: -7_000,
      status: "removed",
    });
  });

  it("matches labels across internal whitespace differences", () => {
    const r = compareProperties(
      {
        ...structuredClone(INPUT_A),
        otherCosts: [{ label: "Lawn  care", monthly: 5_000 }],
      },
      {
        ...structuredClone(INPUT_B),
        otherCosts: [{ label: "lawn care", monthly: 7_000 }],
      },
    );
    expect(r.otherLines).toHaveLength(1);
    expect(r.otherLines[0]).toMatchObject({
      a: 5_000,
      b: 7_000,
      delta: 2_000,
      key: "lawn care",
      labelA: "Lawn  care",
      labelB: "lawn care",
      status: "matched",
    });
  });

  it("returns zero deltas for identical properties", () => {
    const r = compareProperties(
      structuredClone(INPUT_A),
      structuredClone(INPUT_A),
    );
    expect(r.deltaMonthly).toBe(0);
    expect(r.deltaAnnual).toBe(0);
    expect(r.deltaUpfront).toBe(0);
    expect(r.fixed.every((f) => f.delta === 0)).toBe(true);
    expect(r.otherLines.every((l) => l.delta === 0)).toBe(true);
    expect(r.assumptionsDiffer).toBe(false);
  });

  it("flags differing assumption sets", () => {
    const r = compareProperties(structuredClone(INPUT_A), {
      ...structuredClone(INPUT_A),
      assumptionSetId: "optimistic-taxes",
    });
    expect(r.assumptionsDiffer).toBe(true);
  });

  it("rejects a missing or malformed side", () => {
    expect(() => compareProperties(structuredClone(INPUT_A), undefined)).toThrow(
      ZodError,
    );
    expect(() => compareProperties(null, structuredClone(INPUT_B))).toThrow(
      ZodError,
    );
  });
});

describe("runWhatIf (F5)", () => {
  it("returns the base unchanged for empty overrides", () => {
    const r = runWhatIf(structuredClone(INPUT_A), {});
    expect(r.scenario).toEqual(r.base);
    expect(r.deltaMonthly).toBe(0);
    expect(r.deltaAnnual).toBe(0);
    expect(r.deltaUpfront).toBe(0);
  });

  it("moves only tax and totals on a tax-only override", () => {
    const r = runWhatIf(structuredClone(INPUT_A), { annualTaxCents: 240_000 });
    expect(r.scenario.monthlyTax).toBe(20_000);
    expect(r.scenario.monthlyPI).toBe(r.base.monthlyPI);
    expect(r.scenario.monthlyInsurance).toBe(r.base.monthlyInsurance);
    expect(r.scenario.monthlyHoa).toBe(r.base.monthlyHoa);
    expect(r.scenario.monthlyMaintenance).toBe(r.base.monthlyMaintenance);
    expect(r.scenario.monthlyPMI).toBe(r.base.monthlyPMI);
    expect(r.scenario.otherLines).toEqual(r.base.otherLines);
    expect(r.deltaMonthly).toBe(10_000);
    expect(r.deltaAnnual).toBe(120_000);
    expect(r.deltaUpfront).toBe(0);
  });

  it("moves only rate-dependent components on a rate override", () => {
    const r = runWhatIf(structuredClone(INPUT_A), { annualRateMilliPct: 6000 });
    expect(r.scenario.monthlyPI).toBeGreaterThan(r.base.monthlyPI);
    expect(r.scenario.monthlyTax).toBe(r.base.monthlyTax);
    expect(r.scenario.inputs.downPaymentCents).toBe(
      r.base.inputs.downPaymentCents,
    );
    expect(r.scenario.inputs.termMonths).toBe(r.base.inputs.termMonths);
  });

  it("removes the mortgage when down payment reaches the price", () => {
    const r = runWhatIf(structuredClone(INPUT_A), {
      downPaymentCents: 30_000_000,
    });
    expect(r.scenario.monthlyPI).toBe(0);
    expect(r.deltaUpfront).toBe(24_000_000);
    expect(r.deltaMonthly).toBeLessThan(0);
  });

  it("validates overrides independently of a valid base", () => {
    expect(() =>
      runWhatIf(structuredClone(INPUT_A), { annualTaxCents: -1 }),
    ).toThrow(ZodError);
    expect(() =>
      runWhatIf(structuredClone(INPUT_A), { termMonths: 180 }),
    ).toThrow(ZodError);
    expect(() =>
      runWhatIf(structuredClone(INPUT_A), { bogus: 1 }),
    ).toThrow(ZodError);
  });

  it("rejects an invalid base", () => {
    expect(() => runWhatIf(undefined, {})).toThrow(ZodError);
  });
});
