import { describe, expect, it } from "vitest";

import { compareRequestSchema } from "../../lib/validation/api";
import {
  buildCompareRequest,
  mapCompareServerIssues,
} from "../../lib/api/compareRequest";
import { emptyTrueCostErrors } from "../../lib/api/trueCostRequest";
import type { TrueCostFormValues } from "../../lib/api/trueCostRequest";

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

describe("buildCompareRequest", () => {
  it("combines two valid sides into a server-shaped payload", () => {
    const built = buildCompareRequest({ ...SIDE_A }, { ...SIDE_B });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.a.data.homePriceCents).toBe(30_000_000);
    expect(built.b.data.downPaymentCents).toBe(3_000_000);
    // Per-side claims stay independent: A's tax estimate never affects B.
    expect(built.a.provenance.annualTaxCents).toBe("estimate");
    expect(built.b.provenance.annualTaxCents).toBe("user-provided");
    expect(built.a.provenance.hoaMonthlyCents).toBe("user-provided");
    expect(built.b.provenance.hoaMonthlyCents).toBe("estimate");
    // The combined payload must satisfy the real compare request schema.
    expect(
      compareRequestSchema.safeParse({ a: built.a, b: built.b }).success,
    ).toBe(true);
  });

  it("reports each side's errors independently", () => {
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
    expect(built.generalA).toBeNull();
    expect(built.errorsB).toEqual(emptyTrueCostErrors());
    expect(built.generalB).toBeNull();

    const both = buildCompareRequest(
      { ...SIDE_A, downPayment: "" },
      { ...SIDE_B, annualRate: "bogus" },
    );
    expect(both.ok).toBe(false);
    if (both.ok) {
      return;
    }
    expect(both.errorsA.fields.downPayment).toBe("Enter an amount.");
    expect(both.errorsB.fields.annualRate).toBe(
      "Enter a valid percentage, e.g. 6.5.",
    );
  });

  it("carries a per-side form-level error for over-long line lists", () => {
    const lines = Array.from({ length: 101 }, (_, index) => ({
      label: `Line ${index}`,
      monthly: "10",
    }));
    const built = buildCompareRequest(
      { ...SIDE_A },
      { ...SIDE_B, otherCosts: lines },
    );
    expect(built.ok).toBe(false);
    if (built.ok) {
      return;
    }
    expect(built.generalA).toBeNull();
    expect(built.generalB).toBe(
      "Remove extra entries: at most 100 other-cost lines are allowed.",
    );
  });
});

describe("mapCompareServerIssues", () => {
  it("maps prefixed top-level and line issues onto their sides", () => {
    const mapped = mapCompareServerIssues([
      { path: "a.data.homePriceCents", code: "x", message: "y" },
      { path: "b.data.otherCosts[0].label", code: "x", message: "y" },
      { path: "b.data.otherCosts[0].monthly", code: "x", message: "y" },
    ]);
    expect(mapped.unmapped).toBe(false);
    expect(mapped.a.fields).toEqual({
      homePrice: "The server could not accept this value.",
    });
    expect(mapped.a.otherCosts).toEqual([]);
    expect(mapped.b.fields).toEqual({});
    expect(mapped.b.otherCosts[0]).toEqual({
      label: "The server could not accept this label.",
      monthly: "The server could not accept this value.",
    });
  });

  it("flags missing sides and unknown prefixes as unmapped", () => {
    const missing = mapCompareServerIssues([
      { path: "b", code: "invalid_type", message: "y" },
    ]);
    expect(missing.unmapped).toBe(true);
    expect(missing.a).toEqual(emptyTrueCostErrors());
    expect(missing.b).toEqual(emptyTrueCostErrors());

    const unknown = mapCompareServerIssues([
      { path: "c.data.homePriceCents", code: "x", message: "y" },
      { path: "data.homePriceCents", code: "x", message: "y" },
    ]);
    expect(unknown.unmapped).toBe(true);
    expect(unknown.a).toEqual(emptyTrueCostErrors());
    expect(unknown.b).toEqual(emptyTrueCostErrors());
  });

  it("flags non-data paths without exposing their contents", () => {
    const mapped = mapCompareServerIssues([
      {
        path: "a.provenance.SENTINEL-987654321",
        code: "unrecognized_keys",
        message: "y",
      },
    ]);
    expect(mapped.unmapped).toBe(true);
    expect(mapped.a).toEqual(emptyTrueCostErrors());
    expect(JSON.stringify(mapped)).not.toContain("SENTINEL-987654321");
  });

  it("returns empty errors without unmapped for no issues", () => {
    expect(mapCompareServerIssues([])).toEqual({
      a: emptyTrueCostErrors(),
      b: emptyTrueCostErrors(),
      unmapped: false,
    });
  });
});
