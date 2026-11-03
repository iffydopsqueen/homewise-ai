import { expect, test } from "@playwright/test";

const LINKS = [
  { label: "Dashboard", href: "/", heading: "HomeWise AI" },
  { label: "Affordability", href: "/affordability", heading: "Affordability" },
  {
    label: "Property Costs",
    href: "/property-costs",
    heading: "Property costs",
  },
  { label: "Compare Properties", href: "/compare", heading: "Compare properties" },
] as const;

test("primary navigation renders on every page without What-If", async ({
  page,
}) => {
  for (const { href } of LINKS) {
    await page.goto(href);
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const { label } of LINKS) {
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
    await expect(nav.getByText("What-If")).toHaveCount(0);
  }
});

test("navigation links move between workflows", async ({ page }) => {
  await page.goto("/");
  for (const { label, heading } of LINKS.slice(1)) {
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
});

test("active navigation link is marked current", async ({ page }) => {
  await page.goto("/property-costs");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(
    nav.getByRole("link", { name: "Property Costs", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("dashboard lists workflows with links and session note", async ({
  page,
}) => {
  await page.goto("/");
  for (const { label, href } of LINKS.slice(1)) {
    const card = page.getByRole("region", { name: label });
    await expect(card.getByText("Not started yet.")).toBeVisible();
    await expect(
      card.getByRole("link", { name: `Go to ${label}` }),
    ).toHaveAttribute("href", href);
  }
  await expect(
    page.getByText("Results stay in this browser session"),
  ).toBeVisible();
});
