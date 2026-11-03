import { describe, expect, it } from "vitest";

import { assessAffordability } from "../../lib/calc/affordability";
import { compareProperties } from "../../lib/calc/compare";
import { calculateTrueCost } from "../../lib/calc/trueCost";
import { buildCompareRequest } from "../../lib/api/compareRequest";
import { buildTrueCostRequest } from "../../lib/api/trueCostRequest";
import {
  initSessionState,
  isAffordabilityDraftEmpty,
  isTrueCostDraftEmpty,
  sessionReducer,
  type AffordabilityStoredResult,
  type CompareSide,
  type CompareStoredResult,
  type SessionState,
  type TrueCostStoredResult,
  type TrueCostTextField,
} from "../../lib/session/store";
import type {
  ResolvedAffordabilityProvenance,
  ResolvedTrueCostProvenance,
} from "../../lib/validation/api";

// Reducer unit tests (P2 checkpoint 1). The reducer is pure, so every
// behavior below runs with no DOM. Stored responses come from the real
// deterministic engines — no mocks, no hand-computed figures.

const AFFORDABILITY_PROVENANCE: ResolvedAffordabilityProvenance = {
  takeHomeMonthlyCents: "user-provided",
  debtsMonthlyCents: "user-provided",
  expensesMonthlyCents: "user-provided",
  savingsCents: "user-provided",
  proposedHousingMonthlyCents: "user-provided",
};

const TRUE_COST_PROVENANCE: ResolvedTrueCostProvenance = {
  homePriceCents: "user-provided",
  downPaymentCents: "user-provided",
  annualRateMilliPct: "user-provided",
  termMonths: "user-provided",
  annualTaxCents: "user-provided",
  annualInsuranceCents: "user-provided",
  hoaMonthlyCents: "user-provided",
  maintenanceRateBps: "assumption",
  pmiMonthlyCents: "user-provided",
  otherCosts: "user-provided",
};

function affordabilityResponse(): AffordabilityStoredResult {
  return {
    result: assessAffordability({
      takeHomeMonthlyCents: 800_000,
      proposedHousingMonthlyCents: 200_000,
      debtsMonthlyCents: 60_000,
      expensesMonthlyCents: 250_000,
      savingsCents: 5_000_000,
    }),
    provenance: AFFORDABILITY_PROVENANCE,
  };
}

function trueCostResponse(): TrueCostStoredResult {
  return {
    result: calculateTrueCost({
      homePriceCents: 36_000_000,
      downPaymentCents: 6_000_000,
      annualRateMilliPct: 0,
      termMonths: 360,
      annualTaxCents: 120_000,
      annualInsuranceCents: 0,
      hoaMonthlyCents: 0,
      maintenanceRateBps: 0,
      otherCosts: [],
    }),
    provenance: TRUE_COST_PROVENANCE,
  };
}

function compareResponse(): CompareStoredResult {
  const side = {
    homePriceCents: 36_000_000,
    downPaymentCents: 6_000_000,
    annualRateMilliPct: 0,
    termMonths: 360,
    annualTaxCents: 120_000,
    annualInsuranceCents: 0,
    hoaMonthlyCents: 0,
    maintenanceRateBps: 0,
    otherCosts: [],
  };
  return {
    result: compareProperties({ ...side }, { ...side }),
    provenanceA: TRUE_COST_PROVENANCE,
    provenanceB: TRUE_COST_PROVENANCE,
  };
}

function withResults(state: SessionState): SessionState {
  let next = sessionReducer(state, {
    type: "set-affordability-result",
    response: affordabilityResponse(),
  });
  next = sessionReducer(next, {
    type: "set-property-result",
    response: trueCostResponse(),
  });
  return sessionReducer(next, {
    type: "set-compare-result",
    response: compareResponse(),
  });
}

describe("initSessionState", () => {
  it("matches the forms' current defaults with empty results", () => {
    const state = initSessionState();
    expect(state.affordability.draft).toEqual({
      takeHomeMonthlyCents: "",
      proposedHousingMonthlyCents: "",
      debtsMonthlyCents: "",
      expensesMonthlyCents: "",
      savingsCents: "",
    });
    expect(state.affordability.result).toBeNull();
    for (const slice of [
      state.property,
      { draft: state.compare.draftA },
      { draft: state.compare.draftB },
    ]) {
      expect(slice.draft).toEqual({
        homePrice: "",
        downPayment: "",
        annualRate: "",
        termYears: 30,
        annualTax: "",
        annualInsurance: "",
        hoaMonthly: "",
        maintenanceRate: "1",
        pmiMonthly: "",
        closingCosts: "",
        otherCosts: [],
        estimateTax: false,
        estimateInsurance: false,
        estimateHoa: false,
        estimateClosing: true,
      });
    }
    expect(state.property.nextLineKey).toBe(1);
    expect(state.compare.nextLineKeyA).toBe(1);
    expect(state.compare.nextLineKeyB).toBe(1);
    expect(state.property.result).toBeNull();
    expect(state.compare.result).toBeNull();
  });

  it("returns fresh objects on every call", () => {
    const first = initSessionState();
    const second = initSessionState();
    expect(first.property.draft.otherCosts).not.toBe(
      second.property.draft.otherCosts,
    );
    expect(first.property.draft).not.toBe(second.compare.draftA);
  });
});

describe("affordability actions", () => {
  it("patches one field and atomically retires the result", () => {
    const before = withResults(initSessionState());
    const next = sessionReducer(before, {
      type: "edit-affordability",
      field: "debtsMonthlyCents",
      value: "600",
    });
    expect(next.affordability.draft.debtsMonthlyCents).toBe("600");
    expect(next.affordability.draft.takeHomeMonthlyCents).toBe("");
    expect(next.affordability.result).toBeNull();
    // Sibling slices untouched (same references).
    expect(next.property).toBe(before.property);
    expect(next.compare).toBe(before.compare);
  });

  it("stores the affordability response verbatim", () => {
    const response = affordabilityResponse();
    const next = sessionReducer(initSessionState(), {
      type: "set-affordability-result",
      response,
    });
    expect(next.affordability.result).toBe(response);
  });
});

describe("property actions", () => {
  it("patches fields, term, and toggles, retiring the result each time", () => {
    const seeded = withResults(initSessionState());
    const edited = sessionReducer(seeded, {
      type: "edit-property",
      field: "homePrice",
      value: "360000",
    });
    expect(edited.property.draft.homePrice).toBe("360000");
    expect(edited.property.result).toBeNull();

    const termed = sessionReducer(
      { ...seeded, property: { ...seeded.property } },
      { type: "set-property-term", years: 15 },
    );
    expect(termed.property.draft.termYears).toBe(15);
    expect(termed.property.result).toBeNull();

    const toggled = sessionReducer(seeded, {
      type: "set-property-toggle",
      toggle: "tax",
      checked: true,
    });
    expect(toggled.property.draft.estimateTax).toBe(true);
    expect(toggled.property.draft.estimateClosing).toBe(true);
    expect(toggled.property.result).toBeNull();
  });

  it("adds lines with stable prefixed keys and a persisted counter", () => {
    let state = withResults(initSessionState());
    state = sessionReducer(state, { type: "add-property-line" });
    state = sessionReducer(state, { type: "add-property-line" });
    expect(state.property.draft.otherCosts.map((l) => l.key)).toEqual([
      "property-line-1",
      "property-line-2",
    ]);
    expect(state.property.nextLineKey).toBe(3);
    expect(state.property.result).toBeNull();

    state = sessionReducer(state, {
      type: "edit-property-line",
      index: 0,
      label: "Alarm",
      monthly: "30",
    });
    expect(state.property.draft.otherCosts[0]).toEqual({
      key: "property-line-1",
      label: "Alarm",
      monthly: "30",
    });

    // Removing a line never reuses its key.
    state = sessionReducer(state, {
      type: "remove-property-line",
      index: 0,
    });
    state = sessionReducer(state, { type: "add-property-line" });
    expect(state.property.draft.otherCosts.map((l) => l.key)).toEqual([
      "property-line-2",
      "property-line-3",
    ]);
  });

  it("ignores out-of-range line operations without changing state", () => {
    const before = withResults(initSessionState());
    expect(
      sessionReducer(before, {
        type: "edit-property-line",
        index: 4,
        label: "x",
        monthly: "1",
      }),
    ).toBe(before);
    expect(
      sessionReducer(before, { type: "remove-property-line", index: 0 }),
    ).toBe(before);
  });

  it("stores the property response verbatim", () => {
    const response = trueCostResponse();
    const next = sessionReducer(initSessionState(), {
      type: "set-property-result",
      response,
    });
    expect(next.property.result).toBe(response);
  });

  it("passes a store draft straight into the existing builder", () => {
    let state = initSessionState();
    const fills = {
      homePrice: "360000",
      downPayment: "60000",
      annualRate: "0",
      annualTax: "1200",
      annualInsurance: "0",
      hoaMonthly: "0",
      maintenanceRate: "0",
    } as const;
    for (const [field, value] of Object.entries(fills)) {
      state = sessionReducer(state, {
        type: "edit-property",
        field: field as keyof typeof fills,
        value,
      });
    }
    // No casts: the draft satisfies the builder input type directly.
    const built = buildTrueCostRequest(state.property.draft);
    expect(built.ok).toBe(true);
  });
});

describe("compare actions", () => {
  it("edits one side while retiring the shared result", () => {
    const before = withResults(initSessionState());
    const next = sessionReducer(before, {
      type: "edit-compare",
      side: "b",
      field: "downPayment",
      value: "30000",
    });
    expect(next.compare.draftB.downPayment).toBe("30000");
    expect(next.compare.draftA).toBe(before.compare.draftA);
    expect(next.compare.nextLineKeyA).toBe(
      before.compare.nextLineKeyA,
    );
    expect(next.compare.result).toBeNull();
    expect(next.property).toBe(before.property);
    expect(next.affordability).toBe(before.affordability);
  });

  it("keeps independent per-side line counters and prefixes", () => {
    let state = initSessionState();
    state = sessionReducer(state, { type: "add-compare-line", side: "a" });
    state = sessionReducer(state, { type: "add-compare-line", side: "b" });
    state = sessionReducer(state, { type: "add-compare-line", side: "b" });
    expect(state.compare.draftA.otherCosts.map((l) => l.key)).toEqual([
      "compare-a-line-1",
    ]);
    expect(state.compare.draftB.otherCosts.map((l) => l.key)).toEqual([
      "compare-b-line-1",
      "compare-b-line-2",
    ]);
    expect(state.compare.nextLineKeyA).toBe(2);
    expect(state.compare.nextLineKeyB).toBe(3);
  });

  it("retires the shared result on side term, toggle, and line edits", () => {
    const seeded = withResults(initSessionState());
    expect(
      sessionReducer(seeded, {
        type: "set-compare-term",
        side: "a",
        years: 15,
      }).compare.result,
    ).toBeNull();
    expect(
      sessionReducer(seeded, {
        type: "set-compare-toggle",
        side: "b",
        toggle: "hoa",
        checked: true,
      }).compare.result,
    ).toBeNull();
    expect(
      sessionReducer(seeded, { type: "add-compare-line", side: "a" }).compare
        .result,
    ).toBeNull();
  });

  it("stores the compare response verbatim", () => {
    const response = compareResponse();
    const next = sessionReducer(initSessionState(), {
      type: "set-compare-result",
      response,
    });
    expect(next.compare.result).toBe(response);
  });

  it("passes both stored compare drafts straight into the compare builder", () => {
    const sides: CompareSide[] = ["a", "b"];
    const fills: [TrueCostTextField, string][] = [
      ["homePrice", "360000"],
      ["downPayment", "60000"],
      ["annualRate", "0"],
      ["annualTax", "1200"],
      ["annualInsurance", "0"],
      ["hoaMonthly", "0"],
      ["maintenanceRate", "0"],
    ];
    let state = initSessionState();
    for (const side of sides) {
      for (const [field, value] of fills) {
        state = sessionReducer(state, {
          type: "edit-compare",
          side,
          field,
          value,
        });
      }
    }
    // No casts: both drafts satisfy the builder input type directly.
    const built = buildCompareRequest(
      state.compare.draftA,
      state.compare.draftB,
    );
    expect(built.ok).toBe(true);
  });
});

describe("draft emptiness", () => {
  it("treats freshly initialized drafts as empty", () => {
    const state = initSessionState();
    expect(isAffordabilityDraftEmpty(state.affordability.draft)).toBe(true);
    expect(isTrueCostDraftEmpty(state.property.draft)).toBe(true);
    expect(isTrueCostDraftEmpty(state.compare.draftA)).toBe(true);
    expect(isTrueCostDraftEmpty(state.compare.draftB)).toBe(true);
  });

  it("flags any affordability field edit, and only real deviations", () => {
    let state = sessionReducer(initSessionState(), {
      type: "edit-affordability",
      field: "takeHomeMonthlyCents",
      value: "8000",
    });
    expect(isAffordabilityDraftEmpty(state.affordability.draft)).toBe(false);
    // Clearing back to the default restores emptiness.
    state = sessionReducer(state, {
      type: "edit-affordability",
      field: "takeHomeMonthlyCents",
      value: "",
    });
    expect(isAffordabilityDraftEmpty(state.affordability.draft)).toBe(true);
  });

  it("flags property text edits without parsing their contents", () => {
    // Garbage input still differs from the default: the helper never
    // validates or parses, it only compares.
    let state = sessionReducer(initSessionState(), {
      type: "edit-property",
      field: "homePrice",
      value: "abc",
    });
    expect(isTrueCostDraftEmpty(state.property.draft)).toBe(false);
    state = sessionReducer(state, {
      type: "edit-property",
      field: "homePrice",
      value: "",
    });
    expect(isTrueCostDraftEmpty(state.property.draft)).toBe(true);
  });

  it("honors the maintenance default of 1 percent", () => {
    let state = sessionReducer(initSessionState(), {
      type: "edit-property",
      field: "maintenanceRate",
      value: "1.5",
    });
    expect(isTrueCostDraftEmpty(state.property.draft)).toBe(false);
    state = sessionReducer(state, {
      type: "edit-property",
      field: "maintenanceRate",
      value: "1",
    });
    expect(isTrueCostDraftEmpty(state.property.draft)).toBe(true);
  });

  it("flags term, toggle, and line deviations including special defaults", () => {
    const termed = sessionReducer(initSessionState(), {
      type: "set-property-term",
      years: 15,
    });
    expect(isTrueCostDraftEmpty(termed.property.draft)).toBe(false);

    const toggled = sessionReducer(initSessionState(), {
      type: "set-property-toggle",
      toggle: "tax",
      checked: true,
    });
    expect(isTrueCostDraftEmpty(toggled.property.draft)).toBe(false);

    // estimateClosing defaults to true, so unchecking is the deviation.
    const untoggled = sessionReducer(initSessionState(), {
      type: "set-property-toggle",
      toggle: "closing",
      checked: false,
    });
    expect(isTrueCostDraftEmpty(untoggled.property.draft)).toBe(false);

    // A freshly added (still blank) row is already meaningful input.
    let lined = sessionReducer(initSessionState(), {
      type: "add-property-line",
    });
    expect(isTrueCostDraftEmpty(lined.property.draft)).toBe(false);
    // Removing it restores emptiness even though the counter advanced.
    lined = sessionReducer(lined, {
      type: "remove-property-line",
      index: 0,
    });
    expect(isTrueCostDraftEmpty(lined.property.draft)).toBe(true);
    expect(lined.property.nextLineKey).toBe(2);
  });

  it("treats compare as empty only when both sides are empty", () => {
    const fresh = initSessionState();
    expect(isTrueCostDraftEmpty(fresh.compare.draftA)).toBe(true);
    expect(isTrueCostDraftEmpty(fresh.compare.draftB)).toBe(true);

    // One-sided input makes the workflow in progress: the dashboard
    // reuses the individual helpers with a both-empty conjunction.
    const edited = sessionReducer(fresh, {
      type: "edit-compare",
      side: "b",
      field: "downPayment",
      value: "30000",
    });
    expect(isTrueCostDraftEmpty(edited.compare.draftA)).toBe(true);
    expect(isTrueCostDraftEmpty(edited.compare.draftB)).toBe(false);

    const cleared = sessionReducer(edited, {
      type: "clear-workflow",
      workflow: "compare",
    });
    expect(isTrueCostDraftEmpty(cleared.compare.draftA)).toBe(true);
    expect(isTrueCostDraftEmpty(cleared.compare.draftB)).toBe(true);
  });

  it("restores emptiness after clear-workflow resets a dirty draft", () => {
    let state = sessionReducer(initSessionState(), {
      type: "edit-property",
      field: "homePrice",
      value: "360000",
    });
    state = sessionReducer(state, {
      type: "clear-workflow",
      workflow: "property",
    });
    expect(isTrueCostDraftEmpty(state.property.draft)).toBe(true);
  });
});

describe("clear-workflow", () => {
  it("resets only the selected workflow", () => {
    let state = withResults(initSessionState());
    state = sessionReducer(state, {
      type: "edit-property",
      field: "homePrice",
      value: "360000",
    });
    const next = sessionReducer(state, {
      type: "clear-workflow",
      workflow: "property",
    });
    expect(next.property.draft.homePrice).toBe("");
    expect(next.property.result).toBeNull();
    expect(next.property.nextLineKey).toBe(1);
    expect(next.affordability).toBe(state.affordability);
    expect(next.compare).toBe(state.compare);
  });

  it("returns fresh line arrays, never shared references", () => {
    const first = sessionReducer(initSessionState(), {
      type: "clear-workflow",
      workflow: "compare",
    });
    const second = sessionReducer(initSessionState(), {
      type: "clear-workflow",
      workflow: "compare",
    });
    expect(first.compare.draftA.otherCosts).not.toBe(
      second.compare.draftA.otherCosts,
    );
  });
});

describe("unknown actions", () => {
  it("throws fail-closed", () => {
    expect(() =>
      sessionReducer(
        initSessionState(),
        { type: "bogus-action" } as unknown as never,
      ),
    ).toThrow("Unknown session action");
  });
});
