import { describe, expect, it } from "vitest";

import type { Fact } from "../../lib/ai/facts";
import {
  extractNumberTokens,
  validateExplanation,
} from "../../lib/ai/validateExplanation";

// Output-validation tests. The ledger below is hand-built so each rejection
// reason is exercised in isolation; ledger construction itself is covered in
// tests/ai/facts.test.ts.

function fact(partial: Partial<Fact> & { id: string }): Fact {
  return {
    label: partial.label ?? partial.id,
    modelLabel: partial.modelLabel ?? partial.label ?? partial.id,
    displayValue: partial.displayValue ?? "",
    kind: partial.kind ?? "calculated",
    cents: partial.cents ?? [],
    milliPct: partial.milliPct ?? [],
    bps: partial.bps ?? [],
    monthsX10: partial.monthsX10 ?? [],
    years: partial.years ?? [],
    bare: partial.bare ?? [],
    id: partial.id,
  };
}

const LEDGER: Fact[] = [
  fact({
    id: "f1",
    label: "Total monthly obligations",
    displayValue: "$5,100.00",
    cents: [510_000],
    bare: ["5100"],
  }),
  fact({
    id: "f2",
    label: "Housing-cost-to-income ratio",
    displayValue: "25%",
    milliPct: [25_000],
    bps: [2_500],
    bare: ["25"],
  }),
  fact({
    id: "f3",
    label: "Savings cushion",
    displayValue: "9.8 months",
    monthsX10: [98],
    bare: ["9.8"],
  }),
  fact({
    id: "f4",
    label: "Properties compared",
    displayValue: "2 properties",
    kind: "info",
    bare: ["2"],
  }),
  fact({
    id: "f5",
    label: "Monthly difference — total (B minus A)",
    displayValue: "-$30,000.00",
    cents: [-3_000_000],
    bare: ["-30000"],
  }),
  fact({
    id: "f6",
    label: "Loan term",
    displayValue: "30 years (360 months)",
    kind: "user-provided",
    years: [30],
    bare: ["30", "360"],
  }),
  fact({
    id: "f7",
    label: "Example amount",
    displayValue: "$2,000.00",
    cents: [200_000],
    bare: ["2000"],
  }),
  fact({
    id: "f8",
    label: "Rate change",
    displayValue: "-2.5%",
    milliPct: [-2_500],
    bare: ["-2.5"],
  }),
  fact({
    id: "f9",
    label: "Alternate ratio",
    displayValue: "32%",
    milliPct: [32_000],
    bps: [3_200],
    bare: ["32"],
  }),
  fact({
    id: "f10",
    label: "Monthly gap",
    displayValue: "$200.00",
    cents: [20_000],
    bare: ["200"],
  }),
  fact({
    id: "f11",
    label: "Small credit",
    displayValue: "$5.00",
    cents: [500],
    bare: ["5"],
  }),
  fact({
    id: "f12",
    label: "Small rate",
    displayValue: "5%",
    milliPct: [5_000],
    bps: [500],
    bare: ["5"],
  }),
  fact({
    id: "f13",
    label: "Small charge",
    displayValue: "-$5.00",
    cents: [-500],
    bare: ["-5"],
  }),
  fact({
    id: "f14",
    label: "Rate decrease",
    displayValue: "-5%",
    milliPct: [-5_000],
    bare: ["-5"],
  }),
  fact({
    id: "f15",
    label: "Monthly reduction",
    displayValue: "-$200.00",
    cents: [-20_000],
    bare: ["-200"],
  }),
  fact({
    id: "f16",
    label: "Six-dollar fee",
    displayValue: "$6.00",
    cents: [600],
    bare: ["6"],
  }),
];

function validOutput() {
  return {
    observations: [
      {
        text: "Obligations total $5,100.00 while housing is 25% of income.",
        factIds: ["f1", "f2"],
      },
    ],
    limitations: {
      text: "The 9.8 months cushion reflects current income.",
      factIds: ["f3"],
    },
  };
}

describe("extractNumberTokens", () => {
  it("classifies money, percent, duration, and bare tokens exactly", () => {
    const tokens = extractNumberTokens(
      "Owes $5,100.00 at 25%, lasting 9.8 months of a 30-year term across 2 homes, delta -$30,000.00.",
    );
    expect(tokens.map((t) => [t.unit, t.raw])).toEqual([
      ["money", "$5,100.00"],
      ["percent", "25%"],
      ["months", "9.8 months"],
      ["years", "30-year"],
      ["bare", "2"],
      ["money", "-$30,000.00"],
    ]);
    expect(tokens[0]?.cents).toBe(510_000);
    expect(tokens[1]?.milli).toBe(25_000);
    expect(tokens[2]?.tenths).toBe(98);
    expect(tokens[2]?.bare).toBe("9.8");
    expect(tokens[3]?.year).toBe(30);
    expect(tokens[4]?.bare).toBe("2");
    expect(tokens[5]?.cents).toBe(-3_000_000);
  });

  it("normalizes bare decimals canonically", () => {
    const tokens = extractNumberTokens("Values 1,200, 9.80, and 007 appear.");
    expect(tokens.map((t) => t.bare)).toEqual(["1200", "9.8", "7"]);
  });

  it("rejects over-precise and oversized tokens as unmatchable", () => {
    const tokens = extractNumberTokens("$1.005 and $99999999999999999999 appear.");
    expect(tokens[0]?.cents).toBeNull();
    expect(tokens[1]?.cents).toBeNull();
  });
});

describe("validateExplanation", () => {
  it("accepts exact restatements and resolves cited facts", () => {
    const result = validateExplanation(validOutput(), LEDGER);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("test setup: expected acceptance");
    }
    expect(result.explanation.observations[0]?.facts.map((f) => f.id)).toEqual([
      "f1",
      "f2",
    ]);
    expect(result.explanation.limitations.facts.map((f) => f.id)).toEqual(["f3"]);
  });

  it("accepts formatting variants of the same exact values", () => {
    const result = validateExplanation(
      {
        observations: [
          {
            text: "Obligations $5,100 with ratio 25 percent and cushion 9.8 months over 30 years for 2 homes.",
            factIds: ["f1", "f2", "f3", "f4", "f6"],
          },
        ],
        limitations: { text: "Delta -$30000.00 noted.", factIds: ["f5"] },
      },
      LEDGER,
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects unknown fact references", () => {
    const output = validOutput();
    output.observations[0] = {
      text: "Obligations total $5,100.00.",
      factIds: ["f1", "f99"],
    };
    expect(validateExplanation(output, LEDGER)).toEqual({
      ok: false,
      reason: "unknown_fact",
    });
  });

  it("rejects malformed shapes", () => {
    const cases: unknown[] = [
      { observations: [], limitations: { text: "x", factIds: ["f1"] } },
      {
        observations: [{ text: "", factIds: ["f1"] }],
        limitations: { text: "x", factIds: ["f1"] },
      },
      {
        observations: [{ text: "x", factIds: [] }],
        limitations: { text: "x", factIds: ["f1"] },
      },
      {
        observations: [{ text: "x", factIds: ["fx"] }],
        limitations: { text: "x", factIds: ["f1"] },
      },
      {
        observations: [{ text: "x", factIds: ["f1"], extra: 1 }],
        limitations: { text: "x", factIds: ["f1"] },
      },
      "not-an-object",
    ];
    for (const input of cases) {
      expect(validateExplanation(input, LEDGER)).toEqual({
        ok: false,
        reason: "invalid_shape",
      });
    }
  });

  it("rejects invented or altered money figures", () => {
    const output = validOutput();
    output.observations[0] = {
      text: "Obligations total $5,101.00 while housing is 25% of income.",
      factIds: ["f1", "f2"],
    };
    expect(validateExplanation(output, LEDGER)).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("rejects uncited numbers even when another fact holds them", () => {
    const output = validOutput();
    output.observations[0] = {
      text: "Obligations total $5,100.00 while housing is 25% of income.",
      factIds: ["f1"],
    };
    expect(validateExplanation(output, LEDGER)).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("rejects bare-count inventions", () => {
    const output = validOutput();
    output.observations[0] = {
      text: "Across 3 homes the pattern holds.",
      factIds: ["f4"],
    };
    expect(validateExplanation(output, LEDGER)).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("rejects mismatches inside limitations too", () => {
    const output = validOutput();
    output.limitations = {
      text: "The 9.9 months cushion reflects current income.",
      factIds: ["f3"],
    };
    expect(validateExplanation(output, LEDGER)).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("rejects verdict and recommendation language", () => {
    const verdicts = [
      "You can afford this home.",
      "You cannot afford these payments.",
      "This home is affordable for you.",
      "The payment looks comfortable each month.",
      "This is a safe purchase.",
      "I recommend Property A.",
      "Property B is the better choice.",
      "You should buy now.",
      "The winner is Property B.",
      "Such a good deal overall.",
    ];
    for (const text of verdicts) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toEqual({ ok: false, reason: "banned_language" });
    }
  });

  it("rejects provenance vocabulary", () => {
    const claims = [
      "This estimated total covers everything.",
      "Under that assumption the math holds.",
      "The calculated result confirms it.",
      "The figure you entered looks right.",
      "A user-provided amount anchors this.",
    ];
    for (const text of claims) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toEqual({ ok: false, reason: "banned_language" });
    }
  });

  it("allows ordinary prose without numbers or verdicts", () => {
    const result = validateExplanation(
      {
        observations: [
          {
            text: "Housing takes the largest share of the monthly budget.",
            factIds: ["f1", "f2"],
          },
        ],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts neutral comparisons and rejects recommendations", () => {
    const neutral = [
      "Property B has a better property tax rate.",
      "Property A has a lower monthly payment.",
      "Property B costs $200 more per month.",
      "Property A has a higher maintenance estimate.",
      "Property A has the best home insurance rate.",
    ];
    for (const text of neutral) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1", "f10"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toMatchObject({ ok: true });
    }
    const verdicts = [
      "Property B is the superior choice.",
      "Property A is a smarter purchase.",
      "Choose Property B.",
      "Buy Property A.",
      "Pick B.",
      "Go for A.",
      "You ought to buy soon.",
      "Worth buying for the location.",
      "I rank Property B first.",
      "An affordable home awaits.",
      "The payment is very affordable.",
      "This place is unaffordable.",
      "That is a risky investment.",
      "Property A outperforms the other.",
      "Property B beats Property A.",
    ];
    for (const text of verdicts) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toEqual({ ok: false, reason: "banned_language" });
    }
  });

  it("rejects multiplier language but allows double-check diligence", () => {
    for (const text of [
      "Twice the income helps.",
      "Double the payment hurts.",
      "Half the cost remains.",
      "A threefold increase matters.",
    ]) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toEqual({ ok: false, reason: "banned_language" });
    }
    const allowed = validateExplanation(
      {
        observations: [
          { text: "Double-check with a lender.", factIds: ["f1"] },
        ],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
    expect(allowed.ok).toBe(true);
  });
});

describe("number-word quantities", () => {
  function check(
    text: string,
    factIds: string[],
  ): ReturnType<typeof validateExplanation> {
    return validateExplanation(
      {
        observations: [{ text, factIds }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
  }

  it("accepts grounded word quantities across every unit", () => {
    expect(check("Housing is twenty-five percent of income.", ["f2"]).ok).toBe(
      true,
    );
    expect(check("The gap is two hundred dollars.", ["f10"]).ok).toBe(true);
    expect(check("Two thousand dollars remain available.", ["f7"]).ok).toBe(true);
    expect(check("Across two properties the pattern holds.", ["f4"]).ok).toBe(true);
    expect(check("A thirty-year term applies here.", ["f6"]).ok).toBe(true);
  });

  it("accepts hyphenated compounds against matching facts", () => {
    expect(check("The alternate ratio is thirty-two percent.", ["f9"]).ok).toBe(
      true,
    );
  });

  it("rejects invented or mismatched word quantities", () => {
    expect(check("Across five properties the pattern holds.", ["f4"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
    expect(check("Housing is thirty percent of income.", ["f1"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
    expect(check("Three thousand dollars remain available.", ["f7"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("rejects vague quantifiers instead of silently accepting them", () => {
    for (const text of [
      "Several percent goes to housing.",
      "A few dollars remain available.",
      "Many months of runway exist.",
      "A couple of homes were reviewed.",
    ]) {
      expect(check(text, ["f1", "f2", "f3", "f4"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
    }
  });

  it("rejects conjunction constructions rather than validating a fragment", () => {
    expect(
      check("One hundred and five dollars remain available.", ["f7"]),
    ).toEqual({ ok: false, reason: "number_mismatch" });
  });

  it("leaves qualitative prose and lone number-words unchecked", () => {
    expect(
      check("A high percent of income goes to housing.", ["f2"]).ok,
    ).toBe(true);
    expect(check("One of the reasons is the balance.", ["f1"]).ok).toBe(true);
    expect(check("What percent applies to escrow?", ["f2"]).ok).toBe(true);
  });
});

describe("remaining verdict bypasses", () => {
  it("rejects recommendation and verdict variants", () => {
    const verdicts = [
      "Go with Property B.",
      "A poor choice.",
      "A bad deal.",
      "A terrible investment.",
      "An affordable price.",
      "An affordable cost.",
      "An affordable rate.",
      "Avoid Property A.",
      "Avoid Property B.",
      "This property can be afforded.",
      "This property is expensive.",
    ];
    for (const text of verdicts) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toEqual({ ok: false, reason: "banned_language" });
    }
  });

  it("accepts neutral factual comparisons", () => {
    const neutral: [string, string[]][] = [
      ["The monthly payment is lower.", ["f1"]],
      ["Property B has a better property tax rate.", ["f1"]],
      ["Property B costs $200 more per month.", ["f10"]],
      ["The maintenance estimate is higher.", ["f1"]],
      ["The property has a higher price.", ["f1"]],
      ["The numbers are different.", ["f1"]],
    ];
    for (const [text, factIds] of neutral) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result.ok).toBe(true);
    }
  });
});

describe("remaining vague quantities", () => {
  it("rejects vague constructions instead of silently accepting them", () => {
    for (const text of [
      "A couple dollars.",
      "A couple of homes.",
      "A pair of homes.",
      "A number of properties.",
      "Dozens of dollars.",
      "Dozens of homes.",
    ]) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1", "f4", "f10"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result).toEqual({ ok: false, reason: "number_mismatch" });
    }
  });

  it("leaves non-quantitative uses of vague words unchecked", () => {
    for (const text of [
      "What is the reference number for these homes?",
      "The couple owns homes here.",
    ]) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds: ["f1"] }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      expect(result.ok).toBe(true);
    }
  });
});

describe("negative word quantities", () => {
  it("never reads negated words as positive amounts", () => {
    const cases: [string, string[], boolean][] = [
      ["Negative five dollars.", ["f13"], true],
      ["Negative five dollars.", ["f11"], false],
      ["Minus five dollars.", ["f13"], true],
      ["Negative five percent.", ["f14"], true],
      ["Negative five percent.", ["f12"], false],
      ["Negative two properties.", ["f4"], false],
      ["Five dollars.", ["f11"], true],
      ["Five percent.", ["f12"], true],
    ];
    for (const [text, factIds, expected] of cases) {
      const result = validateExplanation(
        {
          observations: [{ text, factIds }],
          limitations: { text: "Nothing further.", factIds: ["f1"] },
        },
        LEDGER,
      );
      if (expected) {
        expect(result.ok).toBe(true);
      } else {
        expect(result).toEqual({ ok: false, reason: "number_mismatch" });
      }
    }
  });
});

describe("conjunction regression", () => {
  it("rejects two hundred and fifty thousand dollars", () => {
    const result = validateExplanation(
      {
        observations: [
          {
            text: "Two hundred and fifty thousand dollars were reviewed.",
            factIds: ["f7"],
          },
        ],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
    expect(result).toEqual({ ok: false, reason: "number_mismatch" });
  });
});

describe("negative percentages", () => {
  it("tokenizes signed percentages exactly", () => {
    const tokens = extractNumberTokens("A change of -25% was recorded.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.unit).toBe("percent");
    expect(tokens[0]?.milli).toBe(-25_000);
  });

  it("matches only explicitly negative facts", () => {
    const accept = validateExplanation(
      {
        observations: [{ text: "Rates fell -2.5%.", factIds: ["f8"] }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
    expect(accept.ok).toBe(true);
    const reject = validateExplanation(
      {
        observations: [{ text: "Rates fell -2.5%.", factIds: ["f2"] }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
    expect(reject).toEqual({ ok: false, reason: "number_mismatch" });
  });
});

describe("negated digit quantities", () => {
  function check(
    text: string,
    factIds: string[],
  ): ReturnType<typeof validateExplanation> {
    return validateExplanation(
      {
        observations: [{ text, factIds }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
  }

  it("signs unambiguous money and percent digits", () => {
    expect(check("Negative $200.", ["f15"]).ok).toBe(true);
    expect(check("Minus $200.", ["f15"]).ok).toBe(true);
    expect(check("Negative 5%.", ["f14"]).ok).toBe(true);
    expect(check("Minus 5%.", ["f14"]).ok).toBe(true);
    expect(check("Negative $200.", ["f10"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
    expect(check("Minus $200.", ["f10"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
    expect(check("Negative 5%.", ["f12"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("rejects negated bare digits even against negative facts", () => {
    for (const text of ["Negative 5 dollars.", "Minus 5 dollars."]) {
      expect(check(text, ["f11"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
      expect(check(text, ["f13"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
    }
    for (const text of ["Negative 5 percent.", "Minus 5 percent."]) {
      expect(check(text, ["f12"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
      expect(check(text, ["f14"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
    }
  });

  it("rejects contradictory double signs", () => {
    expect(check("Negative -$200.", ["f15"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
    expect(check("Negative -$200.", ["f10"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });

  it("preserves positive digits, dash punctuation, and explicit signs", () => {
    expect(check("$5.", ["f11"]).ok).toBe(true);
    expect(check("5 dollars.", ["f11"]).ok).toBe(true);
    expect(check("5 percent.", ["f12"]).ok).toBe(true);
    expect(check("The balance - $5 - is due.", ["f11"]).ok).toBe(true);
    expect(check("B minus A is $200.", ["f10"]).ok).toBe(true);
    expect(check("The charge is -$5.", ["f13"]).ok).toBe(true);
  });
});

describe("predicative comparative verdicts", () => {
  function check(text: string): ReturnType<typeof validateExplanation> {
    return validateExplanation(
      {
        observations: [{ text, factIds: ["f1"] }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
  }

  it("rejects copular comparisons without a judgment noun", () => {
    for (const text of [
      "Property B would be better.",
      "Property B would be preferable.",
      "Property A is worse.",
      "Property B is best.",
      "Property A is the worst.",
      "Property B could be better.",
      "Property A seems worse.",
      "Property B looks best.",
    ]) {
      expect(check(text)).toEqual({ ok: false, reason: "banned_language" });
    }
  });

  it("rejects unattributed verdict nouns and phrases", () => {
    for (const text of [
      "Property B is not affordable.",
      "A poor investment.",
      "An expensive property.",
    ]) {
      expect(check(text)).toEqual({ ok: false, reason: "banned_language" });
    }
  });

  it("preserves neutral component comparisons", () => {
    expect(check("Property B has a poor property tax rate.").ok).toBe(true);
    expect(check("Property B has an affordable property tax rate.").ok).toBe(
      true,
    );
  });

  it("accepts explanatory best/better continuations", () => {
    for (const text of [
      "This is the best estimate.",
      "The result would be better represented as a percentage.",
      "The higher amount is better explained by the tax difference.",
    ]) {
      expect(check(text).ok).toBe(true);
    }
  });

  it("still rejects bare predicative verdicts", () => {
    for (const text of [
      "Property A is better.",
      "Property B would be preferable.",
      "Property A is worse.",
      "Property B seems better.",
      "Property A looks worse.",
    ]) {
      expect(check(text)).toEqual({ ok: false, reason: "banned_language" });
    }
  });
});

describe("plural and modified vague quantities", () => {
  function check(
    text: string,
    factIds: string[],
  ): ReturnType<typeof validateExplanation> {
    return validateExplanation(
      {
        observations: [{ text, factIds }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
  }

  it("rejects plural vague constructions", () => {
    for (const text of ["A pairs of homes.", "A couples of dollars."]) {
      expect(check(text, ["f1", "f4", "f10"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
    }
  });

  it("rejects vague phrases with intervening adjectives", () => {
    for (const text of [
      "A pair of lovely homes.",
      "A couple of lovely homes.",
      "A couple of very old homes.",
    ]) {
      expect(check(text, ["f1", "f4", "f10"])).toEqual({
        ok: false,
        reason: "number_mismatch",
      });
    }
  });

  it("leaves reference phrases unchecked", () => {
    expect(check("The account number of these homes is on file.", ["f1"]).ok)
      .toBe(true);
  });
});

describe("sign isolation across phrases", () => {
  function check(
    text: string,
    factIds: string[],
  ): ReturnType<typeof validateExplanation> {
    return validateExplanation(
      {
        observations: [{ text, factIds }],
        limitations: { text: "Nothing further.", factIds: ["f1"] },
      },
      LEDGER,
    );
  }

  it("attaches each sign to its own phrase", () => {
    // Rejection here proves the negator attached to six: a dropped sign
    // would validate +600 against f16.
    expect(check("Five dollars and negative six dollars.", ["f11", "f16"]))
      .toEqual({ ok: false, reason: "number_mismatch" });
    expect(check("Five dollars and six dollars.", ["f11", "f16"]).ok).toBe(
      true,
    );
  });

  it("handles hyphenated negators and negated durations", () => {
    expect(check("Negative-five dollars.", ["f13"]).ok).toBe(true);
    expect(check("Negative-five dollars.", ["f11"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
    expect(check("Negative nine months.", ["f3"])).toEqual({
      ok: false,
      reason: "number_mismatch",
    });
  });
});
