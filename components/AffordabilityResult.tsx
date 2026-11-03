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
    <div className="border-b border-slate-100 py-3 last:border-b-0 sm:flex sm:items-baseline sm:justify-between sm:gap-x-4">
      <dt className="text-sm text-slate-600">
        {label} {badge}
      </dt>
      <dd className="mt-1 sm:mt-0 sm:text-right">
        <div className="text-base font-semibold text-slate-900">{value}</div>
        {subtext && (
          <div className="mt-0.5 text-xs text-slate-500">{subtext}</div>
        )}
      </dd>
    </div>
  );
}

export default function AffordabilityResultView({ result, provenance }: Props) {
  const { inputs } = result;
  return (
    <section aria-label="Affordability results" className="mt-10 lg:mt-0">
      <h2 className="text-xl font-bold text-slate-900">
        Your affordability snapshot
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Estimate based on the figures you entered above.
      </p>
      <dl className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
            subtext="With no monthly obligations, there is no burn rate to measure."
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
      <p className="mt-3 text-sm text-slate-600">
        Calculated figures above depend on the amounts you entered.
        HomeWise AI does not verify your inputs, and this snapshot is not
        a lending decision or financial advice.
      </p>
    </section>
  );
}
