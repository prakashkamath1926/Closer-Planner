import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Authentication Features & Route Protection", () => {
  // Use unauthenticated browser context for testing login, signup, and protected redirects
  test.use({ storageState: { cookies: [], origins: [] } });

  test("protected routes redirect unauthenticated users to /login with next param", async ({
    page,
  }) => {
    // Attempt to access a protected occasion page without a session
    await page.goto("/plan/00000000-0000-0000-0000-000000000001", {
      waitUntil: "domcontentloaded",
    });

    // Should redirect to /login?next=...
    await expect(page).toHaveURL(/\/login\?next=/);
    const loginHeading = page.locator("h1");
    await expect(loginHeading).toContainText(/Welcome to|Sign in/i);
  });

  test("public routes remain reachable signed out", async ({ page }) => {
    // 1. Landing page
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL("/");
    await expect(page.locator("body")).toBeVisible();

    // 2. Forgot password page
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL("/forgot-password");
    await expect(page.locator("h1")).toContainText(/password/i);

    // 3. Reset password page
    await page.goto("/reset-password", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL("/reset-password");
    await expect(page.locator("h1")).toContainText(/password/i);
  });

  test("/login form validation via keyboard navigation and generic error display", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Focus email and fill via keyboard
    const emailInput = page.locator("#email");
    await emailInput.focus();
    await page.keyboard.type("invalid-email");

    // Focus password directly and type short password
    const passwordInput = page.locator("#password");
    await passwordInput.focus();
    await page.keyboard.type("short");

    // Submit by pressing Enter on the password field
    await page.keyboard.press("Enter");

    // Should display validation error in an aria-live / role="alert" container
    const alertBox = page.locator("#auth-error-alert");
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(/valid email/i);
  });

  test("/signup form validates password minimum 10 characters via keyboard", async ({
    page,
  }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Fill form with valid email and name, but short password (< 10 chars)
    await page.locator("#fullName").fill("Jane Doe");
    await page.locator("#email").fill("jane@example.com");
    await page.locator("#password").fill("short123");

    await page.locator('button[type="submit"]').click();

    const alertBox = page.locator("#auth-error-alert");
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText(/at least 10 characters/i);
  });

  test("axe accessibility audit: 0 serious or critical violations on /login and /signup", async ({
    page,
  }) => {
    // Audit /login
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const loginAxe = await new AxeBuilder({ page }).analyze();
    const loginViolations = loginAxe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(loginViolations).toEqual([]);

    // Audit /signup
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    const signupAxe = await new AxeBuilder({ page }).analyze();
    const signupViolations = signupAxe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(signupViolations).toEqual([]);
  });
});
