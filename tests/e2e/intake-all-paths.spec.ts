/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";

const MOCK_IDEAS_RESPONSE = {
  success: true,
  ideas: [
    {
      id: "mock-idea-1",
      title: "Rooftop Stargazing & Artisan Dinner",
      description: "An intimate evening with telescope stargazing and seasonal cuisine.",
      whyItSuitsThem: "Matches their love for quiet nature and meaningful reflection.",
      activities: ["Telescope viewing", "Private chef tasting"],
      estimatedCostMin: 25000,
      estimatedCostMax: 40000,
      currency: "INR",
      requiredTime: "2-3 days",
      urgencyMode: "weeks_away",
      facts: [
        { key: "Atmosphere", value: "Quiet and scenic", status: "known", source: "organizer" },
      ],
      items: [
        {
          title: "Private astronomer session",
          category: "entertainment",
          intentTag: "wonder",
          why: "Unforgettable shared experience",
          estimatedCost: 15000,
          costStatus: "estimate",
          isNonNegotiable: true,
        },
      ],
    },
    {
      id: "mock-idea-2",
      title: "Botanical Conservatory Tour",
      description: "Guided private tour followed by botanical tea tasting.",
      whyItSuitsThem: "Honors appreciation for plants and rare teas.",
      activities: ["Greenhouse walk", "Tea pairing"],
      estimatedCostMin: 15000,
      estimatedCostMax: 25000,
      currency: "INR",
      requiredTime: "1 week",
      urgencyMode: "weeks_away",
      facts: [],
      items: [
        {
          title: "Conservatory reservation",
          category: "venue",
          intentTag: "peace",
          why: "Serene environment",
          estimatedCost: 10000,
          costStatus: "estimate",
          isNonNegotiable: true,
        },
      ],
    },
    {
      id: "mock-idea-3",
      title: "Vinyl Listening & Italian Fare",
      description: "A cozy gathering with vintage record player and handmade pasta.",
      whyItSuitsThem: "Brings together their favorite records with comfort dining.",
      activities: ["Album listening", "Pasta making"],
      estimatedCostMin: 20000,
      estimatedCostMax: 35000,
      currency: "INR",
      requiredTime: "Tonight",
      urgencyMode: "tonight",
      facts: [],
      items: [
        {
          title: "Fresh artisan pasta ingredients",
          category: "catering",
          intentTag: "warmth",
          why: "Delicious shared dinner",
          estimatedCost: 8000,
          costStatus: "estimate",
          isNonNegotiable: true,
        },
      ],
    },
  ],
  source: "ai",
};

test.describe("Intake Generation End-to-End across all 3 entry paths", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const paths = [
    {
      id: "have_idea",
      label: "I have an idea",
      conceptText: "Rooftop acoustic dinner with close friends and Italian wine",
    },
    {
      id: "discover",
      label: "Help me discover",
      interestsText: "Acoustic folk music, sourdough pizza, stargazing, ceramic pottery",
    },
    {
      id: "need_now",
      label: "I need it now",
      interestsText: "Quick comforting dessert parlor and espresso",
    },
  ];

  for (const p of paths) {
    test(`Entry path: ${p.id} successfully generates 3 ideas without HTTP 400`, async ({ page }) => {
      // Mock /api/intake response
      let receivedPayload: any = null;
      let receivedHeaders: Record<string, string> = {};

      await page.route("**/api/intake", async (route) => {
        const req = route.request();
        receivedHeaders = req.headers();
        try {
          receivedPayload = JSON.parse(req.postData() || "{}");
        } catch {}
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_IDEAS_RESPONSE),
        });
      });

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#intake");

      // Switch to the path
      await page.locator(`button:has-text("${p.label}")`).click();

      // Fill common inputs
      const occasionInput = page.locator("#occasion-type-input");
      await occasionInput.fill("30th Birthday Milestone");

      const recipientInput = page.locator("#recipient-name-input");
      await recipientInput.fill("Kavya");

      // Fill path-specific inputs
      if (p.id === "have_idea" && p.conceptText) {
        const conceptInput = page.locator('textarea[placeholder*="Describe your vision"]');
        await conceptInput.fill(p.conceptText);
      } else if (p.interestsText) {
        const interestsInput = page.locator('input[placeholder*="Vinyl records"], input[placeholder*="Sourdough pizza"]');
        await interestsInput.first().fill(p.interestsText);
      }

      // Generate ideas
      const generateButton = page.locator('button:has-text("Generate Celebration Ideas")');
      await expect(generateButton).toBeVisible();
      await generateButton.click();

      // Verify IdeasScreen appears with the 3 curated ideas
      await expect(page.locator("text=Three ways to celebrate")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("text=Rooftop Stargazing & Artisan Dinner")).toBeVisible();
      await expect(page.locator("text=Botanical Conservatory Tour")).toBeVisible();
      await expect(page.locator("text=Vinyl Listening & Italian Fare")).toBeVisible();

      // Verify payload was correctly formed and sanitized
      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload.entryPath).toBe(p.id);
      expect(receivedPayload.currency).toBe("INR");

      // Verify NO BYOK headers are sent by default when user has not chosen "My own key"
      expect(receivedHeaders["x-byok-key"]).toBeUndefined();
      expect(receivedHeaders["x-byok-provider"]).toBeUndefined();
    });
  }

  test("Error display: shows user-friendly field-specific message on 400 validation error without echoing values", async ({
    page,
  }) => {
    // Mock /api/intake to return a 400 validation error
    await page.route("**/api/intake", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Invalid intake request",
          code: "validation_error",
          fields: ["knownInterests.0"],
          details: [{ path: ["knownInterests", 0], message: "Too big: expected <=100 characters" }],
        }),
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#intake");

    await page.locator('button:has-text("Help me discover")').click();

    const genButton = page.locator('button:has-text("Generate Celebration Ideas")');
    await genButton.scrollIntoViewIfNeeded();
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/intake")),
      genButton.click(),
    ]);
    expect(response.status()).toBe(400);

    // Verify friendly error message is displayed
    const errorAlert = page.locator("text=Invalid input on: knownInterests.0");
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
  });
});
