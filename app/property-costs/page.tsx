import type { Metadata } from "next";

import PropertyForm from "../../components/PropertyForm";

export const metadata: Metadata = {
  title: "Property Costs | HomeWise AI",
};

export default function PropertyCostsPage() {
  return (
    <main className="w-full py-10">
      <section aria-labelledby="property-costs-heading">
        <h1
          id="property-costs-heading"
          className="text-3xl font-bold tracking-tight text-t-ink"
        >
          Property costs
        </h1>
        <p className="mt-3 text-lg text-t-body">
          See what one property would cost each month.
        </p>
        <p className="mt-2 text-sm text-t-muted">
          Enter the purchase and ongoing costs. Calculations use the figures
          you enter, and only the optional AI explanation sends them to Meta.
        </p>
        <div className="mt-8">
          <PropertyForm idPrefix="property" />
        </div>
      </section>
    </main>
  );
}
