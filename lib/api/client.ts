import { z } from "zod";

// Typed same-origin API client (Phase 6, step 2). POSTs JSON, validates the
// response envelope, and maps every failure mode to a safe client-side
// result. Envelopes use non-strict objects so added server fields do not
// break older clients; the data payload keeps its caller-declared type.

export interface ApiIssue {
  path: string;
  code: string;
  message: string;
}

export interface ApiFailure {
  code: string;
  message: string;
  issues?: ApiIssue[];
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiFailure };

const issueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});

const okEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});

const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z.array(issueSchema).optional(),
  }),
});

function unexpectedError(): ApiFailure {
  return {
    code: "unexpected_error",
    message: "Something went wrong. Please try again.",
  };
}

export async function postJson<T>(
  url: string,
  payload: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "network_error",
        message: "Could not reach the server. Check your connection and try again.",
      },
    };
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { ok: false, error: unexpectedError() };
  }
  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(raw);
    if (parsed.success) {
      return { ok: false, error: parsed.data.error };
    }
    return { ok: false, error: unexpectedError() };
  }
  const parsed = okEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: unexpectedError() };
  }
  return { ok: true, data: parsed.data.data as T };
}
