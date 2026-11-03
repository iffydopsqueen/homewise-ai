import { describe, expect, it, vi } from "vitest";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/compare/route";
import { compareProperties } from "../../lib/calc/compare";

const HOME_A = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 120_000,
  downPaymentCents: 6_000_000,
  hoaMonthlyCents: 0,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [
    { label: "Lawn", monthly: 5_000 },
    { label: "lawn ", monthly: 3_000 },
  ],
  termMonths: 360,
};

const HOME_B = {
  annualInsuranceCents: 0,
  annualRateMilliPct: 0,
  annualTaxCents: 240_000,
  downPaymentCents: 3_000_000,
  hoaMonthlyCents: 5_000,
  homePriceCents: 30_000_000,
  maintenanceRateBps: 0,
  otherCosts: [
    { label: "LAWN", monthly: 9_000 },
    { label: "Gym", monthly: 7_000 },
  ],
  termMonths: 360,
};

const NUMERIC_SENTINEL = 9_876_543_210_987;
const STRING_SENTINEL = "SENTINEL-VALUE-987654321";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/compare", {
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

describe("POST /api/compare", () => {
  it("returns engine-exact results with independent per-side provenance", async () => {
    const res = await POST(
      postRequest({
        a: {
          data: { ...HOME_A },
          provenance: { annualTaxCents: "estimate" },
        },
        b: { data: { ...HOME_B } },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      result: compareProperties({ ...HOME_A }, { ...HOME_B }),
    });
    expect(body.data).toMatchObject({
      provenanceA: expect.objectContaining({ annualTaxCents: "estimate" }),
      provenanceB: expect.objectContaining({ annualTaxCents: "user-provided" }),
    });
  });

  it("preserves matched, added, and removed recurring costs", async () => {
    const res = await POST(
      postRequest({ a: { data: { ...HOME_A } }, b: { data: { ...HOME_B } } }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.data).toMatchObject({
      result: {
        otherLines: expect.arrayContaining([
          expect.objectContaining({
            key: "lawn",
            a: 8_000,
            b: 9_000,
            status: "matched",
          }),
          expect.objectContaining({
            key: "gym",
            a: 0,
            b: 7_000,
            status: "added",
          }),
        ]),
      },
    });
  });

  it("rejects missing sides, malformed sides, and unknown keys", async () => {
    const missing = await POST(postRequest({ a: { data: { ...HOME_A } } }));
    expect(missing.status).toBe(400);
    const malformed = await POST(
      postRequest({
        a: { data: { ...HOME_A } },
        b: { data: { ...HOME_B, homePriceCents: 0 } },
      }),
    );
    expect(malformed.status).toBe(400);
    const unknown = await POST(
      postRequest({
        a: { data: { ...HOME_A } },
        b: { data: { ...HOME_B } },
        bogus: 1,
      }),
    );
    expect(unknown.status).toBe(400);
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
        a: { data: { ...HOME_A } },
        b: {
          data: {
            ...HOME_B,
            homePriceCents: NUMERIC_SENTINEL,
            otherCosts: [
              {
                label: `x${"A".repeat(60)}${STRING_SENTINEL}`,
                monthly: 100,
              },
            ],
          },
        },
      }),
    );
    expect(res.status).toBe(400);
    const serialized = JSON.stringify(await readBody(res));
    expect(serialized).not.toContain(String(NUMERIC_SENTINEL));
    expect(serialized).not.toContain(STRING_SENTINEL);
  });

  it("returns a generic 500 when the engine throws", async () => {
    vi.resetModules();
    vi.doMock("../../lib/calc/compare", () => ({
      compareProperties: () => {
        throw new Error("boom");
      },
    }));
    try {
      const { POST: mockedPost } = await import("../../app/api/compare/route");
      const res = await mockedPost(
        postRequest({ a: { data: { ...HOME_A } }, b: { data: { ...HOME_B } } }),
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
      vi.doUnmock("../../lib/calc/compare");
      vi.resetModules();
    }
  });
});
