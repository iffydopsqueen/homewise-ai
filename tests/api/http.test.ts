import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  aiUnavailableResponse,
  internalErrorResponse,
  invalidJsonResponse,
  methodNotAllowedHandler,
  methodNotAllowedResponse,
  sanitizeZodIssues,
  successResponse,
  toResponse,
  validationErrorResponse,
} from "../../lib/api/http";
import { trueCostRequestSchema } from "../../lib/validation/api";

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

// Distinctive sentinels that must never appear in serialized errors.
const NUMERIC_SENTINEL = 9_876_543_210_987;
const STRING_SENTINEL = "SENTINEL-VALUE-987654321";

function zodErrorFor(body: unknown): ZodError {
  const parsed = trueCostRequestSchema.safeParse(body);
  expect(parsed.success).toBe(false);
  if (parsed.success) {
    throw new Error("test setup: expected validation to fail");
  }
  return parsed.error;
}

describe("response envelopes", () => {
  it("wraps success payloads with status 200", () => {
    expect(successResponse({ total: 1 })).toEqual({
      status: 200,
      body: { ok: true, data: { total: 1 } },
    });
  });

  it("builds fixed-shape errors without details", () => {
    expect(methodNotAllowedResponse()).toEqual({
      status: 405,
      body: {
        ok: false,
        error: { code: "method_not_allowed", message: "Method not allowed." },
      },
    });
    expect(invalidJsonResponse().status).toBe(400);
    expect(invalidJsonResponse().body.error.code).toBe("invalid_json");
    const internal = internalErrorResponse();
    expect(internal.status).toBe(500);
    expect(internal.body.error).toEqual({
      code: "internal_error",
      message: "An unexpected error occurred.",
    });
    expect("issues" in internal.body.error).toBe(false);
  });

  it("builds a stable AI-unavailable fail-soft response", () => {
    const response = aiUnavailableResponse();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "ai_unavailable",
        message:
          "AI explanations are unavailable right now. Your calculations are unaffected.",
      },
    });
  });

  it("never logs while building responses", () => {
    const spies = (["log", "error", "warn", "info", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );
    try {
      const error = zodErrorFor({ data: { ...VALID_HOME, homePriceCents: -1 } });
      successResponse({ ok: 1 });
      validationErrorResponse(error);
      invalidJsonResponse();
      methodNotAllowedResponse();
      internalErrorResponse();
      aiUnavailableResponse();
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});

describe("sanitizeZodIssues", () => {
  it("exposes paths, codes, and generic messages", () => {
    const issues = sanitizeZodIssues(
      zodErrorFor({ data: { ...VALID_HOME, homePriceCents: -1 } }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("data.homePriceCents");
    expect(typeof issues[0].code).toBe("string");
    expect(issues[0].message).toBe("Value is too small.");
  });

  it("formats nested array paths", () => {
    const issues = sanitizeZodIssues(
      zodErrorFor({
        data: {
          ...VALID_HOME,
          otherCosts: [{ label: "ok", monthly: -5 }],
        },
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("data.otherCosts[0].monthly");
  });

  it("maps label violations to generic messages", () => {
    const issues = sanitizeZodIssues(
      zodErrorFor({
        data: { ...VALID_HOME },
        provenance: { maintenanceRateBps: "estimate" },
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("provenance.maintenanceRateBps");
    expect(issues[0].message).toBe("Invalid value.");
  });

  it("flags unknown fields without echoing key names", () => {
    const issues = sanitizeZodIssues(
      zodErrorFor({ data: { ...VALID_HOME }, bogus: 1 }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("unrecognized_keys");
    expect(issues[0].message).toBe("Unknown field.");
    expect(JSON.stringify(issues)).not.toContain("bogus");
  });

  it("omits numeric sentinel values from serialized output", () => {
    const overMax = sanitizeZodIssues(
      zodErrorFor({
        data: { ...VALID_HOME, homePriceCents: NUMERIC_SENTINEL },
      }),
    );
    expect(JSON.stringify(overMax)).not.toContain(String(NUMERIC_SENTINEL));
    const wrongType = sanitizeZodIssues(
      zodErrorFor({
        data: { ...VALID_HOME, homePriceCents: String(NUMERIC_SENTINEL) },
      }),
    );
    expect(JSON.stringify(wrongType)).not.toContain(String(NUMERIC_SENTINEL));
    const unknownKey = sanitizeZodIssues(
      zodErrorFor({ data: { ...VALID_HOME }, bogus: NUMERIC_SENTINEL }),
    );
    expect(JSON.stringify(unknownKey)).not.toContain(String(NUMERIC_SENTINEL));
  });

  it("omits string sentinel values from serialized output", () => {
    const tooLong = "A".repeat(55) + STRING_SENTINEL;
    expect(tooLong.length).toBeGreaterThan(60);
    const issues = sanitizeZodIssues(
      zodErrorFor({
        data: {
          ...VALID_HOME,
          otherCosts: [{ label: tooLong, monthly: 100 }],
        },
      }),
    );
    expect(issues).toHaveLength(1);
    expect(JSON.stringify(issues)).not.toContain(STRING_SENTINEL);
  });

  it("converts builder results to plain Responses", async () => {
    const res = toResponse(successResponse({ total: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { total: 1 } });
    const handler = await methodNotAllowedHandler();
    expect(handler.status).toBe(405);
    expect(await handler.json()).toEqual({
      ok: false,
      error: { code: "method_not_allowed", message: "Method not allowed." },
    });
  });

  it("builds 400 validation responses free of submitted values", () => {
    const response = validationErrorResponse(
      zodErrorFor({
        data: {
          ...VALID_HOME,
          homePriceCents: NUMERIC_SENTINEL,
          otherCosts: [
            { label: `x${"A".repeat(60)}${STRING_SENTINEL}`, monthly: 100 },
          ],
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe("validation_error");
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(String(NUMERIC_SENTINEL));
    expect(serialized).not.toContain(STRING_SENTINEL);
  });
});
