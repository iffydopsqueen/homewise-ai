import type { ApiIssue } from "./client";
import {
  parseDollarsToCents,
  parsePercentToBps,
  parsePercentToMilliPct,
} from "../format/parse";
import { trueCostInputSchema } from "../validation/calc";
import type {
  TrueCostProvenanceClaim,
  TrueCostRequest,
} from "../validation/api";

// Pure true-cost request builder (Phase 6, step 3). Converts raw form strings
// into a validated POST /api/true-cost payload, or field-level errors the
// form can render. No DOM, no fetch: unit-testable in isolation.
//
// Rules mirror the approved API contract:
// - Required figures parse strictly; empty means "missing", never zero.
// - PMI, closing costs, and other-cost lines are optional; empty means the
//   key is omitted (PMI/closing) or the list stays empty - never sent as 0.
// - Estimate toggles become provenance claims for the four fields that accept
//   them; every other claim is omitted and resolved server-side.
// - Fully blank other-cost lines are errors, not silently dropped.
// - Failures always carry a visible explanation: field errors, or a
//   form-level `general` message when no single field is at fault
//   (e.g. more lines than the schema's 100-line cap).

export interface OtherCostFormLine {
  label: string;
  monthly: string;
}

export interface TrueCostFormValues {
  homePrice: string;
  downPayment: string;
  annualRate: string;
  termYears: number;
  annualTax: string;
  annualInsurance: string;
  hoaMonthly: string;
  maintenanceRate: string;
  pmiMonthly: string;
  closingCosts: string;
  otherCosts: OtherCostFormLine[];
  estimateTax: boolean;
  estimateInsurance: boolean;
  estimateHoa: boolean;
  estimateClosing: boolean;
}

export type TrueCostTopField =
  | "homePrice"
  | "downPayment"
  | "annualRate"
  | "termYears"
  | "annualTax"
  | "annualInsurance"
  | "hoaMonthly"
  | "maintenanceRate"
  | "pmiMonthly"
  | "closingCosts";

export interface OtherCostLineErrors {
  label?: string;
  monthly?: string;
}

export interface TrueCostFieldErrors {
  fields: Partial<Record<TrueCostTopField, string>>;
  otherCosts: OtherCostLineErrors[];
}

export type BuildTrueCostRequestResult =
  | { ok: true; request: TrueCostRequest }
  | { ok: false; errors: TrueCostFieldErrors; general: string | null };

export const TERM_MONTHS: Record<number, number> = { 15: 180, 30: 360 };

const DATA_KEY_TO_FIELD: Record<string, TrueCostTopField> = {
  homePriceCents: "homePrice",
  downPaymentCents: "downPayment",
  annualRateMilliPct: "annualRate",
  termMonths: "termYears",
  annualTaxCents: "annualTax",
  annualInsuranceCents: "annualInsurance",
  hoaMonthlyCents: "hoaMonthly",
  maintenanceRateBps: "maintenanceRate",
  pmiMonthlyCents: "pmiMonthly",
  closingCostsCents: "closingCosts",
};

const SERVER_VALUE_MESSAGE = "The server could not accept this value.";
const SERVER_LABEL_MESSAGE = "The server could not accept this label.";

// Friendly messages for parser failures. Matches on our own stable message
// fragments with a generic fallback, so a future parser wording change
// degrades gracefully instead of breaking.
function dollarErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("exceeds maximum")) {
    return "Amount is too large (maximum $10,000,000).";
  }
  if (message.includes("decimal places")) {
    return "Use at most 2 decimal places.";
  }
  return "Enter a valid dollar amount, e.g. 8,500.50.";
}

function percentErrorMessage(error: unknown, places: number): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("exceeds maximum")) {
    return "Rate is too large (maximum 100%).";
  }
  if (message.includes("decimal places")) {
    return `Use at most ${places} decimal places.`;
  }
  return "Enter a valid percentage, e.g. 6.5.";
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

export function emptyTrueCostErrors(): TrueCostFieldErrors {
  return { fields: {}, otherCosts: [] };
}

export function buildTrueCostRequest(
  values: TrueCostFormValues,
): BuildTrueCostRequestResult {
  const errors = emptyTrueCostErrors();
  const cents: Partial<Record<string, number>> = {};

  const requiredDollar = (key: TrueCostTopField, raw: string): void => {
    if (isBlank(raw)) {
      errors.fields[key] = "Enter an amount.";
      return;
    }
    try {
      cents[key] = parseDollarsToCents(raw);
    } catch (error) {
      errors.fields[key] = dollarErrorMessage(error);
    }
  };

  requiredDollar("homePrice", values.homePrice);
  requiredDollar("downPayment", values.downPayment);
  requiredDollar("annualTax", values.annualTax);
  requiredDollar("annualInsurance", values.annualInsurance);
  requiredDollar("hoaMonthly", values.hoaMonthly);

  if (isBlank(values.annualRate)) {
    errors.fields.annualRate = "Enter a percentage.";
  } else {
    try {
      cents.annualRate = parsePercentToMilliPct(values.annualRate);
    } catch (error) {
      errors.fields.annualRate = percentErrorMessage(error, 3);
    }
  }

  if (isBlank(values.maintenanceRate)) {
    errors.fields.maintenanceRate = "Enter a percentage.";
  } else {
    try {
      cents.maintenanceRate = parsePercentToBps(values.maintenanceRate);
    } catch (error) {
      errors.fields.maintenanceRate = percentErrorMessage(error, 2);
    }
  }

  const termMonths = TERM_MONTHS[values.termYears];
  if (termMonths === undefined) {
    errors.fields.termYears = "Choose a loan term.";
  }

  const optionalDollar = (
    key: "pmiMonthly" | "closingCosts",
    raw: string,
  ): number | undefined => {
    if (isBlank(raw)) {
      return undefined;
    }
    try {
      return parseDollarsToCents(raw);
    } catch (error) {
      errors.fields[key] = dollarErrorMessage(error);
      return undefined;
    }
  };

  const pmiMonthlyCents = optionalDollar("pmiMonthly", values.pmiMonthly);
  const closingCostsCents = optionalDollar("closingCosts", values.closingCosts);

  const otherCosts: { label: string; monthly: number }[] = [];
  values.otherCosts.forEach((line, index) => {
    const lineErrors: OtherCostLineErrors = {};
    const label = line.label.trim();
    if (label === "") {
      lineErrors.label = "Enter a label.";
    } else if (label.length > 60) {
      lineErrors.label = "Keep labels to 60 characters or fewer.";
    }
    let monthly: number | undefined;
    if (isBlank(line.monthly)) {
      lineErrors.monthly = "Enter an amount.";
    } else {
      try {
        monthly = parseDollarsToCents(line.monthly);
      } catch (error) {
        lineErrors.monthly = dollarErrorMessage(error);
      }
    }
    if (lineErrors.label !== undefined || lineErrors.monthly !== undefined) {
      errors.otherCosts[index] = lineErrors;
    } else if (monthly !== undefined) {
      otherCosts.push({ label, monthly });
    }
  });

  // The schema caps otherCosts at 100 (fail fast here; the server stays
  // authoritative). An over-long list fails with a form-level message so
  // the failure always has a visible explanation.
  const tooManyLines = values.otherCosts.length > 100;
  if (
    Object.keys(errors.fields).length > 0 ||
    errors.otherCosts.length > 0 ||
    tooManyLines
  ) {
    return {
      ok: false,
      errors,
      general: tooManyLines
        ? "Remove extra entries: at most 100 other-cost lines are allowed."
        : null,
    };
  }

  // Instant full-object check with the shared schema (server re-validates:
  // this is feedback only). Catches home price >= 1 cent, for example.
  // Down payment may exceed the price: that means "no mortgage" (D.1).
  const assembled = {
    homePriceCents: cents.homePrice as number,
    downPaymentCents: cents.downPayment as number,
    annualRateMilliPct: cents.annualRate as number,
    termMonths: termMonths as number,
    annualTaxCents: cents.annualTax as number,
    annualInsuranceCents: cents.annualInsurance as number,
    hoaMonthlyCents: cents.hoaMonthly as number,
    maintenanceRateBps: cents.maintenanceRate as number,
    ...(pmiMonthlyCents === undefined ? {} : { pmiMonthlyCents }),
    otherCosts,
    ...(closingCostsCents === undefined ? {} : { closingCostsCents }),
  };
  const checked = trueCostInputSchema.safeParse(assembled);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      const [first, second, third] = issue.path;
      if (first === "otherCosts" && typeof second === "number") {
        const lineErrors: OtherCostLineErrors =
          errors.otherCosts[second] ?? {};
        if (third === "label" && lineErrors.label === undefined) {
          lineErrors.label = "Invalid label.";
        } else if (third === "monthly" && lineErrors.monthly === undefined) {
          lineErrors.monthly = "Invalid value.";
        }
        errors.otherCosts[second] = lineErrors;
        continue;
      }
      const field =
        typeof first === "string" ? DATA_KEY_TO_FIELD[first] : undefined;
      if (field !== undefined && errors.fields[field] === undefined) {
        errors.fields[field] =
          field === "homePrice"
            ? "Enter a price greater than $0."
            : "Invalid value.";
      }
    }
    // Defense in depth: every reachable schema failure maps to a field
    // above, but an unmapped failure must still explain itself instead of
    // returning an empty error object.
    const explained =
      Object.keys(errors.fields).length > 0 || errors.otherCosts.length > 0;
    return {
      ok: false,
      errors,
      general: explained
        ? null
        : "Some values could not be accepted. Check the form and try again.",
    };
  }

  const provenance: TrueCostProvenanceClaim = {
    annualTaxCents: values.estimateTax ? "estimate" : "user-provided",
    annualInsuranceCents: values.estimateInsurance
      ? "estimate"
      : "user-provided",
    hoaMonthlyCents: values.estimateHoa ? "estimate" : "user-provided",
    ...(closingCostsCents === undefined
      ? {}
      : {
          closingCostsCents: values.estimateClosing
            ? "estimate"
            : "user-provided",
        }),
  };

  return {
    ok: true,
    request: { data: checked.data, provenance },
  };
}

// Maps sanitized server validation issues back onto form fields. Returns the
// mapped errors plus whether every issue mapped; unmapped issues (or an empty
// mapping) mean the form should show the banner instead.
export function mapServerIssues(issues: ApiIssue[]): {
  errors: TrueCostFieldErrors;
  unmapped: boolean;
} {
  const errors = emptyTrueCostErrors();
  let unmapped = false;
  for (const issue of issues) {
    const path = issue.path.replace(/^data\./, "");
    // Line issues use the sanitizer's bracket format
    // (lib/api/http.ts formatPath): otherCosts[N].label|monthly.
    const lineMatch = /^otherCosts\[(\d+)\]\.(label|monthly)$/.exec(path);
    if (lineMatch) {
      const index = Number(lineMatch[1]);
      if (!Number.isSafeInteger(index)) {
        unmapped = true;
        continue;
      }
      const lineErrors: OtherCostLineErrors = errors.otherCosts[index] ?? {};
      if (lineMatch[2] === "label") {
        if (lineErrors.label === undefined) {
          lineErrors.label = SERVER_LABEL_MESSAGE;
        }
      } else if (lineErrors.monthly === undefined) {
        lineErrors.monthly = SERVER_VALUE_MESSAGE;
      }
      errors.otherCosts[index] = lineErrors;
      continue;
    }
    // Top-level issues are a single segment; anything else is unmapped.
    const field =
      path.includes(".") || path.includes("[")
        ? undefined
        : DATA_KEY_TO_FIELD[path];
    if (field === undefined || errors.fields[field] !== undefined) {
      if (field === undefined) {
        unmapped = true;
      }
      continue;
    }
    errors.fields[field] = SERVER_VALUE_MESSAGE;
  }
  return { errors, unmapped };
}
