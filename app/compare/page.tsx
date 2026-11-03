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
          className="text-3xl font-bold tracking-tight text-slate-900"
        >
          Compare properties
        </h1>
        <p className="mt-3 text-lg text-slate-700">
          Compare two properties side by side.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Enter each property below. Your figures stay in this session and go
          only to this app&apos;s own calculator.
        </p>
        <div className="mt-8">
          <CompareForm />
        </div>
      </section>
    </main>
  );
}
