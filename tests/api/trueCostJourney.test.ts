import { describe, expect, it } from "vitest";

import { POST } from "../../app/api/true-cost/route";
import {
  buildTrueCostRequest,
  mapServerIssues,
  type TrueCostFormValues,
} from "../../lib/api/trueCostRequest";

// Journey integration tests (Phase 6, step 3, Checkpoint C). These wire the
// real modules together with no mocks: form values -> request builder ->
// POST /api/true-cost -> engine -> (on failure) issue mapper. Expected
// figures come only from engine-locked test vectors, never hand computation:
// the BASE fixture pins are from tests/calc/trueCost.test.ts and the P&I
// known answer from tests/calc/mortgage.test.ts. DOM interaction remains
// Checkpoint D (Playwright) scope.

const BASE_VALUES: TrueCostFormValues = {
  homePrice: "360000",
  downPayment: "60000",
  annualRate: "0",
  termYears: 30,
  annualTax: "1200",
  annualInsurance: "0",
  hoaMonthly: "0",
  maintenanceRate: "0",
  pmiMonthly: "",
  closingCosts: "",
  otherCosts: [],
  estimateTax: false,
  estimateInsurance: false,
  estimateHoa: false,
  estimateClosing: true,
};

const FULL_VALUES: TrueCostFormValues = {
  homePrice: "375,000",
  downPayment: "75,000",
  annualRate: "6",
  termYears: 30,
  annualTax: "4,200",
  annualInsurance: "1,800",
  hoaMonthly: "250",
  maintenanceRate: "1",
  pmiMonthly: "120",
  closingCosts: "9,000",
  otherCosts: [{ label: "Pest control", monthly: "50" }],
  estimateTax: true,
  estimateInsurance: false,
  estimateHoa: true,
  estimateClosing: false,
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/true-cost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface JourneyResult {
  monthlyPI: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyMaintenance: number;
  monthlyPMI: number;
  monthlyOther: number;
  totalMonthly: number;
  totalAnnual: number;
  estimatedUpfrontCashCents: number;
  closingCostsProvided: boolean;
  pmiProvided: boolean;
  warnings: string[];
  inputs: { downPaymentCents: number; closingCostsCents?: number };
}

interface JourneyData {
  result: JourneyResult;
  provenance: Record<string, string | undefined>;
}

async function postBuiltRequest(
  values: TrueCostFormValues,
): Promise<{ status: number; data: JourneyData }> {
  const built = buildTrueCostRequest({ ...values });
  expect(built.ok).toBe(true);
  if (!built.ok) {
    throw new Error("builder unexpectedly rejected journey values");
  }
  const res = await POST(postRequest(built.request));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; data: JourneyData };
  expect(body.ok).toBe(true);
  return { status: res.status, data: body.data };
}

describe("true-cost user journey", () => {
  it("runs base values end to end with engine-pinned figures", async () => {
    const { data } = await postBuiltRequest(BASE_VALUES);
    // Every literal below is pinned by tests/calc/trueCost.test.ts.
    expect(data.result.monthlyPI).toBe(83_333);
    expect(data.result.monthlyTax).toBe(10_000);
    expect(data.result.monthlyInsurance).toBe(0);
    expect(data.result.monthlyHoa).toBe(0);
    expect(data.result.monthlyMaintenance).toBe(0);
    expect(data.result.monthlyPMI).toBe(0);
    expect(data.result.monthlyOther).toBe(0);
    expect(data.result.totalMonthly).toBe(93_333);
    expect(data.result.totalAnnual).toBe(1_119_996);
    expect(data.result.estimatedUpfrontCashCents).toBe(6_000_000);
    expect(data.result.closingCostsProvided).toBe(false);
    expect(data.result.warnings).toEqual([
      "closing-costs-not-provided",
      "zero-hoa-confirm",
      "zero-maintenance-confirm",
    ]);
    expect(data.provenance).toEqual({
      homePriceCents: "user-provided",
      downPaymentCents: "user-provided",
      annualRateMilliPct: "user-provided",
      termMonths: "user-provided",
      annualTaxCents: "user-provided",
      annualInsuranceCents: "user-provided",
      hoaMonthlyCents: "user-provided",
      maintenanceRateBps: "assumption",
      pmiMonthlyCents: "user-provided",
      otherCosts: "user-provided",
    });
  });

  it("runs full values end to end with known-answer P&I", async () => {
    const { data } = await postBuiltRequest(FULL_VALUES);
    // $375k - $75k = $300k principal at 6%/30yr: the locked mortgage
    // known answer (tests/calc/mortgage.test.ts).
    expect(data.result.monthlyPI).toBe(179_865);
    // Reconciliation invariant instead of a hand-computed total: the
    // displayed total must equal the sum of its displayed components.
    const { result } = data;
    expect(
      result.monthlyPI +
        result.monthlyTax +
        result.monthlyInsurance +
        result.monthlyHoa +
        result.monthlyMaintenance +
        result.monthlyPMI +
        result.monthlyOther,
    ).toBe(result.totalMonthly);
    expect(result.totalMonthly * 12).toBe(result.totalAnnual);
    // PMI stays its own line; the single other-cost line sums alone.
    expect(result.pmiProvided).toBe(true);
    expect(result.monthlyPMI).toBe(12_000);
    expect(result.monthlyOther).toBe(5_000);
    // Upfront reflects the echoed inputs, not a recomputed literal.
    expect(result.closingCostsProvided).toBe(true);
    expect(result.estimatedUpfrontCashCents).toBe(
      result.inputs.downPaymentCents + (result.inputs.closingCostsCents ?? 0),
    );
    expect(result.warnings).not.toContain("closing-costs-not-provided");
    // Toggle claims honored end to end.
    expect(data.provenance.annualTaxCents).toBe("estimate");
    expect(data.provenance.annualInsuranceCents).toBe("user-provided");
    expect(data.provenance.hoaMonthlyCents).toBe("estimate");
    expect(data.provenance.closingCostsCents).toBe("user-provided");
    expect(data.provenance.maintenanceRateBps).toBe("assumption");
  });

  it("blocks invalid form values before any route call", () => {
    const built = buildTrueCostRequest({
      ...BASE_VALUES,
      homePrice: "abc",
      downPayment: "",
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.errors.fields.homePrice).toBe(
      "Enter a valid dollar amount, e.g. 8,500.50.",
    );
    expect(built.errors.fields.downPayment).toBe("Enter an amount.");
    expect(built.general).toBeNull();
  });

  it("maps real server validation issues back onto form fields", async () => {
    const res = await POST(
      postRequest({
        data: {
          homePriceCents: 0,
          downPaymentCents: 6_000_000,
          annualRateMilliPct: 0,
          termMonths: 360,
          annualTaxCents: 120_000,
          annualInsuranceCents: 0,
          hoaMonthlyCents: 0,
          maintenanceRateBps: 0,
          otherCosts: [{ label: "", monthly: 100 }],
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
    const mapped = mapServerIssues(body.error.issues);
    expect(mapped.unmapped).toBe(false);
    expect(mapped.errors.fields.homePrice).toBe(
      "The server could not accept this value.",
    );
    expect(mapped.errors.otherCosts[0]?.label).toBe(
      "The server could not accept this label.",
    );
    // Mapped messages are fixed strings carrying no submitted data.
    expect(JSON.stringify(mapped.errors)).not.toContain("homePriceCents");
  });
});