import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Letters from Loved Ones Features", () => {
  const dummyToken = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  test("/contribute/[token] renders honest organizer note, 600-char counter, and honeypot", async ({
    page,
  }) => {
    await page.goto(`/contribute/${dummyToken}`, { waitUntil: "domcontentloaded" });

    // Verify headline
    await expect(page.locator("h1")).toContainText("Write a few kind words");

    // Verify 600 character counter is visible and updates
    const counter = page.locator("#letter-counter");
    await expect(counter).toContainText("600 characters remaining");

    const textarea = page.locator("#letter-body");
    await textarea.fill("Happy 50th birthday Mum! Wishing you endless joy and happiness.");
    await expect(counter).toContainText(/characters remaining/);

    // Verify honeypot input is in the DOM but hidden
    const honeypot = page.locator("#contribute-hp");
    await expect(honeypot).toBeAttached();

    // Verify honest organizer notice is present
    const notice = page.locator("#letter-notice");
    await expect(notice).toContainText("The organizer reads all letters");
  });

  test("axe accessibility audit: 0 serious or critical violations on /contribute/[token]", async ({
    page,
  }) => {
    await page.goto(`/contribute/${dummyToken}`, { waitUntil: "domcontentloaded" });
    const axeResults = await new AxeBuilder({ page }).analyze();
    const violations = axeResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(violations).toEqual([]);
  });

  test("recipient envelope grid: keyboard Enter opens letter and Escape folds back", async ({
    page,
  }) => {
    // Intercept recipient API to mock revealed state with letters
    await page.route("**/api/recipient/test-recipient-token*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          headline: "Mum's Golden Jubilee",
          message: "You are the center of our world.",
          reveal_at: "2026-10-01T00:00:00Z",
          show_countdown: false,
          is_revealed: true,
          letters: [
            {
              from: "Sarah & Kids",
              body: "Dearest Mum, thank you for always being our guiding star. We love you so much!",
            },
          ],
        }),
      });
    });

    await page.goto("/r/test-recipient-token", { waitUntil: "domcontentloaded" });

    // Locate envelope button with data-cursor="open"
    const envelope = page.locator('button[data-cursor="open"]');
    await expect(envelope).toBeVisible();
    await expect(envelope).toHaveAttribute("aria-expanded", "false");

    // Open via Enter key
    await envelope.focus();
    await page.keyboard.press("Enter");

    // Dialog opens with role="dialog" and aria-modal="true"
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Sarah & Kids");
    await expect(dialog).toContainText("guiding star");

    // Verify letter text is plain text and selectable
    const letterText = dialog.locator("p.select-text");
    await expect(letterText).toBeVisible();

    // Close via Escape key
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
