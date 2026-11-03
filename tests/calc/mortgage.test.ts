import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { monthlyPayment } from "../../lib/calc/mortgage";

// Independent sanity check (NOT the source of truth): simulate paying M every
// month against a float balance. Tolerance is the documented worst-case bound
// for per-payment half-cent rounding error accumulation over n payments:
// 0.5 * ((1+r)^n - 1)/r, plus 1 cent of float slop. A wrong formula misses by
// far more than this; exact correctness rests on the known-answer tests.
function amortizationBound(annualRateMilliPct: number, termMonths: number): number {
  const r = annualRateMilliPct / 100_000 / 12;
  const growth = Math.pow(1 + r, termMonths);
  return Math.ceil((0.5 * (growth - 1)) / r) + 1;
}

function simulateBalance(
  principalCents: number,
  annualRateMilliPct: number,
  termMonths: number,
  paymentCents: number,
): number {
  const r = annualRateMilliPct / 100_000 / 12;
  let balance = principalCents;
  for (let i = 0; i < termMonths; i += 1) {
    balance = balance * (1 + r) - paymentCents;
  }
  return balance;
}

describe("monthlyPayment (F1)", () => {
  it("matches the known answer: $300k at 6% for 30 years -> $1,798.65", () => {
    expect(
      monthlyPayment({
        annualRateMilliPct: 6000,
        principalCents: 30_000_000,
        termMonths: 360,
      }),
    ).toBe(179_865);
  });

  it("matches the known answer: $200k at 5% for 30 years -> $1,073.64", () => {
    expect(
      monthlyPayment({
        annualRateMilliPct: 5000,
        principalCents: 20_000_000,
        termMonths: 360,
      }),
    ).toBe(107_364);
  });

  it("handles zero interest with exact division", () => {
    expect(
      monthlyPayment({
        annualRateMilliPct: 0,
        principalCents: 12_000_000,
        termMonths: 120,
      }),
    ).toBe(100_000);
    expect(
      monthlyPayment({
        annualRateMilliPct: 0,
        principalCents: 10_000_000,
        termMonths: 120,
      }),
    ).toBe(83_333);
  });

  it("rounds a dust principal at zero interest down to zero", () => {
    expect(
      monthlyPayment({
        annualRateMilliPct: 0,
        principalCents: 1,
        termMonths: 360,
      }),
    ).toBe(0);
  });

  it("returns zero for zero principal", () => {
    expect(
      monthlyPayment({
        annualRateMilliPct: 6000,
        principalCents: 0,
        termMonths: 360,
      }),
    ).toBe(0);
  });

  it("is deterministic", () => {
    const input = {
      annualRateMilliPct: 6500,
      principalCents: 32_000_000,
      termMonths: 360,
    };
    expect(monthlyPayment(input)).toBe(monthlyPayment(structuredClone(input)));
  });

  it("handles a tiny nonzero rate near the zero-rate value", () => {
    // 1 milli-percent = 0.001% annual. The payment must sit at or above the
    // exact zero-rate value (33,333): positive interest cannot lower a
    // payment, and half-up rounding is monotone. The simulation bound is the
    // same documented worst-case argument, which tightens to ~182c here,
    // making this a stricter check than the 6% case.
    const zeroRate = monthlyPayment({
      annualRateMilliPct: 0,
      principalCents: 12_000_000,
      termMonths: 360,
    });
    expect(zeroRate).toBe(33_333);
    const payment = monthlyPayment({
      annualRateMilliPct: 1,
      principalCents: 12_000_000,
      termMonths: 360,
    });
    expect(payment).toBeGreaterThanOrEqual(zeroRate);
    const bound = amortizationBound(1, 360);
    expect(bound).toBeLessThanOrEqual(200);
    expect(
      Math.abs(simulateBalance(12_000_000, 1, 360, payment)),
    ).toBeLessThanOrEqual(bound);
  });

  it("passes the amortization sanity check on both known-answer loans", () => {
    for (const [principal, rate] of [
      [30_000_000, 6000],
      [20_000_000, 5000],
    ] as const) {
      const payment = monthlyPayment({
        annualRateMilliPct: rate,
        principalCents: principal,
        termMonths: 360,
      });
      const bound = amortizationBound(rate, 360);
      expect(bound).toBeLessThanOrEqual(1000);
      expect(
        Math.abs(simulateBalance(principal, rate, 360, payment)),
      ).toBeLessThanOrEqual(bound);
    }
  });

  it("rejects invalid terms", () => {
    for (const termMonths of [0, -12, 11, 481, 360.5, Number.NaN]) {
      expect(() =>
        monthlyPayment({
          annualRateMilliPct: 6000,
          principalCents: 10_000_000,
          termMonths,
        }),
      ).toThrow(ZodError);
    }
  });

  it("rejects invalid rates and principals", () => {
    const valid = {
      annualRateMilliPct: 6000,
      principalCents: 10_000_000,
      termMonths: 360,
    };
    expect(() =>
      monthlyPayment({ ...valid, annualRateMilliPct: -1 }),
    ).toThrow(ZodError);
    expect(() =>
      monthlyPayment({ ...valid, annualRateMilliPct: 100_001 }),
    ).toThrow(ZodError);
    expect(() =>
      monthlyPayment({ ...valid, annualRateMilliPct: 6.5 }),
    ).toThrow(ZodError);
    expect(() => monthlyPayment({ ...valid, principalCents: -1 })).toThrow(
      ZodError,
    );
    expect(() =>
      monthlyPayment({ ...valid, principalCents: Number.NaN }),
    ).toThrow(ZodError);
    expect(() =>
      monthlyPayment({ ...valid, principalCents: 1_000_000_001 }),
    ).toThrow(ZodError);
  });

  it("rejects missing fields and unknown keys", () => {
    expect(() => monthlyPayment({})).toThrow(ZodError);
    expect(() => monthlyPayment(undefined)).toThrow(ZodError);
    expect(() =>
      monthlyPayment({
        annualRateMilliPct: 0,
        principalCents: 1,
        termMonths: 12,
        bogus: 1,
      }),
    ).toThrow(ZodError);
  });
});
