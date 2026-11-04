import { describe, expect, it } from "vitest";

import { markerPercent, segmentPercents } from "../../lib/format/allocation";

describe("segmentPercents", () => {
  it("computes standard positive-value shares", () => {
    expect(segmentPercents([200000, 60000, 250000], 800000)).toEqual([
      25, 7.5, 31.25,
    ]);
  });

  it("gives zero-valued components zero share", () => {
    expect(segmentPercents([0, 10000, 0], 10000)).toEqual([0, 100, 0]);
  });

  it("returns all zeros for a zero denominator", () => {
    expect(segmentPercents([200000, 60000], 0)).toEqual([0, 0]);
  });

  it("returns all zeros for an empty input", () => {
    expect(segmentPercents([], 800000)).toEqual([]);
  });

  it("clamps over-total values to 100", () => {
    expect(segmentPercents([15000], 10000)).toEqual([100]);
  });

  it("maps negative, NaN, and Infinite values to zero", () => {
    expect(
      segmentPercents(
        [-500, Number.NaN, Number.POSITIVE_INFINITY, 5000],
        10000,
      ),
    ).toEqual([0, 0, 0, 50]);
  });

  it("maps non-finite and negative totals to all zeros", () => {
    expect(segmentPercents([5000], Number.NaN)).toEqual([0]);
    expect(segmentPercents([5000], -100)).toEqual([0]);
  });

  it("stays bounded for large valid amounts", () => {
    const big = 1_000_000_000; // engine cent ceiling
    const shares = segmentPercents([big, big / 2, 0], big * 2);
    expect(shares).toEqual([50, 25, 0]);
    for (const share of shares) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(100);
      expect(Number.isFinite(share)).toBe(true);
    }
  });

  it("supports shortfall scaling against an obligations total", () => {
    // Obligations of 9000 against income of 8000: the bar scales to the
    // obligations sum; the caller marks income separately (see below).
    expect(segmentPercents([200000, 60000, 640000], 900000)).toEqual([
      2000 / 90,
      600 / 90,
      6400 / 90,
    ]);
  });
});

describe("markerPercent", () => {
  it("positions a limit mark within the scale", () => {
    expect(markerPercent(800000, 900000)).toBeCloseTo(88.8889, 4);
  });

  it("clamps marks at or beyond the scale end to 100", () => {
    expect(markerPercent(900000, 900000)).toBe(100);
    expect(markerPercent(1200000, 900000)).toBe(100);
  });

  it("returns 0 for zero, negative, or non-finite scales", () => {
    expect(markerPercent(800000, 0)).toBe(0);
    expect(markerPercent(800000, -50)).toBe(0);
    expect(markerPercent(800000, Number.NaN)).toBe(0);
  });

  it("returns 0 for unusable mark values", () => {
    expect(markerPercent(-100, 900000)).toBe(0);
    expect(markerPercent(Number.NaN, 900000)).toBe(0);
  });
});
