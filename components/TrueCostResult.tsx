import type { ReactNode } from "react";

import type {
  TrueCostResult,
  TrueCostWarning,
} from "../lib/calc/trueCost";
import { formatDollars } from "../lib/format/money";
import {
  formatPercentFromBps,
  formatPercentFromMilliPct,
} from "../lib/format/percent";
import {
  TRUE_COST_DISPLAY,
  type DisplaySource,
} from "../lib/format/provenance";
import type { ResolvedTrueCostProvenance } from "../lib/validation/api";
import AllocationBar from "./AllocationBar";
import Card from "./Card";
import Kpi from "./Kpi";
import ProvenanceBadge from "./ProvenanceBadge";

interface Props {
  result: TrueCostResult;
  provenance: ResolvedTrueCostProvenance;
}

const INPUT_LABELS: Record<string, string> = {
  homePriceCents: "Purchase price",
  downPaymentCents: "Down payment",
  annualRateMilliPct: "Interest rate",
  termMonths: "Loan term",
  annualTaxCents: "Annual taxes",
  annualInsuranceCents: "Annual insurance",
  hoaMonthlyCents: "HOA",
  maintenanceRateBps: "Maintenance rate",
  closingCostsCents: "Closing costs",
};

const RESULT_LABELS: Record<string, string> = {
  monthlyPI: "Principal and interest",
  monthlyTax: "Property tax",
  monthlyInsurance: "Insurance",
  monthlyHoa: "HOA",
  monthlyMaintenance: "Maintenance",
  monthlyPMI: "PMI",
  monthlyOther: "Other costs",
  totalMonthly: "Total monthly",
};

const TERM_LABELS: Record<number, string> = {
  180: "15 years",
  360: "30 years",
};

function termLabel(months: number): string {
  return TERM_LABELS[months] ?? `${months} months`;
}

const WARNING_MESSAGES: Record<TrueCostWarning, string> = {
  "closing-costs-not-provided":
    "Closing costs weren't entered, so the upfront figure covers the down payment only.",
  "zero-property-tax-confirm":
    "You entered $0 for property taxes — confirm that's correct.",
  "zero-hoa-confirm": "You entered $0 for HOA fees — confirm that's correct.",
  "zero-maintenance-confirm":
    "You entered $0 for maintenance reserve — confirm that's correct.",
};

// Renders one contributor as "Label value". Returns null only for closing
// costs when they were not supplied, so absent figures never appear.
function inputSourceText(
  key: string,
  result: TrueCostResult,
): string | null {
  if (key === "annualRateMilliPct") {
    return `Interest rate ${formatPercentFromMilliPct(result.inputs.annualRateMilliPct)}`;
  }
  if (key === "termMonths") {
    return `Loan term ${termLabel(result.inputs.termMonths)}`;
  }
  if (key === "maintenanceRateBps") {
    return `Maintenance rate ${formatPercentFromBps(result.inputs.maintenanceRateBps)}`;
  }
  const value = (result.inputs as unknown as Record<string, number | undefined>)[
    key
  ];
  if (value === undefined) {
    return null;
  }
  return `${INPUT_LABELS[key] ?? key} ${formatDollars(value)}`;
}

function resultSourceText(source: DisplaySource, result: TrueCostResult): string {
  if (source.key === "otherLines") {
    const count = result.otherLines.length;
    return count === 1
      ? "sum of 1 itemized line"
      : `sum of ${count} itemized lines`;
  }
  const value = (result as unknown as Record<string, number>)[source.key];
  return `${RESULT_LABELS[source.key] ?? source.key} ${formatDollars(value)}`;
}

function subtextFor(
  field: keyof typeof TRUE_COST_DISPLAY,
  result: TrueCostResult,
): string | null {
  const mapping = TRUE_COST_DISPLAY[field];
  if (mapping.kind !== "calculated" || mapping.sources.length === 0) {
    return null;
  }
  if (field === "monthlyOther" && result.otherLines.length === 0) {
    return "No other costs entered.";
  }
  const parts = mapping.sources.map((source) =>
    source.scope === "input"
      ? inputSourceText(source.key, result)
      : resultSourceText(source, result),
  );
  const shown = parts.filter((part): part is string => part !== null);
  if (shown.length === 0) {
    return null;
  }
  return `Based on ${shown.join(" · ")}`;
}

function Row({
  label,
  value,
  badge,
  subtext,
  strong,
  muted,
}: {
  label: string;
  value: string;
  badge?: ReactNode;
  subtext?: string | null;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="border-b border-t-line-soft py-3 last:border-b-0 sm:flex sm:items-baseline sm:justify-between sm:gap-x-4">
      <dt
        className={
          strong
            ? "text-sm font-semibold text-t-ink"
            : "text-sm text-t-muted"
        }
      >
        {label} {badge}
      </dt>
      <dd className="mt-1 sm:mt-0 sm:text-right">
        <div
          className={
            strong
              ? "text-lg font-bold text-t-ink"
              : muted
                ? "text-sm text-t-muted"
                : "text-base font-semibold text-t-ink"
          }
        >
          {value}
        </div>
        {subtext && (
          <div className="mt-0.5 text-xs text-t-caption">{subtext}</div>
        )}
      </dd>
    </div>
  );
}

export default function TrueCostResultView({ result, provenance }: Props) {
  const { inputs } = result;
  // Chart segments mirror the engine's monthly components exactly; the
  // engine defines totalMonthly as their integer sum, so it is the exact
  // denominator with no rounding gap and no balancing category.
  const segments = [
    {
      label: "Principal and interest",
      displayValue: formatDollars(result.monthlyPI),
      value: result.monthlyPI,
    },
    {
      label: "Property tax",
      displayValue: formatDollars(result.monthlyTax),
      value: result.monthlyTax,
    },
    {
      label: "Homeowners insurance",
      displayValue: formatDollars(result.monthlyInsurance),
      value: result.monthlyInsurance,
    },
    {
      label: "HOA",
      displayValue: formatDollars(result.monthlyHoa),
      value: result.monthlyHoa,
    },
    {
      label: "Maintenance reserve",
      displayValue: formatDollars(result.monthlyMaintenance),
      value: result.monthlyMaintenance,
    },
    {
      label: "PMI",
      displayValue: formatDollars(result.monthlyPMI),
      value: result.monthlyPMI,
    },
    {
      label: "Other monthly costs",
      displayValue: formatDollars(result.monthlyOther),
      value: result.monthlyOther,
    },
  ];
  return (
    <Card
      id="true-cost-results-heading"
      title="Your property cost breakdown"
      description="Estimate based on the figures you entered."
      focusableHeading
    >
      <div className="mt-6 space-y-6">
        <Kpi
          variant="hero"
          accent
          label="Total estimated monthly cost"
          value={formatDollars(result.totalMonthly)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-t-surface-alt p-4">
            <Kpi
              plain
              label="Total annual housing cost"
              value={`${formatDollars(result.totalAnnual)} per year`}
              caption="12 months at the estimated monthly cost"
            />
          </div>
          <div className="rounded-lg bg-t-surface-alt p-4">
            <Kpi
              plain
              label="Estimated upfront cash"
              value={formatDollars(result.estimatedUpfrontCashCents)}
              caption={
                result.closingCostsProvided
                  ? "Includes down payment and closing costs"
                  : "Down payment only — no closing costs entered"
              }
            />
          </div>
        </div>
        <section aria-labelledby="true-cost-allocation-heading">
          <h3
            id="true-cost-allocation-heading"
            className="text-base font-semibold text-t-ink"
          >
            Monthly cost breakdown
          </h3>
          <div className="mt-3">
            <AllocationBar
              segments={segments}
              total={result.totalMonthly}
            />
          </div>
        </section>
        {result.warnings.length > 0 && (
          <div className="rounded-md border border-t-line-strong bg-t-surface-alt p-4">
            <p className="text-sm font-semibold text-t-ink">Please note</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-t-body">
              {result.warnings.map((warning) => (
                <li key={warning}>{WARNING_MESSAGES[warning]}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="border-t border-t-line pt-4">
          <summary className="w-fit cursor-pointer text-sm font-semibold text-t-ink underline">
            View detailed breakdown
          </summary>
          <h3 className="mt-6 text-base font-semibold text-t-ink">
            Your figures
          </h3>
          <dl className="mt-2">
            <Row
              label="Purchase price"
              value={formatDollars(inputs.homePriceCents)}
              badge={<ProvenanceBadge label={provenance.homePriceCents} />}
            />
            <Row
              label="Down payment"
              value={formatDollars(inputs.downPaymentCents)}
              badge={<ProvenanceBadge label={provenance.downPaymentCents} />}
            />
            <Row
              label="Interest rate"
              value={formatPercentFromMilliPct(inputs.annualRateMilliPct)}
              badge={<ProvenanceBadge label={provenance.annualRateMilliPct} />}
            />
            <Row
              label="Loan term"
              value={termLabel(inputs.termMonths)}
              badge={<ProvenanceBadge label={provenance.termMonths} />}
            />
            <Row
              label="Annual property taxes"
              value={formatDollars(inputs.annualTaxCents)}
              badge={<ProvenanceBadge label={provenance.annualTaxCents} />}
            />
            <Row
              label="Annual homeowners insurance"
              value={formatDollars(inputs.annualInsuranceCents)}
              badge={<ProvenanceBadge label={provenance.annualInsuranceCents} />}
            />
            <Row
              label="Monthly HOA"
              value={formatDollars(inputs.hoaMonthlyCents)}
              badge={<ProvenanceBadge label={provenance.hoaMonthlyCents} />}
            />
            <Row
              label="Maintenance reserve rate"
              value={formatPercentFromBps(inputs.maintenanceRateBps)}
              badge={<ProvenanceBadge label={provenance.maintenanceRateBps} />}
              subtext="Starting point only — not a recommendation or guaranteed cost."
            />
            {result.pmiProvided && inputs.pmiMonthlyCents !== undefined ? (
              <Row
                label="PMI"
                value={formatDollars(inputs.pmiMonthlyCents)}
                badge={<ProvenanceBadge label={provenance.pmiMonthlyCents} />}
              />
            ) : (
              <Row label="PMI" value="Not entered" />
            )}
            {result.closingCostsProvided && inputs.closingCostsCents !== undefined ? (
              <Row
                label="Closing costs (one-time)"
                value={formatDollars(inputs.closingCostsCents)}
                badge={
                  provenance.closingCostsCents ? (
                    <ProvenanceBadge label={provenance.closingCostsCents} />
                  ) : undefined
                }
              />
            ) : (
              <Row label="Closing costs (one-time)" value="Not entered" />
            )}
            {result.otherLines.length === 0 ? (
              <Row label="Other monthly costs" value="No other costs entered" />
            ) : (
              result.otherLines.map((line) => (
                <Row
                  key={line.label}
                  label={line.label}
                  value={formatDollars(line.monthly)}
                  badge={<ProvenanceBadge label={provenance.otherCosts} />}
                />
              ))
            )}
          </dl>

          <h3 className="mt-6 text-base font-semibold text-t-ink">
            Monthly breakdown
          </h3>
          <dl className="mt-2">
            <Row
              label="Principal and interest"
              value={formatDollars(result.monthlyPI)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("monthlyPI", result)}
            />
            <Row
              label="Property tax"
              value={formatDollars(result.monthlyTax)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("monthlyTax", result)}
            />
            <Row
              label="Homeowners insurance"
              value={formatDollars(result.monthlyInsurance)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("monthlyInsurance", result)}
            />
            <Row
              label="HOA"
              value={formatDollars(result.monthlyHoa)}
              badge={<ProvenanceBadge label={provenance.hoaMonthlyCents} />}
            />
            <Row
              label="Maintenance reserve"
              value={formatDollars(result.monthlyMaintenance)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("monthlyMaintenance", result)}
            />
            {result.pmiProvided ? (
              <Row
                label="PMI"
                value={formatDollars(result.monthlyPMI)}
                badge={<ProvenanceBadge label={provenance.pmiMonthlyCents} />}
              />
            ) : (
              <Row label="PMI" value="Not entered" />
            )}
            <Row
              label="Other monthly costs"
              value={formatDollars(result.monthlyOther)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("monthlyOther", result)}
            />
            <Row
              label="Total monthly"
              value={formatDollars(result.totalMonthly)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("totalMonthly", result)}
              strong
            />
            <Row
              label="Annual total"
              value={`${formatDollars(result.totalAnnual)} per year`}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("totalAnnual", result)}
              muted
            />
            <Row
              label={
                result.closingCostsProvided
                  ? "Estimated upfront cash (down payment + closing costs)"
                  : "Estimated upfront cash (down payment only)"
              }
              value={formatDollars(result.estimatedUpfrontCashCents)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("estimatedUpfrontCashCents", result)}
            />
          </dl>
        </details>
        <p className="text-sm text-t-muted">
          Calculated figures above depend on the amounts you entered. The
          upfront figure is this app&apos;s estimate, not a lender&apos;s
          cash-to-close amount, and this breakdown is not a lending decision
          or financial advice.
        </p>
      </div>
    </Card>
  );
}
