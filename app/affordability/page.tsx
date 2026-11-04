import type { Metadata } from "next";

import FinanceForm from "../../components/FinanceForm";

export const metadata: Metadata = {
  title: "Affordability | HomeWise AI",
};

export default function AffordabilityPage() {
  return (
    <main className="w-full py-10">
      <section aria-labelledby="affordability-heading">
        <h1
          id="affordability-heading"
          className="text-3xl font-bold tracking-tight text-t-ink"
        >
          Affordability
        </h1>
        <p className="mt-3 text-lg text-t-body">
          Understand whether a monthly housing payment fits your budget.
        </p>
        <p className="mt-2 text-sm text-t-muted">
          Enter your finances below. Calculations use the figures you enter,
          and only the optional AI explanation sends them to Meta.
        </p>
        <div className="mt-8">
          <FinanceForm />
        </div>
      </section>
    </main>
  );
}
