// Display formatting for percents and durations (Phase 6, step 1).
// Exact string math throughout: no floating point. Display only.

export function formatPercentFromBps(bps: number): string {
  if (!Number.isInteger(bps) || !Number.isFinite(bps)) {
    throw new RangeError("formatPercentFromBps: expected integer basis points");
  }
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return frac === "" ? `${sign}${whole}%` : `${sign}${whole}.${frac}%`;
}

export function formatPercentFromMilliPct(milli: number): string {
  if (!Number.isInteger(milli) || !Number.isFinite(milli) || milli < 0) {
    throw new RangeError(
      "formatPercentFromMilliPct: expected non-negative integer milli-percent",
    );
  }
  const whole = Math.trunc(milli / 1000);
  const frac = String(milli % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return frac === "" ? `${whole}%` : `${whole}.${frac}%`;
}

export function formatCushionMonths(tenths: number): string {
  if (!Number.isInteger(tenths) || !Number.isFinite(tenths) || tenths < 0) {
    throw new RangeError(
      "formatCushionMonths: expected non-negative integer tenths",
    );
  }
  const whole = Math.trunc(tenths / 10);
  const frac = tenths % 10;
  if (frac !== 0) {
    return `${whole}.${frac} months`;
  }
  return whole === 1 ? "1 month" : `${whole} months`;
}
