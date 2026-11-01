import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

function getOccasionId(): string {
  const occasionFile = path.resolve("playwright/test-occasion.json");
  if (fs.existsSync(occasionFile)) {
    const data = JSON.parse(fs.readFileSync(occasionFile, "utf8"));
    return data.occasionId;
  }
  return "11111111-1111-4111-a111-111111111111";
}

test.describe("Trade-Off Flow, Client Idempotency Key & In-Flight Protection", () => {
  let occasionId: string;

  test.beforeEach(async ({ page }) => {
    occasionId = getOccasionId();
    await page.goto(`/plan/${occasionId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"]', { timeout: 15000 });
  });

  test("lower budget and move date earlier -> trade-offs appear -> in-flight disabled -> pick one -> summary shows -> undo restores", async ({
    page,
  }) => {
    // 1. Mock AI changes propose route
    await page.route("**/api/changes/propose", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tradeoffs: {
            options: [
              {
                id: "opt-acoustic-1",
                title: "Streamline Decor & Acoustic Timing",
                description: "Shift event earlier and focus budget on core acoustic performance.",
                tradeoffCost: 12000,
                riskLevel: "low",
                addedItems: [],
                removedItemIds: [],
                modifiedItems: [],
              },
            ],
            analysisSummary: "Adjusted constraints successfully analyzed.",
            source: "ai",
          },
        }),
      });
    });

    // 2. Mock change apply route with delay to test in-flight button disable & idempotencyKey
    let applyCalls = 0;
    let receivedIdempotencyKey = "";

    await page.route("**/api/changes/apply", async (route) => {
      applyCalls++;
      const postData = route.request().postDataJSON();
      receivedIdempotencyKey = postData?.idempotencyKey || "";

      // Hold in flight for 600ms so we can assert disabled state and attempt duplicate clicks
      await new Promise((resolve) => setTimeout(resolve, 600));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          changeSummary: "Streamline Decor & Acoustic Timing applied",
          versionNo: 2,
        }),
      });
    });

    // 3. Mock restore route
    let restoreCalled = false;
    await page.route("**/api/versions/restore", async (route) => {
      restoreCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // 4. Click Adjust Plan button
    const adjustBtn = page.locator("button", { hasText: "Adjust Plan" });
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    // 5. Fill lower budget and earlier date in ChangeModal
    const budgetInput = page.locator('input[type="number"][placeholder*="650000"]');
    await expect(budgetInput).toBeVisible();
    await budgetInput.fill("12000");

    const dateInput = page.locator('input[type="datetime-local"]');
    await expect(dateInput).toBeVisible();
    await dateInput.fill("2026-11-10T17:00");

    // 6. Submit Find AI Trade-Offs
    const findTradeoffsBtn = page.locator('button[type="submit"]', { hasText: "Find AI Trade-Offs" });
    await findTradeoffsBtn.click();

    // 7. Verify TradeoffSelector modal opens with proposed option
    const optionCard = page.locator("text=Streamline Decor & Acoustic Timing");
    await expect(optionCard).toBeVisible({ timeout: 10000 });

    // Pick the option
    await optionCard.click();

    const applyBtn = page.locator('[data-testid="apply-tradeoff-button"]');
    await expect(applyBtn).toBeEnabled();

    // 8. Click Apply and immediately verify button is disabled while in flight
    await applyBtn.click({ noWaitAfter: true });

    // Assert button is disabled and reflects in-flight status
    await expect(applyBtn).toBeDisabled();
    await expect(applyBtn).toHaveText(/Applying & Saving Snapshot/i);

    // Attempt repeat click while in-flight
    await applyBtn.click({ force: true, noWaitAfter: true }).catch(() => {});

    // Wait for the reload triggered on apply to finish
    await page.waitForURL(`**/plan/${occasionId}*`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"]', { timeout: 15000 });

    // Assert only 1 apply request was dispatched (repeat click ignored)
    expect(applyCalls).toBe(1);

    // Assert a valid UUID idempotencyKey was generated and sent
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(receivedIdempotencyKey).toMatch(uuidRegex);

    // 9. Verify change summary notification shows on plan view
    const changeSummaryBanner = page.locator("text=Streamline Decor & Acoustic Timing applied");
    await expect(changeSummaryBanner).toBeVisible({ timeout: 10000 });

    // 10. Click Undo Change and assert restore was invoked
    const undoBtn = page.locator("button", { hasText: "Undo Change" });
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    await expect.poll(() => restoreCalled).toBe(true);
  });
});
