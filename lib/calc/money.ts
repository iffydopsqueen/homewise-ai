// Integer-cents money discipline for the deterministic calculation engine.
//
// All money moves through the engine as integer cents; formatting to dollars
// happens only at display time. Monthly, annual, and one-time figures are
// branded so the type system rejects mixing them. Brands use Zod's own
// $brand shape (type-only import: no runtime dependency) so schema outputs
// and engine values share identical types.

import type { $brand } from "zod";

export type Cents = number & $brand<"Cents">;
export type CentsMonthly = number & $brand<"CentsMonthly">;
export type CentsAnnual = number & $brand<"CentsAnnual">;

// Upper bound per input figure: 1,000,000,000 cents = $10,000,000.
// Realistic first-time-buyer figures sit 1-2 orders of magnitude below this,
// so the cap never binds legitimate input. It exists to keep every engine
// intermediate far below Number.MAX_SAFE_INTEGER (2^53 ~= 9.007e15), making
// all integer steps exact. The largest is the affordability ratio numerator
// (total obligations x 10,000 <= 3e9 x 1e4 = 3e13, ~300x below 2^53), ahead
// of the maintenance product (price x rateBps <= 1e9 x 1e4 = 1e13).
// Note: Zod .int() alone cannot enforce this (2^53+1 passes Number.isInteger),
// so .max(MAX_CENTS) on every money schema is the load-bearing control.
export const MAX_CENTS = 1_000_000_000;

function assertDivOperands(numerator: number, denominator: number, fn: string): void {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError(`${fn}: numerator must be a non-negative safe integer`);
  }
  if (!Number.isSafeInteger(denominator) || denominator < 1) {
    throw new RangeError(`${fn}: denominator must be a positive safe integer`);
  }
}

function toSafeQuotient(quotient: bigint, fn: string): number {
  if (quotient > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${fn}: quotient exceeds MAX_SAFE_INTEGER`);
  }
  return Number(quotient);
}

// R1: exact half-up division for non-negative integers, via BigInt.
// floor((2n + d) / 2d) == floor(n/d + 1/2); BigInt division truncates, which
// is exact floor for non-negative operands. No floating point is involved,
// so no half-cent boundary can ever flip. Throws RangeError outside the
// validated domain or on an unsafe result.
export function divRoundHalfUp(numerator: number, denominator: number): number {
  assertDivOperands(numerator, denominator, "divRoundHalfUp");
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const quotient = (BigInt(2) * n + d) / (BigInt(2) * d);
  return toSafeQuotient(quotient, "divRoundHalfUp");
}

// Exact floor division with R1's identical domain contract. Used for the
// affordability cushion (complete tenths of months), where float
// division-then-floor could misbehave near integer boundaries at scale.
export function divFloor(numerator: number, denominator: number): number {
  assertDivOperands(numerator, denominator, "divFloor");
  const quotient = BigInt(numerator) / BigInt(denominator);
  return toSafeQuotient(quotient, "divFloor");
}

// R2: documented half-up rule for the single floating-point step (P&I).
// Requires a finite positive value; returns floor(x + 0.5). Nothing in the
// engine relies on undocumented Math.round behavior.
export function roundHalfUpPositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("roundHalfUpPositive: value must be finite and positive");
  }
  return Math.floor(value + 0.5);
}

export function monthlyFromAnnual(annualCents: CentsAnnual): CentsMonthly {
  return divRoundHalfUp(annualCents, 12) as CentsMonthly;
}
