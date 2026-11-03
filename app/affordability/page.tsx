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
          className="text-3xl font-bold tracking-tight text-slate-900"
        >
          Affordability
        </h1>
        <p className="mt-3 text-lg text-slate-700">
          Understand whether a monthly housing payment fits your budget.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Enter your finances below. Your figures stay in this session and go
          only to this app&apos;s own calculator.
        </p>
        <div className="mt-8">
          <FinanceForm />
        </div>
      </section>
    </main>
  );
}
