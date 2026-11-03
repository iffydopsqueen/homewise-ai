import { describe, expect, it } from "vitest";

import { trueCostRequestSchema } from "../../lib/validation/api";
import {
  buildTrueCostRequest,
  emptyTrueCostErrors,
  mapServerIssues,
  type TrueCostFormValues,
} from "../../lib/api/trueCostRequest";

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

const MINIMAL_VALUES: TrueCostFormValues = {
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

describe("buildTrueCostRequest", () => {
  it("builds a valid server-shaped request from full values", () => {
    const built = buildTrueCostRequest({ ...FULL_VALUES });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.data).toEqual({
      homePriceCents: 37_500_000,
      downPaymentCents: 7_500_000,
      annualRateMilliPct: 6000,
      termMonths: 360,
      annualTaxCents: 420_000,
      annualInsuranceCents: 180_000,
      hoaMonthlyCents: 25_000,
      maintenanceRateBps: 100,
      pmiMonthlyCents: 12_000,
      otherCosts: [{ label: "Pest control", monthly: 5000 }],
      closingCostsCents: 900_000,
      assumptionSetId: "default",
    });
    expect(built.request.provenance).toEqual({
      annualTaxCents: "estimate",
      annualInsuranceCents: "user-provided",
      hoaMonthlyCents: "estimate",
      closingCostsCents: "user-provided",
    });
    // The built payload must satisfy the real server request schema.
    expect(trueCostRequestSchema.safeParse(built.request).success).toBe(true);
  });

  it("omits optional keys and preserves valid zeros", () => {
    const built = buildTrueCostRequest({ ...MINIMAL_VALUES });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect("pmiMonthlyCents" in built.request.data).toBe(false);
    expect("closingCostsCents" in built.request.data).toBe(false);
    expect(built.request.data.otherCosts).toEqual([]);
    expect(built.request.data.annualRateMilliPct).toBe(0);
    expect(built.request.data.hoaMonthlyCents).toBe(0);
    expect(built.request.data.maintenanceRateBps).toBe(0);
    // No closing figure means no closing provenance entry, even though the
    // estimate toggle defaults on.
    expect("closingCostsCents" in built.request.provenance).toBe(false);
    expect(trueCostRequestSchema.safeParse(built.request).success).toBe(true);
  });

  it("requires every mandatory figure but never optionals", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      homePrice: "",
      downPayment: "   ",
      annualRate: "",
      annualTax: "",
      annualInsurance: "",
      hoaMonthly: "",
      maintenanceRate: "",
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.errors.fields).toEqual({
      homePrice: "Enter an amount.",
      downPayment: "Enter an amount.",
      annualRate: "Enter a percentage.",
      annualTax: "Enter an amount.",
      annualInsurance: "Enter an amount.",
      hoaMonthly: "Enter an amount.",
      maintenanceRate: "Enter a percentage.",
    });
  });

  it("rejects malformed dollars without silent zeros", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      homePrice: "abc",
      downPayment: "10,000,000.01",
      annualTax: "1.234",
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.errors.fields.homePrice).toBe(
      "Enter a valid dollar amount, e.g. 8,500.50.",
    );
    expect(built.errors.fields.downPayment).toBe(
      "Amount is too large (maximum $10,000,000).",
    );
    expect(built.errors.fields.annualTax).toBe(
      "Use at most 2 decimal places.",
    );
  });

  it("rejects malformed percentages with rate-specific messages", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      annualRate: "6 .5",
      maintenanceRate: "1.234",
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.errors.fields.annualRate).toBe(
      "Enter a valid percentage, e.g. 6.5.",
    );
    expect(built.errors.fields.maintenanceRate).toBe(
      "Use at most 2 decimal places.",
    );

    const tooLarge = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      annualRate: "100.001",
    });
    expect(tooLarge.ok).toBe(false);
    if (tooLarge.ok) {
      return;
    }
    expect(tooLarge.errors.fields.annualRate).toBe(
      "Rate is too large (maximum 100%).",
    );
  });

  it("rejects a zero price but allows down payment above price", () => {
    const zeroPrice = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      homePrice: "0",
    });
    expect(zeroPrice.ok).toBe(false);
    if (zeroPrice.ok) {
      return;
    }
    expect(zeroPrice.errors.fields).toEqual({
      homePrice: "Enter a price greater than $0.",
    });

    // D.1: down payment at or above price means "no mortgage", not an error.
    const noMortgage = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      homePrice: "300,000",
      downPayment: "300,000",
    });
    expect(noMortgage.ok).toBe(true);
  });

  it("rejects unsupported loan terms", () => {
    const built = buildTrueCostRequest({ ...MINIMAL_VALUES, termYears: 20 });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.errors.fields).toEqual({ termYears: "Choose a loan term." });
  });

  it("validates other-cost lines and trims labels", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      otherCosts: [
        { label: "  Alarm  ", monthly: "30" },
        { label: "", monthly: "" },
        { label: "x".repeat(61), monthly: "abc" },
      ],
    });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    // Fully blank lines are errors, not silently dropped.
    expect(built.errors.otherCosts[1]).toEqual({
      label: "Enter a label.",
      monthly: "Enter an amount.",
    });
    expect(built.errors.otherCosts[2]).toEqual({
      label: "Keep labels to 60 characters or fewer.",
      monthly: "Enter a valid dollar amount, e.g. 8,500.50.",
    });

    const trimmed = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      otherCosts: [{ label: "  Alarm  ", monthly: "30" }],
    });
    expect(trimmed.ok).toBe(true);
    if (!trimmed.ok) {
      return;
    }
    expect(trimmed.request.data.otherCosts).toEqual([
      { label: "Alarm", monthly: 3000 },
    ]);
  });

  it("fails visibly when more than 100 other-cost lines are submitted", () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      label: `Line ${index}`,
      monthly: "10",
    }));
    const built = buildTrueCostRequest({ ...MINIMAL_VALUES, otherCosts: lines });
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.general).toBe(
      "Remove extra entries: at most 100 other-cost lines are allowed.",
    );

    const atCap = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      otherCosts: lines.slice(0, 100),
    });
    expect(atCap.ok).toBe(true);
  });

  it("derives closing provenance from supply and toggle together", () => {
    const suppliedEstimate = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      closingCosts: "9000",
      estimateClosing: true,
    });
    expect(suppliedEstimate.ok).toBe(true);
    if (!suppliedEstimate.ok) {
      return;
    }
    expect(suppliedEstimate.request.provenance.closingCostsCents).toBe(
      "estimate",
    );

    const suppliedExact = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      closingCosts: "9000",
      estimateClosing: false,
    });
    expect(suppliedExact.ok).toBe(true);
    if (!suppliedExact.ok) {
      return;
    }
    expect(suppliedExact.request.provenance.closingCostsCents).toBe(
      "user-provided",
    );
  });

  it("preserves explicit optional zeros but omits blanks", () => {
    const zeros = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      pmiMonthly: "0",
      closingCosts: "0",
    });
    expect(zeros.ok).toBe(true);
    if (!zeros.ok) {
      return;
    }
    expect(zeros.request.data.pmiMonthlyCents).toBe(0);
    expect(zeros.request.data.closingCostsCents).toBe(0);

    const blanks = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      pmiMonthly: "   ",
      closingCosts: "",
    });
    expect(blanks.ok).toBe(true);
    if (!blanks.ok) {
      return;
    }
    expect("pmiMonthlyCents" in blanks.request.data).toBe(false);
    expect("closingCostsCents" in blanks.request.data).toBe(false);
  });

  it("accepts down payment strictly greater than price", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      homePrice: "300,000",
      downPayment: "400,000",
    });
    expect(built.ok).toBe(true);
  });

  it("accepts boundary labels and 100% rates", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      annualRate: "100",
      maintenanceRate: "100",
      otherCosts: [{ label: "x".repeat(60), monthly: "10" }],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.data.annualRateMilliPct).toBe(100_000);
    expect(built.request.data.maintenanceRateBps).toBe(10_000);
    expect(built.request.data.otherCosts).toEqual([
      { label: "x".repeat(60), monthly: 1000 },
    ]);
  });

  it("claims user-provided when tax and HOA toggles are off", () => {
    const built = buildTrueCostRequest({
      ...MINIMAL_VALUES,
      estimateTax: false,
      estimateHoa: false,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.request.provenance.annualTaxCents).toBe("user-provided");
    expect(built.request.provenance.hoaMonthlyCents).toBe("user-provided");
  });
});

describe("mapServerIssues", () => {
  it("maps top-level and indexed line issues onto fields", () => {
    const { errors, unmapped } = mapServerIssues([
      { path: "data.homePriceCents", code: "x", message: "y" },
      { path: "data.otherCosts[1].monthly", code: "x", message: "y" },
      { path: "data.otherCosts[1].label", code: "x", message: "y" },
    ]);
    expect(unmapped).toBe(false);
    expect(errors.fields).toEqual({
      homePrice: "The server could not accept this value.",
    });
    expect(errors.otherCosts[1]).toEqual({
      monthly: "The server could not accept this value.",
      label: "The server could not accept this label.",
    });
  });

  it("flags unknown paths without exposing their contents", () => {
    const { errors, unmapped } = mapServerIssues([
      {
        path: "data.bogus.987654321",
        code: "invalid_type",
        message: "SENTINEL-987654321",
      },
    ]);
    expect(unmapped).toBe(true);
    expect(errors).toEqual(emptyTrueCostErrors());
    expect(JSON.stringify(errors)).not.toContain("987654321");
  });

  it("keeps the first mapping when an issue repeats", () => {
    const { errors, unmapped } = mapServerIssues([
      { path: "data.hoaMonthlyCents", code: "a", message: "first" },
      { path: "data.hoaMonthlyCents", code: "b", message: "second" },
    ]);
    expect(unmapped).toBe(false);
    expect(errors.fields).toEqual({
      hoaMonthly: "The server could not accept this value.",
    });
  });

  it("flags array-level and malformed line indexes as unmapped", () => {
    const arrayLevel = mapServerIssues([
      { path: "data.otherCosts", code: "too_big", message: "y" },
    ]);
    expect(arrayLevel.unmapped).toBe(true);
    expect(arrayLevel.errors).toEqual(emptyTrueCostErrors());

    const oversized = mapServerIssues([
      {
        path: "data.otherCosts[99999999999999999999999].monthly",
        code: "x",
        message: "y",
      },
    ]);
    expect(oversized.unmapped).toBe(true);

    const negative = mapServerIssues([
      { path: "data.otherCosts[-1].monthly", code: "x", message: "y" },
    ]);
    expect(negative.unmapped).toBe(true);

    // Dotted indexes are not the sanitizer format and must not map.
    const dotted = mapServerIssues([
      { path: "data.otherCosts.1.monthly", code: "x", message: "y" },
    ]);
    expect(dotted.unmapped).toBe(true);
    expect(dotted.errors).toEqual(emptyTrueCostErrors());
  });

  it("returns empty errors without unmapped for no issues", () => {
    expect(mapServerIssues([])).toEqual({
      errors: emptyTrueCostErrors(),
      unmapped: false,
    });
  });
});
