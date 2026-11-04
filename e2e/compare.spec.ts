import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Comparison journeys (Phase 6, step 4, Checkpoint D). Expected figures
// come only from engine-locked vectors in
// tests/calc/compare-whatif.test.ts, never hand computation.

interface SideInputs {
  price: string;
  down: string;
  rate: string;
  tax: string;
  insurance: string;
  hoa: string;
  maintenance: string;
  lines: { label: string; monthly: string }[];
}

const SIDE_A: SideInputs = {
  price: "300000",
  down: "60000",
  rate: "0",
  tax: "1200",
  insurance: "0",
  hoa: "0",
  maintenance: "0",
  lines: [
    { label: "Lawn", monthly: "50" },
    { label: "lawn ", monthly: "30" },
  ],
};

const SIDE_B: SideInputs = {
  price: "300000",
  down: "30000",
  rate: "0",
  tax: "2400",
  insurance: "0",
  hoa: "50",
  maintenance: "0",
  lines: [
    { label: "LAWN", monthly: "90" },
    { label: "Gym", monthly: "70" },
  ],
};

const COMPARE_HEADING = "Property comparison";
const SUBMIT_NAME = "Compare properties";

function sideSection(page: Page, side: "A" | "B"): Locator {
  return page.getByRole("region", { name: `Property ${side}` });
}

// The primary comparison result. Financial Insights is a sibling region
// that re-presents some amounts and sentences, so main-result assertions
// scope here to stay unambiguous.
function resultsRegion(page: Page): Locator {
  return page.getByRole("region", { name: COMPARE_HEADING, exact: true });
}

async function ensureSideActive(
  page: Page,
  side: "A" | "B",
): Promise<void> {
  // Desktop no-op: both sides are always visible there. On narrow screens
  // the inactive side hides behind its switcher bar.
  const price = sideSection(page, side).getByLabel("Purchase price");
  await price.waitFor({ state: "attached" });
  if (await price.isHidden()) {
    await page
      .getByRole("button", {
        name:
          side === "A" ? "Back to Property A" : "Continue to Property B",
      })
      .click();
  }
}

async function fillSide(
  page: Page,
  side: "A" | "B",
  inputs: SideInputs,
): Promise<void> {
  await ensureSideActive(page, side);
  const section = sideSection(page, side);
  await section.getByLabel("Purchase price").fill(inputs.price);
  await section.getByLabel("Down payment").fill(inputs.down);
  await section.getByLabel("Annual interest rate").fill(inputs.rate);
  await section.getByLabel("Annual property taxes").fill(inputs.tax);
  await section.getByLabel("Annual homeowners insurance").fill(inputs.insurance);
  await section.getByLabel("Monthly HOA fees").fill(inputs.hoa);
  await section
    .getByLabel("Annual maintenance reserve rate")
    .fill(inputs.maintenance);
  for (let i = 0; i < inputs.lines.length; i += 1) {
    await section.getByRole("button", { name: "Add another cost" }).click();
  }
  for (const [index, line] of inputs.lines.entries()) {
    await section.getByLabel("Label").nth(index).fill(line.label);
    await section.getByLabel("Monthly amount").nth(index).fill(line.monthly);
  }
}

async function submitPinnedComparison(page: Page): Promise<void> {
  await page.goto("/compare");
  await ensureSideActive(page, "A");
  await page.locator("#compare-a-annualTax-estimate").check();
  await ensureSideActive(page, "B");
  await page.locator("#compare-b-hoaMonthly-estimate").check();
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", SIDE_B);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

function requireBox<T>(box: T | null): T {
  if (box === null) {
    throw new Error("Expected element to have a bounding box");
  }
  return box;
}

test("homepage shows the compare section with both property forms", async ({
  page,
}) => {
  await page.goto("/compare");
  await expect(
    page.getByRole("heading", { name: "Compare properties" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Property A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Property B" }),
  ).toBeVisible();
  // Desktop: the two forms sit side by side.
  const boxA = requireBox(await sideSection(page, "A").boundingBox());
  const boxB = requireBox(await sideSection(page, "B").boundingBox());
  expect(boxB.x).toBeGreaterThan(boxA.x + boxA.width);
  expect(boxB.y).toBeLessThan(boxA.y + boxA.height);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("pinned comparison shows engine figures, lines, and notes", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  // Pinned totals and headline sentences.
  await expect(page.getByText("$846.67").first()).toBeVisible();
  await expect(page.getByText("$1,160.00").first()).toBeVisible();
  await expect(
    page.getByText("Property B costs $313.33 more per month than Property A."),
  ).toBeVisible();
  await expect(
    page.getByText("Property B costs $3,759.96 more per year than Property A."),
  ).toBeVisible();
  await expect(
    page.getByText("Property A requires $30,000.00 more upfront cash than Property B."),
  ).toBeVisible();
  // Pinned fixed deltas (dashboard category rows).
  await expect(page.getByText("$83.33").first()).toBeVisible();
  await expect(page.getByText("$100.00").first()).toBeVisible();
  await expect(page.getByText("$50.00").first()).toBeVisible();
  // Signed/table-only figures live in the detailed breakdown.
  await page.getByText("View detailed breakdown").click();
  await expect(page.getByText("-$30,000.00")).toBeVisible();
  // Matched line shows both original labels; only-in-B shows a dash for A.
  await expect(page.getByText("A: Lawn · B: LAWN")).toBeVisible();
  await expect(page.getByText("$80.00").first()).toBeVisible();
  await expect(page.getByText("$90.00").first()).toBeVisible();
  await expect(page.getByText("Only in Property B")).toBeVisible();
  // Scoped to the only-in-B table: the collapsed input forms contain hidden
  // "Remove Gym" buttons that a page-level locator would match first.
  const onlyInB = page.getByRole("table", {
    name: "Other costs present only for Property B",
  });
  await expect(onlyInB.getByText("Gym", { exact: true })).toBeVisible();
  // Gym is the only only-in-B entry, so its row alone dashes the absent A
  // side. Scoped because collapsed input legends and helper text also
  // contain em dashes. ("Alarm" belongs to the true-cost suite, not this
  // fixture: B's LAWN line matches A's aggregated lawn lines.)
  const gymRow = onlyInB.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Gym",
      exact: true,
    }),
  });
  await expect(gymRow).toHaveCount(1);
  await expect(
    gymRow.getByRole("cell", {
      name: "—",
      exact: true,
    }),
  ).toBeVisible();
  // Provenance-difference notes for the toggled fields.
  await expect(
    page.getByText(
      "Property A marked property taxes as an estimate; Property B marked property taxes as an exact figure.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Property A marked HOA fees as an exact figure; Property B marked HOA fees as an estimate.",
    ),
  ).toBeVisible();
  // Per-side warnings and provenance vocabulary.
  await expect(page.getByText("Property A notes")).toBeVisible();
  await expect(page.getByText("Property B notes")).toBeVisible();
  await expect(
    page.getByText("Calculated", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Estimate", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Not entered").first()).toBeVisible();
  await expect(
    page.getByText("This comparison does not rank the properties"),
  ).toBeVisible();
});

test("sides validate independently and keep their values", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", { ...SIDE_B, price: "abc" });
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  const sectionB = sideSection(page, "B");
  await expect(
    sectionB.getByText("Enter a valid dollar amount, e.g. 8,500.50."),
  ).toBeVisible();
  // Side A's values are preserved; nothing submitted.
  await expect(sideSection(page, "A").getByLabel("Purchase price")).toHaveValue(
    SIDE_A.price,
  );
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
  // Correcting side B clears its error and the comparison succeeds.
  await sectionB.getByLabel("Purchase price").fill(SIDE_B.price);
  await expect(
    sectionB.getByText("Enter a valid dollar amount, e.g. 8,500.50."),
  ).toBeHidden();
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
});

test("editing either side retires stale results", async ({ page }) => {
  await submitPinnedComparison(page);
  await page.getByRole("button", { name: "Edit Property B" }).click();
  await sideSection(page, "B")
    .getByLabel("Purchase price")
    .fill("301000");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
  // Reverse direction: the untouched side renders expanded, not stranded.
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toBeVisible();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("300000");
  await expect(
    sideSection(page, "A").getByLabel("Down payment"),
  ).toHaveValue("60000");
});

test("explicit zero optionals are preserved, blanks omitted", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", SIDE_B);
  await sideSection(page, "A").getByLabel("Monthly PMI").fill("0");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  await page.getByText("View detailed breakdown").click();
  // Side A PMI entered as zero renders $0.00; side B PMI stays omitted.
  // Scoped per row: a page-wide "Not entered" count also catches the
  // difference-column subtext ("Based on … Property B Not entered").
  const figures = page.getByRole("table", { name: "Input figures" });
  const breakdown = page.getByRole("table", {
    name: "Monthly cost components",
  });
  for (const table of [figures, breakdown]) {
    const pmiRow = table.getByRole("row", { name: /PMI/ });
    await expect(pmiRow.getByRole("cell").nth(0)).toContainText("$0.00");
    await expect(pmiRow.getByRole("cell").nth(1)).toContainText("Not entered");
  }
  const closingRow = figures.getByRole("row", { name: /Closing costs/ });
  await expect(closingRow.getByRole("cell").nth(0)).toContainText(
    "Not entered",
  );
  await expect(closingRow.getByRole("cell").nth(1)).toContainText(
    "Not entered",
  );
});

test("loading state disables both forms and submits once", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/compare", async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", SIDE_B);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  const submit = page.getByRole("button", { name: "Comparing…" });
  await expect(submit).toBeDisabled();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toBeDisabled();
  await expect(
    sideSection(page, "B").getByLabel("Purchase price"),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("network failure shows a safe error without results", async ({
  page,
}) => {
  await page.route("**/api/compare", (route) => route.abort());
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", SIDE_B);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByText(
      "Could not reach the server. Check your connection and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
});

test("API rejects invalid comparisons with safe errors", async ({
  request,
}) => {
  const sentinel = 9_876_543_210_987;
  const response = await request.post("/api/compare", {
    data: {
      a: {
        data: {
          homePriceCents: 30_000_000,
          downPaymentCents: 6_000_000,
          annualRateMilliPct: 0,
          termMonths: 360,
          annualTaxCents: 120_000,
          annualInsuranceCents: 0,
          hoaMonthlyCents: 0,
          maintenanceRateBps: 0,
          otherCosts: [],
        },
      },
      b: {
        data: {
          homePriceCents: sentinel,
          downPaymentCents: 3_000_000,
          annualRateMilliPct: 0,
          termMonths: 360,
          annualTaxCents: 240_000,
          annualInsuranceCents: 0,
          hoaMonthlyCents: 5_000,
          maintenanceRateBps: 0,
          otherCosts: [],
        },
      },
    },
  });
  expect(response.status()).toBe(400);
  const body = (await response.json()) as {
    error: { code: string };
  };
  expect(body.error.code).toBe("validation_error");
  expect(JSON.stringify(body)).not.toContain(String(sentinel));
});

test("summary tiles show per-side totals with upfront qualifications", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await expect(page.getByText("$10,160.04 per year").first()).toBeVisible();
  await expect(page.getByText("$13,920.00 per year").first()).toBeVisible();
  await expect(page.getByText("$60,000.00").first()).toBeVisible();
  await expect(page.getByText("$30,000.00").first()).toBeVisible();
  await expect(
    page.getByText("Down payment only — no closing costs entered"),
  ).toHaveCount(2);
});

test("monthly comparison bars label both verified totals", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await expect(
    page.getByRole("heading", { name: "Monthly cost comparison" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Property A $846.67 per month" }),
  ).toBeVisible();
});

test("category rows show engine deltas with neutral direction", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await expect(
    page.getByRole("heading", { name: "Cost categories" }),
  ).toBeVisible();
  await expect(page.getByText("Principal and interest").first()).toBeVisible();
  await expect(page.getByText("$83.33 · Property B costs more").first()).toBeVisible();
  await expect(page.getByText("$100.00 · Property B costs more").first()).toBeVisible();
  await expect(page.getByText("$50.00 · Property B costs more").first()).toBeVisible();
  await expect(page.getByText("Same cost", { exact: true })).toHaveCount(3);
});

test("equal properties report identical costs neutrally", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", SIDE_A);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  const results = resultsRegion(page);
  await expect(
    results.getByText("Both properties have the same estimated monthly cost."),
  ).toBeVisible();
  await expect(
    results.getByText("Both properties have the same estimated annual cost."),
  ).toBeVisible();
  await expect(
    results.getByText(
      "Both properties require the same estimated upfront cash.",
    ),
  ).toBeVisible();
  await expect(
    results.getByRole("img", {
      name: "Property A $846.67 per month, Property B $846.67 per month",
    }),
  ).toBeVisible();
});

test("swapped sides mirror direction wording without negatives", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_B);
  await fillSide(page, "B", SIDE_A);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  // Same magnitudes as the pinned fixture, opposite directions: A now
  // costs more monthly and annually, B requires more upfront cash.
  await expect(
    page.getByText("Property A costs $313.33 more per month than Property B."),
  ).toBeVisible();
  await expect(
    page.getByText("Property A costs $3,759.96 more per year than Property B."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Property B requires $30,000.00 more upfront cash than Property A.",
    ),
  ).toBeVisible();
  // Scoped to the category rows: Financial Insights re-presents the top
  // movers with the same sentence further down the page.
  await expect(
    page
      .getByRole("region", { name: "Cost categories" })
      .getByText("$83.33 · Property A costs more"),
  ).toBeVisible();
  // Headline sentences and category rows never show a signed magnitude
  // (signed B-minus-A values live only in the labeled detailed tables).
  for (const name of ["Cost differences", "Cost categories"] as const) {
    await expect(
      page
        .getByRole("region", { name })
        .getByText("-$", { exact: false }),
    ).toHaveCount(0);
  }
  expect(await horizontalOverflow(page)).toBe(0);
});

test("zero monthly totals show an honest empty comparison", async ({
  page,
}) => {
  await page.goto("/compare");
  for (const side of ["A", "B"] as const) {
    const section = sideSection(page, side);
    await section.getByLabel("Purchase price").fill("100000");
    await section.getByLabel("Down payment").fill("100000");
    await section.getByLabel("Annual interest rate").fill("0");
    await section.getByLabel("Annual property taxes").fill("0");
    await section.getByLabel("Annual homeowners insurance").fill("0");
    await section.getByLabel("Monthly HOA fees").fill("0");
    await section.getByLabel("Annual maintenance reserve rate").fill("0");
  }
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  const results = resultsRegion(page);
  await expect(results.getByText("No monthly costs to compare.")).toBeVisible();
  await expect(
    results.getByText("Both properties have the same estimated monthly cost."),
  ).toBeVisible();
  await expect(page.getByText("$100,000.00").first()).toBeVisible();
});

test("detailed breakdown starts collapsed and toggles tables", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  const toggle = page.getByText("View detailed breakdown");
  await expect(toggle).toBeVisible();
  const figuresHeading = page.getByRole("heading", { name: "Figures compared" });
  await expect(figuresHeading).toBeHidden();
  // Dashboard summaries, notes, and warnings stay visible while collapsed.
  await expect(page.getByText("$846.67").first()).toBeVisible();
  await expect(
    page.getByText("Property B costs $313.33 more per month than Property A."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Property A marked property taxes as an estimate; Property B marked property taxes as an exact figure.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Property A notes")).toBeVisible();
  await expect(page.getByText("Property B notes")).toBeVisible();
  await toggle.click();
  await expect(figuresHeading).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Monthly breakdown" }),
  ).toBeVisible();
  await expect(page.getByText("A: Lawn · B: LAWN")).toBeVisible();
  await toggle.click();
  await expect(figuresHeading).toBeHidden();
});

test("desktop shows both property forms simultaneously", async ({
  page,
}) => {
  await page.goto("/compare");
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toBeVisible();
  await expect(
    sideSection(page, "B").getByLabel("Purchase price"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to Property B" }),
  ).toBeHidden();
});

test("successful comparison collapses both forms into summaries", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  for (const side of ["A", "B"] as const) {
    await expect(
      sideSection(page, side).getByLabel("Purchase price"),
    ).toBeHidden();
  }
  await expect(
    sideSection(page, "A").getByText(
      "Purchase price: $300,000.00 · Down payment: $60,000.00",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    sideSection(page, "B").getByText(
      "Purchase price: $300,000.00 · Down payment: $30,000.00",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Property A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Property B" }),
  ).toBeVisible();
});

test("compact summaries match verified inputs, including zero down", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillSide(page, "A", SIDE_A);
  await fillSide(page, "B", { ...SIDE_B, down: "0" });
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  // Summaries echo the submitted figures through the shared formatter —
  // never raw digits — and zero stays an explicit $0.00.
  await expect(
    sideSection(page, "A").getByText(
      "Purchase price: $300,000.00 · Down payment: $60,000.00",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    sideSection(page, "B").getByText(
      "Purchase price: $300,000.00 · Down payment: $0.00",
      { exact: true },
    ),
  ).toBeVisible();
});

test("edit controls reopen one side with values retained", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await page.getByRole("button", { name: "Edit Property A" }).click();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("300000");
  await expect(
    sideSection(page, "A").getByLabel("Down payment"),
  ).toHaveValue("60000");
  // The other side stays collapsed...
  await expect(
    sideSection(page, "B").getByLabel("Purchase price"),
  ).toBeHidden();
  // ...and merely opening never retires the results.
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Collapse Property A inputs" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Collapse Property A inputs" }).click();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
});

test("validation failure expands the affected side", async ({ page }) => {
  await submitPinnedComparison(page);
  await page.getByRole("button", { name: "Edit Property A" }).click();
  await sideSection(page, "A").getByLabel("Purchase price").fill("");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toBeVisible();
  await expect(
    sideSection(page, "A").getByText("Enter an amount."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
});

test("focus moves to results after successful submission", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeFocused();
});

test("editing property A keeps property B accessible", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await page.getByRole("button", { name: "Edit Property A" }).click();
  await sideSection(page, "A")
    .getByLabel("Purchase price")
    .fill("301000");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
  // Retiring the result re-expands the untouched side; it stays editable.
  await expect(
    sideSection(page, "B").getByLabel("Purchase price"),
  ).toBeVisible();
  await sideSection(page, "B").getByLabel("Purchase price").fill("302000");
  await expect(
    sideSection(page, "B").getByLabel("Purchase price"),
  ).toHaveValue("302000");
});

test("returning to completed results does not steal focus", async ({
  page,
}) => {
  await submitPinnedComparison(page);
  await page.getByRole("link", { name: "Affordability" }).click();
  await page.getByRole("link", { name: "Compare Properties" }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  // Restoring a completed session must not move focus to the results
  // heading; only an explicit new submission does that. (The exact resting
  // focus target after client navigation is browser-defined, so assert the
  // requirement directly rather than pinning it to <body>.)
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).not.toBeFocused();
  // Compact summaries restore with values intact; inputs stay reachable.
  await expect(
    page.getByRole("button", { name: "Edit Property A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Property B" }),
  ).toBeVisible();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toBeHidden();
  await expect(
    sideSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("300000");
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("compact summaries stay readable with no overflow", async ({
    page,
  }) => {
    await submitPinnedComparison(page);
    await expect(
      sideSection(page, "A").getByText(
        "Purchase price: $300,000.00 · Down payment: $60,000.00",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      sideSection(page, "B").getByText(
        "Purchase price: $300,000.00 · Down payment: $30,000.00",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("shows Property A with Property B compact", async ({ page }) => {
    await page.goto("/compare");
    await expect(
      sideSection(page, "A").getByLabel("Purchase price"),
    ).toBeVisible();
    await expect(
      sideSection(page, "B").getByLabel("Purchase price"),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Continue to Property B" }),
    ).toBeVisible();
    const boxA = requireBox(await sideSection(page, "A").boundingBox());
    const boxB = requireBox(await sideSection(page, "B").boundingBox());
    expect(boxB.y).toBeGreaterThan(boxA.y + boxA.height);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("switching sides preserves values, lines, and focus", async ({
    page,
  }) => {
    await page.goto("/compare");
    await sideSection(page, "A").getByLabel("Purchase price").fill("300000");
    await sideSection(page, "A").getByLabel("Down payment").fill("60000");
    await sideSection(page, "A")
      .getByRole("button", { name: "Add another cost" })
      .click();
    await sideSection(page, "A").getByLabel("Label").fill("Alarm");
    await page.getByRole("button", { name: "Continue to Property B" }).click();
    await expect(
      sideSection(page, "B").getByLabel("Purchase price"),
    ).toBeVisible();
    await expect(
      sideSection(page, "A").getByLabel("Purchase price"),
    ).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Property B" }),
    ).toBeFocused();
    await sideSection(page, "B").getByLabel("Purchase price").fill("310000");
    await page.getByRole("button", { name: "Back to Property A" }).click();
    await expect(
      page.getByRole("heading", { name: "Property A" }),
    ).toBeFocused();
    await expect(
      sideSection(page, "A").getByLabel("Purchase price"),
    ).toHaveValue("300000");
    await expect(
      sideSection(page, "A").getByLabel("Down payment"),
    ).toHaveValue("60000");
    await expect(sideSection(page, "A").getByLabel("Label")).toHaveValue(
      "Alarm",
    );
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("validation errors surface on both mobile sides", async ({
    page,
  }) => {
    await page.goto("/compare");
    await page.getByRole("button", { name: SUBMIT_NAME }).click();
    // First side with errors opens; the other carries an error badge.
    await expect(
      sideSection(page, "A").getByLabel("Purchase price"),
    ).toBeVisible();
    await expect(
      sideSection(page, "A").getByText("Enter an amount.").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /issues? to review/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue to Property B" }).click();
    await expect(
      sideSection(page, "B").getByLabel("Purchase price"),
    ).toBeVisible();
    await expect(
      sideSection(page, "B").getByText("Enter an amount.").first(),
    ).toBeVisible();
  });

  test("editing after results keeps the edited mobile side open", async ({
    page,
  }) => {
    await submitPinnedComparison(page);
    await page.getByRole("button", { name: "Edit Property B" }).click();
    await sideSection(page, "B")
      .getByLabel("Purchase price")
      .fill("301000");
    await expect(
      page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
    ).toBeHidden();
    // Retiring the result must not strand or switch the edited side.
    await expect(
      sideSection(page, "B").getByLabel("Purchase price"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to Property A" }),
    ).toBeVisible();
  });

  test("stacks both forms above results with no overflow", async ({
    page,
  }) => {
    await page.goto("/compare");
    const boxA = requireBox(await sideSection(page, "A").boundingBox());
    const boxB = requireBox(await sideSection(page, "B").boundingBox());
    expect(boxB.y).toBeGreaterThan(boxA.y + boxA.height);
    await submitPinnedComparison(page);
    await expect(
      page.getByRole("heading", { name: "Monthly cost comparison" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cost categories" }),
    ).toBeVisible();
    const submitBox = requireBox(
      await page.getByRole("button", { name: SUBMIT_NAME }).boundingBox(),
    );
    const resultsBox = requireBox(
      await page
        .getByRole("heading", { name: COMPARE_HEADING, exact: true })
        .boundingBox(),
    );
    expect(resultsBox.y).toBeGreaterThan(submitBox.y + submitBox.height);
    expect(await horizontalOverflow(page)).toBe(0);
    // Expanding the wide tables must not overflow the page either: they
    // scroll inside their own containers.
    await page.getByText("View detailed breakdown").click();
    await expect(
      page.getByRole("heading", { name: "Figures compared" }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("shows collapsed summaries with results in view after submit", async ({
    page,
  }) => {
    await submitPinnedComparison(page);
    // Both long forms collapse: focus lands on results (tested on desktop),
    // summaries stay readable, and nothing overflows.
    for (const side of ["A", "B"] as const) {
      await expect(
        sideSection(page, side).getByLabel("Purchase price"),
      ).toBeHidden();
    }
    await expect(
      page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit Property A" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit Property B" }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    // Collapsing materially shortens the page: expanding both sides must
    // grow total scrollable height (focus scrolling cannot fake this).
    const collapsedHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.getByRole("button", { name: "Edit Property A" }).click();
    await page.getByRole("button", { name: "Edit Property B" }).click();
    const expandedHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(collapsedHeight).toBeLessThan(expandedHeight);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
