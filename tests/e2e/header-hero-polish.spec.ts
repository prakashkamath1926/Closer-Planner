import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Header & Hero Polish Checks", () => {
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
