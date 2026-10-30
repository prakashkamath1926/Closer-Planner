import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEST_PLAN_PAYLOAD = {
  idea: {
    id: "test-idea-1",
    title: "Acoustic Rooftop Stargazing Celebration",
    description: "An intimate evening under the stars with live acoustic guitar and personalized desserts.",
    whyItSuitsThem: "Loves music and intimate stargazing settings with close friends.",
    activities: ["Rooftop stargazing setup", "Acoustic guitarist set", "Artisan dessert tasting"],
    estimatedCostMin: 12000,
    estimatedCostMax: 18000,
    currency: "INR",
    requiredTime: "3-4 hours",
    urgencyMode: "weeks_away" as const,
    facts: [],
    items: [
      { title: "Reserve private rooftop venue", estimatedCost: 8000, costStatus: "estimate" as const, isNonNegotiable: true },
      { title: "Hire acoustic guitarist", estimatedCost: 4000, costStatus: "estimate" as const, isNonNegotiable: false },
      { title: "Order artisan desserts", estimatedCost: 3000, costStatus: "estimate" as const, isNonNegotiable: false },
    ],
  },
  entryPath: "have_idea" as const,
  occasionType: "birthday",
  recipientName: "Ananya",
  intentSummary: "Intimate acoustic stargazing celebration",
  eventAt: "2026-11-20T19:00:00.000Z",
  budgetTotal: 20000,
  currency: "INR",
  guestCount: 10,
  isSurprise: true,
};

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const response = await page.request.post("http://localhost:3000/api/plan", {
    data: TEST_PLAN_PAYLOAD,
  });
  if (!response.ok()) {
    throw new Error(`Failed to create setup occasion: ${response.status()} ${await response.text()}`);
  }
  const result = await response.json();
  const authDir = path.resolve("playwright");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  await page.context().storageState({ path: path.join(authDir, ".auth.json") });
  fs.writeFileSync(path.join(authDir, "test-occasion.json"), JSON.stringify({ occasionId: result.occasionId }));
  await browser.close();
}

export default globalSetup;

