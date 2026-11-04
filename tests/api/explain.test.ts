import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/explain/route";
import type { Fact } from "../../lib/ai/facts";
import {
  buildAffordabilityFacts,
  buildCompareFacts,
  buildTrueCostFacts,
} from "../../lib/ai/facts";
import { assessAffordability } from "../../lib/calc/affordability";
import { compareProperties } from "../../lib/calc/compare";
import { calculateTrueCost } from "../../lib/calc/trueCost";
import {
  resolveAffordabilityProvenance,
  resolveTrueCostProvenance,
} from "../../lib/validation/api";
import { trueCostInputSchema } from "../../lib/validation/calc";

// /api/explain route tests. The provider is always stubbed via
// globalThis.fetch: no live Meta calls, ever. Environment is controlled
// per test with reliable restoration.

const FAKE_KEY = "SENTINEL-KEY-7X";
const MODEL_SENTINEL = "SENTINEL-MODEL-TEXT-7X";
const REASON_SENTINEL = "sentinel_reason_7x";
const COUNT_SENTINEL = 424242;

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

const VALID_HOME_B = { ...VALID_HOME, annualTaxCents: 240_000 };

const REAL_FETCH = globalThis.fetch;
let savedKey: string | undefined;
let savedFlag: string | undefined;

beforeEach(() => {
  savedKey = process.env.MODEL_API_KEY;
  savedFlag = process.env.AI_EXPLAIN_ENABLED;
  process.env.MODEL_API_KEY = FAKE_KEY;
  process.env.AI_EXPLAIN_ENABLED = "true";
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
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

// Model output that restates one server fact exactly, so the production
// validator accepts it against the route's own ledger.
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

function compareFacts(): Fact[] {
  const homeA = trueCostInputSchema.parse(VALID_HOME);
  const homeB = trueCostInputSchema.parse(VALID_HOME_B);
  return buildCompareFacts(
    compareProperties(homeA, homeB),
    resolveTrueCostProvenance(homeA, {}),
    resolveTrueCostProvenance(homeB, {}),
  );
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("successful explanations", () => {
  it("explains affordability from recomputed server facts", async () => {
    const facts = affordabilityFacts();
    const fetchFn = stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: {
        workflow: string;
        observations: Array<{ text: string; facts: Fact[] }>;
        limitations: { text: string; facts: Fact[] };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.workflow).toBe("affordability");
    expect(body.data.observations).toHaveLength(1);
    expect(body.data.observations[0]?.facts).toEqual([facts[0]]);
    expect(body.data.limitations.facts).toEqual([facts[0]]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("explains true cost from recomputed server facts", async () => {
    const facts = trueCostFacts();
    const fetchFn = stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    const response = await POST(
      postRequest({ workflow: "true-cost", data: VALID_HOME }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { workflow: string; observations: Array<{ facts: Fact[] }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.workflow).toBe("true-cost");
    expect(body.data.observations[0]?.facts).toEqual([facts[0]]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("explains comparisons from recomputed server facts", async () => {
    const facts = compareFacts();
    const fetchFn = stubFetch(async () =>
      jsonResponse(completedPayload(modelJsonFor(facts))),
    );
    const response = await POST(
      postRequest({
        workflow: "compare",
        a: { data: VALID_HOME },
        b: { data: VALID_HOME_B },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { workflow: string; observations: Array<{ facts: Fact[] }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.workflow).toBe("compare");
    expect(body.data.observations[0]?.facts).toEqual([facts[0]]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns only validated text and server facts, never diagnostics", async () => {
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
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "incomplete_details",
      "reasoning_tokens",
      "output_tokens",
      "usage",
      "detail",
      FAKE_KEY,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("never forwards provider usage counters to the response", async () => {
    const facts = affordabilityFacts();
    const fetchFn = stubFetch(async () =>
      jsonResponse({
        ...(completedPayload(modelJsonFor(facts)) as object),
        usage: {
          input_tokens: 424241,
          output_tokens: 424242,
          output_tokens_details: { reasoning_tokens: 424243 },
        },
      }),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: {
        observations: Array<{ text: string; facts: Fact[] }>;
        limitations: { text: string };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.observations).toHaveLength(1);
    expect(body.data.observations[0]?.facts).toEqual([facts[0]]);
    expect(body.data.limitations.text).toBe("Nothing further.");
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "424241",
      "424242",
      "424243",
      "usage",
      "input_tokens",
      "output_tokens",
      "reasoning_tokens",
      "inputTokens",
      "outputTokens",
      "reasoningTokens",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("request validation", () => {
  it.each([
    ["unknown top-level field", { workflow: "affordability", data: VALID_AFFORDABILITY, extra: 1 }],
    ["injected result", { workflow: "affordability", data: VALID_AFFORDABILITY, result: {} }],
    ["injected facts", { workflow: "true-cost", data: VALID_HOME, facts: [] }],
    ["unknown nested field", { workflow: "true-cost", data: { ...VALID_HOME, result: 1 } }],
  ])("rejects %s", async (_label, body) => {
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
    const parsed = (await response.json()) as {
      error: { code: string };
    };
    expect(parsed.error.code).toBe("validation_error");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const response = await POST(postRequest("{not json"));
    expect(response.status).toBe(400);
    const parsed = (await response.json()) as {
      error: { code: string };
    };
    expect(parsed.error.code).toBe("invalid_json");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["what-if workflow", { workflow: "what-if", data: VALID_AFFORDABILITY }],
    ["unknown workflow", { workflow: "retirement", data: VALID_AFFORDABILITY }],
    ["missing workflow", { data: VALID_AFFORDABILITY }],
    ["empty body", {}],
    ["missing data", { workflow: "affordability" }],
    ["negative cents", { workflow: "affordability", data: { ...VALID_AFFORDABILITY, debtsMonthlyCents: -5 } }],
    ["missing compare side", { workflow: "compare", a: { data: VALID_HOME } }],
  ])("rejects %s", async (_label, body) => {
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", GET],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("rejects %s with 405", async (_label, handler) => {
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const response = await (
      handler as () => Promise<Response>
    )();
    expect(response.status).toBe(405);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("AI unavailability", () => {
  it("returns ai_unavailable with zero provider calls when disabled", async () => {
    process.env.AI_EXPLAIN_ENABLED = "false";
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns ai_unavailable with zero provider calls when the key is missing", async () => {
    delete process.env.MODEL_API_KEY;
    const fetchFn = stubFetch(async () => jsonResponse({}));
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 429, 500, 503])(
    "maps provider status %i to ai_unavailable",
    async (status) => {
      const fetchFn = stubFetch(async () => errorResponse(status));
      const response = await POST(
        postRequest({ workflow: "true-cost", data: VALID_HOME }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    },
  );

  it("maps network failure to ai_unavailable", async () => {
    const fetchFn = stubFetch(async () => {
      throw new Error("socket hang up");
    });
    const response = await POST(
      postRequest({ workflow: "true-cost", data: VALID_HOME }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps abort to ai_unavailable", async () => {
    const fetchFn = stubFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const response = await POST(
      postRequest({ workflow: "true-cost", data: VALID_HOME }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps incomplete responses with diagnostics to ai_unavailable", async () => {
    const fetchFn = stubFetch(async () =>
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
    const body = await response.json();
    expect(body).toEqual(AI_UNAVAILABLE_BODY);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(REASON_SENTINEL);
    expect(serialized).not.toContain(String(COUNT_SENTINEL));
    expect(serialized).not.toContain(FAKE_KEY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps malformed model output to ai_unavailable", async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(completedPayload("not json {")),
    );
    const response = await POST(
      postRequest({ workflow: "affordability", data: VALID_AFFORDABILITY }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps unknown fact references to ai_unavailable", async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        completedPayload(
          JSON.stringify({
            observations: [
              { text: `Total is ${MODEL_SENTINEL}.`, factIds: ["f999"] },
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
    const body = await response.json();
    expect(body).toEqual(AI_UNAVAILABLE_BODY);
    expect(JSON.stringify(body)).not.toContain(MODEL_SENTINEL);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps verdict language to ai_unavailable", async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        completedPayload(
          JSON.stringify({
            observations: [
              { text: "Property B is best.", factIds: ["f1"] },
            ],
            limitations: { text: "Nothing further.", factIds: ["f1"] },
          }),
        ),
      ),
    );
    const response = await POST(
      postRequest({
        workflow: "compare",
        a: { data: VALID_HOME },
        b: { data: VALID_HOME_B },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(AI_UNAVAILABLE_BODY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

});

describe("provenance claims", () => {
  function taxFact(facts: Fact[]) {
    const found = facts.find((fact) => fact.label === "Annual property taxes");
    if (found === undefined) {
      throw new Error("test requires a property-tax fact");
    }
    return found;
  }

  it("applies explicit true-cost estimate claims to the explained facts", async () => {
    const home = trueCostInputSchema.parse(VALID_HOME);
    const facts = buildTrueCostFacts(
      calculateTrueCost(home),
      resolveTrueCostProvenance(home, { annualTaxCents: "estimate" }),
    );
    const tax = taxFact(facts);
    expect(tax.kind).toBe("estimate");
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        completedPayload(
          JSON.stringify({
            observations: [
              { text: `Tax is ${tax.displayValue}.`, factIds: [tax.id] },
            ],
            limitations: { text: "Nothing further.", factIds: [tax.id] },
          }),
        ),
      ),
    );
    const response = await POST(
      postRequest({
        workflow: "true-cost",
        data: VALID_HOME,
        provenance: { annualTaxCents: "estimate" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { observations: Array<{ facts: Fact[] }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.observations[0]?.facts).toEqual([tax]);
    expect(body.data.observations[0]?.facts[0]?.kind).toBe("estimate");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("resolves compare-side provenance claims independently", async () => {
    const homeA = trueCostInputSchema.parse(VALID_HOME);
    const homeB = trueCostInputSchema.parse(VALID_HOME_B);
    const facts = buildCompareFacts(
      compareProperties(homeA, homeB),
      resolveTrueCostProvenance(homeA, { annualTaxCents: "estimate" }),
      resolveTrueCostProvenance(homeB, {}),
    );
    const taxA = facts.find(
      (fact) => fact.label === "Property A — Annual property taxes",
    );
    const taxB = facts.find(
      (fact) => fact.label === "Property B — Annual property taxes",
    );
    if (taxA === undefined || taxB === undefined) {
      throw new Error("test requires both property-tax facts");
    }
    expect(taxA.kind).toBe("estimate");
    expect(taxB.kind).toBe("user-provided");
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        completedPayload(
          JSON.stringify({
            observations: [
              {
                text: `A tax is ${taxA.displayValue} and B tax is ${taxB.displayValue}.`,
                factIds: [taxA.id, taxB.id],
              },
            ],
            limitations: { text: "Nothing further.", factIds: [taxA.id] },
          }),
        ),
      ),
    );
    const response = await POST(
      postRequest({
        workflow: "compare",
        a: { data: VALID_HOME, provenance: { annualTaxCents: "estimate" } },
        b: { data: VALID_HOME_B },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { observations: Array<{ facts: Fact[] }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.observations[0]?.facts).toEqual([taxA, taxB]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("AI unavailability leak checks", () => {
  it("never leaks inputs, keys, or provider details in error bodies", async () => {
    const fetchFn = stubFetch(async () => errorResponse(500));
    const distinctive = {
      ...VALID_AFFORDABILITY,
      takeHomeMonthlyCents: 12_345_678,
    };
    const response = await POST(
      postRequest({ workflow: "affordability", data: distinctive }),
    );
    expect(response.status).toBe(503);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("123,456.78");
    expect(serialized).not.toContain(FAKE_KEY);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
