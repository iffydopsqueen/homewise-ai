import type { AffordabilityResult } from "../lib/calc/affordability";
import { formatDollars } from "../lib/format/money";
import {
  formatCushionMonths,
  formatPercentFromBps,
} from "../lib/format/percent";
import {
  AFFORDABILITY_DISPLAY,
  type DisplaySource,
} from "../lib/format/provenance";
import type { ResolvedAffordabilityProvenance } from "../lib/validation/api";
import AllocationBar from "./AllocationBar";
import Card from "./Card";
import Kpi from "./Kpi";
import ProvenanceBadge from "./ProvenanceBadge";

interface Props {
  result: AffordabilityResult;
  provenance: ResolvedAffordabilityProvenance;
}

const INPUT_LABELS: Record<string, string> = {
  takeHomeMonthlyCents: "Take-home income",
  proposedHousingMonthlyCents: "Proposed housing",
  debtsMonthlyCents: "Debts",
  expensesMonthlyCents: "Expenses",
  savingsCents: "Savings",
};

function labelFor(key: string, fallback: Record<string, string>): string {
  return fallback[key] ?? key;
}

// Renders one "Based on ..." contributor as "Label $value". Input-scope
// sources are request figures; result-scope sources in this view are always
// the obligations total (a money value).
function sourceText(
  source: DisplaySource,
  result: AffordabilityResult,
): string {
  if (source.scope === "input") {
    const value = result.inputs[source.key as keyof typeof result.inputs];
    return `${labelFor(source.key, INPUT_LABELS)} ${formatDollars(value)}`;
  }
  const value = (result as unknown as Record<string, number>)[source.key];
  return `Total obligations ${formatDollars(value)}`;
}

function subtextFor(
  field: keyof typeof AFFORDABILITY_DISPLAY,
  result: AffordabilityResult,
): string | null {
  const mapping = AFFORDABILITY_DISPLAY[field];
  if (mapping.kind !== "calculated" || mapping.sources.length === 0) {
    return null;
  }
  return `Based on ${mapping.sources.map((s) => sourceText(s, result)).join(" · ")}`;
}

function Row({
  label,
  value,
  badge,
  subtext,
}: {
  label: string;
  value: string;
  badge: React.ReactNode;
  subtext?: string | null;
}) {
  return (
    <div className="border-b border-t-line-soft py-3 last:border-b-0 sm:flex sm:items-baseline sm:justify-between sm:gap-x-4">
      <dt className="text-sm text-t-muted">
        {label} {badge}
      </dt>
      <dd className="mt-1 sm:mt-0 sm:text-right">
        <div className="text-base font-semibold text-t-ink">{value}</div>
        {subtext && (
          <div className="mt-0.5 text-xs text-t-caption">{subtext}</div>
        )}
      </dd>
    </div>
  );
}

export default function AffordabilityResultView({ result, provenance }: Props) {
  const { inputs } = result;
  const residual = result.residualMonthlyCents;
  const shortfall = residual < 0;
  const heroCaption = shortfall
    ? "Remaining monthly income · Shortfall"
    : residual === 0
      ? "Remaining monthly income · Nothing remains after listed obligations"
      : "Remaining monthly income";
  // Allocation chart inputs. In shortfall mode the obligations sum becomes
  // the bar scale (take-home pay is drawn as a limit mark instead); the
  // negative residual is never rendered as a bar segment.
  const totalObligations = result.totalMonthlyObligations;
  const segments = shortfall
    ? [
        {
          label: "Housing",
          displayValue: formatDollars(inputs.proposedHousingMonthlyCents),
          value: inputs.proposedHousingMonthlyCents,
        },
        {
          label: "Debts",
          displayValue: formatDollars(inputs.debtsMonthlyCents),
          value: inputs.debtsMonthlyCents,
        },
        {
          label: "Living expenses",
          displayValue: formatDollars(inputs.expensesMonthlyCents),
          value: inputs.expensesMonthlyCents,
        },
      ]
    : [
        {
          label: "Housing",
          displayValue: formatDollars(inputs.proposedHousingMonthlyCents),
          value: inputs.proposedHousingMonthlyCents,
        },
        {
          label: "Debts",
          displayValue: formatDollars(inputs.debtsMonthlyCents),
          value: inputs.debtsMonthlyCents,
        },
        {
          label: "Living expenses",
          displayValue: formatDollars(inputs.expensesMonthlyCents),
          value: inputs.expensesMonthlyCents,
        },
        {
          label: "Remaining",
          displayValue: formatDollars(residual),
          value: residual,
        },
      ];
  const chartTotal = shortfall ? totalObligations : inputs.takeHomeMonthlyCents;
  const chartSummary = shortfall
    ? `Obligations ${formatDollars(totalObligations)} exceed take-home income ${formatDollars(inputs.takeHomeMonthlyCents)}`
    : undefined;
  return (
    <Card
      id="affordability-results-heading"
      title="Your affordability snapshot"
      description="Estimate based on the figures you entered above."
    >
      <div className="mt-6 space-y-6">
        <Kpi
          variant="hero"
          accent
          label="Money left each month"
          value={formatDollars(residual)}
          caption={heroCaption}
          tone={shortfall ? "negative" : "default"}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-t-surface-alt p-4">
            <Kpi
              plain
              label="Housing-to-income ratio"
              value={formatPercentFromBps(result.housingRatioBps)}
              caption="Proposed housing vs take-home pay"
            />
          </div>
          <div className="rounded-lg bg-t-surface-alt p-4">
            <Kpi
              plain
              label="Savings cushion"
              value={
                result.cushionMonthsX10 === null
                  ? "Not applicable"
                  : formatCushionMonths(result.cushionMonthsX10)
              }
              caption={
                result.cushionMonthsX10 === null
                  ? "No monthly obligations to measure against"
                  : "Months of obligations covered by savings"
              }
            />
          </div>
        </div>
        <section aria-labelledby="affordability-allocation-heading">
          <h3
            id="affordability-allocation-heading"
            className="text-base font-semibold text-t-ink"
          >
            Income allocation
          </h3>
          {shortfall && (
            <p className="mt-1 text-sm font-medium text-t-error">
              Obligations exceed income by {formatDollars(-residual)} each
              month.
            </p>
          )}
          <div className="mt-3">
            <AllocationBar
              segments={segments}
              total={chartTotal}
              limitMark={
                shortfall
                  ? {
                      value: inputs.takeHomeMonthlyCents,
                      displayValue: formatDollars(
                        inputs.takeHomeMonthlyCents,
                      ),
                      label: "Monthly take-home income",
                    }
                  : undefined
              }
              summary={chartSummary}
            />
          </div>
        </section>
        <details className="border-t border-t-line pt-4">
          <summary className="w-fit cursor-pointer text-sm font-semibold text-t-ink underline">
            View detailed breakdown
          </summary>
          <dl className="mt-4">
            <Row
              label="Monthly take-home income"
              value={formatDollars(inputs.takeHomeMonthlyCents)}
              badge={<ProvenanceBadge label={provenance.takeHomeMonthlyCents} />}
            />
            <Row
              label="Proposed monthly housing cost"
              value={formatDollars(inputs.proposedHousingMonthlyCents)}
              badge={
                <ProvenanceBadge label={provenance.proposedHousingMonthlyCents} />
              }
            />
            <Row
              label="Existing debt payments"
              value={formatDollars(inputs.debtsMonthlyCents)}
              badge={<ProvenanceBadge label={provenance.debtsMonthlyCents} />}
            />
            <Row
              label="Other monthly living expenses"
              value={formatDollars(inputs.expensesMonthlyCents)}
              badge={<ProvenanceBadge label={provenance.expensesMonthlyCents} />}
            />
            <Row
              label="Total monthly obligations"
              value={formatDollars(result.totalMonthlyObligations)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("totalMonthlyObligations", result) ?? undefined}
            />
            <Row
              label="Housing-cost-to-income ratio"
              value={formatPercentFromBps(result.housingRatioBps)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("housingRatioBps", result) ?? undefined}
            />
            <Row
              label="Total debt-to-income ratio"
              value={formatPercentFromBps(result.obligationsRatioBps)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("obligationsRatioBps", result) ?? undefined}
            />
            <Row
              label="Remaining monthly income"
              value={formatDollars(result.residualMonthlyCents)}
              badge={<ProvenanceBadge label="calculated" />}
              subtext={subtextFor("residualMonthlyCents", result) ?? undefined}
            />
            {result.cushionMonthsX10 === null ? (
              <Row
                label="Savings cushion"
                value="Not applicable"
                badge={<ProvenanceBadge label="calculated" />}
                subtext="With no monthly obligations, there is nothing to measure your savings against."
              />
            ) : (
              <Row
                label="Savings cushion"
                value={formatCushionMonths(result.cushionMonthsX10)}
                badge={<ProvenanceBadge label="calculated" />}
                subtext={subtextFor("cushionMonthsX10", result) ?? undefined}
              />
            )}
          </dl>
        </details>
        <p className="text-sm text-t-muted">
          Calculated figures above depend on the amounts you entered.
          HomeWise AI does not verify your inputs, and this snapshot is not
          a lending decision or financial advice.
        </p>
      </div>
    </Card>
  );
}
