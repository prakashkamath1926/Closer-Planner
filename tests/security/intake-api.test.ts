import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-uuid" } },
        error: null,
      }),
    },
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 10, windowSeconds: 60 }),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  proposeIdeas: vi.fn(),
}));

import { proposeIdeas } from "@/lib/ai/orchestrator";
import { POST as intakeRoute } from "@/app/api/intake/route";

describe("POST /api/intake Error Sanitization & Detail Disclosure Defense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns generic 500 without leaking raw error text or detail field on internal failure", async () => {
    const rawErrorMessage = "DATABASE_SECRET_LEAK: connection to postgresql://admin:super_secret_pw@db.internal:5432 failed";

    (proposeIdeas as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error(rawErrorMessage),
    );

    const validPayload = {
      entryPath: "have_idea",
      concept: "A surprise dinner party",
      occasionType: "birthday",
      recipientName: "Sam",
    };

    const req = new NextRequest("http://localhost:3000/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await intakeRoute(req);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Internal server error during celebration planning");
    expect(body.detail).toBeUndefined();

    // Verify raw error message is never disclosed in response body
    const bodyString = JSON.stringify(body);
    expect(bodyString).not.toContain("DATABASE_SECRET_LEAK");
    expect(bodyString).not.toContain("super_secret_pw");
    expect(bodyString).not.toContain(rawErrorMessage);
  });

  it("preserves plural details field on 400 validation error for UI error formatting", async () => {
    const invalidPayload = {
      entryPath: "invalid_path",
    };

    const req = new NextRequest("http://localhost:3000/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload),
    });

    const res = await intakeRoute(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe("validation_error");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });
});

