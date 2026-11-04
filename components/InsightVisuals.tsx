import type { AffordabilityResult } from "../lib/calc/affordability";
import type {
  ComparisonResult,
  FixedComponentKey,
} from "../lib/calc/compare";
import type { TrueCostResult } from "../lib/calc/trueCost";
import { segmentPercents } from "../lib/format/allocation";
import {
  categoryDifference,
  formatDeltaMagnitude,
  higherSide,
} from "../lib/format/delta";
import { formatDollars } from "../lib/format/money";
import {
  formatCushionMonths,
  formatPercentFromBps,
} from "../lib/format/percent";
import type { ResolvedTrueCostProvenance } from "../lib/validation/api";
import ComparisonBars from "./ComparisonBars";
import Kpi from "./Kpi";
import ProvenanceBadge from "./ProvenanceBadge";

// Compact Financial Insights visuals (T5b.1). Presentational only: every
// figure, proportion, and label derives from verified deterministic engine
// results passed as props. AI text is never parsed here and never feeds a
// chart. Proportions use the shared display-only allocation helpers.

// --- Affordability -------------------------------------------------------

export function AffordabilityInsightsVisual({
  result,
}: {
  result: AffordabilityResult;
}) {
  const housing = result.inputs.proposedHousingMonthlyCents;
  const income = result.inputs.takeHomeMonthlyCents;
  const [share] = segmentPercents([housing], income);
  const shareText = `Proposed housing ${formatDollars(housing)} of ${formatDollars(income)} take-home · ${formatPercentFromBps(result.housingRatioBps)}`;
  return (
    <div className="space-y-4">
      <Kpi
        variant="hero"
        accent
        label="Remaining monthly income"
        value={formatDollars(result.residualMonthlyCents)}
        tone={result.residualMonthlyCents < 0 ? "negative" : "default"}
      />
      <div>
        <h3 className="text-base font-semibold text-t-ink">
          Housing share of take-home
        </h3>
        <div
          role="img"
          aria-label={shareText}
          className="mt-2 h-3.5 overflow-hidden rounded-full bg-t-line-soft"
        >
          <div
            aria-hidden="true"
            style={{ width: `${share ?? 0}%` }}
            className="h-full rounded-full bg-t-action"
          />
        </div>
        <p className="mt-2 text-sm text-t-body">{shareText}</p>
        <p className="mt-1 text-sm text-t-body">
          {result.cushionMonthsX10 === null ? (
            <>
              <span className="font-semibold text-t-ink">
                Savings cushion:
              </span>{" "}
              not applicable — no monthly obligations to measure against
            </>
          ) : (
            <>
              <span className="font-semibold text-t-ink">
                Savings cushion:
              </span>{" "}
              {formatCushionMonths(result.cushionMonthsX10)}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

// --- Property Costs ------------------------------------------------------

interface CostDriver {
  label: string;
  value: number;
  badge: Parameters<typeof ProvenanceBadge>[0]["label"];
}

const DRIVER_LABELS: Record<string, string> = {
  monthlyPI: "Principal and interest",
  monthlyTax: "Property tax",
  monthlyInsurance: "Homeowners insurance",
  monthlyHoa: "HOA",
  monthlyMaintenance: "Maintenance reserve",
  monthlyPMI: "PMI",
  monthlyOther: "Other monthly costs",
};

export function TrueCostInsightsVisual({
  result,
  provenance,
}: {
  result: TrueCostResult;
  provenance: ResolvedTrueCostProvenance;
}) {
  // Mirrors the result view's badge mapping exactly: HOA and PMI keep
  // their input provenance (they echo the entered figure); every other
  // monthly component is a calculated derivation.
  const candidates: CostDriver[] = [
    { label: DRIVER_LABELS.monthlyPI ?? "", value: result.monthlyPI, badge: "calculated" },
    { label: DRIVER_LABELS.monthlyTax ?? "", value: result.monthlyTax, badge: "calculated" },
    {
      label: DRIVER_LABELS.monthlyInsurance ?? "",
      value: result.monthlyInsurance,
      badge: "calculated",
    },
    {
      label: DRIVER_LABELS.monthlyHoa ?? "",
      value: result.monthlyHoa,
      badge: provenance.hoaMonthlyCents,
    },
    {
      label: DRIVER_LABELS.monthlyMaintenance ?? "",
      value: result.monthlyMaintenance,
      badge: "calculated",
    },
    ...(result.pmiProvided
      ? [
          {
            label: DRIVER_LABELS.monthlyPMI ?? "",
            value: result.monthlyPMI,
            badge: provenance.pmiMonthlyCents,
          } as CostDriver,
        ]
      : []),
    {
      label: DRIVER_LABELS.monthlyOther ?? "",
      value: result.monthlyOther,
      badge: "calculated",
    },
  ];
  // Display ordering only: largest verified components first (stable for
  // ties, so equal amounts keep input order).
  const drivers = [...candidates]
    .map((driver, index) => ({ ...driver, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .slice(0, 3);
  const scale = drivers[0]?.value ?? 0;
  const widths = segmentPercents(
    drivers.map((driver) => driver.value),
    scale,
  );
  const summary = `Top monthly costs: ${drivers
    .map((driver) => `${driver.label} ${formatDollars(driver.value)}`)
    .join(", ")}`;
  return (
    <div className="space-y-4">
      <Kpi
        variant="hero"
        accent
        label="Total estimated monthly cost"
        value={formatDollars(result.totalMonthly)}
      />
      <div>
        <h3 className="text-base font-semibold text-t-ink">
          Largest monthly cost drivers
        </h3>
        <div role="img" aria-label={summary} className="mt-3 space-y-3">
          {drivers.map((driver, i) => (
            <div key={driver.label}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-t-body">{driver.label}</span>
                <ProvenanceBadge label={driver.badge} />
                <span className="ml-auto font-semibold text-t-ink tabular-nums">
                  {formatDollars(driver.value)}
                </span>
              </p>
              <div
                aria-hidden="true"
                className="mt-1 h-2.5 overflow-hidden rounded-full bg-t-line-soft"
              >
                <div
                  style={{ width: `${widths[i] ?? 0}%` }}
                  className="h-full rounded-full bg-t-action"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Kpi
        label="Estimated upfront cash"
        value={formatDollars(result.estimatedUpfrontCashCents)}
        caption={
          result.closingCostsProvided
            ? "Includes down payment and closing costs"
            : "Down payment only — no closing costs entered"
        }
      />
    </div>
  );
}

// --- Compare -------------------------------------------------------------

const FIXED_LABELS: Record<FixedComponentKey, string> = {
  principalAndInterest: "Principal and interest",
  propertyTax: "Property tax",
  insurance: "Homeowners insurance",
  hoa: "HOA",
  maintenance: "Maintenance reserve",
  pmi: "PMI",
};

export function CompareInsightsVisual({
  result,
}: {
  result: ComparisonResult;
}) {
  // Largest absolute component deltas first (display ordering of verified
  // engine deltas). Zero deltas are skipped: when nothing differs, the
  // note below says so honestly instead of charting flat lines.
  const movers = result.fixed
    .filter((entry) => entry.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2);
  const monthlySide = higherSide(result.deltaMonthly);
  const differences = [
    { label: "Monthly difference", delta: result.deltaMonthly },
    { label: "Annual difference", delta: result.deltaAnnual },
    { label: "Upfront difference", delta: result.deltaUpfront },
  ];
  return (
    <div className="space-y-4">
      <Kpi
        variant="hero"
        accent
        label="Monthly cost difference"
        value={formatDeltaMagnitude(result.deltaMonthly)}
        caption={
          monthlySide === null
            ? "Both properties have the same estimated monthly cost."
            : `Property ${monthlySide} costs more per month.`
        }
      />
      <div>
        <h3 className="text-base font-semibold text-t-ink">
          Side-by-side monthly costs
        </h3>
        <div className="mt-3">
          <ComparisonBars
            aLabel="Property A"
            aDisplayValue={formatDollars(result.a.totalMonthly)}
            aValue={result.a.totalMonthly}
            bLabel="Property B"
            bDisplayValue={formatDollars(result.b.totalMonthly)}
            bValue={result.b.totalMonthly}
          />
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        {differences.map((entry) => {
          const side = higherSide(entry.delta);
          return (
            <div
              key={entry.label}
              className="rounded-lg bg-t-surface-alt p-4"
            >
              <dt className="text-sm font-medium text-t-muted">
                {entry.label}
              </dt>
              <dd className="mt-1 text-xl font-bold text-t-ink tabular-nums break-words">
                {formatDeltaMagnitude(entry.delta)}
              </dd>
              <dd className="mt-1 text-sm text-t-body">
                {side === null
                  ? "Same estimated cost."
                  : `Property ${side} costs more.`}
              </dd>
            </div>
          );
        })}
      </dl>
      <div>
        <h3 className="text-base font-semibold text-t-ink">
          Biggest component differences
        </h3>
        {movers.length === 0 ? (
          <p className="mt-2 text-sm text-t-body">
            Every monthly component matches between the properties.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {movers.map((entry) => (
              <li
                key={entry.key}
                className="flex flex-wrap items-baseline gap-x-2 text-sm"
              >
                <span className="font-medium text-t-body">
                  {FIXED_LABELS[entry.key]}
                </span>
                <span className="ml-auto font-semibold text-t-ink tabular-nums">
                  {categoryDifference(entry.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
