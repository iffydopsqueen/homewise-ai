import {
  aiUnavailableResponse,
  internalErrorResponse,
  invalidJsonResponse,
  methodNotAllowedHandler,
  successResponse,
  toResponse,
  validationErrorResponse,
} from "../../../lib/api/http";
import {
  DIAGNOSTIC_API,
  DIAGNOSTIC_EVENT,
  DIAGNOSTIC_PROVIDER,
  elapsedMs,
  emitDiagnostic,
  isDiagnosticsEnabled,
  nowMs,
  tokenFields,
  type DiagnosticFailureCategory,
  type DiagnosticOutcome,
  type DiagnosticStages,
} from "../../../lib/ai/diagnostics";
import { META_MODEL_ID } from "../../../lib/ai/metaClient";
import {
  buildAffordabilityFacts,
  buildCompareFacts,
  buildTrueCostFacts,
  type Fact,
} from "../../../lib/ai/facts";
import { requestStructuredExplanation } from "../../../lib/ai/metaClient";
import {
  buildModelInput,
  buildResponseJsonSchema,
  EXPLANATION_FORMAT_NAME,
} from "../../../lib/ai/prompts";
import {
  validateExplanation,
  type ValidationReason,
} from "../../../lib/ai/validateExplanation";
import { assessAffordability } from "../../../lib/calc/affordability";
import { compareProperties } from "../../../lib/calc/compare";
import { calculateTrueCost } from "../../../lib/calc/trueCost";
import {
  resolveAffordabilityProvenance,
  resolveTrueCostProvenance,
} from "../../../lib/validation/api";
import {
  explainRequestSchema,
  type ExplainRequest,
  type ExplainWorkflow,
} from "../../../lib/validation/explain";

// POST /api/explain: validate engine inputs, recompute deterministically,
// explain the verified figures with Muse Spark, and validate the narrative.
// The request carries inputs only — never results or facts — so everything
// explained here was computed on this server. Every AI-side failure maps to
// the same sanitized 503; validator reasons and provider diagnostics never
// leave the server.
export async function POST(request: Request): Promise<Response> {
  // Privacy-safe diagnostics (T5a.1): timings and allowlisted metadata
  // only. Behavior below is unchanged: the same calls run in the same
  // order, and emission is gated on the server-only opt-in flag.
  const started = nowMs();
  const stages: DiagnosticStages = {};
  let workflow: ExplainWorkflow | undefined = undefined;
  const emit = (
    outcome: DiagnosticOutcome,
    extra?: {
      failureCategory?: DiagnosticFailureCategory;
      validatorReason?: ValidationReason;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      incompleteReason?: string;
    },
  ): void => {
    if (!isDiagnosticsEnabled(process.env)) {
      return;
    }
    emitDiagnostic({
      event: DIAGNOSTIC_EVENT,
      provider: DIAGNOSTIC_PROVIDER,
      model: META_MODEL_ID,
      api: DIAGNOSTIC_API,
      workflow,
      outcome,
      totalMs: elapsedMs(started, nowMs()),
      stages,
      ...extra,
    });
  };
  let raw: unknown;
  const parseStart = nowMs();
  try {
    raw = await request.json();
  } catch {
    stages.parseMs = elapsedMs(parseStart, nowMs());
    emit("failure", { failureCategory: "invalid_json" });
    return toResponse(invalidJsonResponse());
  }
  const parsed = explainRequestSchema.safeParse(raw);
  stages.parseMs = elapsedMs(parseStart, nowMs());
  if (!parsed.success) {
    emit("failure", { failureCategory: "validation_error" });
    return toResponse(validationErrorResponse(parsed.error));
  }
  workflow = parsed.data.workflow;
  try {
    const factsStart = nowMs();
    const facts = buildFacts(parsed.data);
    stages.factsMs = elapsedMs(factsStart, nowMs());
    const promptStart = nowMs();
    const input = buildModelInput(parsed.data.workflow, facts);
    const schema = buildResponseJsonSchema();
    stages.promptMs = elapsedMs(promptStart, nowMs());
    const providerStart = nowMs();
    const meta = await requestStructuredExplanation(
      input,
      EXPLANATION_FORMAT_NAME,
      schema,
    );
    stages.providerMs = elapsedMs(providerStart, nowMs());
    if (!meta.ok) {
      emit("failure", {
        failureCategory: meta.kind,
        ...tokenFields({ detail: meta.detail }),
      });
      return toResponse(aiUnavailableResponse());
    }
    const validateStart = nowMs();
    const checked = validateExplanation(meta.data, facts);
    stages.validateMs = elapsedMs(validateStart, nowMs());
    if (!checked.ok) {
      emit("failure", {
        failureCategory: "validation_rejected",
        validatorReason: checked.reason,
        ...tokenFields({ usage: meta.usage }),
      });
      return toResponse(aiUnavailableResponse());
    }
    emit("success", { ...tokenFields({ usage: meta.usage }) });
    return toResponse(
      successResponse({
        workflow: parsed.data.workflow,
        observations: checked.explanation.observations,
        limitations: checked.explanation.limitations,
      }),
    );
  } catch {
    // Defense in depth: validated inputs already passed the same schemas
    // the engines enforce, so engine work should never throw. Generic 500,
    // no details, no logging of bodies or values (diagnostics carry
    // timings and categories only).
    emit("failure", { failureCategory: "internal_error" });
    return toResponse(internalErrorResponse());
  }
}

function buildFacts(request: ExplainRequest): Fact[] {
  switch (request.workflow) {
    case "affordability": {
      const result = assessAffordability(request.data);
      return buildAffordabilityFacts(result, resolveAffordabilityProvenance());
    }
    case "true-cost": {
      const result = calculateTrueCost(request.data);
      return buildTrueCostFacts(
        result,
        resolveTrueCostProvenance(request.data, request.provenance),
      );
    }
    case "compare": {
      const compared = compareProperties(request.a.data, request.b.data);
      return buildCompareFacts(
        compared,
        resolveTrueCostProvenance(request.a.data, request.a.provenance),
        resolveTrueCostProvenance(request.b.data, request.b.provenance),
      );
    }
    default:
      throw new Error("Unsupported explain workflow");
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
