"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { postJson } from "../lib/api/client";
import {
  buildCompareRequest,
  mapCompareServerIssues,
} from "../lib/api/compareRequest";
import type {
  OtherCostLineErrors,
  TrueCostFieldErrors,
  TrueCostTopField,
} from "../lib/api/trueCostRequest";
import type { ComparisonResult } from "../lib/calc/compare";
import type {
  CompareSide,
  ToggleKey,
  TrueCostTextField,
} from "../lib/session/store";
import { useSession } from "../lib/session/store";
import type { ResolvedTrueCostProvenance } from "../lib/validation/api";
import CompareResultView from "./CompareResult";
import CurrencyField from "./CurrencyField";
import EstimateToggle from "./EstimateToggle";
import OtherCostsEditor from "./OtherCostsEditor";
import PercentField from "./PercentField";
import ProvenanceBadge from "./ProvenanceBadge";
import TermSelector from "./TermSelector";

type TextField = TrueCostTextField;

interface SuccessData {
  result: ComparisonResult;
  provenanceA: ResolvedTrueCostProvenance;
  provenanceB: ResolvedTrueCostProvenance;
}

function hasMappedErrors(errors: TrueCostFieldErrors): boolean {
  if (Object.keys(errors.fields).length > 0) {
    return true;
  }
  return errors.otherCosts.some(
    (line) =>
      line !== undefined &&
      (line.label !== undefined || line.monthly !== undefined),
  );
}

// Per-side controllers over the shared compare drafts. Draft text, terms,
// toggles, and lines live in session context (single source of truth), so
// client-side navigation preserves both sides; the store retires the shared
// result atomically on any edit while leaving the other side untouched.
// Field, line, and form-level errors stay local and ephemeral.
function useSideState(side: CompareSide, clearBanner: () => void) {
  const { state, dispatch } = useSession();
  const draft = side === "a" ? state.compare.draftA : state.compare.draftB;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<TrueCostTopField, string>>
  >({});
  const [lineErrors, setLineErrors] = useState<OtherCostLineErrors[]>([]);
  const [general, setGeneral] = useState<string | null>(null);

  // Any edit to this side retires its form-level alert (which described a
  // previous form state) along with the shared banner. Values and the other
  // side are untouched; the shared result retires in the store transition.
  function edited(): void {
    setGeneral(null);
    clearBanner();
  }

  function handleChange(field: TextField, value: string): void {
    dispatch({ type: "edit-compare", side, field, value });
    setFieldErrors((prev) => {
      if (!(field in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
    edited();
  }

  function handleTermChange(years: 15 | 30): void {
    dispatch({ type: "set-compare-term", side, years });
    setFieldErrors((prev) => {
      if (!("termYears" in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next.termYears;
      return next;
    });
    edited();
  }

  function handleToggle(toggle: ToggleKey, checked: boolean): void {
    dispatch({ type: "set-compare-toggle", side, toggle, checked });
    edited();
  }

  function handleLineChange(
    index: number,
    line: { label: string; monthly: string },
  ): void {
    dispatch({
      type: "edit-compare-line",
      side,
      index,
      label: line.label,
      monthly: line.monthly,
    });
    setLineErrors((prev) => {
      if (prev[index] === undefined) {
        return prev;
      }
      const next = [...prev];
      delete next[index];
      return next;
    });
    edited();
  }

  function handleAddLine(): void {
    dispatch({ type: "add-compare-line", side });
    edited();
  }

  function handleRemoveLine(index: number): void {
    dispatch({ type: "remove-compare-line", side, index });
    setLineErrors((prev) => prev.filter((_, i) => i !== index));
    edited();
  }

  function setAllErrors(
    errors: TrueCostFieldErrors,
    generalMessage: string | null,
  ): void {
    setFieldErrors(errors.fields);
    setLineErrors(errors.otherCosts);
    setGeneral(generalMessage);
  }

  function clearErrors(): void {
    setFieldErrors({});
    setLineErrors([]);
    setGeneral(null);
  }

  return {
    clearErrors,
    fieldErrors,
    general,
    handleAddLine,
    handleChange,
    handleLineChange,
    handleRemoveLine,
    handleTermChange,
    handleToggle,
    lineErrors,
    lines: draft.otherCosts,
    setAllErrors,
    termYears: draft.termYears,
    toggles: {
      tax: draft.estimateTax,
      insurance: draft.estimateInsurance,
      hoa: draft.estimateHoa,
      closing: draft.estimateClosing,
    },
    values: {
      homePrice: draft.homePrice,
      downPayment: draft.downPayment,
      annualRate: draft.annualRate,
      annualTax: draft.annualTax,
      annualInsurance: draft.annualInsurance,
      hoaMonthly: draft.hoaMonthly,
      maintenanceRate: draft.maintenanceRate,
      pmiMonthly: draft.pmiMonthly,
      closingCosts: draft.closingCosts,
    },
  };
}

type SideState = ReturnType<typeof useSideState>;

function PropertySideFields({
  side,
  idPrefix,
  state,
  disabled,
}: {
  side: "A" | "B";
  idPrefix: string;
  state: SideState;
  disabled: boolean;
}) {
  const { values, fieldErrors } = state;
  return (
    <section aria-label={`Property ${side}`}>
      <h3 className="text-lg font-bold text-slate-900">Property {side}</h3>
      {state.general && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-900"
        >
          {state.general}
        </p>
      )}
      <div className="mt-6 space-y-8">
        <fieldset disabled={disabled} className="space-y-6">
          <legend className="text-base font-semibold text-slate-900">
            Property {side} — Purchase &amp; loan
          </legend>
          <CurrencyField
            id={`${idPrefix}-homePrice`}
            label="Purchase price"
            description="The home's sale price."
            placeholder="375,000.00"
            value={values.homePrice}
            error={fieldErrors.homePrice}
            disabled={disabled}
            onChange={(value) => state.handleChange("homePrice", value)}
          />
          <CurrencyField
            id={`${idPrefix}-downPayment`}
            label="Down payment"
            description="Cash paid upfront at purchase."
            placeholder="75,000.00"
            value={values.downPayment}
            error={fieldErrors.downPayment}
            disabled={disabled}
            onChange={(value) => state.handleChange("downPayment", value)}
          />
          <PercentField
            id={`${idPrefix}-annualRate`}
            label="Annual interest rate"
            description="The yearly mortgage rate, as a percentage."
            placeholder="6.5"
            value={values.annualRate}
            error={fieldErrors.annualRate}
            disabled={disabled}
            onChange={(value) => state.handleChange("annualRate", value)}
          />
          <div>
            <TermSelector
              name={`${idPrefix}-term`}
              value={state.termYears}
              disabled={disabled}
              onChange={state.handleTermChange}
            />
            {fieldErrors.termYears && (
              <p className="mt-1 text-sm font-medium text-red-700">
                {fieldErrors.termYears}
              </p>
            )}
          </div>
          <div>
            <CurrencyField
              id={`${idPrefix}-closingCosts`}
              label="Closing costs (one-time)"
              description="Optional. One-time fees paid at purchase — not a monthly cost."
              placeholder="9,000.00"
              value={values.closingCosts}
              error={fieldErrors.closingCosts}
              disabled={disabled}
              onChange={(value) => state.handleChange("closingCosts", value)}
            />
            <EstimateToggle
              id={`${idPrefix}-closingCosts-estimate`}
              checked={state.toggles.closing}
              disabled={disabled}
              helperText="Estimates are the default for closing costs — uncheck only if this is your own exact figure."
              onChange={(checked) => state.handleToggle("closing", checked)}
            />
          </div>
        </fieldset>

        <fieldset disabled={disabled} className="space-y-6">
          <legend className="text-base font-semibold text-slate-900">
            Property {side} — Recurring costs
          </legend>
          <div>
            <CurrencyField
              id={`${idPrefix}-annualTax`}
              label="Annual property taxes"
              description="The yearly property tax bill."
              placeholder="4,200.00"
              value={values.annualTax}
              error={fieldErrors.annualTax}
              disabled={disabled}
              onChange={(value) => state.handleChange("annualTax", value)}
            />
            <EstimateToggle
              id={`${idPrefix}-annualTax-estimate`}
              checked={state.toggles.tax}
              disabled={disabled}
              helperText="Check if this is your best guess rather than an exact figure."
              onChange={(checked) => state.handleToggle("tax", checked)}
            />
          </div>
          <div>
            <CurrencyField
              id={`${idPrefix}-annualInsurance`}
              label="Annual homeowners insurance"
              description="The yearly insurance premium."
              placeholder="1,800.00"
              value={values.annualInsurance}
              error={fieldErrors.annualInsurance}
              disabled={disabled}
              onChange={(value) => state.handleChange("annualInsurance", value)}
            />
            <EstimateToggle
              id={`${idPrefix}-annualInsurance-estimate`}
              checked={state.toggles.insurance}
              disabled={disabled}
              helperText="Check if this is your best guess rather than an exact figure."
              onChange={(checked) => state.handleToggle("insurance", checked)}
            />
          </div>
          <div>
            <CurrencyField
              id={`${idPrefix}-hoaMonthly`}
              label="Monthly HOA fees"
              description="Homeowners association dues per month. Enter 0 if none."
              placeholder="250.00"
              value={values.hoaMonthly}
              error={fieldErrors.hoaMonthly}
              disabled={disabled}
              onChange={(value) => state.handleChange("hoaMonthly", value)}
            />
            <EstimateToggle
              id={`${idPrefix}-hoaMonthly-estimate`}
              checked={state.toggles.hoa}
              disabled={disabled}
              helperText="Check if this is your best guess rather than an exact figure."
              onChange={(checked) => state.handleToggle("hoa", checked)}
            />
          </div>
          <div>
            <PercentField
              id={`${idPrefix}-maintenanceRate`}
              label="Annual maintenance reserve rate"
              description="Share of the home's value reserved yearly for upkeep."
              placeholder="1"
              value={values.maintenanceRate}
              error={fieldErrors.maintenanceRate}
              disabled={disabled}
              onChange={(value) =>
                state.handleChange("maintenanceRate", value)
              }
            />
            <div className="mt-2">
              <ProvenanceBadge label="assumption" />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Starting point only — not a recommendation or guaranteed cost.
            </p>
          </div>
          <CurrencyField
            id={`${idPrefix}-pmiMonthly`}
            label="Monthly PMI"
            description="Optional. Private mortgage insurance, if it applies to this loan."
            placeholder="120.00"
            value={values.pmiMonthly}
            error={fieldErrors.pmiMonthly}
            disabled={disabled}
            onChange={(value) => state.handleChange("pmiMonthly", value)}
          />
        </fieldset>

        <OtherCostsEditor
          lines={state.lines}
          lineErrors={state.lineErrors}
          disabled={disabled}
          onLineChange={state.handleLineChange}
          onAddLine={state.handleAddLine}
          onRemoveLine={state.handleRemoveLine}
        />
      </div>
    </section>
  );
}

export default function CompareForm() {
  // Drafts, lines, and the shared result live in session context (single
  // source of truth); errors, banner, and submitting stay local and
  // ephemeral.
  const { state, dispatch } = useSession();
  const result = state.compare.result;
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clearBanner(): void {
    setBanner(null);
  }

  const sideA = useSideState("a", clearBanner);
  const sideB = useSideState("b", clearBanner);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const built = buildCompareRequest(
      state.compare.draftA,
      state.compare.draftB,
    );
    if (!built.ok) {
      // Each side keeps its own values; only errors are replaced. Any
      // stored result is already retired: reaching a failure requires
      // edits, and every edit retires atomically.
      sideA.setAllErrors(built.errorsA, built.generalA);
      sideB.setAllErrors(built.errorsB, built.generalB);
      return;
    }
    sideA.clearErrors();
    sideB.clearErrors();
    setBanner(null);
    setSubmitting(true);
    try {
      const response = await postJson<SuccessData>("/api/compare", {
        a: built.a,
        b: built.b,
      });
      if (!response.ok) {
        if (
          response.error.code === "validation_error" &&
          response.error.issues
        ) {
          const mapped = mapCompareServerIssues(response.error.issues);
          if (
            hasMappedErrors(mapped.a) ||
            hasMappedErrors(mapped.b)
          ) {
            sideA.setAllErrors(mapped.a, null);
            sideB.setAllErrors(mapped.b, null);
            if (!mapped.unmapped) {
              return;
            }
          }
        }
        // Server messages are safe by API contract (sanitized, no values).
        setBanner(response.error.message);
        return;
      }
      dispatch({ type: "set-compare-result", response: response.data });
    } finally {
      setSubmitting(false);
    }
  }

  function handleStartOver(): void {
    dispatch({ type: "clear-workflow", workflow: "compare" });
    sideA.clearErrors();
    sideB.clearErrors();
    setBanner(null);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
          <PropertySideFields
            side="A"
            idPrefix="compare-a"
            state={sideA}
            disabled={submitting}
          />
          <div className="mt-10 lg:mt-0">
            <PropertySideFields
              side="B"
              idPrefix="compare-b"
              state={sideB}
              disabled={submitting}
            />
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {submitting ? "Comparing…" : "Compare properties"}
          </button>
          <button
            type="button"
            onClick={handleStartOver}
            disabled={submitting}
            className="rounded-md border border-slate-300 px-5 py-2.5 font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
          >
            Start over
          </button>
        </div>
      </form>
      {banner && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-900"
        >
          {banner}
        </p>
      )}
      <div aria-live="polite">
        {result && (
          <CompareResultView
            result={result.result}
            provenanceA={result.provenanceA}
            provenanceB={result.provenanceB}
          />
        )}
      </div>
    </div>
  );
}
