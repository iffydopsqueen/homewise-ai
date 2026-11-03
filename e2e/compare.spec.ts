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
  return page.locator(`section[aria-label="Property ${side}"]`);
}

async function fillSide(
  page: Page,
  side: "A" | "B",
  inputs: SideInputs,
): Promise<void> {
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
  await page.locator("#compare-a-annualTax-estimate").check();
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
    page.getByText("Property B is $313.33 higher per month than Property A."),
  ).toBeVisible();
  await expect(
    page.getByText("Property B is $3,759.96 higher per year than Property A."),
  ).toBeVisible();
  await expect(
    page.getByText("Property B is $30,000.00 lower upfront than Property A."),
  ).toBeVisible();
  // Pinned fixed deltas.
  await expect(page.getByText("$83.33").first()).toBeVisible();
  await expect(page.getByText("$100.00").first()).toBeVisible();
  await expect(page.getByText("$50.00").first()).toBeVisible();
  await expect(page.getByText("-$30,000.00")).toBeVisible();
  // Matched line shows both original labels; only-in-B shows a dash for A.
  await expect(page.getByText("A: Lawn · B: LAWN")).toBeVisible();
  await expect(page.getByText("$80.00").first()).toBeVisible();
  await expect(page.getByText("$90.00").first()).toBeVisible();
  await expect(page.getByText("Only in Property B")).toBeVisible();
  await expect(page.getByText("Gym").first()).toBeVisible();
  await expect(page.getByText("—").first()).toBeVisible();
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
  await sideSection(page, "B")
    .getByLabel("Purchase price")
    .fill("301000");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
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

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacks both forms above results with no overflow", async ({
    page,
  }) => {
    await page.goto("/compare");
    const boxA = requireBox(await sideSection(page, "A").boundingBox());
    const boxB = requireBox(await sideSection(page, "B").boundingBox());
    expect(boxB.y).toBeGreaterThan(boxA.y + boxA.height);
    await submitPinnedComparison(page);
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
  });
});
