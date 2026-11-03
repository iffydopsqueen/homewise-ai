import type { ApiIssue } from "./client";
import {
  buildTrueCostRequest,
  emptyTrueCostErrors,
  mapServerIssues,
  type TrueCostFieldErrors,
  type TrueCostFormValues,
} from "./trueCostRequest";
import type { TrueCostRequest } from "../validation/api";

// Two-sided compare request builder (Phase 6, step 4). Pure composition
// over the single-property builder: each side validates exactly as the
// Step 3 form does, and the pair combines into the POST /api/compare
// payload. No parsing, validation, or provenance rules live here —
// everything delegates to lib/api/trueCostRequest.ts.

export type BuildCompareResult =
  | { ok: true; a: TrueCostRequest; b: TrueCostRequest }
  | {
      ok: false;
      errorsA: TrueCostFieldErrors;
      generalA: string | null;
      errorsB: TrueCostFieldErrors;
      generalB: string | null;
    };

export function buildCompareRequest(
  a: TrueCostFormValues,
  b: TrueCostFormValues,
): BuildCompareResult {
  const builtA = buildTrueCostRequest(a);
  const builtB = buildTrueCostRequest(b);
  if (builtA.ok && builtB.ok) {
    return { ok: true, a: builtA.request, b: builtB.request };
  }
  return {
    ok: false,
    errorsA: builtA.ok ? emptyTrueCostErrors() : builtA.errors,
    generalA: builtA.ok ? null : builtA.general,
    errorsB: builtB.ok ? emptyTrueCostErrors() : builtB.errors,
    generalB: builtB.ok ? null : builtB.general,
  };
}

export interface MappedCompareIssues {
  a: TrueCostFieldErrors;
  b: TrueCostFieldErrors;
  unmapped: boolean;
}

// Maps sanitized compare validation issues back onto their side and field.
// Compare paths carry a side prefix ("a.data…" / "b.data…"); the prefix is
// stripped and the remainder delegates to the single-property mapper, so
// the bracket-index contract stays single-sourced there. Anything without
// a recognized side (including a missing side, path "a" or "b" alone)
// counts as unmapped: the form shows the banner instead.
export function mapCompareServerIssues(
  issues: ApiIssue[],
): MappedCompareIssues {
  const sideIssues: { a: ApiIssue[]; b: ApiIssue[] } = { a: [], b: [] };
  let unmapped = false;
  for (const issue of issues) {
    const side =
      issue.path === "a" || issue.path.startsWith("a.")
        ? "a"
        : issue.path === "b" || issue.path.startsWith("b.")
          ? "b"
          : null;
    if (side === null) {
      unmapped = true;
      continue;
    }
    sideIssues[side].push({
      ...issue,
      path:
        issue.path === side ? "" : issue.path.slice(side.length + ".".length),
    });
  }
  const mappedA = mapServerIssues(sideIssues.a);
  const mappedB = mapServerIssues(sideIssues.b);
  return {
    a: mappedA.errors,
    b: mappedB.errors,
    unmapped: unmapped || mappedA.unmapped || mappedB.unmapped,
  };
}
