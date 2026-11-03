// Display formatting for money (Phase 6, step 1). Display only: values must
// already be final engine results. This module performs no financial math.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatDollars(cents: number): string {
  if (!Number.isInteger(cents) || !Number.isFinite(cents)) {
    throw new RangeError("formatDollars: expected integer cents");
  }
  // cents/100 carries at most 2 true decimals; binary error (~1e-13
  // relative) sits ~7 orders of magnitude below the cent-rounding margin.
  return USD.format(cents / 100);
}
