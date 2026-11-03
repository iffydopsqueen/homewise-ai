import {
  internalErrorResponse,
  invalidJsonResponse,
  methodNotAllowedHandler,
  successResponse,
  toResponse,
  validationErrorResponse,
} from "../../../lib/api/http";
import { compareProperties } from "../../../lib/calc/compare";
import {
  compareRequestSchema,
  resolveTrueCostProvenance,
} from "../../../lib/validation/api";

// POST /api/compare: validate both sides, run F4, return result + per-side
// provenance. Each side resolves independently; A's claims never affect B.
// Thin wrapper only: no arithmetic here, ever.
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return toResponse(invalidJsonResponse());
  }
  const parsed = compareRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return toResponse(validationErrorResponse(parsed.error));
  }
  try {
    const result = compareProperties(
      parsed.data.a.data,
      parsed.data.b.data,
    );
    return toResponse(
      successResponse({
        result,
        provenanceA: resolveTrueCostProvenance(
          parsed.data.a.data,
          parsed.data.a.provenance,
        ),
        provenanceB: resolveTrueCostProvenance(
          parsed.data.b.data,
          parsed.data.b.provenance,
        ),
      }),
    );
  } catch {
    // Defense in depth: validated input should never throw. Generic 500,
    // no details, no logging (bodies and values must never be logged).
    return toResponse(internalErrorResponse());
  }
}

// Non-POST methods are explicitly rejected so the behavior is deterministic
// and unit-testable without a running server. HEAD/OPTIONS keep framework
// defaults.
export async function GET(): Promise<Response> {
  return methodNotAllowedHandler();
}

export async function PUT(): Promise<Response> {
  return methodNotAllowedHandler();
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowedHandler();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowedHandler();
}
