import type { AffordabilityInput } from "../validation/calc";
import { affordabilityInputSchema } from "../validation/calc";
import { parseDollarsToCents } from "../format/parse";
import type { AffordabilityFieldKey } from "../session/store";

// Affordability request builder. Extracted verbatim from FinanceForm's
// submit-time parsing so the calculation form and the AI explanation
// request share one parsing path. Field order, blank handling, parser
// messages, and schema-check messages are unchanged.

export type AffordabilityFieldErrors = Partial<
  Record<AffordabilityFieldKey, string>
>;

export type BuildAffordabilityRequestResult =
  | { ok: true; data: AffordabilityInput }
  | { ok: false; errors: AffordabilityFieldErrors };

const FIELD_KEYS: readonly AffordabilityFieldKey[] = [
  "takeHomeMonthlyCents",
  "proposedHousingMonthlyCents",
  "debtsMonthlyCents",
  "expensesMonthlyCents",
  "savingsCents",
];

function isFieldKey(value: unknown): value is AffordabilityFieldKey {
  return (
    typeof value === "string" &&
    (FIELD_KEYS as readonly string[]).includes(value)
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

export function buildAffordabilityRequest(
  values: Record<AffordabilityFieldKey, string>,
): BuildAffordabilityRequestResult {
  const errors: AffordabilityFieldErrors = {};
  const cents: Partial<Record<AffordabilityFieldKey, number>> = {};
  for (const key of FIELD_KEYS) {
    const raw = values[key];
    if (raw.trim() === "") {
      errors[key] = "Enter an amount.";
      continue;
    }
    try {
      cents[key] = parseDollarsToCents(raw);
    } catch (error) {
      errors[key] = parseErrorMessage(error);
    }
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  // Instant full-object check with the shared schema (server re-validates:
  // this is feedback only). Catches take-home >= 1 cent, for example.
  const checked = affordabilityInputSchema.safeParse(cents);
  if (!checked.success) {
    const mapped: AffordabilityFieldErrors = {};
    for (const issue of checked.error.issues) {
      const [first] = issue.path;
      if (isFieldKey(first) && !(first in mapped)) {
        mapped[first] =
          first === "takeHomeMonthlyCents"
            ? "Enter an income greater than $0."
            : "Invalid value.";
      }
    }
    return { ok: false, errors: mapped };
  }
  return { ok: true, data: checked.data };
}
