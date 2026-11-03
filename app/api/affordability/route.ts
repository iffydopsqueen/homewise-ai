import {
  internalErrorResponse,
  invalidJsonResponse,
  methodNotAllowedHandler,
  successResponse,
  toResponse,
  validationErrorResponse,
} from "../../../lib/api/http";
import { assessAffordability } from "../../../lib/calc/affordability";
import {
  affordabilityRequestSchema,
  resolveAffordabilityProvenance,
} from "../../../lib/validation/api";

// POST /api/affordability: validate, run F3, return result + provenance.
// Thin wrapper only: no arithmetic here, ever.
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return toResponse(invalidJsonResponse());
  }
  const parsed = affordabilityRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return toResponse(validationErrorResponse(parsed.error));
  }
  try {
    const result = assessAffordability(parsed.data.data);
    return toResponse(
      successResponse({ result, provenance: resolveAffordabilityProvenance() }),
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
