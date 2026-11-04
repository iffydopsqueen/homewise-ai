import type { ZodError } from "zod";

// Safe HTTP response envelopes and error sanitization (Phase 5, step 2).
//
// Security contract:
// - Error responses carry shapes, never figures: field paths, stable codes,
//   and generic constraint descriptions only. Submitted financial values,
//   raw request bodies, stack traces, secrets, and internals must never
//   appear here.
// - Zod's own issue messages are NEVER passed through: some embed submitted
//   content. Messages below are generated solely from the issue code.
// - Unrecognized key names are not echoed either: a client-controlled string
//   is never reflected. The issue still identifies the location (parent
//   path) and the unrecognized_keys code.
// - This module never logs. Callers (route handlers) must not log request
//   bodies or financial inputs either.

export type ApiErrorCode =
  | "validation_error"
  | "invalid_json"
  | "method_not_allowed"
  | "internal_error"
  | "ai_unavailable";

export interface SanitizedIssue {
  path: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    issues?: SanitizedIssue[];
  };
}

export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
}

const GENERIC_MESSAGES: Record<string, string> = {
  invalid_type: "Invalid type.",
  too_small: "Value is too small.",
  too_big: "Value is too large.",
  invalid_format: "Invalid format.",
  invalid_value: "Invalid value.",
  unrecognized_keys: "Unknown field.",
  invalid_key: "Invalid object key.",
  invalid_element: "Invalid array element.",
  invalid_union: "Invalid value.",
  not_multiple_of: "Invalid value.",
  custom: "Invalid value.",
};

function messageFor(code: string): string {
  return GENERIC_MESSAGES[code] ?? "Invalid value.";
}

function formatPath(path: ReadonlyArray<string | number | symbol>): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else {
      const text = String(segment);
      out += out === "" ? text : `.${text}`;
    }
  }
  return out;
}

export function sanitizeZodIssues(error: ZodError): SanitizedIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    // Zod's issue-code vocabulary, stable within the lockfile-pinned Zod.
    code: issue.code,
    message: messageFor(issue.code),
  }));
}

export function successResponse<T>(data: T): {
  status: 200;
  body: ApiSuccessBody<T>;
} {
  return { status: 200, body: { ok: true, data } };
}

export function validationErrorResponse(error: ZodError): {
  status: 400;
  body: ApiErrorBody;
} {
  return {
    status: 400,
    body: {
      ok: false,
      error: {
        code: "validation_error",
        message: "Request validation failed.",
        issues: sanitizeZodIssues(error),
      },
    },
  };
}

export function invalidJsonResponse(): {
  status: 400;
  body: ApiErrorBody;
} {
  return {
    status: 400,
    body: {
      ok: false,
      error: { code: "invalid_json", message: "Request body is not valid JSON." },
    },
  };
}

export function methodNotAllowedResponse(): {
  status: 405;
  body: ApiErrorBody;
} {
  return {
    status: 405,
    body: {
      ok: false,
      error: { code: "method_not_allowed", message: "Method not allowed." },
    },
  };
}

export function internalErrorResponse(): {
  status: 500;
  body: ApiErrorBody;
} {
  return {
    status: 500,
    body: {
      ok: false,
      error: { code: "internal_error", message: "An unexpected error occurred." },
    },
  };
}

// AI explanations are optional: missing keys, model outages, timeouts, and
// rejected model output all collapse to this stable fail-soft response. The
// message carries no figures, reasons, or provider details.
export function aiUnavailableResponse(): {
  status: 503;
  body: ApiErrorBody;
} {
  return {
    status: 503,
    body: {
      ok: false,
      error: {
        code: "ai_unavailable",
        message:
          "AI explanations are unavailable right now. Your calculations are unaffected.",
      },
    },
  };
}

// Convert a builder result to a plain Web Response (no framework import, so
// this module stays runnable in plain Node unit tests). Route handlers may
// return Response directly.
export function toResponse<T>(result: { status: number; body: T }): Response {
  return Response.json(result.body, { status: result.status });
}

export async function methodNotAllowedHandler(): Promise<Response> {
  return toResponse(methodNotAllowedResponse());
}
