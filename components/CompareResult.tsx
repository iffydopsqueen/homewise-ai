import type { ReactNode } from "react";

import type {
  ComparisonResult,
  FixedComponentKey,
} from "../lib/calc/compare";
import type { TrueCostWarning } from "../lib/calc/trueCost";
import {
  categoryDifference,
  differenceSentence,
} from "../lib/format/delta";
import { formatDollars } from "../lib/format/money";
import {
  formatPercentFromBps,
  formatPercentFromMilliPct,
} from "../lib/format/percent";
import { compareDeltaDisplay } from "../lib/format/provenance";
import type {
  ProvenanceLabel,
  ResolvedTrueCostProvenance,
} from "../lib/validation/api";
import Card from "./Card";
import ComparisonBars from "./ComparisonBars";
import Kpi from "./Kpi";
import ProvenanceBadge from "./ProvenanceBadge";

interface Props {
  result: ComparisonResult;
  provenanceA: ResolvedTrueCostProvenance;
  provenanceB: ResolvedTrueCostProvenance;
}

const FIXED_LABELS: Record<FixedComponentKey, string> = {
  principalAndInterest: "Principal and interest",
  propertyTax: "Property tax",
  insurance: "Homeowners insurance",
  hoa: "HOA",
  maintenance: "Maintenance reserve",
  pmi: "PMI",
};

const TERM_LABELS: Record<number, string> = {
  180: "15 years",
  360: "30 years",
};

function termLabel(months: number): string {
  return TERM_LABELS[months] ?? `${months} months`;
}

// Approved Step 3 warning copy, duplicated (not imported) so this step
// never modifies the frozen Step 3 view. Rendered only for warnings the
// engine actually returned, per side.
const WARNING_MESSAGES: Record<TrueCostWarning, string> = {
  "closing-costs-not-provided":
    "Closing costs weren't entered, so the upfront figure covers the down payment only.",
  "zero-property-tax-confirm":
    "You entered $0 for property taxes — confirm that's correct.",
  "zero-hoa-confirm": "You entered $0 for HOA fees — confirm that's correct.",
  "zero-maintenance-confirm":
    "You entered $0 for maintenance reserve — confirm that's correct.",
};

const LABEL_WORDS: Record<ProvenanceLabel, string> = {
  "user-provided": "an exact figure",
  estimate: "an estimate",
  assumption: "an assumption",
};

// Cost-difference sentences use the shared direction-aware helper: the
// higher-cost side is named explicitly with the absolute difference, so
// no ordering reads as a confusing negative. Detailed tables below keep
// the signed B-minus-A convention with explicit labels.

// Difference-cell subtext from the Step 1 delta descriptor: the badge kind
// comes from the helper, and the A/B values shown are passed in by the row.
function deltaSubtext(key: string, aText: string, bText: string): string | null {
  const mapping = compareDeltaDisplay(key);
  if (mapping.kind !== "calculated") {
    return null;
  }
  return `Based on Property A ${aText} · Property B ${bText}`;
}

function DeltaCell({
  deltaKey,
  delta,
  aText,
  bText,
}: {
  deltaKey: string;
  delta: number;
  aText: string;
  bText: string;
}) {
  return (
    <>
      <div className="font-semibold text-t-ink">
        {formatDollars(delta)} <ProvenanceBadge label="calculated" />
      </div>
      <div className="mt-0.5 text-xs text-t-caption">
        {deltaSubtext(deltaKey, aText, bText)}
      </div>
    </>
  );
}

// Comparability notes: equality comparisons only, never recalculated
// deltas. Covers provenance-label mismatches, differing assumption values
// (maintenance rates), differing estimate values where both sides marked
// a figure as an estimate, one-sided closing costs, and the defensive
// engine flag.
function comparabilityNotes(
  result: ComparisonResult,
  provenanceA: ResolvedTrueCostProvenance,
  provenanceB: ResolvedTrueCostProvenance,
): string[] {
  const notes: string[] = [];
  const inputsA = result.a.inputs;
  const inputsB = result.b.inputs;
  const labeled: {
    key: "annualTaxCents" | "annualInsuranceCents" | "hoaMonthlyCents";
    name: string;
  }[] = [
    { key: "annualTaxCents", name: "property taxes" },
    { key: "annualInsuranceCents", name: "homeowners insurance" },
    { key: "hoaMonthlyCents", name: "HOA fees" },
  ];
  for (const { key, name } of labeled) {
    if (provenanceA[key] !== provenanceB[key]) {
      notes.push(
        `Property A marked ${name} as ${LABEL_WORDS[provenanceA[key]]}; Property B marked ${name} as ${LABEL_WORDS[provenanceB[key]]}.`,
      );
    }
  }
  const closingA = provenanceA.closingCostsCents;
  const closingB = provenanceB.closingCostsCents;
  if (closingA !== undefined && closingB !== undefined) {
    if (closingA !== closingB) {
      notes.push(
        `Property A marked closing costs as ${LABEL_WORDS[closingA]}; Property B marked closing costs as ${LABEL_WORDS[closingB]}.`,
      );
    }
  } else if (result.a.closingCostsProvided !== result.b.closingCostsProvided) {
    notes.push(
      result.a.closingCostsProvided
        ? "Property A entered closing costs; Property B did not."
        : "Property B entered closing costs; Property A did not.",
    );
  }
  if (inputsA.maintenanceRateBps !== inputsB.maintenanceRateBps) {
    notes.push(
      `Maintenance reserve rates differ (Property A: ${formatPercentFromBps(inputsA.maintenanceRateBps)}, Property B: ${formatPercentFromBps(inputsB.maintenanceRateBps)}).`,
    );
  }
  const estimated: {
    key: "annualTaxCents" | "annualInsuranceCents" | "hoaMonthlyCents";
    name: string;
  }[] = labeled;
  for (const { key, name } of estimated) {
    if (
      provenanceA[key] === "estimate" &&
      provenanceB[key] === "estimate" &&
      inputsA[key] !== inputsB[key]
    ) {
      notes.push(
        `Estimated ${name} differ (Property A: ${formatDollars(inputsA[key])}, Property B: ${formatDollars(inputsB[key])}).`,
      );
    }
  }
  if (
    closingA === "estimate" &&
    closingB === "estimate" &&
    inputsA.closingCostsCents !== undefined &&
    inputsB.closingCostsCents !== undefined &&
    inputsA.closingCostsCents !== inputsB.closingCostsCents
  ) {
    notes.push(
      `Estimated closing costs differ (Property A: ${formatDollars(inputsA.closingCostsCents)}, Property B: ${formatDollars(inputsB.closingCostsCents)}).`,
    );
  }
  if (result.assumptionsDiffer) {
    notes.push(
      "The two properties were evaluated under different assumption sets, so differences may not be directly comparable.",
    );
  }
  return notes;
}

function SideValue({
  value,
  badge,
  subtext,
}: {
  value: string;
  badge?: ReactNode;
  subtext?: string | null;
}) {
  return (
    <>
      <div className="font-semibold text-t-ink">
        {value} {badge}
      </div>
      {subtext && <div className="mt-0.5 text-xs text-t-caption">{subtext}</div>}
    </>
  );
}

function WarningsBox({ title, warnings }: { title: string; warnings: TrueCostWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div className="mt-4 rounded-md border border-t-line-strong bg-t-surface-alt p-4">
      <p className="text-sm font-semibold text-t-ink">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-t-body">
        {warnings.map((warning) => (
          <li key={warning}>{WARNING_MESSAGES[warning]}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CompareResultView({
  result,
  provenanceA,
  provenanceB,
}: Props) {
  const inputsA = result.a.inputs;
  const inputsB = result.b.inputs;
  const notes = comparabilityNotes(result, provenanceA, provenanceB);
  const matched = result.otherLines.filter((l) => l.status === "matched");
  const onlyA = result.otherLines.filter((l) => l.status === "removed");
  const onlyB = result.otherLines.filter((l) => l.status === "added");

  const inputRows: {
    label: string;
    a: string;
    b: string;
    badgeA?: ReactNode;
    badgeB?: ReactNode;
  }[] = [
    {
      label: "Purchase price",
      a: formatDollars(inputsA.homePriceCents),
      b: formatDollars(inputsB.homePriceCents),
      badgeA: <ProvenanceBadge label={provenanceA.homePriceCents} />,
      badgeB: <ProvenanceBadge label={provenanceB.homePriceCents} />,
    },
    {
      label: "Down payment",
      a: formatDollars(inputsA.downPaymentCents),
      b: formatDollars(inputsB.downPaymentCents),
      badgeA: <ProvenanceBadge label={provenanceA.downPaymentCents} />,
      badgeB: <ProvenanceBadge label={provenanceB.downPaymentCents} />,
    },
    {
      label: "Interest rate",
      a: formatPercentFromMilliPct(inputsA.annualRateMilliPct),
      b: formatPercentFromMilliPct(inputsB.annualRateMilliPct),
      badgeA: <ProvenanceBadge label={provenanceA.annualRateMilliPct} />,
      badgeB: <ProvenanceBadge label={provenanceB.annualRateMilliPct} />,
    },
    {
      label: "Loan term",
      a: termLabel(inputsA.termMonths),
      b: termLabel(inputsB.termMonths),
      badgeA: <ProvenanceBadge label={provenanceA.termMonths} />,
      badgeB: <ProvenanceBadge label={provenanceB.termMonths} />,
    },
    {
      label: "Annual property taxes",
      a: formatDollars(inputsA.annualTaxCents),
      b: formatDollars(inputsB.annualTaxCents),
      badgeA: <ProvenanceBadge label={provenanceA.annualTaxCents} />,
      badgeB: <ProvenanceBadge label={provenanceB.annualTaxCents} />,
    },
    {
      label: "Annual homeowners insurance",
      a: formatDollars(inputsA.annualInsuranceCents),
      b: formatDollars(inputsB.annualInsuranceCents),
      badgeA: <ProvenanceBadge label={provenanceA.annualInsuranceCents} />,
      badgeB: <ProvenanceBadge label={provenanceB.annualInsuranceCents} />,
    },
    {
      label: "Monthly HOA",
      a: formatDollars(inputsA.hoaMonthlyCents),
      b: formatDollars(inputsB.hoaMonthlyCents),
      badgeA: <ProvenanceBadge label={provenanceA.hoaMonthlyCents} />,
      badgeB: <ProvenanceBadge label={provenanceB.hoaMonthlyCents} />,
    },
    {
      label: "Maintenance reserve rate",
      a: formatPercentFromBps(inputsA.maintenanceRateBps),
      b: formatPercentFromBps(inputsB.maintenanceRateBps),
      badgeA: <ProvenanceBadge label={provenanceA.maintenanceRateBps} />,
      badgeB: <ProvenanceBadge label={provenanceB.maintenanceRateBps} />,
    },
  ];

  return (
    <Card
      id="compare-results-heading"
      title="Property comparison"
      description="Side-by-side estimate from the figures entered for each property."
      focusableHeading
    >
      <div className="mt-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { side: "A" as const, property: result.a },
              { side: "B" as const, property: result.b },
            ]
          ).map(({ side, property }) => (
            <div
              key={side}
              className="rounded-lg bg-t-surface-alt p-4"
            >
              <p className="text-sm font-semibold text-t-ink">
                Property {side}
              </p>
              <div className="mt-3 space-y-4">
                <Kpi
                  plain
                  variant="hero"
                  label="Estimated monthly cost"
                  value={formatDollars(property.totalMonthly)}
                />
                <Kpi
                  plain
                  label="Annual cost"
                  value={`${formatDollars(property.totalAnnual)} per year`}
                />
                <Kpi
                  plain
                  label="Estimated upfront cash"
                  value={formatDollars(
                    property.estimatedUpfrontCashCents,
                  )}
                  caption={
                    property.closingCostsProvided
                      ? "Includes down payment and closing costs"
                      : "Down payment only — no closing costs entered"
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <section aria-labelledby="compare-monthly-bars-heading">
          <h3
            id="compare-monthly-bars-heading"
            className="text-base font-semibold text-t-ink"
          >
            Monthly cost comparison
          </h3>
          <div className="mt-3">
            <ComparisonBars
              aLabel="Property A"
              aDisplayValue={formatDollars(result.a.totalMonthly)}
              aValue={result.a.totalMonthly}
              bLabel="Property B"
              bDisplayValue={formatDollars(result.b.totalMonthly)}
              bValue={result.b.totalMonthly}
              summary={`Property A ${formatDollars(result.a.totalMonthly)} per month, Property B ${formatDollars(result.b.totalMonthly)} per month`}
            />
          </div>
        </section>
        <section aria-labelledby="compare-differences-heading">
          <h3
            id="compare-differences-heading"
            className="text-base font-semibold text-t-ink"
          >
            Cost differences
          </h3>
          <div className="mt-2 space-y-1 text-base font-medium text-t-ink">
            <p>{differenceSentence(result.deltaMonthly, "monthly")}</p>
            <p>{differenceSentence(result.deltaAnnual, "annual")}</p>
            <p>{differenceSentence(result.deltaUpfront, "upfront")}</p>
          </div>
        </section>
        <section aria-labelledby="compare-categories-heading">
          <h3
            id="compare-categories-heading"
            className="text-base font-semibold text-t-ink"
          >
            Cost categories
          </h3>
          <p className="mt-1 text-sm text-t-muted">
            Each difference names the property with the higher cost.
          </p>
          <div className="mt-2">
            {result.fixed.map((component) => (
              <div
                key={component.key}
                className="border-b border-t-line-soft py-3 last:border-b-0"
              >
                <p className="text-sm font-medium text-t-ink">
                  {FIXED_LABELS[component.key]}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-t-muted">Property A </span>
                    <span className="font-semibold text-t-ink tabular-nums">
                      {formatDollars(component.a)}
                    </span>
                  </span>
                  <span>
                    <span className="text-t-muted">Property B </span>
                    <span className="font-semibold text-t-ink tabular-nums">
                      {formatDollars(component.b)}
                    </span>
                  </span>
                  <span className="font-semibold text-t-ink">
                    {categoryDifference(component.delta)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-t-muted">
            Other monthly costs are compared line by line in the detailed
            tables below.
          </p>
        </section>
      </div>

      <details className="mt-6 border-t border-t-line pt-4">
        <summary className="w-fit cursor-pointer text-sm font-semibold text-t-ink underline">
          View detailed breakdown
        </summary>
          <h3 className="mt-6 text-base font-semibold text-t-ink">
            Figures compared
          </h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-t-line bg-t-surface shadow-sm">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <caption className="sr-only">
              Input figures entered for Property A and Property B
            </caption>
            <thead>
              <tr className="border-b border-t-line text-left">
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Figure
                </th>
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Property A
                </th>
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Property B
                </th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((row) => (
                <tr key={row.label} className="border-b border-t-line-soft last:border-b-0">
                  <th scope="row" className="p-4 font-normal text-t-muted">
                    {row.label}
                  </th>
                  <td className="p-4">
                    <SideValue value={row.a} badge={row.badgeA} />
                  </td>
                  <td className="p-4">
                    <SideValue value={row.b} badge={row.badgeB} />
                  </td>
                </tr>
              ))}
              <tr className="border-b border-t-line-soft last:border-b-0">
                <th scope="row" className="p-4 font-normal text-t-muted">
                  PMI
                </th>
                <td className="p-4">
                  {inputsA.pmiMonthlyCents === undefined ? (
                    <SideValue value="Not entered" />
                  ) : (
                    <SideValue
                      value={formatDollars(inputsA.pmiMonthlyCents)}
                      badge={<ProvenanceBadge label={provenanceA.pmiMonthlyCents} />}
                    />
                  )}
                </td>
                <td className="p-4">
                  {inputsB.pmiMonthlyCents === undefined ? (
                    <SideValue value="Not entered" />
                  ) : (
                    <SideValue
                      value={formatDollars(inputsB.pmiMonthlyCents)}
                      badge={<ProvenanceBadge label={provenanceB.pmiMonthlyCents} />}
                    />
                  )}
                </td>
              </tr>
              <tr className="border-b border-t-line-soft last:border-b-0">
                <th scope="row" className="p-4 font-normal text-t-muted">
                  Closing costs (one-time)
                </th>
                <td className="p-4">
                  {inputsA.closingCostsCents === undefined ||
                  provenanceA.closingCostsCents === undefined ? (
                    <SideValue value="Not entered" />
                  ) : (
                    <SideValue
                      value={formatDollars(inputsA.closingCostsCents)}
                      badge={
                        <ProvenanceBadge label={provenanceA.closingCostsCents} />
                      }
                    />
                  )}
                </td>
                <td className="p-4">
                  {inputsB.closingCostsCents === undefined ||
                  provenanceB.closingCostsCents === undefined ? (
                    <SideValue value="Not entered" />
                  ) : (
                    <SideValue
                      value={formatDollars(inputsB.closingCostsCents)}
                      badge={
                        <ProvenanceBadge label={provenanceB.closingCostsCents} />
                      }
                    />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-base font-semibold text-t-ink">
          Monthly breakdown
        </h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-t-line bg-t-surface shadow-sm">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <caption className="sr-only">
              Monthly cost components for Property A and Property B with
              differences
            </caption>
            <thead>
              <tr className="border-b border-t-line text-left">
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Cost
                </th>
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Property A
                </th>
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Property B
                </th>
                <th scope="col" className="p-4 font-semibold text-t-ink">
                  Difference (B − A)
                </th>
              </tr>
            </thead>
            <tbody>
              {result.fixed.map((entry) => {
                const absentA =
                  entry.key === "pmi" && inputsA.pmiMonthlyCents === undefined;
                const absentB =
                  entry.key === "pmi" && inputsB.pmiMonthlyCents === undefined;
                const aText = absentA ? "Not entered" : formatDollars(entry.a);
                const bText = absentB ? "Not entered" : formatDollars(entry.b);
                return (
                  <tr
                    key={entry.key}
                    className="border-b border-t-line-soft last:border-b-0"
                  >
                    <th scope="row" className="p-4 font-normal text-t-muted">
                      {FIXED_LABELS[entry.key]}
                    </th>
                    <td className="p-4">
                      {absentA ? (
                        <SideValue value="Not entered" />
                      ) : entry.key === "hoa" ? (
                        <SideValue
                          value={aText}
                          badge={
                            <ProvenanceBadge label={provenanceA.hoaMonthlyCents} />
                          }
                        />
                      ) : entry.key === "pmi" ? (
                        <SideValue
                          value={aText}
                          badge={
                            <ProvenanceBadge label={provenanceA.pmiMonthlyCents} />
                          }
                        />
                      ) : (
                        <SideValue value={aText} />
                      )}
                    </td>
                    <td className="p-4">
                      {absentB ? (
                        <SideValue value="Not entered" />
                      ) : entry.key === "hoa" ? (
                        <SideValue
                          value={bText}
                          badge={
                            <ProvenanceBadge label={provenanceB.hoaMonthlyCents} />
                          }
                        />
                      ) : entry.key === "pmi" ? (
                        <SideValue
                          value={bText}
                          badge={
                            <ProvenanceBadge label={provenanceB.pmiMonthlyCents} />
                          }
                        />
                      ) : (
                        <SideValue value={bText} />
                      )}
                    </td>
                    <td className="p-4">
                      <DeltaCell
                        deltaKey={`fixed.${entry.key}`}
                        delta={entry.delta}
                        aText={aText}
                        bText={bText}
                      />
                    </td>
                  </tr>
                );
              })}
              {/* No other-costs subtotal row: the API provides per-line
                  A/B/deltas (shown grouped below) but no monthlyOther delta,
                  and the browser must not compute one. */}
              <tr className="border-b border-t-line-soft">
                <th scope="row" className="p-4 font-semibold text-t-ink">
                  Total monthly
                </th>
                <td className="p-4">
                  <SideValue value={formatDollars(result.a.totalMonthly)} />
                </td>
                <td className="p-4">
                  <SideValue value={formatDollars(result.b.totalMonthly)} />
                </td>
                <td className="p-4">
                  <DeltaCell
                    deltaKey="totalMonthly"
                    delta={result.deltaMonthly}
                    aText={formatDollars(result.a.totalMonthly)}
                    bText={formatDollars(result.b.totalMonthly)}
                  />
                </td>
              </tr>
              <tr className="border-b border-t-line-soft">
                <th scope="row" className="p-4 font-normal text-t-muted">
                  Annual total
                </th>
                <td className="p-4">
                  <SideValue value={formatDollars(result.a.totalAnnual)} />
                </td>
                <td className="p-4">
                  <SideValue value={formatDollars(result.b.totalAnnual)} />
                </td>
                <td className="p-4">
                  <DeltaCell
                    deltaKey="totalAnnual"
                    delta={result.deltaAnnual}
                    aText={formatDollars(result.a.totalAnnual)}
                    bText={formatDollars(result.b.totalAnnual)}
                  />
                </td>
              </tr>
              <tr className="border-b border-t-line-soft last:border-b-0">
                <th scope="row" className="p-4 font-normal text-t-muted">
                  Estimated upfront cash
                </th>
                <td className="p-4">
                  <SideValue
                    value={formatDollars(result.a.estimatedUpfrontCashCents)}
                    subtext={
                      result.a.closingCostsProvided
                        ? "Down payment + closing costs"
                        : "Down payment only"
                    }
                  />
                </td>
                <td className="p-4">
                  <SideValue
                    value={formatDollars(result.b.estimatedUpfrontCashCents)}
                    subtext={
                      result.b.closingCostsProvided
                        ? "Down payment + closing costs"
                        : "Down payment only"
                    }
                  />
                </td>
                <td className="p-4">
                  <DeltaCell
                    deltaKey="upfront"
                    delta={result.deltaUpfront}
                    aText={formatDollars(result.a.estimatedUpfrontCashCents)}
                    bText={formatDollars(result.b.estimatedUpfrontCashCents)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-t-caption">
          Differences show Property B minus Property A. A negative difference
          means Property B is lower for that row.
        </p>

        <h3 className="mt-6 text-base font-semibold text-t-ink">
          Other monthly costs
        </h3>
        {matched.length === 0 && onlyA.length === 0 && onlyB.length === 0 ? (
          <p className="mt-2 text-sm text-t-muted">
            No other costs entered for either property.
          </p>
        ) : (
          <div className="mt-2 space-y-4">
            {matched.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-t-line bg-t-surface shadow-sm">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Other costs present for both properties
                  </caption>
                  <thead>
                    <tr className="border-b border-t-line text-left">
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Matched item
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Property A
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Property B
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Difference (B − A)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((line) => (
                      <tr
                        key={line.key}
                        className="border-b border-t-line-soft last:border-b-0"
                      >
                        <th scope="row" className="p-4 font-normal text-t-muted">
                          {line.labelA === line.labelB
                            ? (line.labelA ?? line.key)
                            : `A: ${line.labelA ?? line.key} · B: ${line.labelB ?? line.key}`}
                        </th>
                        <td className="p-4">
                          <SideValue value={formatDollars(line.a)} />
                        </td>
                        <td className="p-4">
                          <SideValue value={formatDollars(line.b)} />
                        </td>
                        <td className="p-4">
                          <DeltaCell
                            deltaKey={`otherLines.${line.key}`}
                            delta={line.delta}
                            aText={formatDollars(line.a)}
                            bText={formatDollars(line.b)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {onlyA.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-t-line bg-t-surface shadow-sm">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Other costs present only for Property A
                  </caption>
                  <thead>
                    <tr className="border-b border-t-line text-left">
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Only in Property A
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Property A
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Property B
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Difference (B − A)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlyA.map((line) => (
                      <tr
                        key={line.key}
                        className="border-b border-t-line-soft last:border-b-0"
                      >
                        <th scope="row" className="p-4 font-normal text-t-muted">
                          {line.labelA ?? line.key}
                        </th>
                        <td className="p-4">
                          <SideValue value={formatDollars(line.a)} />
                        </td>
                        <td className="p-4">
                          <SideValue value="—" />
                        </td>
                        <td className="p-4">
                          <DeltaCell
                            deltaKey={`otherLines.${line.key}`}
                            delta={line.delta}
                            aText={formatDollars(line.a)}
                            bText="no entry"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {onlyB.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-t-line bg-t-surface shadow-sm">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Other costs present only for Property B
                  </caption>
                  <thead>
                    <tr className="border-b border-t-line text-left">
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Only in Property B
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Property A
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Property B
                      </th>
                      <th scope="col" className="p-4 font-semibold text-t-ink">
                        Difference (B − A)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlyB.map((line) => (
                      <tr
                        key={line.key}
                        className="border-b border-t-line-soft last:border-b-0"
                      >
                        <th scope="row" className="p-4 font-normal text-t-muted">
                          {line.labelB ?? line.key}
                        </th>
                        <td className="p-4">
                          <SideValue value="—" />
                        </td>
                        <td className="p-4">
                          <SideValue value={formatDollars(line.b)} />
                        </td>
                        <td className="p-4">
                          <DeltaCell
                            deltaKey={`otherLines.${line.key}`}
                            delta={line.delta}
                            aText="no entry"
                            bText={formatDollars(line.b)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </details>

      {notes.length > 0 && (
        <div className="mt-6 rounded-md border border-t-line-strong bg-t-surface-alt p-4">
          <p className="text-sm font-semibold text-t-ink">
            About this comparison
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-t-body">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <WarningsBox title="Property A notes" warnings={result.a.warnings} />
      <WarningsBox title="Property B notes" warnings={result.b.warnings} />

      <p className="mt-3 text-sm text-t-muted">
        Calculated figures above depend on the amounts entered for each
        property. Upfront figures are this app&apos;s estimates, not a
        lender&apos;s cash-to-close amounts. This comparison does not rank
        the properties, recommend either one, or constitute a lending
        decision or financial advice.
      </p>
    </Card>
  );
}
