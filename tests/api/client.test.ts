import { afterEach, describe, expect, it, vi } from "vitest";

import { postJson } from "../../lib/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetchOnce(response: Response) {
  const fn = vi.fn().mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("postJson", () => {
  it("POSTs JSON and returns typed data on success", async () => {
    const fetchFn = mockFetchOnce(
      jsonResponse({ ok: true, data: { total: 1 } }, 200),
    );
    const result = await postJson<{ total: number }>("/api/test", { a: 1 });
    expect(result).toEqual({ ok: true, data: { total: 1 } });
    expect(fetchFn).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it("preserves server error envelopes with issues", async () => {
    mockFetchOnce(
      jsonResponse(
        {
          ok: false,
          error: {
            code: "validation_error",
            message: "Request validation failed.",
            issues: [
              { path: "data.x", code: "too_small", message: "Too small." },
            ],
          },
        },
        400,
      ),
    );
    expect(await postJson("/api/test", {})).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Request validation failed.",
        issues: [{ path: "data.x", code: "too_small", message: "Too small." }],
      },
    });
  });

  it("maps network failures to a friendly error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("down")),
    );
    expect(await postJson("/api/test", {})).toEqual({
      ok: false,
      error: {
        code: "network_error",
        message:
          "Could not reach the server. Check your connection and try again.",
      },
    });
  });

  it("maps non-JSON bodies to a generic error", async () => {
    mockFetchOnce(new Response("oops", { status: 500 }));
    expect(await postJson("/api/test", {})).toEqual({
      ok: false,
      error: {
        code: "unexpected_error",
        message: "Something went wrong. Please try again.",
      },
    });
  });

  it("maps malformed envelopes to a generic error", async () => {
    mockFetchOnce(jsonResponse({ ok: true }, 200));
    expect(await postJson("/api/test", {})).toEqual({
      ok: false,
      error: {
        code: "unexpected_error",
        message: "Something went wrong. Please try again.",
      },
    });
    mockFetchOnce(jsonResponse({ ok: false }, 400));
    expect(await postJson("/api/test", {})).toEqual({
      ok: false,
      error: {
        code: "unexpected_error",
        message: "Something went wrong. Please try again.",
      },
    });
  });
});
