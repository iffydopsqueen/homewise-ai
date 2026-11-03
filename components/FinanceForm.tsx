"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { postJson } from "../lib/api/client";
import type { AffordabilityResult } from "../lib/calc/affordability";
import { parseDollarsToCents } from "../lib/format/parse";
import type { AffordabilityFieldKey } from "../lib/session/store";
import { useSession } from "../lib/session/store";
import { affordabilityInputSchema } from "../lib/validation/calc";
import type { ResolvedAffordabilityProvenance } from "../lib/validation/api";
import AffordabilityResultView from "./AffordabilityResult";
import CurrencyField from "./CurrencyField";

const FIELDS: {
  key: AffordabilityFieldKey;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  {
    key: "takeHomeMonthlyCents",
    label: "Monthly take-home income",
    description: "Your pay after taxes, each month.",
    placeholder: "8,000.00",
  },
  {
    key: "proposedHousingMonthlyCents",
    label: "Proposed monthly housing cost",
    description: "The monthly housing payment you want to test.",
    placeholder: "2,000.00",
  },
  {
    key: "debtsMonthlyCents",
    label: "Existing monthly debt payments",
    description: "Required minimums across loans, cards, and similar.",
    placeholder: "600.00",
  },
  {
    key: "expensesMonthlyCents",
    label: "Other monthly living expenses",
    description: "Day-to-day costs, not including housing or debt.",
    placeholder: "2,500.00",
  },
  {
    key: "savingsCents",
    label: "Available savings",
    description: "What you have saved to date.",
    placeholder: "50,000.00",
  },
] as const;

type FieldKey = AffordabilityFieldKey;

interface SuccessData {
  result: AffordabilityResult;
  provenance: ResolvedAffordabilityProvenance;
}

function isFieldKey(value: unknown): value is FieldKey {
  return (
    typeof value === "string" &&
    (FIELDS as readonly { key: string }[]).some((f) => f.key === value)
  );
}

// Friendly field messages for parser failures. Matches on our own stable
// message fragments and always falls back to a generic message, so a future
// parser wording change degrades gracefully instead of breaking.
function parseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("exceeds maximum")) {
    return "Amount is too large (maximum $10,000,000).";
  }
  if (message.includes("decimal places")) {
    return "Use at most 2 decimal places.";
  }
  return "Enter a valid dollar amount, e.g. 8,500.50.";
}

export default function FinanceForm() {
  // Draft and result live in shared session context (single source of
  // truth); errors, banner, and submitting stay local and ephemeral.
  const { state, dispatch } = useSession();
  const values = state.affordability.draft;
  const result = state.affordability.result;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(key: FieldKey, value: string) {
    // The store patches the draft and retires the result atomically.
    dispatch({ type: "edit-affordability", field: key, value });
    setFieldErrors((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setBanner(null);
  }

  function handleStartOver(): void {
    dispatch({ type: "clear-workflow", workflow: "affordability" });
    setFieldErrors({});
    setBanner(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<FieldKey, string>> = {};
    const cents: Partial<Record<FieldKey, number>> = {};
    for (const field of FIELDS) {
      const raw = values[field.key];
      if (raw.trim() === "") {
        nextErrors[field.key] = "Enter an amount.";
        continue;
      }
      try {
        cents[field.key] = parseDollarsToCents(raw);
      } catch (error) {
        nextErrors[field.key] = parseErrorMessage(error);
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    // Instant full-object check with the shared schema (server re-validates:
    // this is feedback only). Catches take-home >= 1 cent, for example.
    const checked = affordabilityInputSchema.safeParse(cents);
    if (!checked.success) {
      const mapped: Partial<Record<FieldKey, string>> = {};
      for (const issue of checked.error.issues) {
        const [first] = issue.path;
        if (isFieldKey(first) && !(first in mapped)) {
          mapped[first] =
            first === "takeHomeMonthlyCents"
              ? "Enter an income greater than $0."
              : "Invalid value.";
        }
      }
      setFieldErrors(mapped);
      return;
    }
    setFieldErrors({});
    setBanner(null);
    setSubmitting(true);
    try {
      const response = await postJson<SuccessData>("/api/affordability", {
        data: checked.data,
      });
      if (!response.ok) {
        if (
          response.error.code === "validation_error" &&
          response.error.issues
        ) {
          const mapped: Partial<Record<FieldKey, string>> = {};
          for (const issue of response.error.issues) {
            const field = issue.path.replace(/^data\./, "");
            if (isFieldKey(field) && !(field in mapped)) {
              mapped[field] = "The server could not accept this value.";
            }
          }
          if (Object.keys(mapped).length > 0) {
            setFieldErrors(mapped);
            return;
          }
        }
        // Server messages are safe by API contract (sanitized, no values).
        // Any stored result is already retired: reaching a failure requires
        // edits, and every edit retires atomically.
        setBanner(response.error.message);
        return;
      }
      dispatch({ type: "set-affordability-result", response: response.data });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <fieldset disabled={submitting} className="space-y-6">
          <legend className="text-lg font-semibold text-slate-900">
            Your finances
          </legend>
          {FIELDS.map((field) => (
            <CurrencyField
              key={field.key}
              id={`finance-${field.key}`}
              label={field.label}
              description={field.description}
              placeholder={field.placeholder}
              value={values[field.key]}
              error={fieldErrors[field.key]}
              disabled={submitting}
              onChange={(value) => handleChange(field.key, value)}
            />
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {submitting ? "Checking…" : "Check affordability"}
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
        </fieldset>
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
            <AffordabilityResultView
              result={result.result}
              provenance={result.provenance}
            />
          )}
        </div>
      </div>
    </div>
  );
}
