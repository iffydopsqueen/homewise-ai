import { describe, expect, it, vi } from "vitest";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/what-if/route";
import { runWhatIf } from "../../lib/calc/whatIf";

const BASE_HOME = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 120_000,
  downPaymentCents: 6_000_000,
  hoaMonthlyCents: 0,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [],
  termMonths: 360,
};

const NUMERIC_SENTINEL = 9_876_543_210_987;
const STRING_SENTINEL = "SENTINEL-VALUE-987654321";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/what-if", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readBody(res: Response): Promise<{
  ok: unknown;
  data?: unknown;
  error?: unknown;
}> {
  return (await res.json()) as { ok: unknown; data?: unknown; error?: unknown };
}

describe("POST /api/what-if", () => {
  it("returns engine-exact results with base and scenario provenance", async () => {
    const overrides = { annualTaxCents: 240_000 };
    const res = await POST(
      postRequest({
        base: {
          data: { ...BASE_HOME },
          provenance: { annualInsuranceCents: "estimate" },
        },
        overrides: { ...overrides },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      result: runWhatIf({ ...BASE_HOME }, { ...overrides }),
    });
    expect(body.data).toMatchObject({
      baseProvenance: {
        annualTaxCents: "user-provided",
        annualInsuranceCents: "estimate",
      },
      scenarioProvenance: {
        annualTaxCents: "assumption",
        annualInsuranceCents: "estimate",
        downPaymentCents: "user-provided",
      },
    });
  });

  it("preserves base result and provenance for empty overrides", async () => {
    const res = await POST(
      postRequest({
        base: {
          data: { ...BASE_HOME },
          provenance: { annualTaxCents: "estimate" },
        },
        overrides: {},
      }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.data).toMatchObject({
      result: expect.objectContaining({
        deltaMonthly: 0,
        deltaAnnual: 0,
        deltaUpfront: 0,
      }),
    });
    const data = body.data as {
      result: { base: unknown; scenario: unknown };
      baseProvenance: unknown;
      scenarioProvenance: unknown;
    };
    expect(data.result.scenario).toEqual(data.result.base);
    expect(data.scenarioProvenance).toEqual(data.baseProvenance);
  });

  it("leaves unrelated inputs and provenance untouched on single override", async () => {
    const res = await POST(
      postRequest({
        base: { data: { ...BASE_HOME } },
        overrides: { annualRateMilliPct: 6000 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    const data = body.data as {
      result: {
        base: { inputs: Record<string, unknown> };
        scenario: { inputs: Record<string, unknown> };
      };
      scenarioProvenance: Record<string, unknown>;
    };
    expect(data.result.scenario.inputs.downPaymentCents).toBe(
      data.result.base.inputs.downPaymentCents,
    );
    expect(data.result.scenario.inputs.termMonths).toBe(
      data.result.base.inputs.termMonths,
    );
    expect(data.result.scenario.inputs.annualTaxCents).toBe(
      data.result.base.inputs.annualTaxCents,
    );
    expect(data.scenarioProvenance.annualRateMilliPct).toBe("assumption");
    expect(data.scenarioProvenance.downPaymentCents).toBe("user-provided");
    expect(data.scenarioProvenance.annualTaxCents).toBe("user-provided");
  });

  it("rejects invalid base, invalid overrides, and unknown keys", async () => {
    const badBase = await POST(
      postRequest({
        base: { data: { ...BASE_HOME, homePriceCents: 0 } },
        overrides: {},
      }),
    );
    expect(badBase.status).toBe(400);
    const badOverrides = await POST(
      postRequest({
        base: { data: { ...BASE_HOME } },
        overrides: { annualTaxCents: -1 },
      }),
    );
    expect(badOverrides.status).toBe(400);
    const unknownKey = await POST(
      postRequest({
        base: { data: { ...BASE_HOME } },
        overrides: { termMonths: 180 },
      }),
    );
    expect(unknownKey.status).toBe(400);
  });

  it("returns invalid_json for malformed bodies", async () => {
    const res = await POST(postRequest("{oops"));
    expect(res.status).toBe(400);
    expect(await readBody(res)).toEqual({
      ok: false,
      error: { code: "invalid_json", message: "Request body is not valid JSON." },
    });
  });

  it("rejects non-POST methods with 405", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) {
      const res = await handler();
      expect(res.status).toBe(405);
      expect(await readBody(res)).toEqual({
        ok: false,
        error: { code: "method_not_allowed", message: "Method not allowed." },
      });
    }
  });

  it("never exposes submitted values in error responses", async () => {
    const res = await POST(
      postRequest({
        base: {
          data: { ...BASE_HOME, homePriceCents: NUMERIC_SENTINEL },
        },
        overrides: { annualTaxCents: -1 },
        bogus: STRING_SENTINEL,
      }),
    );
    expect(res.status).toBe(400);
    const serialized = JSON.stringify(await readBody(res));
    expect(serialized).not.toContain(String(NUMERIC_SENTINEL));
    expect(serialized).not.toContain(STRING_SENTINEL);
  });

  it("returns a generic 500 when the engine throws", async () => {
    vi.resetModules();
    vi.doMock("../../lib/calc/whatIf", () => ({
      runWhatIf: () => {
        throw new Error("boom");
      },
    }));
    try {
      const { POST: mockedPost } = await import("../../app/api/what-if/route");
      const res = await mockedPost(
        postRequest({ base: { data: { ...BASE_HOME } }, overrides: {} }),
      );
      expect(res.status).toBe(500);
      const body = await readBody(res);
      expect(body).toEqual({
        ok: false,
        error: {
          code: "internal_error",
          message: "An unexpected error occurred.",
        },
      });
      expect(JSON.stringify(body)).not.toContain("boom");
    } finally {
      vi.doUnmock("../../lib/calc/whatIf");
      vi.resetModules();
    }
  });
});
