import { describe, expect, it } from "vitest";

import {
  divFloor,
  divRoundHalfUp,
  monthlyFromAnnual,
  roundHalfUpPositive,
  type CentsAnnual,
} from "../../lib/calc/money";

describe("divRoundHalfUp (R1)", () => {
  it("rounds exact halves up", () => {
    expect(divRoundHalfUp(1, 2)).toBe(1);
    expect(divRoundHalfUp(3, 2)).toBe(2);
    expect(divRoundHalfUp(5, 2)).toBe(3);
  });

  it("rounds values around the half boundary", () => {
    expect(divRoundHalfUp(1, 200)).toBe(0); // 0.005 -> 0
    expect(divRoundHalfUp(199, 200)).toBe(1); // 0.995 -> 1
    expect(divRoundHalfUp(1, 400)).toBe(0); // 0.0025 -> 0
    expect(divRoundHalfUp(3, 400)).toBe(0); // 0.0075 -> 0
    expect(divRoundHalfUp(199, 400)).toBe(0); // 0.4975 -> 0
    expect(divRoundHalfUp(201, 400)).toBe(1); // 0.5025 -> 1
    expect(divRoundHalfUp(201, 200)).toBe(1); // 1.005 -> 1
    expect(divRoundHalfUp(301, 200)).toBe(2); // 1.505 -> 2
  });

  it("returns zero for a zero numerator", () => {
    expect(divRoundHalfUp(0, 5)).toBe(0);
    expect(divRoundHalfUp(0, 1)).toBe(0);
  });

  it("handles maintenance-scale quotients exactly", () => {
    expect(divRoundHalfUp(60_000, 120_000)).toBe(1); // 0.5 -> 1
    expect(divRoundHalfUp(180_000, 120_000)).toBe(2); // 1.5 -> 2
    expect(divRoundHalfUp(3_000_000_000, 120_000)).toBe(25_000);
  });

  it("converts the maximum safe integer boundary", () => {
    expect(divRoundHalfUp(Number.MAX_SAFE_INTEGER, 1)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("rejects invalid denominators", () => {
    for (const bad of [0, -1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => divRoundHalfUp(10, bad)).toThrow(RangeError);
    }
    // Unsafe-integer denominator is rejected even though it is an integer.
    expect(() => divRoundHalfUp(10, Number.MAX_SAFE_INTEGER + 1)).toThrow(
      RangeError,
    );
  });

  it("rejects invalid numerators", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(() => divRoundHalfUp(bad, 2)).toThrow(RangeError);
    }
    expect(() =>
      divRoundHalfUp(Number.MAX_SAFE_INTEGER + 1, 1),
    ).toThrow(RangeError);
  });
});

describe("divFloor", () => {
  it("floors quotients", () => {
    expect(divFloor(7, 2)).toBe(3);
    expect(divFloor(6, 2)).toBe(3);
    expect(divFloor(0, 9)).toBe(0);
    expect(divFloor(50_000_000, 510_000)).toBe(98);
  });

  it("rejects the same invalid domain as R1", () => {
    expect(() => divFloor(5, 0)).toThrow(RangeError);
    expect(() => divFloor(-5, 2)).toThrow(RangeError);
    expect(() => divFloor(5.5, 2)).toThrow(RangeError);
  });
});

describe("roundHalfUpPositive (R2)", () => {
  it("rounds half up for positive values", () => {
    expect(roundHalfUpPositive(2.5)).toBe(3);
    expect(roundHalfUpPositive(2.49)).toBe(2);
    expect(roundHalfUpPositive(0.5)).toBe(1);
    expect(roundHalfUpPositive(0.49)).toBe(0);
    expect(roundHalfUpPositive(179_864.5)).toBe(179_865);
  });

  it("rejects zero, negatives, and non-finite values", () => {
    for (const bad of [0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => roundHalfUpPositive(bad)).toThrow(RangeError);
    }
  });
});

describe("monthlyFromAnnual", () => {
  it("divides annual cents into exact half-up monthlies", () => {
    expect(monthlyFromAnnual(6 as CentsAnnual)).toBe(1);
    expect(monthlyFromAnnual(18 as CentsAnnual)).toBe(2);
    expect(monthlyFromAnnual(30 as CentsAnnual)).toBe(3);
    expect(monthlyFromAnnual(480_000 as CentsAnnual)).toBe(40_000);
    expect(monthlyFromAnnual(0 as CentsAnnual)).toBe(0);
  });
});
