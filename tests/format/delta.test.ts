import { describe, expect, it } from "vitest";

import {
  categoryDifference,
  deltaDirection,
  differenceSentence,
  formatDeltaMagnitude,
  higherSide,
} from "../../lib/format/delta";

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

describe("higherSide", () => {
  it("identifies the higher-cost property from a signed B-minus-A delta", () => {
    expect(higherSide(31_333)).toBe("B");
    expect(higherSide(1)).toBe("B");
    expect(higherSide(-61_978)).toBe("A");
    expect(higherSide(-1)).toBe("A");
    expect(higherSide(0)).toBeNull();
    expect(higherSide(-0)).toBeNull();
  });

  it("rejects non-integer and non-finite input", () => {
    for (const bad of [2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => higherSide(bad)).toThrow(RangeError);
    }
  });
});

describe("differenceSentence", () => {
  // Pinned T5b.3 regression fixture from the reported screenshot: A
  // $2,958.70/mo, B $2,338.92/mo, so B-minus-A is -$619.78 monthly.
  it("names Property A with the absolute difference when A costs more", () => {
    expect(differenceSentence(-61_978, "monthly")).toBe(
      "Property A costs $619.78 more per month than Property B.",
    );
    expect(differenceSentence(-743_736, "annual")).toBe(
      "Property A costs $7,437.36 more per year than Property B.",
    );
    expect(differenceSentence(-1_700_000, "upfront")).toBe(
      "Property A requires $17,000.00 more upfront cash than Property B.",
    );
  });

  it("names Property B with the absolute difference when B costs more", () => {
    expect(differenceSentence(31_333, "monthly")).toBe(
      "Property B costs $313.33 more per month than Property A.",
    );
    expect(differenceSentence(375_996, "annual")).toBe(
      "Property B costs $3,759.96 more per year than Property A.",
    );
    expect(differenceSentence(3_000_000, "upfront")).toBe(
      "Property B requires $30,000.00 more upfront cash than Property A.",
    );
  });

  it("uses shared same-cost wording for zero, including negative zero", () => {
    for (const zero of [0, -0]) {
      expect(differenceSentence(zero, "monthly")).toBe(
        "Both properties have the same estimated monthly cost.",
      );
      expect(differenceSentence(zero, "annual")).toBe(
        "Both properties have the same estimated annual cost.",
      );
      expect(differenceSentence(zero, "upfront")).toBe(
        "Both properties require the same estimated upfront cash.",
      );
    }
  });

  it("never emits a signed magnitude or verdict language", () => {
    for (const delta of [-61_978, 31_333, 0]) {
      for (const unit of ["monthly", "annual", "upfront"] as const) {
        const sentence = differenceSentence(delta, unit);
        expect(sentence).not.toContain("-$");
        expect(sentence).not.toMatch(
          /better|winner|recommend|safest|approved/i,
        );
      }
    }
  });
});

describe("categoryDifference", () => {
  it("pairs the absolute magnitude with the higher side", () => {
    expect(categoryDifference(-61_978)).toBe(
      "$619.78 · Property A costs more",
    );
    expect(categoryDifference(31_333)).toBe("$313.33 · Property B costs more");
    expect(categoryDifference(1)).toBe("$0.01 · Property B costs more");
  });

  it("reads Same cost for zero without a magnitude", () => {
    expect(categoryDifference(0)).toBe("Same cost");
    expect(categoryDifference(-0)).toBe("Same cost");
  });
});
