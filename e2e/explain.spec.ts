import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

// AI explanation journeys (Checkpoint C). The provider is always stubbed
// via page.route: no live Meta calls. Expected explanation content is
// canned UI copy, never engine figures.

const AFFORDABILITY_LABELS = {
  income: "Monthly take-home income",
  proposed: "Proposed monthly housing cost",
  debts: "Existing monthly debt payments",
  expenses: "Other monthly living expenses",
  savings: "Available savings",
} as const;

const VALID_FINANCES: Record<keyof typeof AFFORDABILITY_LABELS, string> = {
  income: "8000",
  proposed: "2000",
  debts: "600",
  expenses: "2500",
  savings: "50000",
};

const EXPLAIN_BUTTON = "Generate insights";
const RETRY_BUTTON = "Try again";
const LOADING_TEXT =
  "Meta AI is preparing your explanation. This may take up to a minute.";
const FAILURE_HEADLINE =
  "We couldn't show an AI explanation. Your calculated results are still available.";
const OBSERVATION_MARKER = "Explanation observation marker.";
const LIMITATIONS_MARKER = "Explanation limitations marker.";
const DISCLOSURE_TEXT =
  "On request, HomeWise sends your inputs and calculated figures to Meta to explain these results.";

function cannedExplainBody() {
  return {
    ok: true,
    data: {
      workflow: "affordability",
      observations: [
        {
          text: OBSERVATION_MARKER,
          facts: [
            {
              id: "f1",
              label: "Total monthly obligations",
              modelLabel: "Total monthly obligations",
              displayValue: "$5,100.00",
              kind: "calculated",
            },
          ],
        },
      ],
      limitations: { text: LIMITATIONS_MARKER, facts: [] },
    },
  };
}

const AI_UNAVAILABLE_BODY = {
  ok: false,
  error: {
    code: "ai_unavailable",
    message:
      "AI explanations are unavailable right now. Your calculations are unaffected.",
  },
};

async function fillFinances(
  page: Page,
  values: Record<keyof typeof AFFORDABILITY_LABELS, string>,
): Promise<void> {
  for (const [key, label] of Object.entries(AFFORDABILITY_LABELS)) {
    await page
      .getByLabel(label)
      .fill(values[key as keyof typeof AFFORDABILITY_LABELS]);
  }
}

async function submitAffordability(page: Page): Promise<void> {
  await page.goto("/affordability");
  await fillFinances(page, VALID_FINANCES);
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
}

async function ensureSectionOpen(
  page: Page,
  title: string,
): Promise<void> {
  const toggle = page.getByRole("button", { name: title });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
}

async function fillPropertyCosts(page: Page): Promise<void> {
  await page.goto("/property-costs");
  const region = page.getByRole("region", { name: "Property costs" });
  await region.getByLabel("Purchase price").fill("360000");
  await region.getByLabel("Down payment").fill("60000");
  await region.getByLabel("Annual interest rate").fill("0");
  await ensureSectionOpen(page, "Ongoing ownership costs");
  await region.getByLabel("Annual property taxes").fill("1200");
  await region.getByLabel("Annual homeowners insurance").fill("0");
  await region.getByLabel("Monthly HOA fees").fill("0");
  await region.getByLabel("Annual maintenance reserve rate").fill("0");
  await page.getByRole("button", { name: "Calculate property costs" }).click();
  await expect(
    page.getByRole("heading", { name: "Your property cost breakdown" }),
  ).toBeVisible();
}

async function submitComparison(page: Page): Promise<void> {
  await page.goto("/compare");
  for (const side of ["A", "B"] as const) {
    const section = page.getByRole("region", { name: `Property ${side}` });
    await section.getByLabel("Purchase price").fill("300000");
    await section.getByLabel("Down payment").fill("60000");
    await section.getByLabel("Annual interest rate").fill("0");
    await section.getByLabel("Annual property taxes").fill("1200");
    await section.getByLabel("Annual homeowners insurance").fill("0");
    await section.getByLabel("Monthly HOA fees").fill("0");
    await section.getByLabel("Annual maintenance reserve rate").fill("0");
  }
  await page.getByRole("button", { name: "Compare properties" }).click();
  await expect(
    page.getByRole("heading", { name: "Property comparison", exact: true }),
  ).toBeVisible();
}

// Client-side navigation via the primary nav. Full page.goto reloads wipe
// the memory-only session; dashboard.spec.ts uses the same pattern.
async function goTo(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

function explainSection(page: Page) {
  return page.getByRole("region", { name: "Financial insights" });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// Installs a counting /api/explain interceptor. Returns the live counter.
async function trackExplain(
  page: Page,
  fulfill: (route: Route, count: number) => Promise<void>,
): Promise<{ count: () => number }> {
  let count = 0;
  await page.route("**/api/explain", async (route) => {
    count += 1;
    await fulfill(route, count);
  });
  return { count: () => count };
}

test("explain is never requested automatically", async ({ page }) => {
  const tracker = await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitAffordability(page);
  expect(tracker.count()).toBe(0);
  await expect(
    page.getByRole("button", { name: EXPLAIN_BUTTON }),
  ).toBeVisible();
  await goTo(page, "Dashboard");
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  expect(tracker.count()).toBe(0);
});

test("dashboard rendering requests no explanation", async ({ page }) => {
  const tracker = await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitAffordability(page);
  await goTo(page, "Dashboard");
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: EXPLAIN_BUTTON }),
  ).toHaveCount(0);
  expect(tracker.count()).toBe(0);
});

test("explicit click renders the explanation with fact chips", async ({
  page,
}) => {
  const tracker = await trackExplain(page, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: cannedExplainBody() });
  });
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(page.getByText(LOADING_TEXT)).toBeVisible();
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  await expect(page.getByText(LIMITATIONS_MARKER)).toBeVisible();
  const section = explainSection(page);
  // Citations start collapsed behind their observation's disclosure.
  await expect(section.getByText("Total monthly obligations")).toBeHidden();
  await expect(section.getByText("$5,100.00")).toBeHidden();
  await section.getByText("Supporting figures (1)").click();
  await expect(section.getByText("Total monthly obligations")).toBeVisible();
  await expect(section.getByText("$5,100.00")).toBeVisible();
  await expect(
    section.getByText("Calculated", { exact: true }),
  ).toBeVisible();
  // Deterministic result survives alongside the explanation.
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  expect(tracker.count()).toBe(1);
});

test("supporting figures open by keyboard with provenance intact", async ({
  page,
}) => {
  await trackExplain(page, async (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          workflow: "affordability",
          observations: [
            {
              text: OBSERVATION_MARKER,
              facts: [
                {
                  id: "f1",
                  label: "Monthly take-home income",
                  modelLabel: "Monthly take-home income",
                  displayValue: "$8,000.00",
                  kind: "user-provided",
                },
                {
                  id: "f2",
                  label: "Total monthly obligations",
                  modelLabel: "Total monthly obligations",
                  displayValue: "$5,100.00",
                  kind: "calculated",
                },
              ],
            },
          ],
          limitations: {
            text: LIMITATIONS_MARKER,
            facts: [
              {
                id: "f3",
                label: "Annual property taxes",
                modelLabel: "Annual property taxes",
                displayValue: "$1,200.00",
                kind: "estimate",
              },
            ],
          },
        },
      },
    }),
  );
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const section = explainSection(page);
  await expect(section.getByText(OBSERVATION_MARKER)).toBeVisible();
  // Observation evidence: keyboard-expandable, all citations present.
  const disclosure = section.getByText("Supporting figures (2)");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(section.getByText("Monthly take-home income")).toBeVisible();
  // Exact match: the housing-share sentence above contains the same amount
  // as a substring; only the evidence chip carries exactly this text.
  await expect(section.getByText("$8,000.00", { exact: true })).toBeVisible();
  await expect(
    section.getByText("User-provided", { exact: true }),
  ).toBeVisible();
  await expect(section.getByText("Total monthly obligations")).toBeVisible();
  // Limitations keep their own associated evidence.
  const limits = section.getByText("Supporting figures (1)");
  await expect(section.getByText("Annual property taxes")).toBeHidden();
  await limits.click();
  await expect(section.getByText("Annual property taxes")).toBeVisible();
  await expect(section.getByText("$1,200.00")).toBeVisible();
  await expect(section.getByText("Estimate", { exact: true })).toBeVisible();
  await expect(section.getByText(LIMITATIONS_MARKER)).toBeVisible();
});

test("unavailable explanation offers a working manual retry", async ({
  page,
}) => {
  const tracker = await trackExplain(page, async (route, count) => {
    if (count === 1) {
      await route.fulfill({ status: 503, json: AI_UNAVAILABLE_BODY });
    } else {
      await route.fulfill({ json: cannedExplainBody() });
    }
  });
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(
    page.getByText("AI explanations are unavailable right now."),
  ).toBeVisible();
  // Calculation result is preserved through the failure.
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  await page.getByRole("button", { name: RETRY_BUTTON }).click();
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  expect(tracker.count()).toBe(2);
});

test("network failure offers retry", async ({ page }) => {
  const tracker = await trackExplain(page, async (route, count) => {
    if (count === 1) {
      await route.abort();
    } else {
      await route.fulfill({ json: cannedExplainBody() });
    }
  });
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(page.getByText("Could not reach the server.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: RETRY_BUTTON }),
  ).toBeVisible();
  await page.getByRole("button", { name: RETRY_BUTTON }).click();
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  expect(tracker.count()).toBe(2);
});

for (const [code, status, message] of [
  ["validation_error", 400, "Invalid request."],
  ["internal_error", 500, "Internal error marker."],
  ["unexpected_error", 500, "Unexpected error marker."],
] as const) {
  test(`non-retryable ${code} shows no retry button`, async ({ page }) => {
    await trackExplain(page, async (route) =>
      route.fulfill({
        status,
        json: { ok: false, error: { code, message } },
      }),
    );
    await submitAffordability(page);
    await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
    await expect(page.getByText(message)).toBeVisible();
    await expect(
      page.getByRole("button", { name: RETRY_BUTTON }),
    ).toHaveCount(0);
  });
}

test("rapid double activation sends a single request", async ({ page }) => {
  const tracker = await trackExplain(page, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: cannedExplainBody() });
  });
  await submitAffordability(page);
  // Two synchronous activations before React can re-render: the in-flight
  // guard must collapse them into one request.
  await page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label,
    );
    button?.click();
    button?.click();
  }, EXPLAIN_BUTTON);
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  expect(tracker.count()).toBe(1);
});

test("editing inputs retires the explanation section", async ({ page }) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  await page.getByLabel(AFFORDABILITY_LABELS.income).fill("9000");
  await expect(
    page.getByRole("button", { name: EXPLAIN_BUTTON }),
  ).toHaveCount(0);
  await expect(page.getByText(OBSERVATION_MARKER)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toHaveCount(0);
});

test("true-cost results can be explained", async ({ page }) => {
  const tracker = await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await fillPropertyCosts(page);
  expect(tracker.count()).toBe(0);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  await expect(page.getByText(LIMITATIONS_MARKER)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your property cost breakdown" }),
  ).toBeVisible();
  expect(tracker.count()).toBe(1);
});

test("comparison results can be explained", async ({ page }) => {
  const tracker = await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitComparison(page);
  expect(tracker.count()).toBe(0);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  await expect(page.getByText(LIMITATIONS_MARKER)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Property comparison", exact: true }),
  ).toBeVisible();
  expect(tracker.count()).toBe(1);
});

test("insights carry one heading and a concise disclosure", async ({
  page,
}) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitAffordability(page);
  await expect(
    page.getByRole("heading", { name: "Financial insights", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText("What your numbers mean")).toHaveCount(0);
  await expect(explainSection(page).getByText(DISCLOSURE_TEXT)).toBeVisible();
  await expect(
    page.getByRole("button", { name: EXPLAIN_BUTTON }),
  ).toBeVisible();
});

test("affordability visual shows verified figures, not AI text", async ({
  page,
}) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  // Engine-pinned values ($8,000 income, $5,100 obligations): the canned AI
  // text contains no numbers, so every figure below is verified data.
  await expect(insights.getByText("$2,900.00")).toBeVisible();
  await expect(insights.getByText("25%")).toBeVisible();
  await expect(insights.getByText("9.8 months")).toBeVisible();
  await expect(insights.getByText(OBSERVATION_MARKER)).toBeVisible();
});

test("negative residual renders as a signed takeaway", async ({ page }) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await page.goto("/affordability");
  await fillFinances(page, {
    income: "8000",
    proposed: "9000",
    debts: "600",
    expenses: "2500",
    savings: "50000",
  });
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  // $8,000 − ($9,000 + $600 + $2,500) = −$4,100.00 shortfall.
  await expect(
    explainSection(page).getByText("-$4,100.00"),
  ).toBeVisible();
});

test("property visual shows drivers and upfront cash", async ({ page }) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await fillPropertyCosts(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  // $360k base fixture: $833.33 P&I + $100 tax = $933.33 total.
  await expect(insights.getByText("$933.33")).toBeVisible();
  await expect(insights.getByText("Principal and interest")).toBeVisible();
  await expect(insights.getByText("$833.33")).toBeVisible();
  await expect(insights.getByText("$100.00")).toBeVisible();
  // Zero-valued third driver stays an honest $0.00, never omitted.
  await expect(insights.getByText("$0.00", { exact: true })).toHaveCount(1);
  await expect(insights.getByText("$60,000.00")).toBeVisible();
  await expect(
    insights.getByText("Down payment only — no closing costs entered"),
  ).toBeVisible();
  await expect(
    insights
      .getByRole("img", { name: /Top monthly costs/ })
      .getByText("Calculated", { exact: true }),
  ).toHaveCount(3);
});

test("compare visual handles identical properties without a winner", async ({
  page,
}) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitComparison(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  // Identical $300k/0% sides: $666.67 P&I + $100 tax = $766.67 each.
  await expect(
    insights.getByRole("img", {
      name: "Property A $766.67, Property B $766.67",
    }),
  ).toBeVisible();
  await expect(
    insights.getByText("Monthly difference"),
  ).toBeVisible();
  await expect(
    insights.getByText("Annual difference"),
  ).toBeVisible();
  await expect(
    insights.getByText("Upfront difference"),
  ).toBeVisible();
  // Hero takeaway plus three difference cards, all $0.00.
  await expect(insights.getByText("$0.00", { exact: true })).toHaveCount(4);
  await expect(
    insights.getByText("Both properties have the same estimated monthly cost."),
  ).toBeVisible();
  await expect(
    insights.getByText("Same estimated cost.", { exact: true }),
  ).toHaveCount(3);
  await expect(
    insights.getByText("Every monthly component matches between the properties."),
  ).toBeVisible();
});

test("compare insights name the higher side when A costs more", async ({
  page,
}) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await page.goto("/compare");
  const sideA = page.getByRole("region", { name: "Property A" });
  await sideA.getByLabel("Purchase price").fill("360000");
  await sideA.getByLabel("Down payment").fill("60000");
  await sideA.getByLabel("Annual interest rate").fill("0");
  await sideA.getByLabel("Annual property taxes").fill("1200");
  await sideA.getByLabel("Annual homeowners insurance").fill("0");
  await sideA.getByLabel("Monthly HOA fees").fill("0");
  await sideA.getByLabel("Annual maintenance reserve rate").fill("0");
  const sideB = page.getByRole("region", { name: "Property B" });
  await sideB.getByLabel("Purchase price").fill("300000");
  await sideB.getByLabel("Down payment").fill("60000");
  await sideB.getByLabel("Annual interest rate").fill("0");
  await sideB.getByLabel("Annual property taxes").fill("0");
  await sideB.getByLabel("Annual homeowners insurance").fill("0");
  await sideB.getByLabel("Monthly HOA fees").fill("0");
  await sideB.getByLabel("Annual maintenance reserve rate").fill("0");
  await page.getByRole("button", { name: "Compare properties" }).click();
  await expect(
    page.getByRole("heading", { name: "Property comparison", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  // A $933.33/mo vs B $666.67/mo: B-minus-A is -$266.66, presented as an
  // absolute magnitude naming Property A. Upfront is equal at $60,000.
  await expect(insights.getByText("Monthly cost difference")).toBeVisible();
  await expect(
    insights.getByText("Property A costs more per month."),
  ).toBeVisible();
  // Hero takeaway plus the monthly chip share the $266.66 magnitude.
  await expect(insights.getByText("$266.66", { exact: true })).toHaveCount(2);
  await expect(insights.getByText("$3,199.92")).toBeVisible();
  await expect(
    insights.getByText("Property A costs more.", { exact: true }),
  ).toHaveCount(2);
  await expect(
    insights.getByText("$166.66 · Property A costs more"),
  ).toBeVisible();
  await expect(
    insights.getByText("$100.00 · Property A costs more"),
  ).toBeVisible();
  await expect(insights.getByText("-$", { exact: false })).toHaveCount(0);
});

test("extra observations hide behind an accessible disclosure", async ({
  page,
}) => {
  const observations = [1, 2, 3, 4, 5].map((n) => ({
    text: `Canned observation ${n}.`,
    facts: [],
  }));
  await trackExplain(page, async (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          workflow: "affordability",
          observations,
          limitations: { text: LIMITATIONS_MARKER, facts: [] },
        },
      },
    }),
  );
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  await expect(insights.getByText("Canned observation 1.")).toBeVisible();
  await expect(insights.getByText("Canned observation 3.")).toBeVisible();
  await expect(insights.getByText("Canned observation 4.")).toBeHidden();
  await expect(insights.getByText("Canned observation 5.")).toBeHidden();
  await insights.getByText("Show 2 more observations").click();
  await expect(insights.getByText("Canned observation 4.")).toBeVisible();
  await expect(insights.getByText("Canned observation 5.")).toBeVisible();
  await expect(insights.getByText(LIMITATIONS_MARKER)).toBeVisible();
});

// Four-state coverage (Phase C): deterministic visuals render from the
// verified engine result in every AI state. The ready state per workflow is
// covered by the success tests above ("can be explained" plus the evidence
// tests); the loops below cover idle, loading, and failed in all three.
const INSIGHT_WORKFLOWS = [
  {
    name: "affordability",
    setup: submitAffordability,
    marker: "$2,900.00",
  },
  {
    name: "true-cost",
    setup: fillPropertyCosts,
    marker: "Largest monthly cost drivers",
  },
  {
    name: "compare",
    setup: submitComparison,
    marker: "Side-by-side monthly costs",
  },
] as const;

for (const workflow of INSIGHT_WORKFLOWS) {
  test(`calculated ${workflow.name} visuals render before Generate is clicked`, async ({
    page,
  }) => {
    const tracker = await trackExplain(page, async (route) =>
      route.fulfill({ json: cannedExplainBody() }),
    );
    await workflow.setup(page);
    const insights = explainSection(page);
    await expect(insights.getByText(workflow.marker)).toBeVisible();
    await expect(
      page.getByRole("button", { name: EXPLAIN_BUTTON }),
    ).toBeVisible();
    await expect(page.getByText(OBSERVATION_MARKER)).toHaveCount(0);
    expect(tracker.count()).toBe(0);
  });

  test(`${workflow.name} visuals persist while Meta generates`, async ({
    page,
  }) => {
    await trackExplain(page, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ json: cannedExplainBody() });
    });
    await workflow.setup(page);
    await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
    await expect(page.getByText(LOADING_TEXT)).toBeVisible();
    await expect(
      explainSection(page).getByText(workflow.marker),
    ).toBeVisible();
    await expect(page.getByText(OBSERVATION_MARKER)).toBeVisible();
  });

  test(`${workflow.name} visuals persist after an AI failure`, async ({
    page,
  }) => {
    await trackExplain(page, async (route) =>
      route.fulfill({ status: 503, json: AI_UNAVAILABLE_BODY }),
    );
    await workflow.setup(page);
    await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
    const insights = explainSection(page);
    await expect(insights.getByText(FAILURE_HEADLINE)).toBeVisible();
    await expect(insights.getByText(workflow.marker)).toBeVisible();
    await expect(
      page.getByRole("button", { name: RETRY_BUTTON }),
    ).toBeVisible();
  });
}

test("malformed AI payload keeps visuals with no retry", async ({ page }) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: { ok: true, data: { workflow: "affordability" } } }),
  );
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  await expect(insights.getByText(FAILURE_HEADLINE)).toBeVisible();
  await expect(insights.getByText("$2,900.00")).toBeVisible();
  await expect(
    page.getByRole("button", { name: RETRY_BUTTON }),
  ).toHaveCount(0);
});

test("model attribution is truthful before and after generation", async ({
  page,
}) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ json: cannedExplainBody() }),
  );
  await submitAffordability(page);
  const insights = explainSection(page);
  await expect(
    insights.getByText("Optional explanations powered by Meta Muse Spark 1.3."),
  ).toBeVisible();
  await expect(
    insights.getByText("Explanation by Meta Muse Spark 1.3"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  await expect(
    insights.getByText(
      "Explanation by Meta Muse Spark 1.3, checked against your calculated figures.",
    ),
  ).toBeVisible();
});

test("failed explanations claim no verified Meta result", async ({ page }) => {
  await trackExplain(page, async (route) =>
    route.fulfill({ status: 503, json: AI_UNAVAILABLE_BODY }),
  );
  await submitAffordability(page);
  await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
  const insights = explainSection(page);
  await expect(insights.getByText(FAILURE_HEADLINE)).toBeVisible();
  await expect(insights.getByText("Muse Spark")).toHaveCount(0);
});

test.describe("insights responsive and themed rendering", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile stacks the dashboard with no overflow", async ({ page }) => {
    await trackExplain(page, async (route) =>
      route.fulfill({ json: cannedExplainBody() }),
    );
    await submitAffordability(page);
    await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
    const insights = explainSection(page);
    await expect(insights.getByText("$2,900.00")).toBeVisible();
    await expect(insights.getByText(OBSERVATION_MARKER)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("dashboard renders under the dark theme", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("homewise-theme", "dark");
    });
    await trackExplain(page, async (route) =>
      route.fulfill({ json: cannedExplainBody() }),
    );
    await submitAffordability(page);
    await page.getByRole("button", { name: EXPLAIN_BUTTON }).click();
    const insights = explainSection(page);
    await expect(insights.getByText("$2,900.00")).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
