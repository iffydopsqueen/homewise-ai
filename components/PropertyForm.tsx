"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { postJson } from "../lib/api/client";
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
import CurrencyField from "./CurrencyField";
import EstimateToggle from "./EstimateToggle";
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
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const built = buildTrueCostRequest(draft);
    if (!built.ok) {
      // Builder failures always explain themselves: field errors, a
      // form-level message, or both. Never an unresponsive submit.
      // Any stored result is already retired: reaching a failure requires
      // edits, and every edit retires atomically.
      setFieldErrors(built.errors.fields);
      setLineErrors(built.errors.otherCosts);
      setBanner(built.general);
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="space-y-8">
          <fieldset disabled={submitting} className="space-y-6">
            <legend className="text-lg font-semibold text-slate-900">
              Purchase &amp; loan
            </legend>
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

          <fieldset disabled={submitting} className="space-y-6">
            <legend className="text-lg font-semibold text-slate-900">
              Recurring costs
            </legend>
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
              <p className="mt-1 text-sm text-slate-600">
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

          <OtherCostsEditor
            lines={draft.otherCosts}
            lineErrors={lineErrors}
            disabled={submitting}
            onLineChange={handleLineChange}
            onAddLine={handleAddLine}
            onRemoveLine={handleRemoveLine}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Calculating…" : "Calculate property costs"}
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
        </div>
      </form>
      <div>
        {banner && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-900 lg:mt-0"
          >
            {banner}
          </p>
        )}
        <div aria-live="polite">
          {result && (
            <TrueCostResultView
              result={result.result}
              provenance={result.provenance}
            />
          )}
        </div>
      </div>
    </div>
  );
}
