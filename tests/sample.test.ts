import { describe, expect, it } from "vitest";
import { z } from "zod";

// Scaffold smoke test (Phase 3): proves the Zod validation + Vitest
// toolchain works. Product schemas and engine tests land in Phases 4-5.
const positiveNumber = z.number().finite().positive();

describe("scaffold toolchain", () => {
  it("accepts a valid positive number", () => {
    expect(positiveNumber.parse(1500)).toBe(1500);
  });

  it("rejects NaN, Infinity, zero, and negatives", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(positiveNumber.safeParse(bad).success).toBe(false);
    }
  });
});
