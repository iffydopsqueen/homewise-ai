import { describe, expect, it } from "vitest";

import { buildCompareFacts } from "../../lib/ai/facts";
import { validateExplanation } from "../../lib/ai/validateExplanation";
import { compareProperties } from "../../lib/calc/compare";
import { formatDollars } from "../../lib/format/money";
import { resolveTrueCostProvenance } from "../../lib/validation/api";

// Signed-difference regression tests (T5a.2-R / Phase B).
//
// A negative B-minus-A delta must accept natural magnitude phrasing
// ("$313.33 per month lower") as well as the signed form ("-$313.33").
// Fixtures mirror the pinned hand-verified compare vectors with A and B
// swapped so B is cheaper and the deltas go negative; expectations come
// from engine outputs, never hand arithmetic.

// Expensive side: $300k, $30k down, higher tax, HOA, LAWN + Gym.
const INPUT_A = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 240_000,
  downPaymentCents: 3_000_000,
  hoaMonthlyCents: 5_000,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [
    { label: "LAWN", monthly: 9_000 },
    { label: "Gym", monthly: 7_000 },
  ],
  termMonths: 360,
} as const;

// Cheap side: $300k, $60k down, lower tax, no HOA, Lawn lines only.
const INPUT_B = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 120_000,
  downPaymentCents: 6_000_000,
  hoaMonthlyCents: 0,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [
    { label: "Lawn", monthly: 5_000 },
    { label: "lawn ", monthly: 3_000 },
  ],
  termMonths: 360,
} as const;

function buildLedger() {
  const result = compareProperties(
    structuredClone(INPUT_A),
    structuredClone(INPUT_B),
  );
  // Mirror image of the pinned positive-delta vectors: B is cheaper, so
  // monthly/annual deltas are negative while the upfront delta stays
  // positive (B put more down).
  expect(result.deltaMonthly).toBe(-31_333);
  expect(result.deltaAnnual).toBe(-31_333 * 12);
  expect(result.deltaUpfront).toBe(3_000_000);
  const facts = buildCompareFacts(
    result,
    resolveTrueCostProvenance(result.a.inputs, {}),
    resolveTrueCostProvenance(result.b.inputs, {}),
  );
  const byLabel = new Map(facts.map((fact) => [fact.label, fact]));
  return { result, facts, byLabel };
}

const LIMITATIONS = { text: "These figures reflect the inputs only." };

describe("signed comparison differences", () => {
  it("registers both signed and magnitude numerics for negative deltas", () => {
    const { result, byLabel } = buildLedger();
    const monthly = byLabel.get("Monthly difference — total (B minus A)");
    expect(monthly?.cents).toEqual([
      result.deltaMonthly,
      -result.deltaMonthly,
    ]);
    expect(monthly?.bare).toEqual(["-313.33", "313.33"]);
    const lawn = byLabel.get("Only in Property A — Gym");
    expect(lawn?.cents).toEqual([-7_000, 7_000]);
  });

  it("keeps positive deltas signed-only with no duplicate magnitude", () => {
    const { byLabel } = buildLedger();
    const upfront = byLabel.get("Upfront difference — total (B minus A)");
    expect(upfront?.cents).toEqual([3_000_000]);
    expect(upfront?.bare).toEqual(["30000"]);
  });

  it("accepts magnitude phrasing for a negative monthly delta", () => {
    const { result, facts, byLabel } = buildLedger();
    const monthly = byLabel.get("Monthly difference — total (B minus A)");
    const magnitude = formatDollars(-result.deltaMonthly);
    const checked = validateExplanation(
      {
        observations: [
          {
            text: `Property B costs ${magnitude} per month less than Property A.`,
            factIds: [monthly?.id ?? "f999"],
          },
        ],
        limitations: { ...LIMITATIONS, factIds: [monthly?.id ?? "f999"] },
      },
      facts,
    );
    expect(checked).toMatchObject({ ok: true });
  });

  it("still accepts the signed form of a negative delta", () => {
    const { result, facts, byLabel } = buildLedger();
    const monthly = byLabel.get("Monthly difference — total (B minus A)");
    const signed = formatDollars(result.deltaMonthly);
    const checked = validateExplanation(
      {
        observations: [
          {
            text: `The monthly difference is ${signed} on a B-minus-A basis.`,
            factIds: [monthly?.id ?? "f999"],
          },
        ],
        limitations: { ...LIMITATIONS, factIds: [monthly?.id ?? "f999"] },
      },
      facts,
    );
    expect(checked).toMatchObject({ ok: true });
  });

  it("rejects a wrong magnitude even with direction words", () => {
    const { facts, byLabel } = buildLedger();
    const monthly = byLabel.get("Monthly difference — total (B minus A)");
    const checked = validateExplanation(
      {
        observations: [
          {
            text: "Property B costs $313.34 per month less than Property A.",
            factIds: [monthly?.id ?? "f999"],
          },
        ],
        limitations: { ...LIMITATIONS, factIds: [monthly?.id ?? "f999"] },
      },
      facts,
    );
    expect(checked).toEqual({ ok: false, reason: "number_mismatch" });
  });

  it("rejects a sign flip on a non-directional side total", () => {
    const { facts, byLabel } = buildLedger();
    const sideTotal = byLabel.get("Property A — Total estimated monthly cost");
    const flipped = formatDollars(-84_667);
    expect(flipped).toBe("-$846.67");
    const checked = validateExplanation(
      {
        observations: [
          {
            text: `Property A totals ${flipped} per month.`,
            factIds: [sideTotal?.id ?? "f999"],
          },
        ],
        limitations: { ...LIMITATIONS, factIds: [sideTotal?.id ?? "f999"] },
      },
      facts,
    );
    expect(checked).toEqual({ ok: false, reason: "number_mismatch" });
  });

  it("accepts magnitude phrasing for a removed other-cost line", () => {
    const { facts, byLabel } = buildLedger();
    const gym = byLabel.get("Only in Property A — Gym");
    const checked = validateExplanation(
      {
        observations: [
          {
            text: "Gym costs $70 per month, and only Property A includes it.",
            factIds: [gym?.id ?? "f999"],
          },
        ],
        limitations: { ...LIMITATIONS, factIds: [gym?.id ?? "f999"] },
      },
      facts,
    );
    expect(checked).toMatchObject({ ok: true });
  });

  it("accepts word-number magnitude phrasing for a negative line delta", () => {
    const { facts, byLabel } = buildLedger();
    const lawn = [...byLabel.entries()].find(([label]) =>
      label.startsWith("Other-cost difference —"),
    )?.[1];
    expect(lawn?.cents).toEqual([-1_000, 1_000]);
    const checked = validateExplanation(
      {
        observations: [
          {
            text: "The lawn care difference is ten dollars per month.",
            factIds: [lawn?.id ?? "f999"],
          },
        ],
        limitations: { ...LIMITATIONS, factIds: [lawn?.id ?? "f999"] },
      },
      facts,
    );
    expect(checked).toMatchObject({ ok: true });
  });
});
