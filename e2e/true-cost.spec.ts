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
const EDIT_NAME = "Edit property details";
const PURCHASE_SECTION = "Purchase & loan";
const ONGOING_SECTION = "Ongoing ownership costs";
const ADDITIONAL_SECTION = "Additional monthly costs";

// The compare section reuses the same field labels, so all single-property
// locators below stay inside this form's accessible region.
function propertyRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Property costs" });
}

// Post-calculation, the form collapses but stays in the DOM ahead of the
// results; legend/badge assertions scope here so hidden form text (labels,
// badges) can never satisfy a visibility check meant for the results.
function resultsRegion(page: Page): Locator {
  return page.getByRole("region", { name: PROPERTY_HEADING });
}

async function openPropertyInputs(page: Page): Promise<void> {
  await page.getByRole("button", { name: EDIT_NAME }).click();
  await expect(propertyRegion(page).getByLabel("Purchase price")).toBeVisible();
}

// Pre-calculation sections start with only Purchase & loan open; acting on
// a field inside a closed section must open it first. Callers ensure the
// outer T4b.1 form is already expanded.
async function ensureSectionOpen(page: Page, title: string): Promise<void> {
  const toggle = page.getByRole("button", { name: title });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
}

async function fillBase(page: Page): Promise<void> {
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill(BASE_INPUTS.price);
  await region.getByLabel("Down payment").fill(BASE_INPUTS.down);
  await region.getByLabel("Annual interest rate").fill(BASE_INPUTS.rate);
  await ensureSectionOpen(page, ONGOING_SECTION);
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
  // Scoped to the main result: Financial Insights re-presents the KPIs
  // and captions further down the page. Amount .first() calls below are
  // the summary/detail twins inside this region (KPI or legend first,
  // disclosure row second) — never the insights copies.
  const results = resultsRegion(page);
  // Dashboard KPIs surface top-level figures; full rows live in the disclosure.
  await expect(results.getByText("Total estimated monthly cost")).toBeVisible();
  await expect(results.getByText("$933.33").first()).toBeVisible();
  await expect(results.getByText("Total annual housing cost")).toBeVisible();
  await expect(results.getByText("$11,199.96 per year").first()).toBeVisible();
  await expect(
    results.getByText("Estimated upfront cash", { exact: true }),
  ).toBeVisible();
  await expect(results.getByText("$60,000.00").first()).toBeVisible();
  await expect(
    results.getByText("Down payment only — no closing costs entered"),
  ).toBeVisible();
  await page.getByText("View detailed breakdown").click();
  // Engine-pinned BASE figures.
  await expect(results.getByText("$833.33").first()).toBeVisible();
  await expect(results.getByText("$100.00").first()).toBeVisible();
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
  // Provenance vocabulary present (scoped: the collapsed form ahead of
  // the results carries its own hidden Assumption badge and caption).
  await expect(results.getByText("Calculated", { exact: true }).first()).toBeVisible();
  await expect(results.getByText("User-provided", { exact: true }).first()).toBeVisible();
  await expect(results.getByText("Assumption", { exact: true }).first()).toBeVisible();
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
  await ensureSectionOpen(page, ONGOING_SECTION);
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
  // Scoped to the main result: Financial Insights re-presents the KPIs
  // and captions further down the page. Amount .first() calls are the
  // summary/detail twins inside this region, never the insights copies.
  const results = resultsRegion(page);
  await expect(results.getByText("Total estimated monthly cost")).toBeVisible();
  await expect(
    results.getByText("Includes down payment and closing costs"),
  ).toBeVisible();
  await page.getByText("View detailed breakdown").click();
  // $300k principal at 6%/30yr: the locked known answer.
  await expect(results.getByText("$1,798.65").first()).toBeVisible();
  // Engine-pinned companions: 1% of $360k maintenance, $69,000 upfront.
  await expect(results.getByText("$300.00").first()).toBeVisible();
  await expect(results.getByText("$69,000.00").first()).toBeVisible();
  // PMI stays its own line; upfront reflects supplied closing costs.
  await expect(
    results.getByText("Estimated upfront cash (down payment + closing costs)"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Closing costs weren't entered, so the upfront figure covers the down payment only.",
    ),
  ).toBeHidden();
  // Provenance: tax + HOA estimates (figures plus HOA echo), maintenance
  // assumption (form plus echo). Scoped to this section: the compare forms
  // below render their own maintenance assumption badges and captions.
  // Scoped to the main result: Financial Insights re-presents the HOA
  // driver with its own Estimate badge (asserted separately below).
  await expect(results.getByText("Estimate", { exact: true })).toHaveCount(3);
  const insights = page.getByRole("region", { name: "Financial insights" });
  await expect(insights.getByText("Estimate", { exact: true })).toHaveCount(1);
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
  await ensureSectionOpen(page, ONGOING_SECTION);
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
  await ensureSectionOpen(page, ONGOING_SECTION);
  await region.getByLabel("Monthly PMI").fill("0");
  await region.getByLabel("Closing costs (one-time)").fill("0");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByText("Not entered")).toHaveCount(0);
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await page.getByText("View detailed breakdown").click();
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
  await ensureSectionOpen(page, ADDITIONAL_SECTION);
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
  // Aggregated Other slice is charted; the itemized label stays in details.
  await expect(page.getByText("$50.00").first()).toBeVisible();
  await page.getByText("View detailed breakdown").click();
  // Scoped to the results: the collapsed form ahead still carries a hidden
  // "Remove Pest control" button that a page-level locator hits first.
  const results = resultsRegion(page);
  await expect(results.getByText("Pest control")).toBeVisible();
  await expect(results.getByText("Alarm")).toHaveCount(0);
});

test("add button enforces the 100-line cap visibly", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await ensureSectionOpen(page, ADDITIONAL_SECTION);
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
  await openPropertyInputs(page);
  await propertyRegion(page).getByLabel("Purchase price").fill("361000");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("successful calculation collapses the form into a summary", async ({
  page,
}) => {
  await submitBase(page);
  const region = propertyRegion(page);
  await expect(region.getByLabel("Purchase price")).toBeHidden();
  const edit = page.getByRole("button", { name: EDIT_NAME });
  await expect(edit).toBeVisible();
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  // Compact summary shows formatted verified figures, never raw digits.
  await expect(
    region.getByText("Purchase price: $360,000.00"),
  ).toBeVisible();
  await expect(region.getByText("Down payment: $60,000.00")).toBeVisible();
  await expect(region.getByText("0% · 30 years")).toBeVisible();
  await expect(region.getByText("360000", { exact: false })).toHaveCount(0);
  // Actions stay available while collapsed: recalculate or start over
  // without reopening first.
  await expect(page.getByRole("button", { name: SUBMIT_NAME })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
});

test("section headings toggle by keyboard", async ({ page }) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  const ongoing = page.getByRole("button", { name: ONGOING_SECTION });
  await ongoing.focus();
  await expect(ongoing).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(ongoing).toHaveAttribute("aria-expanded", "true");
  await expect(region.getByLabel("Annual property taxes")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(ongoing).toHaveAttribute("aria-expanded", "false");
  await expect(region.getByLabel("Annual property taxes")).toBeHidden();
});

test("explicit submit moves focus to the result heading", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillBase(page);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeFocused();
});

test("edit reopens inputs preserving values, toggles, and lines", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillBase(page);
  const region = propertyRegion(page);
  await ensureSectionOpen(page, ONGOING_SECTION);
  await page.locator("#property-annualTax-estimate").check();
  await region.getByRole("radio", { name: "15 years (180 months)" }).check();
  await ensureSectionOpen(page, ADDITIONAL_SECTION);
  await region.getByRole("button", { name: "Add another cost" }).click();
  await region.getByLabel("Label").fill("Alarm");
  await region.getByLabel("Monthly amount").fill("30");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await openPropertyInputs(page);
  await expect(region.getByLabel("Purchase price")).toHaveValue("360000");
  await expect(region.getByLabel("Down payment")).toHaveValue("60000");
  await expect(region.getByLabel("Annual interest rate")).toHaveValue("0");
  await expect(
    page.locator("#property-annualTax-estimate"),
  ).toBeChecked();
  await expect(
    region.getByRole("radio", { name: "15 years (180 months)" }),
  ).toBeChecked();
  await expect(region.getByLabel("Label")).toHaveValue("Alarm");
  await expect(region.getByLabel("Monthly amount")).toHaveValue("30");
});

test("opening and closing without edits preserves the result", async ({
  page,
}) => {
  await submitBase(page);
  const heading = page.getByRole("heading", { name: PROPERTY_HEADING });
  await openPropertyInputs(page);
  await expect(heading).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse property inputs" })
    .click();
  await expect(heading).toBeVisible();
  await expect(
    propertyRegion(page).getByLabel("Purchase price"),
  ).toBeHidden();
});

test("editing after reopening retires the result, inputs stay open", async ({
  page,
}) => {
  await submitBase(page);
  await openPropertyInputs(page);
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill("361000");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
  // Retirement expands the form; with no result there is no Edit toggle.
  await expect(region.getByLabel("Purchase price")).toBeVisible();
  await expect(
    page.getByRole("button", { name: EDIT_NAME }),
  ).toBeHidden();
});

test("failed validation keeps the form expanded with visible errors", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(region.getByText("Enter an amount.").first()).toBeVisible();
  await expect(region.getByLabel("Purchase price")).toBeVisible();
  await expect(
    page.getByRole("button", { name: EDIT_NAME }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("only Purchase & loan starts expanded; all headings visible", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  for (const title of [PURCHASE_SECTION, ONGOING_SECTION, ADDITIONAL_SECTION]) {
    await expect(
      page.getByRole("button", { name: title }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: PURCHASE_SECTION }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: ONGOING_SECTION }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: ADDITIONAL_SECTION }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(region.getByLabel("Purchase price")).toBeVisible();
  await expect(region.getByLabel("Annual property taxes")).toBeHidden();
  await expect(
    region.getByRole("button", { name: "Add another cost" }),
  ).toBeHidden();
});

test("sections expand and collapse independently", async ({ page }) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  const ongoing = page.getByRole("button", { name: ONGOING_SECTION });
  const additional = page.getByRole("button", { name: ADDITIONAL_SECTION });
  await ongoing.click();
  await additional.click();
  // Multiple sections stay open at once; Purchase never forced shut.
  await expect(region.getByLabel("Purchase price")).toBeVisible();
  await expect(region.getByLabel("Annual property taxes")).toBeVisible();
  await expect(
    region.getByRole("button", { name: "Add another cost" }),
  ).toBeVisible();
  await ongoing.click();
  await expect(region.getByLabel("Annual property taxes")).toBeHidden();
  await expect(
    region.getByRole("button", { name: "Add another cost" }),
  ).toBeVisible();
  await expect(region.getByLabel("Purchase price")).toBeVisible();
});

test("values and toggles survive closing and reopening sections", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill("360000");
  await ensureSectionOpen(page, ONGOING_SECTION);
  await region.getByLabel("Annual property taxes").fill("1200");
  await page.locator("#property-annualTax-estimate").check();
  await page.getByRole("button", { name: PURCHASE_SECTION }).click();
  await page.getByRole("button", { name: ONGOING_SECTION }).click();
  await expect(region.getByLabel("Purchase price")).toBeHidden();
  await expect(region.getByLabel("Annual property taxes")).toBeHidden();
  await ensureSectionOpen(page, PURCHASE_SECTION);
  await ensureSectionOpen(page, ONGOING_SECTION);
  await expect(region.getByLabel("Purchase price")).toHaveValue("360000");
  await expect(region.getByLabel("Annual property taxes")).toHaveValue("1200");
  await expect(page.locator("#property-annualTax-estimate")).toBeChecked();
});

test("additional-cost lines survive collapsing the section", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await ensureSectionOpen(page, ADDITIONAL_SECTION);
  await region.getByRole("button", { name: "Add another cost" }).click();
  await region.getByLabel("Label").fill("Alarm");
  await region.getByLabel("Monthly amount").fill("30");
  await page.getByRole("button", { name: ADDITIONAL_SECTION }).click();
  await expect(
    region.getByRole("button", { name: "Add another cost" }),
  ).toBeHidden();
  await ensureSectionOpen(page, ADDITIONAL_SECTION);
  await expect(region.getByLabel("Label")).toHaveValue("Alarm");
  await expect(region.getByLabel("Monthly amount")).toHaveValue("30");
});

test("calculation succeeds opening sections in any order", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  // Deliberately bottom-up: Additional, then Ongoing, then Purchase.
  await ensureSectionOpen(page, ADDITIONAL_SECTION);
  await region.getByRole("button", { name: "Add another cost" }).click();
  await region.getByLabel("Label").fill("Alarm");
  await region.getByLabel("Monthly amount").fill("30");
  await ensureSectionOpen(page, ONGOING_SECTION);
  await region.getByLabel("Annual property taxes").fill("1200");
  await region.getByLabel("Annual homeowners insurance").fill("0");
  await region.getByLabel("Monthly HOA fees").fill("0");
  await region.getByLabel("Annual maintenance reserve rate").fill("0");
  await ensureSectionOpen(page, PURCHASE_SECTION);
  await region.getByLabel("Purchase price").fill("360000");
  await region.getByLabel("Down payment").fill("60000");
  await region.getByLabel("Annual interest rate").fill("0");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByText("Alarm").first()).toBeHidden();
  await page.getByText("View detailed breakdown").click();
  await expect(resultsRegion(page).getByText("Alarm")).toBeVisible();
});

test("failed submit expands error sections with badges and focuses first invalid", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  // Empty submit: 3 purchase errors (price, down, rate) and 3 ongoing
  // errors (tax, insurance, HOA); maintenance is prefilled, optionals
  // blank, and no itemized lines exist.
  const purchase = page.getByRole("button", { name: PURCHASE_SECTION });
  const ongoing = page.getByRole("button", { name: ONGOING_SECTION });
  const additional = page.getByRole("button", { name: ADDITIONAL_SECTION });
  await expect(purchase).toHaveAttribute("aria-expanded", "true");
  await expect(ongoing).toHaveAttribute("aria-expanded", "true");
  await expect(additional).toHaveAttribute("aria-expanded", "false");
  await expect(purchase.getByText("3 issues to review")).toBeVisible();
  await expect(ongoing.getByText("3 issues to review")).toBeVisible();
  // Every affected section is reachable without resubmitting.
  await expect(region.getByLabel("Purchase price")).toBeVisible();
  await expect(region.getByLabel("Annual property taxes")).toBeVisible();
  await expect(region.getByText("Enter an amount.")).toHaveCount(5);
  await expect(region.getByText("Enter a percentage.")).toHaveCount(1);
  await expect(region.getByLabel("Purchase price")).toBeFocused();
});

test("partial errors open only the affected section", async ({ page }) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill("360000");
  await region.getByLabel("Down payment").fill("60000");
  await region.getByLabel("Annual interest rate").fill("0");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  // Purchase is valid: no badge, keeps its state; Ongoing opens with one
  // badge covering its three empty required fields.
  await expect(
    page.getByRole("button", { name: PURCHASE_SECTION }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: PURCHASE_SECTION }).getByText("to review"),
  ).toHaveCount(0);
  const ongoing = page.getByRole("button", { name: ONGOING_SECTION });
  await expect(ongoing).toHaveAttribute("aria-expanded", "true");
  await expect(ongoing.getByText("3 issues to review")).toBeVisible();
  await expect(region.getByLabel("Annual property taxes")).toBeVisible();
  await expect(region.getByLabel("Annual property taxes")).toBeFocused();
});

test("closing a section after reopening does not retire the result", async ({
  page,
}) => {
  await submitBase(page);
  await openPropertyInputs(page);
  await page.getByRole("button", { name: PURCHASE_SECTION }).click();
  await expect(
    propertyRegion(page).getByLabel("Purchase price"),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
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

test("cost visualization shows all seven categories with amounts", async ({
  page,
}) => {
  await submitBase(page);
  await expect(
    page.getByRole("heading", { name: "Monthly cost breakdown" }),
  ).toBeVisible();
  // Legend carries every slice; the bar itself is labelled. Scoped to
  // the results: the collapsed form ahead carries matching hidden labels
  // ("Annual property taxes", "Monthly PMI", ...).
  const results = resultsRegion(page);
  await expect(results.getByText("Principal and interest").first()).toBeVisible();
  await expect(results.getByText("$833.33").first()).toBeVisible();
  await expect(results.getByText("Property tax").first()).toBeVisible();
  await expect(results.getByText("$100.00").first()).toBeVisible();
  await expect(results.getByText("Homeowners insurance").first()).toBeVisible();
  await expect(results.getByText("HOA").first()).toBeVisible();
  await expect(results.getByText("Maintenance reserve").first()).toBeVisible();
  await expect(results.getByText("PMI").first()).toBeVisible();
  await expect(results.getByText("Other monthly costs").first()).toBeVisible();
  // Zero-valued slices stay legible as $0.00 legend entries.
  await expect(results.getByText("$0.00").first()).toBeVisible();
  // Scoped to this chart: Financial Insights renders its own top-costs
  // chart with a matching accessible-name substring.
  await expect(
    page
      .getByRole("region", { name: "Monthly cost breakdown" })
      .getByRole("img", { name: "Principal and interest $833.33" }),
  ).toBeVisible();
});

test("detailed breakdown disclosure toggles the full figure list", async ({
  page,
}) => {
  await submitBase(page);
  const toggle = page.getByText("View detailed breakdown");
  const figuresHeading = page.getByRole("heading", {
    name: "Your figures",
    exact: true,
  });
  const details = page.locator("details");
  await expect(figuresHeading).toBeHidden();
  await toggle.click();
  await expect(figuresHeading).toBeVisible();
  // Scoped to the disclosure: the chart legend above carries the same value.
  await expect(
    details.getByText("$833.33", { exact: true }),
  ).toBeVisible();
  await toggle.click();
  await expect(figuresHeading).toBeHidden();
});

test("all-zero monthly components show an honest empty chart", async ({
  page,
}) => {
  await page.goto("/property-costs");
  const region = propertyRegion(page);
  await region.getByLabel("Purchase price").fill("100000");
  await region.getByLabel("Down payment").fill("100000");
  await region.getByLabel("Annual interest rate").fill("0");
  await ensureSectionOpen(page, ONGOING_SECTION);
  await region.getByLabel("Annual property taxes").fill("0");
  await region.getByLabel("Annual homeowners insurance").fill("0");
  await region.getByLabel("Monthly HOA fees").fill("0");
  await region.getByLabel("Annual maintenance reserve rate").fill("0");
  await page.getByRole("button", { name: SUBMIT_NAME }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await expect(page.getByText("No amounts to show.")).toBeVisible();
  await expect(page.getByText("$100,000.00").first()).toBeVisible();
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacks property form above results with no overflow", async ({
    page,
  }) => {
    await submitBase(page);
    await expect(
      resultsRegion(page).getByText("Total estimated monthly cost"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Monthly cost breakdown" }),
    ).toBeVisible();
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

  test("initial sections keep the mobile page short with no overflow", async ({
    page,
  }) => {
    await page.goto("/property-costs");
    expect(await horizontalOverflow(page)).toBe(0);
    // Only Purchase & loan starts open: expanding everything must grow
    // total scrollable height.
    const initialHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await ensureSectionOpen(page, ONGOING_SECTION);
    await ensureSectionOpen(page, ADDITIONAL_SECTION);
    const expandedHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(initialHeight).toBeLessThan(expandedHeight);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("collapse materially shortens the page with no overflow", async ({
    page,
  }) => {
    await submitBase(page);
    await expect(
      page.getByRole("button", { name: EDIT_NAME }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    // Collapsing materially shortens the page: reopening the long form
    // must grow total scrollable height (focus scrolling cannot fake this).
    const collapsedHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await openPropertyInputs(page);
    const expandedHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(collapsedHeight).toBeLessThan(expandedHeight);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
