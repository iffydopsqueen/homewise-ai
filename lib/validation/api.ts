import { z } from "zod";

import {
  affordabilityInputSchema,
  trueCostInputSchema,
  whatIfOverridesSchema,
  type TrueCostInput,
  type WhatIfOverrides,
} from "./calc";

// API request envelopes and provenance validation (Phase 5, step 1).
//
// Provenance vocabulary (the only permitted labels): "user-provided" |
// "estimate" | "assumption".
//
// Assignment: the client may CLAIM a label per figure field, but the server
// assigns the final label. Each field declares the labels it accepts; any
// other claim is rejected, and omitted fields resolve to server defaults.
// Labels record how a figure entered the request - HomeWise AI never
// independently verifies any figure or classification.
//
// Per-field rules and their sources:
// - maintenanceRateBps: "assumption" only (ARCHITECTURE.md D.3: the reserve
//   is always labeled an assumption).
// - annualTaxCents, annualInsuranceCents, hoaMonthlyCents: "user-provided"
//   or "estimate" (ARCHITECTURE.md D.2), defaulting to "user-provided".
// - homePriceCents, downPaymentCents, annualRateMilliPct, termMonths:
//   "user-provided" only (user-typed scenario parameters; the approved docs
//   give no basis for "estimate" here, so it is rejected, not invented).
// - pmiMonthlyCents: "user-provided" only (user-entered figure, no
//   estimation formula in this phase).
// - otherCosts (whole array): "user-provided" only (D.4 "user-specified").
// - closingCostsCents: "user-provided" or "estimate"; an absent entry
//   resolves to "estimate" when costs are supplied (owner decision: never
//   over-claim trust), and no entry is created when costs are omitted.
// - All five affordability figures: "user-provided" only (PRODUCT_SPEC.md
//   section 6: users state these values; no estimate support documented).
// - assumptionSetId is excluded: it is an opaque id, not a figure.
// - What-if overrides take no client provenance: overridden fields resolve
//   to "assumption" (scenario assumptions), carried fields keep base labels.

const userProvided = z.literal("user-provided");
const userProvidedOrEstimate = z.enum(["user-provided", "estimate"]);
const assumption = z.literal("assumption");
const anyLabel = z.enum(["user-provided", "estimate", "assumption"]);

export type ProvenanceLabel = z.output<typeof anyLabel>;

export const trueCostProvenanceSchema = z
  .object({
    homePriceCents: userProvided.optional(),
    downPaymentCents: userProvided.optional(),
    annualRateMilliPct: userProvided.optional(),
    termMonths: userProvided.optional(),
    annualTaxCents: userProvidedOrEstimate.optional(),
    annualInsuranceCents: userProvidedOrEstimate.optional(),
    hoaMonthlyCents: userProvidedOrEstimate.optional(),
    maintenanceRateBps: assumption.optional(),
    pmiMonthlyCents: userProvided.optional(),
    otherCosts: userProvided.optional(),
    closingCostsCents: userProvidedOrEstimate.optional(),
  })
  .strict();

export const affordabilityProvenanceSchema = z
  .object({
    takeHomeMonthlyCents: userProvided.optional(),
    debtsMonthlyCents: userProvided.optional(),
    expensesMonthlyCents: userProvided.optional(),
    savingsCents: userProvided.optional(),
    proposedHousingMonthlyCents: userProvided.optional(),
  })
  .strict();

export const resolvedTrueCostProvenanceSchema = z
  .object({
    homePriceCents: userProvided,
    downPaymentCents: userProvided,
    annualRateMilliPct: userProvided,
    termMonths: userProvided,
    annualTaxCents: userProvidedOrEstimate,
    annualInsuranceCents: userProvidedOrEstimate,
    hoaMonthlyCents: userProvidedOrEstimate,
    maintenanceRateBps: assumption,
    pmiMonthlyCents: userProvided,
    otherCosts: userProvided,
    closingCostsCents: userProvidedOrEstimate.optional(),
  })
  .strict();

export const resolvedAffordabilityProvenanceSchema = z
  .object({
    takeHomeMonthlyCents: userProvided,
    debtsMonthlyCents: userProvided,
    expensesMonthlyCents: userProvided,
    savingsCents: userProvided,
    proposedHousingMonthlyCents: userProvided,
  })
  .strict();

export const scenarioProvenanceSchema =
  resolvedTrueCostProvenanceSchema.extend({
    downPaymentCents: anyLabel,
    annualRateMilliPct: anyLabel,
    annualTaxCents: anyLabel,
    annualInsuranceCents: anyLabel,
    maintenanceRateBps: anyLabel,
  });

export const labeledTrueCostInputSchema = z
  .object({
    data: trueCostInputSchema,
    provenance: trueCostProvenanceSchema.default({}),
  })
  .strict();

export const affordabilityRequestSchema = z
  .object({
    data: affordabilityInputSchema,
    provenance: affordabilityProvenanceSchema.default({}),
  })
  .strict();

export const trueCostRequestSchema = labeledTrueCostInputSchema;

export const compareRequestSchema = z
  .object({
    a: labeledTrueCostInputSchema,
    b: labeledTrueCostInputSchema,
  })
  .strict();

export const whatIfRequestSchema = z
  .object({
    base: labeledTrueCostInputSchema,
    overrides: whatIfOverridesSchema,
  })
  .strict();

export type TrueCostProvenanceClaim = z.output<typeof trueCostProvenanceSchema>;
export type AffordabilityProvenanceClaim = z.output<
  typeof affordabilityProvenanceSchema
>;
export type ResolvedTrueCostProvenance = z.output<
  typeof resolvedTrueCostProvenanceSchema
>;
export type ResolvedAffordabilityProvenance = z.output<
  typeof resolvedAffordabilityProvenanceSchema
>;
export type ScenarioProvenance = z.output<typeof scenarioProvenanceSchema>;
export type AffordabilityRequest = z.output<typeof affordabilityRequestSchema>;
export type TrueCostRequest = z.output<typeof trueCostRequestSchema>;
export type CompareRequest = z.output<typeof compareRequestSchema>;
export type WhatIfRequest = z.output<typeof whatIfRequestSchema>;

export function resolveTrueCostProvenance(
  data: TrueCostInput,
  claimed: TrueCostProvenanceClaim,
): ResolvedTrueCostProvenance {
  return resolvedTrueCostProvenanceSchema.parse({
    homePriceCents: "user-provided",
    downPaymentCents: "user-provided",
    annualRateMilliPct: "user-provided",
    termMonths: "user-provided",
    annualTaxCents: claimed.annualTaxCents ?? "user-provided",
    annualInsuranceCents: claimed.annualInsuranceCents ?? "user-provided",
    hoaMonthlyCents: claimed.hoaMonthlyCents ?? "user-provided",
    maintenanceRateBps: "assumption",
    pmiMonthlyCents: "user-provided",
    otherCosts: "user-provided",
    ...(data.closingCostsCents === undefined
      ? {}
      : { closingCostsCents: claimed.closingCostsCents ?? "estimate" }),
  });
}

export function resolveAffordabilityProvenance(): ResolvedAffordabilityProvenance {
  // Every affordability figure is user-provided by definition; the claim map
  // exists only so mislabeling is rejected at parse time.
  return resolvedAffordabilityProvenanceSchema.parse({
    takeHomeMonthlyCents: "user-provided",
    debtsMonthlyCents: "user-provided",
    expensesMonthlyCents: "user-provided",
    savingsCents: "user-provided",
    proposedHousingMonthlyCents: "user-provided",
  });
}

const SCENARIO_OVERRIDE_FIELDS = [
  "downPaymentCents",
  "annualRateMilliPct",
  "annualTaxCents",
  "annualInsuranceCents",
  "maintenanceRateBps",
] as const;

export function resolveScenarioProvenance(
  base: ResolvedTrueCostProvenance,
  overrides: WhatIfOverrides,
): ScenarioProvenance {
  const scenario: Record<string, unknown> = { ...base };
  for (const field of SCENARIO_OVERRIDE_FIELDS) {
    if (overrides[field] !== undefined) {
      scenario[field] = "assumption";
    }
  }
  return scenarioProvenanceSchema.parse(scenario);
}
