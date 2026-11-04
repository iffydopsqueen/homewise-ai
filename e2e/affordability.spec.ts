import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const LABELS = {
  income: "Monthly take-home income",
  proposed: "Proposed monthly housing cost",
  debts: "Existing monthly debt payments",
  expenses: "Other monthly living expenses",
  savings: "Available savings",
} as const;

async function fillFinances(
  page: Page,
  values: Record<keyof typeof LABELS, string>,
) {
  for (const [key, label] of Object.entries(LABELS)) {
    await page.getByLabel(label).fill(values[key as keyof typeof LABELS]);
  }
}

const VALID_FINANCES: Record<keyof typeof LABELS, string> = {
  income: "8000",
  proposed: "2000",
  debts: "600",
  expenses: "2500",
  savings: "50000",
};

function requireBox<T>(box: T | null): T {
  if (box === null) {
    throw new Error("Expected element to have a bounding box");
  }
  return box;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function submitValidFinances(page: Page): Promise<void> {
  await page.goto("/affordability");
  await fillFinances(page, VALID_FINANCES);
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
}

test("affordability journey shows verified figures with provenance", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillFinances(page, {
    income: "8000",
    proposed: "2000",
    debts: "600",
    expenses: "2500",
    savings: "50000",
  });
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  // Dashboard KPIs surface top-level figures; full rows live in the disclosure.
  await expect(page.getByText("Money left each month")).toBeVisible();
  await expect(page.getByText("$2,900.00").first()).toBeVisible();
  await expect(page.getByText("Remaining monthly income").first()).toBeVisible();
  await expect(page.getByText("Housing-to-income ratio").first()).toBeVisible();
  await expect(page.getByText("25%").first()).toBeVisible();
  await expect(page.getByText("Savings cushion").first()).toBeVisible();
  await expect(page.getByText("9.8 months").first()).toBeVisible();
  await page.getByText("View detailed breakdown").click();
  await expect(page.getByText("$5,100.00").first()).toBeVisible();
  await expect(page.getByText("63.75%").first()).toBeVisible();
  await expect(page.getByText("Calculated").first()).toBeVisible();
  await expect(page.getByText("User-provided").first()).toBeVisible();
  await expect(page.getByText("Educational use only.")).toBeVisible();
});

test("invalid input shows field errors without results", async ({ page }) => {
  await page.goto("/affordability");
  await fillFinances(page, {
    income: "abc",
    proposed: "2000",
    debts: "600",
    expenses: "2500",
    savings: "50000",
  });
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(page.getByText("Enter a valid dollar amount")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeHidden();
});

test("empty submit requires every amount", async ({ page }) => {
  await page.goto("/affordability");
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(page.getByText("Enter an amount.")).toHaveCount(5);
});

test("zero obligations render an explicit not-applicable cushion", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillFinances(page, {
    income: "5000",
    proposed: "0",
    debts: "0",
    expenses: "0",
    savings: "1000",
  });
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  await expect(page.getByText("Not applicable").first()).toBeVisible();
  await expect(page.getByText("$5,000.00").first()).toBeVisible();
});

test("desktop shows form and results side by side, centered", async ({
  page,
}) => {
  await submitValidFinances(page);
  const submitBox = requireBox(
    await page
      .getByRole("button", { name: "Check affordability" })
      .boundingBox(),
  );
  const resultsBox = requireBox(
    await page
      .getByRole("heading", { name: "Your affordability snapshot" })
      .boundingBox(),
  );
  // Side by side: results start right of the form and overlap it vertically.
  expect(resultsBox.x).toBeGreaterThan(submitBox.x + submitBox.width);
  expect(resultsBox.y).toBeLessThan(submitBox.y + submitBox.height);
  // Centered: main content has equal gutters on both sides.
  const mainBox = requireBox(await page.locator("main").boundingBox());
  const viewport = requireBox(page.viewportSize());
  const leftGutter = mainBox.x;
  const rightGutter = viewport.width - (mainBox.x + mainBox.width);
  expect(Math.abs(leftGutter - rightGutter)).toBeLessThan(2);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("income allocation chart shows verified legend amounts", async ({
  page,
}) => {
  await submitValidFinances(page);
  await expect(
    page.getByRole("heading", { name: "Income allocation" }),
  ).toBeVisible();
  // Scoped to the allocation section: Financial Insights renders its own
  // housing-share bar and amounts further down the page.
  const allocation = page.getByRole("region", { name: "Income allocation" });
  // Legend carries every segment amount; the bar itself is labelled.
  await expect(allocation.getByText("Housing", { exact: true })).toBeVisible();
  await expect(allocation.getByText("$2,000.00")).toBeVisible();
  await expect(allocation.getByText("Debts", { exact: true })).toBeVisible();
  await expect(allocation.getByText("$600.00")).toBeVisible();
  await expect(
    allocation.getByText("Living expenses", { exact: true }),
  ).toBeVisible();
  await expect(allocation.getByText("$2,500.00")).toBeVisible();
  await expect(
    allocation.getByText("Remaining", { exact: true }),
  ).toBeVisible();
  await expect(
    allocation.getByRole("img", { name: "Housing $2,000.00" }),
  ).toBeVisible();
});

test("detailed breakdown disclosure toggles the full calculation list", async ({
  page,
}) => {
  await submitValidFinances(page);
  const toggle = page.getByText("View detailed breakdown");
  await expect(
    page.getByText("Total monthly obligations"),
  ).toBeHidden();
  await toggle.click();
  await expect(
    page.getByText("Total monthly obligations"),
  ).toBeVisible();
  await expect(page.getByText("$5,100.00").first()).toBeVisible();
  await toggle.click();
  await expect(
    page.getByText("Total monthly obligations"),
  ).toBeHidden();
});

test("shortfall renders a factual shortfall with an income marker", async ({
  page,
}) => {
  await page.goto("/affordability");
  await fillFinances(page, {
    income: "3000",
    proposed: "2000",
    debts: "600",
    expenses: "2500",
    savings: "50000",
  });
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(
    page.getByRole("heading", { name: "Your affordability snapshot" }),
  ).toBeVisible();
  await expect(page.getByText("Shortfall").first()).toBeVisible();
  await expect(page.getByText("-$2,100.00").first()).toBeVisible();
  await expect(
    page.getByText("Obligations exceed income by $2,100.00 each month."),
  ).toBeVisible();
  const snapshot = page.getByRole("region", {
    name: "Your affordability snapshot",
  });
  await expect(
    snapshot.getByText(/^Monthly take-home income:/),
  ).toBeVisible();
  // No negative-width segment: the legend carries no Remaining entry.
  await expect(page.getByText("Remaining", { exact: true })).toHaveCount(0);
  // Full signed figures remain available in the disclosure.
  await page.getByText("View detailed breakdown").click();
  await expect(page.getByText("-$2,100.00").first()).toBeVisible();
});

test("break-even residual states that nothing remains", async ({ page }) => {
  await page.goto("/affordability");
  await fillFinances(page, {
    income: "5100",
    proposed: "2000",
    debts: "600",
    expenses: "2500",
    savings: "50000",
  });
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await expect(
    page.getByText("Nothing remains after listed obligations"),
  ).toBeVisible();
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacks form above results with no horizontal overflow", async ({
    page,
  }) => {
    await submitValidFinances(page);
    await expect(page.getByText("Money left each month")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Income allocation" }),
    ).toBeVisible();
    const submitBox = requireBox(
      await page
        .getByRole("button", { name: "Check affordability" })
        .boundingBox(),
    );
    const resultsBox = requireBox(
      await page
        .getByRole("heading", { name: "Your affordability snapshot" })
        .boundingBox(),
    );
    // Stacked: results start below the form, aligned to the same left edge.
    expect(resultsBox.y).toBeGreaterThan(submitBox.y + submitBox.height);
    expect(Math.abs(resultsBox.x - submitBox.x)).toBeLessThan(2);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
