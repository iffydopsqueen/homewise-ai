import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Appearance-theme coverage (T3d.3-I). Playwright isolates localStorage
// per test (fresh browser context), so theme selections here cannot leak
// into unrelated suites; tests needing a preset start from addInitScript.

// Exact body backgrounds derived from the palette hex values.
const BODY_BG = {
  natural: "rgb(250, 247, 241)",
  light: "rgb(255, 255, 255)",
  dark: "rgb(22, 19, 15)",
} as const;

type Theme = keyof typeof BODY_BG;

const LABELS = {
  income: "Monthly take-home income",
  proposed: "Proposed monthly housing cost",
  debts: "Existing monthly debt payments",
  expenses: "Other monthly living expenses",
  savings: "Available savings",
} as const;

const VALID_FINANCES: Record<keyof typeof LABELS, string> = {
  income: "8000",
  proposed: "2000",
  debts: "600",
  expenses: "2500",
  savings: "50000",
};

async function dataTheme(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

function themeRadio(page: Page, prefix: string, theme: Theme): Locator {
  return page.locator(`#${prefix}-${theme}`);
}

async function selectTheme(
  page: Page,
  prefix: string,
  theme: Theme,
): Promise<void> {
  await page.locator(`label[for="${prefix}-${theme}"]`).click();
  await expect(themeRadio(page, prefix, theme)).toBeChecked();
  expect(await dataTheme(page)).toBe(theme);
  expect(await bodyBackground(page)).toBe(BODY_BG[theme]);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

function collectConsoleErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(String(error));
  });
  return { errors };
}

test("defaults to Natural with no stored preference", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");
  expect(await dataTheme(page)).toBe("natural");
  expect(await bodyBackground(page)).toBe(BODY_BG.natural);
  await expect(
    page.getByRole("radiogroup", { name: "Appearance" }).first(),
  ).toBeVisible();
  await expect(themeRadio(page, "theme-desktop", "natural")).toBeChecked();
  await expect(themeRadio(page, "theme-desktop", "light")).not.toBeChecked();
  await expect(themeRadio(page, "theme-desktop", "dark")).not.toBeChecked();
  expect(consoleErrors.errors).toEqual([]);
});

test("explicit Light and Dark selections update tokens", async ({
  page,
}) => {
  await page.goto("/");
  await selectTheme(page, "theme-desktop", "light");
  await selectTheme(page, "theme-desktop", "dark");
});

test("Natural can be reselected after another theme", async ({ page }) => {
  await page.goto("/");
  await selectTheme(page, "theme-desktop", "dark");
  await selectTheme(page, "theme-desktop", "natural");
  expect(await bodyBackground(page)).toBe(BODY_BG.natural);
});

test("keyboard arrows move and select the theme", async ({ page }) => {
  await page.goto("/");
  await themeRadio(page, "theme-desktop", "natural").focus();
  // Native radio behavior: arrows move and select in one step.
  await page.keyboard.press("ArrowRight");
  await expect(themeRadio(page, "theme-desktop", "dark")).toBeChecked();
  expect(await dataTheme(page)).toBe("dark");
  expect(await bodyBackground(page)).toBe(BODY_BG.dark);
  await page.keyboard.press("ArrowLeft");
  await expect(themeRadio(page, "theme-desktop", "natural")).toBeChecked();
  expect(await dataTheme(page)).toBe("natural");
});

test("desktop selector is available with unique controls", async ({
  page,
}) => {
  await page.goto("/");
  for (const theme of ["light", "natural", "dark"] as const) {
    await expect(themeRadio(page, "theme-desktop", theme)).toBeVisible();
    // The mobile instance exists but stays hidden and unfocusable while
    // the hamburger menu is closed.
    await expect(themeRadio(page, "theme-mobile", theme)).toBeHidden();
  }
});

test("appearance preference survives reload", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");
  await selectTheme(page, "theme-desktop", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("homewise-theme")),
  ).toBe("dark");
  await page.reload();
  expect(await dataTheme(page)).toBe("dark");
  expect(await bodyBackground(page)).toBe(BODY_BG.dark);
  await expect(themeRadio(page, "theme-desktop", "dark")).toBeChecked();
  // Selected-state styling agrees with the checked radio.
  await expect(
    page.locator('label[for="theme-desktop-dark"] span'),
  ).toHaveClass(/bg-t-action/);
  await expect(
    page.locator('label[for="theme-desktop-natural"] span'),
  ).not.toHaveClass(/bg-t-action/);
  expect(
    consoleErrors.errors.filter((message) => /hydrat/i.test(message)),
  ).toEqual([]);
});

test("saved Light preference survives reload", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");
  await selectTheme(page, "theme-desktop", "light");
  await page.reload();
  expect(await dataTheme(page)).toBe("light");
  expect(await bodyBackground(page)).toBe(BODY_BG.light);
  await expect(themeRadio(page, "theme-desktop", "light")).toBeChecked();
  await expect(
    page.locator('label[for="theme-desktop-light"] span'),
  ).toHaveClass(/bg-t-action/);
  expect(
    consoleErrors.errors.filter((message) => /hydrat/i.test(message)),
  ).toEqual([]);
});

test("saved Natural preference survives reload", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.goto("/");
  await selectTheme(page, "theme-desktop", "dark");
  await selectTheme(page, "theme-desktop", "natural");
  await page.reload();
  expect(await dataTheme(page)).toBe("natural");
  expect(await bodyBackground(page)).toBe(BODY_BG.natural);
  await expect(themeRadio(page, "theme-desktop", "natural")).toBeChecked();
  expect(
    consoleErrors.errors.filter((message) => /hydrat/i.test(message)),
  ).toEqual([]);
});

test("invalid stored preference falls back safely", async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem("homewise-theme", "banana");
  });
  await page.goto("/");
  expect(await dataTheme(page)).toBe("natural");
  expect(await bodyBackground(page)).toBe(BODY_BG.natural);
  await expect(themeRadio(page, "theme-desktop", "natural")).toBeChecked();
  expect(consoleErrors.errors).toEqual([]);
});

test("theme change preserves calculations and sends no AI request", async ({
  page,
}) => {
  let explainCalls = 0;
  await page.route("**/api/explain", async (route) => {
    explainCalls += 1;
    await route.abort();
  });
  await page.goto("/affordability");
  for (const [key, label] of Object.entries(LABELS)) {
    await page
      .getByLabel(label)
      .fill(VALID_FINANCES[key as keyof typeof LABELS]);
  }
  await page.getByRole("button", { name: "Check affordability" }).click();
  const heading = page.getByRole("heading", {
    name: "Your affordability snapshot",
  });
  await expect(heading).toBeVisible();
  const urlBefore = page.url();
  await selectTheme(page, "theme-desktop", "dark");
  // No navigation, no retirement, no explanation request.
  expect(page.url()).toBe(urlBefore);
  await expect(heading).toBeVisible();
  await expect(page.getByLabel(LABELS.income)).toHaveValue("8000");
  expect(explainCalls).toBe(0);
});

test.describe("mobile theme selector", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("selector lives inside the hamburger menu", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(themeRadio(page, "theme-desktop", "natural")).toBeHidden();
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    for (const theme of ["light", "natural", "dark"] as const) {
      await expect(themeRadio(page, "theme-mobile", theme)).toBeVisible();
    }
    await selectTheme(page, "theme-mobile", "dark");
    // Choosing a theme is a setting, not navigation: the menu stays open.
    await expect(
      nav.getByRole("button", { name: "Close navigation menu" }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("no overflow at 320px with menu open or closed", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    expect(await horizontalOverflow(page)).toBe(0);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(themeRadio(page, "theme-mobile", "natural")).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await selectTheme(page, "theme-mobile", "light");
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("mobile selector reflects the restored theme after reload", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("homewise-theme", "dark");
    });
    await page.goto("/");
    expect(await dataTheme(page)).toBe("dark");
    expect(await bodyBackground(page)).toBe(BODY_BG.dark);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(themeRadio(page, "theme-mobile", "dark")).toBeChecked();
    await expect(
      page.locator('label[for="theme-mobile-dark"] span'),
    ).toHaveClass(/bg-t-action/);
  });
});
