import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type { Fact } from "../../lib/ai/facts";
import {
  EFFORT_ENV_KEY,
  isExplainEnabled,
  requestStructuredExplanation,
  resolveReasoningEffort,
} from "../../lib/ai/metaClient";
import {
  buildModelInput,
  buildResponseJsonSchema,
  EXPLANATION_FORMAT_NAME,
} from "../../lib/ai/prompts";

// Meta client tests. fetch is always mocked: no live calls, ever. The fake
// key and sentinel input below are fixtures, not secrets.

const FAKE_KEY = "sk-test-SENTINEL-KEY-42";

function testFact(): Fact {
  return {
    id: "f1",
    label: "Total monthly obligations",
    modelLabel: "Total monthly obligations",
    displayValue: "$5,100.00",
    kind: "calculated",
    cents: [510_000],
    milliPct: [],
    bps: [],
    monthsX10: [],
    years: [],
    bare: ["5100"],
  };
}

function testInput() {
  return buildModelInput("affordability", [testFact()]);
}

function testEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    MODEL_API_KEY: FAKE_KEY,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
  } as Response;
}

function errorResponse(status: number, retryAfter?: string): Response {
  const headers = new Headers();
  if (retryAfter !== undefined) {
    headers.set("retry-after", retryAfter);
  }
  return { ok: false, status, headers, json: async () => ({}) } as Response;
}

function completedPayload(text: string): unknown {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

const MODEL_JSON = JSON.stringify({
  observations: [{ text: "Obligations total $5,100.00.", factIds: ["f1"] }],
  limitations: { text: "Nothing further.", factIds: ["f1"] },
});

describe("request contract", () => {
  it("POSTs the exact endpoint, model, and flat format structure", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const input = testInput();
    const schema = buildResponseJsonSchema();
    const result = await requestStructuredExplanation(
      input,
      EXPLANATION_FORMAT_NAME,
      schema,
      { fetchFn, env: testEnv() },
    );
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${FAKE_KEY}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse((init?.body ?? "") as string)).toEqual({
      model: "muse-spark-1.3",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "homewise_explanation",
          schema,
          strict: true,
        },
      },
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 8000,
    });
  });

  it("never emits strict:false", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse((init?.body ?? "") as string) as {
      text: { format: { strict: unknown } };
    };
    expect(body.text.format.strict).toBe(true);
  });
});

describe("reasoning effort override (T5a.2-I experiment)", () => {
  // All cases inject env objects directly: process.env is never touched,
  // so no override can leak between tests.
  it.each([
    [{}, "low"],
    [{ [EFFORT_ENV_KEY]: "minimal" }, "minimal"],
    [{ [EFFORT_ENV_KEY]: "low" }, "low"],
    [{ [EFFORT_ENV_KEY]: "" }, "low"],
    [{ [EFFORT_ENV_KEY]: "none" }, "low"],
    [{ [EFFORT_ENV_KEY]: "minimal " }, "low"],
    [{ [EFFORT_ENV_KEY]: "MINIMAL" }, "low"],
    [{ [EFFORT_ENV_KEY]: "medium" }, "low"],
  ])("resolveReasoningEffort(%j) === %j", (env, expected) => {
    expect(resolveReasoningEffort(env as NodeJS.ProcessEnv)).toBe(expected);
  });

  it("sends reasoning.effort minimal with all other fields unchanged", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const input = testInput();
    const schema = buildResponseJsonSchema();
    const result = await requestStructuredExplanation(
      input,
      EXPLANATION_FORMAT_NAME,
      schema,
      { fetchFn, env: testEnv({ [EFFORT_ENV_KEY]: "minimal" }) },
    );
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    expect(JSON.parse((init?.body ?? "") as string)).toEqual({
      model: "muse-spark-1.3",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "homewise_explanation",
          schema,
          strict: true,
        },
      },
      reasoning: { effort: "minimal" },
      store: false,
      max_output_tokens: 8000,
    });
  });

  it.each([["none"], [""], ["medium"], ["MINIMAL"]])(
    "falls back to low for %j without touching other fields",
    async (value) => {
      const fetchFn = vi.fn<typeof fetch>(async () =>
        jsonResponse(completedPayload(MODEL_JSON)),
      );
      await requestStructuredExplanation(
        testInput(),
        EXPLANATION_FORMAT_NAME,
        buildResponseJsonSchema(),
        { fetchFn, env: testEnv({ [EFFORT_ENV_KEY]: value }) },
      );
      const [, init] = fetchFn.mock.calls[0];
      const body = JSON.parse((init?.body ?? "") as string) as {
        reasoning: unknown;
        model: unknown;
        store: unknown;
        max_output_tokens: unknown;
      };
      expect(body.reasoning).toEqual({ effort: "low" });
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.store).toBe(false);
      expect(body.max_output_tokens).toBe(8000);
    },
  );

  it("preserves failure mapping under the override with one call", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => errorResponse(500));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv({ [EFFORT_ENV_KEY]: "minimal" }) },
    );
    expect(result).toEqual({ ok: false, kind: "server_error" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("kill switch", () => {
  it.each([
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", AI_EXPLAIN_ENABLED: "true" }, true],
    [{ NODE_ENV: "production", AI_EXPLAIN_ENABLED: "false" }, false],
    [{ NODE_ENV: "production", AI_EXPLAIN_ENABLED: "yes" }, false],
    [{ NODE_ENV: "production", AI_EXPLAIN_ENABLED: "" }, false],
    [{ NODE_ENV: "development" }, true],
    [{ NODE_ENV: "development", AI_EXPLAIN_ENABLED: "false" }, false],
    [{ NODE_ENV: "test" }, true],
  ])("isExplainEnabled(%j) === %j", (env, expected) => {
    expect(isExplainEnabled(env as NodeJS.ProcessEnv)).toBe(expected);
  });

  it("short-circuits with zero fetch calls when disabled", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      {
        fetchFn,
        env: testEnv({ NODE_ENV: "production", AI_EXPLAIN_ENABLED: "false" }),
      },
    );
    expect(result).toEqual({ ok: false, kind: "disabled" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("missing key", () => {
  it("short-circuits with zero fetch calls", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const env = testEnv();
    delete env.MODEL_API_KEY;
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env },
    );
    expect(result).toEqual({ ok: false, kind: "missing_key" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("treats a blank key as missing", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv({ MODEL_API_KEY: "   " }) },
    );
    expect(result).toEqual({ ok: false, kind: "missing_key" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("successful extraction", () => {
  it("returns the parsed model JSON", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: true, data: JSON.parse(MODEL_JSON) });
  });

  it("concatenates multiple text parts and skips non-message items", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        status: "completed",
        output: [
          { type: "reasoning", content: [{ type: "summary_text" }] },
          {
            type: "message",
            content: [
              { type: "output_text", text: '{"a":' },
              { type: "output_text", text: "1}" },
            ],
          },
        ],
      }),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });
});

describe("successful usage metadata", () => {
  async function callWithUsage(usage: unknown) {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ ...(completedPayload(MODEL_JSON) as object), usage }),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    return result;
  }

  it("preserves all three counters on success", async () => {
    const result = await callWithUsage({
      input_tokens: 441,
      output_tokens: 8000,
      output_tokens_details: { reasoning_tokens: 7900 },
    });
    expect(result).toEqual({
      ok: true,
      data: JSON.parse(MODEL_JSON),
      usage: { inputTokens: 441, outputTokens: 8000, reasoningTokens: 7900 },
    });
  });

  it("accepts partial usage and omits absent fields", async () => {
    const result = await callWithUsage({
      output_tokens_details: { reasoning_tokens: 120 },
    });
    expect(result).toEqual({
      ok: true,
      data: JSON.parse(MODEL_JSON),
      usage: { reasoningTokens: 120 },
    });
  });

  it("omits the usage key when no usage block exists", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(completedPayload(MODEL_JSON)),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: true, data: JSON.parse(MODEL_JSON) });
    expect("usage" in result).toBe(false);
  });

  it("omits invalid counters without failing the response", async () => {
    for (const usage of [
      { input_tokens: -1, output_tokens: 50 },
      { output_tokens: 1.5, output_tokens_details: { reasoning_tokens: 7 } },
      {
        input_tokens: Number.MAX_SAFE_INTEGER + 1,
        output_tokens_details: { reasoning_tokens: "many" },
      },
      { input_tokens: null, output_tokens: NaN },
      "not-an-object",
    ]) {
      const result = await callWithUsage(usage);
      expect(result.ok).toBe(true);
    }
    const partial = await callWithUsage({
      input_tokens: -3,
      output_tokens: 50,
    });
    expect(partial).toEqual({
      ok: true,
      data: JSON.parse(MODEL_JSON),
      usage: { outputTokens: 50 },
    });
  });
});

describe("malformed output", () => {
  it.each([
    ["non-completed status", { status: "incomplete", output: [] }],
    ["failed status", { status: "failed", output: [] }],
    [
      "refusal part",
      {
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", text: "no" }] },
        ],
      },
    ],
    [
      "missing output text",
      { status: "completed", output: [{ type: "message", content: [] }] },
    ],
    ["empty text", completedPayload("")],
    ["non-JSON text", completedPayload("not json {")],
    ["output not an array", { status: "completed", output: "x" }],
    ["missing status", { output: [] }],
    ["null payload", null],
    ["string payload", "completed"],
  ])("rejects %s", async (_label, payload) => {
    const fetchFn = vi.fn(async () => jsonResponse(payload));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind: "malformed_output" });
  });

  it("rejects an unreadable response body", async () => {
    const fetchFn = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => {
          throw new Error("bad body");
        },
      } as unknown as Response;
    });
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind: "malformed_output" });
  });
});

describe("HTTP errors", () => {
  it.each([
    [400, "invalid_request"],
    [422, "invalid_request"],
    [401, "auth_error"],
    [403, "auth_error"],
    [500, "server_error"],
    [503, "server_error"],
  ])("maps %i to %s", async (status, kind) => {
    const fetchFn = vi.fn(async () => errorResponse(status));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind });
  });

  it("maps 429 with retry-after seconds", async () => {
    const fetchFn = vi.fn(async () => errorResponse(429, "7"));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({
      ok: false,
      kind: "rate_limited",
      retryAfterMs: 7000,
    });
  });

  it("maps 429 without retry guidance when the header is absent", async () => {
    const fetchFn = vi.fn(async () => errorResponse(429));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind: "rate_limited" });
  });

  it("ignores an unparseable retry-after header", async () => {
    const fetchFn = vi.fn(async () => errorResponse(429, "soon"));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind: "rate_limited" });
  });
});

describe("incomplete diagnostics", () => {
  function incompletePayload(extra: Record<string, unknown>) {
    return {
      status: "incomplete",
      output: [{ type: "reasoning" }],
      ...extra,
    };
  }

  async function callWith(payload: unknown) {
    const fetchFn = vi.fn(async () => jsonResponse(payload));
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    return result;
  }

  it("preserves valid reason and usage counts internally", async () => {
    const result = await callWith(
      incompletePayload({
        incomplete_details: { reason: "max_output_tokens" },
        usage: {
          output_tokens: 8000,
          output_tokens_details: { reasoning_tokens: 7900 },
        },
      }),
    );
    expect(result).toEqual({
      ok: false,
      kind: "malformed_output",
      detail: {
        reason: "max_output_tokens",
        outputTokens: 8000,
        reasoningTokens: 7900,
      },
    });
  });

  it("discards overlong, malformed, or unexpected reasons", async () => {
    for (const reason of [
      "x".repeat(65),
      "has spaces",
      "9starts-with-digit",
      "",
      "semi;colon",
      42,
      null,
      { nested: "object" },
    ]) {
      const result = await callWith(
        incompletePayload({
          incomplete_details: { reason },
          usage: { output_tokens: 10 },
        }),
      );
      expect(result).toEqual({
        ok: false,
        kind: "malformed_output",
        detail: { outputTokens: 10 },
      });
    }
  });

  it("discards negative, fractional, unsafe, or mistyped counts", async () => {
    for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "8000", null, NaN]) {
      const result = await callWith(
        incompletePayload({
          incomplete_details: { reason: "max_output_tokens" },
          usage: {
            output_tokens: bad,
            output_tokens_details: { reasoning_tokens: bad },
          },
        }),
      );
      expect(result).toEqual({
        ok: false,
        kind: "malformed_output",
        detail: { reason: "max_output_tokens" },
      });
    }
  });

  it("omits diagnostics entirely when no valid field exists", async () => {
    for (const extra of [
      {},
      { incomplete_details: null },
      { incomplete_details: { reason: "way too long ".repeat(20) } },
      { usage: { output_tokens: -5 } },
      { usage: "not-an-object" },
    ]) {
      const result = await callWith(incompletePayload(extra));
      expect(result).toEqual({ ok: false, kind: "malformed_output" });
      expect("detail" in result).toBe(false);
    }
  });

  it("never preserves raw text, bodies, or unrelated metadata", async () => {
    const result = await callWith(
      incompletePayload({
        incomplete_details: {
          reason: "max_output_tokens",
          message: "SENTINEL-SECRET-MESSAGE $9,999.99",
        },
        usage: {
          output_tokens: 8000,
          input_tokens: 123,
          output_tokens_details: {
            reasoning_tokens: 7900,
            other: "SENTINEL-OTHER",
          },
        },
        error: { message: "SENTINEL-ERROR" },
      }),
    );
    expect(result).toEqual({
      ok: false,
      kind: "malformed_output",
      detail: {
        reason: "max_output_tokens",
        outputTokens: 8000,
        reasoningTokens: 7900,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SENTINEL");
    expect(serialized).not.toContain("$9,999.99");
    expect(serialized).not.toContain(FAKE_KEY);
  });
});

describe("transport failures", () => {
  it("maps fetch rejection to network_error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind: "network_error" });
  });

  it("maps a hung request to timeout", async () => {
    const fetchFn = vi.fn(
      () => new Promise<Response>(() => {}),
    );
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv(), timeoutMs: 20 },
    );
    expect(result).toEqual({ ok: false, kind: "timeout" });
  });

  it("maps AbortError to timeout", async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const result = await requestStructuredExplanation(
      testInput(),
      EXPLANATION_FORMAT_NAME,
      buildResponseJsonSchema(),
      { fetchFn, env: testEnv() },
    );
    expect(result).toEqual({ ok: false, kind: "timeout" });
  });
});

describe("timeout configuration", () => {
  function hungFetch(onCall?: (signal: AbortSignal | null) => void) {
    return vi.fn(
      async (
        _url: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
      onCall?.(init?.signal ?? null);
      await new Promise<Response>(() => {});
      throw new Error("unreachable");
      },
    );
  }

  async function settledWithin(promise: Promise<unknown>): Promise<boolean> {
    let settled = false;
    void promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    return settled;
  }

  it("times out at the 60s default with abort, cleanup, and no retry", async () => {
    vi.useFakeTimers();
    try {
      const seen: { signal: AbortSignal | null } = { signal: null };
      const fetchFn = hungFetch((s) => {
        seen.signal = s;
      });
      const pending = requestStructuredExplanation(
        testInput(),
        EXPLANATION_FORMAT_NAME,
        buildResponseJsonSchema(),
        { fetchFn, env: testEnv() },
      );
      await vi.advanceTimersByTimeAsync(59_999);
      expect(await settledWithin(pending)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result).toEqual({ ok: false, kind: "timeout" });
      expect(seen.signal?.aborted).toBe(true);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets an explicit override take precedence over the default", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = hungFetch();
      const pending = requestStructuredExplanation(
        testInput(),
        EXPLANATION_FORMAT_NAME,
        buildResponseJsonSchema(),
        { fetchFn, env: testEnv(), timeoutMs: 1000 },
      );
      await vi.advanceTimersByTimeAsync(999);
      expect(await settledWithin(pending)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result).toEqual({ ok: false, kind: "timeout" });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sanitization", () => {
  it("keeps failure results to kind plus optional retry delay", async () => {
    const cases: Array<[Response, object]> = [
      [errorResponse(400), { ok: false, kind: "invalid_request" }],
      [errorResponse(401), { ok: false, kind: "auth_error" }],
      [errorResponse(429, "3"), { ok: false, kind: "rate_limited", retryAfterMs: 3000 }],
      [errorResponse(503), { ok: false, kind: "server_error" }],
      [jsonResponse({ status: "failed", output: [] }), { ok: false, kind: "malformed_output" }],
    ];
    for (const [response, expected] of cases) {
      const fetchFn = vi.fn(async () => response);
      const result = await requestStructuredExplanation(
        testInput(),
        EXPLANATION_FORMAT_NAME,
        buildResponseJsonSchema(),
        { fetchFn, env: testEnv() },
      );
      expect(result).toEqual(expected);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(FAKE_KEY);
      expect(serialized).not.toContain("$5,100.00");
    }
  });

  it("never logs credentials, prompts, or figures", () => {
    const source = readFileSync("lib/ai/metaClient.ts", "utf8");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("process.stdout");
    expect(source).not.toContain("process.stderr");
  });
});
