"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { postJson } from "../lib/api/client";
import { formatDollars } from "../lib/format/money";
import { formatPercentFromMilliPct } from "../lib/format/percent";
import {
  buildTrueCostRequest,
  mapServerIssues,
  type OtherCostLineErrors,
  type TrueCostFieldErrors,
  type TrueCostTopField,
} from "../lib/api/trueCostRequest";
import type { TrueCostResult } from "../lib/calc/trueCost";
import type { ToggleKey, TrueCostTextField } from "../lib/session/store";
import { useSession } from "../lib/session/store";
import type { ResolvedTrueCostProvenance } from "../lib/validation/api";
import Card from "./Card";
import CurrencyField from "./CurrencyField";
import EstimateToggle from "./EstimateToggle";
import ExplainSection from "./ExplainSection";
import OtherCostsEditor from "./OtherCostsEditor";
import PercentField from "./PercentField";
import ProvenanceBadge from "./ProvenanceBadge";
import TermSelector from "./TermSelector";
import TrueCostResultView from "./TrueCostResult";

type TextField = TrueCostTextField;

interface SuccessData {
  result: TrueCostResult;
  provenance: ResolvedTrueCostProvenance;
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

// Display-only loan-term label for the compact summary (mirrors the result
// view's wording). The engine's validated termMonths echo is the source.
const TERM_LABELS: Record<number, string> = {
  180: "15 years",
  360: "30 years",
};

function termLabel(months: number): string {
  return TERM_LABELS[months] ?? `${months} months`;
}

type SectionKey = "purchase" | "ongoing" | "additional";

// Pre-calculation input sections (T4b.2): Purchase & loan starts open, the
// other two start closed. Users open any combination freely; visibility
// never touches draft values, payloads, or result state.
const INITIAL_SECTIONS: Record<SectionKey, boolean> = {
  purchase: true,
  ongoing: false,
  additional: false,
};

const PURCHASE_FIELDS: TrueCostTopField[] = [
  "homePrice",
  "downPayment",
  "annualRate",
  "termYears",
  "closingCosts",
];

const ONGOING_FIELDS: TrueCostTopField[] = [
  "annualTax",
  "annualInsurance",
  "hoaMonthly",
  "maintenanceRate",
  "pmiMonthly",
];

function countFieldErrors(
  fields: Partial<Record<TrueCostTopField, string>>,
  keys: TrueCostTopField[],
): number {
  return keys.filter((key) => fields[key] !== undefined).length;
}

function countLineErrors(lineErrors: OtherCostLineErrors[]): number {
  return lineErrors.filter(
    (line) =>
      line !== undefined &&
      (line.label !== undefined || line.monthly !== undefined),
  ).length;
}

// One collapsible input group: an h3 disclosure button (accurate
// aria-expanded/controls, error badge in the accessible name when present)
// over caller-owned fields. Collapsed content unmounts nothing — inputs
// stay mounted behind `hidden`, so values, toggles, and lines survive.
function InputSection({
  id,
  title,
  description,
  open,
  errorCount,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  open: boolean;
  errorCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;
  return (
    <div className="rounded-lg border border-t-line-soft bg-t-surface">
      <h3 className="text-base font-semibold text-t-ink">
        <button
          type="button"
          id={buttonId}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left hover:bg-t-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-t-focus"
        >
          <span>
            {title}{" "}
            {errorCount > 0 && (
              <span className="text-sm font-semibold text-t-error">
                {errorCount} {errorCount === 1 ? "issue" : "issues"} to review
              </span>
            )}
          </span>
          <span aria-hidden="true" className="text-xl leading-none text-t-body">
            {open ? "−" : "+"}
          </span>
        </button>
      </h3>
      <div id={panelId} className={open ? "px-4 pb-5" : "hidden"}>
        {description !== undefined && (
          <p className="pb-4 text-sm text-t-muted">{description}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export default function PropertyForm({ idPrefix }: { idPrefix: string }) {
  // Draft, lines, and result live in shared session context (single source
  // of truth); errors, banner, and submitting stay local and ephemeral.
  const { state, dispatch } = useSession();
  const draft = state.property.draft;
  const result = state.property.result;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<TrueCostTopField, string>>
  >({});
  const [lineErrors, setLineErrors] = useState<OtherCostLineErrors[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Post-calculation compact mode (T4b.1, mirrors T4a.1): purely local UI
  // state. The draft and result stay in session context; collapsing never
  // clears values. Mounting onto a completed session result starts
  // compact; mounting without one (fresh visit, refresh, start over)
  // starts expanded.
  const [collapsed, setCollapsed] = useState(() => result !== null);
  const [openSections, setOpenSections] =
    useState<Record<SectionKey, boolean>>(INITIAL_SECTIONS);
  // Focus moves to results only after an explicitly submitted success,
  // never when mounting onto a previously completed session result.
  const focusResultsRef = useRef(false);
  // After an explicitly failed submission, focus the first invalid field
  // (or its section toggle as fallback) once error sections have opened.
  // Ordinary typing never sets this, so focus never moves while editing.
  const focusInvalidRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusResultsRef.current && result) {
      focusResultsRef.current = false;
      document.getElementById("true-cost-results-heading")?.focus();
    }
  }, [result]);

  useEffect(() => {
    if (focusInvalidRef.current !== null) {
      const target = focusInvalidRef.current;
      focusInvalidRef.current = null;
      document.getElementById(target)?.focus();
    }
  }, [fieldErrors, lineErrors, openSections]);

  function toggleSection(section: SectionKey): void {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  // Opens every section holding mapped errors and queues focus on the
  // first invalid input in form order (purchase fields, ongoing fields,
  // then itemized lines). Sections without errors keep their state.
  function revealErrors(
    fields: Partial<Record<TrueCostTopField, string>>,
    lines: OtherCostLineErrors[],
  ): void {
    const purchaseCount = countFieldErrors(fields, PURCHASE_FIELDS);
    const ongoingCount = countFieldErrors(fields, ONGOING_FIELDS);
    const lineCount = countLineErrors(lines);
    if (purchaseCount + ongoingCount + lineCount === 0) {
      return;
    }
    setOpenSections((prev) => ({
      purchase: purchaseCount > 0 ? true : prev.purchase,
      ongoing: ongoingCount > 0 ? true : prev.ongoing,
      additional: lineCount > 0 ? true : prev.additional,
    }));
    const ordered: TrueCostTopField[] = [...PURCHASE_FIELDS, ...ONGOING_FIELDS];
    const firstField = ordered.find((key) => fields[key] !== undefined);
    if (firstField !== undefined) {
      focusInvalidRef.current =
        firstField === "termYears"
          ? `${idPrefix}-purchase-button`
          : `${idPrefix}-${firstField}`;
      return;
    }
    const badIndex = lines.findIndex(
      (line) =>
        line !== undefined &&
        (line.label !== undefined || line.monthly !== undefined),
    );
    const badLine = badIndex >= 0 ? draft.otherCosts[badIndex] : undefined;
    if (badIndex >= 0 && badLine !== undefined) {
      const badErrors = lines[badIndex];
      focusInvalidRef.current =
        badErrors !== undefined && badErrors.label !== undefined
          ? `other-label-${badLine.key}`
          : `other-monthly-${badLine.key}`;
      return;
    }
    focusInvalidRef.current = `${idPrefix}-additional-button`;
  }

  function handleChange(field: TextField, value: string): void {
    // The store patches the draft and retires the result atomically.
    dispatch({ type: "edit-property", field, value });
    setFieldErrors((prev) => {
      if (!(field in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setBanner(null);
  }

  function handleTermChange(years: 15 | 30): void {
    dispatch({ type: "set-property-term", years });
    setFieldErrors((prev) => {
      if (!("termYears" in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next.termYears;
      return next;
    });
    setBanner(null);
  }

  function handleToggle(toggle: ToggleKey, checked: boolean): void {
    dispatch({ type: "set-property-toggle", toggle, checked });
    setBanner(null);
  }

  function handleLineChange(
    index: number,
    line: { label: string; monthly: string },
  ): void {
    dispatch({
      type: "edit-property-line",
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
    setBanner(null);
  }

  function handleAddLine(): void {
    dispatch({ type: "add-property-line" });
    setBanner(null);
  }

  function handleRemoveLine(index: number): void {
    dispatch({ type: "remove-property-line", index });
    setLineErrors((prev) => prev.filter((_, i) => i !== index));
    setBanner(null);
  }

  function handleStartOver(): void {
    dispatch({ type: "clear-workflow", workflow: "property" });
    setFieldErrors({});
    setLineErrors([]);
    setBanner(null);
    setCollapsed(false);
    setOpenSections(INITIAL_SECTIONS);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Every submit starts fully expanded so no error can hide inside a
    // collapsed form; a success collapses again below.
    setCollapsed(false);
    const built = buildTrueCostRequest(draft);
    if (!built.ok) {
      // Builder failures always explain themselves: field errors, a
      // form-level message, or both. Never an unresponsive submit.
      // Any stored result is already retired: reaching a failure requires
      // edits, and every edit retires atomically.
      setFieldErrors(built.errors.fields);
      setLineErrors(built.errors.otherCosts);
      setBanner(built.general);
      revealErrors(built.errors.fields, built.errors.otherCosts);
      return;
    }
    setFieldErrors({});
    setLineErrors([]);
    setBanner(null);
    setSubmitting(true);
    try {
      const response = await postJson<SuccessData>(
        "/api/true-cost",
        built.request,
      );
      if (!response.ok) {
        if (
          response.error.code === "validation_error" &&
          response.error.issues
        ) {
          const mapped = mapServerIssues(response.error.issues);
          if (hasMappedErrors(mapped.errors)) {
            setFieldErrors(mapped.errors.fields);
            setLineErrors(mapped.errors.otherCosts);
            revealErrors(mapped.errors.fields, mapped.errors.otherCosts);
            if (!mapped.unmapped) {
              return;
            }
          }
        }
        // Server messages are safe by API contract (sanitized, no values).
        setBanner(response.error.message);
        return;
      }
      dispatch({ type: "set-property-result", response: response.data });
      setCollapsed(true);
      focusResultsRef.current = true;
    } finally {
      setSubmitting(false);
    }
  }

  // Effective visibility derives from the completed result: once an edit
  // retires the result, the form renders expanded even if the toggle state
  // is still collapsed — inputs can never strand hidden without an
  // expansion control.
  const collapsible = result !== null;
  const isCollapsed = collapsed && collapsible;
  const inputsId = `${idPrefix}-inputs`;
  const purchaseErrors = countFieldErrors(fieldErrors, PURCHASE_FIELDS);
  const ongoingErrors = countFieldErrors(fieldErrors, ONGOING_FIELDS);
  const additionalErrors = countLineErrors(lineErrors);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
      <Card id="property-inputs-heading" title="Property inputs">
        {collapsible && (
          <button
            type="button"
            onClick={() => {
              // Reopening a completed form always makes Purchase & loan
              // accessible immediately; other sections keep their state.
              setCollapsed((value) => !value);
              setOpenSections((prev) => ({ ...prev, purchase: true }));
            }}
            aria-expanded={!isCollapsed}
            aria-controls={inputsId}
            className="mt-4 w-fit text-sm font-semibold text-t-ink underline hover:text-t-body"
          >
            {isCollapsed ? "Edit property details" : "Collapse property inputs"}
          </button>
        )}
        {isCollapsed && result && (
          <p className="mt-3 text-sm text-t-body">
            Purchase price:{" "}
            {formatDollars(result.result.inputs.homePriceCents)} · Down
            payment: {formatDollars(result.result.inputs.downPaymentCents)} ·{" "}
            {formatPercentFromMilliPct(
              result.result.inputs.annualRateMilliPct,
            )}{" "}
            · {termLabel(result.result.inputs.termMonths)}
          </p>
        )}
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={submitting}
          className={collapsible ? "mt-4" : "mt-6"}
        >
          <div id={inputsId} className={isCollapsed ? "hidden" : "space-y-4"}>
            <InputSection
              id={`${idPrefix}-purchase`}
              title="Purchase & loan"
              description="Home price, down payment, mortgage rate and term, plus one-time closing costs."
              open={openSections.purchase}
              errorCount={purchaseErrors}
              onToggle={() => toggleSection("purchase")}
            >
            <fieldset disabled={submitting} className="space-y-6">
              <legend className="sr-only">Purchase &amp; loan</legend>
              <CurrencyField
                id={`${idPrefix}-homePrice`}
                label="Purchase price"
                description="The home's sale price."
                placeholder="375,000.00"
                value={draft.homePrice}
                error={fieldErrors.homePrice}
                disabled={submitting}
                onChange={(value) => handleChange("homePrice", value)}
              />
              <CurrencyField
                id={`${idPrefix}-downPayment`}
                label="Down payment"
                description="Cash paid upfront at purchase."
                placeholder="75,000.00"
                value={draft.downPayment}
                error={fieldErrors.downPayment}
                disabled={submitting}
                onChange={(value) => handleChange("downPayment", value)}
              />
              <PercentField
                id={`${idPrefix}-annualRate`}
                label="Annual interest rate"
                description="The yearly mortgage rate, as a percentage."
                placeholder="6.5"
                value={draft.annualRate}
                error={fieldErrors.annualRate}
                disabled={submitting}
                onChange={(value) => handleChange("annualRate", value)}
              />
              <div>
                <TermSelector
                  name={`${idPrefix}-term`}
                  value={draft.termYears}
                  disabled={submitting}
                  onChange={handleTermChange}
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
                  value={draft.closingCosts}
                  error={fieldErrors.closingCosts}
                  disabled={submitting}
                  onChange={(value) => handleChange("closingCosts", value)}
                />
                <EstimateToggle
                  id={`${idPrefix}-closingCosts-estimate`}
                  checked={draft.estimateClosing}
                  disabled={submitting}
                  helperText="Estimates are the default for closing costs — uncheck only if this is your own exact figure."
                  onChange={(checked) => handleToggle("closing", checked)}
                />
              </div>
            </fieldset>
            </InputSection>

            <InputSection
              id={`${idPrefix}-ongoing`}
              title="Ongoing ownership costs"
              description="Property taxes, insurance, HOA, maintenance reserve, and PMI."
              open={openSections.ongoing}
              errorCount={ongoingErrors}
              onToggle={() => toggleSection("ongoing")}
            >
            <fieldset disabled={submitting} className="space-y-6">
              <legend className="sr-only">Ongoing ownership costs</legend>
              <div>
                <CurrencyField
                  id={`${idPrefix}-annualTax`}
                  label="Annual property taxes"
                  description="The yearly property tax bill."
                  placeholder="4,200.00"
                  value={draft.annualTax}
                  error={fieldErrors.annualTax}
                  disabled={submitting}
                  onChange={(value) => handleChange("annualTax", value)}
                />
                <EstimateToggle
                  id={`${idPrefix}-annualTax-estimate`}
                  checked={draft.estimateTax}
                  disabled={submitting}
                  helperText="Check if this is your best guess rather than an exact figure."
                  onChange={(checked) => handleToggle("tax", checked)}
                />
              </div>
              <div>
                <CurrencyField
                  id={`${idPrefix}-annualInsurance`}
                  label="Annual homeowners insurance"
                  description="The yearly insurance premium."
                  placeholder="1,800.00"
                  value={draft.annualInsurance}
                  error={fieldErrors.annualInsurance}
                  disabled={submitting}
                  onChange={(value) => handleChange("annualInsurance", value)}
                />
                <EstimateToggle
                  id={`${idPrefix}-annualInsurance-estimate`}
                  checked={draft.estimateInsurance}
                  disabled={submitting}
                  helperText="Check if this is your best guess rather than an exact figure."
                  onChange={(checked) => handleToggle("insurance", checked)}
                />
              </div>
              <div>
                <CurrencyField
                  id={`${idPrefix}-hoaMonthly`}
                  label="Monthly HOA fees"
                  description="Homeowners association dues per month. Enter 0 if none."
                  placeholder="250.00"
                  value={draft.hoaMonthly}
                  error={fieldErrors.hoaMonthly}
                  disabled={submitting}
                  onChange={(value) => handleChange("hoaMonthly", value)}
                />
                <EstimateToggle
                  id={`${idPrefix}-hoaMonthly-estimate`}
                  checked={draft.estimateHoa}
                  disabled={submitting}
                  helperText="Check if this is your best guess rather than an exact figure."
                  onChange={(checked) => handleToggle("hoa", checked)}
                />
              </div>
              <div>
                <PercentField
                  id={`${idPrefix}-maintenanceRate`}
                  label="Annual maintenance reserve rate"
                  description="Share of the home's value reserved yearly for upkeep."
                  placeholder="1"
                  value={draft.maintenanceRate}
                  error={fieldErrors.maintenanceRate}
                  disabled={submitting}
                  onChange={(value) => handleChange("maintenanceRate", value)}
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
                value={draft.pmiMonthly}
                error={fieldErrors.pmiMonthly}
                disabled={submitting}
                onChange={(value) => handleChange("pmiMonthly", value)}
              />
            </fieldset>
            </InputSection>

            <InputSection
              id={`${idPrefix}-additional`}
              title="Additional monthly costs"
              open={openSections.additional}
              errorCount={additionalErrors}
              onToggle={() => toggleSection("additional")}
            >
            <OtherCostsEditor
              lines={draft.otherCosts}
              lineErrors={lineErrors}
              disabled={submitting}
              onLineChange={handleLineChange}
              onAddLine={handleAddLine}
              onRemoveLine={handleRemoveLine}
            />
            </InputSection>
          </div>

          <div
            className={
              isCollapsed
                ? "flex flex-wrap gap-3"
                : "mt-8 flex flex-wrap gap-3"
            }
          >
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-t-action px-5 py-2.5 font-semibold text-t-on-action hover:bg-t-action-hover disabled:opacity-60"
            >
              {submitting ? "Calculating…" : "Calculate property costs"}
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
      </Card>
      <div
        className={banner || result ? "mt-10 space-y-8 lg:mt-0" : undefined}
      >
        {banner && (
          <p
            role="alert"
            className="rounded-md border border-t-line-strong bg-t-surface-alt p-4 text-sm font-medium text-t-ink"
          >
            {banner}
          </p>
        )}
        <div aria-live="polite">
          {result && (
            <>
              <TrueCostResultView
                result={result.result}
                provenance={result.provenance}
              />
              <div className="mt-8">
                <Card id="property-insights-heading" title="Financial insights">
                  <ExplainSection
                    buildPayload={() => {
                      const built = buildTrueCostRequest(draft);
                      return built.ok
                        ? { workflow: "true-cost", ...built.request }
                        : null;
                    }}
                    visual={{
                      workflow: "true-cost",
                      result: result.result,
                      provenance: result.provenance,
                    }}
                  />
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
