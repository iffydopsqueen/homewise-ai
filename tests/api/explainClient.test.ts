import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isRetryable,
  requestExplanation,
  type ExplainData,
} from "../../lib/api/explainClient";

// /api/explain client tests. fetch is stubbed: no live calls.

const REAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
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

const EXPLAIN_DATA: ExplainData = {
  workflow: "affordability",
  observations: [
    {
      text: "Obligations total $5,100.00.",
      facts: [
        {
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
        },
      ],
    },
  ],
  limitations: { text: "Nothing further.", facts: [] },
};

describe("isRetryable", () => {
  it.each([
    ["ai_unavailable", true],
    ["network_error", true],
    ["validation_error", false],
    ["invalid_json", false],
    ["internal_error", false],
    ["unexpected_error", false],
    ["method_not_allowed", false],
    ["bogus-code", false],
    ["", false],
  ])("isRetryable(%j) === %j", (code, expected) => {
    expect(isRetryable(code)).toBe(expected);
  });
});

describe("requestExplanation", () => {
  it("posts the payload and returns validated data", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: EXPLAIN_DATA }),
    );
    globalThis.fetch = fetchFn;
    const payload = { workflow: "affordability", data: {} };
    const result = await requestExplanation(payload);
    expect(result).toEqual({ ok: true, data: EXPLAIN_DATA });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/explain");
    expect(JSON.parse((init?.body ?? "") as string)).toEqual(payload);
  });

  it("passes server failures through with their codes", async () => {
    stubFetch(async () =>
      jsonResponse(
        {
          ok: false,
          error: {
            code: "ai_unavailable",
            message:
              "AI explanations are unavailable right now. Your calculations are unaffected.",
          },
        },
        503,
      ),
    );
    const result = await requestExplanation({ workflow: "affordability" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ai_unavailable");
      expect(isRetryable(result.error.code)).toBe(true);
    }
  });

  it("maps network failure to network_error", async () => {
    stubFetch(async () => {
      throw new Error("socket hang up");
    });
    const result = await requestExplanation({ workflow: "affordability" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "network_error",
        message: "Could not reach the server. Check your connection and try again.",
      },
    });
  });

  it("rejects malformed success bodies as unexpected_error", async () => {
    const badKind = (kind: unknown) => ({
      ...EXPLAIN_DATA,
      observations: [
        {
          text: "Obligations total $5,100.00.",
          facts: [{ ...(EXPLAIN_DATA.observations[0]?.facts[0] as object), kind }],
        },
      ],
    });
    for (const data of [
      null,
      { workflow: "affordability" },
      { ...EXPLAIN_DATA, observations: [{ text: "x" }] },
      { ...EXPLAIN_DATA, limitations: "soon" },
      badKind("bogus"),
      badKind(42),
      badKind(undefined),
    ]) {
      stubFetch(async () => jsonResponse({ ok: true, data }));
      const result = await requestExplanation({ workflow: "affordability" });
      expect(result).toEqual({
        ok: false,
        error: {
          code: "unexpected_error",
          message: "Something went wrong.",
        },
      });
    }
  });
});
