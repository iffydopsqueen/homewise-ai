"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { AffordabilityResult } from "../lib/calc/affordability";
import type { ComparisonResult } from "../lib/calc/compare";
import type { TrueCostResult } from "../lib/calc/trueCost";
import {
  deltaDirection,
  formatDeltaMagnitude,
} from "../lib/format/delta";
import { formatDollars } from "../lib/format/money";
import {
  formatCushionMonths,
  formatPercentFromBps,
} from "../lib/format/percent";
import {
  isAffordabilityDraftEmpty,
  isTrueCostDraftEmpty,
  useSession,
} from "../lib/session/store";
import ProvenanceBadge from "./ProvenanceBadge";

// Live dashboard cards (restructuring P3). Read-only subscribers to the
// shared session store: each card derives its status from its workflow's
// draft and stored result during render. No effects, fetches, polling, or
// duplicated state — submissions, edits, and Start over re-render through
// context. Draft strings are never parsed or displayed; only stored,
// validated results produce figures.

type CardStatus = "empty" | "in-progress" | "completed";

const STATUS_TEXT: Record<CardStatus, string> = {
  empty: "Not started yet.",
  "in-progress": "In progress — no results yet.",
  completed: "Completed",
};

const WORKFLOWS = [
  {
    href: "/affordability",
    id: "dashboard-affordability-heading",
    title: "Affordability",
    description:
      "See whether a monthly housing payment fits your budget, based on take-home pay, debts, expenses, and savings.",
  },
  {
    href: "/property-costs",
    id: "dashboard-property-costs-heading",
    title: "Property Costs",
    description:
      "Break down one property's true monthly cost: mortgage, taxes, insurance, HOA, maintenance, PMI, and upfront cash.",
  },
  {
    href: "/compare",
    id: "dashboard-compare-heading",
    title: "Compare Properties",
    description:
      "Compare two properties side by side, with per-component and total differences explained neutrally.",
  },
] as const;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-x-3 py-1">
      <dt className="text-sm text-slate-600">
        {label} <ProvenanceBadge label="calculated" />
      </dt>
      <dd className="shrink-0 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function AffordabilitySummary({ result }: { result: AffordabilityResult }) {
  return (
    <dl className="mt-3 border-t border-slate-100 pt-2">
      <SummaryRow
        label="Remaining monthly income"
        value={formatDollars(result.residualMonthlyCents)}
      />
      <SummaryRow
        label="Total monthly obligations"
        value={formatDollars(result.totalMonthlyObligations)}
      />
      <SummaryRow
        label="Housing-cost-to-income ratio"
        value={formatPercentFromBps(result.housingRatioBps)}
      />
      <SummaryRow
        label="Savings cushion"
        value={
          result.cushionMonthsX10 === null
            ? "Not applicable"
            : formatCushionMonths(result.cushionMonthsX10)
        }
      />
    </dl>
  );
}

function PropertySummary({ result }: { result: TrueCostResult }) {
  return (
    <dl className="mt-3 border-t border-slate-100 pt-2">
      <SummaryRow
        label="Total estimated monthly cost"
        value={formatDollars(result.totalMonthly)}
      />
      <SummaryRow
        label={
          result.closingCostsProvided
            ? "Estimated upfront cash"
            : "Estimated upfront cash (down payment only)"
        }
        value={formatDollars(result.estimatedUpfrontCashCents)}
      />
    </dl>
  );
}

// Neutral monthly difference in the result view's vocabulary, composed
// from the exported delta formatters (display only, no calculation).
function monthlySentence(deltaMonthly: number): string {
  if (deltaDirection(deltaMonthly) === "same") {
    return "Both properties have the same estimated monthly cost.";
  }
  return `Property B is ${formatDeltaMagnitude(deltaMonthly)} ${deltaDirection(deltaMonthly)} per month than Property A.`;
}

function CompareSummary({ result }: { result: ComparisonResult }) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <dl>
        <SummaryRow
          label="Property A estimated monthly cost"
          value={formatDollars(result.a.totalMonthly)}
        />
        <SummaryRow
          label="Property B estimated monthly cost"
          value={formatDollars(result.b.totalMonthly)}
        />
      </dl>
      <p className="mt-2 text-sm text-slate-700">
        {monthlySentence(result.deltaMonthly)}{" "}
        <ProvenanceBadge label="calculated" />
      </p>
      {result.assumptionsDiffer && (
        <p className="mt-1 text-sm text-slate-600">
          Evaluated under different assumption sets.
        </p>
      )}
    </div>
  );
}

function WorkflowCard({
  id,
  title,
  description,
  href,
  status,
  children,
}: {
  id: string;
  title: string;
  description: string;
  href: string;
  status: CardStatus;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 id={id} className="text-lg font-bold text-slate-900">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <p className="mt-3 text-sm font-medium text-slate-700">
        {STATUS_TEXT[status]}
      </p>
      {children}
      <p className="mt-4">
        <Link
          href={href}
          className="text-sm font-semibold text-slate-900 underline hover:text-slate-700"
        >
          Go to {title}
        </Link>
      </p>
    </section>
  );
}

export default function DashboardCards() {
  const { state } = useSession();

  let affordabilityStatus: CardStatus = "empty";
  if (state.affordability.result !== null) {
    affordabilityStatus = "completed";
  } else if (!isAffordabilityDraftEmpty(state.affordability.draft)) {
    affordabilityStatus = "in-progress";
  }

  let propertyStatus: CardStatus = "empty";
  if (state.property.result !== null) {
    propertyStatus = "completed";
  } else if (!isTrueCostDraftEmpty(state.property.draft)) {
    propertyStatus = "in-progress";
  }

  const compareDraftEmpty =
    isTrueCostDraftEmpty(state.compare.draftA) &&
    isTrueCostDraftEmpty(state.compare.draftB);
  let compareStatus: CardStatus = "empty";
  if (state.compare.result !== null) {
    compareStatus = "completed";
  } else if (!compareDraftEmpty) {
    compareStatus = "in-progress";
  }

  const [affordability, property, compare] = WORKFLOWS;

  return (
    <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <WorkflowCard
        id={affordability.id}
        title={affordability.title}
        description={affordability.description}
        href={affordability.href}
        status={affordabilityStatus}
      >
        {state.affordability.result !== null && (
          <AffordabilitySummary result={state.affordability.result.result} />
        )}
      </WorkflowCard>
      <WorkflowCard
        id={property.id}
        title={property.title}
        description={property.description}
        href={property.href}
        status={propertyStatus}
      >
        {state.property.result !== null && (
          <PropertySummary result={state.property.result.result} />
        )}
      </WorkflowCard>
      <WorkflowCard
        id={compare.id}
        title={compare.title}
        description={compare.description}
        href={compare.href}
        status={compareStatus}
      >
        {state.compare.result !== null && (
          <CompareSummary result={state.compare.result.result} />
        )}
      </WorkflowCard>
    </div>
  );
}
