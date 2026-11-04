import type { Fact } from "../ai/facts";
import { postJson, type ApiResult } from "./client";

// Typed client for POST /api/explain. The server recomputes every figure
// and returns only validator-accepted narrative plus server facts; this
// module shapes that contract for the UI and owns the retry policy.

// Retry allowlist: only codes with documented transient meaning get a
// manual retry button. Everything else (invalid requests, internal
// errors, ambiguous or unknown codes) fails closed with no retry.
const RETRYABLE_CODES = new Set(["ai_unavailable", "network_error"]);

export function isRetryable(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}

export interface ExplainObservation {
  text: string;
  facts: Fact[];
}

export interface ExplainData {
  workflow: string;
  observations: ExplainObservation[];
  limitations: ExplainObservation;
}

const KNOWN_KINDS = new Set([
  "user-provided",
  "estimate",
  "assumption",
  "calculated",
  "info",
]);

function isFact(value: unknown): value is Fact {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    typeof record.displayValue === "string" &&
    typeof record.kind === "string" &&
    KNOWN_KINDS.has(record.kind)
  );
}

function isObservation(value: unknown): value is ExplainObservation {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.text === "string" &&
    Array.isArray(record.facts) &&
    record.facts.every(isFact)
  );
}

function isExplainData(value: unknown): value is ExplainData {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.workflow === "string" &&
    Array.isArray(record.observations) &&
    record.observations.every(isObservation) &&
    isObservation(record.limitations)
  );
}

export async function requestExplanation(
  payload: unknown,
): Promise<ApiResult<ExplainData>> {
  const response = await postJson<ExplainData>("/api/explain", payload);
  if (!response.ok) {
    return response;
  }
  // Defense in depth: never render a malformed success body. Neutral
  // copy (non-retryable): unlike the client's own unexpected failure, no
  // retry button is offered here, so the message must not invite one.
  if (!isExplainData(response.data)) {
    return {
      ok: false,
      error: {
        code: "unexpected_error",
        message: "Something went wrong.",
      },
    };
  }
  return { ok: true, data: response.data };
}
