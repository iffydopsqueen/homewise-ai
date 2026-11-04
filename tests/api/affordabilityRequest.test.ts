import { describe, expect, it } from "vitest";

import { buildAffordabilityRequest } from "../../lib/api/affordabilityRequest";
import type { AffordabilityFieldKey } from "../../lib/session/store";

// Direct builder tests. Expectations mirror the verified FinanceForm
// behavior the builder was extracted from; the builder must match the
// form, not the other way around.

const VALID: Record<AffordabilityFieldKey, string> = {
  takeHomeMonthlyCents: "8000",
  proposedHousingMonthlyCents: "2000",
  debtsMonthlyCents: "600",
  expensesMonthlyCents: "2500",
  savingsCents: "50000",
};

describe("buildAffordabilityRequest", () => {
  it("parses all valid fields with correct mapping", () => {
    expect(buildAffordabilityRequest(VALID)).toEqual({
      ok: true,
      data: {
        takeHomeMonthlyCents: 800_000,
        proposedHousingMonthlyCents: 200_000,
        debtsMonthlyCents: 60_000,
        expensesMonthlyCents: 250_000,
        savingsCents: 5_000_000,
      },
    });
  });

  it("reports blank fields with the existing message", () => {
    const result = buildAffordabilityRequest({ ...VALID, debtsMonthlyCents: "   " });
    expect(result).toEqual({
      ok: false,
      errors: { debtsMonthlyCents: "Enter an amount." },
    });
  });

  it("maps parser failures to the existing messages", () => {
    expect(
      buildAffordabilityRequest({ ...VALID, savingsCents: "not money" }),
    ).toEqual({
      ok: false,
      errors: {
        savingsCents: "Enter a valid dollar amount, e.g. 8,500.50.",
      },
    });
    expect(
      buildAffordabilityRequest({ ...VALID, savingsCents: "10.123" }),
    ).toEqual({
      ok: false,
      errors: { savingsCents: "Use at most 2 decimal places." },
    });
    expect(
      buildAffordabilityRequest({ ...VALID, savingsCents: "20,000,000" }),
    ).toEqual({
      ok: false,
      errors: { savingsCents: "Amount is too large (maximum $10,000,000)." },
    });
  });

  it("rejects zero take-home income at the schema level", () => {
    expect(
      buildAffordabilityRequest({ ...VALID, takeHomeMonthlyCents: "0" }),
    ).toEqual({
      ok: false,
      errors: { takeHomeMonthlyCents: "Enter an income greater than $0." },
    });
  });

  it("collects multiple field errors without a schema check", () => {
    const result = buildAffordabilityRequest({
      ...VALID,
      takeHomeMonthlyCents: "",
      debtsMonthlyCents: "bogus",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        takeHomeMonthlyCents: "Enter an amount.",
        debtsMonthlyCents: "Enter a valid dollar amount, e.g. 8,500.50.",
      },
    });
  });
});
