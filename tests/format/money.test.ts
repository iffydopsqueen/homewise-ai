import { describe, expect, it } from "vitest";

import { formatDollars } from "../../lib/format/money";

describe("formatDollars", () => {
  it("formats cents with grouping and two decimals", () => {
    expect(formatDollars(179_865)).toBe("$1,798.65");
    expect(formatDollars(0)).toBe("$0.00");
    expect(formatDollars(1)).toBe("$0.01");
    expect(formatDollars(5)).toBe("$0.05");
    expect(formatDollars(1005)).toBe("$10.05");
    expect(formatDollars(1_000_000_000)).toBe("$10,000,000.00");
    expect(formatDollars(100_000_000_000)).toBe("$1,000,000,000.00");
  });

  it("formats negative amounts plainly", () => {
    expect(formatDollars(-100_000)).toBe("-$1,000.00");
  });

  it("rejects non-integer and non-finite input", () => {
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => formatDollars(bad)).toThrow(RangeError);
    }
  });
});
