import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Voice Intake & Speech Recognition Feature", () => {
  test("mic button is absent when browser lacks SpeechRecognition API; text path works normally", async ({
    page,
  }) => {
    // Simulate browser without SpeechRecognition API (e.g. Firefox)
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
      delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#intake");
    await page.waitForTimeout(500);

    const micButton = page.locator('button[aria-label="Speak it with voice"]');
    await expect(micButton).toHaveCount(0);

    // Text path works normally
    const recipientInput = page.locator("#recipient-name-input");
    await expect(recipientInput).toBeVisible();
    await recipientInput.fill("Kavya");
    await expect(recipientInput).toHaveValue("Kavya");
  });

  test("when SpeechRecognition API is supported, mic button renders with proper accessibility and toggle behavior", async ({
    page,
  }) => {
    // Inject mock SpeechRecognition before document loads
    await page.addInitScript(() => {
      class MockSpeech {
        continuous = false;
        interimResults = false;
        lang = "en-US";
        onstart: (() => void) | null = null;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;

        start() {
          setTimeout(() => {
            if (this.onstart) this.onstart();
          }, 30);
        }
        stop() {
          setTimeout(() => {
            if (this.onend) this.onend();
          }, 30);
        }
        abort() {
          setTimeout(() => {
            if (this.onend) this.onend();
          }, 30);
        }
      }
      (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeech;
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#intake");
    await page.waitForTimeout(500);

    const micButton = page.locator('button[aria-label="Speak it with voice"]');
    await expect(micButton).toBeVisible();
    await expect(micButton).toHaveAttribute("aria-pressed", "false");

    // Language toggle "EN" is visible and toggles to "HI"
    const langToggle = page.locator('button[aria-label*="spoken language"]');
    await expect(langToggle).toBeVisible();
    await expect(langToggle).toHaveText("EN");
    await langToggle.click();
    await expect(langToggle).toHaveText("HI");

    // Click to start listening
    await micButton.click();
    const stopButton = page.locator('button[aria-label="Stop Voice input"]');
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).toHaveAttribute("aria-pressed", "true");

    // Press Escape to stop listening (accessibility requirement)
    await page.keyboard.press("Escape");
    await expect(micButton).toHaveAttribute("aria-pressed", "false", { timeout: 5000 });

    // Privacy info button toggles the high-contrast popover dialog
    const infoButton = page.locator('button[aria-label*="Speech privacy"]');
    await expect(infoButton).toBeVisible();
    await infoButton.click();
    const privacyDialog = page.locator('div[role="dialog"][aria-label="Speech Privacy"]');
    await expect(privacyDialog).toBeVisible();
    await expect(privacyDialog).toContainText("Speech is processed by your browser; we only store the text.");
    await page.locator('button[aria-label="Close privacy notice"]').click();
    await expect(privacyDialog).toHaveCount(0);

    // Axe accessibility audit on the intake section
    const axeResults = await new AxeBuilder({ page })
      .include("#intake")
      .analyze();

    const seriousOrCritical = axeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(seriousOrCritical).toEqual([]);
  });
});
