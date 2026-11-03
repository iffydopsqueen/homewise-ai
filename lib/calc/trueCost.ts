import { trueCostInputSchema, type TrueCostInput } from "../validation/calc";
import { monthlyPayment } from "./mortgage";
import {
  divRoundHalfUp,
  monthlyFromAnnual,
  type Cents,
  type CentsMonthly,
} from "./money";

export type TrueCostWarning =
  | "closing-costs-not-provided"
  | "zero-property-tax-confirm"
  | "zero-hoa-confirm"
  | "zero-maintenance-confirm";

export interface TrueCostResult {
  inputs: TrueCostInput;
  monthlyPI: CentsMonthly;
  monthlyTax: CentsMonthly;
  monthlyInsurance: CentsMonthly;
  monthlyHoa: CentsMonthly;
  monthlyMaintenance: CentsMonthly;
  // Dedicated PMI line: never folded into the miscellaneous total.
  monthlyPMI: CentsMonthly;
  pmiProvided: boolean;
  otherLines: { label: string; monthly: CentsMonthly }[];
  monthlyOther: CentsMonthly;
  // Exact integer sum of the rounded components above: displayed totals
  // always reconcile with the breakdown.
  totalMonthly: CentsMonthly;
  totalAnnual: number;
  // Down payment plus closing costs when provided (down payment alone
  // otherwise, with a warning). An application estimate, NOT a lender's
  // cash-to-close figure.
  estimatedUpfrontCashCents: Cents;
  closingCostsProvided: boolean;
  warnings: TrueCostWarning[];
}

// F2: D.2-D.5 true cost of ownership for one property.
export function calculateTrueCost(raw: unknown): TrueCostResult {
  const inputs = trueCostInputSchema.parse(raw);
  const principal = Math.max(0, inputs.homePriceCents - inputs.downPaymentCents);
  const monthlyPI = monthlyPayment({
    annualRateMilliPct: inputs.annualRateMilliPct,
    principalCents: principal,
    termMonths: inputs.termMonths,
  });
  const monthlyTax = monthlyFromAnnual(inputs.annualTaxCents);
  const monthlyInsurance = monthlyFromAnnual(inputs.annualInsuranceCents);
  const monthlyHoa = inputs.hoaMonthlyCents;
  // price(cents) x bps / 10_000 = annual reserve; /12 = monthly.
  // Product <= 1e13: exact, and R1 re-validates its domain.
  const monthlyMaintenance = divRoundHalfUp(
    inputs.homePriceCents * inputs.maintenanceRateBps,
    120_000,
  ) as CentsMonthly;
  const monthlyPMI = (inputs.pmiMonthlyCents ?? 0) as CentsMonthly;
  const otherLines = inputs.otherCosts.map((line) => ({
    label: line.label,
    monthly: line.monthly,
  }));
  const monthlyOther = inputs.otherCosts.reduce(
    (sum, line) => sum + line.monthly,
    0,
  ) as CentsMonthly;
  const totalMonthly = (monthlyPI +
    monthlyTax +
    monthlyInsurance +
    monthlyHoa +
    monthlyMaintenance +
    monthlyPMI +
    monthlyOther) as CentsMonthly;
  const closingCostsProvided = inputs.closingCostsCents !== undefined;
  const warnings: TrueCostWarning[] = [];
  if (!closingCostsProvided) {
    warnings.push("closing-costs-not-provided");
  }
  if (inputs.annualTaxCents === 0) {
    warnings.push("zero-property-tax-confirm");
  }
  if (inputs.hoaMonthlyCents === 0) {
    warnings.push("zero-hoa-confirm");
  }
  if (inputs.maintenanceRateBps === 0) {
    warnings.push("zero-maintenance-confirm");
  }
  return {
    closingCostsProvided,
    estimatedUpfrontCashCents: (inputs.downPaymentCents +
      (inputs.closingCostsCents ?? 0)) as Cents,
    inputs,
    monthlyHoa,
    monthlyInsurance,
    monthlyMaintenance,
    monthlyOther,
    monthlyPI,
    monthlyPMI,
    monthlyTax,
    otherLines,
    pmiProvided: inputs.pmiMonthlyCents !== undefined,
    totalAnnual: totalMonthly * 12,
    totalMonthly,
    warnings,
  };
}
