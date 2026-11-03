import { MAX_CENTS } from "../calc/money";

// Exact decimal input parsing (Phase 6, step 1). Converts user-typed text to
// integer minor units with hand-rolled place-value math: no parseFloat, no
// float multiplication anywhere on this path.
//
// Conventions (US number format; documented because decimal commas would
// misread, e.g. "6,5" must never become 65):
// - Dollars: "$", commas, and surrounding whitespace are formatting-only and
//   stripped; the remainder must match digits with at most 2 decimals.
//   Interior whitespace is rejected: "1 2" must never silently become 12.
// - Percents: an optional trailing "%" is accepted; "$" and commas are
//   rejected outright (never legitimate in a rate, and stripping them could
//   silently change the value).
// - More decimals than allowed are rejected, never truncated: silently
//   dropping fractions would misstate money.
// - Negatives are rejected: every money/rate input in this product is >= 0.
// - Error messages never echo the submitted text.
// - Wrappers mirror the API caps so invalid values fail fast client-side
//   (the server remains the real enforcement).

export function parseDecimalToInt(text: string, places: number): number {
  if (!Number.isInteger(places) || places < 0 || places > 6) {
    throw new RangeError("parseDecimalToInt: places must be an integer 0-6");
  }
  if (typeof text !== "string") {
    throw new RangeError("parseDecimalToInt: expected a string");
  }
  const cleaned = text.trim().replace(/[$,]/g, "");
  if (cleaned === "") {
    throw new RangeError("parseDecimalToInt: empty value");
  }
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(cleaned);
  if (!match) {
    throw new RangeError("parseDecimalToInt: invalid number format");
  }
  const intPart = match[1] ?? "";
  const fracPart = match[2] ?? "";
  if (fracPart.length > places) {
    throw new RangeError("parseDecimalToInt: too many decimal places");
  }
  const value =
    Number(intPart) * 10 ** places + Number(fracPart.padEnd(places, "0"));
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("parseDecimalToInt: value out of range");
  }
  return value;
}

export function parseDollarsToCents(text: string): number {
  const cents = parseDecimalToInt(text, 2);
  if (cents > MAX_CENTS) {
    throw new RangeError("parseDollarsToCents: exceeds maximum supported amount");
  }
  return cents;
}

function parseBoundedPercent(
  text: string,
  places: number,
  max: number,
  fn: string,
): number {
  if (typeof text === "string" && /[$,]/.test(text)) {
    throw new RangeError(`${fn}: "$" and commas are not allowed in percentages`);
  }
  const cleaned =
    typeof text === "string" ? text.trim().replace(/%$/, "").trim() : text;
  const value = parseDecimalToInt(cleaned, places);
  if (value > max) {
    throw new RangeError(`${fn}: exceeds maximum supported rate`);
  }
  return value;
}

export function parsePercentToMilliPct(text: string): number {
  return parseBoundedPercent(text, 3, 100_000, "parsePercentToMilliPct");
}

export function parsePercentToBps(text: string): number {
  return parseBoundedPercent(text, 2, 10_000, "parsePercentToBps");
}
