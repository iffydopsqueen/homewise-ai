import { describe, expect, it } from "vitest";

import { deltaDirection, formatDeltaMagnitude } from "../../lib/format/delta";

describe("deltaDirection", () => {
  it("classifies positive, negative, and zero deltas", () => {
    expect(deltaDirection(31_333)).toBe("higher");
    expect(deltaDirection(1)).toBe("higher");
    expect(deltaDirection(-3_000_000)).toBe("lower");
    expect(deltaDirection(-1)).toBe("lower");
    expect(deltaDirection(0)).toBe("same");
    expect(deltaDirection(-0)).toBe("same");
  });

  it("rejects non-integer and non-finite input", () => {
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => deltaDirection(bad)).toThrow(RangeError);
    }
  });
});

describe("formatDeltaMagnitude", () => {
  it("formats the absolute value as dollars", () => {
    expect(formatDeltaMagnitude(31_333)).toBe("$313.33");
    expect(formatDeltaMagnitude(-31_333)).toBe("$313.33");
    expect(formatDeltaMagnitude(-3_000_000)).toBe("$30,000.00");
    expect(formatDeltaMagnitude(0)).toBe("$0.00");
  });

  it("rejects non-integer and non-finite input", () => {
    for (const bad of [-1.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(() => formatDeltaMagnitude(bad)).toThrow(RangeError);
    }
  });
});
