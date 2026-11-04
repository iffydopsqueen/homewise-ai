import type { AffordabilityResult } from "../calc/affordability";
import type {
  ComparisonResult,
  FixedComponentKey,
} from "../calc/compare";
import type { TrueCostResult } from "../calc/trueCost";
import { formatDollars } from "../format/money";
import {
  formatCushionMonths,
  formatPercentFromBps,
  formatPercentFromMilliPct,
} from "../format/percent";
import type {
  ResolvedAffordabilityProvenance,
  ResolvedTrueCostProvenance,
} from "../validation/api";

// Server-generated fact ledger for Muse Spark explanations.
//
// Every figure the model may reference is minted here from the
// application's own deterministic recomputation. Facts carry exact integer
// numerics (never floats) plus pre-formatted display strings, so output
// validation compares exactly and the UI renders server values — never
// model-written numbers.

export type FactKind =
  | "user-provided"
  | "estimate"
  | "assumption"
  | "calculated"
  | "info";

export interface Fact {
  id: string;
  label: string;
  // Model-facing label: identical to `label` except for user-controlled
  // line items, which render generically so labels cannot inject
  // instructions or fake facts into the prompt. UI chips use `label`.
  modelLabel: string;
  displayValue: string;
  kind: FactKind;
  // Exact integer numerics for validation matching. `bare` holds canonical
  // decimal strings (no commas, no unnecessary zeros) for unit-less numbers
  // such as counts, years, and major-unit amounts. Directional (difference)
  // facts with a negative value additionally register the absolute
  // magnitude, because the model phrases them as a magnitude plus a
  // direction word ("$200 per month lower"). Direction words were never
  // part of the validator's contract — it grounds magnitudes, not prose
  // direction — so this removes false rejections without weakening any
  // enforced property. Non-directional facts keep signed-only numerics.
  cents: number[];
  milliPct: number[];
  bps: number[];
  monthsX10: number[];
  years: number[];
  bare: string[];
}

const FIXED_LABELS: Record<FixedComponentKey, string> = {
  principalAndInterest: "Principal and interest",
  propertyTax: "Property tax",
  insurance: "Homeowners insurance",
  hoa: "HOA",
  maintenance: "Maintenance reserve",
  pmi: "PMI",
};

function emptyNumerics(): Pick<
  Fact,
  "cents" | "milliPct" | "bps" | "monthsX10" | "years" | "bare"
> {
  return { cents: [], milliPct: [], bps: [], monthsX10: [], years: [], bare: [] };
}

// Exact major-unit decimal strings from integer minor units. No floats:
// division and remainder on safe integers only.
function scaledString(value: number, divisor: 100 | 1000 | 10): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / divisor);
  const remainder = abs % divisor;
  if (remainder === 0) {
    return `${sign}${whole}`;
  }
  const width = divisor === 1000 ? 3 : divisor === 100 ? 2 : 1;
  const fraction = String(remainder).padStart(width, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fraction}`;
}

function dollarsMajor(cents: number): string {
  return scaledString(cents, 100);
}

function percentMajor(bps: number): string {
  return scaledString(bps, 100);
}

function milliPctToPercent(milli: number): string {
  return scaledString(milli, 1000);
}

function monthsMajor(tenths: number): string {
  return scaledString(tenths, 10);
}

function makeLedger(): {
  facts: Fact[];
  add: (fact: Omit<Fact, "id">) => void;
} {
  const facts: Fact[] = [];
  return {
    facts,
    add(fact: Omit<Fact, "id">): void {
      facts.push({ ...fact, id: `f${facts.length + 1}` });
    },
  };
}

function moneyFact(
  label: string,
  centsValue: number,
  kind: FactKind,
  options?: { directional?: boolean },
): Omit<Fact, "id"> {
  // Directional difference facts register the absolute magnitude alongside
  // the signed value so natural phrasing ("$200 per month lower" for a
  // -$200 B-minus-A delta) grounds correctly. Zero and positive values are
  // unaffected: the magnitude equals the value itself.
  const magnitudes =
    options?.directional === true && centsValue < 0
      ? [centsValue, -centsValue]
      : [centsValue];
  return {
    label,
    modelLabel: label,
    displayValue: formatDollars(centsValue),
    kind,
    ...emptyNumerics(),
    cents: magnitudes,
    bare: magnitudes.map(dollarsMajor),
  };
}

function percentFact(
  label: string,
  bpsValue: number,
  kind: FactKind,
): Omit<Fact, "id"> {
  return {
    label,
    modelLabel: label,
    displayValue: formatPercentFromBps(bpsValue),
    kind,
    ...emptyNumerics(),
    milliPct: [bpsValue * 10],
    bps: [bpsValue],
    bare: [percentMajor(bpsValue)],
  };
}

function infoFact(label: string, displayValue: string): Omit<Fact, "id"> {
  return {
    label,
    modelLabel: label,
    displayValue,
    kind: "info",
    ...emptyNumerics(),
  };
}

export function buildAffordabilityFacts(
  result: AffordabilityResult,
  provenance: ResolvedAffordabilityProvenance,
): Fact[] {
  const { facts, add } = makeLedger();
  const inputs = result.inputs;
  add(
    moneyFact(
      "Monthly take-home income",
      inputs.takeHomeMonthlyCents,
      provenance.takeHomeMonthlyCents,
    ),
  );
  add(
    moneyFact(
      "Proposed monthly housing cost",
      inputs.proposedHousingMonthlyCents,
      provenance.proposedHousingMonthlyCents,
    ),
  );
  add(
    moneyFact(
      "Existing monthly debt payments",
      inputs.debtsMonthlyCents,
      provenance.debtsMonthlyCents,
    ),
  );
  add(
    moneyFact(
      "Other monthly living expenses",
      inputs.expensesMonthlyCents,
      provenance.expensesMonthlyCents,
    ),
  );
  add(
    moneyFact(
      "Available savings",
      inputs.savingsCents,
      provenance.savingsCents,
    ),
  );
  add(
    moneyFact(
      "Total monthly obligations",
      result.totalMonthlyObligations,
      "calculated",
    ),
  );
  add(
    percentFact(
      "Housing-cost-to-income ratio",
      result.housingRatioBps,
      "calculated",
    ),
  );
  add(
    percentFact(
      "Total obligations-to-income ratio",
      result.obligationsRatioBps,
      "calculated",
    ),
  );
  add(
    moneyFact(
      "Remaining monthly income",
      result.residualMonthlyCents,
      "calculated",
    ),
  );
  if (result.cushionMonthsX10 === null) {
    add(
      infoFact(
        "Savings cushion",
        "Not applicable — there are no monthly obligations to measure against",
      ),
    );
  } else {
    add({
      label: "Savings cushion",
      modelLabel: "Savings cushion",
      displayValue: formatCushionMonths(result.cushionMonthsX10),
      kind: "calculated",
      ...emptyNumerics(),
      monthsX10: [result.cushionMonthsX10],
      bare: [monthsMajor(result.cushionMonthsX10)],
    });
  }
  return facts;
}

export function buildTrueCostFacts(
  result: TrueCostResult,
  provenance: ResolvedTrueCostProvenance,
  labelPrefix = "",
): Fact[] {
  const { facts, add } = makeLedger();
  const inputs = result.inputs;
  const prefix = (label: string): string => `${labelPrefix}${label}`;
  add(
    moneyFact(
      prefix("Purchase price"),
      inputs.homePriceCents,
      provenance.homePriceCents,
    ),
  );
  add(
    moneyFact(
      prefix("Down payment"),
      inputs.downPaymentCents,
      provenance.downPaymentCents,
    ),
  );
  add({
    label: prefix("Annual interest rate"),
    modelLabel: prefix("Annual interest rate"),
    displayValue: formatPercentFromMilliPct(inputs.annualRateMilliPct),
    kind: provenance.annualRateMilliPct,
    ...emptyNumerics(),
    milliPct: [inputs.annualRateMilliPct],
    bare: [milliPctToPercent(inputs.annualRateMilliPct)],
  });
  const termMonths = inputs.termMonths;
  const termYears = termMonths % 12 === 0 ? termMonths / 12 : null;
  add({
    label: prefix("Loan term"),
    modelLabel: prefix("Loan term"),
    displayValue:
      termYears === null
        ? `${termMonths} months`
        : `${termYears} years (${termMonths} months)`,
    kind: provenance.termMonths,
    ...emptyNumerics(),
    years: termYears === null ? [] : [termYears],
    bare:
      termYears === null
        ? [String(termMonths)]
        : [String(termYears), String(termMonths)],
  });
  add(
    moneyFact(
      prefix("Annual property taxes"),
      inputs.annualTaxCents,
      provenance.annualTaxCents,
    ),
  );
  add(
    moneyFact(
      prefix("Annual homeowners insurance"),
      inputs.annualInsuranceCents,
      provenance.annualInsuranceCents,
    ),
  );
  add(
    moneyFact(
      prefix("Monthly HOA fees"),
      inputs.hoaMonthlyCents,
      provenance.hoaMonthlyCents,
    ),
  );
  add(
    percentFact(
      prefix("Annual maintenance reserve rate"),
      inputs.maintenanceRateBps,
      provenance.maintenanceRateBps,
    ),
  );
  if (inputs.pmiMonthlyCents === undefined) {
    add(infoFact(prefix("Monthly PMI"), "Not provided"));
  } else {
    add(
      moneyFact(
        prefix("Monthly PMI"),
        inputs.pmiMonthlyCents,
        provenance.pmiMonthlyCents,
      ),
    );
  }
  if (inputs.closingCostsCents === undefined) {
    add(
      infoFact(
        prefix("Closing costs"),
        "Not provided — the upfront figure covers the down payment only",
      ),
    );
  } else {
    const closingKind = provenance.closingCostsCents ?? "estimate";
    add(
      moneyFact(prefix("Closing costs (one-time)"), inputs.closingCostsCents, closingKind),
    );
  }
  let lineNo = 0;
  for (const line of result.otherLines) {
    lineNo += 1;
    add({
      ...moneyFact(
        prefix(`Other monthly cost — ${line.label}`),
        line.monthly,
        provenance.otherCosts,
      ),
      modelLabel: prefix(`Other monthly cost ${lineNo}`),
    });
  }
  if (result.otherLines.length > 0) {
    const count = result.otherLines.length;
    add({
      label: prefix("Itemized other-cost lines"),
      modelLabel: prefix("Itemized other-cost lines"),
      displayValue: count === 1 ? "1 line" : `${count} lines`,
      kind: "info",
      ...emptyNumerics(),
      bare: [String(count)],
    });
  }
  add(
    moneyFact(
      prefix("Monthly principal and interest"),
      result.monthlyPI,
      "calculated",
    ),
  );
  add(moneyFact(prefix("Monthly property tax"), result.monthlyTax, "calculated"));
  add(
    moneyFact(
      prefix("Monthly homeowners insurance"),
      result.monthlyInsurance,
      "calculated",
    ),
  );
  add(moneyFact(prefix("Monthly HOA"), result.monthlyHoa, "calculated"));
  add(
    moneyFact(
      prefix("Monthly maintenance reserve"),
      result.monthlyMaintenance,
      "calculated",
    ),
  );
  if (result.pmiProvided) {
    add(moneyFact(prefix("Monthly PMI in total"), result.monthlyPMI, "calculated"));
  } else {
    add(infoFact(prefix("Monthly PMI in total"), "Not included — PMI was not provided"));
  }
  add(moneyFact(prefix("Monthly other costs"), result.monthlyOther, "calculated"));
  add(
    moneyFact(
      prefix("Total estimated monthly cost"),
      result.totalMonthly,
      "calculated",
    ),
  );
  add(
    moneyFact(prefix("Total estimated annual cost"), result.totalAnnual, "calculated"),
  );
  add(
    moneyFact(
      result.closingCostsProvided
        ? prefix("Estimated upfront cash (down payment + closing costs)")
        : prefix("Estimated upfront cash (down payment only)"),
      result.estimatedUpfrontCashCents,
      "calculated",
    ),
  );
  return facts;
}

export function buildCompareFacts(
  result: ComparisonResult,
  provenanceA: ResolvedTrueCostProvenance,
  provenanceB: ResolvedTrueCostProvenance,
): Fact[] {
  // Own ID sequence across the whole comparison: side facts first, then
  // differences, so IDs stay short and deterministic.
  const sideA = buildTrueCostFacts(result.a, provenanceA, "Property A — ");
  const sideB = buildTrueCostFacts(result.b, provenanceB, "Property B — ");
  const facts: Fact[] = [...sideA, ...sideB];
  const add = (fact: Omit<Fact, "id">): void => {
    facts.push({ ...fact, id: `f${facts.length + 1}` });
  };
  add({
    label: "Properties compared",
    modelLabel: "Properties compared",
    displayValue: "2 properties",
    kind: "info",
    ...emptyNumerics(),
    bare: ["2"],
  });
  for (const entry of result.fixed) {
    const label = `Monthly difference — ${FIXED_LABELS[entry.key]} (B minus A)`;
    add({
      ...moneyFact(label, entry.delta, "calculated", { directional: true }),
    });
  }
  add(
    moneyFact("Monthly difference — total (B minus A)", result.deltaMonthly, "calculated", {
      directional: true,
    }),
  );
  add(
    moneyFact("Annual difference — total (B minus A)", result.deltaAnnual, "calculated", {
      directional: true,
    }),
  );
  add(
    moneyFact(
      "Upfront difference — total (B minus A)",
      result.deltaUpfront,
      "calculated",
      { directional: true },
    ),
  );
  let comparedNo = 0;
  const addLineFact = (label: string, delta: number): void => {
    comparedNo += 1;
    add({
      ...moneyFact(label, delta, "calculated", { directional: true }),
      modelLabel: `Compared other-cost line ${comparedNo} (B minus A)`,
    });
  };
  for (const line of result.otherLines) {
    if (line.status === "matched") {
      const both =
        line.labelA !== null &&
        line.labelB !== null &&
        line.labelA !== line.labelB
          ? `A: ${line.labelA} · B: ${line.labelB}`
          : (line.labelA ?? line.labelB ?? line.key);
      addLineFact(`Other-cost difference — ${both} (B minus A)`, line.delta);
    } else if (line.status === "added") {
      addLineFact(
        `Only in Property B — ${line.labelB ?? line.key}`,
        line.delta,
      );
    } else {
      addLineFact(
        `Only in Property A — ${line.labelA ?? line.key}`,
        line.delta,
      );
    }
  }
  add(
    infoFact(
      "Assumption sets",
      result.assumptionsDiffer
        ? "The properties use different assumption sets"
        : "Both properties use the same assumption set",
    ),
  );
  // Renumber: side builders each started at f1.
  return facts.map((fact, index) => ({ ...fact, id: `f${index + 1}` }));
}
