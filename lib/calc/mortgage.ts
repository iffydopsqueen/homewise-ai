import { monthlyPaymentInputSchema } from "../validation/calc";
import { divRoundHalfUp, roundHalfUpPositive, type CentsMonthly } from "./money";

// F1: D.1 standard amortizing-loan monthly payment, rounded half-up to cents.
// Deterministic per input. Zero rate takes the exact integer path; r > 0 uses
// IEEE-754 doubles for the exponentiation (inherently transcendental) with the
// documented R2 rule. Exactness of the float step is locked by known-answer
// tests, not by assertion.
export function monthlyPayment(raw: unknown): CentsMonthly {
  const { principalCents, annualRateMilliPct, termMonths } =
    monthlyPaymentInputSchema.parse(raw);
  if (principalCents === 0) {
    return 0 as CentsMonthly;
  }
  const monthlyRate = annualRateMilliPct / 100_000 / 12;
  if (monthlyRate === 0) {
    return divRoundHalfUp(principalCents, termMonths) as CentsMonthly;
  }
  const growth = Math.pow(1 + monthlyRate, termMonths);
  return roundHalfUpPositive(
    (principalCents * monthlyRate * growth) / (growth - 1),
  ) as CentsMonthly;
}
