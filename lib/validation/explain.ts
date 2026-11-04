import { z } from "zod";

import {
  labeledTrueCostInputSchema,
  trueCostProvenanceSchema,
} from "./api";
import { affordabilityInputSchema, trueCostInputSchema } from "./calc";

// Explanation request envelopes (Muse Spark integration). Each variant
// carries the workflow's engine inputs — never precomputed figures — so
// the route recomputes deterministically and explains only what it
// verified itself. What-If stays rejected until its UI exists.

export const explainWorkflowSchema = z.enum([
  "affordability",
  "true-cost",
  "compare",
]);

const affordabilityExplainSchema = z
  .object({
    workflow: z.literal("affordability"),
    data: affordabilityInputSchema,
  })
  .strict();

const trueCostExplainSchema = z
  .object({
    workflow: z.literal("true-cost"),
    data: trueCostInputSchema,
    provenance: trueCostProvenanceSchema.default({}),
  })
  .strict();

const compareExplainSchema = z
  .object({
    workflow: z.literal("compare"),
    a: labeledTrueCostInputSchema,
    b: labeledTrueCostInputSchema,
  })
  .strict();

export const explainRequestSchema = z.discriminatedUnion("workflow", [
  affordabilityExplainSchema,
  trueCostExplainSchema,
  compareExplainSchema,
]);

export type ExplainRequest = z.output<typeof explainRequestSchema>;
export type ExplainWorkflow = z.output<typeof explainWorkflowSchema>;
