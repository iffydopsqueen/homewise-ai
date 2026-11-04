"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { postJson } from "../lib/api/client";
import {
  buildCompareRequest,
  mapCompareServerIssues,
} from "../lib/api/compareRequest";
import { formatDollars } from "../lib/format/money";
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
import Card from "./Card";
import CompareResultView from "./CompareResult";
import CurrencyField from "./CurrencyField";
import EstimateToggle from "./EstimateToggle";
import ExplainSection from "./ExplainSection";
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
  collapsed,
  collapsible,
  onToggle,
  mobileHidden,
  switchLabel,
  onSwitch,
  summary,
}: {
  side: "A" | "B";
  idPrefix: string;
  state: SideState;
  disabled: boolean;
  // Post-calculation compact mode (T4a.1): inputs hide behind a summary.
  // Pre-calculation `collapsible` is false and rendering is unchanged.
  collapsed: boolean;
  collapsible: boolean;
  onToggle: () => void;
  // Mobile pre-calculation accordion (T4a.2): when true, this side's inputs
  // hide on narrow screens behind a switcher bar (desktop always shows
  // both sides via responsive utilities — no JS breakpoint detection).
  mobileHidden: boolean;
  switchLabel: string;
  onSwitch: () => void;
  // Compact summary figures (T4c.1): verified engine-echo cents from the
  // stored result, formatted with the shared display formatter. Null
  // before calculation; the summary only renders alongside a result.
  summary: { homePriceCents: number; downPaymentCents: number } | null;
}) {
  const { values, fieldErrors } = state;
  const inputsId = `${idPrefix}-inputs`;
  // Effective visibility derives from the completed result: once an edit
  // retires the result, both sides render expanded even if their toggle
  // state is still collapsed — inputs can never strand hidden without an
  // expansion control.
  const isCollapsed = collapsed && collapsible;
  const issueCount =
    Object.keys(fieldErrors).length +
    state.lineErrors.filter(
      (line) =>
        line !== undefined &&
        (line.label !== undefined || line.monthly !== undefined),
    ).length +
    (state.general ? 1 : 0);
  return (
    <Card
      id={`compare-property-${side}-heading`}
      title={`Property ${side}`}
      focusableHeading
    >
      {mobileHidden && (
        <button
          type="button"
          onClick={onSwitch}
          aria-expanded={false}
          aria-controls={inputsId}
          className="mt-4 w-full rounded-lg border border-t-line-strong bg-t-surface-alt p-4 text-left lg:hidden"
        >
          <span className="block text-sm font-semibold text-t-ink">
            {switchLabel}
          </span>
          {issueCount > 0 && (
            <span className="mt-1 block text-sm font-semibold text-t-error">
              {issueCount} {issueCount === 1 ? "issue" : "issues"} to review
            </span>
          )}
        </button>
      )}
      {collapsible && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          aria-controls={inputsId}
          className="mt-4 w-fit text-sm font-semibold text-t-ink underline hover:text-t-body"
        >
          {isCollapsed
            ? `Edit Property ${side}`
            : `Collapse Property ${side} inputs`}
        </button>
      )}
      {isCollapsed && summary && (
        <p className="mt-3 text-sm text-t-body">
          Purchase price: {formatDollars(summary.homePriceCents)} · Down
          payment: {formatDollars(summary.downPaymentCents)}
        </p>
      )}
      {state.general && (
        <p
          role="alert"
          className={`${mobileHidden ? "hidden lg:block " : ""}mt-4 rounded-md border border-t-line-strong bg-t-surface-alt p-4 text-sm font-medium text-t-ink`}
        >
          {state.general}
        </p>
      )}
      <div
        id={inputsId}
        className={[
          mobileHidden ? "hidden lg:block" : isCollapsed ? "hidden" : null,
          collapsible ? "mt-4 space-y-8" : "mt-6 space-y-8",
        ]
          .filter((part) => part !== null)
          .join(" ")}
      >
        <fieldset disabled={disabled} className="space-y-6">
          <legend className="text-base font-semibold text-t-ink">
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
              <p className="mt-1 text-sm font-medium text-t-error">
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
          <legend className="text-base font-semibold text-t-ink">
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
            <p className="mt-1 text-sm text-t-muted">
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
    </Card>
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
  // Post-calculation compact mode (T4a.1): purely local UI state. Drafts
  // and results stay in session context; collapsing never clears values.
  // Mounting onto a completed session result starts compact; mounting
  // without one (fresh visit, refresh, start over) starts expanded.
  const [collapsedA, setCollapsedA] = useState(
    () => state.compare.result !== null,
  );
  const [collapsedB, setCollapsedB] = useState(
    () => state.compare.result !== null,
  );
  // Focus moves to results only after an explicitly submitted success, never
  // when mounting onto a previously completed session result.
  const focusResultsRef = useRef(false);

  useEffect(() => {
    if (focusResultsRef.current && result) {
      focusResultsRef.current = false;
      document.getElementById("compare-results-heading")?.focus();
    }
  }, [result]);

  // Mobile pre-calculation accordion (T4a.2): which side is expanded on
  // narrow screens. Desktop ignores this (both sides always visible), and
  // post-calculation summaries bypass it. Starts at A; edits keep the
  // edited side active so retiring a result never strands the user.
  const [mobileSide, setMobileSide] = useState<"A" | "B">("A");
  const focusSideRef = useRef<"A" | "B" | null>(null);

  useEffect(() => {
    if (focusSideRef.current) {
      const side = focusSideRef.current;
      focusSideRef.current = null;
      document
        .getElementById(`compare-property-${side}-heading`)
        ?.focus();
    }
  }, [mobileSide]);

  function switchSide(side: "A" | "B"): void {
    setMobileSide(side);
    focusSideRef.current = side;
  }

  function sideHasErrors(
    errors: TrueCostFieldErrors,
    general: string | null,
  ): boolean {
    return hasMappedErrors(errors) || general !== null;
  }

  function clearBanner(): void {
    setBanner(null);
  }

  const sideA = useSideState("a", clearBanner);
  const sideB = useSideState("b", clearBanner);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Every submit starts fully expanded so no error can hide inside a
    // collapsed side; a success collapses both sides again below.
    setCollapsedA(false);
    setCollapsedB(false);
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
      // On narrow screens, surface the first side with errors; the other
      // side's compact bar carries an error badge. Desktop is unaffected.
      if (sideHasErrors(built.errorsA, built.generalA)) {
        setMobileSide("A");
      } else if (sideHasErrors(built.errorsB, built.generalB)) {
        setMobileSide("B");
      }
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
            if (hasMappedErrors(mapped.a)) {
              setMobileSide("A");
            } else if (hasMappedErrors(mapped.b)) {
              setMobileSide("B");
            }
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
      setCollapsedA(true);
      setCollapsedB(true);
      focusResultsRef.current = true;
    } finally {
      setSubmitting(false);
    }
  }

  function handleStartOver(): void {
    dispatch({ type: "clear-workflow", workflow: "compare" });
    sideA.clearErrors();
    sideB.clearErrors();
    setBanner(null);
    setCollapsedA(false);
    setCollapsedB(false);
    setMobileSide("A");
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
            collapsed={collapsedA}
            collapsible={result !== null}
            onToggle={() => {
              setCollapsedA((value) => !value);
              setMobileSide("A");
            }}
            mobileHidden={result === null && mobileSide !== "A"}
            switchLabel="Back to Property A"
            onSwitch={() => switchSide("A")}
            summary={
              result === null
                ? null
                : {
                    homePriceCents: result.result.a.inputs.homePriceCents,
                    downPaymentCents:
                      result.result.a.inputs.downPaymentCents,
                  }
            }
          />
          <div className="mt-10 lg:mt-0">
            <PropertySideFields
              side="B"
              idPrefix="compare-b"
              state={sideB}
              disabled={submitting}
              collapsed={collapsedB}
              collapsible={result !== null}
              onToggle={() => {
                setCollapsedB((value) => !value);
                setMobileSide("B");
              }}
              mobileHidden={result === null && mobileSide !== "B"}
              switchLabel="Continue to Property B"
              onSwitch={() => switchSide("B")}
              summary={
                result === null
                  ? null
                  : {
                      homePriceCents: result.result.b.inputs.homePriceCents,
                      downPaymentCents:
                        result.result.b.inputs.downPaymentCents,
                    }
              }
            />
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-t-action px-5 py-2.5 font-semibold text-t-on-action hover:bg-t-action-hover disabled:opacity-60"
          >
            {submitting ? "Comparing…" : "Compare properties"}
          </button>
          <button
            type="button"
            onClick={handleStartOver}
            disabled={submitting}
            className="rounded-md border border-t-line-strong px-5 py-2.5 font-semibold text-t-ink hover:bg-t-secondary-hover disabled:opacity-60"
          >
            Start over
          </button>
        </div>
      </form>
      {banner && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-t-line-strong bg-t-surface-alt p-4 text-sm font-medium text-t-ink"
        >
          {banner}
        </p>
      )}
      <div
        aria-live="polite"
        className={result ? "mt-10 lg:mt-0" : undefined}
      >
        {result && (
          <>
            <CompareResultView
              result={result.result}
              provenanceA={result.provenanceA}
              provenanceB={result.provenanceB}
            />
            <div className="mt-8">
              <Card id="compare-insights-heading" title="Financial insights">
                <ExplainSection
                  buildPayload={() => {
                    const built = buildCompareRequest(
                      state.compare.draftA,
                      state.compare.draftB,
                    );
                    return built.ok
                      ? { workflow: "compare", a: built.a, b: built.b }
                      : null;
                  }}
                  visual={{ workflow: "compare", result: result.result }}
                />
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
