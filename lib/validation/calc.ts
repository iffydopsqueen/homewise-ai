import { z } from "zod";

import { MAX_CENTS } from "../calc/money";

// Zod schemas for the calculation engine (Phase 4). Every exported engine
// function parses its input through these schemas first: TypeScript types
// vanish at runtime, but these checks reject malformed values for real.
// All objects are .strict() (unknown keys rejected) and nothing here coerces:
// no z.coerce anywhere, so malformed financial input fails loudly.

// Rates use integer units so schemas stay exact: annualRateMilliPct is
// thousandths of a percent (6.5% = 6500); maintenanceRateBps is basis points
// of home value per year (1% = 100).

const oneTimeCents = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(MAX_CENTS)
  .brand<"Cents">();
const positiveOneTimeCents = z
  .number()
  .finite()
  .int()
  .min(1)
  .max(MAX_CENTS)
  .brand<"Cents">();
const monthlyCents = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(MAX_CENTS)
  .brand<"CentsMonthly">();
const positiveMonthlyCents = z
  .number()
  .finite()
  .int()
  .min(1)
  .max(MAX_CENTS)
  .brand<"CentsMonthly">();
const annualCents = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(MAX_CENTS)
  .brand<"CentsAnnual">();
const annualRateMilliPct = z.number().finite().int().min(0).max(100_000);
const maintenanceRateBps = z.number().finite().int().min(0).max(10_000);
const termMonths = z.number().finite().int().min(12).max(480);

export const otherCostLineSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    monthly: monthlyCents,
  })
  .strict();

export const trueCostInputSchema = z
  .object({
    homePriceCents: positiveOneTimeCents,
    // May equal or exceed the price: that means "no mortgage", per D.1.
    downPaymentCents: oneTimeCents,
    annualRateMilliPct,
    termMonths,
    annualTaxCents: annualCents,
    annualInsuranceCents: annualCents,
    hoaMonthlyCents: monthlyCents,
    // Explicit annual maintenance rate; the engine has no hidden default.
    maintenanceRateBps,
    // Dedicated optional PMI figure (no estimation formula in this phase).
    pmiMonthlyCents: monthlyCents.optional(),
    otherCosts: z.array(otherCostLineSchema).max(100).default([]),
    // Optional with deliberately NO default: an absent value must surface a
    // warning, never silently behave as zero (see TrueCostResult).
    closingCostsCents: oneTimeCents.optional(),
    // Opaque assumption-set id; comparison flags inequality (see D.7).
    assumptionSetId: z.string().trim().min(1).max(80).default("default"),
  })
  .strict();

export const affordabilityInputSchema = z
  .object({
    // Take-home (after-tax) monthly income, per PRODUCT_SPEC.md. Minimum 1:
    // affordability cannot be assessed on zero income, and the engine must
    // never divide by zero.
    takeHomeMonthlyCents: positiveMonthlyCents,
    // Required minimum monthly debt payments (not balances).
    debtsMonthlyCents: monthlyCents,
    // Recurring non-housing, non-debt living costs.
    expensesMonthlyCents: monthlyCents,
    savingsCents: oneTimeCents,
    // The housing payment under test.
    proposedHousingMonthlyCents: monthlyCents,
  })
  .strict();

export const monthlyPaymentInputSchema = z
  .object({
    // Zero allowed: zero principal means a zero payment, not an error.
    principalCents: oneTimeCents,
    annualRateMilliPct,
    termMonths,
  })
  .strict();

export const whatIfOverridesSchema = z
  .object({
    downPaymentCents: oneTimeCents,
    annualRateMilliPct,
    annualTaxCents: annualCents,
    annualInsuranceCents: annualCents,
    maintenanceRateBps,
  })
  .strict()
  .partial();

export type TrueCostInput = z.output<typeof trueCostInputSchema>;
export type AffordabilityInput = z.output<typeof affordabilityInputSchema>;
export type MonthlyPaymentInput = z.output<typeof monthlyPaymentInputSchema>;
export type WhatIfOverrides = z.output<typeof whatIfOverridesSchema>;
