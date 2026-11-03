import { describe, expect, it, vi } from "vitest";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/true-cost/route";
import { calculateTrueCost } from "../../lib/calc/trueCost";

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

const NUMERIC_SENTINEL = 9_876_543_210_987;
const STRING_SENTINEL = "SENTINEL-VALUE-987654321";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/true-cost", {
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

describe("POST /api/true-cost", () => {
  it("returns engine-exact results with default provenance", async () => {
    const res = await POST(postRequest({ data: { ...VALID_HOME } }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      result: calculateTrueCost({ ...VALID_HOME }),
      provenance: {
        homePriceCents: "user-provided",
        downPaymentCents: "user-provided",
        annualRateMilliPct: "user-provided",
        termMonths: "user-provided",
        annualTaxCents: "user-provided",
        annualInsuranceCents: "user-provided",
        hoaMonthlyCents: "user-provided",
        maintenanceRateBps: "assumption",
        pmiMonthlyCents: "user-provided",
        otherCosts: "user-provided",
      },
    });
  });

  it("resolves estimate, maintenance, and closing provenance", async () => {
    const res = await POST(
      postRequest({
        data: { ...VALID_HOME, closingCostsCents: 900_000 },
        provenance: { annualTaxCents: "estimate" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.data).toMatchObject({
      provenance: {
        annualTaxCents: "estimate",
        maintenanceRateBps: "assumption",
        closingCostsCents: "estimate",
      },
    });
  });

  it("preserves explicitly user-provided closing costs", async () => {
    const res = await POST(
      postRequest({
        data: { ...VALID_HOME, closingCostsCents: 900_000 },
        provenance: { closingCostsCents: "user-provided" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await readBody(res)).toMatchObject({
      data: { provenance: { closingCostsCents: "user-provided" } },
    });
  });

  it("rejects invalid data, disallowed labels, and unknown keys", async () => {
    const invalid = await POST(
      postRequest({ data: { ...VALID_HOME, homePriceCents: 0 } }),
    );
    expect(invalid.status).toBe(400);
    const disallowed = await POST(
      postRequest({
        data: { ...VALID_HOME },
        provenance: { maintenanceRateBps: "estimate" },
      }),
    );
    expect(disallowed.status).toBe(400);
    const unknown = await POST(
      postRequest({ data: { ...VALID_HOME }, bogus: 1 }),
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
        data: {
          ...VALID_HOME,
          homePriceCents: NUMERIC_SENTINEL,
          otherCosts: [
            {
              label: `x${"A".repeat(60)}${STRING_SENTINEL}`,
              monthly: 100,
            },
          ],
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
    vi.doMock("../../lib/calc/trueCost", () => ({
      calculateTrueCost: () => {
        throw new Error("boom");
      },
    }));
    try {
      const { POST: mockedPost } = await import("../../app/api/true-cost/route");
      const res = await mockedPost(postRequest({ data: { ...VALID_HOME } }));
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
      vi.doUnmock("../../lib/calc/trueCost");
      vi.resetModules();
    }
  });
});
