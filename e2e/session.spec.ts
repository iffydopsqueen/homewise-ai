import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Session persistence journeys (P2). Drafts and completed results live in
// memory-only shared context: client-side navigation preserves them, edits
// retire them, Start over clears one workflow, and refresh clears all.
// Affordability, property, and compare coverage for checkpoints 2-4.

const VALUES = {
  income: "8000",
  housing: "2000",
  debts: "600",
  expenses: "2500",
  savings: "50000",
} as const;

const LABELS = {
  income: "Monthly take-home income",
  housing: "Proposed monthly housing cost",
  debts: "Existing monthly debt payments",
  expenses: "Other monthly living expenses",
  savings: "Available savings",
} as const;

const RESULTS_HEADING = "Your affordability snapshot";

async function fillAffordability(
  page: Page,
  values: Partial<typeof VALUES> = VALUES,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const label = LABELS[key as keyof typeof LABELS];
    await page.getByLabel(label).fill(value);
  }
}

async function submitAffordability(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeVisible();
}

async function goTo(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

test("affordability draft survives navigation away and back", async ({
  page,
}) => {
  await page.goto("/affordability");
  await page.getByLabel(LABELS.income).fill(VALUES.income);
  await page.getByLabel(LABELS.housing).fill(VALUES.housing);
  await goTo(page, "Property Costs");
  await expect(
    page.getByRole("heading", { name: "Property costs", exact: true }),
  ).toBeVisible();
  await goTo(page, "Affordability");
  await expect(page.getByLabel(LABELS.income)).toHaveValue(VALUES.income);
  await expect(page.getByLabel(LABELS.housing)).toHaveValue(VALUES.housing);
  await expect(page.getByLabel(LABELS.debts)).toHaveValue("");
});

test("completed affordability result survives navigation away and back", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await goTo(page, "Compare Properties");
  await expect(
    page.getByRole("heading", { name: "Compare properties", exact: true }),
  ).toBeVisible();
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeVisible();
  await expect(page.getByLabel(LABELS.income)).toHaveValue(VALUES.income);
});

test("editing after returning retires the stale result", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await goTo(page, "Property Costs");
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeVisible();
  await page.getByLabel(LABELS.income).fill("8500");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeHidden();
  await expect(page.getByLabel(LABELS.income)).toHaveValue("8500");
});

test("start over clears the affordability draft and result", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel(LABELS.income)).toHaveValue("");
  await expect(page.getByLabel(LABELS.savings)).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeHidden();
});

test("starting over leaves other workflows functional", async ({ page }) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await page.getByRole("button", { name: "Start over" }).click();
  // Slice isolation itself is unit-covered; this proves no cross-workflow
  // breakage at the page level. Full cross-slice E2E isolation lands once
  // property and compare migrate in checkpoints 3-4.
  await goTo(page, "Property Costs");
  await expect(
    page.getByRole("heading", { name: "Property costs", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Purchase price").fill("360000");
  await expect(page.getByLabel("Purchase price")).toHaveValue("360000");
});

test("refresh clears the affordability draft and result", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await page.reload();
  await expect(page.getByLabel(LABELS.income)).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeHidden();
});

// --- Property Costs session journeys (checkpoint 3) ---

const PROPERTY_HEADING = "Your property cost breakdown";
const PROPERTY_SUBMIT = "Calculate property costs";

async function fillPropertyBase(page: Page): Promise<void> {
  await page.getByLabel("Purchase price").fill("360000");
  await page.getByLabel("Down payment").fill("60000");
  await page.getByLabel("Annual interest rate").fill("0");
  await page.getByLabel("Annual property taxes").fill("1200");
  await page.getByLabel("Annual homeowners insurance").fill("0");
  await page.getByLabel("Monthly HOA fees").fill("0");
  await page.getByLabel("Annual maintenance reserve rate").fill("0");
}

async function submitProperty(page: Page): Promise<void> {
  await page.getByRole("button", { name: PROPERTY_SUBMIT }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
}

test("property draft survives navigation away and back", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await page.getByLabel("Purchase price").fill("360000");
  await page.getByLabel("Down payment").fill("60000");
  await page.locator("#property-annualTax-estimate").check();
  await page
    .getByRole("radio", { name: "15 years (180 months)" })
    .check();
  await page.getByRole("button", { name: "Add another cost" }).click();
  await page.getByLabel("Label").fill("Alarm");
  await page.getByLabel("Monthly amount").fill("30");
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: "Affordability", exact: true }),
  ).toBeVisible();
  await goTo(page, "Property Costs");
  await expect(page.getByLabel("Purchase price")).toHaveValue("360000");
  await expect(page.getByLabel("Down payment")).toHaveValue("60000");
  await expect(page.locator("#property-annualTax-estimate")).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "15 years (180 months)" }),
  ).toBeChecked();
  await expect(page.getByLabel("Label")).toHaveValue("Alarm");
  await expect(page.getByLabel("Monthly amount")).toHaveValue("30");
});

test("completed property result survives navigation away and back", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByLabel("Purchase price")).toHaveValue("360000");
});

test("editing a property field after returning retires the result", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await page.getByLabel("Purchase price").fill("361000");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("toggling an estimate after returning retires the result", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await page.locator("#property-annualTax-estimate").check();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("changing term after returning retires the result", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await page.getByRole("radio", { name: "15 years (180 months)" }).check();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("adding a line after returning retires the result", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await page.getByRole("button", { name: "Add another cost" }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("editing a line after returning retires the result", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await page.getByRole("button", { name: "Add another cost" }).click();
  await page.getByLabel("Label").fill("Alarm");
  await page.getByLabel("Monthly amount").fill("30");
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await page.getByLabel("Monthly amount").fill("40");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("removing a line after returning retires the result", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await page.getByRole("button", { name: "Add another cost" }).click();
  await page.getByLabel("Label").fill("Alarm");
  await page.getByLabel("Monthly amount").fill("30");
  await submitProperty(page);
  await goTo(page, "Affordability");
  await goTo(page, "Property Costs");
  await page.getByRole("button", { name: "Remove Alarm" }).click();
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

test("start over clears property but preserves affordability", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await goTo(page, "Property Costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel("Purchase price")).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeVisible();
  await expect(page.getByLabel(LABELS.income)).toHaveValue(VALUES.income);
});

test("refresh clears the property draft and result", async ({ page }) => {
  await page.goto("/property-costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await page.reload();
  await expect(page.getByLabel("Purchase price")).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeHidden();
});

// --- Compare session journeys (checkpoint 4) ---

const COMPARE_HEADING = "Property comparison";
const COMPARE_SUBMIT = "Compare properties";

function compareSection(page: Page, side: "A" | "B"): Locator {
  return page.locator(`section[aria-label="Property ${side}"]`);
}

async function fillCompareSide(
  page: Page,
  side: "A" | "B",
  down: string,
): Promise<void> {
  const section = compareSection(page, side);
  await section.getByLabel("Purchase price").fill("300000");
  await section.getByLabel("Down payment").fill(down);
  await section.getByLabel("Annual interest rate").fill("0");
  await section.getByLabel("Annual property taxes").fill("1200");
  await section.getByLabel("Annual homeowners insurance").fill("0");
  await section.getByLabel("Monthly HOA fees").fill("0");
  await section.getByLabel("Annual maintenance reserve rate").fill("0");
}

async function submitCompare(page: Page): Promise<void> {
  await page.getByRole("button", { name: COMPARE_SUBMIT }).click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
}

test("compare drafts survive navigation away and back", async ({ page }) => {
  await page.goto("/compare");
  await compareSection(page, "A").getByLabel("Purchase price").fill("300000");
  await compareSection(page, "B").getByLabel("Purchase price").fill("310000");
  await compareSection(page, "B").getByLabel("Down payment").fill("30000");
  await page.locator("#compare-a-annualTax-estimate").check();
  await compareSection(page, "B")
    .getByRole("radio", { name: "15 years (180 months)" })
    .check();
  await compareSection(page, "A")
    .getByRole("button", { name: "Add another cost" })
    .click();
  await compareSection(page, "A").getByLabel("Label").fill("Alarm");
  await compareSection(page, "A").getByLabel("Monthly amount").fill("30");
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: "Affordability", exact: true }),
  ).toBeVisible();
  await goTo(page, "Compare Properties");
  await expect(
    compareSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("300000");
  await expect(
    compareSection(page, "B").getByLabel("Purchase price"),
  ).toHaveValue("310000");
  await expect(
    compareSection(page, "B").getByLabel("Down payment"),
  ).toHaveValue("30000");
  await expect(page.locator("#compare-a-annualTax-estimate")).toBeChecked();
  await expect(
    compareSection(page, "B").getByRole("radio", {
      name: "15 years (180 months)",
    }),
  ).toBeChecked();
  await expect(compareSection(page, "A").getByLabel("Label")).toHaveValue(
    "Alarm",
  );
  await expect(
    compareSection(page, "A").getByLabel("Monthly amount"),
  ).toHaveValue("30");
});

test("completed comparison result survives navigation away and back", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillCompareSide(page, "A", "60000");
  await fillCompareSide(page, "B", "30000");
  await submitCompare(page);
  await goTo(page, "Affordability");
  await goTo(page, "Compare Properties");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeVisible();
  await expect(
    compareSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("300000");
  await expect(
    compareSection(page, "B").getByLabel("Down payment"),
  ).toHaveValue("30000");
});

test("editing side B retires the result and preserves side A", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillCompareSide(page, "A", "60000");
  await fillCompareSide(page, "B", "30000");
  await submitCompare(page);
  await goTo(page, "Affordability");
  await goTo(page, "Compare Properties");
  await compareSection(page, "B").getByLabel("Purchase price").fill("301000");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
  await expect(
    compareSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("300000");
  await expect(
    compareSection(page, "A").getByLabel("Down payment"),
  ).toHaveValue("60000");
});

test("toggling an estimate on side A retires the result", async ({
  page,
}) => {
  await page.goto("/compare");
  await fillCompareSide(page, "A", "60000");
  await fillCompareSide(page, "B", "30000");
  await submitCompare(page);
  await goTo(page, "Affordability");
  await goTo(page, "Compare Properties");
  await page.locator("#compare-a-annualTax-estimate").check();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
});

test("adding a line on side B retires the result", async ({ page }) => {
  await page.goto("/compare");
  await fillCompareSide(page, "A", "60000");
  await fillCompareSide(page, "B", "30000");
  await submitCompare(page);
  await goTo(page, "Affordability");
  await goTo(page, "Compare Properties");
  await compareSection(page, "B")
    .getByRole("button", { name: "Add another cost" })
    .click();
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
});

test("start over clears compare but preserves affordability and property", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillAffordability(page);
  await submitAffordability(page);
  await goTo(page, "Property Costs");
  await fillPropertyBase(page);
  await submitProperty(page);
  await goTo(page, "Compare Properties");
  await fillCompareSide(page, "A", "60000");
  await fillCompareSide(page, "B", "30000");
  await submitCompare(page);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(
    compareSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("");
  await expect(
    compareSection(page, "B").getByLabel("Purchase price"),
  ).toHaveValue("");
  await expect(
    compareSection(page, "A").getByLabel("Annual maintenance reserve rate"),
  ).toHaveValue("1");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
  await goTo(page, "Affordability");
  await expect(
    page.getByRole("heading", { name: RESULTS_HEADING }),
  ).toBeVisible();
  await expect(page.getByLabel(LABELS.income)).toHaveValue(VALUES.income);
  await goTo(page, "Property Costs");
  await expect(
    page.getByRole("heading", { name: PROPERTY_HEADING }),
  ).toBeVisible();
  await expect(page.getByLabel("Purchase price")).toHaveValue("360000");
});

test("refresh clears the compare drafts and result", async ({ page }) => {
  await page.goto("/compare");
  await fillCompareSide(page, "A", "60000");
  await fillCompareSide(page, "B", "30000");
  await submitCompare(page);
  await page.reload();
  await expect(
    compareSection(page, "A").getByLabel("Purchase price"),
  ).toHaveValue("");
  await expect(
    compareSection(page, "B").getByLabel("Purchase price"),
  ).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: COMPARE_HEADING, exact: true }),
  ).toBeHidden();
});
