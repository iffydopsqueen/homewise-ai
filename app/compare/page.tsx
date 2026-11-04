import type { Metadata } from "next";

import CompareForm from "../../components/CompareForm";

export const metadata: Metadata = {
  title: "Compare Properties | HomeWise AI",
};

export default function ComparePage() {
  return (
    <main className="w-full py-10">
      <section aria-labelledby="compare-properties-heading">
        <h1
          id="compare-properties-heading"
          className="text-3xl font-bold tracking-tight text-t-ink"
        >
          Compare properties
        </h1>
        <p className="mt-3 text-lg text-t-body">
          Compare two properties side by side.
        </p>
        <p className="mt-2 text-sm text-t-muted">
          Enter each property below. Calculations use the figures you enter,
          and only the optional AI explanation sends them to Meta.
        </p>
        <div className="mt-8">
          <CompareForm />
        </div>
      </section>
    </main>
  );
}
