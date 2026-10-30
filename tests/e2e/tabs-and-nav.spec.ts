import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as fs from "fs";
import * as path from "path";

function getOccasionId(): string {
  const occasionFile = path.resolve("playwright/test-occasion.json");
  const data = JSON.parse(fs.readFileSync(occasionFile, "utf8"));
  return data.occasionId;
}

test.describe("Planner Layout, Sticky Summary Strip & Keyboard Tabs", () => {
  let occasionId: string;

  test.beforeEach(async ({ page }) => {
    occasionId = getOccasionId();
    await page.goto(`/plan/${occasionId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"]', { timeout: 15000 });
  });

  test("sticky summary strip remains visible during scroll", async ({ page }) => {
    const summaryStrip = page.locator("#sticky-summary-strip");
    await expect(summaryStrip).toBeVisible();

    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(300);

    await expect(summaryStrip).toBeVisible();
    const boundingBox = await summaryStrip.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.y).toBeLessThanOrEqual(50);
    }

    const nextStepBtn = summaryStrip.locator("button", { hasText: /Next Step:/i });
    if (await nextStepBtn.isVisible()) {
      await expect(nextStepBtn).toBeEnabled();
    }
  });

  test("keyboard navigation across tabs with ArrowRight, ArrowLeft, Home, End", async ({ page }) => {
    const planTab = page.locator('#tab-plan');
    const vendorsTab = page.locator('#tab-vendors');
    const timelineTab = page.locator('#tab-timeline');
    const invitationTab = page.locator('#tab-invitation');

    await expect(planTab).toHaveAttribute("aria-selected", "true");

    await planTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(vendorsTab).toHaveAttribute("aria-selected", "true");
    await expect(planTab).toHaveAttribute("aria-selected", "false");
    await expect(page.locator('#panel-vendors')).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(timelineTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#panel-timeline')).toBeVisible();

    await page.keyboard.press("End");
    await expect(invitationTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#panel-invitation')).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(planTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#panel-plan')).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(invitationTab).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Home");
    await expect(planTab).toHaveAttribute("aria-selected", "true");
  });

  test("URL parameter updates and persists on refresh (?tab=vendors)", async ({ page }) => {
    const vendorsTab = page.locator('#tab-vendors');
    await vendorsTab.click();

    await expect(page).toHaveURL(/tab=vendors/);
    await expect(page.locator('#panel-vendors')).toBeVisible();

    await page.goto(`/plan/${occasionId}?tab=timeline`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('#tab-timeline')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#panel-timeline')).toBeVisible();
  });
});

test.describe("Axe Accessibility Audit (0 serious/critical violations)", () => {
  const tabs = ["plan", "vendors", "timeline", "surprise", "blend", "invitation"] as const;

  for (const tab of tabs) {
    test(`axe audit on '${tab}' tab has 0 serious or critical violations`, async ({ page }) => {
      const occasionId = getOccasionId();
      await page.goto(`/plan/${occasionId}?tab=${tab}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(`#panel-${tab}`, { timeout: 15000 });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const seriousOrCritical = accessibilityScanResults.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );

      if (seriousOrCritical.length > 0) {
        console.error(`Axe violations on tab '${tab}':`, JSON.stringify(seriousOrCritical, null, 2));
      }

      expect(seriousOrCritical).toEqual([]);
    });
  }
});
