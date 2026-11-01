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

test.describe("Production CSP Verification", () => {
  let occasionId: string;
  const dummyToken = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  test.beforeEach(async ({ page }) => {
    occasionId = getOccasionId();

    // Attach securitypolicyviolation event listener before page scripts run
    await page.addInitScript(() => {
      (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
      window.addEventListener("securitypolicyviolation", (e) => {
        (window as unknown as { __cspViolations: unknown[] }).__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          originalPolicy: e.originalPolicy,
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber,
        });
      });
    });
  });

  test("comprehensive click-through produces zero CSP violations and zero 'Refused to' errors", async ({
    page,
  }) => {
    const cspErrors: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("Refused to") ||
        text.includes("violates the following Content Security Policy directive")
      ) {
        cspErrors.push(`[Console Error] ${text}`);
      }
    });

    const assertNoCspViolations = async (stepName: string) => {
      const recorded = await page.evaluate(
        () => (window as unknown as { __cspViolations?: unknown[] }).__cspViolations || []
      );
      if (recorded.length > 0) {
        cspErrors.push(
          ...recorded.map((r) => `[Violation Event at ${stepName}] ${JSON.stringify(r)}`)
        );
      }
      expect(cspErrors, `CSP violations detected at step: ${stepName}`).toEqual([]);
    };

    // 1. Home Page (/)
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await assertNoCspViolations("Home Page");

    // 2. Intake Flow (/intake) & Feature-detected Voice Button
    await page.goto("/intake", { waitUntil: "domcontentloaded" });
    const voiceBtn = page.locator('button[aria-label*="voice" i], button[title*="voice" i]').first();
    if (await voiceBtn.isVisible()) {
      await voiceBtn.click();
      await page.waitForTimeout(300);
    }
    await assertNoCspViolations("Intake Page & Voice");

    // 3. Ideas Screen (/ideas)
    await page.goto("/intake", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const testIdeas = [
        {
          id: "idea-test-1",
          title: "Intimate Courtyard Dinner",
          description: "A private chef dinner in a candlelit courtyard.",
          whyItSuitsThem: "Loves quiet culinary experiences.",
          activities: ["Private Chef", "Live Cello"],
          estimatedCostMin: 15000,
          estimatedCostMax: 25000,
          currency: "INR",
          requiredTime: "3 hours",
          urgencyMode: "weeks_away",
          facts: [],
          items: [],
        },
      ];
      sessionStorage.setItem("celebration_ideas", JSON.stringify(testIdeas));
      sessionStorage.setItem(
        "celebration_intake_payload",
        JSON.stringify({
          entryPath: "have_idea",
          occasionType: "Anniversary",
          budgetTotal: 25000,
          currency: "INR",
        })
      );
    });
    await page.goto("/ideas", { waitUntil: "domcontentloaded" });
    await assertNoCspViolations("Ideas Page");

    // 4. Plan Page (/plan/:id) & Every Tab
    await page.goto(`/plan/${occasionId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tablist"]', { timeout: 15000 });
    await assertNoCspViolations("Plan Page (Plan Tab)");

    // Tab: Vendors
    const vendorsTab = page.locator("#tab-vendors");
    await vendorsTab.click();
    await page.waitForSelector("#panel-vendors", { timeout: 10000 });
    await assertNoCspViolations("Plan Page (Vendors Tab)");

    // 5. Vendor Quote Modal
    const quoteParseBtn = page.locator('button:has-text("Parse"), button:has-text("Quote")').first();
    if (await quoteParseBtn.isVisible()) {
      await quoteParseBtn.click();
      await page.waitForTimeout(400);
      const closeBtn = page.locator('button[aria-label="Close"], button:has-text("Cancel")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }
    await assertNoCspViolations("Vendor Quote Modal");

    // Tab: Timeline & In-App Alert Sound
    const timelineTab = page.locator("#tab-timeline");
    await timelineTab.click();
    await page.waitForSelector("#panel-timeline", { timeout: 10000 });

    // Trigger in-app alert sound via Web Audio API chime
    await page.evaluate(() => {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
    });
    await assertNoCspViolations("Timeline Tab & Audio Chime");

    // Tab: Surprise
    const surpriseTab = page.locator("#tab-surprise");
    await surpriseTab.click();
    await page.waitForSelector("#panel-surprise", { timeout: 10000 });
    await assertNoCspViolations("Plan Page (Surprise Tab)");

    // Tab: Blend
    const blendTab = page.locator("#tab-blend");
    await blendTab.click();
    await page.waitForSelector("#panel-blend", { timeout: 10000 });
    await assertNoCspViolations("Plan Page (Blend Tab)");

    // Tab: Invitation & PNG Export
    const invitationTab = page.locator("#tab-invitation");
    await invitationTab.click();
    await page.waitForSelector("#panel-invitation", { timeout: 10000 });

    // 6. Run Invitation PNG Export
    const exportPngBtn = page.locator('button:has-text("Export PNG Image")');
    if (await exportPngBtn.isVisible()) {
      await exportPngBtn.click();
      // Allow html-to-image canvas rasterization and data/blob URL generation
      await page.waitForTimeout(1000);
    }
    await assertNoCspViolations("Invitation Section & PNG Export");

    // 7. Letters Envelope Open/Close on Recipient Page
    await page.route("**/api/recipient/test-csp-token*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          headline: "Golden Anniversary Celebration",
          message: "A heartfelt gathering.",
          reveal_at: "2026-10-01T00:00:00Z",
          show_countdown: false,
          is_revealed: true,
          letters: [
            {
              from: "Family",
              body: "Warmest wishes on your special celebration!",
            },
          ],
        }),
      });
    });

    await page.goto("/r/test-csp-token", { waitUntil: "domcontentloaded" });
    const envelopeBtn = page.locator('button[data-cursor="open"]').first();
    if (await envelopeBtn.isVisible()) {
      await envelopeBtn.click();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    await assertNoCspViolations("Recipient Page & Letters Envelope Open/Close");

    // 8. AI Settings Dialog
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const aiSettingsBtn = page.locator('button:has-text("AI settings")').first();
    if (await aiSettingsBtn.isVisible()) {
      await aiSettingsBtn.click();
      await page.waitForTimeout(400);
      const closeAiModal = page.locator('button[aria-label="Close"]').first();
      if (await closeAiModal.isVisible()) {
        await closeAiModal.click();
      }
    }
    await assertNoCspViolations("AI Settings Dialog");

    // 9. Contribute Page (/contribute/[token])
    await page.goto(`/contribute/${dummyToken}`, { waitUntil: "domcontentloaded" });
    await assertNoCspViolations("Contribute Page");

    // 10. Login (/login) and Signup (/signup)
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await assertNoCspViolations("Login Page");

    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await assertNoCspViolations("Signup Page");

    // Final assertion across entire session
    expect(cspErrors).toEqual([]);
  });
});
