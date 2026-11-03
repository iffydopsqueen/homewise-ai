import {
  internalErrorResponse,
  invalidJsonResponse,
  methodNotAllowedHandler,
  successResponse,
  toResponse,
  validationErrorResponse,
} from "../../../lib/api/http";
import { runWhatIf } from "../../../lib/calc/whatIf";
import {
  resolveScenarioProvenance,
  resolveTrueCostProvenance,
  whatIfRequestSchema,
} from "../../../lib/validation/api";

// POST /api/what-if: validate base + overrides independently, run F5, return
// result + base/scenario provenance. Overrides take no client provenance:
// defined override keys resolve to "assumption", carried fields keep base
// labels, so originals stay distinguishable from scenario assumptions.
// Thin wrapper only: no arithmetic here, ever.
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return toResponse(invalidJsonResponse());
  }
  const parsed = whatIfRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return toResponse(validationErrorResponse(parsed.error));
  }
  try {
    const result = runWhatIf(parsed.data.base.data, parsed.data.overrides);
    const baseProvenance = resolveTrueCostProvenance(
      parsed.data.base.data,
      parsed.data.base.provenance,
    );
    return toResponse(
      successResponse({
        result,
        baseProvenance,
        scenarioProvenance: resolveScenarioProvenance(
          baseProvenance,
          parsed.data.overrides,
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
