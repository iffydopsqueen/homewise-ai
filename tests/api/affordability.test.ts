import { describe, expect, it, vi } from "vitest";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/affordability/route";
import { assessAffordability } from "../../lib/calc/affordability";

const VALID_FINANCES = {
  debtsMonthlyCents: 60_000,
  expensesMonthlyCents: 250_000,
  proposedHousingMonthlyCents: 200_000,
  savingsCents: 5_000_000,
  takeHomeMonthlyCents: 800_000,
};

const NUMERIC_SENTINEL = 9_876_543_210_987;
const STRING_SENTINEL = "SENTINEL-VALUE-987654321";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/affordability", {
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

describe("POST /api/affordability", () => {
  it("returns engine-exact results with resolved provenance", async () => {
    const res = await POST(postRequest({ data: { ...VALID_FINANCES } }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      result: assessAffordability({ ...VALID_FINANCES }),
      provenance: {
        takeHomeMonthlyCents: "user-provided",
        debtsMonthlyCents: "user-provided",
        expensesMonthlyCents: "user-provided",
        savingsCents: "user-provided",
        proposedHousingMonthlyCents: "user-provided",
      },
    });
  });

  it("rejects invalid fields with sanitized 400 errors", async () => {
    const res = await POST(
      postRequest({
        data: { ...VALID_FINANCES, debtsMonthlyCents: -1 },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readBody(res);
    expect(body.error).toMatchObject({
      code: "validation_error",
      message: "Request validation failed.",
    });
    expect(body.error).toMatchObject({
      issues: [
        {
          path: "data.debtsMonthlyCents",
          code: "too_small",
          message: "Value is too small.",
        },
      ],
    });
  });

  it("rejects missing data and unknown keys", async () => {
    const missing = await POST(postRequest({}));
    expect(missing.status).toBe(400);
    const unknown = await POST(
      postRequest({ data: { ...VALID_FINANCES }, bogus: 1 }),
    );
    expect(unknown.status).toBe(400);
    expect(await readBody(unknown)).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "validation_error" }),
    });
  });

  it("rejects disallowed provenance labels", async () => {
    const res = await POST(
      postRequest({
        data: { ...VALID_FINANCES },
        provenance: { debtsMonthlyCents: "estimate" },
      }),
    );
    expect(res.status).toBe(400);
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
          ...VALID_FINANCES,
          takeHomeMonthlyCents: NUMERIC_SENTINEL,
          debtsMonthlyCents: STRING_SENTINEL,
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
    vi.doMock("../../lib/calc/affordability", () => ({
      assessAffordability: () => {
        throw new Error("boom");
      },
    }));
    try {
      const { POST: mockedPost } = await import(
        "../../app/api/affordability/route"
      );
      const res = await mockedPost(postRequest({ data: { ...VALID_FINANCES } }));
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
      vi.doUnmock("../../lib/calc/affordability");
      vi.resetModules();
    }
  });
});
