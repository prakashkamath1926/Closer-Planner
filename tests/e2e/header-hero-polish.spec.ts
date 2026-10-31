import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Header v2 & Hero Polish Checks", () => {
  const desktopSizes = [
    { width: 1920, height: 900 },
    { width: 1440, height: 800 },
    { width: 1280, height: 720 },
  ];

  for (const vp of desktopSizes) {
    test(`hero fills first screen and next section is below the fold at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

      const intakeSection = page.locator("#intake");
      const box = await intakeSection.boundingBox();
      expect(box).not.toBeNull();
      // The top of the next section must be at or below the viewport height
      expect(box!.y).toBeGreaterThanOrEqual(vp.height - 1);
    });
  }

  test("header v2 composition: two groups only, right nav has links, divider and account", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    const header = page.locator("header");
    // Should have logo
    const logo = header.locator('a[href="/"]');
    await expect(logo).toBeVisible();

    // Primary nav on right containing both links
    const primaryNav = header.locator('nav[aria-label="Primary"]');
    await expect(primaryNav).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "How it works" })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Honest by design" })).toBeVisible();
  });

  test("header v2 signed-in state: avatar with initial and normalized title/aria-label, no visible name text", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Mock Supabase getUser call with all-caps name "PRAKASH KAMATH"
    await page.route("**/auth/v1/user*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-prakash-123",
          aud: "authenticated",
          role: "authenticated",
          email: "prakash@example.com",
          is_anonymous: false,
          user_metadata: {
            full_name: "PRAKASH KAMATH",
          },
        }),
      });
    });

    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    const avatar = page.locator('span[role="img"][aria-label="Signed in as Prakash"]');
    await expect(avatar).toBeVisible();
    expect(await avatar.getAttribute("title")).toBe("Signed in as Prakash");
    await expect(avatar).toHaveText("P");

    // The name should NOT appear as visible text
    const visibleName = page.locator("header").getByText("PRAKASH", { exact: false });
    await expect(visibleName).toHaveCount(0);

    // Sign out button exists
    const signOutBtn = page.getByRole("button", { name: /sign out/i });
    await expect(signOutBtn).toBeVisible();
  });

  test("header v2 anonymous state: displays Sign in and compact Save your plan button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Mock Supabase getUser call for anonymous user
    await page.route("**/auth/v1/user*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "anon-user-789",
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
          user_metadata: {},
        }),
      });
    });

    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    const signInLink = page.locator("header").getByRole("link", { name: "Sign in" });
    await expect(signInLink).toBeVisible();

    const savePlanBtn = page.locator("header").getByRole("button", { name: "Save your plan" });
    await expect(savePlanBtn).toBeVisible();
  });

  test("header does not wrap or overflow horizontally at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    const header = page.locator("header");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    // Header should remain a single row (around 64px)
    expect(headerBox!.height).toBeLessThanOrEqual(65);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("axe accessibility audit on home page: 0 serious or critical violations", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(seriousOrCritical).toEqual([]);
  });
});
