import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Custom Cursor (Dot + Lagging Ring)", () => {
  test("is not activated and renders nothing when prefers-reduced-motion is reduce", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Simulate mouse move
    await page.mouse.move(200, 200);
    await page.waitForTimeout(200);

    // Custom cursor class must not be on html
    const hasActiveClass = await page.evaluate(() =>
      document.documentElement.classList.contains("custom-cursor-active")
    );
    expect(hasActiveClass).toBe(false);

    // Axe audit still 0 serious or critical
    const axeResults = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = axeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(seriousOrCritical).toEqual([]);
  });

  test("activates on desktop fine pointer mousemove, and retains native cursor over inputs", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Move mouse to trigger activation
    await page.mouse.move(300, 300);
    await page.waitForTimeout(300);

    const hasActiveClass = await page.evaluate(() =>
      document.documentElement.classList.contains("custom-cursor-active")
    );
    expect(hasActiveClass).toBe(true);

    // Verify custom cursor element is rendered with aria-hidden="true"
    const cursor = page.locator('div[aria-hidden="true"].pointer-events-none.fixed.inset-0');
    await expect(cursor).toBeAttached();

    // Verify native cursor is not hidden over inputs
    const input = page.locator("#recipient-name-input");
    await input.scrollIntoViewIfNeeded();
    const box = await input.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200);

      // Verify custom cursor container sets opacity to 0 over native inputs
      const cursorOpacity = await cursor.evaluate(
        (el) => window.getComputedStyle(el).opacity
      );
      expect(cursorOpacity).toBe("0");
    }

    // Axe audit passes with 0 serious or critical violations
    const axeResults = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = axeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(seriousOrCritical).toEqual([]);
  });
});

