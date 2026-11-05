import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/explain/route";
import {
  DIAGNOSTIC_EVENT,
  DIAGNOSTICS_ENV_KEY,
  elapsedMs,
  isDiagnosticsEnabled,
  tokenFields,
  type DiagnosticRecord,
} from "../../lib/ai/diagnostics";
import type { Fact } from "../../lib/ai/facts";
import {
  buildAffordabilityFacts,
  buildTrueCostFacts,
} from "../../lib/ai/facts";
import { assessAffordability } from "../../lib/calc/affordability";
import { calculateTrueCost } from "../../lib/calc/trueCost";
import {
  resolveAffordabilityProvenance,
  resolveTrueCostProvenance,
} from "../../lib/validation/api";
import { trueCostInputSchema } from "../../lib/validation/calc";

// T5a.1 diagnostics tests. The provider is always stubbed via
// globalThis.fetch: no live Meta calls. console.info is spied (never
// printed) and every environment override is restored after each test.

const FAKE_KEY = "SENTINEL-KEY-7X";
const COUNT_SENTINEL = 424242;
const REASON_SENTINEL = "sentinel_reason_7x";

const AI_UNAVAILABLE_BODY = {
  ok: false,
  error: {
    code: "ai_unavailable",
    message:
      "AI explanations are unavailable right now. Your calculations are unaffected.",
  },
};

const VALID_AFFORDABILITY = {
  takeHomeMonthlyCents: 600_000,
  debtsMonthlyCents: 50_000,
  expensesMonthlyCents: 200_000,
  savingsCents: 1_500_000,
  proposedHousingMonthlyCents: 180_000,
};

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

// Every field the diagnostic record is ever allowed to carry.
const ALLOWED_KEYS = new Set([
  "event",
  "provider",
  "model",
  "api",
  "workflow",
  "outcome",
  "failureCategory",
  "validatorReason",
  "bannedCategory",
  "totalMs",
  "stages",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "incompleteReason",
]);

const ALLOWED_STAGE_KEYS = new Set([
  "parseMs",
  "factsMs",
  "promptMs",
  "providerMs",
  "validateMs",
]);

const REAL_FETCH = globalThis.fetch;
let savedKey: string | undefined;
let savedFlag: string | undefined;
let savedDiagnostics: string | undefined;

beforeEach(() => {
  savedKey = process.env.MODEL_API_KEY;
  savedFlag = process.env.AI_EXPLAIN_ENABLED;
  savedDiagnostics = process.env[DIAGNOSTICS_ENV_KEY];
  process.env.MODEL_API_KEY = FAKE_KEY;
  process.env.AI_EXPLAIN_ENABLED = "true";
  delete process.env[DIAGNOSTICS_ENV_KEY];
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
  if (savedKey === undefined) {
    delete process.env.MODEL_API_KEY;
  } else {
    process.env.MODEL_API_KEY = savedKey;
  }
  if (savedFlag === undefined) {
    delete process.env.AI_EXPLAIN_ENABLED;
  } else {
    process.env.AI_EXPLAIN_ENABLED = savedFlag;
  }
  if (savedDiagnostics === undefined) {
    delete process.env[DIAGNOSTICS_ENV_KEY];
  } else {
    process.env[DIAGNOSTICS_ENV_KEY] = savedDiagnostics;
  }
});

function stubFetch(impl: () => Promise<Response>) {
  const fetchFn = vi.fn(impl);
  globalThis.fetch = fetchFn as unknown as typeof fetch;
  return fetchFn;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
  } as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    headers: new Headers(),
    json: async () => ({}),
  } as Response;
}

function completedPayload(text: string): unknown {
  return {
    status: "completed",
    output: [
      { type: "message", content: [{ type: "output_text", text }] },
    ],
  };
}

function modelJsonFor(facts: Fact[]): string {
  const first = facts[0];
  if (first === undefined) {
    throw new Error("test requires at least one fact");
  }
  return JSON.stringify({
    observations: [
      { text: `Total is ${first.displayValue}.`, factIds: [first.id] },
    ],
    limitations: { text: "Nothing further.", factIds: [first.id] },
  });
}

function affordabilityFacts(): Fact[] {
  return buildAffordabilityFacts(
    assessAffordability(VALID_AFFORDABILITY),
    resolveAffordabilityProvenance(),
  );
}

function trueCostFacts(): Fact[] {
  const home = trueCostInputSchema.parse(VALID_HOME);
  return buildTrueCostFacts(
    calculateTrueCost(home),
    resolveTrueCostProvenance(home, {}),
  );
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function infoCalls(): string[] {
  const spy = console.info as unknown as { mock: { calls: unknown[][] } };
  return spy.mock.calls.map((call) => String(call[0]));
}

function lastRecord(): DiagnosticRecord {
  const calls = infoCalls();
  if (calls.length === 0) {
    throw new Error("expected a diagnostic record to be emitted");
  }
  return JSON.parse(calls[calls.length - 1] as string) as DiagnosticRecord;
}

function expectValidDurations(record: DiagnosticRecord): void {
  expect(Number.isInteger(record.totalMs)).toBe(true);
  expect(record.totalMs).toBeGreaterThanOrEqual(0);
  for (const [key, value] of Object.entries(record.stages)) {
    expect(ALLOWED_STAGE_KEYS.has(key)).toBe(true);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
}

describe("diagnostics helper", () => {
  it("enables only on the exact opt-in value", () => {
    const enabled = {
      [DIAGNOSTICS_ENV_KEY]: "1",
    } as unknown as NodeJS.ProcessEnv;
    expect(isDiagnosticsEnabled(enabled)).toBe(true);
    for (const value of [undefined, "", "0", "true", "yes", "2"]) {
      const env = (
        value === undefined ? {} : { [DIAGNOSTICS_ENV_KEY]: value }
      ) as unknown as NodeJS.ProcessEnv;
      expect(isDiagnosticsEnabled(env)).toBe(false);
    }
  });

  it("bounds elapsed durations at zero", () => {
    expect(elapsedMs(10, 25)).toBe(15);
    expect(elapsedMs(25, 10)).toBe(0);
    expect(elapsedMs(10, 10)).toBe(0);
    expect(elapsedMs(Number.NaN, 10)).toBe(0);
    expect(elapsedMs(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("merges token fields without fabricating absent counts", () => {
    expect(tokenFields({})).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      reasoningTokens: undefined,
      incompleteReason: undefined,
    });
    expect(
      tokenFields({
        usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 3 },
      }),
    ).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: 3,
      incompleteReason: undefined,
    });
    expect(
      tokenFields({
        detail: { reason: "max_output_tokens", outputTokens: 7 },
      }),
    ).toEqual({
      inputTokens: undefined,
      outputTokens: 7,
      reasoningTokens: undefined,
      incompleteReason: "max_output_tokens",
    });
  });
});

describe("diagnostic emission gate", () => {
  it.each([[undefined], ["0"], ["yes"]])(
    "emits nothing when the flag is %j",
    async (flag) => {
      if (flag !== undefined) {
        process.env[DIAGNOSTICS_ENV_KEY] = flag as string;
      }
      const facts = affordabilityFacts();
      stubFetch(async () =>
        jsonResponse(completedPayload(modelJsonFor(facts))),
      );
      const response = await POST(
        postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
      );
      expect(response.status).toBe(200);
      expect(infoCalls()).toHaveLength(0);
    },
  );

  it("emits exactly one allowlisted record per request when enabled", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const facts = affordabilityFacts();
    const fetchFn = stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(200);
    expect(infoCalls()).toHaveLength(1);
    const record = lastRecord();
    for (const key of Object.keys(record)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
    expect(record.event).toBe(DIAGNOSTIC_EVENT);
    expect(record.provider).toBe("meta");
    expect(record.model).toBe("muse-spark-1.3");
    expect(record.api).toBe("responses");
    expect(record.workflow).toBe("affordability");
    expect(record.outcome).toBe("success");
    expect(record.failureCategory).toBeUndefined();
    expect(Object.keys(record.stages).sort()).toEqual([
      "factsMs",
      "parseMs",
      "promptMs",
      "providerMs",
      "validateMs",
    ]);
    expectValidDurations(record);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("usage and incomplete metadata", () => {
  it("records available usage counts on success", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const facts = affordabilityFacts();
    stubFetch(async () =>
      jsonResponse({
        ...(completedPayload(modelJsonFor(facts)) as object),
        usage: {
          input_tokens: 111,
          output_tokens: 222,
          output_tokens_details: { reasoning_tokens: 333 },
        },
      }),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(200);
    const record = lastRecord();
    expect(record.inputTokens).toBe(111);
    expect(record.outputTokens).toBe(222);
    expect(record.reasoningTokens).toBe(333);
  });

  it("omits usage counts when the provider sends none", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const facts = affordabilityFacts();
    stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(200);
    const record = lastRecord();
    expect("inputTokens" in record).toBe(false);
    expect("outputTokens" in record).toBe(false);
    expect("reasoningTokens" in record).toBe(false);
  });

  it("records safe incomplete-response categories on failure", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    stubFetch(async () =>
      jsonResponse({
        status: "incomplete",
        output: [{ type: "reasoning" }],
        incomplete_details: { reason: REASON_SENTINEL },
        usage: {
          output_tokens: COUNT_SENTINEL,
          output_tokens_details: { reasoning_tokens: COUNT_SENTINEL },
        },
      }),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(503);
    const record = lastRecord();
    expect(record.outcome).toBe("failure");
    expect(record.failureCategory).toBe("malformed_output");
    expect(record.incompleteReason).toBe(REASON_SENTINEL);
    expect(record.outputTokens).toBe(COUNT_SENTINEL);
    expect(record.reasoningTokens).toBe(COUNT_SENTINEL);
    expect("inputTokens" in record).toBe(false);
    expectValidDurations(record);
  });
});

describe("failure classification", () => {
  it.each([
    ["server_error", 500],
    ["server_error", 503],
    ["rate_limited", 429],
    ["auth_error", 401],
    ["auth_error", 403],
    ["invalid_request", 400],
  ] as const)("records %s for provider status %i", async (kind, status) => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const fetchFn = stubFetch(async () => errorResponse(status));
    const response = await POST(
      postRequest({ workflow: "true-cost", data: VALID_HOME }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    const record = lastRecord();
    expect(record.outcome).toBe("failure");
    expect(record.workflow).toBe("true-cost");
    expect(record.failureCategory).toBe(kind);
    expectValidDurations(record);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("records network_error for fetch failures", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    stubFetch(async () => {
      throw new Error("socket hang up");
    });
    const response = await POST(
      postRequest({ workflow: "true-cost", data: VALID_HOME }),
    );
    expect(response.status).toBe(503);
    expect(lastRecord().failureCategory).toBe("network_error");
  });

  it("records timeout when the provider never settles", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    stubFetch(() => new Promise<Response>(() => {}));
    vi.useFakeTimers();
    try {
      const pending = POST(
        postRequest({ workflow: "true-cost", data: VALID_HOME }),
      );
      await vi.advanceTimersByTimeAsync(61_000);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
      const record = lastRecord();
      expect(record.outcome).toBe("failure");
      expect(record.failureCategory).toBe("timeout");
      expectValidDurations(record);
    } finally {
      vi.useRealTimers();
    }
  });

  it("distinguishes validation rejection from provider failures", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    stubFetch(async () =>
      jsonResponse(
        completedPayload(
          JSON.stringify({
            observations: [{ text: "Total is $1.00.", factIds: ["f999"] }],
            limitations: { text: "Nothing further.", factIds: ["f1"] },
          }),
        ),
      ),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(503);
    const record = lastRecord();
    expect(record.outcome).toBe("failure");
    expect(record.failureCategory).toBe("validation_rejected");
    expect(record.validatorReason).toBe("unknown_fact");
    expect(record.bannedCategory).toBeUndefined();
  });

  it("tags banned-language rejections with a safe rule category", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    stubFetch(async () =>
      jsonResponse(
        completedPayload(
          JSON.stringify({
            observations: [
              { text: "The estimated total is fine.", factIds: ["f1"] },
            ],
            limitations: { text: "Nothing further.", factIds: ["f1"] },
          }),
        ),
      ),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    const record = lastRecord();
    expect(record.failureCategory).toBe("validation_rejected");
    expect(record.validatorReason).toBe("banned_language");
    expect(record.bannedCategory).toBe("provenance");
  });

  it("records disabled and missing-key paths with zero provider calls", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    process.env.AI_EXPLAIN_ENABLED = "false";
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const disabled = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(disabled.status).toBe(503);
    expect(lastRecord().failureCategory).toBe("disabled");
    process.env.AI_EXPLAIN_ENABLED = "true";
    delete process.env.MODEL_API_KEY;
    const missing = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(missing.status).toBe(503);
    expect(lastRecord().failureCategory).toBe("missing_key");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("records requests that fail before reaching the provider", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const malformed = await POST(postRequest("{not json"));
    expect(malformed.status).toBe(400);
    expect(lastRecord().failureCategory).toBe("invalid_json");
    const invalid = await POST(postRequest({ workflow: "affordability" }));
    expect(invalid.status).toBe(400);
    expect(lastRecord().failureCategory).toBe("validation_error");
    expect("workflow" in lastRecord()).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("diagnostic safety", () => {
  it("cannot break a successful request when logging throws", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const facts = trueCostFacts();
    stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    (
      console.info as unknown as { mockImplementation: (fn: () => void) => void }
    ).mockImplementation(() => {
      throw new Error("console unavailable");
    });
    const response = await POST(
      postRequest({ workflow: "true-cost", data: VALID_HOME }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("never leaks figures, prompts, output, or secrets into records", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const facts = affordabilityFacts();
    stubFetch(async () =>
      jsonResponse({
        ...(completedPayload(modelJsonFor(facts)) as object),
        usage: {
          input_tokens: 111,
          output_tokens: COUNT_SENTINEL,
          output_tokens_details: { reasoning_tokens: 333 },
        },
      }),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(200);
    const serialized = infoCalls().join("\n");
    // Financial values from the request and ledger, model prose, key.
    for (const forbidden of [
      FAKE_KEY,
      "600000",
      "180000",
      "1500000",
      facts[0]?.displayValue ?? "IMPOSSIBLE",
      "Total is",
      "Nothing further",
      "homewise_explanation",
      "input_text",
      "MODEL_API_KEY",
      "Bearer",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Usage sentinel IS expected (allowlisted metadata, not a figure).
    expect(serialized).toContain(String(COUNT_SENTINEL));
  });

  it("leaves public response bodies unchanged when enabled", async () => {
    process.env[DIAGNOSTICS_ENV_KEY] = "1";
    const facts = affordabilityFacts();
    stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    const body = (await response.json()) as {
      ok: boolean;
      data: Record<string, unknown>;
    };
    expect(Object.keys(body.data).sort()).toEqual([
      "limitations",
      "observations",
      "workflow",
    ]);
    const failing = stubFetch(async () => errorResponse(500));
    const failed = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
