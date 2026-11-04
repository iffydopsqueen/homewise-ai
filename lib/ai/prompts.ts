import type { Fact } from "./facts";

// Prompt construction for Muse Spark explanations.
//
// The model receives a fixed developer instruction plus a per-workflow user
// block containing ONLY the server-generated fact ledger. It never receives
// raw user input, session data, or anything beyond the facts below.

// Shared output limits, enforced both by the Meta structured-output schema
// and by server-side Zod validation (the code is authoritative).
export const MAX_OBSERVATIONS = 6;
export const MAX_OBSERVATION_CHARS = 400;
export const MAX_LIMITATIONS_CHARS = 300;
export const MAX_FACT_REFS = 8;

export const EXPLANATION_FORMAT_NAME = "homewise_explanation";

const STANDING_INSTRUCTIONS = [
  "You explain homebuying figures to a first-time homebuyer in plain language.",
  "Use only the numbered facts provided. Every number you write must come from a fact you cite, restated exactly as shown, and every observation must cite at least one fact ID. Do not write fact IDs in your prose; they belong in the citation lists only.",
  "Never introduce new figures, calculations, conversions, counts, or factual claims beyond the facts.",
  "Do not use the words estimated, assume, assumption, calculated, computed, user-provided, or exact figure, and do not say what the user entered or provided: the application labels every figure itself.",
  "Write every quantity as digits with units ($, %, months, years), never as words like five or thirty, and never use multiplier words like double, twice, or half: state figures directly.",
  "When a fact shows a negative difference, write the amount without any minus sign and express the direction in words (for example, write $200 per month lower, not -$200): the sign is shown in the fact, not in your prose.",
  "Never say whether anyone can afford a home, and never describe a property as affordable, comfortable, safe, or financially suitable.",
  "Never recommend buying, selling, choosing, or picking any property, and never rank properties or name a winner.",
  "Explain technical terms briefly in parentheses on first use, for example principal and interest (the loan repayment part of the payment).",
  "Be honest about missing information using only the facts marked info.",
  // T5b.2 concise plain-language guidance. Softer than the schema caps on
  // purpose: these steer wording without creating new rejection paths.
  "Write for a first-time homebuyer: short everyday words, one clear point per observation, and one or two sentences at most.",
  "Start each observation with the point itself, not with a preamble about the figures. Never repeat how anything was calculated, and never restate the same point twice.",
  "Aim for two or three observations covering the most useful points; fewer strong observations beat padding.",
  "State limitations in one or two short sentences covering only genuine uncertainty or assumptions; never drop a real limitation to save space.",
  // T6-R3 naturalness polish. Steering only: these shape wording without
  // adding rejection paths (validation is unchanged) or new claims.
  "Lead with the takeaway: open each observation with the main point in one or two short, complete sentences, explain what the figures mean rather than reciting every input, and always name the period of each amount (per month, per year, or one-time).",
  "Write plainly and only once: no long single-sentence inventories, no stock phrases, no mentions of app labels, and no repeated points across observations; describe PMI as not provided at most once, and call one-time amounts estimated upfront cash rather than money due at signing.",
].join(" ");

const WORKFLOW_BRIEFS: Record<string, string> = {
  affordability:
    "Explain what this affordability snapshot shows: what remains after the entered expenses, what share of take-home income housing represents, and what the savings cushion means in practical terms.",
  "true-cost":
    "Explain what this property costs each month: which expense contributes most, which figures are estimates versus provided amounts, and how upfront cash differs from recurring costs.",
  compare:
    "Explain how the two properties differ: the most important monthly difference, what mainly explains it, and how annual and upfront costs compare. Stay neutral: describe direction and size of each difference (B minus A) without ranking the properties or suggesting either one.",
};

export function renderLedger(facts: Fact[]): string {
  // Model-facing labels only (user-controlled line labels stay in the UI),
  // with control characters stripped so no ledger line can break into a
  // second line or smuggle instructions.
  return facts
    .map(
      (fact) =>
        `${fact.id} [${fact.kind}] ${fact.modelLabel}: ${fact.displayValue}`.replace(
          /[\x00-\x1F\x7F]+/g,
          " ",
        ),
    )
    .join("\n");
}

export interface ModelTextPart {
  type: "input_text";
  text: string;
}

export interface ModelInputMessage {
  role: "developer" | "user";
  content: [ModelTextPart];
}

// Single-turn stateless Responses API input. No history, no tools, no files.
export function buildModelInput(
  workflow: "affordability" | "true-cost" | "compare",
  facts: Fact[],
): [ModelInputMessage, ModelInputMessage] {
  return [
    {
      role: "developer",
      content: [{ type: "input_text", text: STANDING_INSTRUCTIONS }],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `${WORKFLOW_BRIEFS[workflow]}\n\nFacts:\n${renderLedger(facts)}\n\nRespond with two or three observations plus limitations (${MAX_OBSERVATIONS} at most).`,
        },
      ],
    },
  ];
}

export interface ObservationFormatSchema {
  type: "object";
  properties: {
    text: { type: "string"; minLength: number; maxLength: number };
    factIds: {
      type: "array";
      minItems: number;
      maxItems: number;
      items: { type: "string"; pattern: string };
    };
  };
  required: string[];
  additionalProperties: false;
}

export interface ExplanationFormatSchema {
  type: "object";
  properties: {
    observations: {
      type: "array";
      minItems: number;
      maxItems: number;
      items: ObservationFormatSchema;
    };
    limitations: ObservationFormatSchema;
  };
  required: string[];
  additionalProperties: false;
}

function observationSchema(maxChars: number): ObservationFormatSchema {
  return {
    type: "object",
    properties: {
      text: { type: "string", minLength: 1, maxLength: maxChars },
      factIds: {
        type: "array",
        minItems: 1,
        maxItems: MAX_FACT_REFS,
        items: { type: "string", pattern: "^f[1-9][0-9]*$" },
      },
    },
    required: ["text", "factIds"],
    additionalProperties: false,
  };
}

// JSON Schema for the Responses API text.format field (type json_schema,
// strict true). Kept to basic keywords only: objects, arrays, strings,
// lengths, patterns, required. The server re-validates everything.
export function buildResponseJsonSchema(): ExplanationFormatSchema {
  return {
    type: "object",
    properties: {
      observations: {
        type: "array",
        minItems: 1,
        maxItems: MAX_OBSERVATIONS,
        items: observationSchema(MAX_OBSERVATION_CHARS),
      },
      limitations: observationSchema(MAX_LIMITATIONS_CHARS),
    },
    required: ["observations", "limitations"],
    additionalProperties: false,
  };
}
