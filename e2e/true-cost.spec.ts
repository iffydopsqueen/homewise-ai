import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// True-cost journeys (Phase 6, step 3, Checkpoint D). Expected figures come
// only from engine-locked vectors: the BASE fixture pins in
// tests/calc/trueCost.test.ts and the $300k/6%/30yr known answer in
// tests/calc/mortgage.test.ts.

const BASE_INPUTS = {
  price: "360000",
  down: "60000",
  rate: "0",
  tax: "1200",
  insurance: "0",
  hoa: "0",
  maintenance: "0",
} as const;

const FULL_INPUTS = {
  price: "360,000",
  down: "60,000",
  rate: "6",
  tax: "1,200",
  insurance: "1,800",
  hoa: "250",
  maintenance: "1",
  pmi: "120",
  closing: "9,000",
} as const;

const PROPERTY_HEADING = "Your property cost breakdown";
const SUBMIT_NAME = "Calculate property costs";

// The compare section reuses the same field labels, so all single-property
// locators below stay inside this form's accessible region.
function propertyRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Property costs" });
}

async function fillBase(page: Page): Promise<void> {
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill(BASE_INPUTS.price);
  await region.getByLabel("Down payment").fill(BASE_INPUTS.down);
  await region.getByLabel("Annual interest rate").fill(BASE_INPUTS.rate);
  await region.getByLabel("Annual property taxes").fill(BASE_INPUTS.tax);
  await region
    .getByLabel("Annual homeowners insurance")
    .fill(BASE_INPUTS.insurance);
  await region.getByLabel("Monthly HOA fees").fill(BASE_INPUTS.hoa);
  await region
    .getByLabel("Annual maintenance reserve rate")
    .fill(BASE_INPUTS.maintenance);
}

async function submitBase(page: Page): Promise<void> {
  await page.goto("/property-costs");
  await fillBase(page);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
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

test("base journey shows pinned figures, provenance, and warnings", async ({
  page,
}) => {
  await submitBase(page);
  // Engine-pinned BASE figures.
  await expect(page.getByText("$833.33").first()).toBeVisible();
  await expect(page.getByText("$100.00").first()).toBeVisible();
  await expect(page.getByText("$933.33").first()).toBeVisible();
  await expect(page.getByText("$11,199.96 per year")).toBeVisible();
  await expect(page.getByText("$60,000.00").first()).toBeVisible();
  // Omitted optionals render explicitly, never as zero.
  await expect(page.getByText("Not entered")).toHaveCount(3);
  await expect(
    page.getByText("Estimated upfront cash (down payment only)"),
  ).toBeVisible();
  // Engine warnings surface with the approved copy.
  await expect(page.getByText("Please note")).toBeVisible();
  await expect(
    page.getByText(
      "Closing costs weren't entered, so the upfront figure covers the down payment only.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("You entered $0 for HOA fees — confirm that's correct."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "You entered $0 for maintenance reserve — confirm that's correct.",
    ),
  ).toBeVisible();
  // Provenance vocabulary present.
  await expect(page.getByText("Calculated", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("User-provided", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Assumption", { exact: true }).first()).toBeVisible();
  // Desktop layout: results beside the form, page centered, no overflow.
  const submitBox = requireBox(
    await page.getByRole("button", { name: SUBMIT_NAME }).boundingBox(),
  );
  const resultsBox = requireBox(
    await page
      .getByRole("heading", { name: PROPERTY_HEADING })
      .boundingBox(),
  );
  expect(resultsBox.x).toBeGreaterThan(submitBox.x + submitBox.width);
  expect(resultsBox.y).toBeLessThan(submitBox.y + submitBox.height);
  const mainBox = requireBox(await page.locator("main").boundingBox());
  const viewport = requireBox(page.viewportSize());
  const leftGutter = mainBox.x;
  const rightGutter = viewport.width - (mainBox.x + mainBox.width);
  expect(Math.abs(leftGutter - rightGutter)).toBeLessThan(2);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("full journey shows known-answer P&I and toggle provenance", async ({
  page,
}) => {
  await page.goto("/property-costs");
  // Toggle defaults: tax/insurance/HOA off, closing on.
  await expect(page.locator("#property-annualTax-estimate")).not.toBeChecked();
  await expect(
    page.locator("#property-annualInsurance-estimate"),
  ).not.toBeChecked();
  await expect(page.locator("#property-hoaMonthly-estimate")).not.toBeChecked();
  await expect(page.locator("#property-closingCosts-estimate")).toBeChecked();
  const region = propertyRegion(page);
  // Term default 30 with both options visible.
  await expect(
    region.getByRole("radio", { name: "30 years (360 months)" }),
  ).toBeChecked();
  await expect(
    region.getByRole("radio", { name: "15 years (180 months)" }),
  ).toBeVisible();
  // Maintenance defaults to 1% with assumption labeling pre-submit.
  await expect(
    region.getByLabel("Annual maintenance reserve rate"),
  ).toHaveValue("1");
  // Mark tax and HOA as estimates; closing becomes an exact figure.
  await page.locator("#property-annualTax-estimate").check();
  await page.locator("#property-hoaMonthly-estimate").check();
  await page.locator("#property-closingCosts-estimate").uncheck();
  await region.getByLabel("Purchase price").fill(FULL_INPUTS.price);
  await region.getByLabel("Down payment").fill(FULL_INPUTS.down);
  await region.getByLabel("Annual interest rate").fill(FULL_INPUTS.rate);
  await region.getByLabel("Annual property taxes").fill(FULL_INPUTS.tax);
  await region
    .getByLabel("Annual homeowners insurance")
    .fill(FULL_INPUTS.insurance);
  await region.getByLabel("Monthly HOA fees").fill(FULL_INPUTS.hoa);
  await region.getByLabel("Monthly PMI").fill(FULL_INPUTS.pmi);
  await region.getByLabel("Closing costs (one-time)").fill(FULL_INPUTS.closing);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  // $300k principal at 6%/30yr: the locked known answer.
  await expect(page.getByText("$1,798.65").first()).toBeVisible();
  // Engine-pinned companions: 1% of $360k maintenance, $69,000 upfront.
  await expect(page.getByText("$300.00").first()).toBeVisible();
  await expect(page.getByText("$69,000.00").first()).toBeVisible();
  // PMI stays its own line; upfront reflects supplied closing costs.
  await expect(
    page.getByText("Estimated upfront cash (down payment + closing costs)"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Closing costs weren't entered, so the upfront figure covers the down payment only.",
    ),
  ).toBeHidden();
  // Provenance: tax + HOA estimates (figures plus HOA echo), maintenance
  // assumption (form plus echo). Scoped to this section: the compare forms
  // below render their own maintenance assumption badges and captions.
  await expect(page.getByText("Estimate", { exact: true })).toHaveCount(3);
  await expect(region.getByText("Assumption", { exact: true })).toHaveCount(2);
  await expect(
    region.getByText(
      "Starting point only — not a recommendation or guaranteed cost.",
    ),
  ).toHaveCount(2);
});

test("empty submit requires every mandatory figure", async ({ page }) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  // Maintenance is prefilled, so only six errors: five amounts, one rate.
  await expect(region.getByText("Enter an amount.")).toHaveCount(5);
  await expect(region.getByText("Enter a percentage.")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("invalid values show field-level errors", async ({ page }) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill("abc");
  await region.getByLabel("Annual interest rate").fill("6 .5");
  await region.getByLabel("Annual maintenance reserve rate").fill("1.234");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByText("Enter a valid dollar amount, e.g. 8,500.50."),
  ).toBeVisible();
  await expect(
    page.getByText("Enter a valid percentage, e.g. 6.5."),
  ).toBeVisible();
  await expect(page.getByText("Use at most 2 decimal places.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("explicit zero optionals are preserved, never omitted", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillBase(page);
  const region = propertyRegion(page);
  await region.getByLabel("Monthly PMI").fill("0");
  await region.getByLabel("Closing costs (one-time)").fill("0");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByText("Not entered")).toHaveCount(0);
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await expect(
    page.getByText("Estimated upfront cash (down payment + closing costs)"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Closing costs weren't entered, so the upfront figure covers the down payment only.",
    ),
  ).toBeHidden();
});

test("other-cost lines can be added, filled, and removed", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillBase(page);
  const region = propertyRegion(page);
  await region.getByRole("button", { name: "Add another cost" }).click();
  await region.getByRole("button", { name: "Add another cost" }).click();
  await region.getByLabel("Label").nth(0).fill("Alarm");
  await region.getByLabel("Monthly amount").nth(0).fill("30");
  await region.getByLabel("Label").nth(1).fill("Pest control");
  await region.getByLabel("Monthly amount").nth(1).fill("50");
  await region.getByRole("button", { name: "Remove Alarm" }).click();
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByText("Pest control").first()).toBeVisible();
  await expect(page.getByText("Alarm").first()).toBeHidden();
  await expect(page.getByText("$50.00").first()).toBeVisible();
});

test("add button enforces the 100-line cap visibly", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  const add = region.getByRole("button", { name: "Add another cost" });
  for (let i = 0; i < 100; i += 1) {
    await add.click();
  }
  await expect(add).toBeDisabled();
  await expect(region.getByText("Line limit reached (100).")).toBeVisible();
  await region.getByRole("button", { name: "Remove line 100" }).click();
  await expect(add).toBeEnabled();
});

test("editing inputs retires stale results", async ({ page }) => {
  await submitBase(page);
  await propertyRegion(page).getByLabel("Purchase price").fill("361000");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("network failure shows a safe error without results", async ({
  page,
}) => {
  await page.route("**/api/true-cost", (route) => route.abort());
  await page.goto("/property-costs");
  await fillBase(page);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByText(
      "Could not reach the server. Check your connection and try again.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("API rejects invalid payloads with safe errors", async ({
  request,
}) => {
  const sentinel = 9_876_543_210_987;
  const response = await request.post("/api/true-cost", {
    data: {
      data: {
        homePriceCents: sentinel,
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

  test("stacks property form above results with no overflow", async ({
    page,
  }) => {
    await submitBase(page);
    const submitBox = requireBox(
      await page.getByRole("button", { name: SUBMIT_NAME }).boundingBox(),
    );
    const resultsBox = requireBox(
      await page
        .getByRole("heading", { name: PROPERTY_HEADING })
        .boundingBox(),
    );
    expect(resultsBox.y).toBeGreaterThan(submitBox.y + submitBox.height);
    expect(Math.abs(resultsBox.x - submitBox.x)).toBeLessThan(2);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
