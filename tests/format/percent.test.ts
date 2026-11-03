import { describe, expect, it } from "vitest";

import {
  formatCushionMonths,
  formatPercentFromBps,
  formatPercentFromMilliPct,
} from "../../lib/format/percent";

describe("formatPercentFromBps", () => {
  it("trims trailing zeros", () => {
    expect(formatPercentFromBps(2500)).toBe("25%");
    expect(formatPercentFromBps(6375)).toBe("63.75%");
    expect(formatPercentFromBps(650)).toBe("6.5%");
    expect(formatPercentFromBps(0)).toBe("0%");
    expect(formatPercentFromBps(5)).toBe("0.05%");
    expect(formatPercentFromBps(12_000)).toBe("120%");
  });

  it("rejects non-integer and non-finite input", () => {
    for (const bad of [1.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(() => formatPercentFromBps(bad)).toThrow(RangeError);
    }
  });
});

describe("formatPercentFromMilliPct", () => {
  it("formats thousandths of a percent exactly", () => {
    expect(formatPercentFromMilliPct(0)).toBe("0%");
    expect(formatPercentFromMilliPct(1)).toBe("0.001%");
    expect(formatPercentFromMilliPct(6500)).toBe("6.5%");
    expect(formatPercentFromMilliPct(6543)).toBe("6.543%");
    expect(formatPercentFromMilliPct(100_000)).toBe("100%");
  });

  it("rejects negatives, non-integers, and non-finite input", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => formatPercentFromMilliPct(bad)).toThrow(RangeError);
    }
  });
});

describe("formatCushionMonths", () => {
  it("formats tenths with singular handling", () => {
    expect(formatCushionMonths(98)).toBe("9.8 months");
    expect(formatCushionMonths(120)).toBe("12 months");
    expect(formatCushionMonths(10)).toBe("1 month");
    expect(formatCushionMonths(0)).toBe("0 months");
  });

  it("rejects negatives and non-integers", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => formatCushionMonths(bad)).toThrow(RangeError);
    }
  });
});
