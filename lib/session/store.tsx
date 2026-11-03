"use client";

import { createContext, useContext, useMemo, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";

import type { AffordabilityResult } from "../calc/affordability";
import type { ComparisonResult } from "../calc/compare";
import type { TrueCostResult } from "../calc/trueCost";
import type {
  TrueCostFormValues,
  TrueCostTopField,
} from "../api/trueCostRequest";
import type {
  ResolvedAffordabilityProvenance,
  ResolvedTrueCostProvenance,
} from "../validation/api";

// Session store (dashboard restructuring, P2). React Context is the single
// source of truth for workflow drafts and completed results. Memory-only:
// no browser storage, URL params, or persistence of any kind, so a full
// refresh clears everything by construction.
//
// Slice independence: each workflow owns its draft (+ line counter) and
// result. Every draft mutation clears that workflow's result in the same
// reducer transition (atomic retirement); compare side edits retire the
// shared comparison result without touching the other side's draft.
// Stored responses are kept verbatim (same reference) for dashboard and
// return-visit display; nothing here recalculates or transforms figures.

// --- Draft types (reused, never weakened) ---

export type AffordabilityFieldKey =
  | "takeHomeMonthlyCents"
  | "proposedHousingMonthlyCents"
  | "debtsMonthlyCents"
  | "expensesMonthlyCents"
  | "savingsCents";

export type AffordabilityDraft = Record<AffordabilityFieldKey, string>;

export type TrueCostTextField = Exclude<TrueCostTopField, "termYears">;

export type ToggleKey = "tax" | "insurance" | "hoa" | "closing";

// Structurally identical to the editor's line values (key/label/monthly),
// declared here so lib never imports from components. Assignable to the
// builder's keyless line shape without casts.
export interface DraftLine {
  key: string;
  label: string;
  monthly: string;
}

// The builder input shape, narrowed only where forms are stricter
// (15|30-year terms) and keyed where lines need stable identities.
// Assignable to TrueCostFormValues with no casts.
export interface TrueCostDraft
  extends Omit<TrueCostFormValues, "otherCosts" | "termYears"> {
  termYears: 15 | 30;
  otherCosts: DraftLine[];
}

const TOGGLE_FIELDS: Record<ToggleKey, keyof TrueCostDraft> = {
  tax: "estimateTax",
  insurance: "estimateInsurance",
  hoa: "estimateHoa",
  closing: "estimateClosing",
};

// --- Stored responses (verbatim API response objects) ---

export interface AffordabilityStoredResult {
  result: AffordabilityResult;
  provenance: ResolvedAffordabilityProvenance;
}

export interface TrueCostStoredResult {
  result: TrueCostResult;
  provenance: ResolvedTrueCostProvenance;
}

export interface CompareStoredResult {
  result: ComparisonResult;
  provenanceA: ResolvedTrueCostProvenance;
  provenanceB: ResolvedTrueCostProvenance;
}

// --- State ---

export interface AffordabilitySlice {
  draft: AffordabilityDraft;
  result: AffordabilityStoredResult | null;
}

export interface PropertySlice {
  draft: TrueCostDraft;
  nextLineKey: number;
  result: TrueCostStoredResult | null;
}

export type CompareSide = "a" | "b";

export interface CompareSlice {
  draftA: TrueCostDraft;
  nextLineKeyA: number;
  draftB: TrueCostDraft;
  nextLineKeyB: number;
  result: CompareStoredResult | null;
}

export interface SessionState {
  affordability: AffordabilitySlice;
  property: PropertySlice;
  compare: CompareSlice;
}

export type WorkflowKey = keyof SessionState;

// Line-key prefixes match the per-form idPrefix values already in use, so
// rendered input IDs are unchanged from the local-state forms.
const LINE_PREFIXES = {
  property: "property",
  compareA: "compare-a",
  compareB: "compare-b",
} as const;

function initialAffordabilityDraft(): AffordabilityDraft {
  return {
    takeHomeMonthlyCents: "",
    proposedHousingMonthlyCents: "",
    debtsMonthlyCents: "",
    expensesMonthlyCents: "",
    savingsCents: "",
  };
}

function initialTrueCostDraft(): TrueCostDraft {
  return {
    homePrice: "",
    downPayment: "",
    annualRate: "",
    termYears: 30,
    annualTax: "",
    annualInsurance: "",
    hoaMonthly: "",
    maintenanceRate: "1",
    pmiMonthly: "",
    closingCosts: "",
    otherCosts: [],
    estimateTax: false,
    estimateInsurance: false,
    estimateHoa: false,
    estimateClosing: true,
  };
}

function initialAffordabilitySlice(): AffordabilitySlice {
  return { draft: initialAffordabilityDraft(), result: null };
}

function initialPropertySlice(): PropertySlice {
  return { draft: initialTrueCostDraft(), nextLineKey: 1, result: null };
}

function initialCompareSlice(): CompareSlice {
  return {
    draftA: initialTrueCostDraft(),
    nextLineKeyA: 1,
    draftB: initialTrueCostDraft(),
    nextLineKeyB: 1,
    result: null,
  };
}

// Factory (never a shared constant): every call returns fresh objects so
// slices can never alias each other's arrays.
export function initSessionState(): SessionState {
  return {
    affordability: initialAffordabilitySlice(),
    property: initialPropertySlice(),
    compare: initialCompareSlice(),
  };
}

// --- Draft emptiness (dashboard status; P3) ---
//
// Pure comparisons against the initialized defaults. No parsing,
// validation, normalization, or calculation: a draft is empty only when
// every field still matches its fresh initial value. Any present
// other-cost row counts as input (fresh drafts have zero rows), even
// before the user types into it; line counters are not draft content and
// are ignored.

export function isAffordabilityDraftEmpty(
  draft: AffordabilityDraft,
): boolean {
  const fresh = initialAffordabilityDraft();
  return (
    draft.takeHomeMonthlyCents === fresh.takeHomeMonthlyCents &&
    draft.proposedHousingMonthlyCents ===
      fresh.proposedHousingMonthlyCents &&
    draft.debtsMonthlyCents === fresh.debtsMonthlyCents &&
    draft.expensesMonthlyCents === fresh.expensesMonthlyCents &&
    draft.savingsCents === fresh.savingsCents
  );
}

export function isTrueCostDraftEmpty(draft: TrueCostDraft): boolean {
  const fresh = initialTrueCostDraft();
  return (
    draft.homePrice === fresh.homePrice &&
    draft.downPayment === fresh.downPayment &&
    draft.annualRate === fresh.annualRate &&
    draft.termYears === fresh.termYears &&
    draft.annualTax === fresh.annualTax &&
    draft.annualInsurance === fresh.annualInsurance &&
    draft.hoaMonthly === fresh.hoaMonthly &&
    draft.maintenanceRate === fresh.maintenanceRate &&
    draft.pmiMonthly === fresh.pmiMonthly &&
    draft.closingCosts === fresh.closingCosts &&
    draft.estimateTax === fresh.estimateTax &&
    draft.estimateInsurance === fresh.estimateInsurance &&
    draft.estimateHoa === fresh.estimateHoa &&
    draft.estimateClosing === fresh.estimateClosing &&
    draft.otherCosts.length === 0
  );
}

// --- Actions ---

export type SessionAction =
  | { type: "edit-affordability"; field: AffordabilityFieldKey; value: string }
  | { type: "set-affordability-result"; response: AffordabilityStoredResult }
  | { type: "edit-property"; field: TrueCostTextField; value: string }
  | { type: "set-property-term"; years: 15 | 30 }
  | { type: "set-property-toggle"; toggle: ToggleKey; checked: boolean }
  | { type: "add-property-line" }
  | { type: "edit-property-line"; index: number; label: string; monthly: string }
  | { type: "remove-property-line"; index: number }
  | { type: "set-property-result"; response: TrueCostStoredResult }
  | { type: "edit-compare"; side: CompareSide; field: TrueCostTextField; value: string }
  | { type: "set-compare-term"; side: CompareSide; years: 15 | 30 }
  | { type: "set-compare-toggle"; side: CompareSide; toggle: ToggleKey; checked: boolean }
  | { type: "add-compare-line"; side: CompareSide }
  | { type: "edit-compare-line"; side: CompareSide; index: number; label: string; monthly: string }
  | { type: "remove-compare-line"; side: CompareSide; index: number }
  | { type: "set-compare-result"; response: CompareStoredResult }
  | { type: "clear-workflow"; workflow: WorkflowKey };

function editLineAt(
  lines: DraftLine[],
  index: number,
  label: string,
  monthly: string,
): DraftLine[] | null {
  const existing = lines[index];
  if (existing === undefined) {
    return null;
  }
  return lines.map((entry, i) =>
    i === index ? { ...entry, label, monthly } : entry,
  );
}

function removeLineAt(lines: DraftLine[], index: number): DraftLine[] | null {
  if (lines[index] === undefined) {
    return null;
  }
  return lines.filter((_, i) => i !== index);
}

// Pure reducer: every draft mutation returns that workflow's slice with
// result: null in the same transition. Out-of-range line indexes leave
// state untouched (same reference); unknown actions throw fail-closed.
export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "edit-affordability":
      return {
        ...state,
        affordability: {
          draft: { ...state.affordability.draft, [action.field]: action.value },
          result: null,
        },
      };
    case "set-affordability-result":
      return {
        ...state,
        affordability: { ...state.affordability, result: action.response },
      };
    case "edit-property":
      return {
        ...state,
        property: {
          ...state.property,
          draft: {
            ...state.property.draft,
            [action.field]: action.value,
          },
          result: null,
        },
      };
    case "set-property-term":
      return {
        ...state,
        property: {
          ...state.property,
          draft: { ...state.property.draft, termYears: action.years },
          result: null,
        },
      };
    case "set-property-toggle":
      return {
        ...state,
        property: {
          ...state.property,
          draft: {
            ...state.property.draft,
            [TOGGLE_FIELDS[action.toggle]]: action.checked,
          },
          result: null,
        },
      };
    case "add-property-line": {
      const key = `${LINE_PREFIXES.property}-line-${state.property.nextLineKey}`;
      return {
        ...state,
        property: {
          ...state.property,
          draft: {
            ...state.property.draft,
            otherCosts: [
              ...state.property.draft.otherCosts,
              { key, label: "", monthly: "" },
            ],
          },
          nextLineKey: state.property.nextLineKey + 1,
          result: null,
        },
      };
    }
    case "edit-property-line": {
      const lines = editLineAt(
        state.property.draft.otherCosts,
        action.index,
        action.label,
        action.monthly,
      );
      if (lines === null) {
        return state;
      }
      return {
        ...state,
        property: {
          ...state.property,
          draft: { ...state.property.draft, otherCosts: lines },
          result: null,
        },
      };
    }
    case "remove-property-line": {
      const lines = removeLineAt(
        state.property.draft.otherCosts,
        action.index,
      );
      if (lines === null) {
        return state;
      }
      return {
        ...state,
        property: {
          ...state.property,
          draft: { ...state.property.draft, otherCosts: lines },
          result: null,
        },
      };
    }
    case "set-property-result":
      return {
        ...state,
        property: { ...state.property, result: action.response },
      };
    case "edit-compare":
    case "set-compare-term":
    case "set-compare-toggle":
    case "add-compare-line":
    case "edit-compare-line":
    case "remove-compare-line": {
      const slice = state.compare;
      const isA = action.side === "a";
      const draft = isA ? slice.draftA : slice.draftB;
      const prefix = isA ? LINE_PREFIXES.compareA : LINE_PREFIXES.compareB;
      const counter = isA ? slice.nextLineKeyA : slice.nextLineKeyB;
      let nextDraft: TrueCostDraft = draft;
      let nextCounter = counter;
      if (action.type === "edit-compare") {
        nextDraft = { ...draft, [action.field]: action.value };
      } else if (action.type === "set-compare-term") {
        nextDraft = { ...draft, termYears: action.years };
      } else if (action.type === "set-compare-toggle") {
        nextDraft = {
          ...draft,
          [TOGGLE_FIELDS[action.toggle]]: action.checked,
        };
      } else if (action.type === "add-compare-line") {
        nextDraft = {
          ...draft,
          otherCosts: [
            ...draft.otherCosts,
            { key: `${prefix}-line-${counter}`, label: "", monthly: "" },
          ],
        };
        nextCounter = counter + 1;
      } else if (action.type === "edit-compare-line") {
        const lines = editLineAt(
          draft.otherCosts,
          action.index,
          action.label,
          action.monthly,
        );
        if (lines === null) {
          return state;
        }
        nextDraft = { ...draft, otherCosts: lines };
      } else {
        const lines = removeLineAt(draft.otherCosts, action.index);
        if (lines === null) {
          return state;
        }
        nextDraft = { ...draft, otherCosts: lines };
      }
      // Side edits retire the shared result; the other side is untouched.
      return {
        ...state,
        compare: {
          ...slice,
          ...(isA
            ? { draftA: nextDraft, nextLineKeyA: nextCounter }
            : { draftB: nextDraft, nextLineKeyB: nextCounter }),
          result: null,
        },
      };
    }
    case "set-compare-result":
      return {
        ...state,
        compare: { ...state.compare, result: action.response },
      };
    case "clear-workflow":
      return {
        ...state,
        affordability:
          action.workflow === "affordability"
            ? initialAffordabilitySlice()
            : state.affordability,
        property:
          action.workflow === "property"
            ? initialPropertySlice()
            : state.property,
        compare:
          action.workflow === "compare"
            ? initialCompareSlice()
            : state.compare,
      };
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown session action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// --- Provider ---

interface SessionContextValue {
  state: SessionState;
  dispatch: Dispatch<SessionAction>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    undefined,
    initSessionState,
  );
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
