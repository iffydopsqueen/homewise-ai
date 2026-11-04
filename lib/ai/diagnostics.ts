import { META_MODEL_ID } from "./metaClient";
import type {
  MetaCallErrorKind,
  MetaIncompleteDetail,
  MetaUsage,
} from "./metaClient";
import type { ValidationReason } from "./validateExplanation";
import type { ExplainWorkflow } from "../validation/explain";

// Privacy-safe server diagnostics for POST /api/explain (T5a.1).
//
// Server-only: imported solely by the explain route (and its tests), never
// by browser code. When HOMEWISE_AI_DIAGNOSTICS is exactly "1", the route
// emits one concise JSON record per request to the server terminal. Every
// field below is allowlisted; financial values, prompts, model output,
// provider bodies, and secrets can never appear because they are never
// passed in — timings, categories, and token counts only.

export const DIAGNOSTICS_ENV_KEY = "HOMEWISE_AI_DIAGNOSTICS";

export const DIAGNOSTIC_EVENT = "ai_explain";

export function isDiagnosticsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[DIAGNOSTICS_ENV_KEY] === "1";
}

// Monotonic millisecond clock. performance is a Node global; the route
// runtime always provides it.
export function nowMs(): number {
  return performance.now();
}

// Bounded, nonnegative integer milliseconds. Guards against clock
// anomalies so a bad reading can never corrupt a record.
export function elapsedMs(startMs: number, endMs: number): number {
  const ms = Math.round(endMs - startMs);
  if (!Number.isFinite(ms) || ms < 0) {
    return 0;
  }
  return ms;
}

export type DiagnosticOutcome = "success" | "failure";

// Provider-internal kinds pass through verbatim; route-level outcomes use
// the additional categories. Validator rejections report
// "validation_rejected" plus the specific validator reason below, so they
// stay distinguishable from provider HTTP failures.
export type DiagnosticFailureCategory =
  | MetaCallErrorKind
  | "validation_rejected"
  | "invalid_json"
  | "validation_error"
  | "internal_error";

export interface DiagnosticStages {
  parseMs?: number;
  factsMs?: number;
  promptMs?: number;
  // Combined provider round-trip plus response processing (fetch, body
  // parse, output extraction). Deliberately NOT labeled inference time:
  // the client structure does not separate network from parsing.
  providerMs?: number;
  validateMs?: number;
}

// Fixed provider identity for live-demo evidence. Literal types admit no
// other values, so a record can never claim a different provider, model,
// or API than the one this server actually calls.
export const DIAGNOSTIC_PROVIDER = "meta" as const;
export const DIAGNOSTIC_API = "responses" as const;

export interface DiagnosticRecord {
  event: typeof DIAGNOSTIC_EVENT;
  provider: typeof DIAGNOSTIC_PROVIDER;
  model: typeof META_MODEL_ID;
  api: typeof DIAGNOSTIC_API;
  workflow?: ExplainWorkflow;
  outcome: DiagnosticOutcome;
  failureCategory?: DiagnosticFailureCategory;
  validatorReason?: ValidationReason;
  totalMs: number;
  stages: DiagnosticStages;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  incompleteReason?: string;
}

export interface DiagnosticUsageInput {
  usage?: MetaUsage;
  detail?: MetaIncompleteDetail;
}

// Merge allowlisted token counters from a successful usage block and/or an
// incomplete-response detail block. Absent counts stay absent: zeros are
// never fabricated, and nothing is inferred from text length.
export function tokenFields(input: DiagnosticUsageInput): {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  incompleteReason?: string;
} {
  return {
    inputTokens: input.usage?.inputTokens,
    outputTokens: input.usage?.outputTokens ?? input.detail?.outputTokens,
    reasoningTokens:
      input.usage?.reasoningTokens ?? input.detail?.reasoningTokens,
    incompleteReason: input.detail?.reason,
  };
}

// Emit one record. Total failure-isolation: logging must never convert an
// otherwise successful explanation into a failure.
export function emitDiagnostic(record: DiagnosticRecord): void {
  try {
    console.info(JSON.stringify(record));
  } catch {
    // Intentionally ignored: diagnostics are best-effort observability.
  }
}
