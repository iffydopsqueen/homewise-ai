import { expect, test } from "@playwright/test";

test("homepage shows the HomeWise AI heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HomeWise AI" })).toBeVisible();
});
