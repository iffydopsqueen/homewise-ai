import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Dashboard journeys (P3, Checkpoint 3). The dashboard is a read-only
// overview: card statuses derive from session drafts and stored results.
// Every expected figure below is already engine-locked by the workflow E2E
// suites (affordability, true-cost, and compare pins); nothing here invents
// financial values.

const CARD_NAMES = [
  "Affordability",
  "Property Costs",
  "Compare Properties",
] as const;

async function goTo(page: Page, label: string): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  // On narrow viewports the links hide behind the hamburger menu; on
  // desktop the button is hidden and this is a no-op.
  const menuButton = nav.getByRole("button", { name: /navigation menu/ });
  if (await menuButton.isVisible()) {
    await menuButton.click();
  }
  await nav.getByRole("link", { name: label, exact: true }).click();
}

function dashboardCard(page: Page, name: string): Locator {
  // Exact match: non-exact "Affordability" also matches the workflow's
  // "Affordability results" section, which strict mode rejects.
  return page.getByRole("region", { name, exact: true });
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

// --- Affordability fixtures (figures locked by e2e/affordability.spec.ts) ---

async function submitAffordability(page: Page): Promise<void> {
  await page.getByLabel("Monthly take-home income").fill("8000");
  await page.getByLabel("Proposed monthly housing cost").fill("2000");
  await page.getByLabel("Existing monthly debt payments").fill("600");
  await page.getByLabel("Other monthly living expenses").fill("2500");
  await page.getByLabel("Available savings").fill("50000");
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
}

// --- Property fixtures (figures locked by e2e/true-cost.spec.ts BASE) ---

async function ensurePropertySectionOpen(
  page: Page,
  title: string,
): Promise<void> {
  const toggle = page.getByRole("button", { name: title });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
}

async function submitProperty(page: Page): Promise<void> {
  await page.getByLabel("Purchase price").fill("360000");
  await page.getByLabel("Down payment").fill("60000");
  await page.getByLabel("Annual interest rate").fill("0");
  await ensurePropertySectionOpen(page, "Ongoing ownership costs");
  await page.getByLabel("Annual property taxes").fill("1200");
  await page.getByLabel("Annual homeowners insurance").fill("0");
  await page.getByLabel("Monthly HOA fees").fill("0");
  await page.getByLabel("Annual maintenance reserve rate").fill("0");
  await page.getByRole("button", { name: "Calculate property costs" }).click();
  await expect(
    page.getByRole("heading", { name: "Your property cost breakdown" }),
  ).toBeVisible();
}

// --- Compare fixtures (figures locked by e2e/compare.spec.ts pins) ---

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

function compareSection(page: Page, side: "A" | "B"): Locator {
  return page.getByRole("region", { name: `Property ${side}` });
}

async function fillCompareSide(
  page: Page,
  side: "A" | "B",
  inputs: SideInputs,
): Promise<void> {
  const section = compareSection(page, side);
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

async function submitCompare(page: Page): Promise<void> {
  await fillCompareSide(page, "A", SIDE_A);
  await fillCompareSide(page, "B", SIDE_B);
  await page.getByRole("button", { name: "Compare properties" }).click();
  await expect(
    page.getByRole("heading", { name: "Property comparison", exact: true }),
  ).toBeVisible();
}

test("fresh session shows all three cards as not started", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of CARD_NAMES) {
    const card = dashboardCard(page, name);
    await expect(card.getByText("Not started yet.")).toBeVisible();
    await expect(
      card.getByText("In progress — no results yet."),
    ).toHaveCount(0);
    await expect(card.getByText("Completed", { exact: true })).toHaveCount(0);
  }
});

test("partial affordability draft shows in-progress without figures", async ({
  page,
}) => {
  await page.goto("/affordability");
  await page.getByLabel("Monthly take-home income").fill("8000");
  await goTo(page, "Dashboard");
  const card = dashboardCard(page, "Affordability");
  await expect(
    card.getByText("In progress — no results yet."),
  ).toBeVisible();
  await expect(card.getByText(/\$\d/)).toHaveCount(0);
  await expect(card.getByText("Completed", { exact: true })).toHaveCount(0);
  await expect(
    dashboardCard(page, "Property Costs").getByText("Not started yet."),
  ).toBeVisible();
  await expect(
    dashboardCard(page, "Compare Properties").getByText("Not started yet."),
  ).toBeVisible();
});

test("completed affordability shows the stored summary on the dashboard", async ({
  page,
}) => {
  await page.goto("/affordability");
  await submitAffordability(page);
  await goTo(page, "Dashboard");
  const card = dashboardCard(page, "Affordability");
  await expect(card.getByText("Completed", { exact: true })).toBeVisible();
  await expect(card.getByText("Remaining monthly income")).toBeVisible();
  await expect(card.getByText("$2,900.00")).toBeVisible();
  await expect(card.getByText("$5,100.00")).toBeVisible();
  await expect(card.getByText("25%")).toBeVisible();
  await expect(card.getByText("9.8 months")).toBeVisible();
  // The card link returns to the intact workflow result.
  await card.getByRole("link", { name: "Go to Affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
});

test("completed property shows monthly total, upfront cash, and down-payment-only qualifier", async ({
  page,
}) => {
  await page.goto("/property-costs");
  await submitProperty(page);
  await goTo(page, "Dashboard");
  const card = dashboardCard(page, "Property Costs");
  await expect(card.getByText("Completed", { exact: true })).toBeVisible();
  await expect(card.getByText("$933.33")).toBeVisible();
  await expect(card.getByText("$60,000.00")).toBeVisible();
  await expect(
    card.getByText("Estimated upfront cash (down payment only)"),
  ).toBeVisible();
});

test("completed compare shows both monthlies with a neutral sentence and no assumptions message", async ({
  page,
}) => {
  await page.goto("/compare");
  await submitCompare(page);
  await goTo(page, "Dashboard");
  const card = dashboardCard(page, "Compare Properties");
  await expect(card.getByText("Completed", { exact: true })).toBeVisible();
  await expect(card.getByText("$846.67")).toBeVisible();
  await expect(card.getByText("$1,160.00")).toBeVisible();
  await expect(
    card.getByText(
      "Property B costs $313.33 more per month than Property A.",
    ),
  ).toBeVisible();
  // UI-built comparisons share the engine's default assumption set, so the
  // notice stays hidden. The shown branch is pinned at the engine level in
  // tests/calc/compare-whatif.test.ts instead.
  await expect(
    card.getByText("Evaluated under different assumption sets."),
  ).toHaveCount(0);
});

test("editing a completed workflow returns its card to in-progress", async ({
  page,
}) => {
  await page.goto("/affordability");
  await submitAffordability(page);
  await goTo(page, "Dashboard");
  await expect(
    dashboardCard(page, "Affordability").getByText("Completed", {
      exact: true,
    }),
  ).toBeVisible();
  await goTo(page, "Affordability");
  await page.getByLabel("Monthly take-home income").fill("8500");
  await goTo(page, "Dashboard");
  const card = dashboardCard(page, "Affordability");
  await expect(
    card.getByText("In progress — no results yet."),
  ).toBeVisible();
  await expect(card.getByText(/\$\d/)).toHaveCount(0);
});

test("start over in one workflow preserves the other completed cards", async ({
  page,
}) => {
  await page.goto("/affordability");
  await submitAffordability(page);
  await goTo(page, "Property Costs");
  await submitProperty(page);
  await goTo(page, "Compare Properties");
  await submitCompare(page);
  await goTo(page, "Dashboard");
  for (const name of CARD_NAMES) {
    await expect(
      dashboardCard(page, name).getByText("Completed", { exact: true }),
    ).toBeVisible();
  }
  await goTo(page, "Property Costs");
  await page.getByRole("button", { name: "Start over" }).click();
  await goTo(page, "Dashboard");
  const property = dashboardCard(page, "Property Costs");
  await expect(property.getByText("Not started yet.")).toBeVisible();
  await expect(
    property.getByText("Completed", { exact: true }),
  ).toHaveCount(0);
  const affordability = dashboardCard(page, "Affordability");
  await expect(
    affordability.getByText("Completed", { exact: true }),
  ).toBeVisible();
  await expect(affordability.getByText("$2,900.00")).toBeVisible();
  const compare = dashboardCard(page, "Compare Properties");
  await expect(compare.getByText("Completed", { exact: true })).toBeVisible();
  await expect(compare.getByText("$1,160.00")).toBeVisible();
});

test("refresh returns all cards to empty", async ({ page }) => {
  await page.goto("/affordability");
  await submitAffordability(page);
  await goTo(page, "Property Costs");
  await submitProperty(page);
  await goTo(page, "Dashboard");
  await expect(
    dashboardCard(page, "Affordability").getByText("Completed", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  for (const name of CARD_NAMES) {
    await expect(
      dashboardCard(page, name).getByText("Not started yet."),
    ).toBeVisible();
  }
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("dashboard stacks cards with content and no overflow", async ({
    page,
  }) => {
    await page.goto("/affordability");
    await submitAffordability(page);
    await goTo(page, "Dashboard");
    // Prove the dashboard landed before resolving card locators: the
    // affordability page section shares the card's exact accessible name,
    // and the figure below exists on both pages.
    await expect(
      page.getByRole("heading", { name: "HomeWise AI", exact: true }),
    ).toBeVisible();
    const first = dashboardCard(page, "Affordability");
    await expect(first.getByText("$2,900.00")).toBeVisible();
    const boxA = requireBox(await first.boundingBox());
    const boxB = requireBox(
      await dashboardCard(page, "Property Costs").boundingBox(),
    );
    expect(boxB.y).toBeGreaterThan(boxA.y + boxA.height);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
