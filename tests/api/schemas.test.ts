import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  affordabilityProvenanceSchema,
  affordabilityRequestSchema,
  compareRequestSchema,
  resolveAffordabilityProvenance,
  resolveScenarioProvenance,
  resolveTrueCostProvenance,
  scenarioProvenanceSchema,
  trueCostProvenanceSchema,
  trueCostRequestSchema,
  whatIfRequestSchema,
} from "../../lib/validation/api";
import {
  trueCostInputSchema,
  whatIfOverridesSchema,
} from "../../lib/validation/calc";

const VALID_HOME = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 120_000,
  downPaymentCents: 6_000_000,
  hoaMonthlyCents: 0,
  homePriceCents: 36_000_000,
  maintenanceRateBps: 0,
  otherCosts: [],
  termMonths: 360,
};

const VALID_FINANCES = {
  debtsMonthlyCents: 60_000,
  expensesMonthlyCents: 250_000,
  proposedHousingMonthlyCents: 200_000,
  savingsCents: 5_000_000,
  takeHomeMonthlyCents: 800_000,
};

describe("true-cost provenance claims", () => {
  it("accepts an empty map and fully explicit allowed claims", () => {
    expect(trueCostProvenanceSchema.parse({})).toEqual({});
    const full = {
      homePriceCents: "user-provided",
      downPaymentCents: "user-provided",
      annualRateMilliPct: "user-provided",
      termMonths: "user-provided",
      annualTaxCents: "estimate",
      annualInsuranceCents: "user-provided",
      hoaMonthlyCents: "estimate",
      maintenanceRateBps: "assumption",
      pmiMonthlyCents: "user-provided",
      otherCosts: "user-provided",
      closingCostsCents: "user-provided",
    } as const;
    expect(trueCostProvenanceSchema.parse({ ...full })).toEqual({ ...full });
  });

  it("rejects non-assumption maintenance claims", () => {
    for (const maintenanceRateBps of ["user-provided", "estimate"]) {
      expect(() =>
        trueCostProvenanceSchema.parse({ maintenanceRateBps }),
      ).toThrow(ZodError);
    }
  });

  it("rejects estimate/assumption on user-provided-only fields", () => {
    const fields = [
      "homePriceCents",
      "downPaymentCents",
      "annualRateMilliPct",
      "termMonths",
      "pmiMonthlyCents",
      "otherCosts",
    ] as const;
    for (const field of fields) {
      for (const label of ["estimate", "assumption"]) {
        expect(() =>
          trueCostProvenanceSchema.parse({ [field]: label }),
        ).toThrow(ZodError);
      }
    }
  });

  it("rejects unknown labels and unknown keys", () => {
    expect(() =>
      trueCostProvenanceSchema.parse({ annualTaxCents: "verified" }),
    ).toThrow(ZodError);
    expect(() =>
      trueCostProvenanceSchema.parse({ bogus: "user-provided" }),
    ).toThrow(ZodError);
    expect(() =>
      trueCostProvenanceSchema.parse({ assumptionSetId: "user-provided" }),
    ).toThrow(ZodError);
  });
});

describe("affordability provenance claims", () => {
  it("accepts empty and all-user-provided maps", () => {
    expect(affordabilityProvenanceSchema.parse({})).toEqual({});
    const full = {
      takeHomeMonthlyCents: "user-provided",
      debtsMonthlyCents: "user-provided",
      expensesMonthlyCents: "user-provided",
      savingsCents: "user-provided",
      proposedHousingMonthlyCents: "user-provided",
    } as const;
    expect(affordabilityProvenanceSchema.parse({ ...full })).toEqual({
      ...full,
    });
  });

  it("rejects estimate/assumption labels and unknown keys", () => {
    const fields = [
      "takeHomeMonthlyCents",
      "debtsMonthlyCents",
      "expensesMonthlyCents",
      "savingsCents",
      "proposedHousingMonthlyCents",
    ] as const;
    for (const field of fields) {
      for (const label of ["estimate", "assumption"]) {
        expect(() =>
          affordabilityProvenanceSchema.parse({ [field]: label }),
        ).toThrow(ZodError);
      }
    }
    expect(() =>
      affordabilityProvenanceSchema.parse({ bogus: "user-provided" }),
    ).toThrow(ZodError);
  });
});

describe("request envelopes", () => {
  it("parses valid requests and defaults omitted provenance maps", () => {
    const home = trueCostRequestSchema.parse({
      data: { ...VALID_HOME },
      provenance: { annualTaxCents: "estimate" },
    });
    expect(home.provenance).toEqual({ annualTaxCents: "estimate" });
    expect(
      trueCostRequestSchema.parse({ data: { ...VALID_HOME } }).provenance,
    ).toEqual({});
    expect(
      affordabilityRequestSchema.parse({ data: { ...VALID_FINANCES } })
        .provenance,
    ).toEqual({});
  });

  it("rejects invalid data, bad claims, and unknown keys", () => {
    expect(() =>
      trueCostRequestSchema.parse({
        data: { ...VALID_HOME, homePriceCents: -1 },
      }),
    ).toThrow(ZodError);
    expect(() =>
      trueCostRequestSchema.parse({
        data: { ...VALID_HOME },
        provenance: { maintenanceRateBps: "estimate" },
      }),
    ).toThrow(ZodError);
    expect(() =>
      trueCostRequestSchema.parse({
        data: { ...VALID_HOME },
        bogus: 1,
      }),
    ).toThrow(ZodError);
  });

  it("parses compare envelopes and rejects missing/malformed sides", () => {
    const both = compareRequestSchema.parse({
      a: { data: { ...VALID_HOME } },
      b: { data: { ...VALID_HOME, hoaMonthlyCents: 5_000 } },
    });
    expect(both.b.data.hoaMonthlyCents).toBe(5_000);
    expect(() =>
      compareRequestSchema.parse({ a: { data: { ...VALID_HOME } } }),
    ).toThrow(ZodError);
    expect(() =>
      compareRequestSchema.parse({
        a: { data: { ...VALID_HOME } },
        b: { data: { ...VALID_HOME, homePriceCents: 0 } },
      }),
    ).toThrow(ZodError);
  });

  it("parses what-if envelopes and validates overrides independently", () => {
    const parsed = whatIfRequestSchema.parse({
      base: { data: { ...VALID_HOME } },
      overrides: { annualTaxCents: 240_000 },
    });
    expect(parsed.overrides).toEqual({ annualTaxCents: 240_000 });
    expect(() =>
      whatIfRequestSchema.parse({
        base: { data: { ...VALID_HOME } },
        overrides: { annualTaxCents: -1 },
      }),
    ).toThrow(ZodError);
    expect(() =>
      whatIfRequestSchema.parse({
        base: { data: { ...VALID_HOME } },
        overrides: { termMonths: 180 },
      }),
    ).toThrow(ZodError);
  });
});

describe("provenance resolution", () => {
  it("resolves defaults with no closing entry when costs are omitted", () => {
    const data = trueCostInputSchema.parse({ ...VALID_HOME });
    const resolved = resolveTrueCostProvenance(
      data,
      trueCostProvenanceSchema.parse({}),
    );
    expect(resolved).toEqual({
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
    expect("closingCostsCents" in resolved).toBe(false);
  });

  it("preserves explicit estimate and user-provided claims", () => {
    const data = trueCostInputSchema.parse({ ...VALID_HOME });
    const resolved = resolveTrueCostProvenance(
      data,
      trueCostProvenanceSchema.parse({
        annualTaxCents: "estimate",
        annualInsuranceCents: "user-provided",
      }),
    );
    expect(resolved.annualTaxCents).toBe("estimate");
    expect(resolved.annualInsuranceCents).toBe("user-provided");
    expect(resolved.maintenanceRateBps).toBe("assumption");
  });

  it("defaults supplied closing costs to estimate", () => {
    const data = trueCostInputSchema.parse({
      ...VALID_HOME,
      closingCostsCents: 900_000,
    });
    const resolved = resolveTrueCostProvenance(
      data,
      trueCostProvenanceSchema.parse({}),
    );
    expect(resolved.closingCostsCents).toBe("estimate");
  });

  it("preserves explicitly user-provided closing costs", () => {
    const data = trueCostInputSchema.parse({
      ...VALID_HOME,
      closingCostsCents: 900_000,
    });
    const resolved = resolveTrueCostProvenance(
      data,
      trueCostProvenanceSchema.parse({
        closingCostsCents: "user-provided",
      }),
    );
    expect(resolved.closingCostsCents).toBe("user-provided");
  });

  it("resolves affordability provenance as all user-provided", () => {
    expect(resolveAffordabilityProvenance()).toEqual({
      takeHomeMonthlyCents: "user-provided",
      debtsMonthlyCents: "user-provided",
      expensesMonthlyCents: "user-provided",
      savingsCents: "user-provided",
      proposedHousingMonthlyCents: "user-provided",
    });
  });

  it("reproduces base provenance for empty overrides", () => {
    const data = trueCostInputSchema.parse({ ...VALID_HOME });
    const base = resolveTrueCostProvenance(
      data,
      trueCostProvenanceSchema.parse({ annualTaxCents: "estimate" }),
    );
    const scenario = resolveScenarioProvenance(
      base,
      whatIfOverridesSchema.parse({}),
    );
    expect(scenario).toEqual({ ...base });
    expect(scenarioProvenanceSchema.parse(scenario)).toEqual(scenario);
  });

  it("marks overridden fields as scenario assumptions, carrying the rest", () => {
    const data = trueCostInputSchema.parse({ ...VALID_HOME });
    const base = resolveTrueCostProvenance(
      data,
      trueCostProvenanceSchema.parse({ annualInsuranceCents: "estimate" }),
    );
    const scenario = resolveScenarioProvenance(
      base,
      whatIfOverridesSchema.parse({ annualTaxCents: 240_000 }),
    );
    expect(scenario.annualTaxCents).toBe("assumption");
    expect(scenario.annualInsuranceCents).toBe("estimate");
    expect(scenario.downPaymentCents).toBe("user-provided");
    expect(scenario.maintenanceRateBps).toBe("assumption");
    expect("closingCostsCents" in scenario).toBe(false);
  });
});
