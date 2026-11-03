import { describe, expect, it } from "vitest";

import { POST } from "../../app/api/compare/route";
import {
  buildCompareRequest,
  mapCompareServerIssues,
} from "../../lib/api/compareRequest";
import type { TrueCostFormValues } from "../../lib/api/trueCostRequest";
import type { ComparisonResult } from "../../lib/calc/compare";
import type { ResolvedTrueCostProvenance } from "../../lib/validation/api";

// Journey integration tests (Phase 6, step 4, Checkpoint C). These wire the
// real modules together with no mocks: form values -> two-sided builder ->
// POST /api/compare -> engine -> (on failure) side-aware issue mapper.
// Expected figures come only from engine-locked vectors in
// tests/calc/compare-whatif.test.ts, never hand computation. DOM
// interaction remains Checkpoint D (Playwright) scope.

const SIDE_A: TrueCostFormValues = {
  homePrice: "300000",
  downPayment: "60000",
  annualRate: "0",
  termYears: 30,
  annualTax: "1200",
  annualInsurance: "0",
  hoaMonthly: "0",
  maintenanceRate: "0",
  pmiMonthly: "",
  closingCosts: "",
  otherCosts: [
    { label: "Lawn", monthly: "50" },
    { label: "lawn ", monthly: "30" },
  ],
  estimateTax: true,
  estimateInsurance: false,
  estimateHoa: false,
  estimateClosing: true,
};

const SIDE_B: TrueCostFormValues = {
  homePrice: "300000",
  downPayment: "30000",
  annualRate: "0",
  termYears: 30,
  annualTax: "2400",
  annualInsurance: "0",
  hoaMonthly: "50",
  maintenanceRate: "0",
  pmiMonthly: "",
  closingCosts: "",
  otherCosts: [
    { label: "LAWN", monthly: "90" },
    { label: "Gym", monthly: "70" },
  ],
  estimateTax: false,
  estimateInsurance: false,
  estimateHoa: true,
  estimateClosing: true,
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface JourneyData {
  result: ComparisonResult;
  provenanceA: ResolvedTrueCostProvenance;
  provenanceB: ResolvedTrueCostProvenance;
}

async function postBuiltCompare(
  a: TrueCostFormValues,
  b: TrueCostFormValues,
): Promise<JourneyData> {
  const built = buildCompareRequest({ ...a }, { ...b });
  expect(built.ok).toBe(true);
  if (!built.ok) {
    throw new Error("builder unexpectedly rejected journey values");
  }
  const res = await POST(postRequest({ a: built.a, b: built.b }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; data: JourneyData };
  expect(body.ok).toBe(true);
  return body.data;
}

describe("compare user journey", () => {
  it("runs both sides end to end with engine-pinned deltas", async () => {
    const data = await postBuiltCompare(SIDE_A, SIDE_B);
    // Every literal below is pinned by tests/calc/compare-whatif.test.ts.
    expect(data.result.a.totalMonthly).toBe(84_667);
    expect(data.result.b.totalMonthly).toBe(116_000);
    const byKey = Object.fromEntries(
      data.result.fixed.map((f) => [f.key, f.delta]),
    );
    expect(byKey).toEqual({
      hoa: 5_000,
      insurance: 0,
      maintenance: 0,
      pmi: 0,
      principalAndInterest: 8_333,
      propertyTax: 10_000,
    });
    expect(data.result.deltaMonthly).toBe(31_333);
    expect(data.result.deltaAnnual).toBe(31_333 * 12);
    expect(data.result.deltaUpfront).toBe(-3_000_000);
    expect(data.result.assumptionsDiffer).toBe(false);
  });

  it("matches, adds, and aggregates other-cost lines end to end", async () => {
    const data = await postBuiltCompare(SIDE_A, SIDE_B);
    expect(
      data.result.otherLines.find((l) => l.key === "lawn"),
    ).toMatchObject({
      a: 8_000,
      b: 9_000,
      delta: 1_000,
      labelA: "Lawn",
      labelB: "LAWN",
      status: "matched",
    });
    expect(data.result.otherLines.find((l) => l.key === "gym")).toMatchObject({
      a: 0,
      b: 7_000,
      delta: 7_000,
      labelA: null,
      labelB: "Gym",
      status: "added",
    });
  });

  it("reports removals when the sides are swapped", async () => {
    const data = await postBuiltCompare(SIDE_B, SIDE_A);
    expect(data.result.a.totalMonthly).toBe(116_000);
    expect(data.result.b.totalMonthly).toBe(84_667);
    expect(data.result.otherLines.find((l) => l.key === "gym")).toMatchObject({
      a: 7_000,
      b: 0,
      delta: -7_000,
      status: "removed",
    });
  });

  it("resolves provenance independently per side", async () => {
    const data = await postBuiltCompare(SIDE_A, SIDE_B);
    expect(data.provenanceA.annualTaxCents).toBe("estimate");
    expect(data.provenanceB.annualTaxCents).toBe("user-provided");
    expect(data.provenanceA.hoaMonthlyCents).toBe("user-provided");
    expect(data.provenanceB.hoaMonthlyCents).toBe("estimate");
    expect(data.provenanceA.maintenanceRateBps).toBe("assumption");
    expect(data.provenanceB.maintenanceRateBps).toBe("assumption");
    expect(data.result.a.warnings).toEqual(
      expect.arrayContaining([
        "closing-costs-not-provided",
        "zero-hoa-confirm",
        "zero-maintenance-confirm",
      ]),
    );
    expect(data.result.b.warnings).toContain("closing-costs-not-provided");
    expect(data.result.b.warnings).not.toContain("zero-hoa-confirm");
  });

  it("blocks invalid sides before any route call", () => {
    const built = buildCompareRequest(
      { ...SIDE_A, homePrice: "abc" },
      { ...SIDE_B },
    );
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.errorsA.fields.homePrice).toBe(
      "Enter a valid dollar amount, e.g. 8,500.50.",
    );
    expect(built.errorsB.fields).toEqual({});
    expect(built.generalA).toBeNull();
    expect(built.generalB).toBeNull();
  });

  it("maps real server validation issues back onto their sides", async () => {
    const res = await POST(
      postRequest({
        a: {
          data: {
            homePriceCents: 30_000_000,
            downPaymentCents: 6_000_000,
            annualRateMilliPct: 0,
            termMonths: 360,
            annualTaxCents: 120_000,
            annualInsuranceCents: 0,
            hoaMonthlyCents: 0,
            maintenanceRateBps: 0,
            otherCosts: [{ label: "", monthly: 100 }],
          },
        },
        b: {
          data: {
            homePriceCents: 0,
            downPaymentCents: 3_000_000,
            annualRateMilliPct: 0,
            termMonths: 360,
            annualTaxCents: 240_000,
            annualInsuranceCents: 0,
            hoaMonthlyCents: 5_000,
            maintenanceRateBps: 0,
            otherCosts: [],
          },
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      ok: boolean;
      error: {
        code: string;
        issues: { path: string; code: string; message: string }[];
      };
    };
    expect(body.error.code).toBe("validation_error");
    const mapped = mapCompareServerIssues(body.error.issues);
    expect(mapped.unmapped).toBe(false);
    expect(mapped.a.otherCosts[0]?.label).toBe(
      "The server could not accept this label.",
    );
    expect(mapped.b.fields.homePrice).toBe(
      "The server could not accept this value.",
    );
  });
});