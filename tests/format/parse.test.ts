import { describe, expect, it } from "vitest";

import {
  parseDecimalToInt,
  parseDollarsToCents,
  parsePercentToBps,
  parsePercentToMilliPct,
} from "../../lib/format/parse";

describe("parseDecimalToInt", () => {
  it("parses exact place values without float math", () => {
    expect(parseDecimalToInt("0", 2)).toBe(0);
    expect(parseDecimalToInt("1", 2)).toBe(100);
    expect(parseDecimalToInt("0.01", 2)).toBe(1);
    expect(parseDecimalToInt("0.1", 2)).toBe(10);
    expect(parseDecimalToInt("1798.65", 2)).toBe(179_865);
    expect(parseDecimalToInt("6.875", 3)).toBe(6875);
    expect(parseDecimalToInt("007", 0)).toBe(7);
  });

  it("tolerates formatting characters", () => {
    expect(parseDecimalToInt("  $1,234.56  ", 2)).toBe(123_456);
    expect(parseDecimalToInt("1,000", 0)).toBe(1000);
  });

  it("rejects excess decimals rather than truncating", () => {
    expect(() => parseDecimalToInt("10.005", 2)).toThrow(RangeError);
    expect(() => parseDecimalToInt("1.0000001", 6)).toThrow(RangeError);
  });

  it("rejects malformed, negative, and out-of-range input", () => {
    for (const bad of [
      "",
      "   ",
      "1 2",
      "6 .5",
      "-5",
      "+5",
      "abc",
      "1.2.3",
      "1e5",
      "NaN",
      ".",
      "5.",
      ".5",
      "99999999999999999999999",
    ]) {
      expect(() => parseDecimalToInt(bad, 2)).toThrow(RangeError);
    }
    expect(() =>
      parseDecimalToInt(null as unknown as string, 2),
    ).toThrow(RangeError);
  });

  it("rejects invalid places arguments", () => {
    for (const places of [-1, 7, 1.5, Number.NaN]) {
      expect(() => parseDecimalToInt("1", places)).toThrow(RangeError);
    }
  });
});

describe("parseDollarsToCents", () => {
  it("parses dollars at the boundaries", () => {
    expect(parseDollarsToCents("0.01")).toBe(1);
    expect(parseDollarsToCents("$10,000,000.00")).toBe(1_000_000_000);
  });

  it("rejects over-cap, excess-decimal, and malformed input", () => {
    for (const bad of [
      "10000000.01",
      "10.005",
      "-0.01",
      "",
      "abc",
      "1 2",
    ]) {
      expect(() => parseDollarsToCents(bad)).toThrow(RangeError);
    }
  });
});

describe("parsePercentToMilliPct", () => {
  it("parses rates with up to three decimals", () => {
    expect(parsePercentToMilliPct("0")).toBe(0);
    expect(parsePercentToMilliPct("6.5")).toBe(6500);
    expect(parsePercentToMilliPct("6.875")).toBe(6875);
    expect(parsePercentToMilliPct("6.5%")).toBe(6500);
    expect(parsePercentToMilliPct("100")).toBe(100_000);
  });

  it("rejects over-cap, excess-decimal, and misformatted input", () => {
    for (const bad of [
      "100.001",
      "6.8755",
      "-1",
      "",
      "6,5",
      "$6",
      "abc",
      "6 .5",
    ]) {
      expect(() => parsePercentToMilliPct(bad)).toThrow(RangeError);
    }
  });
});

describe("parsePercentToBps", () => {
  it("parses percents with up to two decimals", () => {
    expect(parsePercentToBps("0")).toBe(0);
    expect(parsePercentToBps("1")).toBe(100);
    expect(parsePercentToBps("1.5")).toBe(150);
    expect(parsePercentToBps("0.25")).toBe(25);
    expect(parsePercentToBps("1%")).toBe(100);
    expect(parsePercentToBps("100")).toBe(10_000);
  });

  it("rejects over-cap, excess-decimal, and misformatted input", () => {
    for (const bad of ["100.01", "1.555", "-1", "", "1,5", "abc"]) {
      expect(() => parsePercentToBps(bad)).toThrow(RangeError);
    }
  });
});
