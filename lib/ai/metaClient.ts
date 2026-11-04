import { z } from "zod";

import type {
  ExplanationFormatSchema,
  ModelInputMessage,
} from "./prompts";

// Minimal Meta Responses API client for HomeWise AI explanations.
//
// Single responsibility: POST one stateless structured-output request and
// return the extracted JSON payload (or a sanitized failure). All prompt
// construction lives in prompts.ts, all output validation in
// validateExplanation.ts; the route (Checkpoint B) wires them together.
//
// Verified against the official reference:
// https://dev.meta.ai/docs/api-reference/responses/schemas
// https://dev.meta.ai/docs/error-handling
//
// Security posture: the API key is read here and only here, at call time,
// from server-side environment. Nothing is ever logged. Failures carry a
// stable kind (and an optional retry delay) — never provider bodies,
// prompts, figures, or credentials.

const META_RESPONSES_URL = "https://api.meta.ai/v1/responses";

// Standard (non-Contributor) model. Contributor variants grant Meta training
// rights over our content and must never be selected here. Exported for UI
// attribution and diagnostics only — never sent anywhere but the API call.
export const META_MODEL_ID = "muse-spark-1.3";

const MAX_OUTPUT_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRY_AFTER_MS = 300_000;

export type MetaCallErrorKind =
  | "disabled"
  | "missing_key"
  | "invalid_request"
  | "auth_error"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "timeout"
  | "malformed_output";

export type MetaCallResult =
  | { ok: true; data: unknown; usage?: MetaUsage }
  | {
      ok: false;
      kind: MetaCallErrorKind;
      retryAfterMs?: number;
      detail?: MetaIncompleteDetail;
    };

// Sanitized token-usage counters from a successful response. Internal to
// the server-side client only, like MetaIncompleteDetail: never forwarded
// to user-facing errors, logs, or API responses. Every counter is
// allowlisted; anything missing or invalid is omitted rather than
// preserved, and absent usage never fails an otherwise valid response.
export interface MetaUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

// Sanitized incomplete-response diagnostics. Internal to the server-side
// client only: future callers (routes, UI) must never forward this to
// user-facing errors, logs, or API responses. Every field is allowlisted;
// anything missing or invalid is omitted rather than preserved.
export interface MetaIncompleteDetail {
  reason?: string;
  outputTokens?: number;
  reasoningTokens?: number;
}

export interface MetaClientOptions {
  fetchFn?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

// Kill switch. Production fails closed: explanations run only when
// AI_EXPLAIN_ENABLED is exactly "true". Any other value (missing, empty,
// anything else) disables. Outside production the feature defaults on for
// local development, and only an explicit "false" disables it.
export function isExplainEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = env.AI_EXPLAIN_ENABLED;
  if (flag === "false") {
    return false;
  }
  if (env.NODE_ENV === "production") {
    return flag === "true";
  }
  return true;
}

// Controlled reasoning experiment (T5a.2-I). Server-only override for the
// Responses API `reasoning.effort` field (never the Chat Completions
// top-level `reasoning_effort`). Exact-string match, fail-closed to the
// known-good "low": "none" is unsupported by the provider and can never
// be selected here. Not a production recommendation.
export const EFFORT_ENV_KEY = "HOMEWISE_AI_EFFORT";

export type ReasoningEffort = "low" | "minimal";

export function resolveReasoningEffort(env: NodeJS.ProcessEnv): ReasoningEffort {
  return env[EFFORT_ENV_KEY] === "minimal" ? "minimal" : "low";
}

// Provider response shape, non-strict: added provider fields must not break
// parsing, but every field we depend on is still type-checked.
const outputContentSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

const outputItemSchema = z.object({
  type: z.string(),
  content: z.array(outputContentSchema).optional(),
});

const metaResponseSchema = z.object({
  status: z.string(),
  output: z.array(outputItemSchema),
});

class MetaTimeoutError extends Error {}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const seconds = Number.parseInt(value.trim(), 10);
  if (Number.isSafeInteger(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const when = Date.parse(value);
  if (!Number.isNaN(when)) {
    return Math.min(Math.max(when - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

// Incomplete reasons are short machine identifiers (for example
// "max_output_tokens"). Anything else — long, malformed, or unexpected
// strings — is discarded rather than preserved.
const INCOMPLETE_REASON_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function isSafeCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (value as number) >= 0
  );
}

// Extract allowlisted diagnostics from a parsed provider payload. Each
// field is validated independently, so one invalid field never drops its
// valid siblings. Returns undefined when no valid field is present.
function extractDetail(payload: unknown): MetaIncompleteDetail | undefined {
  if (payload === null || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const detail: MetaIncompleteDetail = {};
  const incomplete = record.incomplete_details;
  if (incomplete !== null && typeof incomplete === "object") {
    const reason = (incomplete as Record<string, unknown>).reason;
    if (typeof reason === "string" && INCOMPLETE_REASON_PATTERN.test(reason)) {
      detail.reason = reason;
    }
  }
  const usage = record.usage;
  if (usage !== null && typeof usage === "object") {
    const usageRecord = usage as Record<string, unknown>;
    if (isSafeCount(usageRecord.output_tokens)) {
      detail.outputTokens = usageRecord.output_tokens;
    }
    const inner = usageRecord.output_tokens_details;
    if (inner !== null && typeof inner === "object") {
      const reasoningTokens = (inner as Record<string, unknown>)
        .reasoning_tokens;
      if (isSafeCount(reasoningTokens)) {
        detail.reasoningTokens = reasoningTokens;
      }
    }
  }
  return detail.reason === undefined &&
    detail.outputTokens === undefined &&
    detail.reasoningTokens === undefined
    ? undefined
    : detail;
}

// Extract allowlisted usage counters from a parsed provider payload.
// Each counter is validated independently; invalid siblings are omitted
// and a missing usage block yields undefined, never a failure.
function extractUsage(payload: unknown): MetaUsage | undefined {
  if (payload === null || typeof payload !== "object") {
    return undefined;
  }
  const usage = (payload as Record<string, unknown>).usage;
  if (usage === null || typeof usage !== "object") {
    return undefined;
  }
  const record = usage as Record<string, unknown>;
  const result: MetaUsage = {};
  if (isSafeCount(record.input_tokens)) {
    result.inputTokens = record.input_tokens;
  }
  if (isSafeCount(record.output_tokens)) {
    result.outputTokens = record.output_tokens;
  }
  const inner = record.output_tokens_details;
  if (inner !== null && typeof inner === "object") {
    const reasoningTokens = (inner as Record<string, unknown>)
      .reasoning_tokens;
    if (isSafeCount(reasoningTokens)) {
      result.reasoningTokens = reasoningTokens;
    }
  }
  return result.inputTokens === undefined &&
    result.outputTokens === undefined &&
    result.reasoningTokens === undefined
    ? undefined
    : result;
}

function classifyStatus(status: number): MetaCallErrorKind {
  if (status === 401 || status === 403) {
    return "auth_error";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "server_error";
  }
  return "invalid_request";
}

// Extract the concatenated output_text of a completed response. Refusals,
// non-completed statuses, and missing/empty text all fail: the caller maps
// every null to malformed_output.
function extractOutputText(payload: unknown): string | null {
  const parsed = metaResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.status !== "completed") {
    return null;
  }
  let text = "";
  for (const item of parsed.data.output) {
    if (item.type !== "message" || item.content === undefined) {
      continue;
    }
    for (const part of item.content) {
      if (part.type === "refusal") {
        return null;
      }
      if (part.type === "output_text" && part.text !== undefined) {
        text += part.text;
      }
    }
  }
  return text === "" ? null : text;
}

export async function requestStructuredExplanation(
  input: ModelInputMessage[],
  formatName: string,
  formatSchema: ExplanationFormatSchema,
  options: MetaClientOptions = {},
): Promise<MetaCallResult> {
  const env = options.env ?? process.env;
  if (!isExplainEnabled(env)) {
    return { ok: false, kind: "disabled" };
  }
  const apiKey = env.MODEL_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return { ok: false, kind: "missing_key" };
  }

  const controller = new AbortController();
  // Race, not signal-only: a hung fetch that never settles (or never honors
  // abort) still resolves to timeout. The controller aborts the underlying
  // request so conforming implementations also release their connection.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pending = (options.fetchFn ?? fetch)(META_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: META_MODEL_ID,
        input,
        text: {
          format: {
            type: "json_schema",
            name: formatName,
            schema: formatSchema,
            strict: true,
          },
        },
        reasoning: { effort: resolveReasoningEffort(env) },
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });
    const onTimeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(new MetaTimeoutError());
        },
        options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      );
    });
    const response = await Promise.race([pending, onTimeout]);
    if (!response.ok) {
      const kind = classifyStatus(response.status);
      if (kind === "rate_limited") {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get("retry-after"),
        );
        return retryAfterMs === undefined
          ? { ok: false, kind }
          : { ok: false, kind, retryAfterMs };
      }
      return { ok: false, kind };
    }
    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      return { ok: false, kind: "malformed_output" };
    }
    const text = extractOutputText(payload);
    if (text === null) {
      const detail = extractDetail(payload);
      return detail === undefined
        ? { ok: false, kind: "malformed_output" }
        : { ok: false, kind: "malformed_output", detail };
    }
    try {
      const data = JSON.parse(text) as unknown;
      const usage = extractUsage(payload);
      return usage === undefined
        ? { ok: true, data }
        : { ok: true, data, usage };
    } catch {
      const detail = extractDetail(payload);
      return detail === undefined
        ? { ok: false, kind: "malformed_output" }
        : { ok: false, kind: "malformed_output", detail };
    }
  } catch (error) {
    if (
      error instanceof MetaTimeoutError ||
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return { ok: false, kind: "timeout" };
    }
    return { ok: false, kind: "network_error" };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
