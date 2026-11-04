import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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

test("desktop navigation centers its links", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const navBox = requireBox(await nav.boundingBox());
  const firstBox = requireBox(
    await nav.getByRole("link", { name: "Dashboard", exact: true }).boundingBox(),
  );
  const lastBox = requireBox(
    await nav
      .getByRole("link", { name: "Compare Properties", exact: true })
      .boundingBox(),
  );
  const leftGap = firstBox.x - navBox.x;
  const rightGap = navBox.x + navBox.width - (lastBox.x + lastBox.width);
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);
  expect(await horizontalOverflow(page)).toBe(0);
});

test("keyboard Enter on a nav link navigates", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const link = nav.getByRole("link", { name: "Affordability", exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Affordability", exact: true }),
  ).toBeVisible();
});

test.describe("mobile hamburger menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("menu starts closed with brand and hamburger visible", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(
      nav.getByRole("link", { name: "HomeWise AI" }),
    ).toBeVisible();
    const button = nav.getByRole("button", { name: "Open navigation menu" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveAttribute("aria-controls", "primary-nav-list");
    for (const { label } of LINKS) {
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeHidden();
    }
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("menu opens, exposes all destinations, and closes", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    const closeButton = nav.getByRole("button", {
      name: "Close navigation menu",
    });
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");
    for (const { label } of LINKS) {
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
    expect(await horizontalOverflow(page)).toBe(0);
    await closeButton.click();
    await expect(
      nav.getByRole("button", { name: "Open navigation menu" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).toBeHidden();
  });

  test("navigating through the menu closes it", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    await nav
      .getByRole("link", { name: "Compare Properties", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Compare properties", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Open navigation menu" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).toBeHidden();
  });

  test("Escape closes the menu and restores focus to the button", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    const closeButton = nav.getByRole("button", {
      name: "Close navigation menu",
    });
    await expect(closeButton).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    const openButton = nav.getByRole("button", {
      name: "Open navigation menu",
    });
    await expect(openButton).toHaveAttribute("aria-expanded", "false");
    await expect(openButton).toBeFocused();
  });

  test("menu button toggles by keyboard", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const button = nav.getByRole("button", { name: /navigation menu/ });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(
      nav.getByRole("button", { name: "Close navigation menu" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    await page.keyboard.press(" ");
    await expect(
      nav.getByRole("button", { name: "Open navigation menu" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  test("active page stays marked inside the menu", async ({ page }) => {
    await page.goto("/compare");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(
      nav.getByRole("link", { name: "Compare Properties", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("menu works with no overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    expect(await horizontalOverflow(page)).toBe(0);
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    for (const { label } of LINKS) {
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
    expect(await horizontalOverflow(page)).toBe(0);
    await nav
      .getByRole("link", { name: "Affordability", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Affordability", exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test("hamburger button is hidden on desktop", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /navigation menu/ }),
  ).toBeHidden();
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

test("workflow intros disclose the optional Meta explanation accurately", async ({
  page,
}) => {
  const intros = [
    { href: "/affordability", lead: "Enter your finances below." },
    { href: "/property-costs", lead: "Enter the purchase and ongoing costs." },
    { href: "/compare", lead: "Enter each property below." },
  ] as const;
  for (const { href, lead } of intros) {
    await page.goto(href);
    await expect(page.getByText(lead)).toBeVisible();
    await expect(
      page.getByText(
        "only the optional AI explanation sends them to Meta.",
      ),
    ).toBeVisible();
    await expect(page.getByText("own calculator")).toHaveCount(0);
  }
});
